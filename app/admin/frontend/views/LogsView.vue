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
			<table class="logs-table">
				<thead>
					<tr>
						<th>Date</th>
						<th>Type</th>
						<th>Action</th>
						<th>Changes</th>
						<th>IP Address</th>
						<th>User Agent</th>
						<th>Item</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="log in logsStore.logs" :key="`${log.log_type}-${log.id}`">
						<td>{{ formatDate(log.timestamp) }}</td>
						<td>
							<span :class="`log-type log-type-${log.log_type}`">
								{{ log.log_type }}
							</span>
						</td>
						<td>{{ log.action }}</td>
						<td class="diff-cell">
							<ul v-if="log.diff && log.diff.length > 0" class="diff-list">
								<li v-for="change in log.diff" :key="change.what">
									{{ change.what }}: 
									<span v-if="hasDiffValue(change.before) && hasDiffValue(change.after)">{{ formatDiffValue(change.what, change.before) }} → {{ formatDiffValue(change.what, change.after) }}</span>
									<span v-else-if="hasDiffValue(change.before)">{{ formatDiffValue(change.what, change.before) }}</span>
									<span v-else-if="hasDiffValue(change.after)">{{ formatDiffValue(change.what, change.after) }}</span>
								</li>
							</ul>
							<span v-else class="no-diff">-</span>
						</td>
						<td>{{ log.ip_address || '-' }}</td>
						<td class="user-agent-cell">{{ log.browser_agent_string || '-' }}</td>
						<td>{{ log.item_name || '-' }}</td>
					</tr>
					<tr v-if="logsStore.logs.length === 0">
						<td colspan="7" class="empty">No logs found</td>
					</tr>
				</tbody>
			</table>

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

function formatDate(timestamp) {
	return formatDateYMD(timestamp)
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
.logs-view {
	/* Uses global .view-container */
}

.header {
	margin-bottom: 1.5rem;
}

.header h2 {
	margin: 0;
	color: var(--text-tertiary);
}

.filters-toolbar {
	background: var(--bg-tertiary);
	padding: 1rem;
	border-radius: 4px;
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

/* Button styles use global classes */

.logs-table {
	width: 100%;
	border-collapse: collapse;
}

.logs-table th,
.logs-table td {
	padding: 0.75rem;
	text-align: left;
	border-bottom: 1px solid var(--bg-border);
}

.logs-table th {
	background: var(--bg-tertiary);
	font-weight: 600;
	color: var(--text-tertiary);
}

.user-agent-cell {
	max-width: 300px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.diff-cell {
	max-width: 300px;
}

.diff-list {
	list-style: none;
	padding: 0;
	margin: 0;
}

.diff-list li {
	padding: 0.25rem 0;
	font-size: 0.875rem;
	color: var(--text-primary);
}

.diff-list li em {
	color: var(--text-secondary);
	font-style: italic;
}

.no-diff {
	color: var(--text-secondary);
}

.log-type {
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	font-size: 0.875rem;
	font-weight: 500;
	text-transform: capitalize;
}

.log-type-main {
	background: var(--link-base);
	color: var(--text-white);
}

.log-type-domain {
	background: var(--accent-info);
	color: var(--bg-primary);
}

.log-type-link {
	background: var(--accent-warning);
	color: var(--text-white);
}

/* Empty, pagination, loading overlay use global classes */

.pagination button:disabled {
	background: var(--bg-border);
}
</style>

