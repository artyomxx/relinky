import { getRedirectablesDb, getStatsDb, getLogsDb, getMainDb } from '../../shared/db.js'
import { scheduleGatewayReload } from '../../shared/gateway-reload.js'
import UAParser from 'ua-parser-js'
import { BlockList, isIP } from 'net'

function sendJson(res, statusCode, data) {
	res.writeHead(statusCode, { 'Content-Type': 'application/json' })
	res.end(JSON.stringify(data))
}

function parseBody(req) {
	return new Promise((resolve, reject) => {
		let body = ''
		req.on('data', chunk => {
			body += chunk.toString()
		})
		req.on('end', () => {
			try {
				resolve(body ? JSON.parse(body) : {})
			} catch (err) {
				reject(err)
			}
		})
		req.on('error', reject)
	})
}

function getClientInfo(req) {
	const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
		req.headers['x-real-ip'] ||
		req.socket.remoteAddress ||
		''
	const ip = rawIp.startsWith('::ffff:') && isIP(rawIp.slice(7)) === 4
		? rawIp.slice(7)
		: rawIp
	return {
		ip,
		userAgent: req.headers['user-agent'] || ''
	}
}

function parseAllowedIps(value) {
	if (!value) return []
	if (Array.isArray(value)) {
		return value.map(v => String(v || '').trim()).filter(Boolean)
	}
	if (typeof value === 'string') {
		return value
			.split(',')
			.map(v => v.trim())
			.filter(Boolean)
	}
	return []
}

function parseStoredAllowedIps(value) {
	if (!value) return []
	try {
		return parseAllowedIps(JSON.parse(value))
	} catch {
		return []
	}
}

function validateAllowedIps(entries) {
	const valid = []
	const invalid = []
	for (const entry of parseAllowedIps(entries)) {
		if (entry.includes('/')) {
			const [addrRaw, prefixRaw] = entry.split('/')
			const addr = String(addrRaw || '').trim()
			const prefix = parseInt(prefixRaw, 10)
			const version = isIP(addr)
			if (!version) {
				invalid.push(entry)
				continue
			}
			const max = version === 4 ? 32 : 128
			if (isNaN(prefix) || prefix < 0 || prefix > max) {
				invalid.push(entry)
				continue
			}
			valid.push(`${addr}/${prefix}`)
			continue
		}
		if (!isIP(entry)) {
			invalid.push(entry)
			continue
		}
		valid.push(entry)
	}
	return { valid, invalid }
}

function isClientIpAllowed(clientIp, allowedIps) {
	const entries = parseAllowedIps(allowedIps)
	if (entries.length === 0) return true
	const normalized = clientIp?.trim()
	if (!normalized) return false
	const ipVersion = isIP(normalized)
	if (!ipVersion) return false
	const list = new BlockList()
	for (const entry of entries) {
		try {
			if (entry.includes('/')) {
				const [addr, prefixRaw] = entry.split('/')
				const version = isIP(addr)
				if (!version) continue
				list.addSubnet(addr, parseInt(prefixRaw, 10), version === 4 ? 'ipv4' : 'ipv6')
			} else {
				const version = isIP(entry)
				if (!version) continue
				list.addAddress(entry, version === 4 ? 'ipv4' : 'ipv6')
			}
		} catch {
			// Ignore malformed stored entries.
		}
	}
	return list.check(normalized, ipVersion === 4 ? 'ipv4' : 'ipv6')
}

function toApiKeyResponse(row) {
	return {
		id: row.id,
		name: row.name,
		key_id: row.key_id,
		enabled: row.enabled === 1,
		allowed_ips: parseStoredAllowedIps(row.allowed_ips_json),
		created: row.created,
		changed: row.changed,
		last_used_at: row.last_used_at || null,
		last_used_ip: row.last_used_ip || null
	}
}

function requireApiKey(req, res, auth) {
	const parsed = auth.parseApiKeyFromRequest(req)
	if (!parsed) {
		sendJson(res, 401, { error: 'Missing or invalid API key' })
		return null
	}
	const db = getMainDb()
	const stmt = db.prepare('SELECT * FROM api_keys WHERE key_id = ?')
	const row = stmt.get(parsed.keyId)
	if (!row || row.enabled !== 1 || !auth.verifyApiKeySecret(parsed.secret, row.secret_hash)) {
		db.close()
		sendJson(res, 401, { error: 'Invalid API key' })
		return null
	}
	const clientInfo = getClientInfo(req)
	const allowedIps = parseStoredAllowedIps(row.allowed_ips_json)
	if (!isClientIpAllowed(clientInfo.ip, allowedIps)) {
		db.close()
		sendJson(res, 403, { error: 'Source IP is not allowed for this API key' })
		return null
	}
	const now = Date.now()
	const touchStmt = db.prepare('UPDATE api_keys SET last_used_at = ?, last_used_ip = ?, changed = ? WHERE id = ?')
	touchStmt.run(now, clientInfo.ip || null, now, row.id)
	db.close()
	return { apiKey: toApiKeyResponse(row), clientInfo }
}

// Calculate diff between old and new values
function calculateDiff(oldData, newData, propertyMap = {}) {
	const diff = []
	
	for (const [key, displayName] of Object.entries(propertyMap)) {
		const oldValue = oldData[key]
		const newValue = newData[key]
		
		// Only include in diff if value actually changed
		if (oldValue !== newValue && (oldValue !== undefined || newValue !== undefined)) {
			diff.push({
				what: displayName || key,
				before: oldValue !== undefined && oldValue !== null ? String(oldValue) : '',
				after: newValue !== undefined && newValue !== null ? String(newValue) : ''
			})
		}
	}
	
	return diff.length > 0 ? diff : null
}

function logAction(db, table, action, itemId, clientInfo, diff = null) {
	const diffJson = diff ? JSON.stringify(diff) : null
	
	if (table === 'main_logs') {
		// main_logs doesn't have item_id column, but now has diff
		const stmt = db.prepare(`
			INSERT INTO ${table} (ip_address, browser_agent_string, timestamp, action, diff)
			VALUES (?, ?, ?, ?, ?)
		`)
		stmt.run(
			clientInfo.ip,
			clientInfo.userAgent,
			Date.now(),
			action,
			diffJson
		)
	} else {
		const stmt = db.prepare(`
			INSERT INTO ${table} (ip_address, browser_agent_string, timestamp, action, item_id, diff)
			VALUES (?, ?, ?, ?, ?, ?)
		`)
		stmt.run(
			clientInfo.ip,
			clientInfo.userAgent,
			Date.now(),
			action,
			itemId || null,
			diffJson
		)
	}
}

// Auth endpoints
export function setupAuthRoutes(router, auth) {
	router.post('/api/auth/login', async (req, res) => {
		try {
			const body = await parseBody(req)
			const pwd = body?.password
			const result = auth.login(pwd)
			if (result.success) {
				if (auth.isAdminLoginDebug()) {
					const info = getClientInfo(req)
					console.log('[Auth] DEBUG login ok ip=%s', info.ip || '(unknown)')
				}
				sendJson(res, 200, { token: result.token })
			} else {
				if (auth.isAdminLoginDebug()) {
					const info = getClientInfo(req)
					const field =
						pwd === undefined ? 'password_missing' : pwd === '' ? 'password_empty' : 'password_non_empty'
					console.warn(
						'[Auth] DEBUG login failed: %s ip=%s %s ua=%s',
						result.error,
						info.ip || '(unknown)',
						field,
						(info.userAgent || '').slice(0, 120)
					)
				}
				sendJson(res, 401, { error: result.error })
			}
		} catch (err) {
			if (auth.isAdminLoginDebug()) {
				const info = getClientInfo(req)
				console.warn('[Auth] DEBUG login body parse error: %s ip=%s', err.message, info.ip || '(unknown)')
			}
			sendJson(res, 400, { error: 'Invalid request' })
		}
	})

	router.post('/api/auth/logout', (req, res) => {
		const token = auth.requireAuth(req)
		if (token) {
			auth.deleteSession(token)
		}
		sendJson(res, 200, { success: true })
	})

	router.get('/api/auth/check', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}
		sendJson(res, 200, { authenticated: true })
	})
}

