import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations, getUserVersion, setUserVersion } from '../app/shared/migrate.js'

const initDbEntry = 'app/shared/init-db.js'

// Expected per-file schema version after running all known migrations. Bump these as
// new migrations are added in later phases.
const expectedVersions = {
	'main.db': 2,
	'redirectables.db': 1,
	'stats.db': 1,
	'logs.db': 1
}

function withTempDb(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'relinky-migrate-'))
	try {
		return fn(dir)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

function quiet() {
	return () => {}
}

test('runMigrations applies all pending migrations in order', () => {
	const db = new Database(':memory:')
	const applied = []
	const migrations = [
		{ name: 'one', up: d => { d.exec('CREATE TABLE a (id INTEGER)'); applied.push(1) } },
		{ name: 'two', up: d => { d.exec('CREATE TABLE b (id INTEGER)'); applied.push(2) } },
		{ name: 'three', up: d => { d.exec('CREATE TABLE c (id INTEGER)'); applied.push(3) } }
	]
	const version = runMigrations(db, migrations, { log: quiet() })
	assert.equal(version, 3)
	assert.deepEqual(applied, [1, 2, 3])
	const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name)
	assert.deepEqual(tables, ['a', 'b', 'c'])
	db.close()
})

test('runMigrations is idempotent on a second run', () => {
	const db = new Database(':memory:')
	const migrations = [
		{ name: 'one', up: d => d.exec('CREATE TABLE a (id INTEGER)') },
		{ name: 'two', up: d => d.exec('CREATE TABLE b (id INTEGER)') }
	]
	runMigrations(db, migrations, { log: quiet() })
	let secondRunApplied = false
	const guarded = migrations.map(m => ({ name: m.name, up: d => { secondRunApplied = true; m.up(d) } }))
	const version = runMigrations(db, guarded, { log: quiet() })
	assert.equal(version, 2)
	assert.equal(secondRunApplied, false)
	db.close()
})

test('runMigrations only applies migrations newer than current version', () => {
	const db = new Database(':memory:')
	db.exec('CREATE TABLE a (id INTEGER)')
	setUserVersion(db, 1)
	const applied = []
	const migrations = [
		{ name: 'one', up: () => applied.push(1) },
		{ name: 'two', up: d => { d.exec('CREATE TABLE b (id INTEGER)'); applied.push(2) } },
		{ name: 'three', up: d => { d.exec('CREATE TABLE c (id INTEGER)'); applied.push(3) } }
	]
	const version = runMigrations(db, migrations, { log: quiet() })
	assert.equal(version, 3)
	assert.deepEqual(applied, [2, 3])
	db.close()
})

test('a throwing migration rolls back its changes and leaves the version untouched', () => {
	const db = new Database(':memory:')
	const migrations = [
		{ name: 'one', up: d => d.exec('CREATE TABLE a (id INTEGER)') },
		{
			name: 'two-fails',
			up: d => {
				d.exec('CREATE TABLE b (id INTEGER)')
				throw new Error('boom')
			}
		}
	]
	assert.throws(() => runMigrations(db, migrations, { log: quiet() }), /boom/)
	assert.equal(getUserVersion(db), 1)
	const hasB = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='b'").get()
	assert.equal(hasB, undefined)
	db.close()
})

test('runMigrations refuses to run against a newer database (downgrade guard)', () => {
	const db = new Database(':memory:')
	setUserVersion(db, 5)
	const migrations = [{ name: 'one', up: () => {} }]
	assert.throws(() => runMigrations(db, migrations, { log: quiet() }), /downgrade/)
	db.close()
})

test('init-db.js stamps every database to the expected version', () => {
	withTempDb(dir => {
		const result = spawnSync('node', [initDbEntry], {
			cwd: process.cwd(),
			env: { ...process.env, RELINKY_DB_DIR: dir },
			encoding: 'utf8'
		})
		assert.equal(result.status, 0, result.stderr)
		for (const [file, version] of Object.entries(expectedVersions)) {
			const db = new Database(join(dir, file))
			assert.equal(getUserVersion(db), version, `${file} user_version`)
			db.close()
		}
	})
})

test('init-db.js is a no-op on a second run', () => {
	withTempDb(dir => {
		const env = { ...process.env, RELINKY_DB_DIR: dir }
		const first = spawnSync('node', [initDbEntry], { cwd: process.cwd(), env, encoding: 'utf8' })
		assert.equal(first.status, 0, first.stderr)
		const second = spawnSync('node', [initDbEntry], { cwd: process.cwd(), env, encoding: 'utf8' })
		assert.equal(second.status, 0, second.stderr)
		// Baseline already applied: the second run must not re-apply any migration.
		assert.ok(!second.stdout.includes('applied v'), `unexpected migration on second run:\n${second.stdout}`)
	})
})

test('a legacy database at version 0 converges without data loss', () => {
	withTempDb(dir => {
		// Simulate a pre-migrations install: baseline tables exist, user_version still 0.
		const legacy = new Database(join(dir, 'main.db'))
		legacy.exec(`
			CREATE TABLE settings (id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT);
			CREATE TABLE defaults (id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT);
		`)
		legacy.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('error_404_url', 'https://example.com/404')
		assert.equal(getUserVersion(legacy), 0)
		legacy.close()

		const result = spawnSync('node', [initDbEntry], {
			cwd: process.cwd(),
			env: { ...process.env, RELINKY_DB_DIR: dir },
			encoding: 'utf8'
		})
		assert.equal(result.status, 0, result.stderr)

		const db = new Database(join(dir, 'main.db'))
		assert.equal(getUserVersion(db), expectedVersions['main.db'])
		const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('error_404_url')
		assert.equal(row?.value, 'https://example.com/404')
		// api_keys is part of the baseline and must now exist on the upgraded legacy db.
		const hasApiKeys = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'").get()
		assert.ok(hasApiKeys)
		db.close()
	})
})
