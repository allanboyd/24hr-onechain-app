<script lang="ts">
  // Management · Supplier balances on live data (V3-10 step 3c): money left with suppliers by short loads (mgmt-suppliers),
  // in the report's look. Credit notes, advance payments and pro-forma invoices are not recorded yet (step 4).
  import { dashboards, type DashResult } from '@btw/api';
  import type { MgmtSuppliers } from '@btw/api/dashboards';
  import { fmtDate } from '@btw/ui';
  import { DataTable, ts, type Column } from '../../components/page';
  import GroupedBars from '../../components/charts/GroupedBars.svelte';
  import { compact } from '../../components/charts/scale';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import { destinationLabel } from '../../lib/planning';
  import ReportFilters, { reportFilters, apiFilter } from './ReportFilters.svelte';

  const f = reportFilters();
  let res = $state<DashResult | null>(null);
  const w = watch(async () => { res = (await dashboards.get(['mgmt-suppliers'], apiFilter(f))).results['mgmt-suppliers'] ?? null; }, () => [f.values.wh, f.values.p]);
  const d = $derived(res?.data as MgmtSuppliers | undefined);
  const usd = (n: number | null | undefined) => (n == null ? '-' : `$${Math.round(n).toLocaleString('en-US')}`);
  const num = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));
  const whName = $derived(f.values.wh ? destinationLabel(f.values.wh) : 'Combined');
  type L = MgmtSuppliers['loads'][number];
  type S = MgmtSuppliers['statement'][number];
  const loadCols: Column<L>[] = [
    { key: 'at', label: 'Loaded', sortValue: (r) => ts(r.at), value: (r) => fmtDate(r.at), csv: (r) => r.at.slice(0, 10), class: 'small nowrap' },
    { key: 'po', label: 'Order', value: (r) => r.poRef, cell: poCell, class: 'mono small nowrap', sticky: true, mobile: 'title' },
    { key: 'supplier', label: 'Supplier', value: (r) => r.supplier, filter: 'select', filterValue: (r) => r.supplierId, filterLabel: (id) => d?.bySupplier.find((x) => x.supplierId === id)?.label ?? id },
    { key: 'brand', label: 'Brand', value: (r) => r.brand, filter: 'select', filterValue: (r) => r.productId, filterLabel: (id) => d?.loads.find((x) => x.productId === id)?.brand ?? id },
    { key: 'ordered', label: 'Ordered', align: 'right', sortValue: (r) => r.ordered, value: (r) => num(r.ordered) },
    { key: 'loaded', label: 'Loaded', align: 'right', sortValue: (r) => r.loaded, value: (r) => num(r.loaded) },
    { key: 'short', label: 'Short (cases)', align: 'right', sortValue: (r) => r.short, value: (r) => num(r.short), total: (l) => num(l.reduce((a, r) => a + r.short, 0)) },
    { key: 'value', label: 'Held by the supplier', align: 'right', filter: 'range', sortValue: (r) => r.value, value: (r) => usd(r.value), csv: (r) => r.value, total: (l) => usd(l.reduce((a, r) => a + r.value, 0)) },
  ];
  const stCols: Column<S>[] = [
    { key: 'at', label: 'Date', sortValue: (r) => ts(r.at), value: (r) => fmtDate(r.at), csv: (r) => r.at.slice(0, 10), class: 'small nowrap' },
    { key: 'supplier', label: 'Supplier', value: (r) => r.supplier, filter: 'select', filterValue: (r) => r.supplierId, filterLabel: (id) => d?.bySupplier.find((x) => x.supplierId === id)?.label ?? id },
    { key: 'what', label: 'What', value: (r) => `Short load ${r.poRef} · ${r.brand}` },
    { key: 'added', label: 'Added', align: 'right', sortValue: (r) => r.added, value: (r) => usd(r.added), csv: (r) => r.added },
    { key: 'used', label: 'Used', align: 'right', sortable: false, value: () => 'not recorded', csv: () => '', class: 'small muted' },
    { key: 'balance', label: 'Balance', align: 'right', sortValue: (r) => r.balance, value: (r) => usd(r.balance), csv: (r) => r.balance },
  ];
  let s1 = $state(''), f1 = $state({}), s2 = $state(''), f2 = $state({});
</script>

