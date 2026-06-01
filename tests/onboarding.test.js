import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from '../app/admin/backend/auth.js'
import {
	adminListenHost,
	adminPassword,
	adminServerEntry,
	devPasswordHash,
	pathAuthLogin,
	pathAuthPassword,
	pathSetup,
	pathSetupStatus,
	pathDefaults,
	pathDomains
} from './constants.js'
import {
	allocAdminPort,
	buildAdminTestEnv,
	createUninitializedTestDb,
	readAdminPasswordHash,
	spawnTestServer,
	stopTestServer,
	waitForHealth
} from './helpers.js'

function initDbInDir(dir, { passwordHash = null } = {}) {
	const env = { ...process.env, RELINKY_DB_DIR: dir }
	delete env.ADMIN_PASSWORD_HASH
	delete env.ADMIN_PASSWORD_HASH_B64
	if (passwordHash) env.ADMIN_PASSWORD_HASH = passwordHash
	const result = spawnSync('node', ['app/shared/init-db.js'], { cwd: process.cwd(), env, encoding: 'utf8' })
	assert.equal(result.status, 0, result.stderr)
}

let uninitDir = null
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

before(async () => {
	uninitDir = createUninitializedTestDb()
	const port = await allocAdminPort()
	baseUrl = `http://${adminListenHost}:${port}`
	child = spawnTestServer(adminServerEntry, buildAdminTestEnv(port, uninitDir))
	await waitForHealth(baseUrl, { label: 'admin (uninitialized)', child })
})

after(async () => {
	await stopTestServer(child)
	child = null
	if (uninitDir) {
		rmSync(uninitDir, { recursive: true, force: true })
		uninitDir = null
	}
})

test('init-db seeds env hash into auth table', () => {
	const dir = mkdtempSync(join(tmpdir(), 'relinky-seed-'))
	try {
		initDbInDir(dir, { passwordHash: devPasswordHash })
		assert.equal(readAdminPasswordHash(dir), devPasswordHash)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test('init-db overwrites auth hash when env hash changes', () => {
	const dir = mkdtempSync(join(tmpdir(), 'relinky-seed-'))
	try {
		initDbInDir(dir, { passwordHash: devPasswordHash })
		const altHash = hashPassword('other-password')
		initDbInDir(dir, { passwordHash: altHash })
		assert.equal(readAdminPasswordHash(dir), altHash)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

test('setup status reports uninitialized', async () => {
	const res = await req(pathSetupStatus)
	assert.equal(res.status, 200)
	assert.equal(res.data?.initialized, false)
})

test('POST /api/setup creates password and returns token', async () => {
	const setupPassword = 'setup-pass-123'
	const setupDomain = 'onboard.example.com'
	const res = await req(pathSetup, {
		method: 'POST',
		body: { password: setupPassword, domain: setupDomain }
	})
	assert.equal(res.status, 200, res.data?.error || '')
	assert.ok(res.data?.token)
	assert.ok(readAdminPasswordHash(uninitDir))

	const login = await req(pathAuthLogin, {
		method: 'POST',
		body: { password: setupPassword }
	})
	assert.equal(login.status, 200)

	const token = res.data.token
	const domainsRes = await req(pathDomains, { token })
	assert.equal(domainsRes.status, 200)
	const created = domainsRes.data?.domains?.find(d => d.domain === setupDomain)
	assert.ok(created, 'onboarding domain should exist')

	const defaultsRes = await req(pathDefaults, { token })
	assert.equal(defaultsRes.status, 200)
	assert.equal(
		defaultsRes.data?.defaults?.default_domain_id,
		String(created.id),
		'onboarding domain should be default'
	)
})

test('second POST /api/setup returns 409 (first visitor wins)', async () => {
	const res = await req(pathSetup, {
		method: 'POST',
		body: { password: 'another-pass-123' }
	})
	assert.equal(res.status, 409)
})

test('PUT /api/auth/password changes password in DB', async () => {
	const tokenRes = await req(pathAuthLogin, {
		method: 'POST',
		body: { password: 'setup-pass-123' }
	})
	const token = tokenRes.data.token
	const newPassword = 'new-pass-456'
	const change = await req(pathAuthPassword, {
		method: 'PUT',
		token,
		body: { currentPassword: 'setup-pass-123', newPassword }
	})
	assert.equal(change.status, 200, change.data?.error || '')

	const oldLogin = await req(pathAuthLogin, {
		method: 'POST',
		body: { password: 'setup-pass-123' }
	})
	assert.equal(oldLogin.status, 401)

	const newLogin = await req(pathAuthLogin, {
		method: 'POST',
		body: { password: newPassword }
	})
	assert.equal(newLogin.status, 200)
})

test('PUT /api/auth/password rejects wrong current password', async () => {
	const login = await req(pathAuthLogin, {
		method: 'POST',
		body: { password: 'new-pass-456' }
	})
	const res = await req(pathAuthPassword, {
		method: 'PUT',
		token: login.data.token,
		body: { currentPassword: 'wrong-current', newPassword: 'yet-another1' }
	})
	assert.equal(res.status, 403)
})

test('login with seeded dev password works against DB hash', async () => {
	// Uses the default helpers testDbDir via a separate short-lived server is covered by
	// general.test.js; here we only assert the hash landed in auth after migrate.
	const dir = mkdtempSync(join(tmpdir(), 'relinky-seed-login-'))
	try {
		initDbInDir(dir, { passwordHash: devPasswordHash })
		const port = await allocAdminPort()
		const url = `http://${adminListenHost}:${port}`
		const server = spawnTestServer(adminServerEntry, buildAdminTestEnv(port, dir))
		try {
			await waitForHealth(url, { label: 'admin (seeded)', child: server })
			const res = await fetch(`${url}${pathAuthLogin}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: adminPassword })
			})
			assert.equal(res.status, 200)
		} finally {
			await stopTestServer(server)
		}
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})
