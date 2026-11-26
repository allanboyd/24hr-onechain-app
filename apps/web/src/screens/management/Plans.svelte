<script lang="ts">
  // Management · Plans and orders on live data (V3-10 step 2): the planned-vs-actual report (same as Live dashboards →
  // Purchasing), in the report's look: KPIs, planned vs PO issued by month, and by brand (DataTable with search + filters).
  import { dashboards, type DashResult } from '@btw/api';
  import type { MgmtPlans } from '@btw/api/dashboards';
  import { DataTable, readQuery, type Column } from '../../components/page';
  import GroupedBars from '../../components/charts/GroupedBars.svelte';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import ReportFilters, { reportFilters, apiFilter } from './ReportFilters.svelte';

  const f = reportFilters();
  if (!readQuery('p')) f.set('p', 'ytd'); // plans run over months: open on the year to date unless a period is chosen
  let res = $state<DashResult | null>(null);
  const w = watch(async () => { res = (await dashboards.get(['mgmt-plans'], apiFilter(f))).results['mgmt-plans'] ?? null; }, () => [f.values.wh, f.values.p]);
  const d = $derived(res?.data as MgmtPlans | undefined);
  const num = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));
  type B = MgmtPlans['byBrand'][number];
  const tone = (fl: B['flag']) => (fl === 'Behind plan' ? 'bad' : fl === 'Over plan' ? 'warn' : fl === 'Unplanned' ? '' : 'good');
  const columns: Column<B>[] = [
    { key: 'brand', label: 'Brand', sticky: true, value: (b) => b.label },
    { key: 'planned', label: 'Planned (cases)', align: 'right', sortValue: (b) => b.planned, value: (b) => num(b.planned), total: (l) => num(l.reduce((a, b) => a + b.planned, 0)) },
    { key: 'ordered', label: 'PO issued (cases)', align: 'right', sortValue: (b) => b.ordered, value: (b) => num(b.ordered), total: (l) => num(l.reduce((a, b) => a + b.ordered, 0)) },
    { key: 'used', label: 'Plan used', align: 'right', sortValue: (b) => b.usedPct, value: (b) => `${Math.round(b.usedPct)}%`, filter: 'range' },
    { key: 'flag', label: 'Status', value: (b) => b.flag, cell: flagCell, filter: 'select' },
  ];
  let search = $state(''), filters = $state({});
</script>

<section class="pl" aria-labelledby="pl-h">
  <header><h1 id="pl-h">Plans and orders</h1><p class="muted">{d?.range.label ?? ''} · cases</p></header>
  <ReportFilters {f} />
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if d}
    {@const m = d.measures}
    <div class="kpis">
      <div class="card kpi"><span class="lbl">Planned</span><b class="val">{num(m.planned)}</b><span class="sub">cases in the period plans</span></div>
      <div class="card kpi"><span class="lbl">PO issued</span><b class="val">{num(m.ordered)}</b><span class="sub">cases on purchase orders</span></div>
      <div class="card kpi"><span class="lbl">Plan used</span><b class="val">{Math.round(m.usedPct)}%</b><span class="sub">{m.variance >= 0 ? `${num(m.variance)} over plan` : `${num(-m.variance)} under plan`}</span></div>
      <div class="card kpi"><span class="lbl">Expected to date</span><b class="val">{num(m.expectedToDate)}</b><span class="sub">by the plans' monthly split</span></div>
      <div class="card kpi"><span class="lbl">Still to order</span><b class="val">{num(m.remaining)}</b><span class="sub">cases left in the plans</span></div>
    </div>
    <div class="card">
      <h3 class="ct">Planned vs PO issued by month (cases)<span class="chip">Planned {num(m.planned)} · PO issued {num(m.ordered)}</span></h3>
      {#if d.months.length}<GroupedBars label="Planned and PO issued by month, cases" categories={d.months.map((x) => x.month)} series={[{ name: 'Planned', values: d.months.map((x) => x.planned) }, { name: 'PO issued', values: d.months.map((x) => x.ordered) }]} unit="cases" />
      {:else}<p class="muted">No plans or orders in this period.</p>{/if}
    </div>
    <div class="card">
      <h3 class="ct">Planned vs PO issued, by brand</h3>
      <DataTable id="mgmt-plans-brands" label="Planned and PO issued by brand" noun="brands" rows={d.byBrand} {columns} rowKey={(b) => b.productId} initialSort={{ key: 'planned', dir: 'desc' }} filename="plans-by-brand"
        searchable searchPlaceholder="Brand" bind:search bind:filters maxHeight="420px" />
    </div>
    <p class="caption">{res?.definition}</p>
  {:else}
    <div class="kpis">{#each Array(5) as _}<div class="card kpi"><div class="skeleton" style="height:64px"></div></div>{/each}</div>
  {/if}
</section>

{#snippet flagCell(b: B)}<span class="chip {tone(b.flag)}">{b.flag}</span>{/snippet}

<style>
  .pl { display: flex; flex-direction: column; gap: 14px; }
  header h1 { font-size: 24px; line-height: 30px; } header p { margin: 2px 0 0; }
  .kpis { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); }
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 16px; }
  .kpi .lbl { font-size: 13px; color: var(--text-muted); }
  .kpi .val { font: 800 25px/1.25 var(--ff-display); font-variant-numeric: tabular-nums; margin: 2px 0 3px; }
  .kpi .sub { font-size: 12.5px; color: var(--text-muted); }
  .ct { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; }
  .chip { display: inline-flex; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--surface-sunken); color: var(--text-muted); }
  .chip.good { background: var(--success-subtle); color: var(--success); }
  .chip.bad { background: var(--danger-subtle); color: var(--danger); }
  .chip.warn { background: var(--warning-subtle); color: var(--warning); }
</style>
