import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import Database from 'better-sqlite3'
import { adminListenHost, devPasswordHash, pathHealthcheck } from './constants.js'
import { ADMIN_PASSWORD_HASH_KEY } from '../app/shared/seed-admin-password.js'

/** Env keys that must not leak from shell / .env into spawned test servers */
const BIND_ENV_KEYS = [
	'ADMIN_IP',
	'ADMIN_PORT',
	'REDIRECTOR_IP',
	'REDIRECTOR_PORT',
	'ADMIN_PASSWORD_HASH',
	'ADMIN_PASSWORD_HASH_B64',
	'RELINKY_DB_DIR'
]

function scrubBindEnv(env) {
	const out = { ...env }
	for (const key of BIND_ENV_KEYS) {
		delete out[key]
	}
	return out
}

function runInitDb(dir, { passwordHash = devPasswordHash } = {}) {
	const env = scrubBindEnv(process.env)
	env.RELINKY_DB_DIR = dir
	if (passwordHash) {
		env.ADMIN_PASSWORD_HASH = passwordHash
	}
	const result = spawnSync('node', ['app/shared/init-db.js'], {
		cwd: process.cwd(),
		env,
		encoding: 'utf8'
	})
	if (result.status !== 0) {
		throw new Error(`test db init failed (exit ${result.status}):\n${result.stderr}`)
	}
}

/**
 * One isolated database directory per test-file process so the suite never touches the
 * repo's real db/. node --test runs each file in its own process, so admin and redirector
 * spawned within the same file share this dir, while different files stay isolated.
 */
const testDbDir = mkdtempSync(join(tmpdir(), 'relinky-test-db-'))
process.on('exit', () => {
	try {
		rmSync(testDbDir, { recursive: true, force: true })
	} catch {}
})

// Services verify the schema on boot but no longer migrate themselves. The migrator seeds
// the dev password hash into auth so login checks the DB.
runInitDb(testDbDir)

export { testDbDir }

/** Fresh dir with schema but no admin password (for onboarding tests). Caller must rmSync. */
export function createUninitializedTestDb() {
	const dir = mkdtempSync(join(tmpdir(), 'relinky-test-uninit-'))
	runInitDb(dir, { passwordHash: null })
	return dir
}

export function readAdminPasswordHash(dir) {
	const db = new Database(join(dir, 'main.db'))
	try {
		const row = db.prepare('SELECT value FROM auth WHERE key = ?').get(ADMIN_PASSWORD_HASH_KEY)
		return row?.value || null
	} finally {
		db.close()
	}
}

/**
 * Optional fixed ports for debugging (e.g. when random ports are blocked):
 *   TEST_ADMIN_PORT=39081 TEST_REDIRECTOR_PORT=39082 npm test
 * Otherwise each suite picks a free port on 127.0.0.1.
 */
function preferredPort(envName) {
	const raw = process.env[envName]?.trim()
	if (!raw) return null
	const port = parseInt(raw, 10)
	return Number.isNaN(port) ? null : port
}

export async function getFreePort(host = adminListenHost) {
	return await new Promise((resolve, reject) => {
		const server = createServer()
		server.listen(0, host, () => {
			const address = server.address()
			server.close(err => {
				if (err) {
					reject(err)
					return
				}
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

export async function allocAdminPort() {
	const preferred = preferredPort('TEST_ADMIN_PORT')
	if (preferred != null) return preferred
	return getFreePort()
}

export async function allocRedirectorPort() {
	const preferred = preferredPort('TEST_REDIRECTOR_PORT')
	if (preferred != null) return preferred
	return getFreePort()
}

/** Drop dev .env / shell bind vars so spawned servers only use test overrides. */
export function buildTestEnv(overrides = {}) {
	return { ...scrubBindEnv(process.env), RELINKY_DB_DIR: testDbDir, ...overrides }
}

/** Build env for a server using an alternate db directory (e.g. uninitialized onboarding dir). */
export function buildTestEnvForDb(dir, overrides = {}) {
	return { ...scrubBindEnv(process.env), RELINKY_DB_DIR: dir, ...overrides }
}

export function buildAdminTestEnv(port, dbDir = testDbDir) {
	return buildTestEnvForDb(dbDir, {
		ADMIN_IP: adminListenHost,
		ADMIN_PORT: String(port)
	})
}

export function buildRedirectorTestEnv(port, dbDir = testDbDir) {
	return buildTestEnvForDb(dbDir, {
		REDIRECTOR_IP: adminListenHost,
		REDIRECTOR_PORT: String(port)
	})
}

export function spawnTestServer(entry, env) {
	const stderrChunks = []
	const child = spawn('node', [entry], {
		cwd: process.cwd(),
		env,
		stdio: ['ignore', 'pipe', 'pipe']
	})
	child.stdout.on('data', () => {})
	child.stderr.on('data', chunk => stderrChunks.push(chunk))
	child.testStderr = () => Buffer.concat(stderrChunks).toString('utf8').trim()
	return child
}

export async function waitForHealth(
	baseUrl,
	{ label = 'server', timeoutMs = 20000, child = null } = {}
) {
	const started = Date.now()
	let lastErr = null
	for (;;) {
		try {
			const res = await fetch(`${baseUrl}${pathHealthcheck}`)
			if (res.ok) return
			lastErr = new Error(`healthcheck HTTP ${res.status}`)
		} catch (err) {
			lastErr = err
		}
		if (Date.now() - started > timeoutMs) {
			const detail = child?.testStderr?.()
			const suffix = detail ? `\n--- server stderr ---\n${detail}` : ''
			throw new Error(
				`Timed out waiting for ${label} at ${baseUrl}${pathHealthcheck}${suffix}`,
				{ cause: lastErr }
			)
		}
		await delay(200)
	}
}

export async function stopTestServer(proc) {
	if (!proc) return
	const p = proc
	p.kill('SIGTERM')
	await new Promise(resolve => {
		p.once('exit', () => resolve())
		setTimeout(() => resolve(), 5000)
	})
}
