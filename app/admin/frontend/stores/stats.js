import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth.js'

export const useStatsStore = defineStore('stats', () => {
	const stats = ref(null)
	const loading = ref(false)
	const period = ref('day')
	const linkId = ref(null)

	const authStore = useAuthStore()

	async function fetchStats(p = period.value, link = linkId.value) {
		// Don't set loading to true if we already have data (to prevent blinking)
		if (!stats.value) {
			loading.value = true
		}
		period.value = p
		linkId.value = link

		try {
			const params = new URLSearchParams({ period: p })
			if (link) params.append('linkId', link)

			const response = await authStore.authedFetch(`/api/stats?${params}`)

			if (!response.ok) throw new Error('Failed to fetch stats')

			stats.value = await response.json()
			loading.value = false
		} catch (err) {
			console.error('Error fetching stats:', err)
			loading.value = false
		}
	}

	return {
		stats,
		loading,
		period,
		linkId,
		fetchStats
	}
})

