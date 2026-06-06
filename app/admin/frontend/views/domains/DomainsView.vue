<template>
	<div class=domains-view>
		<DomainsList />

		<section class=view-group>
			<h2 class=view-group-title>Global defaults</h2>
			<Defaults />
		</section>

		<DangerZone class='view-group view-group--danger' />
	</div>
</template>

<script setup>
import DomainsList from './DomainsList.vue'
import Defaults from './Defaults.vue'
import DangerZone from './DangerZone.vue'
</script>
