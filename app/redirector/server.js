import { createServer } from 'http'
import cache from './cache.js'
import {
	resolveErrorUrl,
	resolveExpiredUrl,
	resolveKeepQueryParams,
	resolveKeepReferrer,
	resolveRedirectCode
} from '../shared/resolve-settings.js'
import statsQueue from './stats-queue.js'
import { startWatcher, stopWatcher } from './watcher.js'
import { getRedirectablesDb } from '../shared/db.js'
import { listenServer } from '../shared/http-listen.js'
import { assertSchemaCurrent } from '../shared/check-schema.js'

// Migrations run as a separate deploy step (start.js / gateway entrypoint / compose
// migrate service). Verify the schema is current and fail fast if it is not.
try {
	assertSchemaCurrent()
	console.log('[Redirector] Database schema verified')
} catch (err) {
	console.error('[Redirector]', err.message)
	process.exit(1)
}

const redirectorIp = process.env.REDIRECTOR_IP || '0.0.0.0'
const redirectorPort = parseInt(process.env.REDIRECTOR_PORT || '8082')

function getClientIp(req) {
	return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
		req.headers['x-real-ip'] ||
		req.socket.remoteAddress ||
		''
}

/** For use in HTML attribute href=… */
function escapeHtmlAttr(s) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
}

/**
 * HTTP 3xx Location with a #fragment is not applied by browsers when following redirects,
 * so the address bar would drop the hash. Client-side navigation preserves it.
 */
function sendClientRedirectWithFragment(res, targetUrl, referrerPolicy = 'no-referrer') {
	const jsLiteral = JSON.stringify(targetUrl)
	const href = escapeHtmlAttr(targetUrl)
	const metaReferrer = escapeHtmlAttr(referrerPolicy)
	const body =
		'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
		'<meta name="color-scheme" content="light dark">' +
		`<meta name="referrer" content="${metaReferrer}">` +
		'<title>Redirecting…</title>' +
		'<style>' +
		'html{color-scheme:light dark}' +
		'body{margin:0;min-height:100vh;background-color:Canvas;color:CanvasText;font:system-ui,sans-serif}' +
		'a{color:LinkText}' +
		'</style>' +
		`<script>location.replace(${jsLiteral})</script>` +
		`</head><body><noscript><p><a href="${href}">Continue</a></p></noscript></body></html>`
	res.writeHead(200, {
		'Content-Type': 'text/html; charset=utf-8',
		'Referrer-Policy': referrerPolicy
	})
	res.end(body)
}

function sendErrorOrRedirect(res, statusCode, fallbackText, domainId = null) {
	const domainOverrides = domainId != null ? cache.getDomainOverrides(domainId) : null
	const redirectUrl = resolveErrorUrl(statusCode, domainOverrides, {
		error_404_url: cache.getSetting('error_404_url'),
		error_500_url: cache.getSetting('error_500_url')
	})
	if (redirectUrl) {
		if (redirectUrl.includes('#')) {
			sendClientRedirectWithFragment(res, redirectUrl)
			return
		}
		res.writeHead(303, {
			'Location': redirectUrl,
			'Content-Type': 'text/plain'
		})
		res.end()
		return
	}
	res.writeHead(statusCode, { 'Content-Type': 'text/plain' })
	res.end(fallbackText)
}

