/** Tri-state and URL resolution: link → domain → global. Used by redirector. */

export function globalBool(defaults, key) {
	const v = defaults?.[key]
	return v === 'true' || v === true || v === 1
}

export function resolveKeepReferrer(linkVal, domainVal, globalDefaults) {
	if (linkVal !== null && linkVal !== undefined) {
		return linkVal === 1
	}
	if (domainVal !== null && domainVal !== undefined) {
		return domainVal === 1
	}
	return globalBool(globalDefaults, 'keep_referrer')
}

export function resolveKeepQueryParams(linkVal, domainVal, globalDefaults) {
	if (linkVal !== null && linkVal !== undefined) {
		return linkVal === 1
	}
	if (domainVal !== null && domainVal !== undefined) {
		return domainVal === 1
	}
	return globalBool(globalDefaults, 'keep_query_params')
}

export function resolveRedirectCode(linkVal, domainVal, globalDefaults) {
	if (linkVal !== null && linkVal !== undefined) {
		return parseInt(linkVal, 10) || 303
	}
	if (domainVal !== null && domainVal !== undefined) {
		return parseInt(domainVal, 10) || 303
	}
	return parseInt(globalDefaults?.redirect_code, 10) || 303
}

export function resolveExpiredUrl(linkExpiredUrl, domainExpiredUrl, globalExpiredUrl) {
	if (linkExpiredUrl) {
		return linkExpiredUrl
	}
	if (domainExpiredUrl) {
		return domainExpiredUrl
	}
	return globalExpiredUrl || null
}

export function resolveErrorUrl(statusCode, domainOverrides, globalSettings) {
	const domainKey = statusCode === 404 ? 'error_404_url' : 'error_500_url'
	const domainUrl = domainOverrides?.[domainKey]
	if (domainUrl) {
		return domainUrl
	}
	return globalSettings?.[domainKey] || null
}
