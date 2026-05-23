<template>
	<div class="stats-view view-container">
		<div class="view-header stats-header" :class="{ 'stats-header--single-link': linkId }">
			<div v-if="linkId && currentLink" class=stats-title>
				Stats for <u>{{ currentLink.domain }}/{{ currentLink.slug }}</u>
			</div>
			<div class=stats-period-row>
				<select v-model="selectedPeriod" @change="updateStats" class=stats-period-select>
					<option v-for="opt in periodOptions" :key="opt.value" :value="opt.value">
						{{ opt.label }}
					</option>
				</select>
				<div v-if=statsStore.stats class=summary-small>
					<span class=stat-value-small>{{ statsStore.stats.totalClicks }} clicks</span>
					<span
						v-if="statsStore.stats.totalClicks - statsStore.stats.prevTotalClicks != 0"
						class=stat-delta-small
						:class="{
							'stat-positive': statsStore.stats.totalClicks > statsStore.stats.prevTotalClicks,
							'stat-negative': statsStore.stats.prevTotalClicks > statsStore.stats.totalClicks
						}"
					>
						{{ statsStore.stats.totalClicks - statsStore.stats.prevTotalClicks > 0 ? '+' : '' }}{{ statsStore.stats.totalClicks - statsStore.stats.prevTotalClicks }}
						from {{ statsStore.stats.prevTotalClicks }}
					</span>
				</div>
			</div>
			<router-link v-if=linkId to=/stats class=all-links-link>All links →</router-link>
		</div>

		<div v-if="statsStore.stats" class="stats-content" :class="{ 'loading-overlay': statsStore.loading }">
			<div class=stats-tops :class="{ 'stats-tops--single-link': linkId }">
				<div v-if="!linkId" class="top-section top-section--links">
					<label>Top Links</label>
					<ul class="scrollable-list">
						<li v-for="link in statsStore.stats.topLinks" :key="link.slug">
							<router-link
								:to="`/stats/link/${link.id}`"
								@mousemove="handleHoverMove($event, `link-${link.id}`)"
								@mouseenter="handleHoverEnter($event, `link-${link.id}`)"
								@mouseleave="handleHoverLeave(`link-${link.id}`)"
								@click="dismissHint(`link-${link.id}`)"
							>
								{{ link.domain }}/{{ link.slug }}
							</router-link>
							- {{ link.count }}
						</li>
						<li v-if="statsStore.stats.topLinks.length === 0" class="empty">No links yet</li>
					</ul>
				</div>

				<div class="top-section top-section--referrals">
					<label>Top Referrals</label>
					<ul class="scrollable-list">
						<li v-for="ref in statsStore.stats.topReferrals" :key="ref.name">
							{{ ref.name }} - {{ ref.count }}
						</li>
						<li v-if="statsStore.stats.topReferrals.length === 0" class="empty">No referrals yet</li>
					</ul>
				</div>

				<div class="stats-tops-mini">
					<div class="top-section top-section--devices">
						<label>Top Devices</label>
						<ul class="scrollable-list">
							<li v-for="device in statsStore.stats.topDevices" :key="device.name">
								{{ device.name }} - {{ device.count }}
							</li>
							<li v-if="statsStore.stats.topDevices.length === 0" class="empty">No devices yet</li>
						</ul>
					</div>

					<div class="top-section top-section--os">
						<label>Top OS</label>
						<ul class="scrollable-list">
							<li v-for="os in statsStore.stats.topOSes" :key="os.name">
								{{ os.name }} - {{ os.count }}
							</li>
							<li v-if="statsStore.stats.topOSes.length === 0" class="empty">No OS data yet</li>
						</ul>
					</div>
				</div>
			</div>

			<div class="chart-container">
				<h3>Click Trends</h3>
				<div ref="chartContainer" class="chart"></div>
			</div>
		</div>

		<PointerHint
			:visible="hint.visible"
			:style="hintStyle"
			:value="getTopLinkHintValue(hint.activeId)"
		/>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useStatsStore } from '../stores/stats.js'
import { useAuthStore } from '../stores/auth.js'
import uPlot from 'uplot'
import PointerHint from '../components/PointerHint.vue'
import { usePointerHint } from '../composables/usePointerHint.js'
import { formatDateYMD } from '../utils/date.js'

const route = useRoute()
const statsStore = useStatsStore()
const authStore = useAuthStore()
const selectedPeriod = ref('week')
const periodOptions = [
	{ value: 'day', label: '24 hours' },
	{ value: 'week', label: '7 days' },
	{ value: 'month', label: 'Month' },
	{ value: 'year', label: 'Year' },
	{ value: 'all', label: 'All Time' }
]
const chartContainer = ref(null)
const currentLink = ref(null)
const { hint, hintStyle, handleHoverEnter, handleHoverMove, handleHoverLeave, dismissHint } = usePointerHint()
let chart = null

