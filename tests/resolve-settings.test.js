import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	globalBool,
	resolveKeepReferrer,
	resolveKeepQueryParams,
	resolveRedirectCode,
	resolveExpiredUrl,
	resolveErrorUrl
} from '../app/shared/resolve-settings.js'

const globalDefaults = {
	keep_referrer: 'true',
	keep_query_params: 'false',
	redirect_code: '307',
	expired_url: 'https://global.example/expired'
}

const globalSettings = {
	error_404_url: 'https://global.example/404',
	error_500_url: 'https://global.example/500'
}

test('globalBool accepts string, boolean, and numeric true', () => {
	assert.equal(globalBool({ keep_referrer: 'true' }, 'keep_referrer'), true)
	assert.equal(globalBool({ keep_referrer: true }, 'keep_referrer'), true)
	assert.equal(globalBool({ keep_referrer: 1 }, 'keep_referrer'), true)
	assert.equal(globalBool({ keep_referrer: 'false' }, 'keep_referrer'), false)
})

test('resolveRedirectCode: link → domain → global', () => {
	assert.equal(resolveRedirectCode(301, 302, globalDefaults), 301)
	assert.equal(resolveRedirectCode(null, 302, globalDefaults), 302)
	assert.equal(resolveRedirectCode(null, null, globalDefaults), 307)
	assert.equal(resolveRedirectCode(undefined, undefined, {}), 303)
})

test('resolveKeepReferrer: link → domain → global', () => {
	assert.equal(resolveKeepReferrer(1, 0, globalDefaults), true)
	assert.equal(resolveKeepReferrer(null, 1, { keep_referrer: 'false' }), true)
	assert.equal(resolveKeepReferrer(null, null, globalDefaults), true)
	assert.equal(resolveKeepReferrer(null, null, { keep_referrer: 'false' }), false)
})

test('resolveKeepQueryParams: link → domain → global', () => {
	assert.equal(resolveKeepQueryParams(0, 1, globalDefaults), false)
	assert.equal(resolveKeepQueryParams(null, 0, { keep_query_params: 'true' }), false)
	assert.equal(resolveKeepQueryParams(null, null, globalDefaults), false)
	assert.equal(resolveKeepQueryParams(null, null, { keep_query_params: 'true' }), true)
})

test('resolveExpiredUrl: link → domain → global', () => {
	assert.equal(resolveExpiredUrl('https://link.example/x', 'https://domain.example/x', globalDefaults.expired_url), 'https://link.example/x')
	assert.equal(resolveExpiredUrl('', 'https://domain.example/x', globalDefaults.expired_url), 'https://domain.example/x')
	assert.equal(resolveExpiredUrl(null, null, globalDefaults.expired_url), 'https://global.example/expired')
	assert.equal(resolveExpiredUrl(null, null, ''), null)
})

test('resolveErrorUrl: domain override then global settings', () => {
	const domainOverrides = { error_404_url: 'https://domain.example/404' }
	assert.equal(resolveErrorUrl(404, domainOverrides, globalSettings), 'https://domain.example/404')
	assert.equal(resolveErrorUrl(404, {}, globalSettings), 'https://global.example/404')
	assert.equal(resolveErrorUrl(500, { error_500_url: 'https://domain.example/500' }, globalSettings), 'https://domain.example/500')
	assert.equal(resolveErrorUrl(500, {}, globalSettings), 'https://global.example/500')
	assert.equal(resolveErrorUrl(404, {}, {}), null)
})
