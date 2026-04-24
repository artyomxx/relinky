<template>
	<div class="links-view view-container">
		<div class="header view-header">
			<input
				v-model="linksStore.search"
				@input="debouncedSearch"
				type="text"
				placeholder="Search links..."
				class="search"
			/>
			<button @click="router.push('/links/new')" class="btn-primary">Create New Link</button>
		</div>

				<div class="links-content" :class="{ 'loading-overlay': linksStore.loading }">
			<table class="links-table">
				<thead>
					<tr>
						<th class="col-link">Link</th>
						<th class="col-url">Target URL</th>
						<th class="col-clicks">Clicks</th>
						<th class="col-created">Created</th>
						<th class="col-expires">Expires</th>
						<th class="col-actions">Actions</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="link in linksStore.links" :key="link.id">
						<td class="col-link link-cell">
							<button
								type="button"
								@click.prevent="copyLink(link.domain, link.slug, link.id)" 
								@mousemove="handleCopyHoverMove($event, `link-${link.id}`)"
								@mouseenter="handleCopyHoverEnter($event, `link-${link.id}`)"
								@mouseleave="handleCopyHoverLeave(`link-${link.id}`)"
								class="copy-link-text link-white"
							>
								{{ link.domain }}/{{ link.slug }}
							</button>
						</td>
						<td class="col-url url-cell">
							<button
								type="button"
								@click.prevent="copyUrl(link.url, link.id)" 
								@mousemove="handleCopyHoverMove($event, `url-${link.id}`)"
								@mouseenter="handleCopyHoverEnter($event, `url-${link.id}`)"
								@mouseleave="handleCopyHoverLeave(`url-${link.id}`)"
								class="copy-link url-ellipsis"
							>
								{{ displayUrl(link.url) }}
							</button>
						</td>
						<td class="col-clicks">{{ link.click_count }}</td>
						<td class="col-created">{{ formatDate(link.created) }}</td>
						<td class="col-expires">{{ link.expire ? formatDate(link.expire) : '-' }}</td>
						<td class="col-actions">
							<a @click.prevent="viewStats(link.id)" class="link-white link-small">Stats</a>
							<a @click.prevent="editLink(link)" class="link-white link-small">Edit</a>
							<a @click.prevent="deleteLink(link)" class="link-danger link-small">Delete</a>
						</td>
					</tr>
				</tbody>
			</table>

			<div class="pagination">
				<button
					@click="changePage(linksStore.pagination.page - 1)"
					:disabled="linksStore.pagination.page === 1"
				>
					Previous
				</button>
				<span>Page {{ linksStore.pagination.page }} of {{ linksStore.pagination.totalPages }}</span>
				<button
					@click="changePage(linksStore.pagination.page + 1)"
					:disabled="linksStore.pagination.page >= linksStore.pagination.totalPages"
				>
					Next
				</button>
			</div>
		</div>
		<div
			class="copy-hint"
			:class="{ 'copy-hint-visible': copyHint.visible, 'copy-hint-copied': copyHint.isCopied }"
			:style="{ left: `${copyHint.x}px`, top: `${copyHint.y}px` }"
		>
			<div class="copy-hint-icon-track">
				<svg class="copy-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
					<rect x="8.5" y="5" width="10" height="12" rx="1.8" fill="#2b2d33" stroke="#d2d6e0" />
					<rect x="5.5" y="8" width="10" height="12" rx="1.8" fill="#383b45" stroke="#f2f4fa" />
				</svg>
				<svg class="copy-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M6 12.5L10.2 16.7L18.5 8.4" fill="none" stroke="#f2f4fa" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</div>
			<span class="copy-hint-label">
				{{ copyHint.isCopied ? 'Copied!' : 'Click to copy:' }}
				<span class="copy-hint-value" v-if=!copyHint.isCopied>{{ getCopyHintValue(copyHint.activeId) }}</span>
			</span>
		</div>

		<Transition name="modal-fade">
			<LinkFormModal
				v-if="showCreateModal || editingLink"
				ref="linkFormModal"
				:link="editingLink"
				@close="closeModal"
				@save="handleSave"
			/>
		</Transition>
	</div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useLinksStore } from '../stores/links.js'
