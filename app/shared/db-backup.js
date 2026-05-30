// Pre-migration safety snapshots.
//
// Before a database that has pending migrations is upgraded, init-db takes a consistent
// copy via SQLite's online backup API (db.backup). A raw file copy is unsafe under WAL
// because committed data can still live in the -wal file; the backup API produces a
// single self-contained file. Snapshots land in <dbDir>/backups and are pruned to the
// most recent RELINKY_DB_BACKUP_KEEP per database (0 = keep all).

import { join } from 'path'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'

export const backupKeep = parseInt(process.env.RELINKY_DB_BACKUP_KEEP || '10', 10)

function stamp(date = new Date()) {
	const p = n => String(n).padStart(2, '0')
	return (
		`${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
		`-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
	)
}

// pid keeps the name unique when admin and redirector back up the same db in the same
// second on a concurrent boot.
export function backupName(label, fromVersion, date = new Date(), pid = process.pid) {
	return `${label}.${stamp(date)}.v${fromVersion}.${pid}.db`
}

// Only worth snapshotting a db that already has schema. A brand-new install migrating
// from v0 has nothing to lose; a legacy install at v0 has tables and must be backed up.
export function hasExistingSchema(db) {
	const row = db
		.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1")
		.get()
	return row !== undefined
}

/**
 * Snapshot `db` into <dbDir>/backups before migrating. Returns the destination path.
 * Throws on failure so the caller can abort the migration (no migrate without a snapshot).
 */
export async function backupDb(db, { dbDir, label, fromVersion }) {
	const backupsDir = join(dbDir, 'backups')
	mkdirSync(backupsDir, { recursive: true })
	const dest = join(backupsDir, backupName(label, fromVersion))
	await db.backup(dest)
	return dest
}

/** Keep only the `keep` most recent backups for `label`. 0 / falsy keeps all. Returns removed paths. */
export function pruneBackups(dbDir, label, keep = backupKeep) {
	if (!keep || keep < 1) return []
	const backupsDir = join(dbDir, 'backups')
	let entries
	try {
		entries = readdirSync(backupsDir)
	} catch {
		return []
	}
	const mine = entries
		.filter(f => f.startsWith(`${label}.`) && f.endsWith('.db'))
		.map(f => {
			const full = join(backupsDir, f)
			return { full, mtime: statSync(full).mtimeMs }
		})
		.sort((a, b) => b.mtime - a.mtime)
	const removed = []
	for (const { full } of mine.slice(keep)) {
		try {
			unlinkSync(full)
			removed.push(full)
		} catch {
			// best-effort prune; a failed delete must not break startup
		}
	}
	return removed
}
