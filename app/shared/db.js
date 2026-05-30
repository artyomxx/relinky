import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { mkdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// RELINKY_DB_DIR lets tests (and alternative deployments) point at an isolated db
// directory instead of the repo-local ../../db. Resolved once and shared by every
// module that needs a db path (init-db, watcher) so resolution never diverges.
export const dbDir = process.env.RELINKY_DB_DIR
	? resolve(process.env.RELINKY_DB_DIR)
	: join(__dirname, '../../db')

export const mainDbPath = join(dbDir, 'main.db')
export const redirectablesDbPath = join(dbDir, 'redirectables.db')
export const statsDbPath = join(dbDir, 'stats.db')
export const logsDbPath = join(dbDir, 'logs.db')

// Ensure db directory exists
try {
	mkdirSync(dbDir, { recursive: true })
} catch (err) {
	// Directory might already exist, ignore
}

// Both the admin and redirector services open these DBs (and both run migrations on
// boot), so concurrent writers are expected. Without busy_timeout a writer that loses
// the race fails immediately with SQLITE_BUSY; with it, the writer waits for the lock.
const busyTimeoutMs = parseInt(process.env.RELINKY_DB_BUSY_TIMEOUT_MS || '5000', 10)

function openDb(path) {
	const db = new Database(path)
	db.pragma(`busy_timeout = ${busyTimeoutMs}`)
	db.pragma('journal_mode = WAL')
	return db
}

export function getMainDb() {
	return openDb(mainDbPath)
}

export function getRedirectablesDb() {
	return openDb(redirectablesDbPath)
}

export function getStatsDb() {
	return openDb(statsDbPath)
}

export function getLogsDb() {
	return openDb(logsDbPath)
}

