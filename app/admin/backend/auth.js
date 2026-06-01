import { timingSafeEqual, randomBytes, randomUUID, scryptSync } from 'crypto'
import { sha512 } from 'sha512-crypt-ts'
import { getMainDb } from '../../shared/db.js'
import { ADMIN_PASSWORD_HASH_KEY, envPasswordPresent } from '../../shared/seed-admin-password.js'

// In-memory session store
const sessions = new Map()

const sha512Rounds = parseInt(process.env.ADMIN_PASSWORD_SHA512_ROUNDS || '5000', 10)

/** When true, log failed login attempts (never the password). */
export function isAdminLoginDebug() {
	const v = process.env.ADMIN_LOGIN_DEBUG
	return v === '1' || v === 'true' || v === 'yes'
}

export { envPasswordPresent }

const cryptAlphabet = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const apiKeyPrefix = 'rk_'

function randomSaltSpec() {
	let salt = ''
	for (const b of randomBytes(16)) {
		salt += cryptAlphabet[b % 64]
	}
	return `$6$rounds=${sha512Rounds}$${salt}`
}

export function getDbPasswordHash() {
	const db = getMainDb()
	try {
		const row = db.prepare('SELECT value FROM auth WHERE key = ?').get(ADMIN_PASSWORD_HASH_KEY)
		return row?.value || null
	} finally {
		db.close()
	}
}

export function setDbPasswordHash(hash) {
	const db = getMainDb()
	try {
		db.prepare('INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)').run(
			ADMIN_PASSWORD_HASH_KEY,
			hash
		)
	} finally {
		db.close()
	}
}

/** True when auth.admin_password_hash exists in the DB (login and onboarding gate). */
export function isInitialized() {
	return Boolean(getDbPasswordHash())
}

/**
 * First-visitor-wins: insert hash only if none exists. Returns true if this call claimed setup.
 */
export function tryClaimAdminPassword(hash) {
	const db = getMainDb()
	try {
		const claim = db.transaction(() => {
			const row = db.prepare('SELECT value FROM auth WHERE key = ?').get(ADMIN_PASSWORD_HASH_KEY)
			if (row?.value) {
				return false
			}
			db.prepare('INSERT INTO auth (key, value) VALUES (?, ?)').run(ADMIN_PASSWORD_HASH_KEY, hash)
			return true
		})
		return claim.immediate()
	} finally {
		db.close()
	}
}

/**
 * Produce a sha512-crypt ($6$) hash compatible with OpenSSL `passwd -6` and mkpasswd -m sha-512.
 */
export function hashPassword(password) {
	return sha512.crypt(password, randomSaltSpec())
}

export function verifyPassword(password, stored) {
	if (!stored || typeof stored !== 'string' || !stored.startsWith('$6$')) {
		return false
	}
	let computed
	try {
		computed = sha512.crypt(password, stored)
	} catch {
		return false
	}
	const a = Buffer.from(computed, 'utf8')
	const b = Buffer.from(stored, 'utf8')
	if (a.length !== b.length) {
		return false
	}
	return timingSafeEqual(a, b)
}

export function createSession() {
	const token = randomUUID()
	const expiresAt = Date.now() + (24 * 60 * 60 * 1000) // 24 hours
	sessions.set(token, { expiresAt })
	return token
}

export function validateSession(token) {
	const session = sessions.get(token)
	if (!session) return false
	if (session.expiresAt < Date.now()) {
		sessions.delete(token)
		return false
	}
	return true
}

export function deleteSession(token) {
	sessions.delete(token)
}

export function login(password) {
	const stored = getDbPasswordHash()
	if (!stored) {
		return { success: false, error: 'Admin not initialized' }
	}

	if (verifyPassword(password, stored)) {
		const token = createSession()
		return { success: true, token }
	}

	return { success: false, error: 'Invalid password' }
}

export function requireAuth(req) {
	const authHeader = req.headers.authorization || req.headers.Authorization
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null
	}

	const token = authHeader.substring(7).trim()
	if (!token || !validateSession(token)) {
		return null
	}

	return token
}

export function parseApiKeyFromRequest(req) {
	const authHeader = req.headers.authorization || req.headers.Authorization
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null
	}
	const token = authHeader.substring(7).trim()
	if (!token.startsWith(apiKeyPrefix)) {
		return null
	}
	const dot = token.indexOf('.')
	if (dot < 0) {
		return null
	}
	const keyId = token.slice(apiKeyPrefix.length, dot).trim()
	const secret = token.slice(dot + 1).trim()
	if (!keyId || !secret) {
		return null
	}
	return { keyId, secret, raw: token }
}

export function hashApiKeySecret(secret) {
	const salt = randomBytes(16).toString('base64url')
	const derived = scryptSync(secret, salt, 32).toString('base64url')
	return `scrypt$${salt}$${derived}`
}

export function verifyApiKeySecret(secret, storedHash) {
	if (!secret || !storedHash || typeof storedHash !== 'string') {
		return false
	}
	const parts = storedHash.split('$')
	if (parts.length !== 3 || parts[0] !== 'scrypt') {
		return false
	}
	const salt = parts[1]
	const expected = parts[2]
	const derived = scryptSync(secret, salt, 32).toString('base64url')
	const a = Buffer.from(derived, 'utf8')
	const b = Buffer.from(expected, 'utf8')
	if (a.length !== b.length) {
		return false
	}
	return timingSafeEqual(a, b)
}

export function generateApiKey() {
	const keyId = randomBytes(9).toString('base64url')
	const secret = randomBytes(24).toString('base64url')
	const token = `${apiKeyPrefix}${keyId}.${secret}`
	return {
		keyId,
		token,
		secretHash: hashApiKeySecret(secret)
	}
}
