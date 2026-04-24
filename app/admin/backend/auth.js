import { timingSafeEqual, randomBytes, randomUUID, scryptSync } from 'crypto'
import { sha512 } from 'sha512-crypt-ts'

// In-memory session store
const sessions = new Map()

const sha512Rounds = parseInt(process.env.ADMIN_PASSWORD_SHA512_ROUNDS || '5000', 10)

/**
 * Coolify and some hosts corrupt `$` in environment values (even "Literal").
 * Use ADMIN_PASSWORD_HASH_B64 (base64 of the utf8 `$6$…` string) when raw hash fails.
 */
function resolvePasswordHash() {
	const b64Only = process.env.ADMIN_PASSWORD_HASH_B64?.trim()
	if (b64Only) {
		try {
			const s = Buffer.from(b64Only, 'base64').toString('utf8').trim()
			return s || null
		} catch {
			return null
		}
	}
	const raw = process.env.ADMIN_PASSWORD_HASH?.trim()
	return raw || null
}

const passwordHash = resolvePasswordHash()

/** When true, log failed login attempts (never the password) and hash presence at startup. */
export function isAdminLoginDebug() {
	const v = process.env.ADMIN_LOGIN_DEBUG
	return v === '1' || v === 'true' || v === 'yes'
}

if (isAdminLoginDebug()) {
	let src = '(none)'
	if (process.env.ADMIN_PASSWORD_HASH_B64?.trim()) {
		src = 'ADMIN_PASSWORD_HASH_B64'
	} else if (process.env.ADMIN_PASSWORD_HASH?.trim()) {
		src = 'ADMIN_PASSWORD_HASH'
	}
	if (passwordHash) {
		console.log(
			'[Auth] DEBUG: hash from %s, length=%d, startsWith$6$=%s',
			src,
			passwordHash.length,
			String(passwordHash.startsWith('$6$'))
		)
	} else {
		console.log('[Auth] DEBUG: no resolved hash (set ADMIN_PASSWORD_HASH or ADMIN_PASSWORD_HASH_B64)')
	}
}

if (!passwordHash) {
	console.warn(
		'[Auth] WARNING: Set ADMIN_PASSWORD_HASH or ADMIN_PASSWORD_HASH_B64 (base64 of the $6$ hash). ' +
			'Admin login will not work.'
	)
} else if (!passwordHash.startsWith('$6$')) {
	console.warn(
		'[Auth] Resolved password hash does not start with $6$ (sha512-crypt). ' +
			'If you use Coolify, set ADMIN_PASSWORD_HASH_B64 to the base64 of your hash ' +
			'(see npm run hash-password -- --b64 or readme).'
	)
}

const cryptAlphabet = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const apiKeyPrefix = 'rk_'

function randomSaltSpec() {
	let salt = ''
	for (const b of randomBytes(16)) {
		salt += cryptAlphabet[b % 64]
	}
	return `$6$rounds=${sha512Rounds}$${salt}`
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
	if (!passwordHash) {
		return { success: false, error: 'Admin password not configured' }
	}

	if (verifyPassword(password, passwordHash)) {
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
