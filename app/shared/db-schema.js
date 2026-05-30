// Single source of truth for which SQLite databases exist and their migration lists.
// Used by init-db (applies pending migrations) and check-schema (asserts versions when a
// service boots). Each entry is [label, openDb, migrations]; the expected user_version of
// a database is simply its migration count.

import { getMainDb, getRedirectablesDb, getStatsDb, getLogsDb } from './db.js'
import mainMigrations from './migrations/main.js'
import redirectablesMigrations from './migrations/redirectables.js'
import statsMigrations from './migrations/stats.js'
import logsMigrations from './migrations/logs.js'

export const dbSteps = [
	['main', getMainDb, mainMigrations],
	['redirectables', getRedirectablesDb, redirectablesMigrations],
	['stats', getStatsDb, statsMigrations],
	['logs', getLogsDb, logsMigrations]
]
