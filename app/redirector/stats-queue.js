import { getStatsDb } from '../shared/db.js'

class StatsQueue {
	constructor() {
		this.queue = []
		this.batchSize = 100
		this.flushInterval = 5000 // 5 seconds
		this.timer = null
		this.startTimer()
	}

	startTimer() {
		this.timer = setInterval(() => {
			this.flush()
		}, this.flushInterval)
	}

	add(stat) {
		this.queue.push(stat)
		if (this.queue.length >= this.batchSize) {
			this.flush()
		}
	}

	flush() {
		if (this.queue.length === 0) return

		const statsDb = getStatsDb()
		const insertRedirect = statsDb.prepare(`
			INSERT INTO redirects (
				link_id, normal_url_id, expired_url_id, expired,
				timestamp, client_ip, referral_url, query_params_string,
				language, user_agent_string
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)

		const insertQueryParam = statsDb.prepare(`
			INSERT INTO redirect_query_params (redirect_id, key, value)
			VALUES (?, ?, ?)
		`)

		const transaction = statsDb.transaction((items) => {
			for (const item of items) {
				const result = insertRedirect.run(
					item.link_id,
					item.normal_url_id,
					item.expired_url_id || null,
					item.expired ? 1 : 0,
					item.timestamp,
					item.client_ip || null,
					item.referral_url || null,
					item.query_params_string || null,
					item.language || null,
					item.user_agent_string || null
				)

				// Insert query params if any
				if (item.query_params && Object.keys(item.query_params).length > 0) {
					const redirectId = result.lastInsertRowid
					for (const [key, value] of Object.entries(item.query_params)) {
						insertQueryParam.run(redirectId, key, value)
					}
				}
			}
		})

		const items = this.queue.splice(0)
		transaction(items)
		statsDb.close()

		if (items.length > 0) {
			console.log(`[StatsQueue] Flushed ${items.length} stats`)
		}
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
		this.flush() // Final flush
	}
}

export default new StatsQueue()

