<script lang="ts">
  // docs/14 B-02: warehouse inventory recorded at the warehouse (roles document §9) — stock received, damaged, short,
  // held and moved out per product, and the receiver's counts / adjustments (count difference, damaged write-off,
  // moved out other than a sale or re-export, found). Quantities only: receivers never see values or prices.
  import { lookup, ref, warehouse, type StockAdjustKind, type StockAdjustment, type User, type WarehouseStockRow } from '@btw/api';
  import { fmtDateTime, fmtNum, say } from '@btw/ui';
  import { ADJUST_KINDS, canRecordWarehouse, validateAdjust } from '@btw/api/money';
  import { DashboardPanel } from '../components/dashboard';
  import { attempt, watch } from '../lib/load.svelte';
  import { companyLabel } from '../lib/companies';
  import ErrorState from '../components/ErrorState.svelte';
  let { user }: { params?: any; user: User } = $props();

  const director = $derived(user.roles.some((r) => r === 'director' || r === 'admin'));
  const mine = $derived(ref().warehouses.filter((w) => director || user.warehouseIds.includes(w.id)));
  let warehouseId = $state(''); let days = $state(30); let q = $state('');
  $effect(() => { if (!warehouseId && mine.length) warehouseId = mine[0].id; });
  let rows = $state<WarehouseStockRow[] | null>(null);
  let adjs = $state<StockAdjustment[]>([]);
  const w = watch(async () => {
    if (!warehouseId) return;
    const from = new Date(Date.now() - days * 864e5).toISOString();
    [rows, adjs] = await Promise.all([warehouse.stock({ warehouseId, from }), warehouse.adjustments({ warehouseId })]);
  }, () => [warehouseId, days]);
  const name = (r: { productId: string }) => `${lookup.product(r.productId)?.brand ?? r.productId} · ${lookup.product(r.productId)?.pack ?? ''}`;
  const shown = $derived((rows ?? []).filter((r) => !q || name(r).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.held - a.held));
  const tot = $derived(shown.reduce((a, r) => ({ received: a.received + r.received + r.transfersIn, damaged: a.damaged + r.damaged, short: a.short + r.short, out: a.out + r.movedOut + r.transfersOut, sold: a.sold + r.sold, held: a.held + r.held }), { received: 0, damaged: 0, short: 0, out: 0, sold: 0, held: 0 }));

  let form = $state<{ row: WarehouseStockRow; kind: StockAdjustKind; qty: number | null; counted: number | null; note: string } | null>(null);
  let err = $state(''); let busy = $state(false);
  const canRecord = $derived(!!warehouseId && canRecordWarehouse(user, warehouseId));
  const preview = $derived(form ? (form.kind === 'count' ? (form.counted ?? form.row.held) - form.row.held : (ADJUST_KINDS.find((k) => k.kind === form!.kind)!.sign) * (form.qty ?? 0)) : 0);
  async function save() {
    if (!form) return;
    const input = { warehouseId, productId: form.row.productId, entityId: form.row.entityId, kind: form.kind, qty: form.qty ?? undefined, counted: form.counted ?? undefined, note: form.note || undefined };
    const p = validateAdjust(input); if (p.length) { err = p.join(' · '); return; }
    busy = true; err = await attempt(() => warehouse.adjust(input)); busy = false;
    if (!err) { say(`${ADJUST_KINDS.find((k) => k.kind === form!.kind)!.label} recorded`); form = null; }
  }
  const exportRows = () => [['Company', 'Product', 'Opening', 'Received', 'Transfers in', 'Damaged', 'Short', 'Moved out', 'Sent on / re-exported', 'Sold', 'Count differences', 'Held', 'Last count'],
    ...shown.map((r) => [companyLabel(r.entityId), name(r), r.opening, r.received, r.transfersIn, r.damaged, r.short, r.movedOut, r.transfersOut, r.sold, r.adjusted, r.held, r.lastCountAt?.slice(0, 10) ?? ''])];
</script>

<div class="page-head">
  <div><div class="overline crumb">Warehouse</div><h1>Warehouse stock</h1>
    <p class="muted small">Cases received, damaged, short, moved out and held at {lookup.warehouse(warehouseId)?.name ?? 'your warehouse'}, per company. Record a stock count or an adjustment with its reason — quantities only.</p></div>
</div>

