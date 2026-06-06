<template>
	<div class='danger-zone settings-card settings-card-danger'>
		<div class=form-group>
			<select v-model=dangerZoneDomain :disabled=deleting>
				<option disabled selected value=''>Select domain</option>
				<option v-for="domain in domainsStore.domains" :key=domain.id :value=domain.domain>
					{{ domain.domain }}
				</option>
			</select>
		</div>
		<div v-if=showConfirmInput class=form-group>
			<input
				ref=confirmInputRef
				v-model=confirmInput
				type=text
				:placeholder='`Type domain name to confirm (${dangerZoneDomain})`'
				@keyup.enter=confirmDelete
			/>
		</div>
		<button
			@click='showConfirmInput ? confirmDelete() : showDeleteConfirm()'
			:disabled='!dangerZoneDomain || deleting'
			class=btn-danger
		>
			{{ deleting ? 'Deleting...' : 'Delete domain with all its links' }}
		</button>
	</div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useDomainsStore } from '../../stores/domains.js'

const domainsStore = useDomainsStore()

const dangerZoneDomain = ref('')
const showConfirmInput = ref(false)
const confirmInput = ref('')
const confirmInputRef = ref(null)
const deleting = ref(false)

watch(dangerZoneDomain, () => {
	showConfirmInput.value = false
	confirmInput.value = ''
})

function showDeleteConfirm() {
	if (!dangerZoneDomain.value) return
	showConfirmInput.value = true
	confirmInput.value = ''
	nextTick(() => {
		confirmInputRef.value?.focus()
	})
}

async function confirmDelete() {
	if (!dangerZoneDomain.value) return

	if (confirmInput.value !== dangerZoneDomain.value) {
		alert('Please type the exact domain name to confirm deletion')
		return
	}

	if (!confirm(`Are you sure you want to delete domain "${dangerZoneDomain.value}" and ALL its links? This action cannot be undone.`)) {
		return
	}

	deleting.value = true
	try {
		await domainsStore.deleteDomainWithLinks(dangerZoneDomain.value)
		alert('Domain and all its links deleted successfully')
		dangerZoneDomain.value = ''
		showConfirmInput.value = false
		confirmInput.value = ''
	} catch (err) {
		alert(err.message)
	} finally {
		deleting.value = false
	}
}
</script>

<style scoped>
.danger-zone {
	border-width: 2px;
}

.danger-zone .form-group:last-of-type {
	margin-bottom: 1rem;
}
</style>
