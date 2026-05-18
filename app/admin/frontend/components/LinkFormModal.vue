<template>
	<div class="modal-overlay" @click.self="handleOverlayClick">
		<div class="modal">
			<h2>{{ link ? 'Edit Link' : 'Create Link' }}</h2>
			<form
				ref="formRef"
				class="link-form-modal-form"
				:class="{
					'form-pending-data': !formDataReady,
					'form-syncing': formSyncing
				}"
				:aria-busy="!formDataReady || formSyncing"
				novalidate
				@submit.prevent="handleSubmit"
				@input="onFormInput"
				@change="onFormChange"
				@focusin="onFormFocusIn"
			>
				<fieldset class="form-pending-data__fields" :disabled="formFieldsDisabled">
				<div class="tabs link-form-modal-tabs">
					<button 
						type="button" 
						class="tab-button" 
						:class="{ active: activeTab === 'basic' }"
						@mousedown="onTabPointerDown"
						@click="switchTab('basic')"
					>
						Basic
					</button>
					<button 
						type="button" 
						class="tab-button" 
						:class="{ active: activeTab === 'expiration' }"
						@mousedown="onTabPointerDown"
						@click="switchTab('expiration')"
					>
						Expiration
					</button>
					<button 
						type="button" 
						class="tab-button" 
						:class="{ active: activeTab === 'advanced' }"
						@mousedown="onTabPointerDown"
						@click="switchTab('advanced')"
					>
						Advanced
					</button>
				</div>

				<div class="link-form-tab-panels" aria-live="polite">
					<div class="link-form-tab-viewport">
						<div class="link-form-tab-track" :style="{ transform: tabTrackTransform }">
							<div class="link-form-tab-slide" data-tab="basic" :inert="activeTab !== 'basic'">
								<div class="form-group">
									<label>Domain / Slug</label>
									<div class="domain-slug-row">
										<select
											v-model="formData.domain"
											required
											:class="{ 'field-changed': isFieldChanged('domain') }"
										>
											<option value="">Select domain...</option>
											<option v-for="domain in settingsStore.domains" :key="domain.id" :value="domain.domain">
												{{ domain.domain }}
											</option>
										</select>
										<span class="separator">/</span>
										<input
											ref="slugInput"
											v-model="formData.slug"
											required
											:class="{ 'field-changed': isFieldChanged('slug') }"
											@blur="handleSlugBlur"
										/>
									</div>
								</div>
								<div class="form-group">
									<label>Target URL</label>
									<input
										ref="urlInput"
										v-model="formData.url"
										type="url"
										required
										pattern=".*\.\S+.*"
										title="URL must contain at least one top-level domain (e.g., .com, .org)"
										:class="{ 'field-changed': isFieldChanged('url') }"
										@blur="handleUrlBlur"
									/>
								</div>
								<div class="form-group">
									<label>Comment (optional)</label>
									<textarea
										v-model="formData.comment"
										rows="3"
										:class="{ 'field-changed': isFieldChanged('comment') }"
									></textarea>
								</div>
							</div>

							<div class="link-form-tab-slide" data-tab="expiration" :inert="activeTab !== 'expiration'">
								<div class="form-group">
									<label :class="{ 'field-changed': isExpireEnabledChanged() }">
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
										:class="{ 'field-changed': isFieldChanged('expire') }"
									/>
								</div>
								<div class="form-group">
									<label :class="{ 'label-disabled': !expireEnabled }">Expired URL (optional)</label>
									<input
										v-model="formData.expired_url"
										type="text"
										:disabled="!expireEnabled"
										:class="{ 'field-changed': isFieldChanged('expired_url') }"
										@blur="handleExpiredUrlBlur"
									/>
								</div>
							</div>

							<div class="link-form-tab-slide" data-tab="advanced" :inert="activeTab !== 'advanced'">
								<div class="form-group">
									<label>Redirect Code</label>
									<select
										v-model="formData.redirect_code"
										:class="{ 'field-changed': isFieldChanged('redirect_code') }"
									>
										<option value="301">301 - Permanent</option>
										<option value="302">302 - Found</option>
										<option value="303">303 - See Other</option>
										<option value="307">307 - Temporary</option>
										<option value="308">308 - Permanent</option>
									</select>
								</div>
								<div class="form-group">
									<label :class="{ 'field-changed': isFieldChanged('keep_referrer') }">
										<input type="checkbox" v-model="formData.keep_referrer" />
										Keep Referrer
									</label>
								</div>
								<div class="form-group">
									<label :class="{ 'field-changed': isFieldChanged('keep_query_params') }">
										<input type="checkbox" v-model="formData.keep_query_params" />
										Keep Query Params
									</label>
								</div>
							</div>
						</div>
					</div>
				</div>

				</fieldset>

				<div class="form-actions">
					<span
						v-if="formStatusText"
						class="form-status-bar"
						:class="formStatusKind ? `form-status-bar--${formStatusKind}` : undefined"
						role="status"
						aria-live="polite"
					>{{ formStatusText }}</span>
					<button
						ref="cancelButton"
						type="button"
						:disabled="formSyncing"
						@click="handleClose"
					>
						Cancel
					</button>
					<button ref="submitButton" type="submit" :disabled="formActionsDisabled">
						Save
					</button>
				</div>
			</form>
		</div>
		<FieldHint
			:open="fieldHint.state.open"
			:message="fieldHint.state.message"
			:variant="fieldHint.state.variant"
			:anchor="fieldHint.state.anchor"
			:items="fieldHint.state.items"
			:placement="fieldHint.state.placement"
			:see-more-href="fieldHint.state.seeMoreHref"
			:see-more-label="fieldHint.state.seeMoreLabel"
		/>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLinksStore } from '../stores/links.js'
