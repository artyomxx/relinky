<template>
	<div class="tab-content settings-tab">
		<div class="settings-tab-header settings-tab-header-with-action">
			<h3 class="settings-tab-title">Domains</h3>
			<button type="button" class="btn-primary btn-small" @click="openAddDomain">Add Domain</button>
		</div>

		<div class="domains-content settings-card" :class="{ 'loading-overlay': loading }">
			<ul class="domains-list">
				<li v-for="domain in domains" :key="domain.id" class="domain-item">
					<span class="domain-name">{{ domain.domain }}</span>
					<span class="domain-links">
						<router-link
							v-if="domain.link_count > 0"
							:to="`/links/search/${encodeURIComponent(domain.domain)}`"
							class="link-count"
						>
							{{ domain.link_count }} links
						</router-link>
						<span v-else class="link-count-zero">0 links</span>
					</span>
					<a @click.prevent="deleteDomain(domain.id)" class="link-danger link-small">Delete</a>
				</li>
				<li v-if="domains.length === 0" class="empty">No domains yet</li>
			</ul>
		</div>

		<Transition name="modal-fade">
			<div v-if="showAddDomain" class="modal-overlay" @click.self="handleCloseDomainModal">
				<div class="modal">
					<h3>Add Domain</h3>
					<form @submit.prevent="handleAddDomain">
						<div class="form-group">
							<label>Domain</label>
							<input :ref="domainInputRefSetter" v-model="newDomainModel" type="text" placeholder="example.com" required />
						</div>
						<div v-if="showDomainUnsavedHint" class="unsaved-hint">You have unsaved changes. Press Cancel to abandon them.</div>
						<div class="form-actions">
							<button :ref="domainCancelButtonRefSetter" type="button" @click="handleCloseDomainModal">Cancel</button>
							<button type="submit">Add</button>
						</div>
					</form>
				</div>
			</div>
		</Transition>
	</div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
	loading: { type: Boolean, required: true },
	domains: { type: Array, required: true },
	showAddDomain: { type: Boolean, required: true },
	newDomain: { type: String, required: true },
	showDomainUnsavedHint: { type: Boolean, required: true },
	domainInputRefSetter: { type: Function, required: true },
	domainCancelButtonRefSetter: { type: Function, required: true },
	handleCloseDomainModal: { type: Function, required: true },
	handleAddDomain: { type: Function, required: true },
	deleteDomain: { type: Function, required: true },
	openAddDomain: { type: Function, required: true }
})

const emit = defineEmits(['update:newDomain'])

const newDomainModel = computed({
	get: () => props.newDomain,
	set: value => emit('update:newDomain', value)
})
</script>

<style scoped>
.domains-list {
	list-style: none;
	padding: 0;
	margin: 0;
}

.domain-item {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 0.75rem;
	border-bottom: 1px solid var(--bg-border);
}

.domain-item:last-child {
	border-bottom: none;
}

.domain-name {
	flex: 1;
	font-weight: 500;
}

.domain-links {
	color: var(--text-secondary);
}

.domains-list .empty {
	list-style: none;
}

.link-count {
	font-weight: 500;
}

.link-count:hover {
	text-decoration: underline;
}

.link-count-zero {
	color: var(--text-secondary);
}
</style>
