import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import {
	adminListenHost,
	adminPassword,
	adminServerEntry,
	baseHost,
	devPasswordHash,
	pathAuthLogin,
	pathDomains,
	pathDomainsDeleteWithLinks,
	pathHealthcheck,
	pathLinks,
	redirectorServerEntry
} from './constants.js'

let adminChild = null
let redirectorChild = null
let adminBaseUrl = ''
let redirectorPort = 0

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

async function waitForHttpOk(url, label, timeoutMs = 20000) {
	const started = Date.now()
	for (;;) {
		try {
			const res = await fetch(`${url}${pathHealthcheck}`)
			if (res.ok) return
		} catch {}
		if (Date.now() - started > timeoutMs) {
			throw new Error(`Timed out waiting for ${label}`)
		}
		await delay(200)
	}
}

function startAdminServer(port) {
	adminChild = spawn('node', [adminServerEntry], {
		cwd: process.cwd(),
		env: {
			...process.env,
			ADMIN_IP: adminListenHost,
			ADMIN_PORT: String(port),
			ADMIN_PASSWORD_HASH: devPasswordHash
		},
		stdio: 'pipe'
	})
	adminChild.stdout.on('data', () => {})
	adminChild.stderr.on('data', () => {})
}

function startRedirectorServer(port) {
	redirectorChild = spawn('node', [redirectorServerEntry], {
		cwd: process.cwd(),
		env: {
			...process.env,
			REDIRECTOR_IP: adminListenHost,
			REDIRECTOR_PORT: String(port)
		},
		stdio: 'pipe'
	})
	redirectorChild.stdout.on('data', () => {})
	redirectorChild.stderr.on('data', () => {})
}

async function stopChild(proc) {
	if (!proc) return
	const p = proc
	p.kill('SIGTERM')
	await new Promise(resolve => {
		p.once('exit', () => resolve())
		setTimeout(() => resolve(), 5000)
	})
}

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

async function createLink(adminToken, body) {
	const response = await req(pathLinks, {
		method: 'POST',
		token: adminToken,
		body
	})
	assert.equal(response.status, 201, response.data?.error || '')
	return response.data
}

function redirectorRawGet({ host, path: reqPath }) {
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
						location: res.headers.location,
						body: Buffer.concat(chunks).toString()
					})
				})
			}
		)
		r.on('error', reject)
		r.end()
	})
}

/**
 * Watcher reloads redirectables.db on mtime (2s interval); poll until we see the redirect.
 */
async function waitForRedirectResponse(
	host,
	reqPath,
	predicate,
	{ timeoutMs = 15000, stepMs = 250 } = {}
) {
	const deadline = Date.now() + timeoutMs
	let last = null
	while (Date.now() < deadline) {
		last = await redirectorRawGet({ host, path: reqPath })
		if (predicate(last)) return last
		await delay(stepMs)
	}
	const loc = last?.location ?? '(none)'
	const sc = last?.statusCode ?? '(none)'
	throw new Error(`redirect wait timed out: last status=${sc} location=${loc}`)
}

function uniqueRedirectDomain() {
	return `rd-${randomUUID().slice(0, 14)}.${baseHost}`
}

before(async () => {
	const adminPort = await getFreePort()
	redirectorPort = await getFreePort()
	adminBaseUrl = `http://${adminListenHost}:${adminPort}`
	startAdminServer(adminPort)
	await waitForHttpOk(adminBaseUrl, 'admin server')
	startRedirectorServer(redirectorPort)
	await waitForHttpOk(`http://${adminListenHost}:${redirectorPort}`, 'redirector')
})

after(async () => {
	await stopChild(redirectorChild)
	redirectorChild = null
	await stopChild(adminChild)
	adminChild = null
})

test('redirector issues 3xx with Location for admin-created link', { concurrency: false }, async () => {
	const token = await adminLogin()
	const domain = uniqueRedirectDomain()
	const target = 'https://example.org/redirector-hit'
	await createDomain(token, domain)
	try {
		await createLink(token, {
			domain,
			slug: 'go',
			url: target,
			redirect_code: 302,
			keep_query_params: false
		})
		const res = await waitForRedirectResponse(
			domain,
			'/go',
			r => r.statusCode === 302 && r.location === target
		)
		assert.equal(res.statusCode, 302)
		assert.equal(res.location, target)
	} finally {
		await cleanupDomain(token, domain)
	}
})

test('redirector rejects unknown slug (plain 404 or error-URL redirect)', { concurrency: false }, async () => {
	const token = await adminLogin()
	const domain = uniqueRedirectDomain()
	await createDomain(token, domain)
	try {
		const res = await waitForRedirectResponse(
			domain,
			`/missing-${randomUUID()}`,
			r =>
				r.statusCode === 404 ||
				(r.statusCode >= 300 && r.statusCode < 400 && Boolean(r.location))
		)
		const ok =
			res.statusCode === 404 ||
			(res.statusCode >= 300 && res.statusCode < 400 && typeof res.location === 'string')
		assert.ok(ok, `unexpected ${res.statusCode} location=${res.location ?? ''}`)
	} finally {
		await cleanupDomain(token, domain)
	}
})

test('redirector merges query string when keep_query_params is true', { concurrency: false }, async () => {
	const token = await adminLogin()
	const domain = uniqueRedirectDomain()
	const baseTarget = 'https://example.org/merge-base'
	await createDomain(token, domain)
	try {
		await createLink(token, {
			domain,
			slug: 'q',
			url: baseTarget,
			redirect_code: 303,
			keep_query_params: true
		})
		const res = await waitForRedirectResponse(
			domain,
			'/q?src=test',
			r => {
				if (r.statusCode !== 303 || !r.location) return false
				const u = new URL(r.location)
				return u.origin === 'https://example.org' && u.pathname === '/merge-base' && u.searchParams.get('src') === 'test'
			}
		)
		assert.equal(res.statusCode, 303)
		const u = new URL(res.location)
		assert.equal(u.searchParams.get('src'), 'test')
	} finally {
		await cleanupDomain(token, domain)
	}
})
