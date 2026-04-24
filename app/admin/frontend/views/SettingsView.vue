<template>
	<div class="settings-view view-container">
		<div class="tabs">
			<router-link to="/settings" class="tab-link" :class="{ active: activeTab === 'settings' }">General</router-link>
			<router-link to="/settings/domains" class="tab-link" :class="{ active: activeTab === 'domains' }">Domains</router-link>
			<router-link to="/settings/import-export" class="tab-link" :class="{ active: activeTab === 'import-export' }">Import/Export</router-link>
			<router-link to="/settings/api-keys" class="tab-link" :class="{ active: activeTab === 'api-keys' }">API Keys</router-link>
			<router-link to="/settings/danger-zone" class="tab-link" :class="{ active: activeTab === 'danger-zone' }">Danger Zone</router-link>
		</div>

		<GeneralTab
			v-if="activeTab === 'settings'"
			:loading="settingsStore.loading"
			:domains="settingsStore.domains"
			:local-defaults="localDefaults"
			:local-settings="localSettings"
			:save-success="saveSuccess"
			:has-unsaved-changes="hasUnsavedChanges()"
			:reset-settings="resetSettings"
			:save-settings="saveSettings"
			:normalize-url="normalizeUrl"
		/>

		<DomainsTab
			v-if="activeTab === 'domains'"
			:loading="settingsStore.loading"
			:domains="settingsStore.domains"
			:show-add-domain="showAddDomain"
			:new-domain="newDomain"
			:show-domain-unsaved-hint="showDomainUnsavedHint"
			:domain-input-ref-setter="setDomainInput"
			:domain-cancel-button-ref-setter="setDomainCancelButton"
			:handle-close-domain-modal="handleCloseDomainModal"
			:handle-add-domain="handleAddDomain"
			:delete-domain="deleteDomain"
			:open-add-domain="() => { showAddDomain = true }"
			@update:new-domain="newDomain = $event"
		/>

		<ImportExportTab
			v-if="activeTab === 'import-export'"
			:file-input-ref-setter="setFileInput"
			:import-file="importFile"
			:importing="importing"
			:exporting="exporting"
			:preview-stats="previewStats"
			:import-settings="importSettings"
			:export-settings="exportSettings"
			:export-count="exportCount"
			:domains="settingsStore.domains"
			:handle-file-select="handleFileSelect"
			:preview-import="previewImport"
			:execute-import="executeImport"
			:export-links="exportLinks"
		/>

		<ApiKeysTab
			v-if="activeTab === 'api-keys'"
			:loading="settingsStore.loading"
			:api-keys="settingsStore.apiKeys"
			:new-api-key-name="newApiKeyName"
			:new-api-allowed-ips="newApiAllowedIps"
			:creating-api-key="creatingApiKey"
			:last-generated-api-token="lastGeneratedApiToken"
			:last-generated-api-key-id="lastGeneratedApiKeyId"
			:handle-create-api-key="handleCreateApiKey"
			:handle-toggle-api-key="handleToggleApiKey"
			:handle-regenerate-api-key="handleRegenerateApiKey"
			:handle-delete-api-key="handleDeleteApiKey"
			:format-ts="formatTs"
			@update:new-api-key-name="newApiKeyName = $event"
			@update:new-api-allowed-ips="newApiAllowedIps = $event"
		/>

		<DangerZoneTab
			v-if="activeTab === 'danger-zone'"
			:domains="settingsStore.domains"
			:danger-zone-domain="dangerZoneDomain"
			:show-domain-confirm-input="showDomainConfirmInput"
			:domain-confirm-input="domainConfirmInput"
			:domain-confirm-input-ref-setter="setDomainConfirmInput"
			:deleting-domain="deletingDomain"
			:confirm-delete-domain="confirmDeleteDomain"
			:show-delete-domain-confirm="showDeleteDomainConfirm"
			@update:danger-zone-domain="dangerZoneDomain = $event"
			@update:domain-confirm-input="domainConfirmInput = $event"
		/>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useSettingsStore } from '../stores/settings.js'
