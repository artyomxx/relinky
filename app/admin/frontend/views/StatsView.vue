<template>
	<div class="stats-view view-container">
		<div class="header view-header">
			<div class="header-left view-header-left">
				<h2 v-if="linkId && currentLink" class="link-title">
					Stats for: {{ currentLink.domain }}/{{ currentLink.slug }}
				</h2>
				<select v-model="selectedPeriod" @change="updateStats">
					<option value="day">24 hours</option>
					<option value="week">7 days</option>
					<option value="month">Month</option>
					<option value="year">Year</option>
					<option value="all">All Time</option>
				</select>
			</div>
			<div class="header-right view-header-right">
				<router-link v-if="linkId" to="/stats" class="all-links-link">All Links</router-link>
			</div>
		</div>

		<div v-if="statsStore.stats" class="stats-content" :class="{ 'loading-overlay': statsStore.loading }">
			<!-- Single link view - simplified list -->
			<div v-if="linkId" class="link-stats-simple">
				<div class="link-stats-main">
					<div class="stat-row-compact">
						<span class="stat-label-compact">Current period:</span>
						<span class="stat-value-compact">{{ statsStore.stats.totalClicks }}</span>
					</div>
					<div class="stat-row-compact">
						<span class="stat-label-compact">Previous period:</span>
						<span class="stat-value-compact">{{ statsStore.stats.prevTotalClicks }}</span>
					</div>
					<div class="stat-row-compact">
						<span class="stat-label-compact">Difference:</span>
						<span 
							class="stat-value-compact" 
							:class="{ 
								'stat-positive': statsStore.stats.totalClicks > statsStore.stats.prevTotalClicks,
								'stat-negative': statsStore.stats.prevTotalClicks > statsStore.stats.totalClicks
							}"
						>
							{{ statsStore.stats.totalClicks - statsStore.stats.prevTotalClicks > 0 ? '+' : '' }}{{ statsStore.stats.totalClicks - statsStore.stats.prevTotalClicks }}
						</span>
					</div>
				</div>
				<div class="link-stats-list">
					<h3>Devices</h3>
					<ul class="stats-list">
						<li v-for="device in statsStore.stats.topDevices" :key="device.name">
							{{ device.name }} - {{ device.count }}
						</li>
						<li v-if="statsStore.stats.topDevices.length === 0" class="empty">No devices yet</li>
					</ul>
				</div>
				<div class="link-stats-list">
					<h3>OS</h3>
					<ul class="stats-list">
						<li v-for="os in statsStore.stats.topOSes" :key="os.name">
							{{ os.name }} - {{ os.count }}
						</li>
						<li v-if="statsStore.stats.topOSes.length === 0" class="empty">No OS data yet</li>
					</ul>
				</div>
				<div class="link-stats-list">
					<h3>Top Referrals</h3>
					<ul class="stats-list">
						<li v-for="ref in statsStore.stats.topReferrals" :key="ref.name">
							{{ ref.name }} - {{ ref.count }}
						</li>
						<li v-if="statsStore.stats.topReferrals.length === 0" class="empty">No referrals yet</li>
					</ul>
				</div>
			</div>

			<!-- All links view - original layout -->
			<div v-else class="stats-row">
				<div class="summary-small">
					<div class="stat-value-small">{{ statsStore.stats.totalClicks }} clicks</div>
					<div class="stat-delta-small">
						Previous period: {{ statsStore.stats.prevTotalClicks }}
					</div>
					<div 
						class="stat-delta-small" 
						:class="{ 
							'stat-positive': statsStore.stats.totalClicks > statsStore.stats.prevTotalClicks,
							'stat-negative': statsStore.stats.prevTotalClicks > statsStore.stats.totalClicks
						}"
					>
						Difference: {{ statsStore.stats.totalClicks - statsStore.stats.prevTotalClicks > 0 ? '+' : '' }}{{ statsStore.stats.totalClicks - statsStore.stats.prevTotalClicks }}
					</div>
				</div>

				<div class="top-section">
					<h3>Top Links</h3>
					<ul class="scrollable-list">
					<li v-for="link in statsStore.stats.topLinks" :key="link.slug">
						<router-link 
							:to="`/stats/link/${link.id}`"
							@mousemove="updatePopoverPosition($event, `link-${link.id}`)"
							@mouseenter="showPopover(`link-${link.id}`)"
							@mouseleave="hidePopover(`link-${link.id}`)"
							style="position: relative;"
						>
							{{ link.domain }}/{{ link.slug }}
							<Popover
								text="See stats for this link"
								:visible="visiblePopovers.has(`link-${link.id}`)"
								:x="popoverPositions[`link-${link.id}`]?.x || 0"
								:y="popoverPositions[`link-${link.id}`]?.y || 0"
							/>
						</router-link>
						- {{ link.count }}
					</li>
						<li v-if="statsStore.stats.topLinks.length === 0" class="empty">No links yet</li>
					</ul>
				</div>

				<div class="top-section">
					<h3>Top Devices</h3>
					<ul class="scrollable-list">
						<li v-for="device in statsStore.stats.topDevices" :key="device.name">
							{{ device.name }} - {{ device.count }}
						</li>
						<li v-if="statsStore.stats.topDevices.length === 0" class="empty">No devices yet</li>
					</ul>
				</div>

				<div class="top-section">
					<h3>Top OS</h3>
					<ul class="scrollable-list">
						<li v-for="os in statsStore.stats.topOSes" :key="os.name">
							{{ os.name }} - {{ os.count }}
						</li>
						<li v-if="statsStore.stats.topOSes.length === 0" class="empty">No OS data yet</li>
					</ul>
				</div>

				<div class="top-section">
					<h3>Top Referrals</h3>
					<ul class="scrollable-list">
						<li v-for="ref in statsStore.stats.topReferrals" :key="ref.name">
							{{ ref.name }} - {{ ref.count }}
						</li>
						<li v-if="statsStore.stats.topReferrals.length === 0" class="empty">No referrals yet</li>
					</ul>
				</div>
			</div>

			<div class="chart-container">
				<h3>Click Trends</h3>
				<div ref="chartContainer" class="chart"></div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useStatsStore } from '../stores/stats.js'
