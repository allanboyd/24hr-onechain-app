<script lang="ts">
  // Reports-lite: sales by month (vs last year), on-time deliveries, period plan used (planned vs ordered).
  // The full reports (filters, exports, tables) stay in the web app.
  import { lookup, type User } from '@btw/api';
  import { reportsApi } from '../reports';
  import { can } from '../access';
  import { Res, onRefresh, settle } from '../load.svelte';
  import { pct, usd, num } from '../fmt';
  import BarChart from '../components/BarChart.svelte';
  import Meter from '../components/Meter.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import WebButton from '../components/WebButton.svelte';
  import type { View } from '../routes';
  let { user }: { user: User; view: View; query: URLSearchParams } = $props();
  const now = Date.now();
  const d0 = new Date(now); const from = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - 11, 1)).toISOString();
  const r = new Res(async () => {
    const reports = await reportsApi();
    const [sales, logi, pva] = await Promise.all([
      settle(reports.sales({ from, to: new Date(now).toISOString(), groupBy: 'month' }), null),
      can(user, 'reports') ? settle(reports.logistics(reports.resolvePeriod('last-12m', now)), null) : null,
      can(user, 'planned-vs-actual') ? settle(reports.plannedVsActual({}), null) : null,
    ]);
    if (!sales && !logi && !pva) throw new Error('Could not load the reports. Check your connection.');
    return { sales, logi, pva };
  });
  $effect(() => r.live(120_000));
  $effect(() => onRefresh(() => r.reload()));
  const mon = (label: string) => label.split(' ')[0].slice(0, 3);
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="card" /><Skeleton kind="card" />
{:else if r.data}
  {@const { sales, logi, pva } = r.data}
  {#if sales}
    <section class="t-card">
      <h3>Sales by month</h3>
      <p class="t-meta">Revenue, last 12 months · grey = same month last year</p>
      <BarChart label="Sales by month" labels={sales.series.map((s) => mon(s.label))} values={sales.series.map((s) => s.revenue)} compare={sales.series.map((s) => s.lyRevenue)} format={usd} />
      <div class="facts">
        <span><b>{usd(sales.totals.revenue)}</b><span class="t-meta">12 months</span></span>
        <span><b>{num(sales.totals.cases)}</b><span class="t-meta">cases</span></span>
        {#if sales.byBrand[0]}<span><b>{sales.byBrand[0].brand}</b><span class="t-meta">top brand</span></span>{/if}
      </div>
    </section>
  {/if}
  {#if logi}
    <section class="t-card">
      <h3>On-time deliveries</h3>
      <p class="t-meta">{logi.onTimePct == null ? 'No deliveries yet' : `${pct(logi.onTimePct)} on time over 12 months · ${num(logi.delivered)} delivered`}</p>
      <BarChart label="On-time deliveries by period" labels={logi.trend.map((t) => mon(t.label))} values={logi.trend.map((t) => (t.onTimePct == null ? null : t.onTimePct * 100))} max={100} format={(v) => `${Math.round(v)}%`} tone="var(--success)" />
      {#if logi.avgTransitDays != null}<p class="t-meta">Average transit {logi.avgTransitDays.toFixed(1)} days{logi.damagePct != null ? ` · ${pct(logi.damagePct, 1)} damaged` : ''}</p>{/if}
    </section>
  {/if}
  {#if pva}
    <section class="t-card">
      <h3>Plan used</h3>
      <p class="t-meta">{pva.range.label} · ordered against the period plans</p>
      <div class="ring-row">
        <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="{Math.round(pva.measures.usedPct)}% of the plan ordered">
          <circle cx="60" cy="60" r="50" class="trk" />
          <circle cx="60" cy="60" r="50" class="val" stroke-dasharray="{Math.min(100, pva.measures.usedPct) * 3.1416} 400" />
          <text x="60" y="66">{Math.round(pva.measures.usedPct)}%</text>
        </svg>
        <dl class="t-kv grow">
          <dt>Planned</dt><dd>{num(pva.measures.planned)}</dd>
          <dt>Ordered</dt><dd>{num(pva.measures.ordered)}</dd>
          <dt>Expected by now</dt><dd>{num(Math.round(pva.measures.expectedToDate))}</dd>
          <dt>Remaining</dt><dd>{num(pva.measures.remaining)}</dd>
        </dl>
      </div>
      <div class="brands">
        {#each pva.byBrand.slice(0, 6) as b (b.productId)}
          {@const p = lookup.product(b.productId)}
          <div><div class="t-row between"><span><b>{p?.brand ?? b.productId}</b> <span class="t-meta">{p?.pack}</span></span><span class="t-meta">{b.flag}</span></div><Meter value={b.ordered} max={b.planned} label="{p?.brand} used" /></div>
        {/each}
      </div>
    </section>
  {/if}
  <WebButton path="/dashboards/sales" label="All analysis in web app" />
{/if}

<style>
  section { display: flex; flex-direction: column; gap: 8px; }
  h3 { font: 700 18px var(--ff-display); margin: 0; }
  .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 4px; }
  .facts span { display: flex; flex-direction: column; min-width: 0; }
  .facts b { font: 700 16px var(--ff-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ring-row { display: flex; align-items: center; gap: 16px; }
  .ring { width: 116px; height: 116px; flex: none; transform: rotate(-90deg); }
  .ring circle { fill: none; stroke-width: 12; }
  .trk { stroke: var(--surface-sunken); }
  .val { stroke: var(--t-accent); stroke-linecap: round; }
  .ring text { transform: rotate(90deg); transform-origin: 60px 60px; font: 800 22px var(--ff-display); fill: var(--text); text-anchor: middle; }
  .grow { flex: 1; }
  .brands { display: flex; flex-direction: column; gap: 12px; margin-top: 6px; }
</style>
