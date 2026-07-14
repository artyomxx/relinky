import { getMainDb } from './db.js'
import { envPrefixed } from './env.js'

export const ADMIN_PASSWORD_HASH_KEY = 'admin_password_hash'

/**
 * Coolify and some hosts corrupt `$` in environment values (even "Literal").
 * Use RELINKY_ADMIN_PASSWORD_HASH_B64 (base64 of the utf8 `$6$…` string) when raw hash fails.
 */
export function resolveEnvPasswordHash() {
	const b64Only = envPrefixed('RELINKY_ADMIN_PASSWORD_HASH_B64', 'ADMIN_PASSWORD_HASH_B64')?.trim()
	if (b64Only) {
		try {
			const s = Buffer.from(b64Only, 'base64').toString('utf8').trim()
			return s || null
		} catch {
			return null
		}
	}
	const raw = envPrefixed('RELINKY_ADMIN_PASSWORD_HASH', 'ADMIN_PASSWORD_HASH')?.trim()
	return raw || null
}

/** True when an env hash is configured (for change-password UX only; login never reads env). */
export function envPasswordPresent() {
	return resolveEnvPasswordHash() !== null
}

/**
 * If RELINKY_ADMIN_PASSWORD_HASH / _B64 is set, overwrite the DB hash. Called by the migrator on
 * every startup so env remains authoritative while present.
 */
export function seedAdminPasswordFromEnv() {
	const hash = resolveEnvPasswordHash()
	if (!hash) return false

	const b64Set =
		Object.prototype.hasOwnProperty.call(process.env, 'RELINKY_ADMIN_PASSWORD_HASH_B64') ||
		Object.prototype.hasOwnProperty.call(process.env, 'ADMIN_PASSWORD_HASH_B64')
	const src = b64Set && envPrefixed('RELINKY_ADMIN_PASSWORD_HASH_B64', 'ADMIN_PASSWORD_HASH_B64')?.trim()
		? 'RELINKY_ADMIN_PASSWORD_HASH_B64'
		: 'RELINKY_ADMIN_PASSWORD_HASH'

	if (!hash.startsWith('$6$')) {
		console.warn(
			'[Auth] Env password hash does not start with $6$ (sha512-crypt). ' +
				'If you use Coolify, set RELINKY_ADMIN_PASSWORD_HASH_B64 to the base64 of your hash ' +
				'(see npm run hash-password -- --b64 or readme).'
		)
	}

	const db = getMainDb()
	try {
		db.prepare('INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)').run(
			ADMIN_PASSWORD_HASH_KEY,
			hash
		)
	} finally {
		db.close()
	}

	console.log(`[Auth] Admin password hash seeded from ${src} into auth table`)
	return true
}