<section class="mrep" aria-labelledby="sp-h">
  <header><h1 id="sp-h">Supplier balances</h1><p class="muted">{whName} · {res?.period?.label ?? ''} · cash held = money left for cases not loaded</p></header>
  <ReportFilters {f} />
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if d}
    {@const k = d.kpis}
    <div class="kpis">
      <div class="card kpi"><span class="lbl">With suppliers in total</span><b class="val">{usd(k.held)}</b><span class="sub">cash held by short loads</span></div>
      <div class="card kpi"><span class="lbl">Added this period</span><b class="val">{usd(k.addedInPeriod)}</b><span class="sub">{num(k.shortCases)} cases loaded short</span></div>
      <div class="card kpi"><span class="lbl">Short loads</span><b class="val">{num(k.shortLoads)}</b><span class="sub">trucks loaded short this period</span></div>
      <div class="card kpi"><span class="lbl">Suppliers</span><b class="val">{num(k.suppliers)}</b><span class="sub">holding our money</span></div>
      <div class="card kpi"><span class="lbl">Credit notes</span><b class="val none">Not recorded yet</b><span class="sub">supplier promotions</span></div>
    </div>

    <div class="g2">
      <div class="card">
        <h3 class="ct">Money with suppliers by month<span class="chip">Now {usd(k.held)}</span></h3>
        <GroupedBars label="Cash held by suppliers: added each month and the total" categories={d.byMonth.map((x) => x.month)} series={[{ name: 'Added (short loads)', values: d.byMonth.map((x) => x.added) }, { name: 'Still with suppliers', values: d.byMonth.map((x) => x.total) }]} format={(n) => `$${compact(n)}`} gaps={false} height={260} />
      </div>
      <div class="card">
        <h3 class="ct">Money still with each supplier<span class="chip">Total {usd(k.held)}</span></h3>
        {#if d.bySupplier.length}
          {@const max = Math.max(...d.bySupplier.map((x) => x.held), 1)}
          <ol class="rank">
            {#each d.bySupplier as x (x.supplierId)}
              <li><span class="nm">{x.label}</span><span class="bar"><i style:width="{(x.held / max) * 100}%"></i></span><span class="v">{usd(x.held)}</span></li>
            {/each}
          </ol>
        {:else}<p class="muted">No short loads: no money left with suppliers.</p>{/if}
      </div>
    </div>

    <div class="g2">
      <div class="card">
        <h3 class="ct">Brands loaded short: cash held by the supplier (this period)<span class="chip">Total {usd(k.addedInPeriod)}</span></h3>
        {#if d.byBrand.length}<GroupedBars label="Value of cases loaded short by brand" categories={d.byBrand.slice(0, 10).map((x) => x.label)} series={[{ name: 'Held by the supplier', values: d.byBrand.slice(0, 10).map((x) => x.value) }]} format={(n) => `$${compact(n)}`} gaps={false} height={260} />
        {:else}<p class="muted">No short loads in this period.</p>{/if}
      </div>
      <div class="card">
        <h3 class="ct">Advance payments and pro-forma invoices<span class="chip">Not recorded yet</span></h3>
        <p class="muted">Credit notes (promotions), advance payments, pro-forma invoices and the later orders that use money held by a supplier are not recorded yet. Until they are, the balances above only grow with each short load.</p>
        <p class="small">Recording them is planned as a follow-up (V3-10 step 4).</p>
      </div>
    </div>

    <div class="card">
      <h3 class="ct">Short loads: PO vs loaded (cash held by the supplier)</h3>
      <DataTable id="mgmt-short-loads" label="Short loads" noun="short loads" rows={d.loads} columns={loadCols} rowKey={(r) => r.id} initialSort={{ key: 'at', dir: 'desc' }} filename="short-loads"
        searchable searchPlaceholder="Order, supplier, brand…" bind:search={s1} bind:filters={f1} maxHeight="420px" />
    </div>
    <div class="card">
      <h3 class="ct">Supplier account statement (every addition, with the running balance)</h3>
      <DataTable id="mgmt-supplier-statement" label="Supplier account statement" noun="entries" rows={d.statement} columns={stCols} rowKey={(r) => `${r.supplierId}:${r.at}:${r.poRef}:${r.brand}`} initialSort={{ key: 'at', dir: 'desc' }} filename="supplier-statement"
        searchable searchPlaceholder="Supplier, order, brand…" bind:search={s2} bind:filters={f2} maxHeight="420px" />
    </div>
    <p class="caption">{res?.definition}</p>
  {:else}
    <div class="kpis">{#each Array(5) as _}<div class="card kpi"><div class="skeleton" style="height:64px"></div></div>{/each}</div>
  {/if}
</section>

{#snippet poCell(r: L)}<a href="#/pos/{r.poId}">{r.poRef}</a>{/snippet}

<style>
  .mrep { display: flex; flex-direction: column; gap: 14px; }
  header h1 { font-size: 24px; line-height: 30px; } header p { margin: 2px 0 0; }
  .kpis { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); }
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 16px; }
  .kpi .lbl { font-size: 13px; color: var(--text-muted); }
  .kpi .val { font: 800 25px/1.25 var(--ff-display); font-variant-numeric: tabular-nums; margin: 2px 0 3px; }
  .kpi .val.none { font: 600 16px/1.6 var(--ff-body); color: var(--text-muted); }
  .kpi .sub { font-size: 12.5px; color: var(--text-muted); }
  .g2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .ct { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; }
  .chip { display: inline-flex; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--surface-sunken); color: var(--text-muted); }
  .rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .rank li { display: grid; grid-template-columns: minmax(0, 1.2fr) 1fr 100px; align-items: center; gap: 10px; font-size: 14px; }
  .rank .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rank .bar { height: 8px; border-radius: 8px; background: var(--surface-sunken); overflow: hidden; }
  .rank .bar i { display: block; height: 100%; border-radius: 8px; background: var(--primary); }
  .rank .v { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
</style>
