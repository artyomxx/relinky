import { createServer } from 'http'
import cache from './cache.js'
import statsQueue from './stats-queue.js'
import { startWatcher, stopWatcher } from './watcher.js'
import { getRedirectablesDb } from '../shared/db.js'
import { listenServer } from '../shared/http-listen.js'

// Initialize databases on startup
try {
	await import('../shared/init-db.js')
	console.log('[Redirector] Databases initialized')
} catch (err) {
	console.error('[Redirector] Error initializing databases:', err)
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
function sendClientRedirectWithFragment(res, targetUrl) {
	const jsLiteral = JSON.stringify(targetUrl)
	const href = escapeHtmlAttr(targetUrl)
	const body =
		'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
		'<meta name="color-scheme" content="light dark">' +
		'<title>Redirecting…</title>' +
		'<style>' +
		'html{color-scheme:light dark}' +
		'body{margin:0;min-height:100vh;background-color:Canvas;color:CanvasText;font:system-ui,sans-serif}' +
		'a{color:LinkText}' +
		'</style>' +
		`<script>location.replace(${jsLiteral})</script>` +
		`</head><body><noscript><p><a href="${href}">Continue</a></p></noscript></body></html>`
	res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
	res.end(body)
}

function sendErrorOrRedirect(res, statusCode, fallbackText) {
	const settingKey = statusCode === 404 ? 'error_404_url' : 'error_500_url'
	const redirectUrl = cache.getSetting(settingKey)
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

	// Find link by domain and slug
	const link = cache.findLink(domainId, pathname)
	if (!link) {
		sendErrorOrRedirect(res, 404, 'Not Found')
		return
	}

	// Check expiration
	const now = Date.now()
	const isExpired = link.expire && link.expire < now
	const targetUrl = isExpired ? (link.expired_url || cache.getDefault('expired_url')) : link.url

	if (!targetUrl) {
		sendErrorOrRedirect(res, 500, 'Internal Server Error')
		return
	}

	try {
		// Build final URL
		let finalUrl = targetUrl
		if (link.keep_query_params && Object.keys(queryParams).length > 0) {
			const urlObj = new URL(finalUrl)
			for (const [key, value] of Object.entries(queryParams)) {
				urlObj.searchParams.set(key, value)
			}
			finalUrl = urlObj.toString()
		}

		// Get redirect code
		const redirectCode = link.redirect_code || parseInt(cache.getDefault('redirect_code')) || 303

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

		// Redirect (see sendClientRedirectWithFragment — Location #fragment is ignored by browsers)
		if (finalUrl.includes('#')) {
			sendClientRedirectWithFragment(res, finalUrl)
			return
		}

		res.writeHead(redirectCode, {
			'Location': finalUrl,
			'Content-Type': 'text/plain'
		})
		res.end()
	} catch (err) {
		console.error('[Redirector] Error while handling redirect:', err)
		sendErrorOrRedirect(res, 500, 'Internal Server Error')
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

