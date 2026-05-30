import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth.js'

export const useToolsStore = defineStore('tools', () => {
	const apiKeys = ref([])
	const loading = ref(false)

	const authStore = useAuthStore()

	async function fetchApiKeys() {
		const response = await authStore.authedFetch('/api/api-keys', {
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
		const response = await authStore.authedFetch('/api/api-keys', {
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
		const response = await authStore.authedFetch(`/api/api-keys/${id}`, {
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
		const response = await authStore.authedFetch(`/api/api-keys/${id}/regenerate`, {
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
		const response = await authStore.authedFetch(`/api/api-keys/${id}`, {
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
		apiKeys,
		loading,
		fetchApiKeys,
		createApiKey,
		updateApiKey,
		regenerateApiKey,
		deleteApiKey
	}
})
