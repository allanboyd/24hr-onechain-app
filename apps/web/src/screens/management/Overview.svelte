<script lang="ts">
  // Management · Overview on live data (V3-10 step 1b). Same look and indicators as the directors' report
  // (docs/design-v3/reference/management-room-report.html), numbers from GET /v1/dashboards?keys=mgmt-overview, i.e. the
  // same builders as Live dashboards (packages/api/src/dashboards.ts mgmtOverview; parity checked in dashboards.test.ts).
  import { dashboards, type DashResult } from '@btw/api';
  import type { MgmtOverview } from '@btw/api/dashboards';
  import ReportFilters, { reportFilters, apiFilter } from './ReportFilters.svelte';
  import { Donut } from '../../components/charts';
  import Waterfall from '../../components/charts/Waterfall.svelte';
  import GroupedBars from '../../components/charts/GroupedBars.svelte';
  import SparkArea from '../../components/charts/SparkArea.svelte';
  import { compact } from '../../components/charts/scale';
  import { PERIODS } from '../dash/period';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { destinationLabel } from '../../lib/planning';

  const f = reportFilters();
  let res = $state<DashResult | null>(null);
  const w = watch(async () => {
    const r = await dashboards.get(['mgmt-overview'], apiFilter(f));
    res = r.results['mgmt-overview'] ?? null;
  }, () => [f.values.wh, f.values.p]);
  const d = $derived(res?.data as MgmtOverview | undefined);
  const usd = (n: number | null | undefined) => (n == null ? '-' : `$${Math.round(n).toLocaleString('en-US')}`);
  const pct = (n: number | null | undefined, dp = 1) => (n == null ? '-' : `${(n * 100).toFixed(dp)}%`);
  const num = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));
  function delta(v: number | null, p: number | null, pts = false) {
    if (v == null || p == null || (!pts && !p)) return null;
    const x = pts ? (v - p) * 100 : ((v - p) / Math.abs(p)) * 100;
    return { up: x >= 0, text: pts ? `${Math.abs(x).toFixed(1)} pts` : `${Math.abs(Math.round(x))}%` };
  }
  const whName = $derived(f.values.wh ? destinationLabel(f.values.wh) : 'Combined');
  const periodLabel = $derived(res?.period?.label ?? PERIODS.find((x) => x.key === f.values.p)?.label ?? '');
  const kept = $derived(d?.kpis.margin.value ?? null);
</script>

