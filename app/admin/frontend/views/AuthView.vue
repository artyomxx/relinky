<template>
	<div class="auth-view">
		<div class="auth-box">
			<h1>Relinky Admin</h1>
			<form @submit.prevent="handleLogin">
				<div v-if="error" class="error">{{ error }}</div>
				<input
					v-model="password"
					type="password"
					placeholder="Password"
					required
					autofocus
				/>
				<button type="submit" :disabled="loading">
					{{ loading ? 'Logging in...' : 'Login' }}
				</button>
			</form>
		</div>
	</div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const authStore = useAuthStore()
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
	error.value = ''
	loading.value = true
	try {
		await authStore.login(password.value)
		router.push('/links')
	} catch (err) {
		error.value = err.message
	} finally {
		loading.value = false
	}
}
</script>

<style scoped>
.auth-view {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100vh;
}

.auth-box {
	background: var(--bg-secondary);
	padding: 2rem;
	border-radius: 8px;
	width: 100%;
	max-width: 400px;
}

.auth-box h1 {
	margin: 0 0 1.5rem 0;
	text-align: center;
}

.auth-box form {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.auth-box input {
	width: 100%;
}

.error {
	color: var(--accent-error);
	font-size: 0.9rem;
}
</style>