const server = createServer((req, res) => {
	if (req.method !== 'GET') {
		res.writeHead(405, { 'Content-Type': 'text/plain' })
		res.end('Method Not Allowed')
		return
	}

	const hostname = req.headers.host?.split(':')[0] || ''
	const protocol = req.headers['x-forwarded-proto'] || 'http'
	const baseUrl = `${protocol}://${req.headers.host || 'localhost'}`
	const url = new URL(req.url, baseUrl)
	const pathname = url.pathname || '/'

	if (pathname === '/-healthcheck' || pathname === '/healthcheck') {
		res.writeHead(200, { 'Content-Type': 'text/plain' })
		res.end('ok')
		return
	}
	
	// Convert URLSearchParams to plain object
	const queryParams = {}
	for (const [key, value] of url.searchParams) {
		queryParams[key] = value
	}

	// Find domain
	const domainMatch = cache.findDomain(hostname)
	if (!domainMatch) {
		sendErrorOrRedirect(res, 404, 'Not Found')
		return
	}

	const [domainId] = domainMatch
	const domainOverrides = cache.getDomainOverrides(domainId)

	// Find link by domain and slug
	const link = cache.findLink(domainId, pathname)
	if (!link) {
		sendErrorOrRedirect(res, 404, 'Not Found', domainId)
		return
	}

	// Check expiration
	const now = Date.now()
	const isExpired = link.expire && link.expire < now
	const targetUrl = isExpired
		? resolveExpiredUrl(
			link.expired_url,
			domainOverrides?.expired_url,
			cache.getDefault('expired_url')
		)
		: link.url

	if (!targetUrl) {
		sendErrorOrRedirect(res, 500, 'Internal Server Error', domainId)
		return
	}

	const keepQueryParams = resolveKeepQueryParams(
		link.keep_query_params,
		domainOverrides?.keep_query_params,
		cache.defaults
	)

	try {
		// Build final URL
		let finalUrl = targetUrl
		if (keepQueryParams && Object.keys(queryParams).length > 0) {
			const urlObj = new URL(finalUrl)
			for (const [key, value] of Object.entries(queryParams)) {
				urlObj.searchParams.set(key, value)
			}
			finalUrl = urlObj.toString()
		}

		const redirectCode = resolveRedirectCode(
			link.redirect_code,
			domainOverrides?.redirect_code,
			cache.defaults
		)

		// Queue stats (async, non-blocking)
		const redirectablesDb = getRedirectablesDb()
		const normalUrlStmt = redirectablesDb.prepare('SELECT id FROM redirect_urls WHERE url = ?')
		const normalUrlRow = normalUrlStmt.get(link.url)
		const normalUrlId = normalUrlRow?.id || null

		let expiredUrlId = null
		if (link.expired_url) {
			const expiredUrlStmt = redirectablesDb.prepare('SELECT id FROM expired_urls WHERE url = ?')
			const expiredUrlRow = expiredUrlStmt.get(link.expired_url)
			expiredUrlId = expiredUrlRow?.id || null
		}
		redirectablesDb.close()

		statsQueue.add({
			link_id: link.id,
			normal_url_id: normalUrlId,
			expired_url_id: expiredUrlId,
			expired: isExpired,
			timestamp: now,
			client_ip: getClientIp(req),
			referral_url: req.headers.referer || null,
			query_params_string: Object.keys(queryParams).length > 0 ? new URLSearchParams(queryParams).toString() : null,
			query_params: queryParams,
			language: req.headers['accept-language'] || null,
			user_agent_string: req.headers['user-agent'] || null
		})

		const keepReferrer = resolveKeepReferrer(
			link.keep_referrer,
			domainOverrides?.keep_referrer,
			cache.defaults
		)
		const referrerPolicy = keepReferrer ? 'unsafe-url' : 'no-referrer'
		if (finalUrl.includes('#')) {
			sendClientRedirectWithFragment(res, finalUrl, referrerPolicy)
			return
		}

		res.writeHead(redirectCode, {
			'Location': finalUrl,
			'Referrer-Policy': referrerPolicy,
			'Content-Type': 'text/plain'
		})
		res.end()
	} catch (err) {
		console.error('[Redirector] Error while handling redirect:', err)
		sendErrorOrRedirect(res, 500, 'Internal Server Error', domainId)
	}
})

listenServer(server, redirectorPort, redirectorIp, () => {
	const where = redirectorIp === '0.0.0.0' ? `*:${redirectorPort}` : `${redirectorIp}:${redirectorPort}`
	console.log(`[Redirector] Server listening on ${where}`)
	startWatcher()
})

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('[Redirector] Shutting down...')
	stopWatcher()
	statsQueue.stop()
	server.close(() => {
		console.log('[Redirector] Server closed')
		process.exit(0)
	})
})

process.on('SIGINT', () => {
	console.log('[Redirector] Shutting down...')
	stopWatcher()
	statsQueue.stop()
	server.close(() => {
		console.log('[Redirector] Server closed')
		process.exit(0)
	})
})