<section class="ov" aria-labelledby="ov-h">
  <header class="hd">
    <h1 id="ov-h">Overview</h1>
    <p class="muted">{whName} · all brands · {periodLabel}</p>
  </header>
  <ReportFilters {f} />
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

  {#if !d}
    <div class="kpis">{#each Array(6) as _}<div class="card kpi"><div class="skeleton" style="height:64px"></div></div>{/each}</div>
  {:else}
    {@const k = d.kpis}
    <div class="kpis">
      {#snippet kpi(label: string, value: string, dl: ReturnType<typeof delta>, sub: string, spark: (number | null)[] | null)}
        <div class="card kpi">
          <span class="lbl">{label}</span>
          <b class="val">{value}</b>
          <span class="sub">{#if dl}<span class="chip {dl.up ? 'good' : 'bad'}">{dl.up ? '▲' : '▼'} {dl.text}</span>{/if} {sub}</span>
          {#if spark}<div class="spark"><SparkArea values={spark} height={30} /></div>{/if}
        </div>
      {/snippet}
      {@render kpi('Revenue', usd(k.revenue.value), delta(k.revenue.value, k.revenue.prev), 'vs previous period', k.revenue.spark)}
      {@render kpi('Profit', usd(k.profit.value), delta(k.profit.value, k.profit.prev), 'vs previous period', k.profit.spark)}
      {@render kpi('Profit margin', pct(k.margin.value), delta(k.margin.value, k.margin.prev, true), `· minimum ${pct(d.targetMargin, 0)}`, k.margin.spark)}
      {@render kpi('Cases sold', num(k.cases.value), delta(k.cases.value, k.cases.prev), k.cases.top ? `· ${k.cases.top}` : '', k.cases.spark)}
      <div class="card kpi"><span class="lbl">Landed cost</span><b class="val">{usd(k.landed.value)}</b><span class="sub">PO to offloading · warehouse expenses {usd(k.landed.warehouse)}</span></div>
      <div class="card kpi"><span class="lbl">Items flagged</span><b class="val">{num(k.flagged.count)}</b><span class="sub">{num(k.flagged.urgent)} urgent</span></div>
    </div>

    <div class="card">
      <h3 class="ct">How the company makes profit{#if kept !== null}<span class="chip good">{pct(kept)} of sales kept as profit</span>{/if}</h3>
      {#if d.waterfall.length}<Waterfall label="How the company makes profit, from sales to profit" steps={d.waterfall.map((s) => ({ label: s.label === 'Revenue' ? 'Sales' : s.label === 'Truck' ? 'Transport' : s.label, value: s.value, kind: s.kind }))} format={(n) => `$${compact(n)}`} />
      {:else}<p class="muted">No sales in this period.</p>{/if}
    </div>

    <div class="g2">
      <div class="card">
        <h3 class="ct">Act on these first<span class="chip bad">{d.decisions.filter((x) => (x.count ?? 0) > 0).length} items</span></h3>
        <ul class="acts">
          {#each d.decisions.filter((x) => (x.count ?? 0) > 0) as x (x.key)}
            <li class="sev-{x.severity}"><i aria-hidden="true"></i><div class="grow"><b>{x.label}</b><span>{x.detail}</span></div><span class="n">{x.count}</span><a href={x.href} aria-label="Open: {x.label}"><ArrowRight size={16} /></a></li>
          {:else}<li class="muted">Nothing needs action now.</li>{/each}
        </ul>
      </div>
      <div class="card">
        <h3 class="ct">Where each $100 of sales went</h3>
        {#if d.per100.length}<Donut label="Where each 100 dollars of sales went" data={d.per100.map((x) => ({ label: x.label, value: x.value }))} format={(n) => `$${n.toFixed(0)}`} center="$100" height={240} />
        {:else}<p class="muted">No sales in this period.</p>{/if}
      </div>
    </div>

    <div class="card">
      <h3 class="ct">Sales and profit by month<span class="chip">Total sales {usd(d.byMonth.reduce((a, x) => a + x.sales, 0))}</span></h3>
      <GroupedBars label="Sales and profit by month" categories={d.byMonth.map((x) => x.month)} series={[{ name: 'Sales', values: d.byMonth.map((x) => x.sales) }, { name: 'Profit', values: d.byMonth.map((x) => x.profit) }]} format={(n) => `$${compact(n)}`} gaps={false} />
    </div>

    <div class="g2">
      <div class="card">
        <h3 class="ct">Sales and profit by warehouse</h3>
        {#if d.byWarehouse.length}<GroupedBars label="Sales and profit by warehouse" categories={d.byWarehouse.map((x) => x.label)} series={[{ name: 'Sales', values: d.byWarehouse.map((x) => x.sales) }, { name: 'Profit', values: d.byWarehouse.map((x) => x.profit) }]} format={(n) => `$${compact(n)}`} gaps={false} height={260} />
        {:else}<p class="muted">No sales in this period.</p>{/if}
      </div>
      <div class="card">
        <h3 class="ct">Best and weakest brands by margin</h3>
        <div class="brands">
          <div><h4>Best</h4><ol>{#each d.brands.best as b (b.label)}<li><span class="grow">{b.label}</span><span class="chip good">{pct(b.margin)}</span></li>{/each}</ol></div>
          <div><h4>Weakest</h4><ol>{#each d.brands.weakest as b (b.label)}<li><span class="grow">{b.label}</span><span class="chip {b.margin < d.targetMargin ? 'bad' : ''}">{pct(b.margin)}</span></li>{/each}</ol></div>
        </div>
      </div>
    </div>
    <p class="caption">{res?.definition}</p>
  {/if}
</section>

<style>
  .ov { display: flex; flex-direction: column; gap: 14px; }
  .hd h1 { font-size: 24px; line-height: 30px; }
  .hd p { margin: 2px 0 0; }
  .kpis { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); }
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 16px; }
  .kpi .lbl { font-size: 13px; color: var(--text-muted); }
  .kpi .val { font: 800 25px/1.25 var(--ff-display); font-variant-numeric: tabular-nums; margin: 2px 0 3px; }
  .kpi .sub { font-size: 12.5px; color: var(--text-muted); }
  .kpi .spark { margin-top: 6px; }
  .ct { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; }
  .chip { display: inline-flex; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--surface-sunken); color: var(--text-muted); }
  .chip.good { background: var(--success-subtle); color: var(--success); }
  .chip.bad { background: var(--danger-subtle); color: var(--danger); }
  .g2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .acts { list-style: none; margin: 0; padding: 0; }
  .acts li { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid var(--border); }
  .acts li:first-child { border-top: 0; }
  .acts i { width: 4px; align-self: stretch; border-radius: 4px; background: var(--text-subtle); flex: none; }
  .acts .sev-critical i, .acts .sev-high i { background: var(--danger); }
  .acts .sev-medium i { background: var(--warning-solid); }
  .acts b { display: block; } .acts span { color: var(--text-muted); font-size: 12.5px; }
  .acts .n { font: 700 15px/1 var(--ff-body); color: var(--text); font-variant-numeric: tabular-nums; }
  .brands { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .brands h4 { font-size: 13px; color: var(--text-muted); margin-bottom: 6px; }
  .brands ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .brands li { display: flex; align-items: center; gap: 8px; font-size: 14px; }
</style>
