import { getRedirectablesDb, getMainDb } from '../shared/db.js'

class Cache {
	constructor() {
		this.domains = [] // [[id, domain], ...]
		this.links = [] // [{id, domain_id, slug, url, expired_url, redirect_code, expire, ...}, ...]
		this.settings = {}
		this.defaults = {}
		this.load()
	}

	load() {
		const redirectablesDb = getRedirectablesDb()
		const mainDb = getMainDb()

		// Load domains: [[id, domain], ...]
		const domainsStmt = redirectablesDb.prepare('SELECT id, domain FROM domains')
		this.domains = domainsStmt.all().map(row => [row.id, row.domain])

		// Load settings
		const settingsStmt = mainDb.prepare('SELECT key, value FROM settings')
		const settingsRows = settingsStmt.all()
		this.settings = {}
		for (const row of settingsRows) {
			this.settings[row.key] = row.value
		}

		// Load defaults
		const defaultsStmt = mainDb.prepare('SELECT key, value FROM defaults')
		const defaultsRows = defaultsStmt.all()
		this.defaults = {}
		for (const row of defaultsRows) {
			this.defaults[row.key] = row.value
		}

		// Load links with pre-filled relations
		const linksStmt = redirectablesDb.prepare(`
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
				ru.url,
				eu.url AS expired_url
			FROM links l
			JOIN redirect_urls ru ON l.url_id = ru.id
			LEFT JOIN expired_urls eu ON l.expired_url_id = eu.id
		`)
		const linksRows = linksStmt.all()
		this.links = linksRows.map(row => ({
			id: row.id,
			domain_id: row.domain_id,
			slug: row.slug,
			url: row.url,
			expired_url: row.expired_url,
			keep_referrer: row.keep_referrer === 1,
			keep_query_params: row.keep_query_params === 1,
			redirect_code: row.redirect_code || parseInt(this.defaults.redirect_code) || 303,
			created: row.created,
			changed: row.changed,
			expire: row.expire,
			comment: row.comment
		}))

		redirectablesDb.close()
		mainDb.close()
	}

	findDomain(hostname) {
		return this.domains.find(([id, domain]) => domain === hostname)
	}

	findLink(domainId, slug) {
		// Clean slug: remove leading/trailing slashes
		const cleanSlug = slug.replace(/^\/+|\/+$/g, '')
		return this.links.find(link => 
			link.domain_id === domainId && link.slug === cleanSlug
		)
	}

	getDefault(key) {
		return this.defaults[key]
	}

	getSetting(key) {
		return this.settings[key]
	}
}

export default new Cache()