import { useAuthStore } from '../stores/auth.js'
import GeneralTab from './settings/GeneralTab.vue'
import DomainsTab from './settings/DomainsTab.vue'
import ImportExportTab from './settings/ImportExportTab.vue'
import ApiKeysTab from './settings/ApiKeysTab.vue'
import DangerZoneTab from './settings/DangerZoneTab.vue'
import { formatDateYMD } from '../utils/date.js'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const activeTab = ref('settings')
const showAddDomain = ref(false)
const newDomain = ref('')
const initialDomain = ref('')
const saveSuccess = ref(false)
const domainInput = ref(null)
const domainCancelButton = ref(null)
const showDomainUnsavedHint = ref(false)
const domainHintShown = ref(false)
let saveSuccessTimeout = null

// Import/Export
const fileInput = ref(null)
const importFile = ref(null)
const importing = ref(false)
const exporting = ref(false)
const previewStats = ref(null)
const importSettings = ref({
	importType: 'relinky',
	createDomains: false,
	replaceExisting: false
})
const exportSettings = ref({
	dateSince: '',
	domain: 'all'
})
const exportCount = ref(null)
const newApiKeyName = ref('')
const newApiAllowedIps = ref('')
const creatingApiKey = ref(false)
const lastGeneratedApiToken = ref('')
const lastGeneratedApiKeyId = ref(null)

// Danger Zone
const dangerZoneDomain = ref('')
const showDomainConfirmInput = ref(false)
const domainConfirmInput = ref('')
const domainConfirmInputRef = ref(null)
const deletingDomain = ref(false)

const setDomainInput = el => {
	domainInput.value = el
}

const setDomainCancelButton = el => {
	domainCancelButton.value = el
}

const setFileInput = el => {
	fileInput.value = el
}

const setDomainConfirmInput = el => {
	domainConfirmInputRef.value = el
}

// Sync active tab with route
watch(() => route.name, (routeName) => {
	if (routeName === 'settings-domains') {
		activeTab.value = 'domains'
	} else if (routeName === 'settings-import-export') {
		activeTab.value = 'import-export'
		fetchExportCount()
	} else if (routeName === 'settings-api-keys') {
		activeTab.value = 'api-keys'
	} else if (routeName === 'settings-danger-zone') {
		activeTab.value = 'danger-zone'
	} else if (routeName === 'settings') {
		activeTab.value = 'settings'
	}
}, { immediate: true })

watch(activeTab, (newTab) => {
	if (newTab === 'domains' && route.name !== 'settings-domains') {
		router.push('/settings/domains')
	} else if (newTab === 'import-export' && route.name !== 'settings-import-export') {
		router.push('/settings/import-export')
	} else if (newTab === 'api-keys' && route.name !== 'settings-api-keys') {
		router.push('/settings/api-keys')
	} else if (newTab === 'danger-zone' && route.name !== 'settings-danger-zone') {
		router.push('/settings/danger-zone')
	} else if (newTab === 'settings' && route.name !== 'settings') {
		router.push('/settings')
	}
})

// Focus domain input when modal opens and handle ESC key
watch(showAddDomain, async (isOpen) => {
	if (isOpen) {
		initialDomain.value = newDomain.value.trim() // Store initial state
		domainHintShown.value = false // Reset hint state
		showDomainUnsavedHint.value = false
		await nextTick()
		if (domainInput.value) {
			domainInput.value.focus()
		}
	}
})

function handleCloseDomainModal() {
	// If there are changes and we haven't shown the hint yet, show hint and focus cancel button
	if (hasDomainChanges() && !domainHintShown.value) {
		showDomainUnsavedHint.value = true
		domainHintShown.value = true
		nextTick(() => {
			if (domainCancelButton.value) {
				domainCancelButton.value.focus()
			}
		})
		// Hide hint after 5 seconds
		setTimeout(() => {
			showDomainUnsavedHint.value = false
		}, 5000)
		return
	}
	// If hint was already shown, or no changes, close normally
	showDomainUnsavedHint.value = false
	domainHintShown.value = false
	newDomain.value = ''
	showAddDomain.value = false
}

function hasDomainChanges() {
	return showAddDomain.value && newDomain.value.trim() !== initialDomain.value
}

function handleEscape(event) {
	if (event.key === 'Escape' && showAddDomain.value) {
		event.preventDefault()
		event.stopPropagation()
		// If hint was already shown, don't handle ESC again - let the Cancel button handle it
		if (domainHintShown.value) {
			return
		}
		handleCloseDomainModal()
	}
}

onBeforeRouteLeave((to, from, next) => {
	// Check if domain modal is open and has unsaved changes
	if (hasDomainChanges()) {
		// Prevent navigation if there are unsaved changes
		next(false) // Cancel navigation
		return
	}
	next() // Allow navigation
})

