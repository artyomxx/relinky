<template>
	<div class=gate-view>
		<div class=gate-panel>
			<h1>Relinky Admin</h1>
			<form @submit.prevent=handleLogin>
				<div v-if=error class=error-message>{{ error }}</div>
				<input
					v-model=password
					type=password
					placeholder='Password'
					required
					autofocus
				/>
				<button type=submit :disabled=loading>
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
/* Layout: global .gate-view / .gate-panel in styles.css */
</style>
