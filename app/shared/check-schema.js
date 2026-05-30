// Boot-time schema guard for the service processes.
//
// Services do not migrate themselves. Migrations run once per deployment as a dedicated
// step (start.js for the single-container image, the gateway entrypoint, or the compose
// `migrate` service). On boot each service asserts that every database is exactly at its
// expected version and fails fast otherwise, so a deploy that skipped the migration step
// is caught loudly instead of silently running on a stale (or newer) schema.

import { dbSteps } from './db-schema.js'
import { getUserVersion } from './migrate.js'

export function assertSchemaCurrent() {
	const behind = []
	const ahead = []
	for (const [label, getDb, migrations] of dbSteps) {
		const db = getDb()
		try {
			const current = getUserVersion(db)
			const expected = migrations.length
			if (current < expected) {
				behind.push(`${label} (at v${current}, expected v${expected})`)
			} else if (current > expected) {
				ahead.push(`${label} (at v${current}, expected v${expected})`)
			}
		} finally {
			db.close()
		}
	}
	if (behind.length === 0 && ahead.length === 0) {
		return
	}
	const parts = []
	if (behind.length) {
		parts.push(
			`databases behind: ${behind.join(', ')} — run migrations first ` +
				`(node app/shared/init-db.js)`
		)
	}
	if (ahead.length) {
		parts.push(`databases ahead: ${ahead.join(', ')} — service is older than the data (downgrade?)`)
	}
	throw new Error(`Database schema check failed: ${parts.join('; ')}`)
}
