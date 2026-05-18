import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { adminListenHost, devPasswordHash, pathHealthcheck } from './constants.js'

/** Env keys that must not leak from shell / .env into spawned test servers */
const BIND_ENV_KEYS = [
	'ADMIN_IP',
	'ADMIN_PORT',
	'REDIRECTOR_IP',
	'REDIRECTOR_PORT',
	'ADMIN_PASSWORD_HASH',
	'ADMIN_PASSWORD_HASH_B64'
]

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
	const env = { ...process.env }
	for (const key of BIND_ENV_KEYS) {
		delete env[key]
	}
	return { ...env, ...overrides }
}

export function buildAdminTestEnv(port) {
	return buildTestEnv({
		ADMIN_IP: adminListenHost,
		ADMIN_PORT: String(port),
		ADMIN_PASSWORD_HASH: devPasswordHash
	})
}

export function buildRedirectorTestEnv(port) {
	return buildTestEnv({
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
