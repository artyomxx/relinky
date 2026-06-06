import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'
import DashboardView from './views/DashboardView.vue'
import LinksView from './views/LinksView.vue'
import StatsView from './views/StatsView.vue'
import DomainsView from './views/domains/DomainsView.vue'
import ToolsView from './views/tools/ToolsView.vue'
import LogsView from './views/LogsView.vue'
import AuthView from './views/AuthView.vue'
import OnboardingView from './views/OnboardingView.vue'

const routes = [
	{
		path: '/onboarding',
		name: 'onboarding',
		component: OnboardingView
	},
	{
		path: '/login',
		name: 'login',
		component: AuthView
	},
	{
		path: '/',
		component: DashboardView,
		children: [
			{
				path: '',
				redirect: '/links'
			},
			{
				path: 'links',
				name: 'links',
				component: LinksView
			},
			{
				path: 'links/new',
				name: 'link-new',
				component: LinksView
			},
			{
				path: 'links/search/:query',
				name: 'links-search',
				component: LinksView
			},
			{
				path: 'links/:id',
				name: 'link-edit',
				component: LinksView
			},
			{
				path: 'stats',
				name: 'stats',
				component: StatsView
			},
			{
				path: 'stats/link/:id',
				name: 'stats-link',
				component: StatsView
			},
			{
				path: 'domains/:domainId?',
				name: 'domains',
				component: DomainsView
			},
			{
				path: 'tools',
				name: 'tools',
				component: ToolsView
			},
			{
				path: 'settings',
				redirect: '/domains'
			},
			{
				path: 'settings/domains',
				redirect: '/domains'
			},
			{
				path: 'settings/danger-zone',
				redirect: '/domains'
			},
			{
				path: 'settings/import-export',
				redirect: '/tools'
			},
			{
				path: 'settings/api-keys',
				redirect: '/tools'
			},
			{
				path: 'settings/:pathMatch(.*)*',
				redirect: '/domains'
			},
			{
				path: 'logs',
				name: 'logs',
				component: LogsView
			}
		]
	}
]

const router = createRouter({
	history: createWebHistory(),
	routes
})

router.beforeEach(async (to, from, next) => {
	const authStore = useAuthStore()

	try {
		await authStore.ensureSetupStatus()
	} catch {
		next()
		return
	}

	if (to.path === '/onboarding') {
		if (authStore.initialized) {
			next(authStore.isAuthenticated ? '/links' : '/login')
		} else {
			next()
		}
		return
	}

	if (!authStore.initialized) {
		next('/onboarding')
		return
	}

	if (authStore.token && (!authStore.hasValidatedToken || to.path !== '/login')) {
		await authStore.validateToken()
	}

	if (to.path === '/login') {
		if (authStore.isAuthenticated) {
			next('/links')
		} else {
			next()
		}
	} else {
		if (!authStore.isAuthenticated) {
			next('/login')
		} else {
			next()
		}
	}
})

export default router
