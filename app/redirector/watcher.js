import { statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import cache from './cache.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbDir = join(__dirname, '../../db')
const redirectablesDbPath = join(dbDir, 'redirectables.db')
const mainDbPath = join(dbDir, 'main.db')

let pollInterval = null
let lastRedirectablesMtimeMs = 0
let lastMainMtimeMs = 0

/**
 * Reload when SQLite files change. Row updates (e.g. editing a link target URL, or
 * inserting into redirect_urls) do not change link/domain counts, so count-only polling
 * left the redirector serving stale Location URLs forever.
 */
function checkForChanges() {
	try {
		const rStat = statSync(redirectablesDbPath)
		const mStat = statSync(mainDbPath)
		const rMs = rStat.mtimeMs
		const mMs = mStat.mtimeMs
		if (rMs !== lastRedirectablesMtimeMs || mMs !== lastMainMtimeMs) {
			lastRedirectablesMtimeMs = rMs
			lastMainMtimeMs = mMs
			console.log('[Watcher] Database file changed, reloading cache...')
			cache.load()
			console.log('[Watcher] Cache reloaded')
		}
	} catch (err) {
		console.error('[Watcher] Error checking for changes:', err)
	}
}

export function startWatcher() {
	stopWatcher()

	const rStat = statSync(redirectablesDbPath)
	const mStat = statSync(mainDbPath)
	lastRedirectablesMtimeMs = rStat.mtimeMs
	lastMainMtimeMs = mStat.mtimeMs

	pollInterval = setInterval(checkForChanges, 2000)
	console.log('[Watcher] Started polling database files for changes (every 2 seconds)')
}

export function stopWatcher() {
	if (pollInterval) {
		clearInterval(pollInterval)
		pollInterval = null
	}
}
