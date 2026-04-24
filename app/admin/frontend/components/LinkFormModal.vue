<template>
	<div class="modal-overlay" @click.self="handleClose">
		<div class="modal">
			<h2>{{ link ? 'Edit Link' : 'Create Link' }}</h2>
			<form @submit.prevent="handleSubmit">
				<div class="tabs link-form-modal-tabs">
					<button 
						type="button" 
						class="tab-button" 
						:class="{ active: activeTab === 'basic' }"
						@click="activeTab = 'basic'"
					>
						Basic
					</button>
					<button 
						type="button" 
						class="tab-button" 
						:class="{ active: activeTab === 'expiration' }"
						@click="activeTab = 'expiration'"
					>
						Expiration
					</button>
					<button 
						type="button" 
						class="tab-button" 
						:class="{ active: activeTab === 'advanced' }"
						@click="activeTab = 'advanced'"
					>
						Advanced
					</button>
				</div>

				<div class="link-form-tab-panels" aria-live="polite">
					<div class="link-form-tab-viewport">
						<div class="link-form-tab-track" :style="{ transform: tabTrackTransform }">
							<div class="link-form-tab-slide" :inert="activeTab !== 'basic'">
								<div class="form-group">
									<label>Domain / Slug</label>
									<div class="domain-slug-row">
										<select v-model="formData.domain" required>
											<option value="">Select domain...</option>
											<option v-for="domain in settingsStore.domains" :key="domain.id" :value="domain.domain">
												{{ domain.domain }}
											</option>
										</select>
										<span class="separator">/</span>
										<input ref="slugInput" v-model="formData.slug" required />
									</div>
								</div>
								<div class="form-group">
									<label>Target URL</label>
									<input v-model="formData.url" type="url" required @blur="handleUrlBlur" />
								</div>
								<div class="form-group">
									<label>Comment (optional)</label>
									<textarea v-model="formData.comment" rows="3"></textarea>
								</div>
							</div>

							<div class="link-form-tab-slide" :inert="activeTab !== 'expiration'">
								<div class="form-group">
									<label>
										<input type="checkbox" v-model="expireEnabled" />
										Expire
									</label>
								</div>
								<div class="form-group">
									<label :class="{ 'label-disabled': !expireEnabled }">Expire Date</label>
									<input
										v-model="formData.expire"
										type="datetime-local"
										:required="expireEnabled"
										:disabled="!expireEnabled"
									/>
								</div>
								<div class="form-group">
									<label :class="{ 'label-disabled': !expireEnabled }">Expired URL (optional)</label>
									<input
										v-model="formData.expired_url"
										type="text"
										:disabled="!expireEnabled"
										@blur="handleExpiredUrlBlur"
									/>
								</div>
							</div>

							<div class="link-form-tab-slide" :inert="activeTab !== 'advanced'">
								<div class="form-group">
									<label>Redirect Code</label>
									<select v-model="formData.redirect_code">
										<option value="301">301 - Permanent</option>
										<option value="302">302 - Found</option>
										<option value="303">303 - See Other</option>
										<option value="307">307 - Temporary</option>
										<option value="308">308 - Permanent</option>
									</select>
								</div>
								<div class="form-group">
									<label>
										<input type="checkbox" v-model="formData.keep_referrer" />
										Keep Referrer
									</label>
								</div>
								<div class="form-group">
									<label>
										<input type="checkbox" v-model="formData.keep_query_params" />
										Keep Query Params
									</label>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div v-if="showUnsavedHint" class="unsaved-hint">You have unsaved changes. Press Cancel to abandon them.</div>
				<div class="form-actions">
					<button ref="cancelButton" type="button" @click="handleClose">Cancel</button>
					<button type="submit">Save</button>
				</div>
			</form>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useLinksStore } from '../stores/links.js'
import { useSettingsStore } from '../stores/settings.js'

const props = defineProps({
	link: Object
})

const emit = defineEmits(['close', 'save'])

const linksStore = useLinksStore()
const settingsStore = useSettingsStore()
const slugInput = ref(null)
const cancelButton = ref(null)
const initialFormData = ref(null)
const isHandlingEscape = ref(false)
const showUnsavedHint = ref(false)
const hintShown = ref(false)
const activeTab = ref('basic')
const tabSlideIndex = computed(() => {
	switch (activeTab.value) {
		case 'basic':
			return 0
		case 'expiration':
			return 1
		case 'advanced':
			return 2
		default:
			return 0
	}
})
const tabTrackTransform = computed(() => `translateX(calc(-${tabSlideIndex.value} * 100% / 3))`)
const expireEnabled = ref(false)
const formData = ref({
	domain: '',
	slug: '',
	url: '',
	expired_url: '',
	expire: '',
	comment: '',
	redirect_code: '303',
	keep_referrer: false,
	keep_query_params: false
})

