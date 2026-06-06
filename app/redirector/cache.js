import { getRedirectablesDb, getMainDb } from '../shared/db.js'

class Cache {
	constructor() {
		this.domains = [] // [[id, domain], ...]
		this.domainOverrides = new Map() // id -> override row
		this.links = []
		this.settings = {}
		this.defaults = {}
		this.load()
	}

	load() {
		const redirectablesDb = getRedirectablesDb()
		const mainDb = getMainDb()

		const domainsStmt = redirectablesDb.prepare(`
			SELECT
				d.id,
				d.domain,
				d.expired_url_id,
				d.redirect_code,
				d.keep_referrer,
				d.keep_query_params,
				d.error_404_url,
				d.error_500_url,
				eu.url AS expired_url
			FROM domains d
			LEFT JOIN expired_urls eu ON d.expired_url_id = eu.id
		`)
		const domainRows = domainsStmt.all()
		this.domains = domainRows.map(row => [row.id, row.domain])
		this.domainOverrides = new Map()
		for (const row of domainRows) {
			this.domainOverrides.set(row.id, {
				expired_url: row.expired_url || null,
				redirect_code: row.redirect_code,
				keep_referrer: row.keep_referrer,
				keep_query_params: row.keep_query_params,
				error_404_url: row.error_404_url || null,
				error_500_url: row.error_500_url || null
			})
		}

		const settingsStmt = mainDb.prepare('SELECT key, value FROM settings')
		this.settings = {}
		for (const row of settingsStmt.all()) {
			this.settings[row.key] = row.value
		}

		const defaultsStmt = mainDb.prepare('SELECT key, value FROM defaults')
		this.defaults = {}
		for (const row of defaultsStmt.all()) {
			this.defaults[row.key] = row.value
		}

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
		this.links = linksStmt.all().map(row => ({
			id: row.id,
			domain_id: row.domain_id,
			slug: row.slug,
			url: row.url,
			expired_url: row.expired_url || null,
			keep_referrer: row.keep_referrer,
			keep_query_params: row.keep_query_params,
			redirect_code: row.redirect_code,
			created: row.created,
			changed: row.changed,
			expire: row.expire,
			comment: row.comment
		}))

		redirectablesDb.close()
		mainDb.close()
	}

	findDomain(hostname) {
		return this.domains.find(([, domain]) => domain === hostname)
	}

	findLink(domainId, slug) {
		const cleanSlug = slug.replace(/^\/+|\/+$/g, '')
		return this.links.find(link =>
			link.domain_id === domainId && link.slug === cleanSlug
		)
	}

	getDomainOverrides(domainId) {
		return this.domainOverrides.get(domainId) || null
	}

	getDefault(key) {
		return this.defaults[key]
	}

	getSetting(key) {
		return this.settings[key]
	}
}

export default new Cache()
