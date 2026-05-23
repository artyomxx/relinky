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
					<tr v-for="link in linksStore.links" :key="link.id" class="link-row">
						<td class="col-link link-cell" data-label="Link">
							<button
								type="button"
								@click.prevent="copyLink(link.domain, link.slug, link.id, $event)"
								@mousemove="handleCopyHoverMove($event, `link-${link.id}`)"
								@mouseenter="handleCopyHoverEnter($event, `link-${link.id}`)"
								@mouseleave="handleCopyHoverLeave(`link-${link.id}`)"
								class="copy-link-text link-white"
							>
								{{ link.domain }}/{{ link.slug }}
							</button>
						</td>
						<td class="col-url url-cell" data-label="Target URL">
							<button
								type="button"
								@click.prevent="copyUrl(link.url, link.id, $event)"
								@mousemove="handleCopyHoverMove($event, `url-${link.id}`)"
								@mouseenter="handleCopyHoverEnter($event, `url-${link.id}`)"
								@mouseleave="handleCopyHoverLeave(`url-${link.id}`)"
								class="copy-link url-ellipsis"
							>
								{{ displayUrl(link.url) }}
							</button>
						</td>
						<td class="link-row-meta">
							<span class="meta-clicks">{{ link.click_count }}</span>
							<span class="meta-created">{{ formatDate(link.created) }}</span>
							<span class="meta-expires">{{ link.expire ? formatDate(link.expire) : '-' }}</span>
						</td>
						<td class="col-clicks" data-label="Clicks">{{ link.click_count }}</td>
						<td class="col-created" data-label="Created">{{ formatDate(link.created) }}</td>
						<td class="col-expires" data-label="Expires">{{ link.expire ? formatDate(link.expire) : '-' }}</td>
						<td class="col-actions" data-label="Actions">
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
			:class="{
				'copy-hint-visible': copyHint.visible,
				'copy-hint-copied': copyHint.isCopied,
				'copy-hint--tap': isMobileLayout
			}"
			:style="copyHintStyle"
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
				<span class="copy-hint-value" v-if="!copyHint.isCopied">{{ getCopyHintValue(copyHint.activeId) }}</span>
			</span>
		</div>

		<Transition name="modal-fade">
			<LinkFormModal
				v-if="showCreateModal || editingLink"
				ref="linkFormModal"
				:link="editingLink"
				@close="closeModal"
				@saved="closeModal"
			/>
		</Transition>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
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
const MOBILE_MAX_WIDTH = 640

const copyHint = ref({ x: 0, y: 0, visible: false, isCopied: false, activeId: null, maxWidth: null })

const copyHintStyle = computed(() => {
	const style = {
		left: `${copyHint.value.x}px`,
		top: `${copyHint.value.y}px`
	}
	if (copyHint.value.maxWidth != null) {
		style.maxWidth = `${copyHint.value.maxWidth}px`
	}
	return style
})
const isMobileLayout = ref(false)
let copyHintShowTimer = null
let copyHintResetTimer = null
let copyHintPositionLocked = false
let copyHintMoveTimer = null
let mobileMql = null

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

const COPY_HINT_MARGIN = 8
const COPY_HINT_MIN_WIDTH = 120

function layoutCopyHintAtPointer(event, { constrainWidth = true } = {}) {
	const point = event.changedTouches?.[0] ?? event.touches?.[0] ?? event
	let x = point.clientX - 2
	const y = point.clientY + 3

	if (constrainWidth) {
		let maxWidth = window.innerWidth - COPY_HINT_MARGIN - x
		if (maxWidth < COPY_HINT_MIN_WIDTH) {
			x = Math.max(COPY_HINT_MARGIN, window.innerWidth - COPY_HINT_MARGIN - COPY_HINT_MIN_WIDTH)
			maxWidth = window.innerWidth - COPY_HINT_MARGIN - x
		}
		copyHint.value.maxWidth = maxWidth
	} else {
		copyHint.value.maxWidth = null
	}

	copyHint.value.x = x
	copyHint.value.y = y
}

function setCopyHintPosition(event) {
	layoutCopyHintAtPointer(event, { constrainWidth: true })
}

function setCopyHintPositionFromTap(event) {
	const point = event.changedTouches?.[0] ?? event.touches?.[0] ?? event
	const x = point.clientX
	const y = point.clientY
	const hintW = 108
	const hintH = 28
	copyHint.value.maxWidth = null
	copyHint.value.x = Math.min(Math.max(COPY_HINT_MARGIN, x - 2), window.innerWidth - hintW - COPY_HINT_MARGIN)
	copyHint.value.y = Math.min(Math.max(COPY_HINT_MARGIN, y + 3), window.innerHeight - hintH - COPY_HINT_MARGIN)
}

function handleCopyHoverEnter(event, id) {
	if (isMobileLayout.value) return
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
	if (isMobileLayout.value) return
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
	if (isMobileLayout.value) return
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
	copyHint.value.maxWidth = null
}

async function copyLink(domain, slug, linkId, event) {
	const fullLink = `https://${domain}/${slug}`
	const hintId = `link-${linkId}`

	try {
		await navigator.clipboard.writeText(fullLink)
		showCopiedFeedback(hintId, event)
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
			showCopiedFeedback(hintId, event)
		} catch (fallbackErr) {
			console.error('Fallback copy failed:', fallbackErr)
		}
		document.body.removeChild(textArea)
	}
}

