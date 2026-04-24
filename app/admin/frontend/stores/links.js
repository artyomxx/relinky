import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth.js'

export const useLinksStore = defineStore('links', () => {
	const links = ref([])
	const pagination = ref({ page: 1, limit: 100, total: 0, totalPages: 0 })
	const search = ref('')
	const loading = ref(false)

	const authStore = useAuthStore()

	async function fetchLinks(page = 1) {
		// Don't set loading to true if we already have data (to prevent blinking)
		if (links.value.length === 0) {
			loading.value = true
		}
		try {
			const params = new URLSearchParams({
				page: page.toString(),
				limit: '100',
				...(search.value && { search: search.value })
			})

			const response = await authStore.authedFetch(`/api/links?${params}`)

			if (!response.ok) throw new Error('Failed to fetch links')

			const data = await response.json()
			links.value = data.links
			pagination.value = data.pagination
		} catch (err) {
			console.error('Error fetching links:', err)
		} finally {
			loading.value = false
		}
	}

	async function createLink(linkData) {
		const headers = {
			'Content-Type': 'application/json',
			...authStore.getAuthHeader()
		}

		if (!headers.Authorization) {
			throw new Error('Not authenticated. Please log in again.')
		}

		const response = await authStore.authedFetch('/api/links', {
			method: 'POST',
			headers,
			body: JSON.stringify(linkData)
		})

		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to create link')
		}

		await fetchLinks(pagination.value.page)
		return await response.json()
	}

	async function updateLink(id, linkData) {
		const response = await authStore.authedFetch(`/api/links/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify(linkData)
		})

		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to update link')
		}

		await fetchLinks(pagination.value.page)
	}

	async function deleteLink(id) {
		const response = await authStore.authedFetch(`/api/links/${id}`, {
			method: 'DELETE',
			headers: authStore.getAuthHeader()
		})

		if (!response.ok) {
			const data = await response.json()
			throw new Error(data.error || 'Failed to delete link')
		}

		await fetchLinks(pagination.value.page)
	}

	async function checkUrl(url) {
		const response = await authStore.authedFetch(`/api/links/check-url?url=${encodeURIComponent(url)}`)

		if (!response.ok) return []

		const data = await response.json()
		return data.links || []
	}

	return {
		links,
		pagination,
		search,
		loading,
		fetchLinks,
		createLink,
		updateLink,
		deleteLink,
		checkUrl
	}
})

