<script lang="ts">
  import { destinationLabel } from '../lib/planning';
  import CompanyCell from '../components/CompanyCell.svelte';
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { analytics, inventory, lookup, ref, type StockRow, type User, type VelocityRow } from '@btw/api';
  import { Badge, fmtDateTime, fmtMoney, fmtNum } from '@btw/ui';
  import { seesPrices } from '@btw/api/access';
  import ExportMenu from '../components/ExportMenu.svelte';
  import PageTabs from '../components/PageTabs.svelte';
  import InventoryOverview from '../components/overview/InventoryOverview.svelte';
  import { currentTab, qp } from '../lib/tab';
  import { inventoryTiles } from '../lib/tiles';
  import * as MX from '@btw/api/metrics';
  let { user }: { params?: any; user: User } = $props();
  const money = $derived(seesPrices(user)); // receivers: quantities only, no purchase prices (docs/12 A-04)
  const r = ref();
  const scoped = $derived(user.roles.includes('director') || !user.warehouseIds.length ? null : user.warehouseIds);
  const warehouses = $derived(r.warehouses.filter((w) => !scoped || scoped.includes(w.id)));
  let rows = $state<StockRow[] | null>(null);
  let vel = $state<VelocityRow[]>([]);
  const tab = currentTab();
  let wh = $state(qp('wh'));
  let q = $state(qp('q'));
  let level = $state(qp('level'));
  let ledger = $state<Awaited<ReturnType<typeof inventory.ledger>>>([]);
  let sel = $state<StockRow | null>(null);
  let dialog = $state<HTMLDialogElement>();
  async function load() { [rows, vel] = await Promise.all([inventory.stock(), analytics.velocity()]); }
  const w = watch(load);
  const t = analytics.thresholds;

  // docs/18: stock level from the shared stock risk (metrics.stockRisk): cover = cases on hand ÷ cases sold per day (30 days)
  const pace = $derived(MX.paceFromVelocity(vel));
  const cover = (x: StockRow) => { const p = pace(x); return p.perDay ? Math.round(x.closing / p.perDay) : 999; };
  const levelOf = (x: StockRow) => { const p = pace(x); const k = MX.stockRisk(x.closing, p.perDay, p.daysSinceSale); return k === 'out' ? 'Out of stock' : k === 'stock-out risk' || k === 'low' ? 'Low' : k === 'ok' ? 'OK' : 'Overstock'; };
  const levelTone = { 'Out of stock': 'danger', Low: 'danger', Overstock: 'warning', OK: 'success' } as const;

  const shown = $derived((rows ?? [])
    .filter((x) => (!scoped || scoped.includes(x.warehouseId)) && (!wh || x.warehouseId === wh) && (!level || levelOf(x) === level))
    .filter((x) => { const p = lookup.product(x.productId); return !q || `${p?.brand} ${p?.pack} ${p?.sku}`.toLowerCase().includes(q.toLowerCase()); })
    .sort((a, b) => a.warehouseId.localeCompare(b.warehouseId) || a.productId.localeCompare(b.productId)));
  const sum = (k: keyof StockRow) => shown.reduce((a, x) => a + (x[k] as number), 0);
  const fig = $derived(inventoryTiles(shown, vel, money));
  const value = $derived(fig.value ?? 0);
  const alerts = $derived(fig.attention);
  async function open(row: StockRow) { sel = row; ledger = await inventory.ledger(row.warehouseId, row.productId); dialog?.showModal(); }
  const cols: [keyof StockRow, string][] = [['opening', 'Opening'], ['received', 'Received'], ['transfersIn', 'Transfers in'], ['transfersOut', 'Transfers out'], ['damaged', 'Damaged'], ['adjustments', 'Adjustments'], ['sold', 'Sold'], ['closing', 'Closing']];
  const exportRows = () => [['Warehouse', 'SKU', 'Brand', 'Package', ...cols.map(([, l]) => l), 'In transit', 'Cover (days)', 'Level', ...(money ? ['Landed cost/case (USD)', 'Value (USD)'] : [])],
    ...shown.map((x) => { const p = lookup.product(x.productId)!; return [lookup.warehouse(x.warehouseId)!.name, p.sku, p.brand, p.pack, ...cols.map(([k]) => x[k] as number), x.inTransit, cover(x) >= 999 ? '' : cover(x), levelOf(x), ...(money ? [x.landedCostPerCase, Math.round(x.closing * x.landedCostPerCase * 100) / 100] : [])]; })];
</script>

<div class="page-head">
  <div><div class="overline crumb">Stock & sales</div><h1>Inventory</h1>
    <p class="muted small" style="max-width:560px;margin:var(--space-1) 0 0">Movements over the last 30 days. Stock posts only after delivery acknowledgement; in-transit cases are shown separately and are not in closing stock.</p></div>
  <ExportMenu name="inventory" rows={exportRows} />
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<PageTabs base="/inventory" current={tab} listLabel="Stock list" />

