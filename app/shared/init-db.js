import { getMainDb, getRedirectablesDb, getStatsDb, getLogsDb } from './db.js'
import { runMigrations } from './migrate.js'
import mainMigrations from './migrations/main.js'
import redirectablesMigrations from './migrations/redirectables.js'
import statsMigrations from './migrations/stats.js'
import logsMigrations from './migrations/logs.js'
import { mkdir } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = process.env.RELINKY_DB_DIR
	? resolve(process.env.RELINKY_DB_DIR)
	: join(__dirname, '../../db')

// Ensure db directory exists
await mkdir(dbPath, { recursive: true })

// Each DB file carries its own schema version (PRAGMA user_version). Migration 1 is the
// baseline (idempotent CREATE TABLE IF NOT EXISTS), so pre-existing databases at version 0
// converge to the same versioned state as a fresh install with no data loss.
const steps = [
	['main', getMainDb, mainMigrations],
	['redirectables', getRedirectablesDb, redirectablesMigrations],
	['stats', getStatsDb, statsMigrations],
	['logs', getLogsDb, logsMigrations]
]

for (const [label, getDb, migrations] of steps) {
	const db = getDb()
	try {
		runMigrations(db, migrations, { label })
	} finally {
		db.close()
	}
}

console.log('Databases initialized successfully')
