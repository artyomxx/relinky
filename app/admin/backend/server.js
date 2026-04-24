import { createServer } from 'http'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as auth from './auth.js'
import { Router } from './router.js'
import {
	setupAuthRoutes,
	setupLinkRoutes,
	setupStatsRoutes,
	setupDomainRoutes,
	setupSettingsRoutes,
	setupApiKeyRoutes,
	setupExternalRoutes,
	setupLogsRoutes
} from './api.js'
import { listenServer } from '../../shared/http-listen.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Initialize databases on startup - must complete before starting server
console.log('[Admin] Initializing databases...')
try {
	await import('../../shared/init-db.js')
	console.log('[Admin] Databases initialized successfully')
} catch (err) {
	console.error('[Admin] Error initializing databases:', err)
	process.exit(1)
}

const adminIp = process.env.ADMIN_IP || '0.0.0.0'
const adminPort = parseInt(process.env.ADMIN_PORT || '8081')

const router = new Router()

// Setup routes
setupAuthRoutes(router, auth)
setupLinkRoutes(router, auth)
setupStatsRoutes(router, auth)
setupDomainRoutes(router, auth)
setupSettingsRoutes(router, auth)
setupApiKeyRoutes(router, auth)
setupExternalRoutes(router, auth)
setupLogsRoutes(router, auth)

// Serve frontend files (production build output under dist/)
const frontendPath = join(__dirname, '../frontend/dist')
const indexPath = join(frontendPath, 'index.html')
const missingIndexHtml = '<!DOCTYPE html><html><body><h1>Frontend not built. Run: npm run build</h1></body></html>'

function readSpaIndexHtml() {
	try {
		return readFileSync(indexPath, 'utf8')
	} catch {
		return missingIndexHtml
	}
}

const server = createServer((req, res) => {
	const pathname = new URL(req.url, 'http://localhost').pathname
	if (pathname === '/-healthcheck' || pathname === '/healthcheck') {
		res.writeHead(200, { 'Content-Type': 'text/plain' })
		res.end('ok')
		return
	}

	const match = router.match(req.method, req.url)

	if (match) {
		// API route
		match.handler(req, res, match.params)
		return
	}

	// Serve static files
	if (req.url.startsWith('/assets/')) {
		try {
			const filePath = join(frontendPath, req.url)
			const content = readFileSync(filePath)
			const ext = req.url.split('.').pop()
			const contentType = {
				'js': 'application/javascript',
				'css': 'text/css',
				'png': 'image/png',
				'jpg': 'image/jpeg',
				'svg': 'image/svg+xml'
			}[ext] || 'application/octet-stream'

			res.writeHead(200, { 'Content-Type': contentType })
			res.end(content)
		} catch (err) {
			res.writeHead(404, { 'Content-Type': 'text/plain' })
			res.end('Not Found')
		}
		return
	}

	// Serve index.html for all other routes (SPA). Read from disk each time so a new
	// `vite build` (new hashed /assets/* names) is picked up without restarting the server.
	res.writeHead(200, {
		'Content-Type': 'text/html',
		'Cache-Control': 'no-cache'
	})
	res.end(readSpaIndexHtml())
})

// Start server only after database initialization is complete
listenServer(server, adminPort, adminIp, () => {
	const where = adminIp === '0.0.0.0' ? `*:${adminPort}` : `${adminIp}:${adminPort}`
	console.log(`[Admin] Server listening on ${where}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('[Admin] Shutting down...')
	server.close(() => {
		console.log('[Admin] Server closed')
		process.exit(0)
	})
})

process.on('SIGINT', () => {
	console.log('[Admin] Shutting down...')
	server.close(() => {
		console.log('[Admin] Server closed')
		process.exit(0)
	})
})

