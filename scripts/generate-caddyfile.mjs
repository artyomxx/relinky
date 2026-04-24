#!/usr/bin/env node
/**
 * Writes Caddyfile from RELINKY_ADMIN_HOST + domains in redirectables.db.
 * Used by gateway Docker entrypoint and after domain changes (caddy reload).
 *
 * Optional: RELINKY_CADDY_HTTP_PORT, RELINKY_CADDY_HTTPS_PORT — Caddy global http_port / https_port
 * (defaults 80 / 443). Match docker-compose host:container publish mapping.
 *
 * RELINKY_CADDY_TLS_INTERNAL=1 — use Caddy’s local CA (self-signed) for HTTPS. Use when Let’s Encrypt
 * cannot reach you on public 80/443 (custom ports, another proxy, etc.). Browsers will warn until trusted.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getRedirectablesDb } from '../app/shared/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = join(__dirname, '..')

const adminHost = process.env.RELINKY_ADMIN_HOST
const httpOnly =
	process.env.RELINKY_HTTP_ONLY === '1' ||
	process.env.RELINKY_HTTP_ONLY === 'true'
const acmeEmail = process.env.ACME_EMAIL || ''
const staging = process.env.RELINKY_ACME_STAGING === '1'
const caddyfilePath =
	process.env.CADDYFILE_PATH || join(appRoot, 'caddy', 'Caddyfile')
const adminPort = process.env.ADMIN_PORT || '8081'
const redirectPort = process.env.REDIRECTOR_PORT || '8082'
/** Bind HTTP / HTTPS inside the container (Caddy global http_port / https_port). Defaults 80 / 443. */
const caddyHttpPort = process.env.RELINKY_CADDY_HTTP_PORT?.trim() || ''
const caddyHttpsPort = process.env.RELINKY_CADDY_HTTPS_PORT?.trim() || ''
const tlsInternal =
	process.env.RELINKY_CADDY_TLS_INTERNAL === '1' ||
	process.env.RELINKY_CADDY_TLS_INTERNAL === 'true'
/** Non-default Caddy ports break LE HTTP-01/TLS-ALPN (validators use :80 / :443 only). */
const customCaddyPorts = Boolean(caddyHttpPort || caddyHttpsPort)

function escHost(domain) {
	if (!domain || typeof domain !== 'string') return null
	if (!/^[a-zA-Z0-9.*-]+$/i.test(domain)) {
		console.warn(`[generate-caddyfile] skipping unsafe host: ${domain}`)
		return null
	}
	return domain
}

function siteAddr(host) {
	const e = escHost(host)
	if (!e) return null
	return httpOnly ? `http://${e}` : e
}

if (!adminHost) {
	console.error('[generate-caddyfile] RELINKY_ADMIN_HOST is required')
	process.exit(1)
}

const adminAddr = siteAddr(adminHost)
if (!adminAddr) {
	console.error('[generate-caddyfile] invalid RELINKY_ADMIN_HOST')
	process.exit(1)
}

const lines = []

if (!httpOnly) {
	lines.push('{')
	if (!tlsInternal) {
		if (acmeEmail) lines.push(`\temail ${acmeEmail}`)
		if (staging) {
			lines.push(
				'\tacme_ca https://acme-staging-v02.api.letsencrypt.org/directory'
			)
		}
	}
	if (tlsInternal || customCaddyPorts) {
		lines.push('\tauto_https disable_redirects')
	}
	if (caddyHttpPort) lines.push(`\thttp_port ${caddyHttpPort}`)
	if (caddyHttpsPort) lines.push(`\thttps_port ${caddyHttpsPort}`)
	lines.push('}')
	lines.push('')
} else if (caddyHttpPort) {
	lines.push('{')
	lines.push(`\thttp_port ${caddyHttpPort}`)
	lines.push('}')
	lines.push('')
}

lines.push(`${adminAddr} {`)
if (!httpOnly && tlsInternal) {
	lines.push('\ttls internal')
}
lines.push(`\treverse_proxy 127.0.0.1:${adminPort}`)
lines.push('}')
lines.push('')

const db = getRedirectablesDb()
const rows = db.prepare('SELECT domain FROM domains ORDER BY domain').all()
db.close()

const redirectAddrs = []
for (const row of rows) {
	const a = siteAddr(row.domain)
	if (a && escHost(row.domain) !== escHost(adminHost)) {
		redirectAddrs.push(a)
	} else if (a && escHost(row.domain) === escHost(adminHost)) {
		console.warn(
			`[generate-caddyfile] redirect domain "${row.domain}" matches RELINKY_ADMIN_HOST; only admin block kept`
		)
	}
}

if (redirectAddrs.length > 0) {
	const list = redirectAddrs.join(', ')
	lines.push(`${list} {`)
	if (!httpOnly && tlsInternal) {
		lines.push('\ttls internal')
	}
	lines.push(`\treverse_proxy 127.0.0.1:${redirectPort}`)
	lines.push('}')
	lines.push('')
}

mkdirSync(dirname(caddyfilePath), { recursive: true })
writeFileSync(caddyfilePath, lines.join('\n'), 'utf8')
console.log(`[generate-caddyfile] wrote ${caddyfilePath}`)
