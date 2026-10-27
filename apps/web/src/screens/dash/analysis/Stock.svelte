<script lang="ts">
  // Home · Warehouse: stock positions (was the Inventory Overview tab, docs/17 Phase 2). Values only with prices (A-04).
  import { analytics, inventory, type StockRow, type User, type VelocityRow } from '@btw/api';
  import { seesPrices } from '@btw/api/access';
  import * as MX from '@btw/api/metrics';
  import InventoryOverview from '../../../components/overview/InventoryOverview.svelte';
  let { user }: { user: User } = $props();
  let rows = $state<StockRow[] | null>(null);
  let vel = $state<VelocityRow[]>([]);
  $effect(() => { Promise.all([inventory.stock(), analytics.velocity().catch(() => [])]).then(([r, v]) => { rows = r; vel = v; }).catch(() => (rows = [])); });
  const scoped = $derived(user.roles.includes('director') || !user.warehouseIds.length ? null : user.warehouseIds);
  const pace = $derived(MX.paceFromVelocity(vel));
  const cover = (x: StockRow) => { const p = pace(x); return p.perDay ? Math.round(x.closing / p.perDay) : 999; };
  const levelOf = (x: StockRow) => { const p = pace(x); const k = MX.stockRisk(x.closing, p.perDay, p.daysSinceSale); return k === 'out' ? 'Out of stock' : k === 'stock-out risk' || k === 'low' ? 'Low' : k === 'ok' ? 'OK' : 'Overstock'; };
</script>
{#if rows}<InventoryOverview rows={rows.filter((x) => !scoped || scoped.includes(x.warehouseId))} {vel} {levelOf} {cover} thresholds={analytics.thresholds} money={seesPrices(user)} />{:else}<div class="skeleton" style="height:240px"></div>{/if}
