<template>
	<div class=domain-override-fields>
		<div class=settings-columns>
			<div class=settings-column>
				<div class=form-group>
					<label>Default expired URL</label>
					<input
						v-model=local.expired_url
						type=text
						:placeholder=expiredPlaceholder
						@blur="normalizeField('expired_url')"
					/>
				</div>
				<div class=form-group>
					<label>Default redirect code</label>
					<select v-model=local.redirect_code>
						<option :value=null>global default: {{ globalDefaults.redirect_code || '303' }}</option>
						<option value=301>301 - Permanent</option>
						<option value=302>302 - Found</option>
						<option value=303>303 - See Other</option>
						<option value=307>307 - Temporary</option>
						<option value=308>308 - Permanent</option>
					</select>
				</div>
				<div class=form-group>
					<label>Keep referrer default</label>
					<TriStateRadio
						:name="`${domainId}-keep-referrer`"
						v-model=local.keep_referrer
						default-label='Global default'
						:default-label-hint-value=keepReferrerHint
					/>
				</div>
				<div class=form-group>
					<label>Keep query params default</label>
					<TriStateRadio
						:name="`${domainId}-keep-query`"
						v-model=local.keep_query_params
						default-label='Global default'
						:default-label-hint-value=keepQueryHint
					/>
				</div>
			</div>
			<div class=settings-column>
				<div class=form-group>
					<label>404 error URL</label>
					<input
						v-model=local.error_404_url
						type=text
						:placeholder=error404Placeholder
						@blur="normalizeField('error_404_url')"
					/>
				</div>
				<div class=form-group>
					<label>500/403 error URL</label>
					<input
						v-model=local.error_500_url
						type=text
						:placeholder=error500Placeholder
						@blur="normalizeField('error_500_url')"
					/>
				</div>
			</div>
		</div>
		<div class=override-actions>
			<div v-if=statusText class=form-status-bar :class=statusClass role=status>{{ statusText }}</div>
			<button type=button class=btn-secondary :disabled="saving || !dirty" @click=reset>Reset</button>
			<button type=button class=btn-primary :disabled="saving || !dirty" @click=save>Save</button>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import TriStateRadio from '../../components/TriStateRadio.vue'
import { cleanUrl } from '../../utils/normalize-url.js'
import {
	globalOnlyPlaceholder,
	globalBoolHint
} from '../../utils/placeholders.js'

const props = defineProps({
	domainId: { type: [Number, String], required: true },
	overrides: { type: Object, required: true },
	globalDefaults: { type: Object, required: true },
	globalSettings: { type: Object, required: true },
	saving: { type: Boolean, default: false },
	saveError: { type: String, default: '' },
	saveSuccess: { type: Boolean, default: false }
})

const emit = defineEmits(['save'])

function cloneOverrides(src) {
	return {
		expired_url: src.expired_url ?? '',
		redirect_code: src.redirect_code ?? null,
		keep_referrer: src.keep_referrer ?? null,
		keep_query_params: src.keep_query_params ?? null,
		error_404_url: src.error_404_url ?? '',
		error_500_url: src.error_500_url ?? ''
	}
}

const local = ref(cloneOverrides(props.overrides))
const original = ref(cloneOverrides(props.overrides))

watch(() => props.overrides, val => {
	local.value = cloneOverrides(val)
	original.value = cloneOverrides(val)
}, { deep: true })

const expiredPlaceholder = computed(() =>
	globalOnlyPlaceholder(props.globalDefaults.expired_url)
)

const error404Placeholder = computed(() =>
	globalOnlyPlaceholder(props.globalSettings.error_404_url)
)

const error500Placeholder = computed(() =>
	globalOnlyPlaceholder(props.globalSettings.error_500_url)
)

const keepReferrerHint = computed(() => globalBoolHint(props.globalDefaults, 'keep_referrer'))
const keepQueryHint = computed(() => globalBoolHint(props.globalDefaults, 'keep_query_params'))

const dirty = computed(() => JSON.stringify(local.value) !== JSON.stringify(original.value))

const statusText = computed(() => {
	if (props.saving) return 'Saving…'
	if (props.saveError) return props.saveError
	if (props.saveSuccess) return 'Saved'
	return ''
})

const statusClass = computed(() => {
	if (props.saveError) return 'form-status-bar--error'
	if (props.saveSuccess) return 'form-status-bar--success'
	return ''
})

function normalizeField(key) {
	if (key === 'expired_url' || key === 'error_404_url' || key === 'error_500_url') {
		local.value[key] = cleanUrl(local.value[key])
	}
}

function payloadFromLocal() {
	const out = {}
	const trimOrNull = v => {
		if (v === null || v === undefined) return null
		const t = typeof v === 'string' ? v.trim() : v
		return t === '' ? null : t
	}
	out.expired_url = trimOrNull(local.value.expired_url)
	out.redirect_code = local.value.redirect_code === null || local.value.redirect_code === ''
		? null
		: parseInt(local.value.redirect_code, 10)
	out.keep_referrer = local.value.keep_referrer
	out.keep_query_params = local.value.keep_query_params
	out.error_404_url = trimOrNull(local.value.error_404_url)
	out.error_500_url = trimOrNull(local.value.error_500_url)
	return out
}

function reset() {
	local.value = cloneOverrides(original.value)
}

function save() {
	normalizeField('expired_url')
	normalizeField('error_404_url')
	normalizeField('error_500_url')
	emit('save', payloadFromLocal())
}
</script>

<style scoped>
.domain-override-fields {
	padding: 0.75rem 0 0;
}

.settings-columns {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
}

.form-group {
	display: flex;
	flex-direction: column;
}

.override-actions {
	display: flex;
	flex-direction: row;
	align-items: center;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 0.5rem;
	text-align: right;
}

.form-status-bar--error {
	color: var(--accent-error);
}

@media (max-width: 900px) {
	.settings-columns {
		grid-template-columns: 1fr;
	}
}
</style>
