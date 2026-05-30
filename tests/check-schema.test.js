import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

// db.js resolves the db dir once at import, so each scenario runs in its own process with
// its own RELINKY_DB_DIR. This helper imports check-schema and calls assertSchemaCurrent,
// printing a sentinel on success and exiting non-zero (with the thrown message) on failure.
const checkScript =
	"import('./app/shared/check-schema.js')" +
	'.then(m => { m.assertSchemaCurrent(); console.log("SCHEMA_OK") })' +
	'.catch(e => { console.error(e.message); process.exit(7) })'

function runCheck(dir) {
	return spawnSync('node', ['--input-type=module', '-e', checkScript], {
		cwd: process.cwd(),
		env: { ...process.env, RELINKY_DB_DIR: dir },
		encoding: 'utf8'
	})
}

function migrate(dir) {
	const r = spawnSync('node', ['app/shared/init-db.js'], {
		cwd: process.cwd(),
		env: { ...process.env, RELINKY_DB_DIR: dir },
		encoding: 'utf8'
	})
	assert.equal(r.status, 0, r.stderr)
}

function withTempDir(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'relinky-check-'))
	try {
		return fn(dir)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

test('assertSchemaCurrent passes after migrations have run', () => {
	withTempDir(dir => {
		migrate(dir)
		const r = runCheck(dir)
		assert.equal(r.status, 0, r.stderr)
		assert.match(r.stdout, /SCHEMA_OK/)
	})
})

test('assertSchemaCurrent fails fast when the schema has not been migrated', () => {
	withTempDir(dir => {
		const r = runCheck(dir)
		assert.equal(r.status, 7, `expected failure exit, stdout=${r.stdout} stderr=${r.stderr}`)
		assert.match(r.stderr, /behind/)
	})
})

test('assertSchemaCurrent fails when a database is ahead of the service', () => {
	withTempDir(dir => {
		migrate(dir)
		// Simulate a service binary older than the data: bump one db past the known count.
		const db = new Database(join(dir, 'main.db'))
		db.exec('PRAGMA user_version = 99')
		db.close()
		const r = runCheck(dir)
		assert.equal(r.status, 7, `expected failure exit, stdout=${r.stdout} stderr=${r.stderr}`)
		assert.match(r.stderr, /ahead/)
	})
})