import { useSettingsStore } from '../stores/settings.js'
import { useFieldHint } from '../composables/useFieldHint.js'
import FieldHint from './FieldHint.vue'

const props = defineProps({
	link: Object
})

const emit = defineEmits(['close', 'saved'])

const router = useRouter()
const linksStore = useLinksStore()
const settingsStore = useSettingsStore()

const DUPLICATE_URL_PREVIEW_LIMIT = 5
const formDataReady = ref(false)
const formSyncing = ref(false)
const formRef = ref(null)
const slugInput = ref(null)
const urlInput = ref(null)
const cancelButton = ref(null)
const submitButton = ref(null)
const initialFormData = ref(null)
const initializedFormKey = ref(null)
const fieldHint = useFieldHint()
const hintShown = ref(false)
let suppressUnsavedHintFocusDismiss = false

function dismissUnsavedWarning() {
	fieldHint.hide()
	hintShown.value = false
}

function onFormInput(event) {
	// Select fires `input` before `change`; a form-level handler would re-render with a
	// stale :value and snap the dropdown back (edit mode looked "stuck").
	if (event.target?.tagName === 'SELECT') {
		return
	}
	fieldHint.hide()
	if (hintShown.value) {
		hintShown.value = false
	}
}

function onFormChange(event) {
	if (event.target?.tagName !== 'SELECT') {
		return
	}
	fieldHint.hide()
	if (hintShown.value) {
		hintShown.value = false
	}
	if (event.target.closest('.domain-slug-row')) {
		nextTick(() => checkSlug())
	}
}

function onFormFocusIn(event) {
	if (!hintShown.value || suppressUnsavedHintFocusDismiss) return
	if (event.target === cancelButton.value) return
	dismissUnsavedWarning()
}

function showUnsavedWarning() {
	hintShown.value = true
	fieldHint.show({
		anchor: cancelButton.value,
		message: 'You have unsaved changes. Press Cancel or Esc again to abandon them.',
		variant: 'warning'
	})
	suppressUnsavedHintFocusDismiss = true
	nextTick(() => {
		cancelButton.value?.focus()
		nextTick(() => {
			suppressUnsavedHintFocusDismiss = false
		})
	})
}

const activeTab = ref('basic')
let skipFieldBlurCheck = false

function onTabPointerDown() {
	// mousedown runs before blur on the field losing focus (tab click)
	skipFieldBlurCheck = true
	fieldHint.hide()
}

function switchTab(tab) {
	if (activeTab.value === tab) {
		nextTick(() => {
			skipFieldBlurCheck = false
		})
		return
	}
	activeTab.value = tab
	nextTick(() => {
		skipFieldBlurCheck = false
	})
}

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
const formFieldsDisabled = computed(() => !formDataReady.value || formSyncing.value)
const formActionsDisabled = computed(() => !formDataReady.value || formSyncing.value)
const formStatusText = computed(() => {
	if (formSyncing.value) return 'Saving'
	if (!formDataReady.value) return 'Loading data'
	return ''
})
const formStatusKind = computed(() => {
	if (formSyncing.value) return 'saving'
	if (!formDataReady.value) return 'loading'
	return ''
})
const expireEnabled = ref(false)
const initialExpireEnabled = ref(false)
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

