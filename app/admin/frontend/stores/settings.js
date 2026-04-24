import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth.js'

export const useSettingsStore = defineStore('settings', () => {
	const settings = ref({})
	const defaults = ref({})
	const domains = ref([])
	const apiKeys = ref([])
	const loading = ref(false)

	const authStore = useAuthStore()

	async function fetchSettings(silent = false) {
		// Don't set loading to true if we already have data (to prevent blinking)
		if (!silent && Object.keys(settings.value).length === 0 && Object.keys(defaults.value).length === 0) {
			loading.value = true
		}
		try {
			const response = await authStore.authedFetch('/api/settings')

			if (!response.ok) throw new Error('Failed to fetch settings')

			const data = await response.json()
					settings.value = data.settings || {}
					defaults.value = data.defaults || {}
					if (!silent) {
						loading.value = false
					}
				} catch (err) {
					console.error('Error fetching settings:', err)
					if (!silent) {
						loading.value = false
					}
				}
	}

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

	async function updateSettings(newSettings, newDefaults) {
		const response = await authStore.authedFetch('/api/settings', {
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
			throw new Error(data.error || 'Failed to update settings')
		}

		// Refetch settings silently to ensure they were saved correctly
		await fetchSettings(true)
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

	async function deleteDomain(id) {
		const response = await authStore.authedFetch(`/api/domains/${id}`, {
			method: 'DELETE',
			headers: authStore.getAuthHeader()
		})

		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to delete domain')
		}

		await fetchDomains()
	}

	async function fetchApiKeys() {
		const response = await authStore.authedFetch('/api/settings/api-keys', {
			headers: authStore.getAuthHeader()
		})
		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to fetch API keys')
		}
		const data = await response.json()
		apiKeys.value = data.keys || []
		return apiKeys.value
	}

	async function createApiKey(payload) {
		const response = await authStore.authedFetch('/api/settings/api-keys', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify(payload)
		})
		const data = await response.json()
		if (!response.ok) {
			throw new Error(data.error || 'Failed to create API key')
		}
		await fetchApiKeys()
		return data
	}

	async function updateApiKey(id, payload) {
		const response = await authStore.authedFetch(`/api/settings/api-keys/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify(payload)
		})
		const data = await response.json()
		if (!response.ok) {
			throw new Error(data.error || 'Failed to update API key')
		}
		await fetchApiKeys()
		return data
	}

	async function regenerateApiKey(id) {
		const response = await authStore.authedFetch(`/api/settings/api-keys/${id}/regenerate`, {
			method: 'POST',
			headers: authStore.getAuthHeader()
		})
		const data = await response.json()
		if (!response.ok) {
			throw new Error(data.error || 'Failed to regenerate API key')
		}
		await fetchApiKeys()
		return data
	}

	async function deleteApiKey(id) {
		const response = await authStore.authedFetch(`/api/settings/api-keys/${id}`, {
			method: 'DELETE',
			headers: authStore.getAuthHeader()
		})
		const data = await response.json()
		if (!response.ok) {
			throw new Error(data.error || 'Failed to delete API key')
		}
		await fetchApiKeys()
		return data
	}

	return {
		settings,
		defaults,
		domains,
		apiKeys,
		loading,
		fetchSettings,
		fetchDomains,
		updateSettings,
		createDomain,
		deleteDomain,
		fetchApiKeys,
		createApiKey,
		updateApiKey,
		regenerateApiKey,
		deleteApiKey
	}
})

