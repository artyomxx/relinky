<template>
	<div
		class="pointer-hint"
		:class="{
			'pointer-hint-visible': visible,
			'pointer-hint-copied': isCopied,
			'pointer-hint--tap': tapMode
		}"
		:style="style"
	>
		<div v-if="showIcons" class="pointer-hint-icon-track">
			<svg class="pointer-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
				<rect x="8.5" y="5" width="10" height="12" rx="1.8" fill="#2b2d33" stroke="#d2d6e0" />
				<rect x="5.5" y="8" width="10" height="12" rx="1.8" fill="#383b45" stroke="#f2f4fa" />
			</svg>
			<svg class="pointer-hint-icon" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M6 12.5L10.2 16.7L18.5 8.4" fill="none" stroke="#f2f4fa" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</div>
		<span class="pointer-hint-label">
			<template v-if="isCopied">Copied!</template>
			<template v-else>
				<template v-if="prefix">{{ prefix }}</template>
				<span v-if="value" class="pointer-hint-value">{{ value }}</span>
			</template>
		</span>
	</div>
</template>

<script setup>
defineProps({
	visible: {
		type: Boolean,
		default: false
	},
	style: {
		type: Object,
		default: () => ({})
	},
	value: {
		type: String,
		default: ''
	},
	prefix: {
		type: String,
		default: ''
	},
	isCopied: {
		type: Boolean,
		default: false
	},
	showIcons: {
		type: Boolean,
		default: false
	},
	tapMode: {
		type: Boolean,
		default: false
	}
})
</script>

<style scoped>
.pointer-hint {
	position: fixed;
	height: 24px;
	padding: 0 6px 0 8px;
	display: flex;
	align-items: center;
	gap: 2px;
	border: 1px solid var(--bg-border);
	border-radius: 6px;
	background: var(--bg-primary);
	opacity: 0;
	transform: translate(0, 0);
	transition: opacity 0.1s ease, transform 0.1s ease;
	pointer-events: none;
	z-index: 60;
	box-sizing: border-box;
}

.pointer-hint:not(.pointer-hint-copied):not(.pointer-hint--tap) {
	height: auto;
	min-height: 24px;
	align-items: flex-start;
	padding-top: 4px;
	padding-bottom: 4px;
	max-height: min(40vh, 240px);
	overflow-y: auto;
}

.pointer-hint:not(.pointer-hint-copied):not(.pointer-hint--tap) .pointer-hint-label {
	display: inline-block;
	flex: 1;
	min-width: 0;
}

.pointer-hint-visible {
	opacity: 1;
	transform: translate(0, 0);
}

.pointer-hint-label {
	display: inline;
	font-size: 12px;
	line-height: 1.35;
	color: var(--text-primary);
}

.pointer-hint-value {
	display: inline;
	margin-left: 4px;
	text-align: left;
	font-family: monospace;
	font-style: italic;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.pointer-hint:not(.pointer-hint-copied):not(.pointer-hint--tap) .pointer-hint-value:only-child {
	margin-left: 0;
}

.pointer-hint-copied,
.pointer-hint--tap.pointer-hint-visible {
	height: 24px;
	align-items: center;
}

.pointer-hint-copied .pointer-hint-label,
.pointer-hint--tap.pointer-hint-visible .pointer-hint-label {
	white-space: nowrap;
}

.pointer-hint-icon-track {
	position: relative;
	flex-shrink: 0;
	height: 16px;
	width: 16px;
	overflow: hidden;
}

.pointer-hint-icon {
	position: absolute;
	left: 0;
	display: block;
	height: 16px;
	width: 16px;
	transition: transform 0.1s ease;
}

.pointer-hint-icon:first-child {
	top: 0;
	transform: translateY(0);
}

.pointer-hint-icon:last-child {
	top: 0;
	transform: translateY(16px);
}

.pointer-hint-copied .pointer-hint-icon:first-child {
	transform: translateY(-16px);
}

.pointer-hint-copied .pointer-hint-icon:last-child {
	transform: translateY(0);
}

.pointer-hint--tap {
	z-index: 100;
}
</style>
