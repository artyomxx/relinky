import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import {
	adminListenHost,
	adminPassword,
	adminServerEntry,
	baseHost,
	devPasswordHash,
	pathAuthCheck,
	pathAuthLogin,
	pathAuthLogout,
	pathDomains,
	pathDomainsDeleteWithLinks,
	pathHealthcheck,
	pathLinks,
	pathLinksCheckUrlBase,
	pathLogs,
	pathSettings,
	pathStats
} from './constants.js'

const wrongPassword = 'not-the-dev-password'
const urlValid = 'https://example.org/general-target'
const urlValidUpdated = 'https://example.org/general-updated'
const urlInvalidNoTld = 'https://no-tld-path'

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
	assert.equal(response.status, 201, response.data?.error || '')
}

async function cleanupDomain(adminToken, domain) {
	await req(pathDomainsDeleteWithLinks, {
		method: 'POST',
		token: adminToken,
		body: { domain }
	})
}

function uniqueGeneralDomain() {
	return `general-${randomUUID().slice(0, 14)}.${baseHost}`
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

test('healthcheck returns ok without auth', { concurrency: false }, async () => {
	const res = await fetch(`${baseUrl}${pathHealthcheck}`)
	assert.equal(res.status, 200)
	const text = await res.text()
	assert.equal(text.trim(), 'ok')
})

test('login rejects wrong password', { concurrency: false }, async () => {
	const res = await req(pathAuthLogin, {
		method: 'POST',
		body: { password: wrongPassword }
	})
	assert.equal(res.status, 401)
	assert.equal(res.data?.error, 'Invalid password')
})

test('domains list requires authentication', { concurrency: false }, async () => {
	const res = await req(pathDomains)
	assert.equal(res.status, 401)
	assert.equal(res.data?.error, 'Unauthorized')
})

test('auth check succeeds with valid session', { concurrency: false }, async () => {
	const token = await adminLogin()
	const res = await req(pathAuthCheck, { token })
	assert.equal(res.status, 200)
	assert.equal(res.data?.authenticated, true)
})

test('logout invalidates the session token', { concurrency: false }, async () => {
	const token = await adminLogin()
	const out = await req(pathAuthLogout, { method: 'POST', token })
	assert.equal(out.status, 200)
	const check = await req(pathAuthCheck, { token })
	assert.equal(check.status, 401)
})

test('GET settings returns settings and defaults objects', { concurrency: false }, async () => {
	const token = await adminLogin()
	const res = await req(pathSettings, { token })
	assert.equal(res.status, 200)
	assert.ok(res.data?.settings && typeof res.data.settings === 'object')
	assert.ok(res.data?.defaults && typeof res.data.defaults === 'object')
})

test('GET stats (day) returns aggregate fields', { concurrency: false }, async () => {
	const token = await adminLogin()
	const res = await req(`${pathStats}?period=day`, { token })
	assert.equal(res.status, 200)
	assert.equal(res.data?.period, 'day')
	for (const key of ['totalClicks', 'timeSeries', 'topLinks', 'topDevices']) {
		assert.ok(key in (res.data || {}), `expected stats payload to include ${key}`)
	}
})

test('GET logs returns logs array and pagination', { concurrency: false }, async () => {
	const token = await adminLogin()
	const res = await req(`${pathLogs}?limit=5`, { token })
	assert.equal(res.status, 200)
	assert.ok(Array.isArray(res.data?.logs))
	assert.ok(res.data?.pagination && typeof res.data.pagination.total === 'number')
})

test('POST domain rejects duplicate name', { concurrency: false }, async () => {
	const token = await adminLogin()
	const domain = uniqueGeneralDomain()
	await createDomain(token, domain)
	const dup = await req(pathDomains, {
		method: 'POST',
		token,
		body: { domain }
	})
	assert.equal(dup.status, 400)
	assert.equal(dup.data?.error, 'Domain already exists')
	await cleanupDomain(token, domain)
})

test('POST link rejects URL without a TLD', { concurrency: false }, async () => {
	const token = await adminLogin()
	const domain = uniqueGeneralDomain()
	await createDomain(token, domain)
	const res = await req(pathLinks, {
		method: 'POST',
		token,
		body: {
			domain,
			slug: 'x',
			url: urlInvalidNoTld
		}
	})
	assert.equal(res.status, 400)
	assert.ok(
		String(res.data?.error || '').includes('URL must contain at least one top-level domain')
	)
	await cleanupDomain(token, domain)
})

test('check-url requires url query parameter', { concurrency: false }, async () => {
	const token = await adminLogin()
	const res = await req(pathLinksCheckUrlBase, { token })
	assert.equal(res.status, 400)
	assert.equal(res.data?.error, 'URL parameter required')
})

test('admin link CRUD: create, read, list, check-url, update, duplicate slug, delete', { concurrency: false }, async () => {
	const token = await adminLogin()
	const domain = uniqueGeneralDomain()
	const slug = `slug-${randomUUID().slice(0, 8)}`
	await createDomain(token, domain)

	const created = await req(pathLinks, {
		method: 'POST',
		token,
		body: {
			domain,
			slug,
			url: urlValid,
			comment: 'general test'
		}
	})
	assert.equal(created.status, 201)
	const linkId = created.data?.id
	assert.ok(linkId)

	const dupSlug = await req(pathLinks, {
		method: 'POST',
		token,
		body: { domain, slug, url: urlValid }
	})
	assert.equal(dupSlug.status, 400)
	assert.equal(dupSlug.data?.error, 'Slug already exists for this domain')

	const one = await req(`${pathLinks}/${linkId}`, { token })
	assert.equal(one.status, 200)
	assert.equal(one.data?.slug, slug)
	assert.equal(one.data?.url, urlValid)

	const list = await req(`${pathLinks}?page=1&limit=50`, { token })
	assert.equal(list.status, 200)
	const row = list.data?.links?.find(l => l.id === linkId)
	assert.ok(row, 'created link should appear in list')
	assert.equal(row.url, urlValid)

	const check = await req(
		`${pathLinksCheckUrlBase}?url=${encodeURIComponent(urlValid)}`,
		{ token }
	)
	assert.equal(check.status, 200)
	assert.ok(check.data?.links?.some(l => l.id === linkId))

	const updated = await req(`${pathLinks}/${linkId}`, {
		method: 'PUT',
		token,
		body: { url: urlValidUpdated }
	})
	assert.equal(updated.status, 200)

	const afterPut = await req(`${pathLinks}/${linkId}`, { token })
	assert.equal(afterPut.data?.url, urlValidUpdated)

	const del = await req(`${pathLinks}/${linkId}`, { method: 'DELETE', token })
	assert.equal(del.status, 200)

	const gone = await req(`${pathLinks}/${linkId}`, { token })
	assert.equal(gone.status, 404)
	assert.equal(gone.data?.error, 'Link not found')

	await cleanupDomain(token, domain)
})

test('GET single link returns 404 for unknown id', { concurrency: false }, async () => {
	const token = await adminLogin()
	const res = await req(`${pathLinks}/999999999`, { token })
	assert.equal(res.status, 404)
	assert.equal(res.data?.error, 'Link not found')
})
