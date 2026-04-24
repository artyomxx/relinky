import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import {
	adminListenHost,
	adminPassword,
	adminServerEntry,
	baseHost,
	devPasswordHash,
	importFlagsNone,
	importFlagsReplace,
	linksListLimit,
	pathAuthLogin,
	pathDomains,
	pathDomainsDeleteWithLinks,
	pathHealthcheck,
	pathLinks,
	pathLinksExport,
	pathLinksExportCount,
	pathLinksImport,
	pathLinksImportPreview
} from './constants.js'

const sampleUrl = 'https://example.com/import-target'
const urlRoundTripBefore = 'https://example.com/before'
const urlRoundTripAfter = 'https://example.com/after'
const urlNoDupStatic = 'https://example.com/static'
const urlCountC1 = 'https://example.com/c1'
const urlCountC2 = 'https://example.com/c2'

const commentCanonical = 'canonical'
const commentBeforeExport = 'before-export'
const commentAfterReimport = 'after-reimport'

const createdDateStub = '2024-01-15'

const legacyKeyRedirectHttp = 'redirect HTTP response code'
const legacyKeyKeepReferrer = 'keep referrer'
const legacyKeyKeepQueryParams = 'keep query params'

const domainPrefixCanon = 'import-canon-'
const domainPrefixLower = 'import-lower-'
const domainPrefixLegacy = 'import-legacy-'
const domainPrefixRoundTrip = 'import-rt-'
const domainPrefixNoDup = 'import-nodup-'
const domainPrefixCount = 'import-count-'

let child = null
let baseUrl = ''

async function getFreePort() {
	return await new Promise((resolve, reject) => {
		const server = createServer()
		server.listen(0, adminListenHost, () => {
			const address = server.address()
			server.close(() => {
				if (!address || typeof address === 'string') {
					reject(new Error('Failed to allocate free port'))
					return
				}
				resolve(address.port)
			})
		})
		server.on('error', reject)
	})
}

async function waitForHealth(url, timeoutMs = 15000) {
	const started = Date.now()
	for (;;) {
		try {
			const res = await fetch(`${url}${pathHealthcheck}`)
			if (res.ok) return
		} catch {}
		if (Date.now() - started > timeoutMs) {
			throw new Error('Timed out waiting for admin server healthcheck')
		}
		await delay(200)
	}
}

function startAdminServer(port) {
	child = spawn('node', [adminServerEntry], {
		cwd: process.cwd(),
		env: {
			...process.env,
			ADMIN_IP: adminListenHost,
			ADMIN_PORT: String(port),
			ADMIN_PASSWORD_HASH: devPasswordHash
		},
		stdio: 'pipe'
	})
	child.stdout.on('data', () => {})
	child.stderr.on('data', () => {})
}

async function stopAdminServer() {
	if (!child) return
	const proc = child
	child = null
	proc.kill('SIGTERM')
	await new Promise(resolve => {
		proc.once('exit', () => resolve())
		setTimeout(() => resolve(), 5000)
	})
}

async function req(path, { method = 'GET', token, body } = {}) {
	const headers = {}
	if (token) headers.Authorization = `Bearer ${token}`
	if (body !== undefined) headers['Content-Type'] = 'application/json'
	const res = await fetch(`${baseUrl}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined
	})
	let data = null
	try {
		data = await res.json()
	} catch {}
	return { status: res.status, data }
}

async function adminLogin() {
	const login = await req(pathAuthLogin, {
		method: 'POST',
		body: { password: adminPassword }
	})
	assert.equal(login.status, 200)
	assert.ok(login.data?.token)
	return login.data.token
}

async function createDomain(adminToken, domain) {
	const response = await req(pathDomains, {
		method: 'POST',
		token: adminToken,
		body: { domain }
	})
	assert.equal(response.status, 201)
}

async function cleanupDomain(adminToken, domain) {
	await req(pathDomainsDeleteWithLinks, {
		method: 'POST',
		token: adminToken,
		body: { domain }
	})
}

async function createLink(adminToken, body) {
	const response = await req(pathLinks, {
		method: 'POST',
		token: adminToken,
		body
	})
	assert.equal(response.status, 201, response.data?.error || '')
	return response.data
}

before(async () => {
	const port = await getFreePort()
	baseUrl = `http://${adminListenHost}:${port}`
	startAdminServer(port)
	await waitForHealth(baseUrl)
})

after(async () => {
	await stopAdminServer()
})

test('import preview rejects non-array links', { concurrency: false }, async () => {
	const token = await adminLogin()
	const res = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links: { not: 'array' }, ...importFlagsNone }
	})
	assert.equal(res.status, 400)
	assert.match(res.data?.error || '', /array/i)
})

