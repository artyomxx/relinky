import { ref, computed, onUnmounted } from 'vue'

const HINT_MARGIN = 8
const HINT_MIN_WIDTH = 120

export function usePointerHint({ isEnabled = () => true } = {}) {
	const hint = ref({
		x: 0,
		y: 0,
		visible: false,
		activeId: null,
		maxWidth: null,
		isCopied: false
	})

	const hintStyle = computed(() => {
		const style = {
			left: `${hint.value.x}px`,
			top: `${hint.value.y}px`
		}
		if (hint.value.maxWidth != null) {
			style.maxWidth = `${hint.value.maxWidth}px`
		}
		return style
	})

	let showTimer = null
	let moveTimer = null
	let resetTimer = null
	let positionLocked = false

	function layoutAtPointer(event, { constrainWidth = true } = {}) {
		const point = event.changedTouches?.[0] ?? event.touches?.[0] ?? event
		let x = point.clientX - 2
		const y = point.clientY + 3

		if (constrainWidth) {
			let maxWidth = window.innerWidth - HINT_MARGIN - x
			if (maxWidth < HINT_MIN_WIDTH) {
				x = Math.max(HINT_MARGIN, window.innerWidth - HINT_MARGIN - HINT_MIN_WIDTH)
				maxWidth = window.innerWidth - HINT_MARGIN - x
			}
			hint.value.maxWidth = maxWidth
		} else {
			hint.value.maxWidth = null
		}

		hint.value.x = x
		hint.value.y = y
	}

	function setPositionFromTap(event) {
		const point = event.changedTouches?.[0] ?? event.touches?.[0] ?? event
		const x = point.clientX
		const y = point.clientY
		const hintW = 108
		const hintH = 28
		hint.value.maxWidth = null
		hint.value.x = Math.min(Math.max(HINT_MARGIN, x - 2), window.innerWidth - hintW - HINT_MARGIN)
		hint.value.y = Math.min(Math.max(HINT_MARGIN, y + 3), window.innerHeight - hintH - HINT_MARGIN)
	}

	function handleHoverEnter(event, id) {
		if (!isEnabled()) return
		if (showTimer) clearTimeout(showTimer)
		if (moveTimer) {
			clearTimeout(moveTimer)
			moveTimer = null
		}
		positionLocked = false
		hint.value.activeId = id
		layoutAtPointer(event, { constrainWidth: true })
		showTimer = setTimeout(() => {
			if (hint.value.activeId === id) {
				hint.value.visible = true
			}
			showTimer = null
		}, 200)
	}

	function handleHoverMove(event, id) {
		if (!isEnabled()) return
		if (hint.value.activeId !== id) return
		if (!hint.value.visible && !positionLocked) {
			layoutAtPointer(event, { constrainWidth: true })
			return
		}
		if (moveTimer) clearTimeout(moveTimer)
		moveTimer = setTimeout(() => {
			if (hint.value.activeId === id && hint.value.visible) {
				layoutAtPointer(event, { constrainWidth: true })
			}
			moveTimer = null
		}, 200)
	}

	function dismissHint(id = null) {
		positionLocked = true
		if (showTimer) {
			clearTimeout(showTimer)
			showTimer = null
		}
		if (moveTimer) {
			clearTimeout(moveTimer)
			moveTimer = null
		}
		if (id != null && hint.value.activeId !== id) return
		hint.value.activeId = null
		hint.value.visible = false
		hint.value.isCopied = false
		hint.value.maxWidth = null
	}

	function handleHoverLeave(id) {
		if (!isEnabled()) return
		dismissHint(id)
	}

	function showCopied(id, event = null, { fromTap = false } = {}) {
		if (resetTimer) {
			clearTimeout(resetTimer)
			resetTimer = null
		}
		hint.value.activeId = id
		if (fromTap && event) {
			setPositionFromTap(event)
		} else {
			hint.value.maxWidth = null
		}
		hint.value.visible = true
		hint.value.isCopied = true
		resetTimer = setTimeout(() => {
			hint.value.isCopied = false
			if (fromTap) {
				hint.value.visible = false
				hint.value.activeId = null
			} else if (!hint.value.activeId) {
				hint.value.visible = false
			}
		}, 950)
	}

	function cleanup() {
		if (showTimer) clearTimeout(showTimer)
		if (moveTimer) clearTimeout(moveTimer)
		if (resetTimer) clearTimeout(resetTimer)
		showTimer = null
		moveTimer = null
		resetTimer = null
	}

	onUnmounted(cleanup)

	return {
		hint,
		hintStyle,
		handleHoverEnter,
		handleHoverMove,
		handleHoverLeave,
		dismissHint,
		showCopied,
		cleanup
	}
}
