import { reactive, markRaw } from 'vue'

export function useFieldHint() {
	const state = reactive({
		open: false,
		message: '',
		variant: 'warning',
		anchor: null,
		items: [],
		placement: 'top',
		seeMoreHref: null,
		seeMoreLabel: 'See more'
	})

	function show({
		anchor,
		message,
		variant = 'warning',
		items = [],
		placement = 'top',
		seeMoreHref = null,
		seeMoreLabel = 'See more'
	}) {
		if (!anchor) return
		state.anchor = markRaw(anchor)
		state.message = message
		state.variant = variant
		state.items = items
		state.placement = placement
		state.seeMoreHref = seeMoreHref
		state.seeMoreLabel = seeMoreLabel
		state.open = true
	}

	function hide() {
		state.open = false
		state.anchor = null
		state.message = ''
		state.items = []
		state.placement = 'top'
		state.seeMoreHref = null
		state.seeMoreLabel = 'See more'
	}

	return { state, show, hide }
}
