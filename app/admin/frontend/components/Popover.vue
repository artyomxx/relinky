<template>
	<span
		:class="['popover', { 'popover-visible': visible, 'popover-fade-out': fadeOut }]"
		:style="style"
	>
		{{ text }}
	</span>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
	text: {
		type: String,
		required: true
	},
	visible: {
		type: Boolean,
		default: false
	},
	x: {
		type: Number,
		default: 0
	},
	y: {
		type: Number,
		default: 0
	}
})

const fadeOut = ref(false)

const style = computed(() => {
	const base = {
		left: `${props.x + 8}px`,
		top: `${props.y + 8}px`,
		transform: 'translateY(-100%)',
		transition: fadeOut.value ? 'opacity 0.5s ease-out' : 'opacity 0.2s ease-in'
	}
	
	return base
})

watch(() => props.visible, (newVal) => {
	if (!newVal) {
		fadeOut.value = true
	} else {
		fadeOut.value = false
	}
})
</script>

<style scoped>
.popover {
	position: absolute;
	padding: 0.25rem 0.5rem;
	background: var(--bg-primary);
	color: var(--text-primary);
	border: 1px solid var(--bg-border);
	border-radius: 4px;
	font-size: 0.75rem;
	white-space: nowrap;
	opacity: 0;
	pointer-events: none;
	z-index: 10;
	margin-top: -8px;
}

.popover-visible {
	opacity: 1;
}
</style>
