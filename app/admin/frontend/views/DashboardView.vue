<template>
	<div class="dashboard">
		<header ref="headerEl">
			<h1 class="brand">Relinky</h1>
			<div class="nav-shell" :class="{ 'nav-shell-open': navOpen }">
				<button
					type="button"
					class="nav-dd-trigger borderless"
					:aria-expanded="navOpen"
					aria-haspopup="true"
					@click="toggleNav"
				>
					<span class="nav-dd-label">{{ currentNavLabel }}</span>
					<span class="nav-dd-chevron" aria-hidden="true" />
				</button>
				<nav @click="onNavClick">
					<router-link to="/links" class="nav-link borderless">Links</router-link>
					<router-link to="/stats" class="nav-link borderless">Stats</router-link>
					<router-link to="/logs" class="nav-link borderless">Logs</router-link>
					<router-link to="/domains" class="nav-link borderless">Domains</router-link>
					<router-link to="/tools" class="nav-link borderless">Tools</router-link>
					<button type="button" @click="handleLogout" class="nav-link borderless">Logout</button>
				</nav>
			</div>
		</header>

		<main>
			<router-view />
		</main>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const navOpen = ref(false)
const headerEl = ref(null)

const currentNavLabel = computed(() => {
	const path = route.path
	if (path.startsWith('/links')) return 'Links'
	if (path.startsWith('/stats')) return 'Stats'
	if (path.startsWith('/logs')) return 'Logs'
	if (path.startsWith('/domains')) return 'Domains'
	if (path.startsWith('/tools')) return 'Tools'
	return 'Links'
})

function toggleNav() {
	navOpen.value = !navOpen.value
}

function closeNav() {
	navOpen.value = false
}

function onNavClick(event) {
	if (event.target.closest('a, button')) {
		closeNav()
	}
}

function handleLogout() {
	closeNav()
	authStore.logout()
	router.push('/login')
}

function onDocumentPointerDown(event) {
	if (!navOpen.value) return
	if (headerEl.value?.contains(event.target)) return
	closeNav()
}

function onDocumentKeydown(event) {
	if (event.key === 'Escape') {
		closeNav()
	}
}

watch(() => route.path, closeNav)

onMounted(() => {
	document.addEventListener('pointerdown', onDocumentPointerDown)
	document.addEventListener('keydown', onDocumentKeydown)
})

onUnmounted(() => {
	document.removeEventListener('pointerdown', onDocumentPointerDown)
	document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<style scoped>
.dashboard {
	min-height: 100vh;
}

header {
	background: var(--bg-secondary);
	padding: 1rem 2rem;
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 1rem;
}

.brand {
	margin: 0;
	font-size: 1.5rem;
	font-weight: 600;
	flex-shrink: 0;
}

.nav-shell {
	position: relative;
	display: flex;
	align-items: center;
	min-width: 0;
}

.nav-dd-trigger {
	display: none;
	align-items: center;
	gap: 0.35rem;
	padding: 0.5rem 0.65rem;
	font-size: 0.9375rem;
	font-weight: 500;
	color: var(--text-primary);
}

.nav-dd-label {
	white-space: nowrap;
}

.nav-dd-chevron {
	width: 0;
	height: 0;
	border-left: 4px solid transparent;
	border-right: 4px solid transparent;
	border-top: 5px solid currentColor;
	transition: transform 0.15s ease;
}

.nav-shell-open .nav-dd-chevron {
	transform: rotate(180deg);
}

nav {
	display: flex;
	gap: 0.25rem;
	align-items: center;
}

.nav-link {
	padding: 0.5rem 0.85rem;
	background: transparent;
	border-radius: 4px;
	text-decoration: none;
	color: var(--text-primary);
}

.nav-link.borderless {
	border: none;
}

.nav-link:hover {
	background: var(--bg-hover);
}

.nav-link.router-link-active {
	background: var(--btn-primary);
	color: var(--text-white);
}

.nav-link.borderless.router-link-active {
	border: none;
}

nav button.nav-link {
	cursor: pointer;
	font-size: 1rem;
	font-family: inherit;
}

main {
	padding: 2rem;
	max-width: 1200px;
	margin: 0 auto;
}

@media (max-width: 640px) {
	main {
		padding: 0;
	}

	header {
		padding: 0.75rem 1rem;
		padding-top: max(0.75rem, env(safe-area-inset-top));
	}

	.brand {
		font-size: 1.125rem;
	}

	.nav-dd-trigger {
		display: inline-flex;
	}

	nav {
		position: absolute;
		top: calc(100% + 0.35rem);
		right: 0;
		z-index: 50;
		display: none;
		flex-direction: column;
		align-items: stretch;
		gap: 0.15rem;
		min-width: 10rem;
		padding: 0.35rem;
		background: var(--bg-secondary);
		border: 1px solid var(--bg-border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	}

	.nav-shell-open nav {
		display: flex;
	}

	.nav-shell .nav-link {
		width: 100%;
		text-align: left;
		padding: 0.55rem 0.75rem;
		font-size: 0.9375rem;
	}
}

@media (min-width: 641px) {
	.nav-shell-open .nav-dd-chevron {
		transform: none;
	}
}
</style>
