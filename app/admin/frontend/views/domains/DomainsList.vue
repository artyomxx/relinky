<template>
	<div class="domains-content" :class="{ 'loading-overlay': loading }">
		<ul v-if="domains.length > 0" class="domain-list">
			<li v-for="domain in domains" :key="domain.id" class="domain-row">
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
			</li>
		</ul>
		<p v-else class="empty">No domains yet</p>

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
	handleAddDomain: { type: Function, required: true }
})

const emit = defineEmits(['update:newDomain'])

const newDomainModel = computed({
	get: () => props.newDomain,
	set: value => emit('update:newDomain', value)
})
</script>

<style scoped>
.domains-content {
	width: 100%;
	min-width: 0;
}

.domain-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 1em;
}

.domain-row {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1rem;
	background: var(--bg-secondary);
	border-radius: 8px;
}

.domain-row:hover {
	background: color-mix(in srgb, var(--bg-tertiary) 65%, var(--bg-secondary));
}

.domain-name {
	flex: 1;
	font-weight: 500;
	min-width: 0;
}

.domain-links {
	flex-shrink: 0;
	color: var(--text-secondary);
}

.empty {
	margin: 0;
	color: var(--text-secondary);
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
