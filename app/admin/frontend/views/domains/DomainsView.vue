<template>
	<div class="domains-view">
		<DomainsList
			:loading="domainsStore.loading"
			:domains="domainsStore.domains"
			:show-add-domain="showAddDomain"
			:new-domain="newDomain"
			:show-domain-unsaved-hint="showDomainUnsavedHint"
			:domain-input-ref-setter="setDomainInput"
			:domain-cancel-button-ref-setter="setDomainCancelButton"
			:handle-close-domain-modal="handleCloseDomainModal"
			:handle-add-domain="handleAddDomain"
			@update:new-domain="newDomain = $event"
		/>

		<button type="button" class="btn-primary" @click="showAddDomain = true">Add Domain</button>

		<section class="view-group">
			<Defaults
				:loading="domainsStore.loading"
				:saving="savingSettings"
				:domains="domainsStore.domains"
				:local-defaults="localDefaults"
				:local-settings="localSettings"
				:save-success="saveSuccess"
				:has-unsaved-changes="hasUnsavedChanges()"
				:reset-settings="resetSettings"
				:save-settings="saveSettings"
				:normalize-url="normalizeUrl"
			/>
		</section>

		<section class="view-group view-group--danger">
			<DangerZone
				:domains="domainsStore.domains"
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
		</section>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useDomainsStore } from '../../stores/domains.js'
import { useAuthStore } from '../../stores/auth.js'
import Defaults from './Defaults.vue'
import DomainsList from './DomainsList.vue'
import DangerZone from './DangerZone.vue'

const domainsStore = useDomainsStore()
const authStore = useAuthStore()
const showAddDomain = ref(false)
const newDomain = ref('')
const initialDomain = ref('')
const saveSuccess = ref(false)
const savingSettings = ref(false)
const domainInput = ref(null)
const domainCancelButton = ref(null)
const showDomainUnsavedHint = ref(false)
const domainHintShown = ref(false)
let saveSuccessTimeout = null

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

const setDomainConfirmInput = el => {
	domainConfirmInputRef.value = el
}

watch(showAddDomain, async isOpen => {
	if (isOpen) {
		initialDomain.value = newDomain.value.trim()
		domainHintShown.value = false
		showDomainUnsavedHint.value = false
		await nextTick()
		if (domainInput.value) {
			domainInput.value.focus()
		}
	}
})

function handleCloseDomainModal() {
	if (hasDomainChanges() && !domainHintShown.value) {
		showDomainUnsavedHint.value = true
		domainHintShown.value = true
		nextTick(() => {
			if (domainCancelButton.value) {
				domainCancelButton.value.focus()
			}
		})
		setTimeout(() => {
			showDomainUnsavedHint.value = false
		}, 5000)
		return
	}
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
		if (domainHintShown.value) {
			return
		}
		handleCloseDomainModal()
	}
}

onBeforeRouteLeave((to, from, next) => {
	if (hasDomainChanges()) {
		next(false)
		return
	}
	next()
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
	window.addEventListener('keydown', handleEscape)

	await domainsStore.fetchDomains()
	await domainsStore.fetchDefaults()

	localSettings.value = { ...domainsStore.settings }
	originalSettings.value = { ...domainsStore.settings }

	let defaultDomainName = ''
	if (domainsStore.defaults.default_domain_id) {
		const domain = domainsStore.domains.find(d => d.id.toString() === domainsStore.defaults.default_domain_id.toString())
		defaultDomainName = domain ? domain.domain : ''
	}

	const defaults = {
		default_domain: defaultDomainName,
		expired_url: domainsStore.defaults.expired_url || '',
		redirect_code: domainsStore.defaults.redirect_code || '303',
		keep_referrer: domainsStore.defaults.keep_referrer === 'true' || domainsStore.defaults.keep_referrer === true,
		keep_query_params: domainsStore.defaults.keep_query_params === 'true' || domainsStore.defaults.keep_query_params === true
	}

	localDefaults.value = { ...defaults }
	originalDefaults.value = { ...defaults }
})

onUnmounted(() => {
	window.removeEventListener('keydown', handleEscape)
	if (saveSuccessTimeout) {
		clearTimeout(saveSuccessTimeout)
	}
})

function normalizeUrl(field) {
	const addHttps = url => {
		if (!url || url.trim() === '') return url
		const trimmed = url.trim()
		if (/^https?:\/\//i.test(trimmed)) {
			return trimmed
		}
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
	if (savingSettings.value) return
	savingSettings.value = true
	saveSuccess.value = false
	try {
		normalizeUrl('error_404_url')
		normalizeUrl('error_500_url')
		normalizeUrl('expired_url')

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
		savingSettings.value = false
	}
}

async function handleAddDomain() {
	const domain = newDomain.value.trim()
	if (!domain) return

	if (!domain.includes('.')) {
		alert('Domain must contain at least one dot (e.g., example.com)')
		return
	}

	try {
		await domainsStore.createDomain(domain)
		newDomain.value = ''
		domainHintShown.value = false
		showDomainUnsavedHint.value = false
		showAddDomain.value = false
	} catch (err) {
		alert(err.message)
	}
}

watch(dangerZoneDomain, () => {
	showDomainConfirmInput.value = false
	domainConfirmInput.value = ''
})

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
		const response = await authStore.authedFetch('/api/domains/delete-with-links', {
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
		await domainsStore.fetchDomains()
	} catch (err) {
		alert(err.message)
	} finally {
		deletingDomain.value = false
	}
}
</script>