test('import preview accepts empty links array', { concurrency: false }, async () => {
	const token = await adminLogin()
	const res = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links: [], ...importFlagsNone }
	})
	assert.equal(res.status, 200)
	assert.equal(res.data.linksToImport, 0)
})

test('import preview supports raw rebrandly export shape', { concurrency: false }, async () => {
	const token = await adminLogin()
	const fixturePath = new URL('./import/rebrandly.json', import.meta.url)
	const rows = JSON.parse(await readFile(fixturePath, 'utf8'))
	const links = rows
	const uniqueDomains = [...new Set(links.map(row => row.domainName).filter(Boolean))]

	const res = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'rebrandly', ...importFlagsNone, createDomains: true }
	})
	assert.equal(res.status, 200, res.data?.error || '')
	assert.equal(res.data.totalLinks, links.length)
	assert.equal(res.data.totalDomains, uniqueDomains.length)
	assert.equal(res.data.linksToImport + res.data.linksToSkip, links.length)
	assert.equal(res.data.domainsToCreate, res.data.domainsToCreateList.length)
	assert.deepEqual(res.data.domainsToSkipList.length, 0)
	assert.ok(res.data.domainsToCreateList.every(domain => uniqueDomains.includes(domain)))
})

test('import preview skips missing-domain links when createDomains is off', { concurrency: false }, async () => {
	const token = await adminLogin()
	const fixturePath = new URL('./import/rebrandly.json', import.meta.url)
	const rows = JSON.parse(await readFile(fixturePath, 'utf8'))
	const links = rows
	const uniqueDomains = [...new Set(links.map(row => row.domainName).filter(Boolean))]
	const withCreate = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'rebrandly', ...importFlagsNone, createDomains: true }
	})
	assert.equal(withCreate.status, 200, withCreate.data?.error || '')

	const res = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'rebrandly', ...importFlagsNone, createDomains: false }
	})
	assert.equal(res.status, 200, res.data?.error || '')
	assert.equal(res.data.totalLinks, links.length)
	assert.equal(res.data.totalDomains, uniqueDomains.length)
	assert.equal(res.data.linksToImport + res.data.linksToSkip, links.length)
	assert.ok(res.data.linksToImport <= withCreate.data.linksToImport)
	assert.equal(res.data.domainsToCreate, 0)
	assert.deepEqual(res.data.domainsToCreateList.length, 0)
	assert.deepEqual(res.data.domainsToSkipList.length, withCreate.data.domainsToCreateList.length)
	assert.deepEqual(
		res.data.domainsToSkipList.slice().sort(),
		withCreate.data.domainsToCreateList.slice().sort()
	)
})

test('import preview supports raw kutt export shape', { concurrency: false }, async () => {
	const token = await adminLogin()
	const fixturePath = new URL('./import/kutt.json', import.meta.url)
	const rows = JSON.parse(await readFile(fixturePath, 'utf8'))
	const links = rows

	const uniqueDomains = [...new Set(links.map(row => row.domain))]
	const res = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'kutt', ...importFlagsNone, createDomains: true }
	})
	assert.equal(res.status, 200, res.data?.error || '')
	assert.equal(res.data.totalLinks, links.length)
	assert.equal(res.data.totalDomains, uniqueDomains.length)
	assert.equal(res.data.linksToImport + res.data.linksToSkip, links.length)
	assert.equal(res.data.domainsToCreate, res.data.domainsToCreateList.length)
	assert.ok(res.data.domainsToCreateList.every(domain => uniqueDomains.includes(domain)))
	assert.equal(res.data.domainsToCreateList.length, new Set(res.data.domainsToCreateList).size)
	assert.deepEqual(res.data.domainsToSkipList.length, 0)
})

test('import preview skips missing kutt domains when createDomains is off', { concurrency: false }, async () => {
	const token = await adminLogin()
	const fixturePath = new URL('./import/kutt.json', import.meta.url)
	const rows = JSON.parse(await readFile(fixturePath, 'utf8'))
	const links = rows

	const uniqueDomains = [...new Set(links.map(row => row.domain))]
	const withCreate = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'kutt', ...importFlagsNone, createDomains: true }
	})
	assert.equal(withCreate.status, 200, withCreate.data?.error || '')

	const res = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'kutt', ...importFlagsNone, createDomains: false }
	})
	assert.equal(res.status, 200, res.data?.error || '')
	assert.equal(res.data.totalLinks, links.length)
	assert.equal(res.data.totalDomains, uniqueDomains.length)
	assert.equal(res.data.linksToImport + res.data.linksToSkip, links.length)
	assert.ok(res.data.linksToImport <= withCreate.data.linksToImport)
	assert.equal(res.data.domainsToCreate, 0)
	assert.deepEqual(res.data.domainsToCreateList.length, 0)
	assert.equal(res.data.domainsToSkipList.length, withCreate.data.domainsToCreateList.length)
	assert.deepEqual(
		res.data.domainsToSkipList.slice().sort(),
		withCreate.data.domainsToCreateList.slice().sort()
	)
})

