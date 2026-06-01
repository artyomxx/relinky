import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('[Start] Starting redirector...')
const redirector = spawn('node', [join(__dirname, 'app/redirector/server.js')], {
	stdio: 'inherit',
	cwd: __dirname,
	env: process.env
})

console.log('[Start] Starting admin...')
const admin = spawn('node', [join(__dirname, 'app/admin/backend/server.js')], {
	stdio: 'inherit',
	cwd: __dirname,
	env: process.env
})

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
	if (code !== 0) shutdown('redirector exit')
})

admin.on('exit', (code) => {
	console.log(`[Start] Admin exited with code ${code}`)
	if (code !== 0) shutdown('admin exit')
})

console.log('[Start] All processes started')
