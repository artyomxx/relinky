/** Legacy names already warned this process (one stderr line per var). */
const warnedLegacy = new Set()

/**
 * Prefer RELINKY_* when defined; else fall back to a legacy name with a one-time warning.
 * "Present" means `!== undefined` (empty string counts as set).
 *
 * @param {string} name - Preferred env key (e.g. RELINKY_ADMIN_PORT)
 * @param {string} [legacyName] - Deprecated key (e.g. ADMIN_PORT)
 * @returns {string|undefined}
 */
export function envPrefixed(name, legacyName) {
	if (Object.prototype.hasOwnProperty.call(process.env, name)) {
		return process.env[name]
	}
	if (legacyName && Object.prototype.hasOwnProperty.call(process.env, legacyName)) {
		if (!warnedLegacy.has(legacyName)) {
			warnedLegacy.add(legacyName)
			console.error(`relinky: ${legacyName} is deprecated; use ${name}`)
		}
		return process.env[legacyName]
	}
	return undefined
}
