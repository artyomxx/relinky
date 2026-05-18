<template>
	<Teleport to="body">
		<div
			v-if="open"
			ref="floatingEl"
			class="field-hint"
			:class="[
				`field-hint--${variant}`,
				{
					'field-hint--has-list': items.length > 0,
					'field-hint--clickable': !!seeMoreHref
				}
			]"
			:role="variant === 'error' ? 'alert' : 'status'"
			:style="floatingStyle"
		>
			<span ref="arrowEl" class="field-hint__arrow" aria-hidden="true" />
			<p v-if="message" class="field-hint__message">{{ message }}</p>
			<ul v-if="items.length > 0" class="field-hint__list">
				<li v-for="(item, index) in items" :key="itemKey(item, index)">
					{{ formatItem(item) }}
				</li>
			</ul>
			<a
				v-if="seeMoreHref"
				:href="seeMoreHref"
				target="_blank"
				rel="noopener noreferrer"
				class="field-hint__see-more"
			>
				{{ seeMoreLabel }}
			</a>
		</div>
	</Teleport>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { computePosition, flip, shift, offset, arrow, autoUpdate } from '@floating-ui/dom'

const props = defineProps({
	open: {
		type: Boolean,
		default: false
	},
	message: {
		type: String,
		default: ''
	},
	variant: {
		type: String,
		default: 'warning',
		validator: (v) => v === 'warning' || v === 'error' || v === 'info'
	},
	anchor: {
		type: Object,
		default: null
	},
	items: {
		type: Array,
		default: () => []
	},
	placement: {
		type: String,
		default: 'top'
	},
	seeMoreHref: {
		type: String,
		default: null
	},
	seeMoreLabel: {
		type: String,
		default: 'See more'
	}
})

const floatingEl = ref(null)
const arrowEl = ref(null)
const coords = ref({ x: 0, y: 0 })

const floatingStyle = computed(() => ({
	position: 'fixed',
	left: `${coords.value.x}px`,
	top: `${coords.value.y}px`,
	zIndex: 10000
}))

let stopAutoUpdate = null

function formatItem(item) {
	if (item && typeof item === 'object' && item.domain != null && item.slug != null) {
		return `${item.domain}/${item.slug}`
	}
	return String(item ?? '')
}

function itemKey(item, index) {
	if (item && typeof item === 'object' && item.id != null) {
		return item.id
	}
	return `${formatItem(item)}-${index}`
}

function setArrowPosition(side, arrowData) {
	if (!arrowEl.value || !arrowData) {
		if (arrowEl.value) {
			arrowEl.value.style.display = 'none'
		}
		return
	}

	arrowEl.value.style.display = ''

	const staticSide = {
		top: 'bottom',
		right: 'left',
		bottom: 'top',
		left: 'right'
	}[side]

	Object.assign(arrowEl.value.style, {
		left: arrowData.x != null ? `${arrowData.x}px` : '',
		top: arrowData.y != null ? `${arrowData.y}px` : '',
		[staticSide]: '-4px'
	})
}

async function updatePosition() {
	const reference = props.anchor
	const floating = floatingEl.value
	if (!reference || !floating) return

	const result = await computePosition(reference, floating, {
		placement: props.placement,
		middleware: [
			offset(10),
			flip(),
			shift({ padding: 8 }),
			arrow({ element: arrowEl.value, padding: 4 })
		]
	})

	coords.value = { x: result.x, y: result.y }
	setArrowPosition(result.placement.split('-')[0], result.middlewareData.arrow)
}

function startAutoUpdate() {
	stopAutoUpdate?.()
	const reference = props.anchor
	const floating = floatingEl.value
	if (!reference || !floating) return
	stopAutoUpdate = autoUpdate(reference, floating, updatePosition)
}

function teardownAutoUpdate() {
	stopAutoUpdate?.()
	stopAutoUpdate = null
}

watch(
	() => [
			props.open,
			props.anchor,
			props.message,
			props.items,
			props.placement,
			props.variant,
			props.seeMoreHref
		],
	async () => {
		teardownAutoUpdate()
		if (!props.open || !props.anchor) return
		await nextTick()
		await updatePosition()
		startAutoUpdate()
	},
	{ flush: 'post', deep: true }
)

onBeforeUnmount(teardownAutoUpdate)
</script>

<style scoped>
.field-hint {
	max-width: min(280px, calc(100vw - 16px));
	padding: 0.35rem 0.55rem;
	border-radius: 4px;
	font-size: 0.8125rem;
	line-height: 1.35;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
	pointer-events: none;
}

.field-hint--has-list {
	padding: 0.45rem 0.6rem;
	max-width: min(320px, calc(100vw - 16px));
}

.field-hint__message {
	margin: 0;
}

.field-hint__message + .field-hint__list {
	margin-top: 0.35rem;
}

.field-hint__list {
	margin: 0;
	padding: 0 0 0 1.1rem;
	list-style: disc;
}

.field-hint__list li {
	margin: 0.15rem 0;
}

.field-hint__see-more {
	display: inline-block;
	margin-top: 0.4rem;
	font-size: 0.8125rem;
	color: var(--link-base);
	text-decoration: underline;
}

.field-hint__see-more:hover {
	color: var(--link-hover);
}

.field-hint--clickable {
	pointer-events: auto;
}

.field-hint--info {
	background: var(--field-hint-info-bg);
	border: 1px solid var(--field-hint-info-border);
	color: var(--field-hint-info-text);
}

.field-hint--warning {
	background: var(--field-hint-warning-bg);
	border: 1px solid var(--field-hint-warning-border);
	color: var(--field-hint-warning-text);
}

.field-hint--error {
	background: var(--field-hint-error-bg);
	border: 1px solid var(--field-hint-error-border);
	color: var(--field-hint-error-text);
}

.field-hint__arrow {
	position: absolute;
	width: 8px;
	height: 8px;
	transform: rotate(45deg);
	background: inherit;
	border: inherit;
	box-sizing: border-box;
}

.field-hint--info .field-hint__arrow {
	background: var(--field-hint-info-bg);
	border-color: var(--field-hint-info-border);
}

.field-hint--warning .field-hint__arrow {
	background: var(--field-hint-warning-bg);
	border-color: var(--field-hint-warning-border);
}

.field-hint--error .field-hint__arrow {
	background: var(--field-hint-error-bg);
	border-color: var(--field-hint-error-border);
}
</style>