onMounted(() => {
	window.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
	window.removeEventListener('keydown', handleEscape)
})

const localSettings = ref({
	error_404_url: '',
	error_500_url: ''
})

const localDefaults = ref({
	default_domain: '',
	expired_url: '',
	redirect_code: '303',
	keep_referrer: false,
	keep_query_params: false
})

const originalSettings = ref({
	error_404_url: '',
	error_500_url: ''
})

const originalDefaults = ref({
	default_domain: '',
	expired_url: '',
	redirect_code: '303',
	keep_referrer: false,
	keep_query_params: false
})

function hasUnsavedChanges() {
	return JSON.stringify(localSettings.value) !== JSON.stringify(originalSettings.value) ||
		JSON.stringify(localDefaults.value) !== JSON.stringify(originalDefaults.value)
}

function resetSettings() {
	if (!hasUnsavedChanges()) return
	
	if (!confirm('Are you sure you want to reset all unsaved changes? This action cannot be undone.')) {
		return
	}
	
	localSettings.value = { ...originalSettings.value }
	localDefaults.value = { ...originalDefaults.value }
	saveSuccess.value = false
}

onMounted(async () => {
	await settingsStore.fetchDomains()
	await settingsStore.fetchSettings()
	await settingsStore.fetchApiKeys()
	
	localSettings.value = { ...settingsStore.settings }
	originalSettings.value = { ...settingsStore.settings }
	
	// Convert default_domain_id to domain name for display
	let defaultDomainName = ''
	if (settingsStore.defaults.default_domain_id) {
		const domain = settingsStore.domains.find(d => d.id.toString() === settingsStore.defaults.default_domain_id.toString())
		defaultDomainName = domain ? domain.domain : ''
	}
	
	const defaults = {
		default_domain: defaultDomainName,
		expired_url: settingsStore.defaults.expired_url || '',
		redirect_code: settingsStore.defaults.redirect_code || '303',
		keep_referrer: settingsStore.defaults.keep_referrer === 'true' || settingsStore.defaults.keep_referrer === true,
		keep_query_params: settingsStore.defaults.keep_query_params === 'true' || settingsStore.defaults.keep_query_params === true
	}
	
	localDefaults.value = { ...defaults }
	originalDefaults.value = { ...defaults }
})

function formatTs(value) {
	if (!value) return 'never'
	return formatDateYMD(value)
}

async function handleCreateApiKey() {
	const name = newApiKeyName.value.trim()
	if (!name) {
		alert('Key name is required')
		return
	}
	creatingApiKey.value = true
	try {
		const allowedIps = newApiAllowedIps.value
			.split(',')
			.map(v => v.trim())
			.filter(Boolean)
		const result = await settingsStore.createApiKey({
			name,
			allowed_ips: allowedIps
		})
		lastGeneratedApiToken.value = result.token || ''
		lastGeneratedApiKeyId.value = result.key?.id || null
		newApiKeyName.value = ''
		newApiAllowedIps.value = ''
	} catch (err) {
		alert(err.message)
	} finally {
		creatingApiKey.value = false
	}
}

async function handleToggleApiKey(key) {
	try {
		await settingsStore.updateApiKey(key.id, { enabled: !key.enabled })
	} catch (err) {
		alert(err.message)
	}
}

async function handleRegenerateApiKey(key) {
	if (!confirm(`Regenerate API key "${key.name}"? Existing token will stop working immediately.`)) return
	try {
		const result = await settingsStore.regenerateApiKey(key.id)
		lastGeneratedApiToken.value = result.token || ''
		lastGeneratedApiKeyId.value = result.key?.id || key.id
	} catch (err) {
		alert(err.message)
	}
}

async function handleDeleteApiKey(key) {
	if (!confirm(`Delete API key "${key.name}"?`)) return
	try {
		await settingsStore.deleteApiKey(key.id)
		if (lastGeneratedApiKeyId.value === key.id) {
			lastGeneratedApiToken.value = ''
			lastGeneratedApiKeyId.value = null
		}
	} catch (err) {
		alert(err.message)
	}
}

