<template>
	<div class="tools-view">
		<section class="view-group">
			<h2 class="view-group-title">API keys</h2>
			<ApiKeys
				:loading="toolsStore.loading"
				:api-keys="toolsStore.apiKeys"
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
		</section>

		<section class="view-group">
			<h2 class="view-group-title">Import & export</h2>
			<div class="import-export-grid">
				<Import
					:file-input-ref-setter="setFileInput"
					:import-file="importFile"
					:importing="importing"
					:preview-stats="previewStats"
					:import-settings="importSettings"
					:handle-file-select="handleFileSelect"
					:preview-import="previewImport"
					:execute-import="executeImport"
				/>
				<Export
					:exporting="exporting"
					:export-settings="exportSettings"
					:export-count="exportCount"
					:domains="domainsStore.domains"
					:export-links="exportLinks"
				/>
			</div>
		</section>
	</div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDomainsStore } from '../../stores/domains.js'
import { useToolsStore } from '../../stores/tools.js'
import { useAuthStore } from '../../stores/auth.js'
import ApiKeys from './ApiKeys.vue'
import Import from './Import.vue'
import Export from './Export.vue'
import { formatDateYMD } from '../../utils/date.js'

const router = useRouter()
const domainsStore = useDomainsStore()
const toolsStore = useToolsStore()
const authStore = useAuthStore()

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

const setFileInput = el => {
	fileInput.value = el
}

onMounted(async () => {
	await domainsStore.fetchDomains()
	await toolsStore.fetchApiKeys()
	await fetchExportCount()
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
		const result = await toolsStore.createApiKey({
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
		await toolsStore.updateApiKey(key.id, { enabled: !key.enabled })
	} catch (err) {
		alert(err.message)
	}
}

async function handleRegenerateApiKey(key) {
	if (!confirm(`Regenerate API key "${key.name}"? Existing token will stop working immediately.`)) return
	try {
		const result = await toolsStore.regenerateApiKey(key.id)
		lastGeneratedApiToken.value = result.token || ''
		lastGeneratedApiKeyId.value = result.key?.id || key.id
	} catch (err) {
		alert(err.message)
	}
}

async function handleDeleteApiKey(key) {
	if (!confirm(`Delete API key "${key.name}"?`)) return
	try {
		await toolsStore.deleteApiKey(key.id)
		if (lastGeneratedApiKeyId.value === key.id) {
			lastGeneratedApiToken.value = ''
			lastGeneratedApiKeyId.value = null
		}
	} catch (err) {
		alert(err.message)
	}
}

function handleFileSelect(event) {
	const file = event.target.files[0]
	if (file) {
		const reader = new FileReader()
		reader.onload = e => {
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
		await domainsStore.fetchDomains()
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

watch([() => exportSettings.value.dateSince, () => exportSettings.value.domain], () => {
	fetchExportCount()
})

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
</script>

<style scoped>
.import-export-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
	align-items: start;
	min-width: 0;
}

.import-export-grid > * {
	min-width: 0;
}

@media (max-width: 640px) {
	.import-export-grid {
		grid-template-columns: 1fr;
	}
}
</style>
