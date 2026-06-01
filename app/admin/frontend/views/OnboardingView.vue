<template>
	<div class=gate-view>
		<div class=gate-panel>
			<h1>Welcome to Relinky!</h1>
			<hr>

			<form @submit.prevent=onPrimaryAction>
				<div v-if='step === 1' class=step-panel>
					<div class=field>
						<label>
							New admin password
							<span v-if='password.length < 8'
							:class=statusClass class=hint>
								— at least 8 symbols
							</span>
						</label>
						<input
							v-model=password
							type=password
							required
							minlength=8
							autofocus
							@input=clearFeedback
						/>
					</div>
					<div class=field>
						<label>
							Repeat it here
							<span v-if='password.length >=8 && password != confirmPassword'
							:class=statusClass class=hint>
								— should match
							</span>
						</label>
						<input
							v-model=confirmPassword
							type=password
							required
							minlength=8
							@input=clearFeedback
						/>
					</div>
				</div>

				<div v-else-if='step === 2' class=step-panel>
					<div class=field>
						<label>
							Your first redirect domain							
						</label>
						<p :class=statusClass class=hint>
							{{ domainValidationHint || 'Looks good!'}}
						</p>
						<input
							v-model=domain
							type=text
							placeholder='example.com'
							required
							autofocus
							@input=clearFeedback
						/>
					</div>
				</div>

				<div v-else class=step-panel>
					<p class=dns-copy>
						Point <strong><u>{{ domain.trim() }}</u></strong> to this server with an
						<strong>A</strong> record at your DNS provider:
					</p>
					<dl class=dns-record>
						<div><dt>Type</dt><dd>A</dd></div>
						<div><dt>Name</dt><dd>@</dd></div>
						<div><dt>Value</dt><dd>xxx.xxx.xxx.xxx</dd></div>
					</dl>
					<p class=hint>Replace <code>xxx.xxx.xxx.xxx</code> with this server's public IP address.</p>
				</div>

				<div class=step-actions>
					<div class=step-nav>
						<div class=step-nav-start>
							<button
								v-if='step > 1'
								type=button
								class=btn-back
								:disabled=loading
								@click=goBack
							>
								← Back
							</button>
						</div>
						<span class=step-label>Step {{ step }} of 3</span>
						<div class=step-nav-end>
							<button type=submit class=btn-primary :disabled=primaryDisabled>
								{{ primaryLabel }}
							</button>
						</div>
					</div>
				</div>
			</form>
		</div>
	</div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

const router = useRouter()
const authStore = useAuthStore()
const step = ref(1)
const password = ref('')
const confirmPassword = ref('')
const domain = ref('')
const error = ref('')
const loading = ref(false)

const passwordValidationHint = computed(() => {
	const next = password.value
	const confirm = confirmPassword.value

	if (next.length < 8)
		return 'Password must be at least 8 characters'
	if (next !== confirm)
		return 'Passwords do not match'

	return ''
})

const domainValidationHint = computed(() => {
	const value = domain.value.trim()

	if (!value || /:\/\//.test(value) || value.includes('/'))
		return 'Use the domain only — no https:// or path'
	if (/\s/.test(value))
		return 'Domain cannot contain spaces'
	if (!DOMAIN_RE.test(value))
		return 'Enter a valid domain (e.g. example.com)'

	return ''
})

const passwordStepBlocked = computed(() =>
	password.value.length < 8 ||
	password.value !== confirmPassword.value
)

const domainStepBlocked = computed(() => domainValidationHint.value !== '')

const primaryDisabled = computed(() => {
	if (loading.value) return true
	if (step.value === 1) return passwordStepBlocked.value
	if (step.value === 2) return domainStepBlocked.value
	return false
})

const primaryLabel = computed(() => {
	if (loading.value && step.value === 3) return 'Setting up...'
	if (step.value === 3) return 'Finish'
	return 'Next →'
})

const statusText = computed(() => {
	if (error.value) return error.value
	if (step.value === 1) return passwordValidationHint.value
	if (step.value === 2) return domainValidationHint.value
	return ''
})

const statusClass = computed(() => {
	if (error.value) return 'status-line error'
	if (statusText.value) return 'status-line hint'
	return 'status-line'
})

function clearFeedback() {
	error.value = ''
}

function goBack() {
	error.value = ''
	step.value -= 1
}

function onPrimaryAction() {
	if (step.value === 1) {
		if (passwordStepBlocked.value) return
		error.value = ''
		step.value = 2
		return
	}
	if (step.value === 2) {
		if (domainStepBlocked.value) return
		error.value = ''
		step.value = 3
		return
	}
	handleSetup()
}

async function handleSetup() {
	error.value = ''
	loading.value = true
	try {
		await authStore.setup(password.value, domain.value.trim())
		router.push('/links')
	} catch (err) {
		error.value = err.message
	} finally {
		loading.value = false
	}
}
</script>

<style scoped>
.step-label {
	margin: 0;
	text-align: center;
	color: var(--text-tertiary);
	font-size: 0.8rem;
	white-space: nowrap;
}

.step-panel {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.dns-copy {
	margin: 0;
	line-height: 1.5;
}

.dns-record {
	margin: 0;
	display: grid;
	gap: 0.5rem;
}

.dns-record > div {
	display: grid;
	grid-template-columns: 4.5rem 1fr;
	gap: 0.5rem;
}

.dns-record dt {
	margin: 0;
	color: var(--text-tertiary);
}

.dns-record dd {
	margin: 0;
	font-family: ui-monospace, monospace;
}

.step-actions {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.step-nav {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	align-items: center;
	column-gap: 0.5rem;
}

.step-nav-start {
	justify-self: start;
	min-width: 0;
}

.step-nav-end {
	justify-self: end;
	min-width: 0;
}

.step-nav .step-label {
	justify-self: center;
}

.step-nav-end .btn-primary {
	min-width: 7rem;
}

.btn-back {
	background: transparent;
	color: var(--text-secondary);
	border: 1px solid var(--border-color, #444);
	padding: 0.5rem 0.75rem;
	border-radius: 4px;
	cursor: pointer;
}

.btn-back:hover:not(:disabled) {
	color: var(--text-primary);
}

.btn-back:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.step-actions .status-line {
	margin: 0;
	text-align: center;
}

.status-line.error {
	color: var(--accent-error);
}

.status-line.hint {
	color: var(--text-secondary);
}

.hint {
	font-style: italic;
}
</style>