<div class="filters">
  <label class="field"><span>Warehouse</span><select class="select" bind:value={warehouseId}>{#each mine as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
  <label class="field"><span>Movements over</span><select class="select" bind:value={days}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
  <label class="field"><span>Product</span><input class="input" type="search" bind:value={q} placeholder="Brand or pack" /></label>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if form}
  <section class="card form-card" aria-label="Record stock">
    <h2 class="h4">{name(form.row)} · {companyLabel(form.row.entityId)} <span class="caption">held now {fmtNum(form.row.held)} cases</span></h2>
    <div class="kinds" role="radiogroup" aria-label="What happened">
      {#each ADJUST_KINDS as k (k.kind)}<label class="chip" class:on={form.kind === k.kind}><input type="radio" name="kind" value={k.kind} bind:group={form.kind} />{k.label}</label>{/each}
    </div>
    <div class="form-grid">
      {#if form.kind === 'count'}
        <label class="field"><span>Cases counted</span><input class="input num" type="number" min="0" step="1" bind:value={form.counted} /></label>
      {:else}
        <label class="field"><span>Cases</span><input class="input num" type="number" min="1" step="1" bind:value={form.qty} /></label>
      {/if}
      <label class="field wide"><span>Note {form.kind === 'moved-out' ? '(where did they go?)' : form.kind === 'damaged' ? '(what happened?)' : '(optional)'}</span><input class="input" bind:value={form.note} maxlength="500" /></label>
    </div>
    <p class="small">Effect on stock held: <strong>{preview > 0 ? '+' : ''}{fmtNum(preview)}</strong> → {fmtNum(form.row.held + preview)} cases</p>
    {#if err}<p class="error small" role="alert">{err}</p>{/if}
    <div class="row"><button class="btn btn-primary" disabled={busy} onclick={save}>Record</button><button class="btn btn-ghost" onclick={() => (form = null)}>Cancel</button></div>
  </section>
{/if}

<DashboardPanel span="full" title="Stock by product" subtitle="received, damaged, short and moved out over the last {days} days; held now" unit="cases" period="Last {days} days" updatedAt={new Date().toISOString()}
  definition="Received and transfers in come from acknowledgements; short = expected − received on those acknowledgements; damaged includes write-offs; moved out = left other than a sale or re-export; sent on = re-exports and onward moves. Held = opening + in − out." loading={!rows && !w.error} rows={exportRows} filename="warehouse-stock">
  <div class="table-wrap" style="max-height:560px">
    <table class="table">
      <thead><tr><th>Product</th><th>Company</th><th class="num">Received</th><th class="num">Damaged</th><th class="num">Short</th><th class="num">Moved out</th><th class="num">Sent on</th><th class="num">Sold</th><th class="num">Count ±</th><th class="num">Held</th><th>Last count</th><th></th></tr></thead>
      <tbody>
        {#each shown as r (`${r.entityId}|${r.productId}`)}
          <tr>
            <td><strong>{name(r)}</strong></td><td class="small">{companyLabel(r.entityId)}</td>
            <td class="num">{fmtNum(r.received + r.transfersIn)}</td><td class="num">{r.damaged ? fmtNum(r.damaged) : '—'}</td><td class="num">{r.short ? fmtNum(r.short) : '—'}</td>
            <td class="num">{r.movedOut ? fmtNum(r.movedOut) : '—'}</td><td class="num">{r.transfersOut ? fmtNum(r.transfersOut) : '—'}</td><td class="num">{fmtNum(r.sold)}</td>
            <td class="num">{r.adjusted ? (r.adjusted > 0 ? '+' : '') + fmtNum(r.adjusted) : '—'}</td><td class="num"><strong>{fmtNum(r.held)}</strong></td>
            <td class="small">{r.lastCountAt ? r.lastCountAt.slice(0, 10) : '—'}</td>
            <td>{#if canRecord}<button class="btn btn-secondary btn-sm" onclick={() => { form = { row: r, kind: 'count', qty: null, counted: r.held, note: '' }; err = ''; }}>Count / adjust</button>{/if}</td>
          </tr>
        {/each}
      </tbody>
      {#if shown.length > 1}<tfoot><tr><th colspan="2">Total</th><th class="num">{fmtNum(tot.received)}</th><th class="num">{fmtNum(tot.damaged)}</th><th class="num">{fmtNum(tot.short)}</th><th class="num" colspan="2">{fmtNum(tot.out)}</th><th class="num">{fmtNum(tot.sold)}</th><th></th><th class="num">{fmtNum(tot.held)}</th><th colspan="2"></th></tr></tfoot>{/if}
    </table>
  </div>
</DashboardPanel>

<DashboardPanel title="Counts and adjustments" subtitle="recorded at this warehouse, newest first" unit="cases" rows={() => [['When', 'Product', 'Company', 'What', 'Cases', 'Note', 'By'], ...adjs.map((a) => [a.at, name(a), companyLabel(a.entityId), a.reason, a.qty, a.note ?? '', lookup.user(a.byUserId ?? '')?.name ?? ''])]} filename="stock-adjustments" emptyText="No counts or adjustments yet">
  <ul class="adj">
    {#each adjs.slice(0, 40) as a (a.at + a.productId + a.reason)}
      <li><span class="grow"><strong>{a.reason}</strong> · {name(a)} <span class="caption">{companyLabel(a.entityId)}</span>{#if a.note}<div class="caption">{a.note}</div>{/if}</span>
        <span class="num" class:neg={a.qty < 0}>{a.qty > 0 ? '+' : ''}{fmtNum(a.qty)}</span><span class="caption">{fmtDateTime(a.at)} · {lookup.user(a.byUserId ?? '')?.name ?? ''}</span></li>
    {/each}
  </ul>
</DashboardPanel>

<style>
  .form-card { margin-bottom: var(--space-4); display: grid; gap: var(--space-3); }
  .kinds { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 14px; }
  .chip.on { border-color: var(--primary); background: var(--surface-sunken); font-weight: 600; }
  .chip input { accent-color: var(--primary); }
  .wide { grid-column: span 2; }
  .error { color: var(--danger); }
  .adj { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .adj li { display: flex; gap: var(--space-3); align-items: baseline; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  .neg { color: var(--danger); }
  :global(.dash-panel) + :global(.dash-panel) { margin-top: var(--space-4); }
  @media (max-width: 640px) { .wide { grid-column: auto; } }
</style>
