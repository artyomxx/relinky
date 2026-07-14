import { test } from 'node:test'
import assert from 'node:assert/strict'
import { envPrefixed } from '../app/shared/env.js'

test('envPrefixed prefers RELINKY_* when both are set', () => {
	process.env.RELINKY_ENV_TEST_PREF = 'new'
	process.env.ENV_TEST_PREF = 'old'
	assert.equal(envPrefixed('RELINKY_ENV_TEST_PREF', 'ENV_TEST_PREF'), 'new')
	delete process.env.RELINKY_ENV_TEST_PREF
	delete process.env.ENV_TEST_PREF
})

test('envPrefixed falls back to legacy and warns once', () => {
	delete process.env.RELINKY_ENV_TEST_LEGACY
	process.env.ENV_TEST_LEGACY = 'legacy-value'
	const errors = []
	const orig = console.error
	console.error = (...args) => errors.push(args.join(' '))
	try {
		assert.equal(envPrefixed('RELINKY_ENV_TEST_LEGACY', 'ENV_TEST_LEGACY'), 'legacy-value')
		assert.equal(envPrefixed('RELINKY_ENV_TEST_LEGACY', 'ENV_TEST_LEGACY'), 'legacy-value')
	} finally {
		console.error = orig
		delete process.env.ENV_TEST_LEGACY
	}
	assert.equal(errors.length, 1)
	assert.match(errors[0], /ENV_TEST_LEGACY is deprecated; use RELINKY_ENV_TEST_LEGACY/)
})

test('envPrefixed returns undefined when neither is set', () => {
	delete process.env.RELINKY_ENV_TEST_MISSING
	delete process.env.ENV_TEST_MISSING
	assert.equal(envPrefixed('RELINKY_ENV_TEST_MISSING', 'ENV_TEST_MISSING'), undefined)
})
