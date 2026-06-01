import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
	const token = ref(localStorage.getItem('auth_token'))
	const isAuthenticated = ref(!!token.value)
	const hasValidatedToken = ref(false)
	const initialized = ref(null)
	let setupStatusPromise = null

	function clearSession(redirectToLogin = false) {
		token.value = null
		localStorage.removeItem('auth_token')
		isAuthenticated.value = false
		hasValidatedToken.value = true
		if (redirectToLogin && window.location.pathname !== '/login' && window.location.pathname !== '/onboarding') {
			window.location.replace('/login')
		}
	}

	function applyToken(newToken) {
		token.value = newToken
		localStorage.setItem('auth_token', newToken)
		isAuthenticated.value = true
		hasValidatedToken.value = true
		initialized.value = true
	}

	async function fetchSetupStatus(force = false) {
		if (!force && initialized.value !== null) {
			return initialized.value
		}
		if (!force && setupStatusPromise) {
			return setupStatusPromise
		}
		setupStatusPromise = (async () => {
			try {
				const response = await fetch('/api/setup/status')
				if (!response.ok) {
					throw new Error('Failed to fetch setup status')
				}
				const data = await response.json()
				initialized.value = Boolean(data.initialized)
				return initialized.value
			} catch (error) {
				if (error instanceof TypeError && error.message.includes('fetch')) {
					throw new Error('Cannot connect to backend server.')
				}
				throw error
			} finally {
				setupStatusPromise = null
			}
		})()
		return setupStatusPromise
	}

	async function ensureSetupStatus() {
		return fetchSetupStatus()
	}

	async function setup(password, domain) {
		const body = { password, domain: domain.trim() }
		const response = await fetch('/api/setup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
		if (!response.ok) {
			let errorMessage = 'Setup failed'
			try {
				const data = await response.json()
				errorMessage = data.error || errorMessage
			} catch {
				errorMessage = `Setup failed (${response.status} ${response.statusText})`
			}
			throw new Error(errorMessage)
		}
		const data = await response.json()
		applyToken(data.token)
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
			applyToken(data.token)
		} catch (error) {
			if (error instanceof TypeError && error.message.includes('fetch')) {
				throw new Error('Cannot connect to backend server.')
			}
			throw error
		}
	}

	async function changePassword(currentPassword, newPassword) {
		const response = await authedFetch('/api/auth/password', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ currentPassword, newPassword })
		})
		if (!response.ok) {
			let errorMessage = 'Failed to change password'
			try {
				const data = await response.json()
				errorMessage = data.error || errorMessage
			} catch {
				errorMessage = `Failed to change password (${response.status})`
			}
			throw new Error(errorMessage)
		}
		return response.json()
	}

	async function fetchPasswordSource() {
		const response = await authedFetch('/api/auth/password-source')
		if (!response.ok) {
			throw new Error('Failed to fetch password source')
		}
		return response.json()
	}

	function logout() {
		fetch('/api/auth/logout', {
			method: 'POST',
			headers: { 'Authorization': `Bearer ${token.value}` }
		}).catch(() => {})
		// SPA navigation to /login is handled by the caller (e.g. DashboardView).
		// Avoid window.location.replace here — it races with router.push and flashes white.
		clearSession(false)
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
		initialized,
		fetchSetupStatus,
		ensureSetupStatus,
		setup,
		login,
		changePassword,
		fetchPasswordSource,
		logout,
		getAuthHeader,
		validateToken,
		authedFetch
	}
})
