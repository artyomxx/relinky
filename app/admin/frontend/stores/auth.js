import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
	const token = ref(localStorage.getItem('auth_token'))
	const isAuthenticated = ref(!!token.value)
	const hasValidatedToken = ref(false)

	function clearSession(redirectToLogin = false) {
		token.value = null
		localStorage.removeItem('auth_token')
		isAuthenticated.value = false
		hasValidatedToken.value = true
		if (redirectToLogin && window.location.pathname !== '/login') {
			window.location.replace('/login')
		}
	}

	async function login(password) {
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			})

			if (!response.ok) {
				let errorMessage = 'Login failed'
				try {
					const data = await response.json()
					errorMessage = data.error || errorMessage
				} catch (parseError) {
					if (response.status === 0 || response.type === 'opaque') {
						errorMessage = 'Cannot connect to backend server.'
					} else {
						errorMessage = `Login failed (${response.status} ${response.statusText})`
					}
				}
				throw new Error(errorMessage)
			}

			const data = await response.json()
			token.value = data.token
			localStorage.setItem('auth_token', data.token)
			isAuthenticated.value = true
			hasValidatedToken.value = true
		} catch (error) {
			if (error instanceof TypeError && error.message.includes('fetch')) {
				throw new Error('Cannot connect to backend server.')
			}
			throw error
		}
	}

	function logout() {
		fetch('/api/auth/logout', {
			method: 'POST',
			headers: { 'Authorization': `Bearer ${token.value}` }
		}).catch(() => {})
		clearSession(true)
	}

	function getAuthHeader() {
		if (!token.value) return {}
		return { 'Authorization': `Bearer ${token.value}` }
	}

	async function validateToken(force = false) {
		if (!token.value) {
			isAuthenticated.value = false
			hasValidatedToken.value = true
			return false
		}
		if (!force && hasValidatedToken.value) {
			return isAuthenticated.value
		}
		try {
			const response = await fetch('/api/auth/check', {
				headers: getAuthHeader()
			})
			if (!response.ok) {
				throw new Error('Unauthorized')
			}
			isAuthenticated.value = true
			hasValidatedToken.value = true
			return true
		} catch {
			clearSession()
			return false
		}
	}

	async function authedFetch(input, init = {}) {
		const headers = {
			...(init.headers || {}),
			...getAuthHeader()
		}
		const response = await fetch(input, {
			...init,
			headers
		})
		if (response.status === 401) {
			clearSession(true)
			throw new Error('Session expired. Please log in again.')
		}
		return response
	}

	return {
		token,
		isAuthenticated,
		hasValidatedToken,
		login,
		logout,
		getAuthHeader,
		validateToken,
		authedFetch
	}
})

