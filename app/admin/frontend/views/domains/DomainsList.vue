<template>
	<div class=domains-content :class="{ 'loading-overlay': domainsStore.loading }">
		<div class=domain-actions>
			<button type=button class=btn-primary @click='showAddDomain = true'>Add new domain</button>
		</div>

		<ul v-if=domainsStore.domains.length class=domain-list>
			<li
				v-for="domain in domainsStore.domains"
				:key=domain.id
				:ref="el => setRowRef(domain.id, el)"
				class=domain-row
				:class="{ 'domain-row--expanded': expandedDomainId === domain.id }"
			>
				<div class=domain-row-header>
					<span class=domain-name>{{ domain.domain }}</span>
					<div class=domain-row-meta>
						<span class=domain-links>
							<router-link
								v-if=domain.link_count
								:to='`/links/search/${encodeURIComponent(domain.domain)}`'
								class=link-count
							>
								See {{ domain.link_count }} link{{ domain.link_count === 1 ? '' : 's' }}
							</router-link>
							<span v-else class=link-count-zero>No links</span>
						</span>
						<button
							type=button
							class='btn-secondary btn-open'
							@click=onToggle(domain)
						>
							{{ expandedDomainId === domain.id ? 'Close' : 'Open' }} settings
						</button>
					</div>
				</div>

				<div v-if='expandedDomainId === domain.id' class=domain-row-body>
					<DomainOverrideFields
						v-if=overridesFor(domain.id)
						:domain-id=domain.id
						:overrides=overridesFor(domain.id)
						:global-defaults=domainsStore.defaults
						:global-settings=domainsStore.settings
						:saving='savingDomainId === domain.id'
						:save-error='saveErrors[domain.id] || ""'
						:save-success='saveSuccessId === domain.id'
						@save='payload => handleSaveOverrides(domain.id, payload)'
					/>
					<p v-else class=loading-inline>Loading settings…</p>
				</div>
			</li>
		</ul>

		<p v-else class=empty>No domains yet</p>

		<Transition name=modal-fade>
			<div v-if=showAddDomain class=modal-overlay @click.self=closeAddDomainModal>
				<div class=modal>
					<h3>Add Domain</h3>
					<form @submit.prevent=handleAddDomain>
						<div class=form-group>
							<label>Domain</label>
							<input ref=domainInputRef v-model=newDomain type=text placeholder=example.com required />
						</div>
						<div v-if=showUnsavedHint class=unsaved-hint>You have unsaved changes. Press Cancel to abandon them.</div>
						<div class=form-actions>
							<button ref=cancelButtonRef type=button @click=closeAddDomainModal>Cancel</button>
							<button type=submit>Add</button>
						</div>
					</form>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useDomainsStore } from '../../stores/domains.js'
import DomainOverrideFields from './DomainOverrideFields.vue'

const route = useRoute()
const router = useRouter()
const domainsStore = useDomainsStore()

const expandedDomainId = ref(null)
const savingDomainId = ref(null)
const saveErrors = ref({})
const saveSuccessId = ref(null)
const rowRefs = ref({})
let saveSuccessTimeout = null

const showAddDomain = ref(false)
const newDomain = ref('')
const initialDomain = ref('')
const showUnsavedHint = ref(false)
const hintShown = ref(false)
const domainInputRef = ref(null)
const cancelButtonRef = ref(null)

function parseRouteDomainId() {
	const raw = route.params.domainId
	if (!raw) return null
	const id = parseInt(String(raw), 10)
	return Number.isNaN(id) ? null : id
}

function setRowRef(id, el) {
	if (el) {
		rowRefs.value[id] = el
	}
}

function overridesFor(id) {
	return domainsStore.overridesById[String(id)] || null
}

async function syncExpandedFromRoute() {
	const id = parseRouteDomainId()
	expandedDomainId.value = id
	if (!id) return

	const exists = domainsStore.domains.some(d => d.id === id)
	if (!exists) {
		router.replace({ name: 'domains' })
		expandedDomainId.value = null
		return
	}

	try {
		await domainsStore.fetchDomainOverrides(id)
	} catch (err) {
		console.error(err)
	}

	await nextTick()
	rowRefs.value[id]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
}

function onToggle(domain) {
	if (expandedDomainId.value === domain.id) {
		closeDomain(domain)
	} else {
		openDomain(domain)
	}
}