{#if tab === 'overview'}
  {#if !rows}<div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
  {:else if !rows.length}<div class="card empty">No stock recorded yet.</div>
  {:else}<InventoryOverview rows={rows.filter((x) => !scoped || scoped.includes(x.warehouseId))} {vel} {levelOf} {cover} thresholds={t} {money} />{/if}
{:else}
<div class="grid grid-kpi" style="margin-bottom:var(--space-4)">
  <div class="card kpi"><div class="overline">Cases on hand</div><div class="value">{fmtNum(fig.cases)}</div><div class="delta">closing stock</div></div>
  <div class="card kpi"><div class="overline">In transit</div><div class="value">{fmtNum(fig.transit)}</div><div class="delta">loaded, not yet acknowledged</div></div>
  {#if money}<div class="card kpi"><div class="overline">Stock value</div><div class="value">{fmtMoney(value)}</div><div class="delta">at landed cost per case</div></div>{/if}
  <button class="card kpi pick" class:on={level === 'Low' || level === 'Overstock'} onclick={() => (level = level ? '' : 'Low')}><div class="overline">Needs attention</div><div class="value" class:accent-text={alerts > 0}>{alerts}</div><div class="delta">out, under {MX.COVER_DAYS.low} d of cover, over {MX.COVER_DAYS.over} d or no sale in {MX.COVER_DAYS.noSaleDays} d</div></button>
</div>

<div class="filters">
  <label class="field"><span>Warehouse</span><select class="select" bind:value={wh}><option value="">All{scoped ? ' (my warehouses)' : ''}</option>{#each warehouses as w}<option value={w.id}>{destinationLabel(w.id)}</option>{/each}</select></label>
  <label class="field"><span>Stock level</span><select class="select" bind:value={level}><option value="">All</option><option>Low</option><option>Overstock</option><option>Out of stock</option><option>OK</option></select></label>
  <label class="field"><span>Search SKU</span><input class="input" type="search" bind:value={q} placeholder="Brand, package or SKU code" /></label>
  {#if wh || level || q}<button class="btn btn-ghost" onclick={() => { wh = ''; level = ''; q = ''; }}>Clear</button>{/if}
</div>

<div class="card flush table-wrap">
  <table class="table">
    <thead><tr><CompanyCell head /><th>Warehouse</th><th>Brand · Package</th>{#each cols as [, l]}<th class="num">{l}</th>{/each}<th class="num">In transit</th><th class="num">Cover</th><th>Level</th>{#if money}<th class="num">Landed / case (USD)</th><th class="num">Value (USD)</th>{/if}</tr></thead>
    <tbody>
      {#if !rows}{#each Array(4) as _}<tr><td colspan="15"><div class="skeleton"></div></td></tr>{/each}{/if}
      {#each shown as x (x.warehouseId + x.productId)}
        {@const lv = levelOf(x)}
        <tr class="clickable" onclick={() => open(x)} tabindex="0" onkeydown={(e) => e.key === 'Enter' && open(x)}>
          <CompanyCell entityId={x.entityId} />
          <td>{destinationLabel(x.warehouseId)}</td>
          <td><span style="white-space:nowrap">{lookup.product(x.productId)?.brand}</span> <span class="muted small" style="white-space:nowrap">{lookup.product(x.productId)?.pack}</span></td>
          {#each cols as [k]}<td class="num" class:accent-text={k === 'damaged' && x.damaged > 0} style:font-weight={k === 'closing' ? 700 : null}>{fmtNum(x[k] as number)}</td>{/each}
          <td class="num muted">{x.inTransit ? fmtNum(x.inTransit) : '—'}</td>
          <td class="num">{cover(x) >= 999 ? '—' : `${Math.max(0, cover(x))} d`}</td>
          <td><Badge tone={levelTone[lv]}>{lv}</Badge></td>
          {#if money}<td class="num">{fmtNum(x.landedCostPerCase, 2)}</td>
          <td class="num">{fmtNum(x.closing * x.landedCostPerCase, 2)}</td>{/if}
        </tr>
      {:else}{#if rows}<tr><td colspan="15" class="empty">No stock matches these filters</td></tr>{/if}{/each}
      {#if shown.length}
        <tr class="grand"><td colspan="2">Total</td>{#each cols as [k]}<td class="num">{fmtNum(sum(k))}</td>{/each}<td class="num">{fmtNum(sum('inTransit'))}</td><td></td><td></td>{#if money}<td></td><td class="num">{fmtNum(value, 2)}</td>{/if}</tr>
      {/if}
    </tbody>
  </table>
</div>
<p class="caption" style="margin-top:var(--space-2)">Click a row for the stock ledger. Cover = closing stock ÷ average daily sales (30 days). Transfers and stock take arrive in the follow-on release.</p>
{/if}

<dialog class="sheet" bind:this={dialog} style="width:min(720px,calc(100vw - 32px))">
  <div class="body stack">
    {#if sel}
      <div class="row between"><div><div class="overline">Stock ledger</div><h3>{lookup.product(sel.productId)?.brand} · {lookup.product(sel.productId)?.pack}</h3><div class="muted small">{destinationLabel(sel.warehouseId)} · closing {fmtNum(sel.closing)} cases · {fmtNum(sel.inTransit)} in transit</div></div><button class="btn btn-ghost" onclick={() => dialog?.close()}>Close</button></div>
      <div class="table-wrap" style="max-height:60vh;overflow:auto"><table class="table">
        <thead><tr><th>Date</th><th>Movement</th><th>Reference</th><th class="num">Cases</th></tr></thead>
        <tbody>
          {#each ledger as m}
            {@const sign = m.kind === 'received' || m.kind === 'transferIn' || m.kind === 'adjustment' ? 1 : -1}
            <tr><td class="small">{fmtDateTime(m.at)}</td><td style="text-transform:capitalize">{m.kind.replace(/([A-Z])/g, ' $1').toLowerCase()}</td><td class="mono small">{m.ref}</td><td class="num" class:accent-text={sign < 0}>{sign > 0 ? '+' : '−'}{fmtNum(m.qty)}</td></tr>
          {:else}<tr><td colspan="4" class="empty">No movements</td></tr>{/each}
        </tbody>
      </table></div>
      <p class="caption">Most recent 50 movements. Every movement carries its source document reference.</p>
    {/if}
  </div>
</dialog>

<style>
  .pick { text-align: left; cursor: pointer; font: inherit; color: inherit; }
  .pick.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .page-head p { font-family: var(--ff-body); }
</style>