function getTopLinkHintValue(id) {
	const rawId = parseInt(String(id || '').replace(/^link-/, ''), 10)
	if (!Number.isFinite(rawId) || !statsStore.stats?.topLinks) return ''
	const link = statsStore.stats.topLinks.find(item => item.id === rawId)
	return link ? `Open stats for ${link.domain}/${link.slug}` : ''
}

// Check if viewing link-specific stats
const linkId = computed(() => {
	return route.name === 'stats-link' && route.params.id ? parseInt(route.params.id) : null
})

// Fetch link information when viewing single link stats
async function fetchLinkInfo() {
	if (!linkId.value) {
		currentLink.value = null
		return
	}
	
	try {
		const response = await authStore.authedFetch(`/api/links/${linkId.value}`, {
			headers: authStore.getAuthHeader()
		})
		if (response.ok) {
			currentLink.value = await response.json()
		}
	} catch (err) {
		console.error('Error fetching link info:', err)
	}
}

async function updateStats() {
	await statsStore.fetchStats(selectedPeriod.value, linkId.value)
	await nextTick()
	renderChart()
}

function renderChart() {
	if (!statsStore.stats || !chartContainer.value) return

	const data = statsStore.stats.timeSeries
	if (!data || data.length === 0) return

	// uPlot expects timestamps in seconds
	const times = data.map(d => d.time)
	const counts = data.map(d => d.count)
	const prevCounts = data.map(d => d.prevCount)

	const chartData = [times, counts, prevCounts]

	// Format x-axis labels based on period
	const formatXAxis = (u, splits) => {
		return splits.map(v => {
			const date = new Date(v * 1000) // Convert seconds to milliseconds for Date
			
			if (selectedPeriod.value === 'day') {
				// Day: 00:00 notation
				const hours = date.getHours().toString().padStart(2, '0')
				const minutes = date.getMinutes().toString().padStart(2, '0')
				return `${hours}:${minutes}`
			} else {
				return formatDateYMD(date)
			}
		})
	}

	const opts = {
		width: chartContainer.value.offsetWidth,
		height: 300,
		series: [
			{},
			{
				label: 'Current',
				stroke: '#4ec9b0',
				width: 2
			},
			{
				label: 'Previous',
				stroke: '#858585',
				width: 2,
				dash: [5, 5]
			}
		],
		axes: [
			{
				space: 60,
				values: formatXAxis,
				stroke: '#858585', // Dark gray for axis line
				grid: {
					stroke: '#3e3e42', // Dark gray for grid lines
					width: 1
				},
				ticks: {
					stroke: '#858585' // Dark gray for ticks
				},
				font: '12px system-ui',
				gap: 5
			},
			{
				side: 1,
				space: 40,
				stroke: '#858585', // Dark gray for axis line
				grid: {
					stroke: '#3e3e42', // Dark gray for grid lines
					width: 1
				},
				ticks: {
					stroke: '#858585' // Dark gray for ticks
				},
				font: '12px system-ui',
				gap: 5
			}
		]
	}

	if (chart) {
		chart.destroy()
	}

	chart = new uPlot(opts, chartData, chartContainer.value)
}

watch(() => statsStore.stats, () => {
	nextTick(() => renderChart())
})

watch(() => linkId.value, () => {
	dismissHint()
	fetchLinkInfo()
	updateStats()
}, { immediate: true })

onMounted(() => {
	fetchLinkInfo()
	updateStats()
	window.addEventListener('resize', renderChart)
})
</script>

