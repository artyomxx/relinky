import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = join(__dirname, '..', '..')

/**
 * Regenerate Caddyfile from DB and reload Caddy (non-blocking).
 * No-op unless RELINKY_USE_GATEWAY=1.
 */
export function scheduleGatewayReload() {
	if (process.env.RELINKY_USE_GATEWAY !== '1') return

	const script = join(appRoot, 'scripts', 'generate-caddyfile.mjs')
	const caddyfile =
		process.env.CADDYFILE_PATH || join(appRoot, 'caddy', 'Caddyfile')

	const child = spawn(
		'sh',
		[
			'-c',
			`node "${script}" && caddy reload --config "${caddyfile}" --adapter caddyfile`
		],
		{
			cwd: appRoot,
			env: process.env,
			stdio: 'ignore',
			detached: true
		}
	)
	child.unref()
}
