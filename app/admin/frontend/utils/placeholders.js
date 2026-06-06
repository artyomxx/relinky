/** Client-side inherit placeholders: domain override then global. */

import { globalDefaultBool } from './normalize-url.js'

const LINK_INHERIT_LABEL = 'domain default'

function inheritSource(overrides, key) {
	if (overrides?.[key] !== null && overrides?.[key] !== undefined) {
		return 'domain'
	}
	return 'global'
}

function inheritSourceUrl(overrides, key) {
	if (overrides?.[key] != null && overrides[key] !== '') {
		return 'domain'
	}
	return 'global'
}

function resolvedExpiredUrl(overrides, defaults) {
	const url = inheritSourceUrl(overrides, 'expired_url') === 'domain'
		? overrides.expired_url
		: (defaults?.expired_url || '')
	return { url }
}

function linkInheritPlaceholder(value) {
	if (value != null && String(value).trim() !== '') {
		return `${String(value).trim()} (${LINK_INHERIT_LABEL})`
	}
	return LINK_INHERIT_LABEL
}

function resolvedRedirectCode(overrides, defaults) {
	const code = inheritSource(overrides, 'redirect_code') === 'domain'
		? overrides.redirect_code
		: (defaults?.redirect_code || '303')
	return String(code)
}

function resolvedBool(overrides, defaults, key) {
	return inheritSource(overrides, key) === 'domain'
		? overrides[key]
		: globalDefaultBool(defaults, key)
}

export function placeholderExpiredUrlForLink(overrides, defaults) {
	return linkInheritPlaceholder(resolvedExpiredUrl(overrides, defaults).url)
}

export function linkRedirectCodeDefault(overrides, defaults) {
	return resolvedRedirectCode(overrides, defaults)
}

export function inheritBoolHint(overrides, defaults, key) {
	return resolvedBool(overrides, defaults, key) ? 'On' : 'Off'
}

export function globalOnlyPlaceholder(value) {
	if (value != null && String(value).trim() !== '') {
		return `${String(value).trim()} (global default)`
	}
	return 'global default'
}

export function globalBoolHint(defaults, key) {
	return globalDefaultBool(defaults, key) ? 'On' : 'Off'
}
