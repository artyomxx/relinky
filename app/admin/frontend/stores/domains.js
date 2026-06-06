import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth.js'

export const useDomainsStore = defineStore('domains', () => {
	const domains = ref([])
	// Global defaults shown on the Domains page: `settings` = error URLs, `defaults` = link defaults.
	const settings = ref({})
	const defaults = ref({})
	const overridesById = ref({})
	const loading = ref(false)

	const authStore = useAuthStore()

	async function fetchDomains() {
		// Don't set loading to true if we already have data (to prevent blinking)
		if (domains.value.length === 0) {
			loading.value = true
		}
		try {
			const response = await authStore.authedFetch('/api/domains')

			if (!response.ok) throw new Error('Failed to fetch domains')

			const data = await response.json()
			domains.value = data.domains || []
			loading.value = false
		} catch (err) {
			console.error('Error fetching domains:', err)
			loading.value = false
		}
	}

	async function fetchDefaults(silent = false) {
		// Don't set loading to true if we already have data (to prevent blinking)
		if (!silent && Object.keys(settings.value).length === 0 && Object.keys(defaults.value).length === 0) {
			loading.value = true
		}
		try {
			const response = await authStore.authedFetch('/api/domains/defaults')

			if (!response.ok) throw new Error('Failed to fetch defaults')

			const data = await response.json()
			settings.value = data.settings || {}
			defaults.value = data.defaults || {}
			if (!silent) {
				loading.value = false
			}
		} catch (err) {
			console.error('Error fetching defaults:', err)
			if (!silent) {
				loading.value = false
			}
		}
	}

	async function updateDefaults(newSettings, newDefaults) {
		const response = await authStore.authedFetch('/api/domains/defaults', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify({
				settings: newSettings,
				defaults: newDefaults
			})
		})

		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to update defaults')
		}

		// Refetch silently to ensure values were saved correctly
		await fetchDefaults(true)
	}

	async function createDomain(domain) {
		const headers = {
			'Content-Type': 'application/json',
			...authStore.getAuthHeader()
		}

		if (!headers.Authorization) {
			throw new Error('Not authenticated. Please log in again.')
		}

		const response = await authStore.authedFetch('/api/domains', {
			method: 'POST',
			headers,
			body: JSON.stringify({ domain })
		})

		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to create domain')
		}

		await fetchDomains()
		return await response.json()
	}

	async function fetchDomainOverrides(id, { force = false } = {}) {
		const key = String(id)
		if (!force && overridesById.value[key]) {
			return overridesById.value[key]
		}
		const response = await authStore.authedFetch(`/api/domains/${id}`)
		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to fetch domain settings')
		}
		const data = await response.json()
		overridesById.value[key] = data.overrides || {}
		return overridesById.value[key]
	}

	async function updateDomainOverrides(id, partial) {
		const response = await authStore.authedFetch(`/api/domains/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify(partial)
		})
		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to update domain settings')
		}
		const data = await response.json()
		overridesById.value[String(id)] = data.overrides || {}
		return data.overrides
	}

	async function deleteDomainWithLinks(domainName) {
		const response = await authStore.authedFetch('/api/domains/delete-with-links', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify({ domain: domainName })
		})

		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to delete domain')
		}

		await fetchDomains()
	}

	return {
		domains,
		settings,
		defaults,
		overridesById,
		loading,
		fetchDomains,
		fetchDefaults,
		fetchDomainOverrides,
		updateDefaults,
		updateDomainOverrides,
		createDomain,
		deleteDomainWithLinks
	}
})