import { useAuthStore } from '../stores/auth.js'
import LinkFormModal from '../components/LinkFormModal.vue'
import { formatDateYMD } from '../utils/date.js'

const route = useRoute()
const router = useRouter()
const linksStore = useLinksStore()
const authStore = useAuthStore()
const showCreateModal = ref(false)
const editingLink = ref(null)
const linkFormModal = ref(null)
const copyHint = ref({ x: 0, y: 0, visible: false, isCopied: false, activeId: null })
let copyHintShowTimer = null
let copyHintResetTimer = null
let copyHintPositionLocked = false
let copyHintMoveTimer = null

// Handle route changes
watch(() => route.name, (routeName) => {
	if (routeName === 'link-new') {
		showCreateModal.value = true
		editingLink.value = null
	} else if (routeName === 'link-edit' && route.params.id) {
		// Load link for editing
		const linkId = parseInt(route.params.id)
		const link = linksStore.links.find(l => l.id === linkId)
		if (link) {
			editingLink.value = link
			showCreateModal.value = true
		} else {
			// Link not in current page, fetch it
			fetchLinkForEdit(linkId)
		}
	} else if (routeName === 'links-search' && route.params.query) {
		// Handle search route
		const searchQuery = decodeURIComponent(route.params.query)
		if (linksStore.search !== searchQuery) {
			linksStore.search = searchQuery
			linksStore.fetchLinks(1)
		}
		showCreateModal.value = false
		editingLink.value = null
	} else if (routeName === 'links') {
		// Clear search if navigating to base links route
		if (linksStore.search) {
			linksStore.search = ''
			linksStore.fetchLinks(1)
		}
		showCreateModal.value = false
		editingLink.value = null
	}
}, { immediate: true })

async function fetchLinkForEdit(id) {
	try {
		const response = await authStore.authedFetch(`/api/links/${id}`, {
			headers: authStore.getAuthHeader()
		})
		if (response.ok) {
			const link = await response.json()
			editingLink.value = link
			showCreateModal.value = true
		}
	} catch (err) {
		console.error('Error fetching link:', err)
		router.push('/links')
	}
}

let searchTimeout = null

function debouncedSearch() {
	clearTimeout(searchTimeout)
	searchTimeout = setTimeout(() => {
		linksStore.fetchLinks(1)
	}, 300)
}

function changePage(page) {
	linksStore.fetchLinks(page)
}

function formatDate(timestamp) {
	return formatDateYMD(timestamp)
}

