// Migrations for main.db (settings, defaults, api_keys).
// Index 0 => user_version 1.

export default [
	{
		name: 'baseline',
		up(db) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS settings (
					id INTEGER PRIMARY KEY,
					key TEXT UNIQUE NOT NULL,
					value TEXT
				);

				CREATE TABLE IF NOT EXISTS defaults (
					id INTEGER PRIMARY KEY,
					key TEXT UNIQUE NOT NULL,
					value TEXT
				);

				CREATE TABLE IF NOT EXISTS api_keys (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL,
					key_id TEXT UNIQUE NOT NULL,
					secret_hash TEXT NOT NULL,
					enabled INTEGER NOT NULL DEFAULT 1,
					allowed_ips_json TEXT,
					created INTEGER NOT NULL,
					changed INTEGER NOT NULL,
					last_used_at INTEGER,
					last_used_ip TEXT
				);

				CREATE INDEX IF NOT EXISTS idx_api_keys_key_id ON api_keys(key_id);
				CREATE INDEX IF NOT EXISTS idx_api_keys_enabled ON api_keys(enabled);
			`)
		}
	}
]
