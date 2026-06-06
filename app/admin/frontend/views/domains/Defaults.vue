<template>
	<div class='general-settings' :class="{ 'loading-overlay': domainsStore.loading }">
		<div class=settings-columns>
			<div class='settings-column settings-card'>
				<form @submit.prevent class=settings-form>
					<div class=form-group>
						<label>Default domain for new links</label>
						<select v-model=localDefaults.default_domain>
							<option value="">None</option>
							<option v-for="domain in domainsStore.domains" :key=domain.id :value=domain.domain>
								{{ domain.domain }}
							</option>
						</select>
					</div>
					<div class=form-group>
						<label>Default expired URL</label>
						<input
							v-model=localDefaults.expired_url
							type=text
							placeholder='example.com/expired or https://example.com/expired'
							@blur="normalizeField('expired_url')"
						/>
					</div>
					<div class=form-group>
						<label>Default redirect code</label>
						<select v-model=localDefaults.redirect_code>
							<option value=301>301 - Permanent</option>
							<option value=302>302 - Found</option>
							<option value=303>303 - See Other</option>
							<option value=307>307 - Temporary</option>
							<option value=308>308 - Permanent</option>
						</select>
					</div>
					<div class=form-group>
						<label>
							<input type=checkbox v-model=localDefaults.keep_referrer />
							Keep referrer default
						</label>
					</div>
					<div class=form-group>
						<label>
							<input type=checkbox v-model=localDefaults.keep_query_params />
							Keep query params default
						</label>
					</div>
				</form>
			</div>

			<div class='settings-column settings-card'>
				<form @submit.prevent class=settings-form>
					<div class=form-group>
						<label>404 error URL</label>
						<input
							v-model=localSettings.error_404_url
							type=text
							placeholder=example.com/404
							@blur="normalizeField('error_404_url')"
						/>
					</div>
					<div class=form-group>
						<label>500/403 error URL</label>
						<input
							v-model=localSettings.error_500_url
							type=text
							placeholder=example.com/error
							@blur="normalizeField('error_500_url')"
						/>
					</div>
				</form>
			</div>
		</div>

		<div class=form-actions>
			<div
				v-if=formStatusText
				class=form-status-bar
				:class="formStatusKind ? `form-status-bar--${formStatusKind}` : undefined"
				role=status
				aria-live=polite
			>{{ formStatusText }}</div>
			<button type=button @click=resetSettings class=btn-secondary :disabled='!hasUnsavedChanges || saving'>Reset</button>
			<button type=button @click=saveSettings class=btn-primary :disabled='saving || !hasUnsavedChanges'>Save Settings</button>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDomainsStore } from '../../stores/domains.js'
import { cleanUrl, globalDefaultBool } from '../../utils/normalize-url.js'

const domainsStore = useDomainsStore()

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

const originalSettings = ref({ error_404_url: '', error_500_url: '' })
const originalDefaults = ref({
	default_domain: '',
	expired_url: '',
	redirect_code: '303',
	keep_referrer: false,
	keep_query_params: false
})

const saving = ref(false)
const saveSuccess = ref(false)
let saveSuccessTimeout = null

const hasUnsavedChanges = computed(() =>
	JSON.stringify(localSettings.value) !== JSON.stringify(originalSettings.value) ||
	JSON.stringify(localDefaults.value) !== JSON.stringify(originalDefaults.value)
)

const formStatusText = computed(() => {
	if (saving.value) return 'Saving'
	if (domainsStore.loading) return 'Loading data'
	if (saveSuccess.value) return 'Settings saved successfully'
	return ''
})

const formStatusKind = computed(() => {
	if (saving.value) return 'saving'
	if (domainsStore.loading) return 'loading'
	if (saveSuccess.value) return 'success'
	return ''
})

function syncFromStore() {
	localSettings.value = { ...domainsStore.settings }
	originalSettings.value = { ...domainsStore.settings }

	let defaultDomainName = ''
	if (domainsStore.defaults.default_domain_id) {
		const domain = domainsStore.domains.find(
			d => d.id.toString() === domainsStore.defaults.default_domain_id.toString()
		)
		defaultDomainName = domain ? domain.domain : ''
	}

	const defaults = {
		default_domain: defaultDomainName,
		expired_url: domainsStore.defaults.expired_url || '',
		redirect_code: domainsStore.defaults.redirect_code || '303',
		keep_referrer: globalDefaultBool(domainsStore.defaults, 'keep_referrer'),
		keep_query_params: globalDefaultBool(domainsStore.defaults, 'keep_query_params')
	}

	localDefaults.value = { ...defaults }
	originalDefaults.value = { ...defaults }
}

function normalizeField(field) {
	if (field === 'error_404_url') {
		localSettings.value.error_404_url = cleanUrl(localSettings.value.error_404_url)
	} else if (field === 'error_500_url') {
		localSettings.value.error_500_url = cleanUrl(localSettings.value.error_500_url)
	} else if (field === 'expired_url') {
		localDefaults.value.expired_url = cleanUrl(localDefaults.value.expired_url)
	}
}

function resetSettings() {
	if (!hasUnsavedChanges.value) return

	if (!confirm('Are you sure you want to reset all unsaved changes? This action cannot be undone.')) {
		return
	}

	localSettings.value = { ...originalSettings.value }
	localDefaults.value = { ...originalDefaults.value }
	saveSuccess.value = false
}

async function saveSettings() {
	if (saving.value) return
	saving.value = true
	saveSuccess.value = false
	try {
		normalizeField('error_404_url')
		normalizeField('error_500_url')
		normalizeField('expired_url')

		let defaultDomainId = ''
		if (localDefaults.value.default_domain) {
			const domain = domainsStore.domains.find(d => d.domain === localDefaults.value.default_domain)
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
		delete defaultsToSave.default_domain

		await domainsStore.updateDefaults(localSettings.value, defaultsToSave)

		originalSettings.value = { ...localSettings.value }
		originalDefaults.value = { ...localDefaults.value }

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
	} finally {
		saving.value = false
	}
}

onMounted(async () => {
	await Promise.all([
		domainsStore.fetchDomains(),
		domainsStore.fetchDefaults()
	])
	syncFromStore()
})

onUnmounted(() => {
	if (saveSuccessTimeout) {
		clearTimeout(saveSuccessTimeout)
	}
})
</script>

<style scoped>
.settings-columns {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
	margin-bottom: 1rem;
}

.settings-form {
	max-width: 100%;
}

.form-group input[type=checkbox] {
	margin-right: 0.5rem;
}

@media (max-width: 900px) {
	.settings-columns {
		grid-template-columns: 1fr;
	}
}
</style>