// Links endpoints
export function setupLinkRoutes(router, auth) {
	function parseShortUrlParts(value) {
		if (typeof value !== 'string') return { domain: '', slug: '' }
		const noProto = value.trim().replace(/^https?:\/\//, '')
		const slashIdx = noProto.indexOf('/')
		if (slashIdx < 0) return { domain: noProto, slug: '' }
		return { domain: noProto.slice(0, slashIdx), slug: noProto.slice(slashIdx + 1) }
	}

	function normalizeRelinkyRow(link) {
		return {
			...link,
			domain: typeof link.domain === 'string' ? link.domain.trim() : '',
			slug: typeof link.slug === 'string' ? link.slug.trim() : '',
			url: typeof link.url === 'string' ? link.url.trim() : '',
			created: link.created || null,
			expire: link.expire || null
		}
	}

	function normalizeRebrandlyRow(link) {
		const short = parseShortUrlParts(link.shortUrl)
		return {
			...link,
			domain:
				(typeof link.domainName === 'string' && link.domainName.trim()) ||
				(typeof link.domain?.fullName === 'string' && link.domain.fullName.trim()) ||
				short.domain ||
				'',
			slug:
				(typeof link.slashtag === 'string' && link.slashtag.trim()) ||
				short.slug ||
				'',
			url: typeof link.destination === 'string' ? link.destination.trim() : '',
			created: link.createdAt || null,
			expire: link.expiredAt || null
		}
	}

	function normalizeKuttRow(link) {
		const short = parseShortUrlParts(link.shortUrl || link.link)
		return {
			...link,
			domain:
				(typeof link.domain === 'string' && link.domain.trim()) ||
				(typeof link.domainName === 'string' && link.domainName.trim()) ||
				short.domain ||
				'',
			slug:
				(typeof link.slug === 'string' && link.slug.trim()) ||
				(typeof link.address === 'string' && link.address.trim()) ||
				short.slug ||
				'',
			url:
				(typeof link.target === 'string' && link.target.trim()) ||
				(typeof link.url === 'string' && link.url.trim()) ||
				'',
			created: link.createdAt || link.created_at || null,
			expire: link.expire || link.expiredAt || link.expired_at || null
		}
	}

	function parseImportLinks(links, importType = 'relinky') {
		const type = typeof importType === 'string' ? importType : 'relinky'
		let normalize
		if (type === 'relinky') normalize = normalizeRelinkyRow
		else if (type === 'rebrandly') normalize = normalizeRebrandlyRow
		else if (type === 'kutt') normalize = normalizeKuttRow
		else {
			const err = new Error(`Unsupported import type: ${importType}`)
			err.statusCode = 400
			throw err
		}

		const normalizedLinks = []
		let corruptedRows = 0
		for (const row of links) {
			const normalized = normalize(row || {})
			if (!normalized.domain || !normalized.slug || !normalized.url) {
				corruptedRows++
				continue
			}
			normalizedLinks.push(normalized)
		}
		return { normalizedLinks, corruptedRows, importType: type }
	}

	// Get links with pagination
	router.get('/api/links', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const url = new URL(req.url, 'http://localhost')
		const page = parseInt(url.searchParams.get('page') || '1')
		const limit = parseInt(url.searchParams.get('limit') || '100')
		const offset = (page - 1) * limit
		const search = url.searchParams.get('search') || ''

		const db = getRedirectablesDb()
		const statsDb = getStatsDb()

		let query = `
			SELECT 
				l.id,
				l.domain_id,
				l.slug,
				l.url_id,
				l.expired_url_id,
				l.keep_referrer,
				l.keep_query_params,
				l.redirect_code,
				l.created,
				l.changed,
				l.expire,
				l.comment,
				d.domain,
				ru.url,
				eu.url AS expired_url
			FROM links l
			JOIN domains d ON l.domain_id = d.id
			JOIN redirect_urls ru ON l.url_id = ru.id
			LEFT JOIN expired_urls eu ON l.expired_url_id = eu.id
		`

		const params = []
		if (search) {
			query += ' WHERE l.slug LIKE ? OR ru.url LIKE ? OR d.domain LIKE ?'
			params.push(`%${search}%`, `%${search}%`, `%${search}%`)
		}

		query += ' ORDER BY l.created DESC LIMIT ? OFFSET ?'
		params.push(limit, offset)

		const stmt = db.prepare(query)
		const links = stmt.all(...params)

		// Get click counts from stats database in a single query
		const clickCounts = new Map()
		if (links.length > 0) {
			const linkIds = links.map(l => l.id)
			const placeholders = linkIds.map(() => '?').join(',')
			const clickCountStmt = statsDb.prepare(`
				SELECT link_id, COUNT(*) as count 
				FROM redirects 
				WHERE link_id IN (${placeholders})
				GROUP BY link_id
			`)
			const clickCountResults = clickCountStmt.all(...linkIds)
			for (const result of clickCountResults) {
				clickCounts.set(result.link_id, result.count)
			}
		}

		// Get total count
		let countQuery = 'SELECT COUNT(*) as total FROM links l JOIN redirect_urls ru ON l.url_id = ru.id JOIN domains d ON l.domain_id = d.id'
		if (search) {
			countQuery += ' WHERE l.slug LIKE ? OR ru.url LIKE ? OR d.domain LIKE ?'
		}
		const countStmt = db.prepare(countQuery)
		const total = countStmt.get(...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])).total

		db.close()
		statsDb.close()

		sendJson(res, 200, {
			links: links.map(link => ({
				id: link.id,
				domain_id: link.domain_id,
				domain: link.domain,
				slug: link.slug,
				url: link.url,
				expired_url: link.expired_url,
				keep_referrer: link.keep_referrer === 1,
				keep_query_params: link.keep_query_params === 1,
				redirect_code: link.redirect_code,
				created: link.created,
				changed: link.changed,
				expire: link.expire,
				comment: link.comment,
				click_count: clickCounts.get(link.id) || 0
			})),
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			}
		})
	})

	// Create link
	router.post('/api/links', async (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const body = await parseBody(req)
			const clientInfo = getClientInfo(req)

			// Validate URL contains at least one TLD
			if (body.url && !/\.\S+/.test(body.url)) {
				sendJson(res, 400, { error: 'URL must contain at least one top-level domain (e.g., .com, .org)' })
				return
			}

			const db = getRedirectablesDb()
			const transaction = db.transaction((data) => {
				// Get or create domain
				let domainStmt = db.prepare('SELECT id FROM domains WHERE domain = ?')
				let domainRow = domainStmt.get(data.domain)
				let domainId = domainRow?.id
				let newDomain = false

				if (!domainId) {
					const insertDomain = db.prepare('INSERT INTO domains (domain) VALUES (?)')
					const result = insertDomain.run(data.domain)
					domainId = result.lastInsertRowid
					newDomain = true
				}

				// Get or create redirect URL
				let urlStmt = db.prepare('SELECT id FROM redirect_urls WHERE url = ?')
				let urlRow = urlStmt.get(data.url)
				let urlId = urlRow?.id

				if (!urlId) {
					const insertUrl = db.prepare('INSERT INTO redirect_urls (url) VALUES (?)')
					const result = insertUrl.run(data.url)
					urlId = result.lastInsertRowid
				}

				// Get or create expired URL if provided
				let expiredUrlId = null
				if (data.expired_url) {
					let expiredUrlStmt = db.prepare('SELECT id FROM expired_urls WHERE url = ?')
					let expiredUrlRow = expiredUrlStmt.get(data.expired_url)
					if (!expiredUrlRow) {
						const insertExpiredUrl = db.prepare('INSERT INTO expired_urls (url) VALUES (?)')
						const result = insertExpiredUrl.run(data.expired_url)
						expiredUrlId = result.lastInsertRowid
					} else {
						expiredUrlId = expiredUrlRow.id
					}
				}

				// Check for slug conflict
				const conflictStmt = db.prepare('SELECT id FROM links WHERE domain_id = ? AND slug = ?')
				const conflict = conflictStmt.get(domainId, data.slug)
				if (conflict) {
					throw new Error('Slug already exists for this domain')
				}

				// Create link
				const now = Date.now()
				const insertLink = db.prepare(`
					INSERT INTO links (
						domain_id, slug, url_id, expired_url_id,
						keep_referrer, keep_query_params, redirect_code,
						created, changed, expire, comment
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				const result = insertLink.run(
					domainId,
					data.slug,
					urlId,
					expiredUrlId,
					data.keep_referrer ? 1 : 0,
					data.keep_query_params ? 1 : 0,
					data.redirect_code || 303,
					now,
					now,
					data.expire || null,
					data.comment || null
				)

				const linkId = result.lastInsertRowid

				// Calculate diff for created link (show all initial values)
				const linkDiff = calculateDiff(
					{},
					{
						domain: data.domain,
						slug: data.slug,
						url: data.url,
						expired_url: data.expired_url || '',
						redirect_code: data.redirect_code || 303,
						keep_referrer: data.keep_referrer || false,
						keep_query_params: data.keep_query_params || false,
						expire: data.expire || '',
						comment: data.comment || ''
					},
					{
						domain: 'Domain',
						slug: 'Slug',
						url: 'URL',
						expired_url: 'Expired URL',
						redirect_code: 'Redirect Code',
						keep_referrer: 'Keep Referrer',
						keep_query_params: 'Keep Query Params',
						expire: 'Expire',
						comment: 'Comment'
					}
				)

				// Log action
				const logsDb = getLogsDb()
				logAction(logsDb, 'link_logs', 'created', linkId, clientInfo, linkDiff)
				logsDb.close()

				return { id: linkId, domain_id: domainId, slug: data.slug, newDomain }
			})

			const result = transaction(body)
			db.close()

			const { newDomain, ...created } = result
			sendJson(res, 201, created)
			if (newDomain) {
				setImmediate(() => scheduleGatewayReload())
			}
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	// Update link
	router.put('/api/links/:id', async (req, res, params) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const body = await parseBody(req)
			const clientInfo = getClientInfo(req)

			// Validate URL contains at least one TLD if provided
			if (body.url && !/\.\S+/.test(body.url)) {
				sendJson(res, 400, { error: 'URL must contain at least one top-level domain (e.g., .com, .org)' })
				return
			}

			const db = getRedirectablesDb()
			
			// Fetch existing link data for diff calculation
			const existingLinkStmt = db.prepare(`
				SELECT 
					l.*,
					d.domain,
					ru.url,
					eu.url AS expired_url
				FROM links l
				JOIN domains d ON l.domain_id = d.id
				JOIN redirect_urls ru ON l.url_id = ru.id
				LEFT JOIN expired_urls eu ON l.expired_url_id = eu.id
				WHERE l.id = ?
			`)
			const existingLink = existingLinkStmt.get(params.id)
			if (!existingLink) {
				db.close()
				sendJson(res, 404, { error: 'Link not found' })
				return
			}
			
			const transaction = db.transaction((data) => {
				// Check if link exists
				const checkStmt = db.prepare('SELECT id, domain_id, slug FROM links WHERE id = ?')
				const existing = checkStmt.get(data.id)
				if (!existing) {
					throw new Error('Link not found')
				}

				let newDomain = false

				// Update domain if changed
				if (data.domain !== undefined && data.domain !== null) {
					// Get or create domain
					let domainStmt = db.prepare('SELECT id FROM domains WHERE domain = ?')
					let domainRow = domainStmt.get(data.domain)
					let domainId = domainRow?.id

					if (!domainId) {
						const insertDomain = db.prepare('INSERT INTO domains (domain) VALUES (?)')
						const result = insertDomain.run(data.domain)
						domainId = result.lastInsertRowid
						newDomain = true
					}

					// Check for slug conflict on new domain (if domain changed)
					if (domainId !== existing.domain_id) {
						const slugToCheck = data.slug !== undefined ? data.slug : existing.slug
						const conflictStmt = db.prepare('SELECT id FROM links WHERE domain_id = ? AND slug = ? AND id != ?')
						const conflict = conflictStmt.get(domainId, slugToCheck, data.id)
						if (conflict) {
							throw new Error('Slug already exists for this domain')
						}
					}

					// Update domain_id
					const updateDomainId = db.prepare('UPDATE links SET domain_id = ? WHERE id = ?')
					updateDomainId.run(domainId, data.id)
				}

				// Update URL if changed
				if (data.url) {
					let urlStmt = db.prepare('SELECT id FROM redirect_urls WHERE url = ?')
					let urlRow = urlStmt.get(data.url)
					let urlId = urlRow?.id

					if (!urlId) {
						const insertUrl = db.prepare('INSERT INTO redirect_urls (url) VALUES (?)')
						const result = insertUrl.run(data.url)
						urlId = result.lastInsertRowid
					}

					const updateUrlId = db.prepare('UPDATE links SET url_id = ? WHERE id = ?')
					updateUrlId.run(urlId, data.id)
				}

				// Update expired URL if changed
				if (data.expired_url !== undefined) {
					let expiredUrlId = null
					if (data.expired_url) {
						let expiredUrlStmt = db.prepare('SELECT id FROM expired_urls WHERE url = ?')
						let expiredUrlRow = expiredUrlStmt.get(data.expired_url)
						if (!expiredUrlRow) {
							const insertExpiredUrl = db.prepare('INSERT INTO expired_urls (url) VALUES (?)')
							const result = insertExpiredUrl.run(data.expired_url)
							expiredUrlId = result.lastInsertRowid
						} else {
							expiredUrlId = expiredUrlRow.id
						}
					}

					const updateExpiredUrlId = db.prepare('UPDATE links SET expired_url_id = ? WHERE id = ?')
					updateExpiredUrlId.run(expiredUrlId, data.id)
				}

				// Update other fields
				const updateStmt = db.prepare(`
					UPDATE links SET
						slug = COALESCE(?, slug),
						keep_referrer = COALESCE(?, keep_referrer),
						keep_query_params = COALESCE(?, keep_query_params),
						redirect_code = COALESCE(?, redirect_code),
						changed = ?,
						expire = ?,
						comment = COALESCE(?, comment)
					WHERE id = ?
				`)
				updateStmt.run(
					data.slug || null,
					data.keep_referrer !== undefined ? (data.keep_referrer ? 1 : 0) : null,
					data.keep_query_params !== undefined ? (data.keep_query_params ? 1 : 0) : null,
					data.redirect_code || null,
					Date.now(),
					data.expire || null,
					data.comment || null,
					data.id
				)
				
				// Fetch updated link to get final values for diff
				const updatedLinkStmt = db.prepare(`
					SELECT 
						l.*,
						d.domain,
						ru.url,
						eu.url AS expired_url
					FROM links l
					JOIN domains d ON l.domain_id = d.id
					JOIN redirect_urls ru ON l.url_id = ru.id
					LEFT JOIN expired_urls eu ON l.expired_url_id = eu.id
					WHERE l.id = ?
				`)
				const updatedLink = updatedLinkStmt.get(data.id)
				
				// Calculate diff - use existingLink from outer scope
				const linkDiff = calculateDiff(
					{
						domain: existingLink.domain,
						slug: existingLink.slug,
						url: existingLink.url,
						expired_url: existingLink.expired_url || '',
						redirect_code: existingLink.redirect_code || 303,
						keep_referrer: existingLink.keep_referrer === 1,
						keep_query_params: existingLink.keep_query_params === 1,
						expire: existingLink.expire || '',
						comment: existingLink.comment || ''
					},
					{
						domain: updatedLink.domain,
						slug: updatedLink.slug,
						url: updatedLink.url,
						expired_url: updatedLink.expired_url || '',
						redirect_code: updatedLink.redirect_code || 303,
						keep_referrer: updatedLink.keep_referrer === 1,
						keep_query_params: updatedLink.keep_query_params === 1,
						expire: updatedLink.expire || '',
						comment: updatedLink.comment || ''
					},
					{
						domain: 'Domain',
						slug: 'Slug',
						url: 'URL',
						expired_url: 'Expired URL',
						redirect_code: 'Redirect Code',
						keep_referrer: 'Keep Referrer',
						keep_query_params: 'Keep Query Params',
						expire: 'Expire',
						comment: 'Comment'
					}
				)

				// Log action
				const logsDb = getLogsDb()
				logAction(logsDb, 'link_logs', 'edited', data.id, clientInfo, linkDiff)
				logsDb.close()
				
				return { newDomain }
			})

			const txResult = transaction({ ...body, id: params.id })
			db.close()

			sendJson(res, 200, { success: true })
			if (txResult.newDomain) {
				setImmediate(() => scheduleGatewayReload())
			}
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	// Delete link
	router.delete('/api/links/:id', (req, res, params) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const clientInfo = getClientInfo(req)
		const db = getRedirectablesDb()
		
		// Fetch link data before deletion for logging
		const linkStmt = db.prepare(`
			SELECT 
				l.*,
				d.domain,
				ru.url,
				eu.url AS expired_url
			FROM links l
			JOIN domains d ON l.domain_id = d.id
			JOIN redirect_urls ru ON l.url_id = ru.id
			LEFT JOIN expired_urls eu ON l.expired_url_id = eu.id
			WHERE l.id = ?
		`)
		const link = linkStmt.get(params.id)
		
		if (!link) {
			db.close()
			sendJson(res, 404, { error: 'Link not found' })
			return
		}

		const deleteStmt = db.prepare('DELETE FROM links WHERE id = ?')
		const result = deleteStmt.run(params.id)
		db.close()

		if (result.changes === 0) {
			sendJson(res, 404, { error: 'Link not found' })
			return
		}

		// Log action with deletion info - only link and url
		const linkDiff = [
			{
				what: 'link',
				before: `${link.domain}/${link.slug}`,
				after: null
			},
			{
				what: 'url',
				before: link.url,
				after: null
			}
		]
		
		const logsDb = getLogsDb()
		logAction(logsDb, 'link_logs', 'deleted', params.id, clientInfo, linkDiff)
		logsDb.close()

		sendJson(res, 200, { success: true })
	})

	// Check for duplicate URL
	router.get('/api/links/check-url', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const url = new URL(req.url, 'http://localhost')
		const checkUrl = url.searchParams.get('url')

		if (!checkUrl) {
			sendJson(res, 400, { error: 'URL parameter required' })
			return
		}

		const db = getRedirectablesDb()
		const stmt = db.prepare(`
			SELECT 
				l.id,
				l.slug,
				l.created,
				l.expire,
				l.comment,
				d.domain
			FROM links l
			JOIN redirect_urls ru ON l.url_id = ru.id
			JOIN domains d ON l.domain_id = d.id
			WHERE ru.url = ?
			ORDER BY l.created DESC
		`)
		const links = stmt.all(checkUrl)
		db.close()

		sendJson(res, 200, { links })
	})

	// Import preview
	router.post('/api/links/import/preview', async (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const body = await parseBody(req)
			const { links, createDomains, replaceExisting, importType } = body

			if (!Array.isArray(links)) {
				sendJson(res, 400, { error: 'Invalid format: links must be an array' })
				return
			}
			const { normalizedLinks, corruptedRows } = parseImportLinks(links, importType)

			const db = getRedirectablesDb()
			const existingDomainsStmt = db.prepare('SELECT domain FROM domains')
			const existingDomains = new Set(existingDomainsStmt.all().map(d => d.domain))

			const existingLinksStmt = db.prepare(`
				SELECT d.domain, l.slug
				FROM links l
				JOIN domains d ON l.domain_id = d.id
			`)
			const existingLinks = new Set(existingLinksStmt.all().map(l => `${l.domain}/${l.slug}`))

			let totalLinks = links.length
			let totalDomains = 0
			let linksToImport = 0
			let linksToSkip = 0
			let linksExisting = 0
			let domainsToCreate = 0
			let domainsExisting = 0

			const domainsSet = new Set()
			const encounteredDomainsSet = new Set()
			const missingDomainsSet = new Set()

			for (const link of normalizedLinks) {
				if (!link.domain || !link.slug || !link.url) {
					linksToSkip++
					continue
				}

				encounteredDomainsSet.add(link.domain)
				const domainExists = existingDomains.has(link.domain)
				if (!domainExists) {
					missingDomainsSet.add(link.domain)
				}

				const linkKey = `${link.domain}/${link.slug}`
				if (existingLinks.has(linkKey)) {
					linksExisting++
					if (!replaceExisting) {
						linksToSkip++
						continue
					}
				}
				if (!domainExists && !createDomains) {
					// Import path skips links whose domains are missing when createDomains is disabled.
					linksToSkip++
					continue
				}

				linksToImport++
				domainsSet.add(link.domain)
			}

			totalDomains = encounteredDomainsSet.size

			for (const domain of encounteredDomainsSet) {
				if (existingDomains.has(domain)) {
					domainsExisting++
				}
			}
			const missingDomains = Array.from(missingDomainsSet).sort()
			const domainsToCreateList = createDomains ? missingDomains : []
			const domainsToSkipList = createDomains ? [] : missingDomains
			domainsToCreate = domainsToCreateList.length

			db.close()

			sendJson(res, 200, {
				totalLinks,
				totalDomains,
				linksToImport,
				linksToSkip: linksToSkip + corruptedRows,
				linksExisting,
				domainsToCreate,
				domainsExisting,
				domainsToCreateList,
				domainsToSkipList,
				corruptedRows
			})
		} catch (err) {
			sendJson(res, err.statusCode || 400, { error: err.message || 'Invalid request' })
		}
	})

	// Import links
	router.post('/api/links/import', async (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const body = await parseBody(req)
			const { links, createDomains, replaceExisting, importType } = body
			const clientInfo = getClientInfo(req)

			if (!Array.isArray(links)) {
				sendJson(res, 400, { error: 'Invalid format: links must be an array' })
				return
			}
			const { normalizedLinks, corruptedRows } = parseImportLinks(links, importType)
			if (normalizedLinks.length === 0 && links.length > 0) {
				sendJson(res, 400, { error: 'Import file is corrupted or does not match selected import type' })
				return
			}

			const db = getRedirectablesDb()
			const logsDb = getLogsDb()

			const transaction = db.transaction((data) => {
				const domainMap = new Map()
				const existingDomainsStmt = db.prepare('SELECT id, domain FROM domains')
				const existingDomains = existingDomainsStmt.all()
				for (const domain of existingDomains) {
					domainMap.set(domain.domain, domain.id)
				}

				const insertDomainStmt = db.prepare('INSERT INTO domains (domain) VALUES (?)')
				const insertUrlStmt = db.prepare('INSERT INTO redirect_urls (url) VALUES (?)')
				const getUrlStmt = db.prepare('SELECT id FROM redirect_urls WHERE url = ?')

				const insertExpiredUrlStmt = db.prepare('INSERT INTO expired_urls (url) VALUES (?)')
				const getExpiredUrlStmt = db.prepare('SELECT id FROM expired_urls WHERE url = ?')

				const getLinkStmt = db.prepare(`
					SELECT l.id
					FROM links l
					JOIN domains d ON l.domain_id = d.id
					WHERE d.domain = ? AND l.slug = ?
				`)

				const insertLinkStmt = db.prepare(`
					INSERT INTO links (
						domain_id, slug, url_id, expired_url_id,
						keep_referrer, keep_query_params, redirect_code,
						created, changed, expire, comment
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)

				const updateLinkStmt = db.prepare(`
					UPDATE links SET
						url_id = ?, expired_url_id = ?,
						keep_referrer = ?, keep_query_params = ?, redirect_code = ?,
						changed = ?, expire = ?, comment = ?
					WHERE id = ?
				`)

				let imported = 0
				let updated = 0
				let domainsCreated = 0

				for (const link of data.links) {
					if (!link.domain || !link.slug || !link.url) {
						continue
					}

					// Get or create domain
					let domainId = domainMap.get(link.domain)
					if (!domainId) {
						if (data.createDomains) {
							const result = insertDomainStmt.run(link.domain)
							domainId = result.lastInsertRowid
							domainMap.set(link.domain, domainId)
							domainsCreated++
							logAction(logsDb, 'domain_logs', 'created', domainId, data.clientInfo, [{
								what: 'Domain',
								before: null,
								after: link.domain
							}])
						} else {
							continue
						}
					}

					// Get or create URL
					let urlRow = getUrlStmt.get(link.url)
					let urlId = urlRow?.id
					if (!urlId) {
						const result = insertUrlStmt.run(link.url)
						urlId = result.lastInsertRowid
					}

					// Get or create expired URL
					let expiredUrlId = null
					if (link.expired_url) {
						let expiredUrlRow = getExpiredUrlStmt.get(link.expired_url)
						if (!expiredUrlRow) {
							const result = insertExpiredUrlStmt.run(link.expired_url)
							expiredUrlId = result.lastInsertRowid
						} else {
							expiredUrlId = expiredUrlRow.id
						}
					}

					// Check if link exists
					const existingLink = getLinkStmt.get(link.domain, link.slug)
					const now = Date.now()
					
					// Parse created
					let createdDate = now
					if (link.created) {
						const parsed = new Date(link.created).getTime()
						if (!isNaN(parsed)) {
							createdDate = parsed
						}
					}
					
					// Parse expire date
					let expireDate = null
					if (link.expire) {
						const parsed = new Date(link.expire).getTime()
						if (!isNaN(parsed)) {
							expireDate = parsed
						}
					}

					// Get field values (handle different field name variations)
					const redirectCode = link.redirect_HTTP_response_code || link.redirect_http_response_code || link['redirect HTTP response code'] || 303
					const keepReferrer = link.keep_referrer !== undefined ? link.keep_referrer : (link['keep referrer'] !== undefined ? link['keep referrer'] : false)
					const keepQueryParams = link.keep_query_params !== undefined ? link.keep_query_params : (link['keep query params'] !== undefined ? link['keep query params'] : false)

					if (existingLink) {
						if (data.replaceExisting) {
							updateLinkStmt.run(
								urlId,
								expiredUrlId,
								keepReferrer ? 1 : 0,
								keepQueryParams ? 1 : 0,
								redirectCode,
								now,
								expireDate,
								link.comment || null,
								existingLink.id
							)
							updated++
							logAction(logsDb, 'link_logs', 'edited', existingLink.id, data.clientInfo, null)
						}
					} else {
						insertLinkStmt.run(
							domainId,
							link.slug,
							urlId,
							expiredUrlId,
							keepReferrer ? 1 : 0,
							keepQueryParams ? 1 : 0,
							redirectCode,
							createdDate,
							now,
							expireDate,
							link.comment || null
						)
						imported++
					}
				}

				return { imported, updated, domainsCreated }
			})

			const result = transaction({ links: normalizedLinks, createDomains, replaceExisting, clientInfo })
			
			// Log main import action
			const importDiff = [
				{
					what: 'Links imported',
					before: null,
					after: result.imported.toString()
				}
			]
			if (result.domainsCreated > 0) {
				importDiff.push({
					what: 'Domains created',
					before: null,
					after: result.domainsCreated.toString()
				})
			}
			logAction(logsDb, 'main_logs', 'imported', null, clientInfo, importDiff)
			
			db.close()
			logsDb.close()

			sendJson(res, 200, { 
				success: true,
				imported: result.imported,
				updated: result.updated,
				corruptedRows
			})
			if (result.domainsCreated > 0) {
				setImmediate(() => scheduleGatewayReload())
			}
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	// Export count
	router.get('/api/links/export/count', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const url = new URL(req.url, 'http://localhost')
			const dateSince = url.searchParams.get('dateSince')
			const domainFilter = url.searchParams.get('domain')

			const db = getRedirectablesDb()

			let query = `
				SELECT COUNT(*) as count
				FROM links l
				JOIN domains d ON l.domain_id = d.id
				WHERE 1=1
			`

			const params = []

			if (dateSince) {
				const timestamp = new Date(dateSince).getTime()
				if (!isNaN(timestamp)) {
					query += ' AND l.created >= ?'
					params.push(timestamp)
				}
			}

			if (domainFilter && domainFilter !== 'all') {
				query += ' AND d.domain = ?'
				params.push(domainFilter)
			}

			const stmt = db.prepare(query)
			const result = stmt.get(...params)
			db.close()

			sendJson(res, 200, { count: result.count })
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	// Export links
	router.get('/api/links/export', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const url = new URL(req.url, 'http://localhost')
			const dateSince = url.searchParams.get('dateSince')
			const domainFilter = url.searchParams.get('domain')

			const db = getRedirectablesDb()

			let query = `
				SELECT 
					d.domain,
					l.slug,
					ru.url,
					eu.url AS expired_url,
					l.keep_referrer,
					l.keep_query_params,
					l.redirect_code AS redirect_HTTP_response_code,
					l.expire,
					l.comment,
					l.created
				FROM links l
				JOIN domains d ON l.domain_id = d.id
				JOIN redirect_urls ru ON l.url_id = ru.id
				LEFT JOIN expired_urls eu ON l.expired_url_id = eu.id
				WHERE 1=1
			`

			const params = []

			if (dateSince) {
				const timestamp = new Date(dateSince).getTime()
				if (!isNaN(timestamp)) {
					query += ' AND l.created >= ?'
					params.push(timestamp)
				}
			}

			if (domainFilter && domainFilter !== 'all') {
				query += ' AND d.domain = ?'
				params.push(domainFilter)
			}

			query += ' ORDER BY l.created DESC'

			const stmt = db.prepare(query)
			const linksData = stmt.all(...params)
			const links = linksData.map(link => ({
				domain: link.domain,
				slug: link.slug,
				url: link.url,
				expired_url: link.expired_url || undefined,
				keep_referrer: link.keep_referrer === 1,
				keep_query_params: link.keep_query_params === 1,
				redirect_HTTP_response_code: link.redirect_HTTP_response_code,
				expire: link.expire ? new Date(link.expire).toISOString().split('T')[0] : undefined,
				comment: link.comment || undefined,
				created: link.created ? new Date(link.created).toISOString().split('T')[0] : undefined
			}))

			// Get unique domains from exported links
			const uniqueDomains = [...new Set(linksData.map(link => link.domain))].sort()
			const domainNames = domainFilter && domainFilter !== 'all' 
				? domainFilter 
				: uniqueDomains.length > 0 
					? uniqueDomains.join(', ') 
					: 'all'

			// Log export action
			const clientInfo = getClientInfo(req)
			const logsDb = getLogsDb()
			const exportDiff = [
				{
					what: 'Links exported',
					before: null,
					after: links.length.toString()
				},
				{
					what: 'Domains',
					before: null,
					after: domainNames
				}
			]
			logAction(logsDb, 'main_logs', 'exported', null, clientInfo, exportDiff)
			logsDb.close()

			db.close()

			sendJson(res, 200, links)
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	// Get single link — register after static /api/links/* routes so paths like export/check-url are not matched as :id
	router.get('/api/links/:id', (req, res, params) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const db = getRedirectablesDb()
		const stmt = db.prepare(`
			SELECT 
				l.*,
				d.domain,
				ru.url,
				eu.url AS expired_url
			FROM links l
			JOIN domains d ON l.domain_id = d.id
			JOIN redirect_urls ru ON l.url_id = ru.id
			LEFT JOIN expired_urls eu ON l.expired_url_id = eu.id
			WHERE l.id = ?
		`)
		const link = stmt.get(params.id)
		db.close()

		if (!link) {
			sendJson(res, 404, { error: 'Link not found' })
			return
		}

		sendJson(res, 200, {
			id: link.id,
			domain_id: link.domain_id,
			domain: link.domain,
			slug: link.slug,
			url: link.url,
			expired_url: link.expired_url,
			keep_referrer: link.keep_referrer === 1,
			keep_query_params: link.keep_query_params === 1,
			redirect_code: link.redirect_code,
			created: link.created,
			changed: link.changed,
			expire: link.expire,
			comment: link.comment
		})
	})
}

// Stats endpoints
export function setupStatsRoutes(router, auth) {
	router.get('/api/stats', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const url = new URL(req.url, 'http://localhost')
		const period = url.searchParams.get('period') || 'day'
		const linkId = url.searchParams.get('linkId')

		const statsDb = getStatsDb()
		const redirectablesDb = getRedirectablesDb()

		// Calculate time range
		const now = Date.now()
		let startTime, prevStartTime
		switch (period) {
			case 'day':
				startTime = now - 24 * 60 * 60 * 1000
				prevStartTime = startTime - 24 * 60 * 60 * 1000
				break
			case 'week':
				startTime = now - 7 * 24 * 60 * 60 * 1000
				prevStartTime = startTime - 7 * 24 * 60 * 60 * 1000
				break
			case 'month':
				startTime = now - 30 * 24 * 60 * 60 * 1000
				prevStartTime = startTime - 30 * 24 * 60 * 60 * 1000
				break
			case 'year':
				startTime = now - 365 * 24 * 60 * 60 * 1000
				prevStartTime = startTime - 365 * 24 * 60 * 60 * 1000
				break
			case 'all':
				// Find the earliest redirect timestamp
				let earliestQuery = 'SELECT MIN(timestamp) as earliest FROM redirects'
				const earliestParams = []
				if (linkId) {
					earliestQuery += ' WHERE link_id = ?'
					earliestParams.push(linkId)
				}
				const earliestStmt = statsDb.prepare(earliestQuery)
				const earliestResult = earliestStmt.get(...earliestParams)
				startTime = earliestResult?.earliest || now
				prevStartTime = startTime // No previous period for "all time"
				break
			default:
				startTime = 0
				prevStartTime = 0
		}

		// Get redirects
		let query = 'SELECT * FROM redirects WHERE timestamp >= ?'
		const params = [startTime]
		if (linkId) {
			query += ' AND link_id = ?'
			params.push(linkId)
		}
		query += ' ORDER BY timestamp ASC'

		const stmt = statsDb.prepare(query)
		const redirects = stmt.all(...params)

		// Parse user agents and aggregate
		const deviceCounts = {}
		const osCounts = {}
		const browserCounts = {}
		const referralCounts = {}
		let totalClicks = 0
		let prevTotalClicks = 0

		for (const redirect of redirects) {
			if (redirect.timestamp >= startTime) {
				totalClicks++
			} else if (redirect.timestamp >= prevStartTime) {
				prevTotalClicks++
			}

			// Parse user agent
			if (redirect.user_agent_string) {
				const parser = new UAParser(redirect.user_agent_string)
				const device = parser.getDevice().type || 'pc'
				const os = parser.getOS().name || 'unknown'
				const browser = parser.getBrowser().name || 'unknown'

				deviceCounts[device] = (deviceCounts[device] || 0) + 1
				osCounts[os] = (osCounts[os] || 0) + 1
				browserCounts[browser] = (browserCounts[browser] || 0) + 1
			}

			// Count referrals
			if (redirect.referral_url) {
				try {
					const referralDomain = new URL(redirect.referral_url).hostname
					referralCounts[referralDomain] = (referralCounts[referralDomain] || 0) + 1
				} catch (e) {
					// Invalid URL, skip
				}
			}
		}

		// Get previous period stats (only for non-"all" periods)
		if (period !== 'all') {
			let prevQuery = 'SELECT COUNT(*) as count FROM redirects WHERE timestamp >= ? AND timestamp < ?'
			const prevParams = [prevStartTime, startTime]
			if (linkId) {
				prevQuery += ' AND link_id = ?'
				prevParams.push(linkId)
			}
			const prevStmt = statsDb.prepare(prevQuery)
			const prevResult = prevStmt.get(...prevParams)
			prevTotalClicks = prevResult.count
		} else {
			// For "all time", there's no previous period
			prevTotalClicks = 0
		}

		// Get top links
		const topLinksStmt = statsDb.prepare(`
			SELECT link_id, COUNT(*) as count
			FROM redirects
			WHERE timestamp >= ?
			GROUP BY link_id
			ORDER BY count DESC
			LIMIT 10
		`)
		const topLinksRows = topLinksStmt.all(startTime)

		const topLinks = []
		for (const row of topLinksRows) {
			const linkStmt = redirectablesDb.prepare(`
				SELECT l.slug, d.domain
				FROM links l
				JOIN domains d ON l.domain_id = d.id
				WHERE l.id = ?
			`)
			const link = linkStmt.get(row.link_id)
			if (link) {
				topLinks.push({
					id: row.link_id,
					slug: link.slug,
					domain: link.domain,
					count: row.count
				})
			}
		}

		statsDb.close()
		redirectablesDb.close()

		// Sort and limit tops
		const topDevices = Object.entries(deviceCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([name, count]) => ({ name, count }))

		const topOSes = Object.entries(osCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([name, count]) => ({ name, count }))

		const topBrowsers = Object.entries(browserCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([name, count]) => ({ name, count }))

		const topReferrals = Object.entries(referralCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([name, count]) => ({ name, count }))

		// Generate time series data for graph
		const timeSeries = []
		const bucketSize = period === 'day' ? 60 * 60 * 1000 : // 1 hour
			period === 'week' ? 24 * 60 * 60 * 1000 : // 1 day
			period === 'month' ? 24 * 60 * 60 * 1000 : // 1 day
			period === 'year' ? 7 * 24 * 60 * 60 * 1000 : // 1 week
			period === 'all' ? 30 * 24 * 60 * 60 * 1000 : // 1 month for all time
			30 * 24 * 60 * 60 * 1000 // 1 month

		for (let time = startTime; time <= now; time += bucketSize) {
			const bucketEnd = Math.min(time + bucketSize, now)
			const count = redirects.filter(r => r.timestamp >= time && r.timestamp < bucketEnd).length

			// Previous period (only for non-"all" periods)
			let prevCount = 0
			if (period !== 'all') {
				const prevTime = time - (now - startTime)
				const prevBucketEnd = prevTime + bucketSize
				prevCount = redirects.filter(r => 
					r.timestamp >= prevTime && r.timestamp < prevBucketEnd
				).length
			}

			timeSeries.push({
				time: Math.floor(time / 1000), // Convert to seconds (uPlot will convert back to ms)
				count,
				prevCount
			})
		}

		sendJson(res, 200, {
			period,
			totalClicks,
			prevTotalClicks,
			topLinks,
			topDevices,
			topOSes,
			topBrowsers,
			topReferrals,
			timeSeries
		})
	})
}

// Domains endpoints
export function setupDomainRoutes(router, auth) {
	router.get('/api/domains', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const db = getRedirectablesDb()
		const stmt = db.prepare(`
			SELECT 
				d.id, 
				d.domain,
				COUNT(l.id) as link_count
			FROM domains d
			LEFT JOIN links l ON d.id = l.domain_id
			GROUP BY d.id, d.domain
			ORDER BY d.domain
		`)
		const domains = stmt.all()
		db.close()

		sendJson(res, 200, { domains })
	})

	router.post('/api/domains', async (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const body = await parseBody(req)
			const clientInfo = getClientInfo(req)

			if (!body.domain) {
				sendJson(res, 400, { error: 'Domain is required' })
				return
			}

			const db = getRedirectablesDb()
			const checkStmt = db.prepare('SELECT id FROM domains WHERE domain = ?')
			const existing = checkStmt.get(body.domain)
			if (existing) {
				db.close()
				sendJson(res, 400, { error: 'Domain already exists' })
				return
			}

			const insertStmt = db.prepare('INSERT INTO domains (domain) VALUES (?)')
			const result = insertStmt.run(body.domain)
			db.close()

			// Calculate diff for created domain (show initial value)
			const domainDiff = calculateDiff(
				{},
				{ domain: body.domain },
				{ domain: 'Domain' }
			)

			// Log action
			const logsDb = getLogsDb()
			logAction(logsDb, 'domain_logs', 'created', result.lastInsertRowid, clientInfo, domainDiff)
			logsDb.close()

			sendJson(res, 201, { id: result.lastInsertRowid, domain: body.domain })
			setImmediate(() => scheduleGatewayReload())
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	router.delete('/api/domains/:id', (req, res, params) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const clientInfo = getClientInfo(req)
		const db = getRedirectablesDb()

		// Check if domain is used by any links
		const linksStmt = db.prepare('SELECT COUNT(*) as count FROM links WHERE domain_id = ?')
		const linksCount = linksStmt.get(params.id).count

		if (linksCount > 0) {
			db.close()
			sendJson(res, 400, { error: `Cannot delete domain: ${linksCount} link(s) are using it` })
			return
		}

		// Fetch domain data before deletion for logging
		const domainStmt = db.prepare('SELECT domain FROM domains WHERE id = ?')
		const domain = domainStmt.get(params.id)
		
		if (!domain) {
			db.close()
			sendJson(res, 404, { error: 'Domain not found' })
			return
		}

		const deleteStmt = db.prepare('DELETE FROM domains WHERE id = ?')
		const result = deleteStmt.run(params.id)
		db.close()

		if (result.changes === 0) {
			sendJson(res, 404, { error: 'Domain not found' })
			return
		}

		// Log action with deletion info
		const domainDiff = [{
			what: 'Domain',
			before: domain.domain,
			after: null
		}]
		const logsDb = getLogsDb()
		logAction(logsDb, 'domain_logs', 'deleted', params.id, clientInfo, domainDiff)
		logsDb.close()

		sendJson(res, 200, { success: true })
		setImmediate(() => scheduleGatewayReload())
	})

	// Delete domain with all its links
	router.post('/api/domains/delete-with-links', async (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const body = await parseBody(req)
			const { domain: domainName } = body

			if (!domainName) {
				sendJson(res, 400, { error: 'Domain name is required' })
				return
			}

			const clientInfo = getClientInfo(req)
			const db = getRedirectablesDb()
			const statsDb = getStatsDb()
			const logsDb = getLogsDb()

			// Get domain
			const domainStmt = db.prepare('SELECT id, domain FROM domains WHERE domain = ?')
			const domain = domainStmt.get(domainName)

			if (!domain) {
				db.close()
				sendJson(res, 404, { error: 'Domain not found' })
				return
			}

			// Get all links for this domain
			const linksStmt = db.prepare('SELECT id FROM links WHERE domain_id = ?')
			const links = linksStmt.all(domain.id)
			const linkIds = links.map(link => link.id)
			const linksCount = linkIds.length

			// Delete stats for all links
			if (linkIds.length > 0) {
				const placeholders = linkIds.map(() => '?').join(',')
				const deleteStatsStmt = statsDb.prepare(`DELETE FROM redirects WHERE link_id IN (${placeholders})`)
				deleteStatsStmt.run(...linkIds)
			}

			// Delete all links
			if (linkIds.length > 0) {
				const placeholders = linkIds.map(() => '?').join(',')
				const deleteLinksStmt = db.prepare(`DELETE FROM links WHERE id IN (${placeholders})`)
				deleteLinksStmt.run(...linkIds)
			}

			// Delete domain
			const deleteDomainStmt = db.prepare('DELETE FROM domains WHERE id = ?')
			deleteDomainStmt.run(domain.id)

			// Log action
			const domainDiff = [
				{
					what: 'Domain',
					before: domain.domain,
					after: null
				},
				{
					what: 'Links deleted',
					before: null,
					after: linksCount.toString()
				}
			]
			logAction(logsDb, 'domain_logs', 'deleted with links', domain.id, clientInfo, domainDiff)

			db.close()
			statsDb.close()
			logsDb.close()

			sendJson(res, 200, { success: true, linksDeleted: linksCount })
			setImmediate(() => scheduleGatewayReload())
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})
}

// Settings endpoints
export function setupSettingsRoutes(router, auth) {
	router.get('/api/settings', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const db = getMainDb()
		const settingsStmt = db.prepare('SELECT key, value FROM settings')
		const defaultsStmt = db.prepare('SELECT key, value FROM defaults')

		const settings = {}
		for (const row of settingsStmt.all()) {
			settings[row.key] = row.value
		}

		const defaults = {}
		for (const row of defaultsStmt.all()) {
			defaults[row.key] = row.value
		}

		db.close()

		sendJson(res, 200, { settings, defaults })
	})

	router.put('/api/settings', async (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		try {
			const body = await parseBody(req)
			const clientInfo = getClientInfo(req)
			const db = getMainDb()

			// Fetch existing settings and defaults for diff calculation
			const existingSettingsStmt = db.prepare('SELECT key, value FROM settings')
			const existingDefaultsStmt = db.prepare('SELECT key, value FROM defaults')
			
			const existingSettings = {}
			for (const row of existingSettingsStmt.all()) {
				existingSettings[row.key] = row.value
			}
			
			const existingDefaults = {}
			for (const row of existingDefaultsStmt.all()) {
				existingDefaults[row.key] = row.value
			}

			const transaction = db.transaction((data) => {
				// Update settings
				if (data.settings) {
					const upsertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
					for (const [key, value] of Object.entries(data.settings)) {
						upsertSetting.run(key, value || null)
					}
				}

				// Update defaults
				if (data.defaults) {
					const upsertDefault = db.prepare('INSERT OR REPLACE INTO defaults (key, value) VALUES (?, ?)')
					for (const [key, value] of Object.entries(data.defaults)) {
						upsertDefault.run(key, value || null)
					}
				}
			})

			transaction(body)
			
			// Fetch updated settings and defaults for diff
			const updatedSettingsStmt = db.prepare('SELECT key, value FROM settings')
			const updatedDefaultsStmt = db.prepare('SELECT key, value FROM defaults')
			
			const updatedSettings = {}
			for (const row of updatedSettingsStmt.all()) {
				updatedSettings[row.key] = row.value
			}
			
			const updatedDefaults = {}
			for (const row of updatedDefaultsStmt.all()) {
				updatedDefaults[row.key] = row.value
			}
			
			// Convert domain IDs to domain names for diff
			const redirectablesDb = getRedirectablesDb()
			const domainStmt = redirectablesDb.prepare('SELECT id, domain FROM domains')
			const allDomains = domainStmt.all()
			const domainMap = new Map(allDomains.map(d => [d.id.toString(), d.domain]))
			redirectablesDb.close()
			
			// Convert default_domain_id to domain name in existing and updated defaults
			const existingDefaultsForDiff = { ...existingDefaults }
			if (existingDefaultsForDiff.default_domain_id) {
				existingDefaultsForDiff.default_domain = domainMap.get(existingDefaultsForDiff.default_domain_id) || existingDefaultsForDiff.default_domain_id
			}
			
			const updatedDefaultsForDiff = { ...updatedDefaults }
			if (updatedDefaultsForDiff.default_domain_id) {
				updatedDefaultsForDiff.default_domain = domainMap.get(updatedDefaultsForDiff.default_domain_id) || updatedDefaultsForDiff.default_domain_id
			}
			
			// Calculate diff for settings and defaults
			const settingsDiff = calculateDiff(
				existingSettings,
				updatedSettings,
				{
					error_404_url: '404 Redirect URL',
					error_500_url: '500/403 Error Redirect URL'
				}
			)
			
			const defaultsDiff = calculateDiff(
				existingDefaultsForDiff,
				updatedDefaultsForDiff,
				{
					default_domain: 'Default Domain',
					expired_url: 'Default Expired URL',
					redirect_code: 'Default Redirect Code',
					keep_referrer: 'Default Keep Referrer',
					keep_query_params: 'Default Keep Query Params'
				}
			)
			
			// Combine diffs
			const combinedDiff = [
				...(settingsDiff || []),
				...(defaultsDiff || [])
			]
			
			db.close()

			// Log action
			const logsDb = getLogsDb()
			logAction(logsDb, 'main_logs', 'settings changed', null, clientInfo, combinedDiff.length > 0 ? combinedDiff : null)
			logsDb.close()

			sendJson(res, 200, { success: true })
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})
}

export function setupApiKeyRoutes(router, auth) {
	router.get('/api/settings/api-keys', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}
		const db = getMainDb()
		const stmt = db.prepare('SELECT * FROM api_keys ORDER BY created DESC')
		const rows = stmt.all()
		db.close()
		sendJson(res, 200, { keys: rows.map(toApiKeyResponse) })
	})

	router.post('/api/settings/api-keys', async (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}
		try {
			const body = await parseBody(req)
			const name = String(body.name || '').trim()
			if (!name) {
				sendJson(res, 400, { error: 'Key name is required' })
				return
			}
			const { valid, invalid } = validateAllowedIps(body.allowed_ips)
			if (invalid.length > 0) {
				sendJson(res, 400, { error: `Invalid allowed IP entries: ${invalid.join(', ')}` })
				return
			}
			const generated = auth.generateApiKey()
			const now = Date.now()
			const db = getMainDb()
			const stmt = db.prepare(`
				INSERT INTO api_keys (name, key_id, secret_hash, enabled, allowed_ips_json, created, changed)
				VALUES (?, ?, ?, 1, ?, ?, ?)
			`)
			const result = stmt.run(
				name,
				generated.keyId,
				generated.secretHash,
				valid.length > 0 ? JSON.stringify(valid) : null,
				now,
				now
			)
			const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid)
			db.close()
			sendJson(res, 201, { key: toApiKeyResponse(row), token: generated.token })
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	router.put('/api/settings/api-keys/:id', async (req, res, params) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}
		try {
			const body = await parseBody(req)
			const updates = []
			const values = []
			if (body.name !== undefined) {
				const name = String(body.name || '').trim()
				if (!name) {
					sendJson(res, 400, { error: 'Key name cannot be empty' })
					return
				}
				updates.push('name = ?')
				values.push(name)
			}
			if (body.enabled !== undefined) {
				updates.push('enabled = ?')
				values.push(body.enabled ? 1 : 0)
			}
			if (body.allowed_ips !== undefined) {
				const { valid, invalid } = validateAllowedIps(body.allowed_ips)
				if (invalid.length > 0) {
					sendJson(res, 400, { error: `Invalid allowed IP entries: ${invalid.join(', ')}` })
					return
				}
				updates.push('allowed_ips_json = ?')
				values.push(valid.length > 0 ? JSON.stringify(valid) : null)
			}
			if (updates.length === 0) {
				sendJson(res, 400, { error: 'No fields to update' })
				return
			}
			updates.push('changed = ?')
			values.push(Date.now())
			values.push(params.id)
			const db = getMainDb()
			const stmt = db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`)
			const result = stmt.run(...values)
			if (result.changes === 0) {
				db.close()
				sendJson(res, 404, { error: 'API key not found' })
				return
			}
			const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(params.id)
			db.close()
			sendJson(res, 200, { key: toApiKeyResponse(row) })
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	router.post('/api/settings/api-keys/:id/regenerate', (req, res, params) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}
		const generated = auth.generateApiKey()
		const db = getMainDb()
		const stmt = db.prepare(`
			UPDATE api_keys
			SET key_id = ?, secret_hash = ?, enabled = 1, changed = ?, last_used_at = NULL, last_used_ip = NULL
			WHERE id = ?
		`)
		const result = stmt.run(generated.keyId, generated.secretHash, Date.now(), params.id)
		if (result.changes === 0) {
			db.close()
			sendJson(res, 404, { error: 'API key not found' })
			return
		}
		const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(params.id)
		db.close()
		sendJson(res, 200, { key: toApiKeyResponse(row), token: generated.token })
	})

	router.delete('/api/settings/api-keys/:id', (req, res, params) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}
		const db = getMainDb()
		const stmt = db.prepare('DELETE FROM api_keys WHERE id = ?')
		const result = stmt.run(params.id)
		db.close()
		if (result.changes === 0) {
			sendJson(res, 404, { error: 'API key not found' })
			return
		}
		sendJson(res, 200, { success: true })
	})
}

export function setupExternalRoutes(router, auth) {
	router.get('/api/external/links', (req, res) => {
		if (!requireApiKey(req, res, auth)) return
		const url = new URL(req.url, 'http://localhost')
		const page = parseInt(url.searchParams.get('page') || '1')
		const limit = parseInt(url.searchParams.get('limit') || '100')
		const offset = (page - 1) * limit
		const search = url.searchParams.get('search') || ''

		const db = getRedirectablesDb()
		const statsDb = getStatsDb()
		let query = `
			SELECT
				l.id, l.domain_id, l.slug, l.keep_referrer, l.keep_query_params, l.redirect_code,
				l.created, l.changed, l.expire, l.comment, d.domain, ru.url, eu.url AS expired_url
			FROM links l
			JOIN domains d ON l.domain_id = d.id
			JOIN redirect_urls ru ON l.url_id = ru.id
			LEFT JOIN expired_urls eu ON l.expired_url_id = eu.id
		`
		const params = []
		if (search) {
			query += ' WHERE l.slug LIKE ? OR ru.url LIKE ? OR d.domain LIKE ?'
			params.push(`%${search}%`, `%${search}%`, `%${search}%`)
		}
		query += ' ORDER BY l.created DESC LIMIT ? OFFSET ?'
		params.push(limit, offset)
		const links = db.prepare(query).all(...params)
		const clickCounts = new Map()
		if (links.length > 0) {
			const linkIds = links.map(l => l.id)
			const placeholders = linkIds.map(() => '?').join(',')
			const rows = statsDb.prepare(`
				SELECT link_id, COUNT(*) as count
				FROM redirects
				WHERE link_id IN (${placeholders})
				GROUP BY link_id
			`).all(...linkIds)
			for (const row of rows) clickCounts.set(row.link_id, row.count)
		}
		let countQuery = 'SELECT COUNT(*) as total FROM links l JOIN redirect_urls ru ON l.url_id = ru.id JOIN domains d ON l.domain_id = d.id'
		if (search) {
			countQuery += ' WHERE l.slug LIKE ? OR ru.url LIKE ? OR d.domain LIKE ?'
		}
		const total = db.prepare(countQuery).get(...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])).total
		db.close()
		statsDb.close()
		sendJson(res, 200, {
			links: links.map(link => ({
				id: link.id,
				domain_id: link.domain_id,
				domain: link.domain,
				slug: link.slug,
				url: link.url,
				expired_url: link.expired_url,
				keep_referrer: link.keep_referrer === 1,
				keep_query_params: link.keep_query_params === 1,
				redirect_code: link.redirect_code,
				created: link.created,
				changed: link.changed,
				expire: link.expire,
				comment: link.comment,
				click_count: clickCounts.get(link.id) || 0
			})),
			pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
		})
	})

	router.post('/api/external/links', async (req, res) => {
		if (!requireApiKey(req, res, auth)) return
		try {
			const body = await parseBody(req)
			if (!body.domain || !body.slug || !body.url) {
				sendJson(res, 400, { error: 'domain, slug, and url are required' })
				return
			}
			if (body.url && !/\.\S+/.test(body.url)) {
				sendJson(res, 400, { error: 'URL must contain at least one top-level domain (e.g., .com, .org)' })
				return
			}
			const db = getRedirectablesDb()
			const transaction = db.transaction((data) => {
				const domainRow = db.prepare('SELECT id FROM domains WHERE domain = ?').get(data.domain)
				if (!domainRow) {
					throw new Error('Domain does not exist')
				}
				const domainId = domainRow.id
				const conflict = db.prepare('SELECT id FROM links WHERE domain_id = ? AND slug = ?').get(domainId, data.slug)
				if (conflict) {
					throw new Error('Slug already exists for this domain')
				}
				let urlId = db.prepare('SELECT id FROM redirect_urls WHERE url = ?').get(data.url)?.id
				if (!urlId) {
					urlId = db.prepare('INSERT INTO redirect_urls (url) VALUES (?)').run(data.url).lastInsertRowid
				}
				let expiredUrlId = null
				if (data.expired_url) {
					expiredUrlId = db.prepare('SELECT id FROM expired_urls WHERE url = ?').get(data.expired_url)?.id
					if (!expiredUrlId) {
						expiredUrlId = db.prepare('INSERT INTO expired_urls (url) VALUES (?)').run(data.expired_url).lastInsertRowid
					}
				}
				const now = Date.now()
				const result = db.prepare(`
					INSERT INTO links (
						domain_id, slug, url_id, expired_url_id,
						keep_referrer, keep_query_params, redirect_code,
						created, changed, expire, comment
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`).run(
					domainId,
					data.slug,
					urlId,
					expiredUrlId,
					data.keep_referrer ? 1 : 0,
					data.keep_query_params ? 1 : 0,
					data.redirect_code || 303,
					now,
					now,
					data.expire || null,
					data.comment || null
				)
				return { id: result.lastInsertRowid, domain_id: domainId, slug: data.slug }
			})
			const created = transaction(body)
			db.close()
			sendJson(res, 201, created)
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	router.put('/api/external/links/:id', async (req, res, params) => {
		if (!requireApiKey(req, res, auth)) return
		try {
			const body = await parseBody(req)
			if (body.url && !/\.\S+/.test(body.url)) {
				sendJson(res, 400, { error: 'URL must contain at least one top-level domain (e.g., .com, .org)' })
				return
			}
			const db = getRedirectablesDb()
			const existing = db.prepare('SELECT id, domain_id, slug FROM links WHERE id = ?').get(params.id)
			if (!existing) {
				db.close()
				sendJson(res, 404, { error: 'Link not found' })
				return
			}
			const transaction = db.transaction((data) => {
				let nextDomainId = existing.domain_id
				if (data.domain !== undefined) {
					const domainRow = db.prepare('SELECT id FROM domains WHERE domain = ?').get(data.domain)
					if (!domainRow) throw new Error('Domain does not exist')
					nextDomainId = domainRow.id
				}
				const nextSlug = data.slug !== undefined ? data.slug : existing.slug
				const conflict = db.prepare('SELECT id FROM links WHERE domain_id = ? AND slug = ? AND id != ?')
					.get(nextDomainId, nextSlug, params.id)
				if (conflict) throw new Error('Slug already exists for this domain')

				if (data.domain !== undefined) {
					db.prepare('UPDATE links SET domain_id = ? WHERE id = ?').run(nextDomainId, params.id)
				}
				if (data.url !== undefined) {
					let urlId = db.prepare('SELECT id FROM redirect_urls WHERE url = ?').get(data.url)?.id
					if (!urlId) {
						urlId = db.prepare('INSERT INTO redirect_urls (url) VALUES (?)').run(data.url).lastInsertRowid
					}
					db.prepare('UPDATE links SET url_id = ? WHERE id = ?').run(urlId, params.id)
				}
				if (data.expired_url !== undefined) {
					let expiredUrlId = null
					if (data.expired_url) {
						expiredUrlId = db.prepare('SELECT id FROM expired_urls WHERE url = ?').get(data.expired_url)?.id
						if (!expiredUrlId) {
							expiredUrlId = db.prepare('INSERT INTO expired_urls (url) VALUES (?)').run(data.expired_url).lastInsertRowid
						}
					}
					db.prepare('UPDATE links SET expired_url_id = ? WHERE id = ?').run(expiredUrlId, params.id)
				}

				db.prepare(`
					UPDATE links SET
						slug = COALESCE(?, slug),
						keep_referrer = COALESCE(?, keep_referrer),
						keep_query_params = COALESCE(?, keep_query_params),
						redirect_code = COALESCE(?, redirect_code),
						changed = ?,
						expire = ?,
						comment = COALESCE(?, comment)
					WHERE id = ?
				`).run(
					data.slug || null,
					data.keep_referrer !== undefined ? (data.keep_referrer ? 1 : 0) : null,
					data.keep_query_params !== undefined ? (data.keep_query_params ? 1 : 0) : null,
					data.redirect_code || null,
					Date.now(),
					data.expire || null,
					data.comment || null,
					params.id
				)
			})
			transaction(body)
			db.close()
			sendJson(res, 200, { success: true })
		} catch (err) {
			sendJson(res, 400, { error: err.message || 'Invalid request' })
		}
	})

	router.delete('/api/external/links/:id', (req, res, params) => {
		if (!requireApiKey(req, res, auth)) return
		const db = getRedirectablesDb()
		const result = db.prepare('DELETE FROM links WHERE id = ?').run(params.id)
		db.close()
		if (result.changes === 0) {
			sendJson(res, 404, { error: 'Link not found' })
			return
		}
		sendJson(res, 200, { success: true })
	})

	router.get('/api/external/stats', (req, res) => {
		if (!requireApiKey(req, res, auth)) return
		const url = new URL(req.url, 'http://localhost')
		const period = url.searchParams.get('period') || 'day'
		const linkId = url.searchParams.get('linkId')
		const statsDb = getStatsDb()
		const redirectablesDb = getRedirectablesDb()
		const now = Date.now()
		let startTime
		let prevStartTime
		switch (period) {
			case 'day':
				startTime = now - 24 * 60 * 60 * 1000
				prevStartTime = startTime - 24 * 60 * 60 * 1000
				break
			case 'week':
				startTime = now - 7 * 24 * 60 * 60 * 1000
				prevStartTime = startTime - 7 * 24 * 60 * 60 * 1000
				break
			case 'month':
				startTime = now - 30 * 24 * 60 * 60 * 1000
				prevStartTime = startTime - 30 * 24 * 60 * 60 * 1000
				break
			case 'year':
				startTime = now - 365 * 24 * 60 * 60 * 1000
				prevStartTime = startTime - 365 * 24 * 60 * 60 * 1000
				break
			case 'all': {
				let earliestQuery = 'SELECT MIN(timestamp) as earliest FROM redirects'
				const earliestParams = []
				if (linkId) {
					earliestQuery += ' WHERE link_id = ?'
					earliestParams.push(linkId)
				}
				const earliestResult = statsDb.prepare(earliestQuery).get(...earliestParams)
				startTime = earliestResult?.earliest || now
				prevStartTime = startTime
				break
			}
			default:
				startTime = 0
				prevStartTime = 0
		}
		let query = 'SELECT * FROM redirects WHERE timestamp >= ?'
		const params = [startTime]
		if (linkId) {
			query += ' AND link_id = ?'
			params.push(linkId)
		}
		query += ' ORDER BY timestamp ASC'
		const redirects = statsDb.prepare(query).all(...params)
		const deviceCounts = {}
		const osCounts = {}
		const browserCounts = {}
		const referralCounts = {}
		let totalClicks = 0
		let prevTotalClicks = 0
		for (const redirect of redirects) {
			if (redirect.timestamp >= startTime) totalClicks++
			else if (redirect.timestamp >= prevStartTime) prevTotalClicks++
			if (redirect.user_agent_string) {
				const parser = new UAParser(redirect.user_agent_string)
				const device = parser.getDevice().type || 'pc'
				const os = parser.getOS().name || 'unknown'
				const browser = parser.getBrowser().name || 'unknown'
				deviceCounts[device] = (deviceCounts[device] || 0) + 1
				osCounts[os] = (osCounts[os] || 0) + 1
				browserCounts[browser] = (browserCounts[browser] || 0) + 1
			}
			if (redirect.referral_url) {
				try {
					const referralDomain = new URL(redirect.referral_url).hostname
					referralCounts[referralDomain] = (referralCounts[referralDomain] || 0) + 1
				} catch {}
			}
		}
		if (period !== 'all') {
			let prevQuery = 'SELECT COUNT(*) as count FROM redirects WHERE timestamp >= ? AND timestamp < ?'
			const prevParams = [prevStartTime, startTime]
			if (linkId) {
				prevQuery += ' AND link_id = ?'
				prevParams.push(linkId)
			}
			prevTotalClicks = statsDb.prepare(prevQuery).get(...prevParams).count
		} else {
			prevTotalClicks = 0
		}
		const topLinksRows = statsDb.prepare(`
			SELECT link_id, COUNT(*) as count
			FROM redirects
			WHERE timestamp >= ?
			GROUP BY link_id
			ORDER BY count DESC
			LIMIT 10
		`).all(startTime)
		const topLinks = []
		for (const row of topLinksRows) {
			const link = redirectablesDb.prepare(`
				SELECT l.slug, d.domain
				FROM links l
				JOIN domains d ON l.domain_id = d.id
				WHERE l.id = ?
			`).get(row.link_id)
			if (link) {
				topLinks.push({ id: row.link_id, slug: link.slug, domain: link.domain, count: row.count })
			}
		}
		statsDb.close()
		redirectablesDb.close()
		const topDevices = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }))
		const topOSes = Object.entries(osCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }))
		const topBrowsers = Object.entries(browserCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }))
		const topReferrals = Object.entries(referralCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }))
		const timeSeries = []
		const bucketSize = period === 'day' ? 60 * 60 * 1000 :
			period === 'week' ? 24 * 60 * 60 * 1000 :
			period === 'month' ? 24 * 60 * 60 * 1000 :
			period === 'year' ? 7 * 24 * 60 * 60 * 1000 :
			period === 'all' ? 30 * 24 * 60 * 60 * 1000 :
			30 * 24 * 60 * 60 * 1000
		for (let time = startTime; time <= now; time += bucketSize) {
			const bucketEnd = Math.min(time + bucketSize, now)
			const count = redirects.filter(r => r.timestamp >= time && r.timestamp < bucketEnd).length
			let prevCount = 0
			if (period !== 'all') {
				const prevTime = time - (now - startTime)
				const prevBucketEnd = prevTime + bucketSize
				prevCount = redirects.filter(r => r.timestamp >= prevTime && r.timestamp < prevBucketEnd).length
			}
			timeSeries.push({ time: Math.floor(time / 1000), count, prevCount })
		}
		sendJson(res, 200, {
			period,
			totalClicks,
			prevTotalClicks,
			topLinks,
			topDevices,
			topOSes,
			topBrowsers,
			topReferrals,
			timeSeries
		})
	})
}

// Logs endpoints
export function setupLogsRoutes(router, auth) {
	router.get('/api/logs', (req, res) => {
		if (!auth.requireAuth(req)) {
			sendJson(res, 401, { error: 'Unauthorized' })
			return
		}

		const url = new URL(req.url, 'http://localhost')
		const page = parseInt(url.searchParams.get('page') || '1') || 1
		const limit = parseInt(url.searchParams.get('limit') || '50') || 50
		const offset = (page - 1) * limit
		
		// Validate page and limit are valid numbers
		if (isNaN(page) || isNaN(limit) || isNaN(offset) || page < 1 || limit < 1) {
			sendJson(res, 400, { error: 'Invalid page or limit parameters' })
			return
		}
		const search = url.searchParams.get('search') || ''
		// Validate search is a non-empty string
		const hasSearch = search && typeof search === 'string' && search.trim().length > 0
		const eventType = url.searchParams.get('eventType') || 'all' // all, main, domain, link
		const action = url.searchParams.get('action') || '' // specific action filter
		const startDate = url.searchParams.get('startDate') || ''
		const endDate = url.searchParams.get('endDate') || ''
		const sortOrder = url.searchParams.get('sortOrder') || 'desc' // asc or desc

		const logsDb = getLogsDb()
		
		// Helper function to safely parse dates
		function parseDate(dateStr) {
			if (!dateStr) return null
			const date = new Date(dateStr)
			const timestamp = date.getTime()
			return isNaN(timestamp) ? null : timestamp
		}

		// Parse dates safely
		const startTimestamp = parseDate(startDate)
		const endTimestamp = parseDate(endDate ? endDate + 'T23:59:59' : null)

		// Build WHERE conditions and parameters
		const conditions = []
		const baseParams = []

		// Date range filter
		if (startTimestamp !== null) {
			conditions.push('timestamp >= ?')
			baseParams.push(startTimestamp)
		}
		if (endTimestamp !== null) {
			conditions.push('timestamp <= ?')
			baseParams.push(endTimestamp)
		}

		// Action filter
		if (action) {
			conditions.push('action = ?')
			baseParams.push(action)
		}

		// Search filter (search in ip_address, browser_agent_string, and diff only)
		const searchPattern = hasSearch ? `%${search.trim()}%` : null

		// Build UNION query for all selected log tables
		// Each UNION part needs its own copy of parameters
		const unionParts = []
		const unionParams = []
		
		if (eventType === 'all' || eventType === 'main') {
			let mainWhereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''
			if (hasSearch) {
				// Search in ip_address, browser_agent_string, and diff
				const searchCondition = '(ip_address LIKE ? OR browser_agent_string LIKE ? OR diff LIKE ?)'
				if (mainWhereClause) {
					mainWhereClause += ' AND ' + searchCondition
				} else {
					mainWhereClause = ' WHERE ' + searchCondition
				}
			}
			// Force to string to prevent any NaN issues
			mainWhereClause = String(mainWhereClause || '')
			unionParts.push(`
				SELECT id, ip_address, browser_agent_string, timestamp, action, NULL as item_id, diff, 'main' as log_type
				FROM main_logs${mainWhereClause}
			`)
			const mainParams = [...baseParams]
			if (hasSearch) {
				mainParams.push(searchPattern, searchPattern, searchPattern)
			}
			unionParams.push(...mainParams)
		}
		if (eventType === 'all' || eventType === 'domain') {
			// Build domain conditions
			const domainConditions = []
			if (startTimestamp !== null) {
				domainConditions.push('timestamp >= ?')
			}
			if (endTimestamp !== null) {
				domainConditions.push('timestamp <= ?')
			}
			if (action) {
				domainConditions.push('action = ?')
			}
			if (hasSearch) {
				// Search in ip_address, browser_agent_string, and diff
				domainConditions.push('(ip_address LIKE ? OR browser_agent_string LIKE ? OR diff LIKE ?)')
			}
			
			const domainWhereClause = domainConditions.length > 0 ? ' WHERE ' + domainConditions.join(' AND ') : ''
			const domainParams = []
			if (startTimestamp !== null) domainParams.push(startTimestamp)
			if (endTimestamp !== null) domainParams.push(endTimestamp)
			if (action) domainParams.push(action)
			if (hasSearch) {
				domainParams.push(searchPattern, searchPattern, searchPattern)
			}
			
			unionParts.push(`
				SELECT 
					id, 
					ip_address, 
					browser_agent_string, 
					timestamp, 
					action, 
					item_id, 
					diff, 
					'domain' as log_type
				FROM domain_logs${domainWhereClause}
			`)
			unionParams.push(...domainParams)
		}
		if (eventType === 'all' || eventType === 'link') {
			// Build link conditions
			const linkConditions = []
			if (startTimestamp !== null) {
				linkConditions.push('timestamp >= ?')
			}
			if (endTimestamp !== null) {
				linkConditions.push('timestamp <= ?')
			}
			if (action) {
				linkConditions.push('action = ?')
			}
			if (hasSearch) {
				// Search in ip_address, browser_agent_string, and diff
				linkConditions.push('(ip_address LIKE ? OR browser_agent_string LIKE ? OR diff LIKE ?)')
			}
			
			const linkWhereClause = linkConditions.length > 0 ? ' WHERE ' + linkConditions.join(' AND ') : ''
			const linkParams = []
			if (startTimestamp !== null) linkParams.push(startTimestamp)
			if (endTimestamp !== null) linkParams.push(endTimestamp)
			if (action) linkParams.push(action)
			if (hasSearch) {
				linkParams.push(searchPattern, searchPattern, searchPattern)
			}
			
			unionParts.push(`
				SELECT 
					id, 
					ip_address, 
					browser_agent_string, 
					timestamp, 
					action, 
					item_id, 
					diff, 
					'link' as log_type
				FROM link_logs${linkWhereClause}
			`)
			unionParams.push(...linkParams)
		}

		if (unionParts.length === 0) {
			logsDb.close()
			sendJson(res, 200, {
				logs: [],
				pagination: { page, limit, total: 0, totalPages: 0 },
				actions: []
			})
			return
		}

		// Build the complete query with UNION ALL
		// Wrap in subquery to allow ORDER BY on timestamp
		let query = `
			SELECT * FROM (
				${unionParts.join(' UNION ALL ')}
			) ORDER BY timestamp ${sortOrder.toUpperCase()}
		`

		// Pagination
		query += ` LIMIT ? OFFSET ?`
		const queryParams = [...unionParams, limit, offset]

		// Validate all parameters are not NaN
		for (let i = 0; i < queryParams.length; i++) {
			const param = queryParams[i]
			if (typeof param === 'number' && isNaN(param)) {
				logsDb.close()
				sendJson(res, 500, { error: `Invalid parameter at index ${i}: NaN detected` })
				return
			}
		}
		const validParams = queryParams

		// Execute query
		let logs
		try {
			const stmt = logsDb.prepare(query)
			logs = stmt.all(...validParams).map(log => ({
				...log,
				diff: log.diff ? JSON.parse(log.diff) : null
			}))
		} catch (err) {
			logsDb.close()
			console.error('Query error:', err)
			sendJson(res, 500, { error: 'Database query failed', details: err.message })
			return
		}
		
		// Fetch item names from redirectables database
		const redirectablesDb = getRedirectablesDb()
		const itemNames = new Map()
		
		// Get domain names
		const domainIds = logs.filter(log => log.log_type === 'domain' && log.item_id).map(log => log.item_id)
		if (domainIds.length > 0) {
			const placeholders = domainIds.map(() => '?').join(',')
			const domainStmt = redirectablesDb.prepare(`SELECT id, domain FROM domains WHERE id IN (${placeholders})`)
			const domains = domainStmt.all(...domainIds)
			for (const domain of domains) {
				itemNames.set(`domain-${domain.id}`, domain.domain)
			}
		}
		
		// Get link domain/slug combinations
		const linkIds = logs.filter(log => log.log_type === 'link' && log.item_id).map(log => log.item_id)
		if (linkIds.length > 0) {
			const placeholders = linkIds.map(() => '?').join(',')
			const linkStmt = redirectablesDb.prepare(`
				SELECT l.id, d.domain, l.slug
				FROM links l
				JOIN domains d ON l.domain_id = d.id
				WHERE l.id IN (${placeholders})
			`)
			const links = linkStmt.all(...linkIds)
			for (const link of links) {
				itemNames.set(`link-${link.id}`, `${link.domain}/${link.slug}`)
			}
		}
		
		redirectablesDb.close()
		
		// Add item_name to each log
		for (const log of logs) {
			if (log.log_type === 'domain' && log.item_id) {
				log.item_name = itemNames.get(`domain-${log.item_id}`) || null
			} else if (log.log_type === 'link' && log.item_id) {
				log.item_name = itemNames.get(`link-${log.item_id}`) || null
			} else {
				log.item_name = null
			}
		}

		// Get total count for pagination - build count queries for each table
		let total = 0
		if (eventType === 'all' || eventType === 'main') {
			const mainCountConditions = []
			const mainCountParams = []
			if (startTimestamp !== null) {
				mainCountConditions.push('timestamp >= ?')
				mainCountParams.push(startTimestamp)
			}
			if (endTimestamp !== null) {
				mainCountConditions.push('timestamp <= ?')
				mainCountParams.push(endTimestamp)
			}
			if (action) {
				mainCountConditions.push('action = ?')
				mainCountParams.push(action)
			}
			if (hasSearch) {
				mainCountConditions.push('(ip_address LIKE ? OR browser_agent_string LIKE ? OR diff LIKE ?)')
				mainCountParams.push(searchPattern, searchPattern, searchPattern)
			}
			const mainCountWhereClause = mainCountConditions.length > 0 ? ' WHERE ' + mainCountConditions.join(' AND ') : ''
			// Validate parameters
			for (const param of mainCountParams) {
				if (typeof param === 'number' && isNaN(param)) {
					throw new Error('Invalid parameter: NaN detected in main count query')
				}
			}
			const countStmt = logsDb.prepare(`SELECT COUNT(*) as count FROM main_logs${mainCountWhereClause}`)
			total += countStmt.get(...mainCountParams).count
		}
		if (eventType === 'all' || eventType === 'domain') {
			const domainCountConditions = []
			const domainCountParams = []
			if (startTimestamp !== null) {
				domainCountConditions.push('timestamp >= ?')
				domainCountParams.push(startTimestamp)
			}
			if (endTimestamp !== null) {
				domainCountConditions.push('timestamp <= ?')
				domainCountParams.push(endTimestamp)
			}
			if (action) {
				domainCountConditions.push('action = ?')
				domainCountParams.push(action)
			}
			if (hasSearch) {
				domainCountConditions.push('(ip_address LIKE ? OR browser_agent_string LIKE ? OR diff LIKE ?)')
				domainCountParams.push(searchPattern, searchPattern, searchPattern)
			}
			const domainCountWhereClause = domainCountConditions.length > 0 ? ' WHERE ' + domainCountConditions.join(' AND ') : ''
			// Validate parameters
			for (const param of domainCountParams) {
				if (typeof param === 'number' && isNaN(param)) {
					throw new Error('Invalid parameter: NaN detected in domain count query')
				}
			}
			const countStmt = logsDb.prepare(`SELECT COUNT(*) as count FROM domain_logs${domainCountWhereClause}`)
			total += countStmt.get(...domainCountParams).count
		}
		if (eventType === 'all' || eventType === 'link') {
			const linkCountConditions = []
			const linkCountParams = []
			if (startTimestamp !== null) {
				linkCountConditions.push('timestamp >= ?')
				linkCountParams.push(startTimestamp)
			}
			if (endTimestamp !== null) {
				linkCountConditions.push('timestamp <= ?')
				linkCountParams.push(endTimestamp)
			}
			if (action) {
				linkCountConditions.push('action = ?')
				linkCountParams.push(action)
			}
			if (hasSearch) {
				linkCountConditions.push('(ip_address LIKE ? OR browser_agent_string LIKE ? OR diff LIKE ?)')
				linkCountParams.push(searchPattern, searchPattern, searchPattern)
			}
			const linkCountWhereClause = linkCountConditions.length > 0 ? ' WHERE ' + linkCountConditions.join(' AND ') : ''
			// Validate parameters
			for (const param of linkCountParams) {
				if (typeof param === 'number' && isNaN(param)) {
					throw new Error('Invalid parameter: NaN detected in link count query')
				}
			}
			const countStmt = logsDb.prepare(`SELECT COUNT(*) as count FROM link_logs${linkCountWhereClause}`)
			total += countStmt.get(...linkCountParams).count
		}

		// Get unique actions for filter dropdown
		const allActionsStmt = logsDb.prepare(`
			SELECT DISTINCT action FROM main_logs
			UNION
			SELECT DISTINCT action FROM domain_logs
			UNION
			SELECT DISTINCT action FROM link_logs
			ORDER BY action
		`)
		const uniqueActions = allActionsStmt.all().map(row => row.action)

		logsDb.close()

		sendJson(res, 200, {
			logs,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit)
			},
			actions: uniqueActions
		})
	})
}

