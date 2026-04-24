<template>
	<div class="tab-content settings-tab">
		<div class="settings-tab-header">
			<h3 class="settings-tab-title">Import & Export</h3>
		</div>

		<div class="import-export-container">
			<div class="import-section settings-card">
				<h4>Import Links</h4>
				<div class="form-group">
					<label>Import File (JSON)</label>
					<input type="file" @change="handleFileSelect" accept=".json" :ref="fileInputRefSetter" />
				</div>
				<div class="form-group">
					<label>Import Type</label>
					<select v-model="importSettings.importType">
						<option value="relinky">Relinky</option>
						<option value="kutt">Kutt</option>
						<option value="rebrandly">Rebrandly</option>
					</select>
				</div>
				<div class="form-group">
					<label>
						<input type="checkbox" v-model="importSettings.createDomains" />
						Create domains (if missing)
					</label>
				</div>
				<div class="form-group">
					<label>
						<input type="checkbox" v-model="importSettings.replaceExisting" />
						Replace existing slugs
					</label>
				</div>
				<button @click="previewImport" :disabled="!importFile || importing" class="btn-primary">
					Preview Import
				</button>

				<div v-if="previewStats" class="preview-stats">
					<h4>Import Preview</h4>
					<div class="stat-line">
						<strong>{{ previewStats.totalLinks }}</strong> links and <strong>{{ previewStats.totalDomains }}</strong> domains found
					</div>
					<div class="stat-line">
						<span><strong>{{ previewStats.linksToImport }}</strong> links to be imported</span>
						<span v-if="previewStats.linksToSkip > 0">, <strong>{{ previewStats.linksToSkip }}</strong> to skip</span>
						<span v-if="previewStats.linksExisting > 0">, <strong>{{ previewStats.linksExisting }}</strong> already exist(s)</span>
					</div>
					<div class="stat-line">
						<span><strong>{{ importSettings.createDomains ? previewStats.domainsToCreate : (previewStats.domainsToSkipList?.length || 0) }}</strong> domains</span>
						<span v-if="importSettings.createDomains"> to be created</span>
						<span v-else> to be skipped</span>
						<span v-if="previewStats.domainsExisting > 0">, <strong>{{ previewStats.domainsExisting }}</strong> already exist(s)</span>
					</div>
					<div v-if="previewStats.corruptedRows > 0" class="stat-line import-warning">
						<strong>{{ previewStats.corruptedRows }}</strong> rows were skipped as corrupted or mismatched for selected import type
					</div>
					<ul
						v-if="importSettings.createDomains ? previewStats.domainsToCreateList?.length : previewStats.domainsToSkipList?.length"
						class="domain-preview-list"
					>
						<li
							v-for="domain in (importSettings.createDomains ? previewStats.domainsToCreateList : previewStats.domainsToSkipList)"
							:key="domain"
						>
							{{ domain }}
						</li>
					</ul>
					<button @click="executeImport" :disabled="importing" class="btn-primary">Import</button>
				</div>
			</div>

			<div class="export-section settings-card">
				<h4>Export Links</h4>
				<div class="form-group">
					<label>Date (since)</label>
					<input type="date" v-model="exportSettings.dateSince" />
				</div>
				<div class="form-group">
					<label>Domain</label>
					<select v-model="exportSettings.domain">
						<option value="all">All</option>
						<option v-for="domain in domains" :key="domain.id" :value="domain.domain">
							{{ domain.domain }}
						</option>
					</select>
				</div>
				<button @click="exportLinks" :disabled="exporting" class="btn-primary">
					{{ exporting ? 'Processing...' : (exportCount !== null ? `Export (${exportCount} links)` : 'Export') }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
defineProps({
	fileInputRefSetter: { type: Function, required: true },
	importFile: { required: true },
	importing: { type: Boolean, required: true },
	exporting: { type: Boolean, required: true },
	previewStats: { required: true },
	importSettings: { type: Object, required: true },
	exportSettings: { type: Object, required: true },
	exportCount: { required: true },
	domains: { type: Array, required: true },
	handleFileSelect: { type: Function, required: true },
	previewImport: { type: Function, required: true },
	executeImport: { type: Function, required: true },
	exportLinks: { type: Function, required: true }
})
</script>

<style scoped>
.import-export-container {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
}

.import-section h4,
.export-section h4 {
	margin: 0 0 1rem 0;
	color: var(--text-primary);
}

.preview-stats {
	margin-top: 1.5rem;
	padding: 1rem;
	background: var(--bg-primary);
	border-radius: 4px;
}

.preview-stats h4 {
	margin: 0 0 1rem 0;
	color: var(--text-primary);
}

.stat-line {
	margin-bottom: 0.75rem;
	color: var(--text-primary);
	font-size: 0.875rem;
}

.stat-line strong {
	color: var(--text-tertiary);
}

.preview-stats button {
	margin-top: 1rem;
}

.domain-preview-list {
	margin: 0.25rem 0 0.75rem 1.25rem;
	padding: 0;
	font-size: 0.85rem;
}

.import-warning {
	color: var(--accent-warning);
}

@media (max-width: 900px) {
	.import-export-container {
		grid-template-columns: 1fr;
	}
}
</style>
