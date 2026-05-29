// Migrations for redirectables.db (domains, redirect_urls, expired_urls, links).
// Index 0 => user_version 1.

export default [
	{
		name: 'baseline',
		up(db) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS domains (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					domain TEXT UNIQUE NOT NULL
				);

				CREATE TABLE IF NOT EXISTS redirect_urls (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					url TEXT NOT NULL
				);

				CREATE TABLE IF NOT EXISTS expired_urls (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					url TEXT NOT NULL
				);

				CREATE TABLE IF NOT EXISTS links (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					domain_id INTEGER NOT NULL,
					slug TEXT NOT NULL,
					url_id INTEGER NOT NULL,
					expired_url_id INTEGER,
					keep_referrer INTEGER DEFAULT 0,
					keep_query_params INTEGER DEFAULT 0,
					redirect_code INTEGER DEFAULT 303,
					created INTEGER NOT NULL,
					changed INTEGER NOT NULL,
					expire INTEGER,
					comment TEXT,
					UNIQUE(domain_id, slug),
					FOREIGN KEY (domain_id) REFERENCES domains(id),
					FOREIGN KEY (url_id) REFERENCES redirect_urls(id),
					FOREIGN KEY (expired_url_id) REFERENCES expired_urls(id)
				);

				CREATE INDEX IF NOT EXISTS idx_links_domain_slug ON links(domain_id, slug);
			`)
		}
	}
]
