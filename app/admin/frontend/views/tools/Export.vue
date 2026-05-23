<template>
	<div class="export settings-card">
		<div class="form-row">
			<div class="form-group">
				<label>Start date</label>
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
		</div>
		<button @click="exportLinks" :disabled="exporting" class="btn-primary">
			{{ exporting ? 'Processing...' : (exportCount !== null ? `Export (${exportCount} links)` : 'Export') }}
		</button>
	</div>
</template>

<script setup>
defineProps({
	exporting: { type: Boolean, required: true },
	exportSettings: { type: Object, required: true },
	exportCount: { required: true },
	domains: { type: Array, required: true },
	exportLinks: { type: Function, required: true }
})
</script>
