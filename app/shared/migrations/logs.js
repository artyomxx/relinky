// Migrations for logs.db (main_logs, domain_logs, link_logs).
// Index 0 => user_version 1.

export default [
	{
		name: 'baseline',
		up(db) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS main_logs (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					ip_address TEXT,
					browser_agent_string TEXT,
					timestamp INTEGER NOT NULL,
					action TEXT NOT NULL,
					diff TEXT
				);

				CREATE TABLE IF NOT EXISTS domain_logs (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					ip_address TEXT,
					browser_agent_string TEXT,
					timestamp INTEGER NOT NULL,
					action TEXT NOT NULL,
					item_id INTEGER,
					diff TEXT
				);

				CREATE TABLE IF NOT EXISTS link_logs (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					ip_address TEXT,
					browser_agent_string TEXT,
					timestamp INTEGER NOT NULL,
					action TEXT NOT NULL,
					item_id INTEGER,
					diff TEXT
				);

				CREATE INDEX IF NOT EXISTS idx_main_logs_timestamp ON main_logs(timestamp);
				CREATE INDEX IF NOT EXISTS idx_domain_logs_timestamp ON domain_logs(timestamp);
				CREATE INDEX IF NOT EXISTS idx_link_logs_timestamp ON link_logs(timestamp);
			`)
		}
	}
]