import { useAuthStore } from '../stores/auth.js'
import uPlot from 'uplot'
import Popover from '../components/Popover.vue'
import { formatDateYMD } from '../utils/date.js'

const route = useRoute()
const statsStore = useStatsStore()
const authStore = useAuthStore()
const selectedPeriod = ref('week')
const chartContainer = ref(null)
const currentLink = ref(null)
const popoverPositions = ref({})
const visiblePopovers = ref(new Set())
let chart = null

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
	fetchLinkInfo()
	updateStats()
}, { immediate: true })

function showPopover(id) {
	visiblePopovers.value.add(id)
}

function hidePopover(id) {
	visiblePopovers.value.delete(id)
}

function updatePopoverPosition(event, id) {
	if (!visiblePopovers.value.has(id)) return
	
	const rect = event.currentTarget.getBoundingClientRect()
	const x = event.clientX - rect.left
	const y = event.clientY - rect.top
	
	popoverPositions.value[id] = { x, y }
}

onMounted(() => {
	fetchLinkInfo()
	updateStats()
	window.addEventListener('resize', renderChart)
})
</script>

<style scoped>
.stats-view {
	/* Uses global .view-container */
}

.header {
	/* Uses global .view-header */
}

.header-left {
	/* Uses global .view-header-left */
}

.header-right {
	/* Uses global .view-header-right */
}

.link-title {
	/* Uses global .view-title */
}

.all-links-link {
	text-decoration: underline;
	cursor: pointer;
}

.stats-row {
	display: grid;
	grid-template-columns: auto 1fr 1fr 1fr 1fr;
	gap: 1.5rem;
	margin-bottom: 2rem;
	align-items: start;
}

.summary-small {
	padding: 1rem;
	background: var(--bg-tertiary);
	border-radius: 8px;
	text-align: center;
	min-width: 150px;
}

.stat-value-small {
	font-size: 1.5rem;
	font-weight: bold;
}

.stat-value-small.stat-positive {
	color: var(--accent-info);
}

.stat-value-small.stat-negative {
	color: var(--accent-error);
}

.stat-label-small {
	color: var(--text-secondary);
	margin-top: 0.5rem;
	font-size: 0.875rem;
}

.stat-delta-small {
	margin-top: 0.5rem;
	font-size: 0.75rem;
	color: var(--text-secondary);
}

.stat-delta-small.stat-positive {
	color: var(--accent-info);
}

.stat-delta-small.stat-negative {
	color: var(--accent-error);
}

.tops {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
	gap: 1.5rem;
	margin-bottom: 2rem;
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
}

.chart {
	width: 100%;
	height: 300px;
}

.chart :deep(.u-legend) {
	color: var(--text-secondary);
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

.link-stats-simple {
	display: grid;
	grid-template-columns: 300px repeat(3, 1fr);
	gap: 1.5rem;
	margin-bottom: 2rem;
}

.link-stats-main {
	background: var(--bg-tertiary);
	padding: 1rem;
	border-radius: 8px;
}

.link-stats-list {
	background: var(--bg-tertiary);
	padding: 1rem;
	border-radius: 8px;
	display: flex;
	flex-direction: column;
}

.link-stats-list h3 {
	margin: 0 0 0.75rem 0;
	font-size: 1rem;
	color: var(--text-primary);
}

.stats-list {
	list-style: none;
	padding: 0;
	margin: 0;
	overflow-y: auto;
	flex: 1;
}

.stats-list li {
	padding: 0.5rem 0;
	color: var(--text-primary);
	border-bottom: 1px solid var(--bg-border);
	font-size: 0.875rem;
}

.stats-list li:last-child {
	border-bottom: none;
}

.stats-list li.empty {
	color: var(--text-secondary);
	text-align: center;
	padding: 1rem;
	border-bottom: none;
}

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
</style>
