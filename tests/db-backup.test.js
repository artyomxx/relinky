import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, utimesSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { getUserVersion } from '../app/shared/migrate.js'
import { backupName, hasExistingSchema, backupDb, pruneBackups } from '../app/shared/db-backup.js'

const initDbEntry = 'app/shared/init-db.js'

async function withTempDir(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'relinky-backup-'))
	try {
		return await fn(dir)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

function listBackups(dir, label) {
	const backupsDir = join(dir, 'backups')
	if (!existsSync(backupsDir)) return []
	return readdirSync(backupsDir).filter(f => (label ? f.startsWith(`${label}.`) : true) && f.endsWith('.db'))
}

test('backupName encodes label, version and pid and is unique per pid/second', () => {
	const date = new Date(2026, 4, 30, 17, 28, 0)
	assert.equal(backupName('main', 0, date, 4242), 'main.20260530-172800.v0.4242.db')
	assert.notEqual(backupName('main', 0, date, 1), backupName('main', 0, date, 2))
})

test('hasExistingSchema is false for an empty db and true once a table exists', () => {
	const db = new Database(':memory:')
	assert.equal(hasExistingSchema(db), false)
	db.exec('CREATE TABLE a (id INTEGER)')
	assert.equal(hasExistingSchema(db), true)
	db.close()
})

test('backupDb writes a consistent, openable copy of the data', async () => {
	await withTempDir(async dir => {
		const db = new Database(join(dir, 'main.db'))
		db.pragma('journal_mode = WAL')
		db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
		db.prepare('INSERT INTO t (v) VALUES (?)').run('hello')

		const dest = await backupDb(db, { dbDir: dir, label: 'main', fromVersion: 0 })
		db.close()

		assert.ok(existsSync(dest))
		const copy = new Database(dest, { readonly: true })
		const row = copy.prepare('SELECT v FROM t WHERE id = 1').get()
		assert.equal(row?.v, 'hello')
		copy.close()
	})
})

test('pruneBackups keeps only the N most recent for a label', async () => {
	await withTempDir(dir => {
		const backupsDir = join(dir, 'backups')
		mkdirSync(backupsDir)
		// Create 5 main backups + 1 unrelated, with increasing mtimes.
		const names = [
			'main.20260101-000000.v0.1.db',
			'main.20260102-000000.v0.1.db',
			'main.20260103-000000.v0.1.db',
			'main.20260104-000000.v0.1.db',
			'main.20260105-000000.v0.1.db'
		]
		names.forEach((n, i) => {
			const full = join(backupsDir, n)
			writeFileSync(full, '')
			const t = new Date(2026, 0, 1 + i).getTime() / 1000
			utimesSync(full, t, t)
		})
		writeFileSync(join(backupsDir, 'logs.20260101-000000.v0.1.db'), '')

		const removed = pruneBackups(dir, 'main', 2)
		assert.equal(removed.length, 3)
		const remaining = listBackups(dir, 'main').sort()
		assert.deepEqual(remaining, ['main.20260104-000000.v0.1.db', 'main.20260105-000000.v0.1.db'])
		// Other labels untouched.
		assert.deepEqual(listBackups(dir, 'logs'), ['logs.20260101-000000.v0.1.db'])
	})
})

test('pruneBackups with keep=0 keeps everything', async () => {
	await withTempDir(dir => {
		const backupsDir = join(dir, 'backups')
		mkdirSync(backupsDir)
		writeFileSync(join(backupsDir, 'main.20260101-000000.v0.1.db'), '')
		const removed = pruneBackups(dir, 'main', 0)
		assert.deepEqual(removed, [])
		assert.equal(listBackups(dir, 'main').length, 1)
	})
})

test('init-db creates no backups on a fresh install (empty dbs)', async () => {
	await withTempDir(dir => {
		const result = spawnSync('node', [initDbEntry], {
			cwd: process.cwd(),
			env: { ...process.env, RELINKY_DB_DIR: dir },
			encoding: 'utf8'
		})
		assert.equal(result.status, 0, result.stderr)
		assert.deepEqual(listBackups(dir), [], 'fresh install should not snapshot empty databases')
	})
})

test('init-db snapshots a legacy populated db before upgrading it', async () => {
	await withTempDir(dir => {
		// Pre-migrations install: main.db has tables + data but user_version 0.
		const legacy = new Database(join(dir, 'main.db'))
		legacy.exec('CREATE TABLE settings (id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT)')
		legacy.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('error_404_url', 'https://example.com/404')
		assert.equal(getUserVersion(legacy), 0)
		legacy.close()

		const result = spawnSync('node', [initDbEntry], {
			cwd: process.cwd(),
			env: { ...process.env, RELINKY_DB_DIR: dir },
			encoding: 'utf8'
		})
		assert.equal(result.status, 0, result.stderr)

		// Only the populated db (main) is snapshotted; the freshly-created ones are not.
		const mainBackups = listBackups(dir, 'main')
		assert.equal(mainBackups.length, 1, `expected one main backup, got ${mainBackups.join(', ')}`)
		assert.deepEqual(listBackups(dir, 'redirectables'), [])

		// The snapshot is the pre-upgrade state: version 0, original data intact.
		const snap = new Database(join(dir, 'backups', mainBackups[0]), { readonly: true })
		assert.equal(getUserVersion(snap), 0)
		const row = snap.prepare('SELECT value FROM settings WHERE key = ?').get('error_404_url')
		assert.equal(row?.value, 'https://example.com/404')
		snap.close()
	})
})

test('init-db takes no new backup when there is nothing to migrate', async () => {
	await withTempDir(dir => {
		const env = { ...process.env, RELINKY_DB_DIR: dir }
		const first = spawnSync('node', [initDbEntry], { cwd: process.cwd(), env, encoding: 'utf8' })
		assert.equal(first.status, 0, first.stderr)
		const before = listBackups(dir)
		const second = spawnSync('node', [initDbEntry], { cwd: process.cwd(), env, encoding: 'utf8' })
		assert.equal(second.status, 0, second.stderr)
		assert.deepEqual(listBackups(dir), before, 'second run should not create backups')
	})
})