test('import preview supports raw relinky export shape', { concurrency: false }, async () => {
	const token = await adminLogin()
	const fixturePath = new URL('./import/relinky.json', import.meta.url)
	const links = JSON.parse(await readFile(fixturePath, 'utf8'))
	const uniqueDomains = [...new Set(links.map(row => row.domain).filter(Boolean))]

	const res = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'relinky', ...importFlagsNone, createDomains: true }
	})
	assert.equal(res.status, 200, res.data?.error || '')
	assert.equal(res.data.totalLinks, links.length)
	assert.equal(res.data.totalDomains, uniqueDomains.length)
	assert.equal(res.data.linksToImport + res.data.linksToSkip, links.length)
	assert.equal(res.data.domainsToCreate, res.data.domainsToCreateList.length)
	assert.deepEqual(res.data.domainsToSkipList.length, 0)
	assert.ok(res.data.domainsToCreateList.every(domain => uniqueDomains.includes(domain)))
})

test('import preview skips missing relinky domains when createDomains is off', { concurrency: false }, async () => {
	const token = await adminLogin()
	const fixturePath = new URL('./import/relinky.json', import.meta.url)
	const links = JSON.parse(await readFile(fixturePath, 'utf8'))
	const uniqueDomains = [...new Set(links.map(row => row.domain).filter(Boolean))]

	const withCreate = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'relinky', ...importFlagsNone, createDomains: true }
	})
	assert.equal(withCreate.status, 200, withCreate.data?.error || '')

	const res = await req(pathLinksImportPreview, {
		method: 'POST',
		token,
		body: { links, importType: 'relinky', ...importFlagsNone, createDomains: false }
	})
	assert.equal(res.status, 200, res.data?.error || '')
	assert.equal(res.data.totalLinks, links.length)
	assert.equal(res.data.totalDomains, uniqueDomains.length)
	assert.equal(res.data.linksToImport + res.data.linksToSkip, links.length)
	assert.ok(res.data.linksToImport <= withCreate.data.linksToImport)
	assert.equal(res.data.domainsToCreate, 0)
	assert.deepEqual(res.data.domainsToCreateList.length, 0)
	assert.equal(res.data.domainsToSkipList.length, withCreate.data.domainsToCreateList.length)
	assert.deepEqual(
		res.data.domainsToSkipList.slice().sort(),
		withCreate.data.domainsToCreateList.slice().sort()
	)
})

test('export requires auth', { concurrency: false }, async () => {
	const res = await req(pathLinksExport)
	assert.equal(res.status, 401)
})

test('import format: canonical export-style fields', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${domainPrefixCanon}${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	const slug = `slug-${Date.now()}`
	try {
		const row = {
			domain,
			slug,
			url: sampleUrl,
			expired_url: undefined,
			keep_referrer: true,
			keep_query_params: false,
			redirect_HTTP_response_code: 302,
			expire: undefined,
			comment: commentCanonical,
			created: createdDateStub
		}
		const imp = await req(pathLinksImport, {
			method: 'POST',
			token: adminToken,
			body: { links: [row], ...importFlagsNone }
		})
		assert.equal(imp.status, 200, imp.data?.error || '')
		assert.equal(imp.data.imported, 1)

		const list = await req(
			`${pathLinks}?search=${encodeURIComponent(slug)}&limit=${linksListLimit}`,
			{ token: adminToken }
		)
		assert.equal(list.status, 200)
		const hit = list.data.links.find(l => l.slug === slug)
		assert.ok(hit)
		assert.equal(hit.redirect_code, 302)
		assert.equal(hit.keep_referrer, true)
		assert.equal(hit.keep_query_params, false)
	} finally {
		await cleanupDomain(adminToken, domain)
	}
})

test('import format: redirect_http_response_code lowercase', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${domainPrefixLower}${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	const slug = `slug-${Date.now()}`
	try {
		const row = {
			domain,
			slug,
			url: sampleUrl,
			redirect_http_response_code: 307,
			keep_referrer: false,
			keep_query_params: true
		}
		const imp = await req(pathLinksImport, {
			method: 'POST',
			token: adminToken,
			body: { links: [row], ...importFlagsNone }
		})
		assert.equal(imp.status, 200)
		assert.equal(imp.data.imported, 1)

		const list = await req(
			`${pathLinks}?search=${encodeURIComponent(slug)}&limit=${linksListLimit}`,
			{ token: adminToken }
		)
		const hit = list.data.links.find(l => l.slug === slug)
		assert.equal(hit.redirect_code, 307)
		assert.equal(hit.keep_query_params, true)
	} finally {
		await cleanupDomain(adminToken, domain)
	}
})