function showCopiedFeedback(id, event = null) {
	if (copyHintResetTimer) {
		clearTimeout(copyHintResetTimer)
		copyHintResetTimer = null
	}
	copyHint.value.activeId = id
	if (isMobileLayout.value && event) {
		setCopyHintPositionFromTap(event)
	} else {
		copyHint.value.maxWidth = null
	}
	copyHint.value.visible = true
	copyHint.value.isCopied = true
	copyHintResetTimer = setTimeout(() => {
		copyHint.value.isCopied = false
		if (isMobileLayout.value) {
			copyHint.value.visible = false
			copyHint.value.activeId = null
		} else if (!copyHint.value.activeId) {
			copyHint.value.visible = false
		}
	}, 950)
}

async function copyUrl(url, linkId, event) {
	const popoverId = `url-${linkId}`

	try {
		await navigator.clipboard.writeText(url)
		showCopiedFeedback(popoverId, event)
	} catch (err) {
		console.error('Failed to copy URL:', err)
		const textArea = document.createElement('textarea')
		textArea.value = url
		textArea.style.position = 'fixed'
		textArea.style.opacity = '0'
		document.body.appendChild(textArea)
		textArea.select()
		try {
			document.execCommand('copy')
			showCopiedFeedback(popoverId, event)
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
	mobileMql = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
	isMobileLayout.value = mobileMql.matches

	// Check if we're on a search route
	if (route.name === 'links-search' && route.params.query) {
		const searchQuery = decodeURIComponent(route.params.query)
		linksStore.search = searchQuery
		linksStore.fetchLinks(1)
	} else {
		linksStore.fetchLinks()
	}
})

onUnmounted(() => {
	mobileMql = null
	if (copyHintShowTimer) clearTimeout(copyHintShowTimer)
	if (copyHintMoveTimer) clearTimeout(copyHintMoveTimer)
	if (copyHintResetTimer) clearTimeout(copyHintResetTimer)
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

.copy-link-text,
.copy-link.url-ellipsis {
	display: inline-block;
	width: min(100%, max-content);
	max-width: 100%;
	vertical-align: top;
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

.links-table tbody tr:hover td {
	background: color-mix(in srgb, var(--bg-tertiary) 65%, transparent);
}

.links-table td.col-actions {
	display: flex;
	gap: 0.5rem;
	white-space: nowrap;
}

.link-row-meta {
	display: none;
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
	box-sizing: border-box;
}

.copy-hint:not(.copy-hint-copied):not(.copy-hint--tap) {
	height: auto;
	min-height: 24px;
	align-items: flex-start;
	padding-top: 4px;
	padding-bottom: 4px;
	max-height: min(40vh, 240px);
	overflow-y: auto;
}

.copy-hint:not(.copy-hint-copied):not(.copy-hint--tap) .copy-hint-label {
	display: inline-block;
	flex: 1;
	min-width: 0;
}

.copy-hint-visible {
	opacity: 1;
	transform: translate(0, 0);
}

.copy-hint-label {
	display: inline;
	font-size: 12px;
	line-height: 1.35;
	color: var(--text-primary);
}

.copy-hint-value {
	display: inline;
	margin-left: 4px;
	text-align: left;
	font-family: monospace;
	font-style: italic;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.copy-hint-copied,
.copy-hint--tap.copy-hint-visible {
	height: 24px;
	align-items: center;
}

.copy-hint-copied .copy-hint-label,
.copy-hint--tap.copy-hint-visible .copy-hint-label {
	white-space: nowrap;
}

.copy-hint-icon-track {
	position: relative;
	flex-shrink: 0;
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

@media (max-width: 640px) {
	.links-view {
		padding: 0.75rem;
		border-radius: 0;
	}

	.header {
		flex-direction: column;
		align-items: stretch;
		margin-bottom: 1rem;
		gap: 0.75rem;
	}

	.search {
		width: 100%;
		min-width: 0;
	}

	.header .btn-primary {
		width: 100%;
	}

	.links-table,
	.links-table tbody {
		display: block;
		width: 100%;
	}

	.links-table {
		table-layout: auto;
	}

	.links-table thead {
		display: none;
	}

	.links-table tbody tr.link-row {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas:
			'link actions'
			'url url'
			'meta meta';
		gap: 0.35rem 0.5rem;
		padding: 0.75rem;
		border-bottom: 1px solid var(--bg-border);
	}

	.links-table tbody tr.link-row:hover td {
		background: transparent;
	}

	.links-table tbody tr.link-row:hover {
		background: color-mix(in srgb, var(--bg-tertiary) 65%, transparent);
	}

	.links-table td {
		display: block;
		padding: 0;
		border-bottom: none;
		min-width: 0;
	}

	.links-table td.col-link {
		grid-area: link;
		width: auto;
	}

	.links-table td.col-url {
		grid-area: url;
		width: auto;
	}

	.links-table td.col-clicks,
	.links-table td.col-created,
	.links-table td.col-expires {
		display: none;
	}

	.links-table td.col-actions {
		grid-area: actions;
		width: auto;
		min-width: 0;
		align-self: start;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
	}

	.links-table td.col-actions::before {
		display: none;
	}

	.link-row-meta {
		display: none;
	}

	.links-table td.link-row-meta {
		grid-area: meta;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.75rem;
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.link-row-meta span::before {
		color: var(--text-tertiary);
		font-weight: 500;
	}

	.link-row-meta .meta-clicks::before {
		content: 'Clicks: ';
	}

	.link-row-meta .meta-created::before {
		content: 'Created: ';
	}

	.link-row-meta .meta-expires::before {
		content: 'Expires: ';
	}

	.pagination {
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.copy-hint--tap {
		z-index: 100;
	}
}
</style>
