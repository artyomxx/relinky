<template>
	<div class="tab-content settings-tab" :class="{ 'loading-overlay': loading }">
		<div class="settings-tab-header">
			<h3 class="settings-tab-title">General</h3>
		</div>

		<div class="settings-columns">
			<div class="settings-column settings-card">
				<h3>Defaults</h3>
				<form @submit.prevent class="settings-form">
					<div class="form-group">
						<label>Default Domain</label>
						<select v-model="localDefaults.default_domain">
							<option value="">None</option>
							<option v-for="domain in domains" :key="domain.id" :value="domain.domain">
								{{ domain.domain }}
							</option>
						</select>
					</div>
					<div class="form-group">
						<label>Default Expired URL</label>
						<input
							v-model="localDefaults.expired_url"
							type="text"
							placeholder="example.com/expired or https://example.com/expired"
							@blur="normalizeUrl('expired_url')"
						/>
					</div>
					<div class="form-group">
						<label>Default Redirect Code</label>
						<select v-model="localDefaults.redirect_code">
							<option value="301">301 - Permanent</option>
							<option value="302">302 - Found</option>
							<option value="303">303 - See Other</option>
							<option value="307">307 - Temporary</option>
							<option value="308">308 - Permanent</option>
						</select>
					</div>
					<div class="form-group">
						<label>
							<input type="checkbox" v-model="localDefaults.keep_referrer" />
							Keep Referrer (default)
						</label>
					</div>
					<div class="form-group">
						<label>
							<input type="checkbox" v-model="localDefaults.keep_query_params" />
							Keep Query Params (default)
						</label>
					</div>
				</form>
			</div>

			<div class="settings-column settings-card">
				<h3>Error Links</h3>
				<form @submit.prevent class="settings-form">
					<div class="form-group">
						<label>404 Redirect URL</label>
						<input
							v-model="localSettings.error_404_url"
							type="text"
							placeholder="example.com/404 or https://example.com/404"
							@blur="normalizeUrl('error_404_url')"
						/>
					</div>
					<div class="form-group">
						<label>500/403 Error Redirect URL</label>
						<input
							v-model="localSettings.error_500_url"
							type="text"
							placeholder="example.com/error or https://example.com/error"
							@blur="normalizeUrl('error_500_url')"
						/>
					</div>
				</form>
			</div>
		</div>

		<div class="form-actions">
			<span v-if="saveSuccess" class="success-message">Settings saved successfully</span>
			<button type="button" @click="resetSettings" class="btn-secondary" :disabled="!hasUnsavedChanges">Reset</button>
			<button type="button" @click="saveSettings" class="btn-primary">Save Settings</button>
		</div>
	</div>
</template>

<script setup>
defineProps({
	loading: { type: Boolean, required: true },
	domains: { type: Array, required: true },
	localDefaults: { type: Object, required: true },
	localSettings: { type: Object, required: true },
	saveSuccess: { type: Boolean, required: true },
	hasUnsavedChanges: { type: Boolean, required: true },
	resetSettings: { type: Function, required: true },
	saveSettings: { type: Function, required: true },
	normalizeUrl: { type: Function, required: true }
})
</script>

<style scoped>
.settings-columns {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
	margin-bottom: 1rem;
}

.settings-column h3 {
	margin: 0 0 1rem 0;
}

.settings-form {
	max-width: 100%;
}

.form-group input[type="checkbox"] {
	margin-right: 0.5rem;
}

@media (max-width: 900px) {
	.settings-columns {
		grid-template-columns: 1fr;
	}
}
</style>
