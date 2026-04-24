import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth.js'

export const useLogsStore = defineStore('logs', () => {
	const logs = ref([])
	const pagination = ref({ page: 1, limit: 50, total: 0, totalPages: 0 })
	const search = ref('')
	const eventType = ref('all') // all, main, domain, link
	const action = ref('')
	const startDate = ref('')
	const endDate = ref('')
	const sortOrder = ref('desc') // asc or desc
	const actions = ref([])
	const loading = ref(false)

	const authStore = useAuthStore()

	async function fetchLogs(page = 1) {
		// Don't set loading to true if we already have data (to prevent blinking)
		if (logs.value.length === 0) {
			loading.value = true
		}
		try {
			const params = new URLSearchParams({
				page: page.toString(),
				limit: '50',
				...(search.value && { search: search.value }),
				...(eventType.value !== 'all' && { eventType: eventType.value }),
				...(action.value && { action: action.value }),
				...(startDate.value && { startDate: startDate.value }),
				...(endDate.value && { endDate: endDate.value }),
				sortOrder: sortOrder.value
			})

			const response = await authStore.authedFetch(`/api/logs?${params}`)

			if (!response.ok) throw new Error('Failed to fetch logs')

			const data = await response.json()
			logs.value = data.logs
			pagination.value = data.pagination
			actions.value = data.actions || []
			loading.value = false
		} catch (err) {
			console.error('Error fetching logs:', err)
			loading.value = false
		}
	}

	function resetFilters() {
		search.value = ''
		eventType.value = 'all'
		action.value = ''
		startDate.value = ''
		endDate.value = ''
		sortOrder.value = 'desc'
		fetchLogs(1)
	}

	return {
		logs,
		pagination,
		search,
		eventType,
		action,
		startDate,
		endDate,
		sortOrder,
		actions,
		loading,
		fetchLogs,
		resetFilters
	}
})

