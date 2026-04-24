import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Initialize databases
console.log('[Start] Initializing databases...')
try {
	await import('./app/shared/init-db.js')
	console.log('[Start] Databases initialized')
} catch (err) {
	console.error('[Start] Error initializing databases:', err)
	process.exit(1)
}

// Start redirector
console.log('[Start] Starting redirector...')
const redirector = spawn('node', [join(__dirname, 'app/redirector/server.js')], {
	stdio: 'inherit',
	cwd: __dirname
})

// Start admin
console.log('[Start] Starting admin...')
const admin = spawn('node', [join(__dirname, 'app/admin/backend/server.js')], {
	stdio: 'inherit',
	cwd: __dirname
})

// Handle process exits
function shutdown(signal) {
	console.log(`[Start] Received ${signal}, shutting down...`)
	redirector.kill()
	admin.kill()
	
	setTimeout(() => {
		console.log('[Start] Force exit')
		process.exit(0)
	}, 5000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

redirector.on('exit', (code) => {
	console.log(`[Start] Redirector exited with code ${code}`)
	if (code !== 0) {
		shutdown('redirector exit')
	}
})

admin.on('exit', (code) => {
	console.log(`[Start] Admin exited with code ${code}`)
	if (code !== 0) {
		shutdown('admin exit')
	}
})

console.log('[Start] All processes started')