function displayUrl(url) {
	if (!url) return ''
	return url.replace(/^https?:\/\//, '')
}

function getCopyHintValue(id) {
	const [kind, rawId] = String(id || '').split('-')
	const linkId = parseInt(rawId, 10)
	if (!Number.isFinite(linkId)) return ''
	const link = linksStore.links.find(item => item.id === linkId)
	if (!link) return ''
	if (kind === 'link') return `${link.domain}/${link.slug}`
	if (kind === 'url') return displayUrl(link.url)
	return ''
}

function setCopyHintPosition(event) {
	copyHint.value.x = event.clientX - 2
	copyHint.value.y = event.clientY + 3
}

function handleCopyHoverEnter(event, id) {
	if (copyHintShowTimer) clearTimeout(copyHintShowTimer)
	if (copyHintMoveTimer) {
		clearTimeout(copyHintMoveTimer)
		copyHintMoveTimer = null
	}
	copyHintPositionLocked = false
	copyHint.value.activeId = id
	setCopyHintPosition(event)
	copyHintShowTimer = setTimeout(() => {
		if (copyHint.value.activeId === id) {
			copyHint.value.visible = true
		}
		copyHintShowTimer = null
	}, 200)
}

function handleCopyHoverMove(event, id) {
	if (copyHint.value.activeId !== id) return
	if (!copyHint.value.visible && !copyHintPositionLocked) {
		setCopyHintPosition(event)
		return
	}
	if (copyHintMoveTimer) clearTimeout(copyHintMoveTimer)
	copyHintMoveTimer = setTimeout(() => {
		if (copyHint.value.activeId === id && copyHint.value.visible) {
			setCopyHintPosition(event)
		}
		copyHintMoveTimer = null
	}, 200)
}

function handleCopyHoverLeave(id) {
	copyHintPositionLocked = true
	if (copyHintShowTimer) {
		clearTimeout(copyHintShowTimer)
		copyHintShowTimer = null
	}
	if (copyHintMoveTimer) {
		clearTimeout(copyHintMoveTimer)
		copyHintMoveTimer = null
	}
	if (copyHint.value.activeId !== id) return
	copyHint.value.activeId = null
	copyHint.value.visible = false
	copyHint.value.isCopied = false
}

async function copyLink(domain, slug, linkId) {
	const fullLink = `https://${domain}/${slug}`
	const hintId = `link-${linkId}`
	
	try {
		await navigator.clipboard.writeText(fullLink)
		showCopiedFeedback(hintId)
	} catch (err) {
		console.error('Failed to copy link:', err)
		const textArea = document.createElement('textarea')
		textArea.value = fullLink
		textArea.style.position = 'fixed'
		textArea.style.opacity = '0'
		document.body.appendChild(textArea)
		textArea.select()
		try {
			document.execCommand('copy')
			showCopiedFeedback(hintId)
		} catch (fallbackErr) {
			console.error('Fallback copy failed:', fallbackErr)
		}
		document.body.removeChild(textArea)
	}
}

function showCopiedFeedback(id) {
	if (copyHintResetTimer) {
		clearTimeout(copyHintResetTimer)
		copyHintResetTimer = null
	}
	copyHint.value.activeId = id
	copyHint.value.visible = true
	copyHint.value.isCopied = true
	copyHintResetTimer = setTimeout(() => {
		copyHint.value.isCopied = false
		if (!copyHint.value.activeId) {
			copyHint.value.visible = false
		}
	}, 950)
}

async function copyUrl(url, linkId) {
	const popoverId = `url-${linkId}`
	
	try {
		await navigator.clipboard.writeText(url)
		showCopiedFeedback(popoverId)
	} catch (err) {
		console.error('Failed to copy URL:', err)
		// Fallback for older browsers
		const textArea = document.createElement('textarea')
		textArea.value = url
		textArea.style.position = 'fixed'
		textArea.style.opacity = '0'
		document.body.appendChild(textArea)
		textArea.select()
		try {
			document.execCommand('copy')
			showCopiedFeedback(popoverId)
		} catch (fallbackErr) {
			console.error('Fallback copy failed:', fallbackErr)
		}
		document.body.removeChild(textArea)
	}
}

function editLink(link) {
	router.push(`/links/${link.id}`)
}

function viewStats(linkId) {
	router.push(`/stats/link/${linkId}`)
}

async function deleteLink(link) {
	if (!confirm(`Are you sure you want to delete this link: ${link.domain}/${link.slug}?`)) return
	try {
		await linksStore.deleteLink(link.id)
	} catch (err) {
		alert(err.message)
	}
}

function closeModal() {
	// Just clear state and navigate - the modal handles showing the hint
	showCreateModal.value = false
	editingLink.value = null
	router.push('/links')
}

async function handleSave(linkData) {
	try {
		if (editingLink.value) {
			await linksStore.updateLink(editingLink.value.id, linkData)
		} else {
			await linksStore.createLink(linkData)
		}
		closeModal()
	} catch (err) {
		alert(err.message)
	}
}

// Watch for search input changes and update route
watch(() => linksStore.search, (newSearch) => {
	if (route.name === 'links-search') {
		// If we're on search route, update it
		const encoded = encodeURIComponent(newSearch || '')
		if (route.params.query !== encoded) {
			if (newSearch) {
				router.replace(`/links/search/${encoded}`)
			} else {
				router.replace('/links')
			}
		}
	} else if (newSearch && route.name === 'links') {
		// If we're on base links route and search is entered, navigate to search route
		const encoded = encodeURIComponent(newSearch)
		router.replace(`/links/search/${encoded}`)
	}
})

onBeforeRouteLeave((to, from, next) => {
	// Check if modal is open and has unsaved changes
	if ((showCreateModal.value || editingLink.value) && linkFormModal.value) {
		if (linkFormModal.value.hasChanges()) {
			// Prevent navigation if there are unsaved changes
			next(false) // Cancel navigation
			return
		}
	}
	next() // Allow navigation
})

onMounted(() => {
	// Check if we're on a search route
	if (route.name === 'links-search' && route.params.query) {
		const searchQuery = decodeURIComponent(route.params.query)
		linksStore.search = searchQuery
		linksStore.fetchLinks(1)
	} else {
		linksStore.fetchLinks()
	}
})
</script>

<style scoped>
.links-view {
	/* Uses global .view-container */
}

.header {
	/* Uses global .view-header */
}

.search {
	flex: 1;
}

.links-table {
	table-layout: fixed;
	width: 100%;
	min-width: 100%;
}

.links-content {
	width: 100%;
}

.links-table th,
.links-table td {
	padding: 0.5em;
}

.col-link {
	width: 24%;
}

.col-url {
	width: 36%;
}

.col-clicks,
.col-created,
.col-expires {
	width: 90px;
	min-width: 90px;
	white-space: nowrap;
}

.links-table td.col-created,
.links-table td.col-expires {
	font-size: 0.875rem;
}

.col-actions {
	width: 150px;
	min-width: 150px;
	white-space: nowrap;
}

.link-cell {
	position: relative;
	overflow: hidden;
	min-width: 0;
}

.link-cell .copy-link-text {
	display: block;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.copy-link-text {
	border: 0;
	background: transparent;
	padding: 0;
	font-size: inherit;
	position: relative;
	text-align: left;
	cursor: pointer;
}

.copy-link {
	border: 0;
	background: transparent;
	padding: 0;
	font-size: inherit;
	position: relative;
	display: inline-flex;
	min-width: 0;
	max-width: 100%;
	text-align: left;
	cursor: pointer;
}

.copy-link-text.link-white {
	color: var(--link-white-base);
	text-decoration: underline;
}

.copy-link-text.link-white:hover {
	color: var(--link-white-hover);
}

.copy-link.url-ellipsis {
	color: var(--link-base);
	text-decoration: underline;
}

.copy-link.url-ellipsis:hover {
	color: var(--link-hover);
}


.url-cell {
	overflow: hidden;
	position: relative;
	min-width: 0;
}

.url-ellipsis {
	display: block;
	width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.links-table tbody tr:hover td {
	background: color-mix(in srgb, var(--bg-tertiary) 65%, transparent);
}

.links-table td.col-actions {
	display: flex;
	gap: 0.5rem;
	white-space: nowrap;
}

.checkmark {
	color: var(--accent-success);
	font-weight: bold;
	animation: fadeInScale 0.2s ease-in;
}

.copy-hint {
	position: fixed;
	height: 24px;
	padding: 0 6px 0 8px;
	display: flex;
	align-items: center;
	gap: 2px;
	border: 1px solid var(--bg-border);
	border-radius: 6px;
	background: var(--bg-primary);
	opacity: 0;
	transform: translate(0, 0);
	transition: opacity 0.1s ease, transform 0.1s ease;
	pointer-events: none;
	z-index: 60;
}

.copy-hint-visible {
	opacity: 1;
	transform: translate(0, 0);
}

.copy-hint-label {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 12px;
	white-space: nowrap;
	color: var(--text-primary);
}

.copy-hint-value {
	white-space: nowrap;
	text-align: left;
	font-family: monospace;
	font-style: italic;
}

.copy-hint-icon-track {
	position: relative;
	height: 16px;
	width: 16px;
	overflow: hidden;
}

.copy-hint-icon {
	position: absolute;
	left: 0;
	display: block;
	height: 16px;
	width: 16px;
	transition: transform 0.1s ease;
}

.copy-hint-icon:first-child {
	top: 0;
	transform: translateY(0);
}

.copy-hint-icon:last-child {
	top: 0;
	transform: translateY(16px);
}

.copy-hint-copied .copy-hint-icon:first-child {
	transform: translateY(-16px);
}

.copy-hint-copied .copy-hint-icon:last-child {
	transform: translateY(0);
}
</style>
