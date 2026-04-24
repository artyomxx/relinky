import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, '../../db')

// Ensure db directory exists
try {
	mkdirSync(dbPath, { recursive: true })
} catch (err) {
	// Directory might already exist, ignore
}

export function getMainDb() {
	const db = new Database(join(dbPath, 'main.db'))
	db.pragma('journal_mode = WAL')
	return db
}

export function getRedirectablesDb() {
	const db = new Database(join(dbPath, 'redirectables.db'))
	db.pragma('journal_mode = WAL')
	return db
}

export function getStatsDb() {
	const db = new Database(join(dbPath, 'stats.db'))
	db.pragma('journal_mode = WAL')
	return db
}

export function getLogsDb() {
	const db = new Database(join(dbPath, 'logs.db'))
	db.pragma('journal_mode = WAL')
	return db
}