<style scoped>
@media (max-width: 640px) {
	.stats-view.view-container {
		padding: 0 1rem 0.75rem;
		border-radius: 0;
		background: transparent;
	}

	.stats-header {
		margin-top: 1rem;
		margin-bottom: 1rem;
	}

	.stats-header .stats-period-row {
		flex: 1 1 100%;
		width: 100%;
	}

	.stats-header--single-link {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto auto;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.stats-header--single-link .stats-title {
		grid-column: 1;
		grid-row: 1;
		min-width: 0;
	}

	.stats-header--single-link .stats-period-row {
		grid-column: 1 / -1;
		grid-row: 2;
	}
}

.stats-header {
	flex-wrap: wrap;
}

.stats-title {
	flex-shrink: 0;
	font-weight: bold;
}

.all-links-link {
	flex-shrink: 0;
	text-decoration: underline;
}

.stats-period-row {
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	gap: 0.5rem;
	flex: 1;
	min-width: 0;
}

.stats-period-select {
	flex-shrink: 0;
	width: auto;
}

.stats-tops {
	display: grid;
	grid-template-columns: minmax(0, 7fr) minmax(0, 7fr) minmax(0, 3fr) minmax(0, 3fr);
	gap: 1.5rem;
	margin-bottom: 2rem;
	align-items: start;
}

.stats-tops-mini {
	display: contents;
}

.stats-tops--single-link {
	grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
}

.stats-tops--single-link .stats-tops-mini {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1.5rem;
}

.summary-small {
	flex: 1;
	min-width: 0;
	padding: 0.5rem 0.65rem;
	background: var(--bg-tertiary);
	border-radius: 8px;
	display: flex;
	flex-wrap: nowrap;
	align-items: baseline;
	gap: 0.35rem;
}

.stat-value-small {
	flex-shrink: 0;
	white-space: nowrap;
}

.stat-positive {
	color: var(--accent-info);
}

.stat-negative {
	color: var(--accent-error);
}

.stat-label-small {
	color: var(--text-secondary);
	margin-top: 0.5rem;
	font-size: 0.875rem;
}

.stat-delta-small {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--text-secondary);
	font-style: italic;
}

.stat-delta-small.stat-positive {
	color: var(--accent-info);
}

.stat-delta-small.stat-negative {
	color: var(--accent-error);
}

.top-section,
.link-stats-main {
	background: var(--bg-tertiary);
	padding: 1rem;
	border-radius: 8px;
	min-width: 0;
}

.top-section h3 {
	margin: 0 0 1rem 0;
}

.top-section ul {
	list-style: none;
	padding: 0;
	margin: 0;
}

.top-section ul.scrollable-list {
	height: 300px; /* Approximately 10 rows at ~30px per row */
	overflow-y: auto;
}

.top-section li {
	padding: 0.5rem;
}

.top-section li.empty {
	color: var(--text-secondary);
	text-align: center;
	padding: 1rem;
}

.chart-container {
	margin-top: 2rem;
	min-width: 0;
}

.chart {
	width: 100%;
	min-width: 0;
}

/* uPlot defaults to width: min-content, so a wide inline legend expands past .chart */
.chart :deep(.uplot) {
	width: 100% !important;
	max-width: 100%;
}

.chart :deep(.u-legend) {
	color: var(--text-secondary);
	display: block;
	max-width: 100%;
}

.chart :deep(.u-legend.u-inline tbody) {
	display: block;
	max-width: 100%;
	text-align: center;
}

.chart :deep(.u-legend.u-inline tr) {
	display: inline-block;
	max-width: 100%;
	vertical-align: top;
	margin-right: 1rem;
}

.chart :deep(.u-axis) {
	color: var(--text-secondary);
}

.chart :deep(.u-axis-label) {
	color: var(--text-secondary);
}

.chart :deep(text) {
	fill: var(--text-secondary);
}

/* Loading overlay uses global class */

.stat-row-compact {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.5rem 0;
	border-bottom: 1px solid var(--bg-border);
}

.stat-row-compact:last-of-type {
	border-bottom: 1px solid var(--bg-border);
	margin-bottom: 0.75rem;
}

.stat-section-compact {
	margin-top: 0.75rem;
}

.stat-label-compact {
	color: var(--text-secondary);
	font-size: 0.875rem;
}

.stat-value-compact {
	color: var(--text-primary);
	font-size: 0.875rem;
}

.stat-value-compact.stat-positive {
	color: var(--accent-info);
}

.stat-value-compact.stat-negative {
	color: var(--accent-error);
}

.stat-list-compact {
	list-style: none;
	padding: 0;
	margin: 0.5rem 0 0 0;
}

.stat-list-compact li {
	padding: 0.375rem 0;
	color: var(--text-primary);
	font-size: 0.875rem;
	border-bottom: 1px solid var(--bg-border);
}

.stat-list-compact li:last-child {
	border-bottom: none;
}

.stat-list-compact li.empty {
	color: var(--text-secondary);
	text-align: center;
	padding: 0.5rem;
	border-bottom: none;
}

@media (max-width: 640px) {
	.stats-tops,
	.stats-tops.stats-tops--single-link {
		grid-template-columns: 1fr;
		gap: 1rem;
		margin-top: 0;
		margin-bottom: 1rem;
	}

	.stats-tops-mini,
	.stats-tops--single-link .stats-tops-mini {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.top-section ul.scrollable-list {
		height: auto;
		max-height: 12rem;
	}

	.summary-small,
	.top-section,
	.link-stats-main {
		background: var(--bg-secondary);
	}
}
</style>