function hasChanges() {
	if (!initialFormData.value) return false
	const current = JSON.stringify(formData.value)
	const initial = JSON.stringify(initialFormData.value)
	return current !== initial
}

function handleClose() {
	// If there are changes and we haven't shown the hint yet, show hint and focus cancel button
	if (hasChanges() && !hintShown.value) {
		showUnsavedHint.value = true
		hintShown.value = true
		nextTick(() => {
			if (cancelButton.value) {
				cancelButton.value.focus()
			}
		})
		// Hide hint after 5 seconds
		setTimeout(() => {
			showUnsavedHint.value = false
		}, 5000)
		return
	}
	// If hint was already shown, or no changes, close normally
	showUnsavedHint.value = false
	hintShown.value = false
	emit('close')
}

function handleEscape(event) {
	if (event.key === 'Escape') {
		event.preventDefault()
		event.stopPropagation()
		// If hint was already shown, don't handle ESC again - let the Cancel button handle it
		if (hintShown.value) {
			return
		}
		handleClose()
	}
}

async function initializeForm() {
	// Reset hint state when form is initialized
	hintShown.value = false
	showUnsavedHint.value = false
	
	// Fetch domains if not already loaded
	if (settingsStore.domains.length === 0) {
		await settingsStore.fetchDomains()
	}

	// Fetch settings to get default domain
	if (Object.keys(settingsStore.defaults).length === 0) {
		await settingsStore.fetchSettings()
	}

	if (props.link) {
		// Editing existing link
		const hasExpire = !!props.link.expire
		expireEnabled.value = hasExpire
		formData.value = {
			domain: props.link.domain,
			slug: props.link.slug,
			url: props.link.url,
			expired_url: props.link.expired_url || '',
			expire: hasExpire ? new Date(props.link.expire).toISOString().slice(0, 16) : '',
			comment: props.link.comment || '',
			redirect_code: props.link.redirect_code?.toString() || settingsStore.defaults.redirect_code || '303',
			keep_referrer: props.link.keep_referrer !== undefined ? props.link.keep_referrer : (settingsStore.defaults.keep_referrer === 'true' || settingsStore.defaults.keep_referrer === true),
			keep_query_params: props.link.keep_query_params !== undefined ? props.link.keep_query_params : (settingsStore.defaults.keep_query_params === 'true' || settingsStore.defaults.keep_query_params === true)
		}
	} else {
		// Creating new link - set default domain and values from settings
		expireEnabled.value = false
		let defaultDomain = ''
		if (settingsStore.defaults.default_domain_id) {
			const domain = settingsStore.domains.find(d => d.id.toString() === settingsStore.defaults.default_domain_id.toString())
			if (domain) {
				defaultDomain = domain.domain
			}
		}
		
		formData.value = {
			domain: defaultDomain,
			slug: '',
			url: '',
			expired_url: settingsStore.defaults.expired_url || '',
			expire: '',
			comment: '',
			redirect_code: settingsStore.defaults.redirect_code || '303',
			keep_referrer: settingsStore.defaults.keep_referrer === 'true' || settingsStore.defaults.keep_referrer === true,
			keep_query_params: settingsStore.defaults.keep_query_params === 'true' || settingsStore.defaults.keep_query_params === true
		}
	}

	// Store initial state for change detection
	initialFormData.value = JSON.parse(JSON.stringify(formData.value))

	// Focus on slug field
	await nextTick()
	if (slugInput.value) {
		slugInput.value.focus()
	}
}

// Store the bound function so we can remove it properly
const boundHandleEscape = (event) => handleEscape(event)

// Expose bound function so parent can remove/add listener
defineExpose({ hasChanges, boundHandleEscape })

onMounted(() => {
	initializeForm()
	window.addEventListener('keydown', boundHandleEscape)
})

onUnmounted(() => {
	window.removeEventListener('keydown', boundHandleEscape)
})

// Re-initialize when link prop changes
watch(() => props.link, initializeForm, { immediate: false })

// Clear expiration date when checkbox is unchecked
watch(expireEnabled, (enabled) => {
	if (!enabled) {
		formData.value.expire = ''
		formData.value.expired_url = ''
	}
})

