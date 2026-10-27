<script lang="ts">
  // Home · Purchasing: the charts that were on the Purchase orders Overview tab (docs/17 Phase 2).
  import { loading, plans, pos, shipments, type Loading, type Plan, type PurchaseOrder, type Shipment } from '@btw/api';
  import POsOverview from '../../../components/overview/POsOverview.svelte';
  let data = $state<{ list: PurchaseOrder[]; plans: Plan[]; loads: Loading[]; ships: Shipment[] } | null>(null);
  $effect(() => {
    Promise.all([pos.list(), plans.list().catch(() => []), loading.list().catch(() => []), shipments.list().catch(() => [])])
      .then(([l, p, ld, sh]) => (data = { list: l.filter((x) => x.status !== 'Deleted'), plans: p, loads: ld, ships: sh })).catch(() => (data = { list: [], plans: [], loads: [], ships: [] }));
  });
</script>
{#if data}<POsOverview {...data} />{:else}<div class="skeleton" style="height:240px"></div>{/if}
