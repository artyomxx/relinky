import { dbDir } from './db.js'
import { dbSteps } from './db-schema.js'
import { runMigrations, getUserVersion } from './migrate.js'
import { backupDb, pruneBackups, hasExistingSchema, backupKeep } from './db-backup.js'
import { seedAdminPasswordFromEnv } from './seed-admin-password.js'
import { mkdir } from 'fs/promises'

// Ensure db directory exists (dbDir is resolved in db.js, honoring RELINKY_DB_DIR)
await mkdir(dbDir, { recursive: true })

// Each DB file carries its own schema version (PRAGMA user_version). Migration 1 is the
// baseline (idempotent CREATE TABLE IF NOT EXISTS), so pre-existing databases at version 0
// converge to the same versioned state as a fresh install with no data loss.
for (const [label, getDb, migrations] of dbSteps) {
	const db = getDb()
	try {
		// Snapshot before applying any pending migration to a db that already has data.
		// backupDb throws on failure, which aborts startup (server.js exits) so we never
		// upgrade an existing database without a restore point.
		const current = getUserVersion(db)
		if (current < migrations.length && hasExistingSchema(db)) {
			const dest = await backupDb(db, { dbDir, label, fromVersion: current })
			console.log(`[Migrate] ${label}: backed up v${current} before upgrade -> ${dest}`)
			pruneBackups(dbDir, label, backupKeep)
		}
		runMigrations(db, migrations, { label })
	} finally {
		db.close()
	}
}

seedAdminPasswordFromEnv()

console.log('Databases initialized successfully')
