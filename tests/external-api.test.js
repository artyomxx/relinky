import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
	adminListenHost,
	adminPassword,
	adminServerEntry,
	baseHost,
	pathAuthCheck,
	pathAuthLogin,
	pathDomains,
	pathDomainsDeleteWithLinks,
	pathExternalLinks,
	pathExternalStats,
	pathHealthcheck,
	pathLinks,
	pathDefaults,
	pathApiKeys,
	pathStats
} from './constants.js'
import {
	allocAdminPort,
	buildAdminTestEnv,
	spawnTestServer,
	stopTestServer,
	waitForHealth
} from './helpers.js'
const missingDomainPrefix = 'missing'
const testDomainPrefix = {
	nonExternal: 'test-non-external',
	create: 'test-create',
	updateDelete: 'test-update-delete'
}
const forbiddenDomainPrefix = 'forbidden'
const pathWithQueryUrl = 'https://example.com/path?src=test'
const pathUrl = 'https://example.com/path'
const simpleHttpsUrl = 'https://example.com'
const updatedComment = 'updated by dedicated test'
const wrongSecretSuffix = 'wrong-secret'
const invalidToken = 'rk_invalid-format-without-dot'
const blockedAllowlistIp = '203.0.113.99'

let child = null
let baseUrl = ''

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

async function createApiKey(adminToken, payload = {}) {
	const response = await req(pathApiKeys, {
		method: 'POST',
		token: adminToken,
		body: {
			name: payload.name || `test-key-${Date.now()}`,
			...(payload.allowed_ips !== undefined ? { allowed_ips: payload.allowed_ips } : {})
		}
	})
	assert.equal(response.status, 201)
	assert.ok(response.data?.key?.id)
	assert.ok(response.data?.token)
	return response.data
}

async function deleteApiKey(adminToken, keyId) {
	if (!keyId) return
	await req(`${pathApiKeys}/${keyId}`, {
		method: 'DELETE',
		token: adminToken
	})
}

before(async () => {
	const port = await allocAdminPort()
	baseUrl = `http://${adminListenHost}:${port}`
	child = spawnTestServer(adminServerEntry, buildAdminTestEnv(port))
	await waitForHealth(baseUrl, { label: 'admin server', child })
})

after(async () => {
	await stopTestServer(child)
	child = null
})

test('external api key can read links and stats', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const { key, token } = await createApiKey(adminToken, { name: 'read-links-stats' })
	try {
		assert.equal((await req(pathExternalLinks, { token })).status, 200)
		assert.equal((await req(`${pathExternalStats}?period=day`, { token })).status, 200)
	} finally {
		await deleteApiKey(adminToken, key.id)
	}
})

test('external links endpoint rejects missing api key', { concurrency: false }, async () => {
	const response = await req(pathExternalLinks)
	assert.equal(response.status, 401)
	assert.equal(response.data?.error, 'Missing or invalid API key')
})

test('external links endpoint rejects malformed api key', { concurrency: false }, async () => {
	const response = await req(pathExternalLinks, {
		token: invalidToken
	})
	assert.equal(response.status, 401)
	assert.equal(response.data?.error, 'Missing or invalid API key')
})

test('external links endpoint rejects wrong api key secret', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const { key, token } = await createApiKey(adminToken, { name: 'wrong-secret-check' })
	try {
		const dot = token.indexOf('.')
		assert.ok(dot > 0)
		const wrongSecretToken = `${token.slice(0, dot + 1)}${wrongSecretSuffix}`
		const response = await req(pathExternalLinks, {
			token: wrongSecretToken
		})
		assert.equal(response.status, 401)
		assert.equal(response.data?.error, 'Invalid API key')
	} finally {
		await deleteApiKey(adminToken, key.id)
	}
})

test('external api key cannot access admin settings route', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const { key, token } = await createApiKey(adminToken, { name: 'settings-deny-check' })
	try {
		assert.equal((await req(pathDefaults, { token })).status, 401)
	} finally {
		await deleteApiKey(adminToken, key.id)
	}
})

test('api key is rejected on non-external api routes', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${testDomainPrefix.nonExternal}-${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	const { key, token } = await createApiKey(adminToken, { name: 'non-external-deny-check' })
	try {
		const checks = [
			{ path: pathDefaults, method: 'GET' },
			{ path: pathDomains, method: 'GET' },
			{ path: `${pathLinks}?page=1&limit=5`, method: 'GET' },
			{ path: `${pathStats}?period=day`, method: 'GET' },
			{ path: pathAuthCheck, method: 'GET' },
			{ path: pathApiKeys, method: 'GET' },
			{
				path: pathDomains,
				method: 'POST',
				body: { domain: `${forbiddenDomainPrefix}-${Date.now()}.${baseHost}` }
			}
		]

		for (const check of checks) {
			const response = await req(check.path, {
				method: check.method,
				token,
				body: check.body
			})
			assert.equal(response.status, 401, `${check.method} ${check.path} should reject API key`)
		}
	} finally {
		await deleteApiKey(adminToken, key.id)
		await cleanupDomain(adminToken, domain)
	}
})