function openDomain(domain) {
	router.push({ name: 'domains', params: { domainId: String(domain.id) } })
}

function closeDomain(domain) {
	if (parseRouteDomainId() === domain.id) {
		router.push({ name: 'domains' })
	}
	expandedDomainId.value = null
}

async function handleSaveOverrides(id, payload) {
	savingDomainId.value = id
	saveErrors.value = { ...saveErrors.value, [id]: '' }
	saveSuccessId.value = null
	if (saveSuccessTimeout) {
		clearTimeout(saveSuccessTimeout)
		saveSuccessTimeout = null
	}
	try {
		await domainsStore.updateDomainOverrides(id, payload)
		saveSuccessId.value = id
		saveSuccessTimeout = setTimeout(() => {
			if (saveSuccessId.value === id) {
				saveSuccessId.value = null
			}
		}, 3000)
	} catch (err) {
		saveErrors.value = { ...saveErrors.value, [id]: err.message }
	} finally {
		savingDomainId.value = null
	}
}

function hasAddDomainChanges() {
	return showAddDomain.value && newDomain.value.trim() !== initialDomain.value
}

function closeAddDomainModal() {
	if (hasAddDomainChanges() && !hintShown.value) {
		showUnsavedHint.value = true
		hintShown.value = true
		nextTick(() => {
			cancelButtonRef.value?.focus()
		})
		setTimeout(() => {
			showUnsavedHint.value = false
		}, 5000)
		return
	}
	showUnsavedHint.value = false
	hintShown.value = false
	newDomain.value = ''
	showAddDomain.value = false
}

function handleEscape(event) {
	if (event.key === 'Escape' && showAddDomain.value) {
		event.preventDefault()
		event.stopPropagation()
		if (hintShown.value) return
		closeAddDomainModal()
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
		hintShown.value = false
		showUnsavedHint.value = false
		showAddDomain.value = false
	} catch (err) {
		alert(err.message)
	}
}

watch(() => route.params.domainId, () => {
	syncExpandedFromRoute()
})

watch(showAddDomain, async isOpen => {
	if (isOpen) {
		initialDomain.value = newDomain.value.trim()
		hintShown.value = false
		showUnsavedHint.value = false
		await nextTick()
		domainInputRef.value?.focus()
	}
})

onBeforeRouteLeave((to, from, next) => {
	if (hasAddDomainChanges()) {
		next(false)
		return
	}
	next()
})

onMounted(async () => {
	window.addEventListener('keydown', handleEscape)
	await domainsStore.fetchDomains()
	await syncExpandedFromRoute()
})

onUnmounted(() => {
	window.removeEventListener('keydown', handleEscape)
	if (saveSuccessTimeout) {
		clearTimeout(saveSuccessTimeout)
	}
})
</script>

<style scoped>
.domains-content {
	width: 100%;
	min-width: 0;
}

.domain-actions {
	margin-bottom: 1rem;
}

.domain-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 1em;
}

.domain-row {
	padding: 1rem;
	background: var(--bg-secondary);
	border-radius: 8px;
}

.domain-row:hover {
	background: var(--bg-secondary-hover);
}

.domain-row--expanded {
	background: color-mix(in srgb, var(--bg-tertiary) 40%, var(--bg-secondary));
}

.domain-row-header {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.domain-name {
	flex: 1;
	font-weight: 500;
	min-width: 0;
}

.domain-row-meta {
	display: flex;
	align-items: center;
	gap: 1rem;
	flex-shrink: 0;
}

.domain-links {
	flex-shrink: 0;
	color: var(--text-secondary);
}

.domain-row-body {
	margin-top: 1rem;
	padding-top: 1rem;
	border-top: 1px solid var(--border-color, #444);
}

.btn-open {
	flex-shrink: 0;
}

.loading-inline {
	margin: 0;
	color: var(--text-secondary);
	font-size: 0.9rem;
}

.empty {
	margin: 0;
	color: var(--text-secondary);
}

.link-count {
	font-weight: 500;
}

.link-count:hover {
	text-decoration: underline;
}

.link-count-zero {
	color: var(--text-secondary);
}

@media (max-width: 640px) {
	.domain-row-header {
		flex-direction: column;
		align-items: stretch;
		gap: 0.5rem;
	}

	.domain-name {
		flex: none;
	}

	.domain-row-meta {
		justify-content: space-between;
		width: 100%;
		gap: 0.75rem;
	}
}
</style>