test('import format: legacy spaced field names', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${domainPrefixLegacy}${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	const slug = `slug-${Date.now()}`
	try {
		const row = {
			domain,
			slug,
			url: sampleUrl,
			[legacyKeyRedirectHttp]: 301,
			[legacyKeyKeepReferrer]: true,
			[legacyKeyKeepQueryParams]: false
		}
		const imp = await req(pathLinksImport, {
			method: 'POST',
			token: adminToken,
			body: { links: [row], ...importFlagsNone }
		})
		assert.equal(imp.status, 200)
		assert.equal(imp.data.imported, 1)

		const list = await req(
			`${pathLinks}?search=${encodeURIComponent(slug)}&limit=${linksListLimit}`,
			{ token: adminToken }
		)
		const hit = list.data.links.find(l => l.slug === slug)
		assert.equal(hit.redirect_code, 301)
		assert.equal(hit.keep_referrer, true)
		assert.equal(hit.keep_query_params, false)
	} finally {
		await cleanupDomain(adminToken, domain)
	}
})

test('export then re-import with replace updates link', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${domainPrefixRoundTrip}${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	const slug = `rt-${Date.now()}`
	try {
		const created = await createLink(adminToken, {
			domain,
			slug,
			url: urlRoundTripBefore,
			redirect_code: 303,
			keep_referrer: false,
			keep_query_params: false,
			comment: commentBeforeExport
		})

		const exported = await req(
			`${pathLinksExport}?domain=${encodeURIComponent(domain)}`,
			{ token: adminToken }
		)
		assert.equal(exported.status, 200)
		assert.ok(Array.isArray(exported.data))

		const rows = structuredClone(exported.data)
		const row = rows.find(r => r.slug === slug)
		assert.ok(row, 'exported row should include created slug')
		row.comment = commentAfterReimport
		row.url = urlRoundTripAfter

		const imp = await req(pathLinksImport, {
			method: 'POST',
			token: adminToken,
			body: { links: rows, ...importFlagsReplace }
		})
		assert.equal(imp.status, 200, imp.data?.error || '')
		assert.equal(imp.data.updated, 1)
		assert.equal(imp.data.imported, 0)

		const one = await req(`${pathLinks}/${created.id}`, { token: adminToken })
		assert.equal(one.status, 200)
		assert.equal(one.data.comment, commentAfterReimport)
		assert.equal(one.data.url, urlRoundTripAfter)
	} finally {
		await cleanupDomain(adminToken, domain)
	}
})

test('re-import identical export without replace does nothing', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${domainPrefixNoDup}${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	const slug = `nd-${Date.now()}`
	try {
		await createLink(adminToken, {
			domain,
			slug,
			url: urlNoDupStatic,
			redirect_code: 303,
			keep_referrer: false,
			keep_query_params: false,
			comment: 'same'
		})

		const exported = await req(
			`${pathLinksExport}?domain=${encodeURIComponent(domain)}`,
			{ token: adminToken }
		)
		const rows = structuredClone(exported.data)

		const imp = await req(pathLinksImport, {
			method: 'POST',
			token: adminToken,
			body: { links: rows, ...importFlagsNone }
		})
		assert.equal(imp.status, 200)
		assert.equal(imp.data.imported, 0)
		assert.equal(imp.data.updated, 0)
	} finally {
		await cleanupDomain(adminToken, domain)
	}
})

test('export count matches export payload length for domain filter', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${domainPrefixCount}${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	try {
		await createLink(adminToken, {
			domain,
			slug: `c1-${Date.now()}`,
			url: urlCountC1,
			redirect_code: 303
		})
		await createLink(adminToken, {
			domain,
			slug: `c2-${Date.now()}`,
			url: urlCountC2,
			redirect_code: 303
		})

		const cnt = await req(
			`${pathLinksExportCount}?domain=${encodeURIComponent(domain)}`,
			{ token: adminToken }
		)
		assert.equal(cnt.status, 200)
		assert.equal(cnt.data.count, 2)

		const exported = await req(
			`${pathLinksExport}?domain=${encodeURIComponent(domain)}`,
			{ token: adminToken }
		)
		assert.equal(exported.data.length, 2)
	} finally {
		await cleanupDomain(adminToken, domain)
	}
})
