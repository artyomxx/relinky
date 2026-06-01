<template>
	<div class=password-panel>
		<p v-if=envManaged class=env-warning>
			A password hash is set in the environment.
			It was saved to DB on startup.<br/>
			If you change the password here, don't forget to remove the env var before starting the server again,
			so the env value is not saved to DB again.
		</p>
		<form @submit.prevent=handleSubmit>
			<div class='field-row field-row-fields'>
				<div class=field>
					<label>Current password</label>
					<input v-model=currentPassword type=password required @input="clearFeedback"/>
				</div>
				<div class=field>
					<label>New password</label>
					<input v-model=newPassword type=password required minlength=8 @input="clearFeedback"/>
				</div>
				<div class=field>
					<label>Confirm new password</label>
					<input v-model=confirmPassword type=password required minlength=8 @input="clearFeedback"/>
				</div>
			</div>

			<div class='field-row field-row-actions'>
				<button type=submit class='btn-primary submit-btn' :disabled=submitDisabled>
					{{ loading ? 'Saving...' : 'Change password' }}
				</button>
				<p v-if=statusText :class=statusClass>{{ statusText }}</p>
			</div>
		</form>
	</div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../../stores/auth.js'

defineProps({
	envManaged: { type: Boolean, default: false }
})

const authStore = useAuthStore()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

const validationHint = computed(() => {
	const current = currentPassword.value
	const next = newPassword.value
	const confirm = confirmPassword.value

	if(!current.length)
		return 'Enter your current password'
	
	if (next.length < 8)
		return 'New password must be at least 8 characters'
	if (next !== confirm)
		return 'New passwords do not match'

	return ''
})

const submitDisabled = computed(() =>
	loading.value ||
	!currentPassword.value ||
	!newPassword.value ||
	newPassword.value.length < 8 ||
	newPassword.value !== confirmPassword.value
)

const statusText = computed(() => error.value || success.value || validationHint.value)

const statusClass = computed(() => {
	if (error.value) return 'status-line error'
	if (success.value) return 'status-line success'
	if (validationHint.value) return 'status-line hint'
	return 'status-line'
})

function clearFeedback() {
	error.value = ''
	success.value = ''
}

async function handleSubmit() {
	error.value = ''
	success.value = ''
	if (newPassword.value.length < 8) {
		return
	}
	if (newPassword.value !== confirmPassword.value) {
		return
	}
	loading.value = true
	try {
		await authStore.changePassword(currentPassword.value, newPassword.value)
		currentPassword.value = ''
		newPassword.value = ''
		confirmPassword.value = ''
		success.value = 'Password updated'
	} catch (err) {
		error.value = err.message
	} finally {
		loading.value = false
	}
}
</script>

<style scoped>
.password-panel form {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.field-row {
	display: flex;
	gap: 1rem;
}

.field-row-fields {
	flex-direction: row;
	flex-wrap: wrap;
}

.field-row-fields .field {
	flex: 1 1 10rem;
	min-width: 0;
}

.field-row-actions {
	flex-direction: row;
	align-items: center;
	flex-wrap: wrap;
}

.submit-btn {
	min-width: 10.5rem;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.field-row-actions .status-line {
	margin: 0;
	flex: 1 1 12rem;
}

.env-warning {
	margin: 0 0 1rem 0;
	padding: 0.75rem 1rem;
	border-radius: 6px;
	background: var(--bg-tertiary);
	color: var(--text-secondary);
	font-size: 0.875rem;
}

.status-line {
	font-size: 0.9rem;
}

.status-line.error {
	color: var(--accent-error);
}

.status-line.success {
	color: var(--accent-success, #3a9);
}

.status-line.hint {
	color: var(--text-secondary);
}

@media (max-width: 640px) {
	.field-row-fields,
	.field-row-actions {
		flex-direction: column;
		align-items: stretch;
	}

	.field-row-actions .status-line {
		order: -1;
	}
}
</style>