function cleanUrl(url) {
	if (!url) return url
	url = url.trim()
	
	// Remove leading slashes that might cause issues
	url = url.replace(/^\/+/, '')
	
	// Remove duplicate protocols (e.g., '/https:///https://example.com' -> 'https://example.com')
	// Match protocol pattern and remove duplicates
	url = url.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)+/g, (match) => {
		// Extract the first protocol found
		const protocolMatch = match.match(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)/)
		return protocolMatch ? protocolMatch[1] : match
	})
	
	// Remove any remaining leading slashes after protocol cleanup
	url = url.replace(/^\/+/, '')
	
	// Check if URL already has any protocol (e.g., http://, https://, ftp://, mailto:, etc.)
	if (url && !url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
		return 'https://' + url
	}
	
	return url
}

function validateUrl(url) {
	if (!url) return { valid: true }
	
	try {
		// Try to create a URL object to validate
		new URL(url)
		return { valid: true }
	} catch (e) {
		return { valid: false, error: 'Invalid URL format' }
	}
}

function validateUrlHasTld(url) {
	if (!url) return true
	// Check if URL contains at least one TLD pattern (dot followed by non-slash, non-whitespace characters)
	return /\.\S+/.test(url)
}

function handleUrlBlur() {
	if (!formData.value.url) return
	
	// Clean the URL first
	formData.value.url = cleanUrl(formData.value.url)
	
	// Validate URL format
	const urlValidation = validateUrl(formData.value.url)
	if (!urlValidation.valid) {
		alert(urlValidation.error || 'Invalid URL format')
		formData.value.url = ''
		return
	}
	
	// Validate TLD
	if (!validateUrlHasTld(formData.value.url)) {
		alert('URL must contain at least one top-level domain (e.g., .com, .org, .blabla)')
		formData.value.url = ''
		return
	}
	
	checkUrl()
}

function handleExpiredUrlBlur() {
	if (formData.value.expired_url) {
		formData.value.expired_url = cleanUrl(formData.value.expired_url)
	}
}

async function checkUrl() {
	if (!formData.value.url) return
	const existing = await linksStore.checkUrl(formData.value.url)
	if (existing.length > 0) {
		const msg = `Found ${existing.length} existing link(s) with this URL. Create anyway?`
		if (!confirm(msg)) {
			formData.value.url = ''
		}
	}
}

function handleSubmit() {
	// Clean URL before validation
	if (formData.value.url) {
		formData.value.url = cleanUrl(formData.value.url)
	}
	
	// Validate URL format
	const urlValidation = validateUrl(formData.value.url)
	if (!urlValidation.valid) {
		alert(urlValidation.error || 'Invalid URL format')
		return
	}
	
	// Validate TLD
	if (!validateUrlHasTld(formData.value.url)) {
		alert('URL must contain at least one top-level domain (e.g., .com, .org, .blabla)')
		return
	}
	
	// Validate expiration date if expire is enabled
	if (expireEnabled.value && !formData.value.expire) {
		alert('Expire date is required when expiration is enabled')
		return
	}
	
	const data = {
		...formData.value,
		expire: expireEnabled.value && formData.value.expire ? new Date(formData.value.expire).getTime() : null,
		redirect_code: parseInt(formData.value.redirect_code) || 303,
		keep_referrer: formData.value.keep_referrer || false,
		keep_query_params: formData.value.keep_query_params || false
	}
	emit('save', data)
}
</script>

<style scoped>
/* Modal and form styles use global classes */

/* Horizontal slide: three panels in a row; viewport clips so tabs never stack visually */
.link-form-tab-panels {
	margin-top: 1.5rem;
}

.link-form-tab-viewport {
	overflow: hidden;
	width: 100%;
}

.link-form-tab-track {
	display: flex;
	width: 300%;
	align-items: stretch;
	transition: transform 0.22s ease-out;
	will-change: transform;
}

.link-form-tab-slide {
	flex: 0 0 calc(100% / 3);
	width: calc(100% / 3);
	box-sizing: border-box;
}

@media (prefers-reduced-motion: reduce) {
	.link-form-tab-track {
		transition: none;
	}
}

.domain-slug-row {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.domain-slug-row select {
	flex: 1;
}

.domain-slug-row .separator {
	font-size: 1.2rem;
	color: var(--text-primary);
	flex-shrink: 0;
}

.domain-slug-row input {
	flex: 1;
}

/* Tabs, form groups, form actions use global classes */

.label-disabled {
	color: #858585;
	opacity: 0.6;
}

.unsaved-hint {
	color: #f48771;
	font-size: 0.875rem;
	margin-bottom: 1rem;
	text-align: right;
	animation: fadeIn 0.2s ease-in;
}

.form-actions {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: 1rem;
	margin-top: 1.5rem;
}

@keyframes fadeIn {
	from {
		opacity: 0;
		transform: translateY(-5px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
</style>
