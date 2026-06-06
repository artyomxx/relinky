import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import {
	adminListenHost,
	adminPassword,
	adminServerEntry,
	pathAuthLogin,
	pathDefaults,
	pathDomains,
	pathLinks,
	redirectorServerEntry
} from './constants.js'
import {
	allocAdminPort,
	allocRedirectorPort,
	buildAdminTestEnv,
	buildRedirectorTestEnv,
	spawnTestServer,
	stopTestServer,
	waitForHealth
} from './helpers.js'

function pathDomain(id) {
	return `/api/domains/${id}`
}

let adminChild = null
let redirectorChild = null
let adminBaseUrl = ''
let redirectorPort = 0

async function req(path, { method = 'GET', token, body } = {}) {
	const headers = {}
	if (token) headers.Authorization = `Bearer ${token}`
	if (body !== undefined) headers['Content-Type'] = 'application/json'
	const res = await fetch(`${adminBaseUrl}${path}`, {
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
	return login.data.token
}

function redirectorGet({ host, path: reqPath }) {
	return new Promise((resolve, reject) => {
		const r = http.request(
			{
				hostname: adminListenHost,
				port: redirectorPort,
				path: reqPath,
				method: 'GET',
				headers: { Host: host }
			},
			res => {
				const chunks = []
				res.on('data', c => chunks.push(c))
				res.on('end', () => {
					resolve({
						statusCode: res.statusCode,
						headers: res.headers,
						body: Buffer.concat(chunks).toString('utf8')
					})
				})
			}
		)
		r.on('error', reject)
		r.end()
	})
}

async function waitForRedirect(host, path, expectStatus, { timeoutMs = 12000 } = {}) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const res = await redirectorGet({ host, path })
		if (res.statusCode === expectStatus) {
			return res
		}
		await delay(500)
	}
	const last = await redirectorGet({ host, path })
	assert.equal(last.statusCode, expectStatus, `redirector ${host}${path}`)
	return last
}

before(async () => {
	const adminPort = await allocAdminPort()
	redirectorPort = await allocRedirectorPort()
	adminBaseUrl = `http://${adminListenHost}:${adminPort}`
	adminChild = spawnTestServer(adminServerEntry, buildAdminTestEnv(adminPort))
	redirectorChild = spawnTestServer(
		redirectorServerEntry,
		buildRedirectorTestEnv(redirectorPort)
	)
	await waitForHealth(adminBaseUrl, { label: 'admin', child: adminChild })
	await waitForHealth(`http://${adminListenHost}:${redirectorPort}`, {
		label: 'redirector',
		child: redirectorChild
	})
})

after(async () => {
	await stopTestServer(redirectorChild)
	await stopTestServer(adminChild)
})

test('GET /api/domains/:id returns raw overrides', { concurrency: false }, async () => {
	const token = await adminLogin()
	const host = `ds-${randomUUID().slice(0, 8)}.example.com`
	const created = await req(pathDomains, {
		method: 'POST',
		token,
		body: { domain: host }
	})
	assert.equal(created.status, 201)
	const id = created.data.id

	const got = await req(pathDomain(id), { token })
	assert.equal(got.status, 200)
	assert.equal(got.data.domain, host)
	assert.equal(got.data.overrides.expired_url, null)
	assert.equal(got.data.overrides.error_404_url, null)
})

test('PUT /api/domains/:id partial override used on 404', { concurrency: false }, async () => {
	const token = await adminLogin()
	const host = `ds404-${randomUUID().slice(0, 8)}.example.com`
	const created = await req(pathDomains, {
		method: 'POST',
		token,
		body: { domain: host }
	})
	const id = created.data.id
	const custom404 = `https://${host}/custom-404`

	const put = await req(pathDomain(id), {
		method: 'PUT',
		token,
		body: { error_404_url: custom404 }
	})
	assert.equal(put.status, 200)
	assert.equal(put.data.overrides.error_404_url, custom404)

	const res = await waitForRedirect(host, '/no-such-slug', 303)
	assert.ok(res.headers.location === custom404 || res.body.includes(custom404))
})

test('PUT null clears domain override', { concurrency: false }, async () => {
	const token = await adminLogin()
	const host = `dsclr-${randomUUID().slice(0, 8)}.example.com`
	const created = await req(pathDomains, { method: 'POST', token, body: { domain: host } })
	const id = created.data.id

	await req(pathDomain(id), {
		method: 'PUT',
		token,
		body: { error_404_url: `https://${host}/tmp` }
	})
	const cleared = await req(pathDomain(id), {
		method: 'PUT',
		token,
		body: { error_404_url: null }
	})
	assert.equal(cleared.status, 200)
	assert.equal(cleared.data.overrides.error_404_url, null)
})

test('link with null redirect_code uses domain override', { concurrency: false }, async () => {
	const token = await adminLogin()
	const host = `ds302-${randomUUID().slice(0, 8)}.example.com`
	const slug = 'inherit-code'
	const target = `https://${host}/dest`

	const domainRes = await req(pathDomains, { method: 'POST', token, body: { domain: host } })
	const domainId = domainRes.data.id

	await req(pathDomain(domainId), {
		method: 'PUT',
		token,
		body: { redirect_code: 302 }
	})

	await req(pathLinks, {
		method: 'POST',
		token,
		body: {
			domain: host,
			slug,
			url: target,
			redirect_code: null,
			keep_referrer: null,
			keep_query_params: null
		}
	})

	const res = await waitForRedirect(host, `/${slug}`, 302)
	assert.equal(res.headers.location, target)
})

test('PUT /api/domains/defaults round-trips settings and defaults', { concurrency: false }, async () => {
	const token = await adminLogin()
	const tag = randomUUID().slice(0, 8)
	const payload = {
		settings: {
			error_404_url: `https://defaults-${tag}.example.com/404`,
			error_500_url: `https://defaults-${tag}.example.com/500`
		},
		defaults: {
			expired_url: `https://defaults-${tag}.example.com/expired`,
			redirect_code: '302',
			keep_referrer: 'true',
			keep_query_params: 'false'
		}
	}

	const put = await req(pathDefaults, { method: 'PUT', token, body: payload })
	assert.equal(put.status, 200)
	assert.equal(put.data?.success, true)

	const got = await req(pathDefaults, { token })
	assert.equal(got.status, 200)
	assert.equal(got.data.settings.error_404_url, payload.settings.error_404_url)
	assert.equal(got.data.settings.error_500_url, payload.settings.error_500_url)
	assert.equal(got.data.defaults.expired_url, payload.defaults.expired_url)
	assert.equal(got.data.defaults.redirect_code, '302')
	assert.equal(got.data.defaults.keep_referrer, 'true')
	assert.equal(got.data.defaults.keep_query_params, 'false')
})

test('link with null redirect_code uses global default when domain override is null', { concurrency: false }, async () => {
	const token = await adminLogin()
	const host = `dsg307-${randomUUID().slice(0, 8)}.example.com`
	const slug = 'global-code'
	const target = `https://${host}/dest`

	const putDefaults = await req(pathDefaults, {
		method: 'PUT',
		token,
		body: { defaults: { redirect_code: '307' } }
	})
	assert.equal(putDefaults.status, 200)

	await req(pathDomains, { method: 'POST', token, body: { domain: host } })

	await req(pathLinks, {
		method: 'POST',
		token,
		body: {
			domain: host,
			slug,
			url: target,
			redirect_code: null,
			keep_referrer: null,
			keep_query_params: null
		}
	})

	const res = await waitForRedirect(host, `/${slug}`, 307)
	assert.equal(res.headers.location, target)
})
