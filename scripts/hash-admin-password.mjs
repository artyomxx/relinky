#!/usr/bin/env node
/**
 * Print a sha512-crypt ($6$) line for ADMIN_PASSWORD_HASH.
 * Same format as: openssl passwd -6
 *
 * Usage: node scripts/hash-admin-password.mjs <plaintext-password> [--b64]
 * Rounds: ADMIN_PASSWORD_SHA512_ROUNDS (default 5000)
 *
 * --b64: also print a base64 line for ADMIN_PASSWORD_HASH_B64 (Coolify-safe, no $ characters).
 */
import { randomBytes } from 'crypto'
import { sha512 } from 'sha512-crypt-ts'

const argv = process.argv.slice(2)
const printB64 = argv.includes('--b64')
const pwd = argv.find(a => a !== '--b64')
if (!pwd) {
	console.error('Usage: node scripts/hash-admin-password.mjs <plaintext-password> [--b64]')
	process.exit(1)
}

const rounds = parseInt(process.env.ADMIN_PASSWORD_SHA512_ROUNDS || '5000', 10)
const alphabet = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
let salt = ''
for (const b of randomBytes(16)) {
	salt += alphabet[b % 64]
}
const spec = `$6$rounds=${rounds}$${salt}`
const hashLine = sha512.crypt(pwd, spec)
console.log(hashLine)
if (printB64) {
	console.error('')
	console.error('ADMIN_PASSWORD_HASH_B64 (paste into Coolify as Literal; no $ in this value):')
	console.log(Buffer.from(hashLine, 'utf8').toString('base64'))
}
