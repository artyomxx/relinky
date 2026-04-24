import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'
import DashboardView from './views/DashboardView.vue'
import LinksView from './views/LinksView.vue'
import StatsView from './views/StatsView.vue'
import SettingsView from './views/SettingsView.vue'
import LogsView from './views/LogsView.vue'
import AuthView from './views/AuthView.vue'

const routes = [
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
				path: 'settings',
				name: 'settings',
				component: SettingsView
			},
			{
				path: 'settings/domains',
				name: 'settings-domains',
				component: SettingsView
			},
			{
				path: 'settings/import-export',
				name: 'settings-import-export',
				component: SettingsView
			},
			{
				path: 'settings/api-keys',
				name: 'settings-api-keys',
				component: SettingsView
			},
			{
				path: 'settings/danger-zone',
				name: 'settings-danger-zone',
				component: SettingsView
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

