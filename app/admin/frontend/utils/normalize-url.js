/** Trim, fix common paste mistakes, add https:// when no scheme. Empty stays empty. */
export function cleanUrl(value) {
	if (value == null || value === '') return ''
	if (typeof value !== 'string') return ''
	let url = value.trim()
	if (!url) return ''

	url = url.replace(/^\/+/, '')

	url = url.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)+/g, match => {
		const protocolMatch = match.match(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)/)
		return protocolMatch ? protocolMatch[1] : match
	})

	url = url.replace(/^\/+/, '')

	if (!url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
		return `https://${url}`
	}

	return url
}

export function globalDefaultBool(defaults, key) {
	const v = defaults?.[key]
	return v === 'true' || v === true || v === 1
}
