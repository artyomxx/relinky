<template>
	<div class="tab-content settings-tab">
		<div class="settings-tab-header">
			<h3 class="settings-tab-title">Danger Zone</h3>
		</div>

		<div class="danger-zone settings-card settings-card-danger">
			<div class="form-group">
				<label>Domain</label>
				<select v-model="dangerZoneDomainModel" :disabled="deletingDomain">
					<option value="">Select domain</option>
					<option v-for="domain in domains" :key="domain.id" :value="domain.domain">
						{{ domain.domain }}
					</option>
				</select>
			</div>
			<div v-if="showDomainConfirmInput" class="form-group">
				<label>Type domain name to confirm: <strong>{{ dangerZoneDomain }}</strong></label>
				<input
					v-model="domainConfirmInputModel"
					type="text"
					placeholder="Enter domain name"
					:ref="domainConfirmInputRefSetter"
					@keyup.enter="confirmDeleteDomain"
				/>
			</div>
			<button
				@click="showDomainConfirmInput ? confirmDeleteDomain() : showDeleteDomainConfirm()"
				:disabled="!dangerZoneDomain || deletingDomain"
				class="btn-danger"
			>
				{{ deletingDomain ? 'Deleting...' : 'Delete domain with all its links' }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
	domains: { type: Array, required: true },
	dangerZoneDomain: { type: String, required: true },
	showDomainConfirmInput: { type: Boolean, required: true },
	domainConfirmInput: { type: String, required: true },
	domainConfirmInputRefSetter: { type: Function, required: true },
	deletingDomain: { type: Boolean, required: true },
	confirmDeleteDomain: { type: Function, required: true },
	showDeleteDomainConfirm: { type: Function, required: true }
})

const emit = defineEmits(['update:dangerZoneDomain', 'update:domainConfirmInput'])

const dangerZoneDomainModel = computed({
	get: () => props.dangerZoneDomain,
	set: value => emit('update:dangerZoneDomain', value)
})

const domainConfirmInputModel = computed({
	get: () => props.domainConfirmInput,
	set: value => emit('update:domainConfirmInput', value)
})
</script>

<style scoped>
.danger-zone {
	border-width: 2px;
}

.danger-zone .form-group:last-of-type {
	margin-bottom: 1rem;
}
</style>