const linkFormKey = computed(() =>
	props.link?.id != null ? String(props.link.id) : 'create'
)

function isFieldChanged(key) {
	if (!initialFormData.value) return false
	return formData.value[key] !== initialFormData.value[key]
}

function isExpireEnabledChanged() {
	return expireEnabled.value !== initialExpireEnabled.value
}

function hasChanges() {
	if (!initialFormData.value) return false
	if (isExpireEnabledChanged()) return true
	return JSON.stringify(formData.value) !== JSON.stringify(initialFormData.value)
}

function handleOverlayClick() {
	if (formSyncing.value) return
	if (hasChanges()) {
		showUnsavedWarning()
		return
	}
	handleClose()
}

function handleClose() {
	if (formSyncing.value) return
	if (hasChanges() && !hintShown.value) {
		showUnsavedWarning()
		return
	}
	dismissUnsavedWarning()
	if (initialFormData.value) {
		formData.value = JSON.parse(JSON.stringify(initialFormData.value))
		expireEnabled.value = initialExpireEnabled.value
	}
	emit('close')
}

function handleEscape(event) {
	if (event.key !== 'Escape') return
	if (formSyncing.value) return
	event.preventDefault()
	event.stopPropagation()
	handleClose()
}

async function initializeForm() {
	const key = linkFormKey.value
	if (initializedFormKey.value === key && formDataReady.value) {
		return
	}

	formDataReady.value = false
	formSyncing.value = false
	dismissUnsavedWarning()

	try {
		if (settingsStore.domains.length === 0) {
			await settingsStore.fetchDomains()
		}

		if (Object.keys(settingsStore.defaults).length === 0) {
			await settingsStore.fetchSettings()
		}

		const link = props.link ? JSON.parse(JSON.stringify(props.link)) : null

		if (link) {
			const hasExpire = !!link.expire
			expireEnabled.value = hasExpire
			formData.value = {
				domain: link.domain || '',
				slug: link.slug,
				url: link.url,
				expired_url: link.expired_url || '',
				expire: hasExpire ? new Date(link.expire).toISOString().slice(0, 16) : '',
				comment: link.comment || '',
				redirect_code: link.redirect_code?.toString() || settingsStore.defaults.redirect_code || '303',
				keep_referrer: link.keep_referrer !== undefined ? link.keep_referrer : (settingsStore.defaults.keep_referrer === 'true' || settingsStore.defaults.keep_referrer === true),
				keep_query_params: link.keep_query_params !== undefined ? link.keep_query_params : (settingsStore.defaults.keep_query_params === 'true' || settingsStore.defaults.keep_query_params === true)
			}
		} else {
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

		initialExpireEnabled.value = expireEnabled.value
		initialFormData.value = JSON.parse(JSON.stringify(formData.value))
		initializedFormKey.value = key
	} finally {
		formDataReady.value = true
		await nextTick()
		if (slugInput.value) {
			slugInput.value.focus()
		}
	}
}

// Store the bound function so we can remove it properly
const boundHandleEscape = (event) => handleEscape(event)

// Expose bound function so parent can remove/add listener
defineExpose({ hasChanges, boundHandleEscape })

onMounted(() => {
	window.addEventListener('keydown', boundHandleEscape)
})

onUnmounted(() => {
	window.removeEventListener('keydown', boundHandleEscape)
	dismissUnsavedWarning()
	initializedFormKey.value = null
})

// Re-initialize only when opening a different link (not on reactive store updates)
watch(linkFormKey, initializeForm, { immediate: true })

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

function handleSlugBlur() {
	if (skipFieldBlurCheck) return
	checkSlug()
}

function handleUrlBlur() {
	if (skipFieldBlurCheck) return
	if (!formData.value.url) return
	formData.value.url = cleanUrl(formData.value.url)
	checkUrl()
}

function handleExpiredUrlBlur() {
	if (formData.value.expired_url) {
		formData.value.expired_url = cleanUrl(formData.value.expired_url)
	}
}

async function checkSlug() {
	const domain = formData.value.domain?.trim()
	const slug = formData.value.slug?.trim()
	if (!domain || !slug) return false

	if (
		initialFormData.value &&
		domain === initialFormData.value.domain &&
		slug === initialFormData.value.slug
	) {
		return false
	}

	const existing = await linksStore.checkSlug(domain, slug, props.link?.id)
	if (existing.length === 0) return false

	const msg =
		existing.length === 1
			? `Slug "${slug}" is already used on ${domain}.`
			: `Found ${existing.length} links with slug "${slug}" on ${domain}.`

	fieldHint.show({
		anchor: slugInput.value,
		message: msg,
		variant: 'warning'
	})
	return true
}

async function checkUrl() {
	if (!formData.value.url) return false

	const cleaned = cleanUrl(formData.value.url)
	if (props.link && cleaned === cleanUrl(props.link.url || '')) {
		return false
	}

	const existing = await linksStore.checkUrl(cleaned, props.link?.id)
	if (existing.length === 0) return false

	const sorted = [...existing].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
	const preview = sorted.slice(0, DUPLICATE_URL_PREVIEW_LIMIT)
	const total = existing.length
	const message =
		total === 1
			? 'There is already a link that points to this URL:'
			: `Found ${total} links with this URL:`

	const seeMoreHref = router.resolve({
		path: `/links/search/${encodeURIComponent(cleaned)}`
	}).href

	fieldHint.show({
		anchor: urlInput.value,
		message,
		items: preview.map((link) => ({
			id: link.id,
			domain: link.domain,
			slug: link.slug
		})),
		variant: 'info',
		placement: 'right',
		seeMoreHref,
		seeMoreLabel: 'Details →'
	})
	return true
}

function resolveSaveErrorAnchor(message) {
	const text = message.toLowerCase()
	if (text.includes('slug')) return slugInput.value
	if (text.includes('top-level domain')) {
		return urlInput.value
	}
	if (text.includes('domain')) {
		return formRef.value?.querySelector('.domain-slug-row select') ?? null
	}
	return submitButton.value
}

async function showSaveError(message) {
	let anchor = resolveSaveErrorAnchor(message)

	const tab = anchor?.closest?.('[data-tab]')?.dataset?.tab
	if (tab && activeTab.value !== tab) {
		activeTab.value = tab
		await nextTick()
		anchor = resolveSaveErrorAnchor(message)
	}

	if (!anchor) {
		anchor = submitButton.value
	}

	anchor?.focus()
	fieldHint.show({
		anchor,
		message,
		variant: 'error'
	})
}

async function focusFirstInvalidField(form) {
	const firstInvalid = form.querySelector('input:invalid, select:invalid, textarea:invalid')
	if (!firstInvalid) {
		form.reportValidity()
		return
	}

	const tab = firstInvalid.closest('[data-tab]')?.dataset?.tab
	if (tab && activeTab.value !== tab) {
		activeTab.value = tab
		await nextTick()
	}

	firstInvalid.focus()
	const message = firstInvalid.validationMessage || firstInvalid.title || 'Please check this field.'
	fieldHint.show({ anchor: firstInvalid, message, variant: 'error' })
}

async function handleSubmit() {
	if (!formDataReady.value || formSyncing.value) return

	dismissUnsavedWarning()

	if (formData.value.url) {
		formData.value.url = cleanUrl(formData.value.url)
	}

	await nextTick()

	const form = formRef.value
	if (!form) return

	if (!form.checkValidity()) {
		await focusFirstInvalidField(form)
		return
	}

	await checkUrl()

	if (await checkSlug()) {
		return
	}

	const data = {
		...formData.value,
		expire: expireEnabled.value && formData.value.expire ? new Date(formData.value.expire).getTime() : null,
		redirect_code: parseInt(formData.value.redirect_code) || 303,
		keep_referrer: formData.value.keep_referrer || false,
		keep_query_params: formData.value.keep_query_params || false
	}

	formSyncing.value = true
	fieldHint.hide()

	try {
		if (props.link) {
			await linksStore.updateLink(props.link.id, data)
		} else {
			await linksStore.createLink(data)
		}
		emit('saved')
	} catch (err) {
		await showSaveError(err.message || 'Failed to save link')
	} finally {
		formSyncing.value = false
	}
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
	min-width: 0;
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

</style>

