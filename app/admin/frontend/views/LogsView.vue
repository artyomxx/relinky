<template>
	<div class="logs-view">
		<div class="filters-toolbar">
			<input
				v-model="logsStore.search"
				@input="debouncedSearch"
				type="text"
				placeholder="Search logs..."
				class="filter-field filter-search"
			/>
			<div class="filter-dates">
				<span class="filter-dates-label">Date range:</span>
				<input
					v-model="logsStore.startDate"
					@change="logsStore.fetchLogs(1)"
					type="date"
					class="filter-field"
					aria-label="Date range start"
				/>
				<span>-</span>
				<input
					v-model="logsStore.endDate"
					@change="logsStore.fetchLogs(1)"
					type="date"
					class="filter-field"
					aria-label="Date range end"
				/>
			</div>
			<select
				v-model="logsStore.eventType"
				@change="logsStore.fetchLogs(1)"
				class="filter-field filter-event-type"
			>
				<option value="all">All events</option>
				<option value="main">Main events</option>
				<option value="domain">Domain events</option>
				<option value="link">Link events</option>
			</select>
			<select
				v-model="logsStore.action"
				@change="logsStore.fetchLogs(1)"
				class="filter-field filter-action"
			>
				<option value="">All actions</option>
				<option v-for="act in logsStore.actions" :key="act" :value="act">
					{{ act.charAt(0).toUpperCase() + act.slice(1) }}
				</option>
			</select>
			<select
				v-model="logsStore.sortOrder"
				@change="logsStore.fetchLogs(1)"
				class="filter-field filter-sort"
			>
				<option value="desc">Newest first</option>
				<option value="asc">Oldest first</option>
			</select>
			<button type="button" @click="logsStore.resetFilters()" class="btn-secondary filter-reset">
				Reset filters
			</button>
		</div>

		<div class="logs-content" :class="{ 'loading-overlay': logsStore.loading }">
			<ul v-if="logsStore.logs.length > 0" class="log-list">
				<li
					v-for="log in logsStore.logs"
					:key="`${log.log_type}-${log.id}`"
					class="log-card"
				>
					<div class="log-card-row log-card-row-detail log-card-row-primary">
						<span :class="['log-card-kicker', `log-card-kicker--${log.log_type}`]">{{ log.log_type }}</span>
						<div class="log-card-body log-card-summary">
							<span class="log-card-item" v-if="log.item_name">{{ log.item_name }}</span>
							<span class="log-card-action">{{ log.action }}</span>							
							<time class="log-card-time" :datetime="logTimestampIso(log.timestamp)">
								on 
								{{ formatTimestamp(log.timestamp) }}
							</time>
						</div>
					</div>

					<div class="log-card-row log-card-row-detail">
						<span class="log-card-kicker">Changes</span>
						<div class="log-card-body">
							<ul v-if="log.diff && log.diff.length > 0" class="diff-list">
								<li v-for="change in log.diff" :key="change.what">
									{{ change.what }}:
									<span v-if="hasDiffValue(change.before) && hasDiffValue(change.after)" class="diff-change">
										<span class="diff-old">{{ formatDiffValue(change.what, change.before) }}</span>
										<span class="diff-arrow" aria-hidden="true"> → </span>
										<span class="diff-new">{{ formatDiffValue(change.what, change.after) }}</span>
									</span>
									<span v-else-if="hasDiffValue(change.before)">{{ formatDiffValue(change.what, change.before) }}</span>
									<span v-else-if="hasDiffValue(change.after)">{{ formatDiffValue(change.what, change.after) }}</span>
								</li>
							</ul>
							<span v-else class="no-diff">—</span>
						</div>
					</div>

					<div class="log-card-row log-card-row-detail">
						<span class="log-card-kicker">Network</span>
						<div class="log-card-body">
							<div class="log-card-net-line">
								<span class="log-card-net-label">IP</span>
								<span class="log-card-net-value">{{ log.ip_address || '—' }}</span>
							</div>
							<div class="log-card-net-line">
								<span class="log-card-net-label">UA</span>
								<span class="log-card-net-value log-card-net-value--ua">{{ log.browser_agent_string || '—' }}</span>
							</div>
						</div>
					</div>
				</li>
			</ul>
			<p v-else class="empty">No logs found</p>

			<div class="pagination">
				<button
					@click="changePage(logsStore.pagination.page - 1)"
					:disabled="logsStore.pagination.page === 1"
				>
					Previous
				</button>
				<span>Page {{ logsStore.pagination.page }} of {{ logsStore.pagination.totalPages }}</span>
				<button
					@click="changePage(logsStore.pagination.page + 1)"
					:disabled="logsStore.pagination.page >= logsStore.pagination.totalPages"
				>
					Next
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useLogsStore } from '../stores/logs.js'
import { formatDateYMD } from '../utils/date.js'

const logsStore = useLogsStore()

let searchTimeout = null

function debouncedSearch() {
	clearTimeout(searchTimeout)
	searchTimeout = setTimeout(() => {
		logsStore.fetchLogs(1)
	}, 300)
}

function changePage(page) {
	logsStore.fetchLogs(page)
}

function formatTimestamp(timestamp) {
	if (!timestamp) return '—'
	const date = new Date(timestamp)
	if (Number.isNaN(date.getTime())) return '—'
	return date.toISOString().replace('T', ' ').slice(0, 16)
}

