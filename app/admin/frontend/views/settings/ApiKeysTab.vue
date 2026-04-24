<template>
	<div class="tab-content settings-tab" :class="{ 'loading-overlay': loading }">
		<div class="settings-tab-header">
			<h3 class="settings-tab-title">API Keys</h3>
		</div>

		<div class="api-keys-section">
			<div class="settings-card api-key-create-card">
				<h4>Create key</h4>
				<div class="api-create-row">
					<div class="api-create-field">
						<label>Key Name</label>
						<input v-model="newApiKeyNameModel" type="text" placeholder="CI automation" />
					</div>
					<div class="api-create-field api-create-field-grow">
						<label>Allowed IPs (optional, comma-separated)</label>
						<input v-model="newApiAllowedIpsModel" type="text" placeholder="203.0.113.10, 198.51.100.0/24" />
					</div>
					<div class="api-create-actions">
						<button type="button" class="btn-primary" :disabled="creatingApiKey" @click="handleCreateApiKey">
							{{ creatingApiKey ? 'Creating...' : 'Create API Key' }}
						</button>
					</div>
				</div>
			</div>

			<div class="settings-card api-key-list-card">
				<h4>Existing keys</h4>
				<div class="api-key-list">
					<div v-for="key in apiKeys" :key="key.id" class="api-key-item">
						<div class="api-key-item-content">
							<div class="api-key-meta">
								<div><strong>{{ key.name }}</strong> <code>{{ key.key_id }}</code></div>
								<div class="api-muted">
									Created: {{ formatTs(key.created) }} | Last used: {{ formatTs(key.last_used_at) }} {{ key.last_used_ip ? `(${key.last_used_ip})` : '' }}
								</div>
								<div class="api-muted">Allowed IPs: {{ key.allowed_ips?.length ? key.allowed_ips.join(', ') : 'any' }}</div>
							</div>
							<div class="api-key-actions">
								<button type="button" class="btn-secondary" @click="handleToggleApiKey(key)">
									{{ key.enabled ? 'Disable' : 'Enable' }}
								</button>
								<button type="button" class="btn-secondary" @click="handleRegenerateApiKey(key)">Regenerate</button>
								<button type="button" class="btn-danger" @click="handleDeleteApiKey(key)">Delete</button>
							</div>
						</div>
						<div v-if="lastGeneratedApiToken && key.id === lastGeneratedApiKeyId" class="api-token-inline">
							<span class="api-token-inline-label">Copy now, you won't see it again:</span>
							<input type="text" readonly :value="lastGeneratedApiToken" />
							<button type="button" class="btn-secondary" @click="copyApiToken">{{ copyButtonText }}</button>
						</div>
					</div>
					<div v-if="apiKeys.length === 0" class="empty">No API keys yet</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
	loading: { type: Boolean, required: true },
	apiKeys: { type: Array, required: true },
	newApiKeyName: { type: String, required: true },
	newApiAllowedIps: { type: String, required: true },
	creatingApiKey: { type: Boolean, required: true },
	lastGeneratedApiToken: { type: String, required: true },
	lastGeneratedApiKeyId: { type: [String, Number, null], required: false, default: null },
	handleCreateApiKey: { type: Function, required: true },
	handleToggleApiKey: { type: Function, required: true },
	handleRegenerateApiKey: { type: Function, required: true },
	handleDeleteApiKey: { type: Function, required: true },
	formatTs: { type: Function, required: true }
})

const emit = defineEmits(['update:newApiKeyName', 'update:newApiAllowedIps'])

const newApiKeyNameModel = computed({
	get: () => props.newApiKeyName,
	set: value => emit('update:newApiKeyName', value)
})

const newApiAllowedIpsModel = computed({
	get: () => props.newApiAllowedIps,
	set: value => emit('update:newApiAllowedIps', value)
})

const copyButtonText = ref('Copy')
let copyResetTimer = null

watch(() => props.lastGeneratedApiToken, () => {
	copyButtonText.value = 'Copy'
	if (copyResetTimer) {
		clearTimeout(copyResetTimer)
		copyResetTimer = null
	}
})

onUnmounted(() => {
	if (copyResetTimer) {
		clearTimeout(copyResetTimer)
		copyResetTimer = null
	}
})

async function copyApiToken() {
	if (!props.lastGeneratedApiToken) return
	try {
		await navigator.clipboard.writeText(props.lastGeneratedApiToken)
		copyButtonText.value = 'Copied'
	} catch (_err) {
		const input = document.createElement('input')
		input.value = props.lastGeneratedApiToken
		document.body.appendChild(input)
		input.select()
		document.execCommand('copy')
		document.body.removeChild(input)
		copyButtonText.value = 'Copied'
	}
	if (copyResetTimer) {
		clearTimeout(copyResetTimer)
	}
	copyResetTimer = setTimeout(() => {
		copyButtonText.value = 'Copy'
		copyResetTimer = null
	}, 1500)
}
</script>

<style scoped>
.api-keys-section {
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.api-muted {
	color: var(--text-secondary, #858585);
	font-size: 0.9rem;
}

.api-create-row {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 1rem;
}

.api-create-field {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	min-width: 10rem;
}

.api-create-field-grow {
	flex: 1 1 16rem;
	min-width: 12rem;
}

.api-create-field input {
	width: 100%;
}

.api-create-actions {
	flex-shrink: 0;
}

.api-key-create-card h4,
.api-key-list-card h4 {
	margin: 0 0 1rem 0;
}

.api-key-list {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.api-key-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 0.75rem;
	padding: 0.75rem;
	border: 1px solid var(--bg-border);
	border-radius: 6px;
}

.api-key-item-content {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 1rem;
}

.api-key-meta {
	flex: 1;
	min-width: 0;
}

.api-key-actions {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
	flex-shrink: 0;
	justify-content: flex-end;
}

.api-token-inline {
	margin-top: 0.25rem;
	display: flex;
	gap: 0.5rem;
	align-items: center;
	width: 100%;
}
.api-token-inline input {
	flex: 1;
	width: 100%;
	min-width: 0;
	font-family: monospace;
}

.api-token-inline-label {
	color: var(--text-secondary, #858585);
	font-size: 0.85rem;
	white-space: nowrap;
}

@media (max-width: 900px) {
	.api-create-row {
		flex-direction: column;
		align-items: stretch;
	}

	.api-create-actions {
		align-self: flex-start;
	}

	.api-key-item-content {
		flex-direction: column;
		align-items: stretch;
	}

	.api-key-actions {
		justify-content: flex-start;
	}
}
</style>
