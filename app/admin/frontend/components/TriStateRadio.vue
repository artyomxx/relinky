<template>
	<div class=tri-state-radios role=radiogroup :aria-label=label>
		<label class=tri-state-option>
			<input
				type=radio
				:name=name
				:checked="modelValue === null"
				@change="emit('update:modelValue', null)"
			/>
			<span>
				{{defaultLabel}}
				<em v-if=defaultLabelHintValue>({{defaultLabelHintValue}})</em>
			</span>
		</label>
		<label class=tri-state-option>
			<input
				type=radio
				:name=name
				:checked="modelValue === true"
				@change="emit('update:modelValue', true)"
			/>
			<span>On</span>
		</label>
		<label class=tri-state-option>
			<input
				type=radio
				:name=name
				:checked="modelValue === false"
				@change="emit('update:modelValue', false)"
			/>
			<span>Off</span>
		</label>
	</div>
</template>

<script setup>
defineProps({
	modelValue: { type: [Boolean, null], default: null },
	name: { type: String, required: true },
	label: { type: String, default: '' },
	defaultLabel: { type: String, default: 'Default' },
	defaultLabelHintValue: { type: String }
})

const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.tri-state-radios {
	display: flex;
	flex-direction: row;
	gap: 1rem;
	align-items: center;
}

.tri-state-option {
	display: flex;
	flex-direction: row;
	cursor: pointer;
	gap: 0.5rem;
	align-items: center;
	font-weight: normal;
}

.tri-state-option input {
	margin: 0;
}
</style>
