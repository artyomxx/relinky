import { getMainDb, getRedirectablesDb, getStatsDb, getLogsDb } from './db.js'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, '../../db')

// Ensure db directory exists
await mkdir(dbPath, { recursive: true })

// Initialize Main DB
const mainDb = getMainDb()
mainDb.exec(`
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
mainDb.close()

// Initialize Redirectables DB
const redirectablesDb = getRedirectablesDb()
redirectablesDb.exec(`
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
redirectablesDb.close()

// Initialize Stats DB
const statsDb = getStatsDb()
statsDb.exec(`
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
statsDb.close()

// Initialize Logs DB
const logsDb = getLogsDb()
logsDb.exec(`
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
logsDb.close()

console.log('Databases initialized successfully')

