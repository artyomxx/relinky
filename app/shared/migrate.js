// Lightweight migration runner built on SQLite's per-file PRAGMA user_version.
//
// Each DB file tracks its own schema version in its header. A migration list is an
// ordered array where index 0 produces version 1, index 1 produces version 2, etc.
// On startup we apply every migration whose target version is greater than the
// current user_version, each inside its own transaction (user_version is part of the
// DB header and rolls back with the transaction on error).
//
// Migration shape: { name: string, up(db): void }

export function getUserVersion(db) {
	return db.pragma('user_version', { simple: true })
}

export function setUserVersion(db, version) {
	// PRAGMA does not accept bound parameters; version is an internally-generated integer.
	db.exec(`PRAGMA user_version = ${version}`)
}

/**
 * Apply pending migrations to `db`.
 * Returns the resulting user_version.
 */
export function runMigrations(db, migrations, { label = 'db', log = console.log } = {}) {
	const current = getUserVersion(db)

	if (current > migrations.length) {
		throw new Error(
			`[Migrate] ${label}: database is at v${current} but only ${migrations.length} migration(s) are known (downgrade?)`
		)
	}

	for (let i = current; i < migrations.length; i++) {
		const migration = migrations[i]
		const targetVersion = i + 1
		let applied = false
		const apply = db.transaction(() => {
			// Re-check under the write lock: admin and redirector both run migrations on
			// boot, so another process may have applied this version between our initial
			// read and acquiring the lock. Without this, a non-idempotent migration could
			// run twice (and setUserVersion could walk the version backwards).
			if (getUserVersion(db) >= targetVersion) {
				return
			}
			migration.up(db)
			setUserVersion(db, targetVersion)
			applied = true
		})
		// BEGIN IMMEDIATE takes the write lock at the start of the transaction. Migration
		// up() is often a no-op on an already-migrated DB (CREATE TABLE IF NOT EXISTS), so a
		// deferred transaction would stay a reader until setUserVersion and then deadlock if
		// another process is upgrading its own deferred lock at the same time.
		apply.immediate()
		if (applied) {
			log(`[Migrate] ${label}: applied v${targetVersion} (${migration.name})`)
		}
	}

	return getUserVersion(db)
}
