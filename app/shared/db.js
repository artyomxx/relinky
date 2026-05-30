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

export function getMainDb() {
	const db = new Database(mainDbPath)
	db.pragma('journal_mode = WAL')
	return db
}

export function getRedirectablesDb() {
	const db = new Database(redirectablesDbPath)
	db.pragma('journal_mode = WAL')
	return db
}

export function getStatsDb() {
	const db = new Database(statsDbPath)
	db.pragma('journal_mode = WAL')
	return db
}

export function getLogsDb() {
	const db = new Database(logsDbPath)
	db.pragma('journal_mode = WAL')
	return db
}