function normalizeUrl(field) {
	// Helper function to add https:// if URL doesn't have a protocol
	const addHttps = (url) => {
		if (!url || url.trim() === '') return url
		const trimmed = url.trim()
		// Check if URL already has a protocol
		if (/^https?:\/\//i.test(trimmed)) {
			return trimmed
		}
		// Add https:// if it doesn't have a protocol
		return 'https://' + trimmed
	}

	if (field === 'error_404_url') {
		localSettings.value.error_404_url = addHttps(localSettings.value.error_404_url)
	} else if (field === 'error_500_url') {
		localSettings.value.error_500_url = addHttps(localSettings.value.error_500_url)
	} else if (field === 'expired_url') {
		localDefaults.value.expired_url = addHttps(localDefaults.value.expired_url)
	}
}

async function saveSettings() {
	try {
		// Normalize URLs before saving
		normalizeUrl('error_404_url')
		normalizeUrl('error_500_url')
		normalizeUrl('expired_url')

		// Convert domain name to ID
		let defaultDomainId = ''
		if (localDefaults.value.default_domain) {
			const domain = settingsStore.domains.find(d => d.domain === localDefaults.value.default_domain)
			if (domain) {
				defaultDomainId = domain.id.toString()
			}
		}
		
		const defaultsToSave = {
			...localDefaults.value,
			default_domain_id: defaultDomainId,
			keep_referrer: localDefaults.value.keep_referrer ? 'true' : 'false',
			keep_query_params: localDefaults.value.keep_query_params ? 'true' : 'false'
		}
		// Remove default_domain from saved data (we only save the ID)
		delete defaultsToSave.default_domain
		
		await settingsStore.updateSettings(localSettings.value, defaultsToSave)
		
		// Update original values after successful save
		originalSettings.value = { ...localSettings.value }
		originalDefaults.value = { ...localDefaults.value }
		
		// Clear any existing timeout
		if (saveSuccessTimeout) {
			clearTimeout(saveSuccessTimeout)
		}
		saveSuccess.value = true
		saveSuccessTimeout = setTimeout(() => {
			saveSuccess.value = false
			saveSuccessTimeout = null
		}, 3000)
	} catch (err) {
		alert(err.message)
	}
}

async function handleAddDomain() {
	const domain = newDomain.value.trim()
	if (!domain) return
	
	// Validate domain has at least one dot
	if (!domain.includes('.')) {
		alert('Domain must contain at least one dot (e.g., example.com)')
		return
	}
	
	try {
		await settingsStore.createDomain(domain)
		newDomain.value = ''
		domainHintShown.value = false
		showDomainUnsavedHint.value = false
		showAddDomain.value = false
	} catch (err) {
		alert(err.message)
	}
}

async function deleteDomain(id) {
	if (!confirm('Are you sure you want to delete this domain?')) return
	try {
		await settingsStore.deleteDomain(id)
	} catch (err) {
		alert(err.message)
	}
}

// Import/Export functions
function handleFileSelect(event) {
	const file = event.target.files[0]
	if (file) {
		const reader = new FileReader()
		reader.onload = (e) => {
			try {
				importFile.value = JSON.parse(e.target.result)
				previewStats.value = null
			} catch (err) {
				alert('Invalid JSON file: ' + err.message)
				importFile.value = null
			}
		}
		reader.readAsText(file)
	}
}

async function previewImport() {
	if (!importFile.value) return
	
	try {
		const response = await authStore.authedFetch('/api/links/import/preview', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify({
				links: importFile.value,
				importType: importSettings.value.importType,
				createDomains: importSettings.value.createDomains,
				replaceExisting: importSettings.value.replaceExisting
			})
		})
		
		if (!response.ok) {
			const error = await response.json()
			throw new Error(error.error || 'Failed to preview import')
		}
		
		previewStats.value = await response.json()
	} catch (err) {
		alert(err.message)
	}
}

async function executeImport() {
	if (!importFile.value || !previewStats.value) return
	
	importing.value = true
	try {
		const response = await authStore.authedFetch('/api/links/import', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify({
				links: importFile.value,
				importType: importSettings.value.importType,
				createDomains: importSettings.value.createDomains,
				replaceExisting: importSettings.value.replaceExisting
			})
		})
		
		if (!response.ok) {
			const error = await response.json()
			throw new Error(error.error || 'Failed to import links')
		}
		
		alert('Import completed successfully')
		importFile.value = null
		previewStats.value = null
		if (fileInput.value) {
			fileInput.value.value = ''
		}
		// Refresh domains and links
		await settingsStore.fetchDomains()
		router.push('/links')
	} catch (err) {
		alert(err.message)
	} finally {
		importing.value = false
	}
}

