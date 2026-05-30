import { getMainDb, getRedirectablesDb, getStatsDb, getLogsDb, dbDir } from './db.js'
import { runMigrations } from './migrate.js'
import mainMigrations from './migrations/main.js'
import redirectablesMigrations from './migrations/redirectables.js'
import statsMigrations from './migrations/stats.js'
import logsMigrations from './migrations/logs.js'
import { mkdir } from 'fs/promises'

// Ensure db directory exists (dbDir is resolved in db.js, honoring RELINKY_DB_DIR)
await mkdir(dbDir, { recursive: true })

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