test('disabled external api key is rejected', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const { key, token } = await createApiKey(adminToken, { name: 'disable-check' })
	try {
		assert.equal((await req(`${pathApiKeys}/${key.id}`, {
			method: 'PUT',
			token: adminToken,
			body: { enabled: false }
		})).status, 200)
		assert.equal((await req(pathExternalLinks, { token })).status, 401)
	} finally {
		await deleteApiKey(adminToken, key.id)
	}
})

test('external api key respects IP allowlist', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const { key, token } = await createApiKey(adminToken, { name: 'allowlist-check' })
	try {
		assert.equal((await req(`${pathApiKeys}/${key.id}`, {
			method: 'PUT',
			token: adminToken,
			body: { allowed_ips: [blockedAllowlistIp] }
		})).status, 200)
		assert.equal((await req(pathExternalLinks, { token })).status, 403)

		assert.equal((await req(`${pathApiKeys}/${key.id}`, {
			method: 'PUT',
			token: adminToken,
			body: { allowed_ips: [] }
		})).status, 200)
		assert.equal((await req(pathExternalLinks, { token })).status, 200)
	} finally {
		await deleteApiKey(adminToken, key.id)
	}
})

test('external api key creates link for existing domain', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${testDomainPrefix.create}-${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	const { key, token } = await createApiKey(adminToken, { name: 'create-link-check' })
	try {
		const created = await req(pathExternalLinks, {
			method: 'POST',
			token,
			body: {
				domain,
				slug: `slug-${Date.now()}`,
				url: pathWithQueryUrl,
				redirect_code: 303
			}
		})
		assert.equal(created.status, 201)
		assert.ok(created.data?.id)
	} finally {
		await deleteApiKey(adminToken, key.id)
		await cleanupDomain(adminToken, domain)
	}
})

test('external api key updates and deletes link', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${testDomainPrefix.updateDelete}-${Date.now()}.${baseHost}`
	await createDomain(adminToken, domain)
	const { key, token } = await createApiKey(adminToken, { name: 'update-delete-check' })
	try {
		const created = await req(pathExternalLinks, {
			method: 'POST',
			token,
			body: {
				domain,
				slug: `slug-${Date.now()}`,
				url: pathUrl,
				redirect_code: 303
			}
		})
		assert.equal(created.status, 201)
		const linkId = created.data?.id
		assert.ok(linkId)

		assert.equal((await req(`${pathExternalLinks}/${linkId}`, {
			method: 'PUT',
			token,
			body: { comment: updatedComment }
		})).status, 200)

		assert.equal((await req(`${pathExternalLinks}/${linkId}`, {
			method: 'DELETE',
			token
		})).status, 200)
	} finally {
		await deleteApiKey(adminToken, key.id)
		await cleanupDomain(adminToken, domain)
	}
})

test('external create link rejects unknown domain', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const { key, token } = await createApiKey(adminToken, { name: 'unknown-domain-check' })
	try {
		const response = await req(pathExternalLinks, {
			method: 'POST',
			token,
			body: {
				domain: `${missingDomainPrefix}-${Date.now()}.${baseHost}`,
				slug: 'x',
				url: simpleHttpsUrl
			}
		})
		assert.equal(response.status, 400)
		assert.equal(response.data?.error, 'Domain does not exist')
	} finally {
		await deleteApiKey(adminToken, key.id)
	}
})

test('external link inherit fields round-trip as null on GET', { concurrency: false }, async () => {
	const adminToken = await adminLogin()
	const domain = `${testDomainPrefix.create}-inherit-${Date.now()}.${baseHost}`
	const slug = `inherit-${Date.now()}`
	await createDomain(adminToken, domain)
	const { key, token } = await createApiKey(adminToken, { name: 'inherit-null-check' })
	try {
		const created = await req(pathExternalLinks, {
			method: 'POST',
			token,
			body: {
				domain,
				slug,
				url: pathUrl,
				redirect_code: null,
				keep_referrer: null,
				keep_query_params: null
			}
		})
		assert.equal(created.status, 201)
		const linkId = created.data?.id
		assert.ok(linkId)

		const list = await req(`${pathExternalLinks}?search=${encodeURIComponent(slug)}`, { token })
		assert.equal(list.status, 200)
		const row = list.data?.links?.find(l => l.id === linkId)
		assert.ok(row, 'created link should appear in external list')
		assert.equal(row.redirect_code, null)
		assert.equal(row.keep_referrer, null)
		assert.equal(row.keep_query_params, null)

		assert.equal((await req(`${pathExternalLinks}/${linkId}`, {
			method: 'PUT',
			token,
			body: { keep_referrer: false, redirect_code: 301 }
		})).status, 200)

		const listAfter = await req(`${pathExternalLinks}?search=${encodeURIComponent(slug)}`, { token })
		const updated = listAfter.data?.links?.find(l => l.id === linkId)
		assert.equal(updated.keep_referrer, false)
		assert.equal(updated.redirect_code, 301)
		assert.equal(updated.keep_query_params, null)
	} finally {
		await deleteApiKey(adminToken, key.id)
		await cleanupDomain(adminToken, domain)
	}
})
