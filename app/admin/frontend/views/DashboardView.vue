<template>
	<div class="dashboard">
		<header>
			<h1>Relinky Admin</h1>
			<nav>
				<router-link to="/links" class="nav-link">Links</router-link>
				<router-link to="/stats" class="nav-link">Stats</router-link>
				<router-link to="/logs" class="nav-link">Logs</router-link>
				<router-link to="/settings" class="nav-link">Settings</router-link>
				<button @click="handleLogout" class="nav-link">Logout</button>
			</nav>
		</header>

		<main>
			<router-view />
		</main>
	</div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const authStore = useAuthStore()

function handleLogout() {
	authStore.logout()
	router.push('/login')
}
</script>

<style scoped>
.dashboard {
	min-height: 100vh;
}

header {
	background: var(--bg-secondary);
	padding: 1rem 2rem;
	border-bottom: 1px solid var(--bg-border);
	display: flex;
	justify-content: space-between;
	align-items: center;
}

header h1 {
	margin: 0;
	font-size: 1.5rem;
}

nav {
	display: flex;
	gap: 0.5rem;
}

.nav-link {
	padding: 0.5rem 1rem;
	background: transparent;
	border: 1px solid var(--bg-border);
	border-radius: 4px;
	text-decoration: none;
	color: var(--text-primary);
}

.nav-link:hover {
	background: var(--bg-hover);
}

.nav-link.router-link-active {
	background: var(--btn-primary);
	border-color: var(--btn-primary);
	color: var(--text-white);
}

nav button.nav-link {
	background: transparent;
	border: 1px solid var(--bg-border);
	border-radius: 4px;
	text-decoration: none;
	color: var(--text-primary);
	cursor: pointer;
	font-size: 1rem;
	padding: 0.5rem 1rem;
}

nav button.nav-link:hover {
	background: var(--bg-hover);
}

main {
	padding: 2rem;
	max-width: 1200px;
	margin: 0 auto;
}
</style>
