<template>
	<div class="links-view mobile-view-shell">
		<div class="links-toolbar mobile-view-toolbar">
			<input
				v-model="linksStore.search"
				@input="debouncedSearch"
				type=text
				placeholder='Search links...'
				class=links-toolbar-search
			/>
			<button @click="router.push('/links/new')" class=btn-primary>Create New Link</button>
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
								@mousemove="handleHoverMove($event, `link-${link.id}`)"
								@mouseenter="handleHoverEnter($event, `link-${link.id}`)"
								@mouseleave="handleHoverLeave(`link-${link.id}`)"
								class="copy-link-text link-white"
							>
								{{ link.domain }}/{{ link.slug }}
							</button>
						</td>
						<td class="col-url url-cell" data-label="Target URL">
							<button
								type="button"
								@click.prevent="copyUrl(link.url, link.id, $event)"
								@mousemove="handleHoverMove($event, `url-${link.id}`)"
								@mouseenter="handleHoverEnter($event, `url-${link.id}`)"
								@mouseleave="handleHoverLeave(`url-${link.id}`)"
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
		<PointerHint
			:visible="hint.visible"
			:style="hintStyle"
			:is-copied="hint.isCopied"
			:tap-mode="isMobileLayout"
			show-icons
			prefix="Click to copy:"
			:value="getCopyHintValue(hint.activeId)"
		/>

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
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useLinksStore } from '../stores/links.js'
import { useAuthStore } from '../stores/auth.js'
import LinkFormModal from '../components/LinkFormModal.vue'
import PointerHint from '../components/PointerHint.vue'
import { usePointerHint } from '../composables/usePointerHint.js'
import { formatDateYMD } from '../utils/date.js'

const route = useRoute()
const router = useRouter()
const linksStore = useLinksStore()
const authStore = useAuthStore()
const showCreateModal = ref(false)
const editingLink = ref(null)
const linkFormModal = ref(null)
const MOBILE_MAX_WIDTH = 640

const isMobileLayout = ref(false)
let mobileMql = null

const {
	hint,
	hintStyle,
	handleHoverEnter,
	handleHoverMove,
	handleHoverLeave,
	showCopied
} = usePointerHint({ isEnabled: () => !isMobileLayout.value })

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
	showCopied(id, event, { fromTap: isMobileLayout.value && !!event })
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
})
</script>

<style scoped>
.links-toolbar {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1rem;
	background: var(--bg-secondary);
	border-radius: 8px;
}

.links-toolbar-search {
	flex: 1;
	min-width: 0;
}

.links-table {
	display: block;
	width: 100%;
	background: transparent;
	border: none;
	border-collapse: separate;
	border-spacing: 0;
}

.links-content {
	width: 100%;
	min-width: 0;
}

.links-table thead {
	display: block;
	background: transparent;
}

.links-table thead tr {
	display: grid;
	grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.8fr) 5.5rem 5.5rem 5.5rem 7.5rem;
	gap: 0.5rem;
	padding: 0 1rem;
	background: transparent;
	color: var(--text-tertiary);
	font-weight: 600;
	margin-bottom: 0.5rem;
}

.links-table thead th {
	background: transparent;
	text-align: left;
	font-weight: 600;
}

.links-table tbody {
	display: flex;
	flex-direction: column;
	gap: 1em;
	background: transparent;
}

.links-table tbody tr.link-row {
	display: grid;
	grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.8fr) 5.5rem 5.5rem 5.5rem 7.5rem;
	gap: 0.5rem;
	align-items: center;
	width: 100%;
	padding: 1rem;
	background: var(--bg-secondary);
	border-radius: 8px;
}

.links-table tbody tr.link-row:hover {
	background: color-mix(in srgb, var(--bg-tertiary) 65%, var(--bg-secondary));
}

.links-table th,
.links-table td {
	padding: 0;
	border: none;
	background: transparent;
	min-width: 0;
}

.links-table td.col-created,
.links-table td.col-expires {
	font-size: 0.875rem;
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

.links-table td.col-actions {
	display: flex;
	gap: 0.5rem;
	white-space: nowrap;
}

.col-clicks,
.col-created,
.col-expires {
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

@media (max-width: 640px) {
	.links-toolbar {
		flex-direction: column;
		align-items: stretch;
	}

	.links-toolbar-search,
	.links-toolbar .btn-primary {
		width: 100%;
	}

	.links-table thead {
		display: none;
	}

	.links-table tbody tr.link-row {
		grid-template-columns: 1fr auto;
		grid-template-areas:
			'link actions'
			'url url'
			'meta meta';
		gap: 0.35rem 0.5rem;
		padding: 0.75rem;
	}

	.links-table td {
		display: block;
	}

	.links-table td.col-link {
		grid-area: link;
	}

	.links-table td.col-url {
		grid-area: url;
	}

	.links-table td.col-clicks,
	.links-table td.col-created,
	.links-table td.col-expires {
		display: none;
	}

	.links-table td.col-actions {
		grid-area: actions;
		align-self: start;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
	}

	.links-table td.link-row-meta {
		grid-area: meta;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.75rem;
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
	}
}

@media (min-width: 641px) {
	.links-toolbar {
		margin-bottom: 1.5rem;
	}
}
</style>