async function fetchExportCount() {
	try {
		const params = new URLSearchParams()
		if (exportSettings.value.dateSince) {
			params.append('dateSince', exportSettings.value.dateSince)
		}
		if (exportSettings.value.domain !== 'all') {
			params.append('domain', exportSettings.value.domain)
		}
		
		const response = await authStore.authedFetch(`/api/links/export/count?${params}`, {
			headers: authStore.getAuthHeader()
		})
		
		if (!response.ok) {
			exportCount.value = null
			return
		}
		
		const data = await response.json()
		exportCount.value = data.count
	} catch (err) {
		exportCount.value = null
	}
}

async function exportLinks() {
	exporting.value = true
	try {
		const params = new URLSearchParams()
		if (exportSettings.value.dateSince) {
			params.append('dateSince', exportSettings.value.dateSince)
		}
		if (exportSettings.value.domain !== 'all') {
			params.append('domain', exportSettings.value.domain)
		}
		
		const response = await authStore.authedFetch(`/api/links/export?${params}`, {
			headers: authStore.getAuthHeader()
		})
		
		if (!response.ok) {
			const error = await response.json()
			throw new Error(error.error || 'Failed to export links')
		}
		
		const data = await response.json()
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `links-export-${new Date().toISOString().split('T')[0]}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	} catch (err) {
		alert(err.message)
	} finally {
		exporting.value = false
	}
}

// Watch for changes to export settings to update count
watch([() => exportSettings.value.dateSince, () => exportSettings.value.domain], () => {
	if (activeTab.value === 'import-export') {
		fetchExportCount()
	}
})

// Invalidate preview whenever import options change so results are never partially stale.
watch(
	() => ({
		importType: importSettings.value.importType,
		createDomains: importSettings.value.createDomains,
		replaceExisting: importSettings.value.replaceExisting
	}),
	() => {
		previewStats.value = null
	}
)

// Reset confirm input when domain changes
watch(dangerZoneDomain, () => {
	showDomainConfirmInput.value = false
	domainConfirmInput.value = ''
})

// Danger Zone functions
function showDeleteDomainConfirm() {
	if (!dangerZoneDomain.value) return
	showDomainConfirmInput.value = true
	domainConfirmInput.value = ''
	nextTick(() => {
		if (domainConfirmInputRef.value) {
			domainConfirmInputRef.value.focus()
		}
	})
}

async function confirmDeleteDomain() {
	if (!dangerZoneDomain.value) return
	
	if (domainConfirmInput.value !== dangerZoneDomain.value) {
		alert('Domain name does not match. Please type the exact domain name to confirm deletion.')
		return
	}
	
	if (!confirm(`Are you sure you want to delete domain "${dangerZoneDomain.value}" and ALL its links? This action cannot be undone.`)) {
		return
	}
	
	deletingDomain.value = true
	try {
		const response = await authStore.authedFetch(`/api/domains/delete-with-links`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...authStore.getAuthHeader()
			},
			body: JSON.stringify({ domain: dangerZoneDomain.value })
		})
		
		if (!response.ok) {
			const error = await response.json()
			throw new Error(error.error || 'Failed to delete domain')
		}
		
		alert('Domain and all its links deleted successfully')
		dangerZoneDomain.value = ''
		showDomainConfirmInput.value = false
		domainConfirmInput.value = ''
		await settingsStore.fetchDomains()
	} catch (err) {
		alert(err.message)
	} finally {
		deletingDomain.value = false
	}
}
</script>

<style>
/* Shared settings shell (tabs live in SettingsView; tab bodies use these classes) */
.settings-tab {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.settings-tab-header {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	margin-bottom: 0.25rem;
}

.settings-tab-header-with-action {
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.settings-tab-title {
	margin: 0;
	font-size: 1.1rem;
	line-height: 1.3;
}

.settings-tab-subtitle {
	margin: 0;
	color: var(--text-secondary, #858585);
	font-size: 0.9rem;
}

.settings-card {
	background: var(--bg-tertiary);
	border: 1px solid var(--bg-border);
	border-radius: 8px;
	padding: 1rem;
}

.settings-card-danger {
	border-color: var(--btn-danger);
}

@media (max-width: 900px) {
	.settings-tab-header-with-action {
		flex-direction: column;
		align-items: stretch;
	}
}
</style>
