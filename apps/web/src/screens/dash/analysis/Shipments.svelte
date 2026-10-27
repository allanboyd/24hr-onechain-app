<script lang="ts">
  // Home · Fleet: trucks by status, on time, worst legs (was the Shipments Overview tab, docs/17 Phase 2).
  import { shipments, type Shipment, type User } from '@btw/api';
  import ShipmentsOverview from '../../../components/overview/ShipmentsOverview.svelte';
  let { user }: { user: User } = $props();
  let list = $state<Shipment[] | null>(null);
  $effect(() => { shipments.list().then((l) => (list = l)).catch(() => (list = [])); });
  const scoped = $derived((list ?? []).filter((sh) => !user.roles.includes('receiver') || user.roles.includes('director') || user.warehouseIds.includes(sh.warehouseId)));
</script>
{#if list}<ShipmentsOverview list={scoped} />{:else}<div class="skeleton" style="height:240px"></div>{/if}
