/** Get or create expired_urls row id for a URL string. */

export function resolveExpiredUrlId(db, url) {
	const trimmed = typeof url === 'string' ? url.trim() : ''
	if (!trimmed) {
		return null
	}
	const existing = db.prepare('SELECT id FROM expired_urls WHERE url = ?').get(trimmed)
	if (existing) {
		return existing.id
	}
	const result = db.prepare('INSERT INTO expired_urls (url) VALUES (?)').run(trimmed)
	return result.lastInsertRowid
}