function logTimestampIso(timestamp) {
	if (!timestamp) return undefined
	const date = new Date(timestamp)
	if (Number.isNaN(date.getTime())) return undefined
	return date.toISOString()
}

function hasDiffValue(value) {
	return value !== undefined && value !== null && String(value).trim() !== ''
}

function formatDiffValue(what, value) {
	const text = String(value)
	const field = String(what || '').toLowerCase()
	if (field.includes('expire') || field.includes('date') || field.includes('timestamp')) {
		if (/^\d{13}$/.test(text)) {
			return formatDateYMD(Number(text))
		}
		if (/^\d{10}$/.test(text)) {
			return formatDateYMD(Number(text) * 1000)
		}
	}
	return text
}

onMounted(() => {
	logsStore.fetchLogs()
})
</script>

<style scoped>
.filters-toolbar {
	background: var(--bg-secondary);
	padding: 1rem;
	border-radius: 8px;
	margin-bottom: 1.5rem;
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.75rem;
	align-items: center;
}

.filter-field,
.filter-reset {
	min-width: 0;
	width: 100%;
}

.filter-search {
	grid-column: 1 / -1;
}

.filter-dates {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
}

.filter-dates-label {
	flex-shrink: 0;
	font-size: 0.875rem;
	color: var(--text-secondary);
	white-space: nowrap;
}

.filter-dates .filter-field {
	flex: 1;
	min-width: 0;
	width: auto;
}

@media (max-width: 640px) {
	.logs-view {
		padding: 0 1rem 0.75rem;
	}

	.filters-toolbar {
		margin-top: 1rem;
		margin-bottom: 1rem;
	}
}

@media (min-width: 641px) {
	.filters-toolbar {
		grid-template-columns: auto repeat(4, minmax(0, 1fr));
		gap: 1rem;
	}

	.filter-search {
		grid-column: 1 / -1;
		grid-row: 1;
	}

	.filter-dates {
		grid-column: 1;
		grid-row: 2;
		gap: 0.35rem;
	}

	.filter-dates .filter-field {
		flex: 0 0 auto;
		width: 7.25rem;
		max-width: 7.25rem;
	}

	.filter-event-type {
		grid-column: 2;
		grid-row: 2;
	}

	.filter-action {
		grid-column: 3;
		grid-row: 2;
	}

	.filter-sort {
		grid-column: 4;
		grid-row: 2;
	}

	.filter-reset {
		grid-column: 5;
		grid-row: 2;
	}
}

.log-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 1em;
}

.log-card {
	padding: 0.75rem;
	background: var(--bg-secondary);
	border-radius: 8px;
}

.log-card-row {
	min-width: 0;
}

.log-card-row + .log-card-row {
	margin-top: 0.45rem;
}

.log-card-summary {
	display: flex;
	align-items: baseline;
	flex-wrap: wrap;
	gap: 0.15rem 0.35rem;
	min-width: 0;
}

.log-card-time {
	flex-shrink: 0;
	font-variant-numeric: tabular-nums;
	color: var(--text-secondary);
	white-space: nowrap;
}

.log-card-item {
	min-width: 0;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.log-card-action {
	flex-shrink: 0;
	font-weight: 500;
	white-space: nowrap;
	color: var(--text-secondary);
	font-style: italic;
}

.log-card-row-detail {
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
}

.log-card-kicker {
	flex: 0 0 4.25rem;
	font-size: 0.6875rem;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--text-tertiary);
	line-height: 1.35;
	padding-top: 0.1rem;
}

.log-card-kicker--main {
	color: color-mix(in srgb, var(--link-base) 62%, var(--text-tertiary));
}

.log-card-kicker--domain {
	color: color-mix(in srgb, var(--accent-info) 62%, var(--text-tertiary));
}

.log-card-kicker--link {
	color: color-mix(in srgb, var(--accent-warning) 62%, var(--text-tertiary));
}

.log-card-body {
	flex: 1;
	min-width: 0;
	color: var(--text-primary);
	line-height: 1.35;
}

.diff-list {
	list-style: none;
	padding: 0;
	margin: 0;
}

.diff-list li + li {
	margin-top: 0.2rem;
}

.diff-list li {
	overflow-wrap: anywhere;
	word-break: break-word;
}

.diff-old {
	color: color-mix(in srgb, var(--accent-error) 40%, var(--text-primary));
}

.diff-new {
	color: color-mix(in srgb, var(--accent-success) 30%, var(--text-primary));
}

.diff-arrow {
	color: var(--text-primary);
}

.no-diff {
	color: var(--text-secondary);
}

.log-card-net-line {
	display: flex;
	gap: 0.35rem;
	align-items: flex-start;
}

.log-card-net-line + .log-card-net-line {
	margin-top: 0.2rem;
}

.log-card-net-label {
	flex-shrink: 0;
	color: var(--text-tertiary);
	font-variant-numeric: tabular-nums;
}

.log-card-net-value {
	flex: 1;
	min-width: 0;
	overflow-wrap: anywhere;
	word-break: break-word;
	color: var(--text-tertiary);
}

.log-card-net-value--ua {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	overflow-wrap: normal;
	word-break: normal;
}

@media (min-width: 641px) {
	.log-card {
		padding: 0.65rem 0.75rem;
	}

	.log-card-summary {
		flex-wrap: nowrap;
		overflow: hidden;
	}

	.log-card-item {
		flex: 0 1 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

/* Empty, pagination, loading overlay use global classes */

.pagination button:disabled {
	background: var(--bg-border);
}
</style>

