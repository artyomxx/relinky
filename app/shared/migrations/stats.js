// Migrations for stats.db (redirects, redirect_query_params).
// Index 0 => user_version 1.

export default [
	{
		name: 'baseline',
		up(db) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS redirects (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					link_id INTEGER NOT NULL,
					normal_url_id INTEGER NOT NULL,
					expired_url_id INTEGER,
					expired INTEGER NOT NULL DEFAULT 0,
					timestamp INTEGER NOT NULL,
					client_ip TEXT,
					referral_url TEXT,
					query_params_string TEXT,
					language TEXT,
					user_agent_string TEXT,
					device TEXT,
					os TEXT,
					browser TEXT
				);

				CREATE TABLE IF NOT EXISTS redirect_query_params (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					redirect_id INTEGER NOT NULL,
					key TEXT NOT NULL,
					value TEXT,
					FOREIGN KEY (redirect_id) REFERENCES redirects(id)
				);

				CREATE INDEX IF NOT EXISTS idx_redirects_link_timestamp ON redirects(link_id, timestamp);
				CREATE INDEX IF NOT EXISTS idx_redirect_query_params_redirect ON redirect_query_params(redirect_id);
			`)
		}
	}
]
