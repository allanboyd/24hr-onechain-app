<script lang="ts">
  // Directors' My dashboards = Today (docs/15, docs/21): KPIs first, Decisions beside graphs, Money owed split charts.
  // Filter icon opens a modal. Chart|table on cards. No top products / distribution on the default desk.
  import { dashboards, type DashFilter, type DashResponse, type DashResult } from '@btw/api';
  import type { TodayData, TodayDecision } from '@btw/api/dashboards';
  import { watch } from '../../../lib/load.svelte';
  import ErrorState from '../../../components/ErrorState.svelte';
  import SparkArea from '../../../components/charts/SparkArea.svelte';
  import SmoothTrend from '../../../components/charts/SmoothTrend.svelte';
  import RingDonut from '../../../components/charts/RingDonut.svelte';
  import { BarChart } from '../../../components/charts';
  import { compact } from '../../../components/charts/scale';
  import { currency, cv, cvRow, pctF } from '../fmt.svelte';
  import TodayCard from './TodayCard.svelte';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import HandCoins from '@lucide/svelte/icons/hand-coins';
  import Truck from '@lucide/svelte/icons/truck';
  import Banknote from '@lucide/svelte/icons/banknote';
  import Package from '@lucide/svelte/icons/package';
  import Inbox from '@lucide/svelte/icons/inbox';
  import Tag from '@lucide/svelte/icons/tag';

  let { filter, onload }: { filter: DashFilter; onload?: (options: DashResponse['options']) => void } = $props();

  let res = $state<DashResult<TodayData> | null>(null);
  const w = watch(async () => {
    const r = await dashboards.get(['director-today'], filter);
    res = (r.results['director-today'] as DashResult<TodayData>) ?? null;
    onload?.(r.options);
  }, () => JSON.stringify(filter));
  const d = $derived(res?.data ?? null);

  const amount = (usd: number) => compact(cv(usd));
  const cmp1 = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const axisFmt = (n: number) => cmp1.format(n);
  const moneyTxt = (usd: number | null | undefined) => (usd == null ? 'No data yet' : `${currency.code} ${amount(usd)}`);
  const dayFmt = (iso: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
  function change(v: number | null, p: number | null) {
    if (v == null || p == null || !p) return null;
    return (v - p) / Math.abs(p);
  }
  const prevText = $derived(d ? (d.mtd ? 'vs same days last month' : `vs ${d.prev.label}`) : '');

  let hideSales = $state(false), hideProfit = $state(false);
  const chart = $derived.by(() => {
    if (!d) return { labels: [] as string[], sales: [] as (number | null)[], profit: [] as (number | null)[] };
    const inRange = d.daily.filter((x) => (!filter.from || x.day >= filter.from.slice(0, 10)) && (!filter.to || x.day <= filter.to.slice(0, 10)));
    const xs = inRange.length ? inRange : d.daily;
    return { labels: xs.map((x) => x.day), sales: xs.map((x) => (x.sales == null ? null : cv(x.sales))), profit: xs.map((x) => (x.profit == null ? null : cv(x.profit))) };
  });
  const chartRows = () => [['Day', `Sales (${currency.code})`, `Profit (${currency.code})`], ...chart.labels.map((l, i) => [l, chart.sales[i] == null ? '' : Math.round(chart.sales[i]! * 100) / 100, chart.profit[i] == null ? '' : Math.round(chart.profit[i]! * 100) / 100])];
  const chartTotal = $derived({ sales: chart.sales.reduce((a: number, v) => a + (v ?? 0), 0), profit: chart.profit.reduce((a: number, v) => a + (v ?? 0), 0) });
  const sparkSales = $derived(chart.sales.map((v) => v ?? 0).slice(-7));

  const ICON: Record<TodayDecision['key'], typeof Truck> = { approvals: HandCoins, trucks: Truck, fees: Banknote, stock: Package, acks: Inbox, prices: Tag };
  const open = $derived((d?.decisions ?? []).filter((x) => (x.count ?? 0) > 0));
  const clear = $derived((d?.decisions ?? []).filter((x) => !(x.count ?? 0)));
  const decRows = () => [['Decision', 'Count', `Value (${currency.code})`, 'Detail', 'Owner', 'Link'], ...(d?.decisions ?? []).map((x) => [x.label, x.count ?? 'No data yet', cvRow(x.value), x.detail, x.owner, x.href])];

  const BAND_COLOR: Record<string, string> = { risk: 'var(--danger)', low: 'var(--warning-solid)', healthy: 'var(--success)', over: 'var(--viz-other)', nosales: 'var(--border-strong)' };
  const BAND_SHORT: Record<string, string> = { risk: 'At risk', low: 'Low', healthy: 'Healthy', over: 'Overstocked', nosales: 'No sales' };
  const bandRange = (k: string) => (!d ? '' : k === 'risk' ? '≤ 7 d' : k === 'low' ? `8-${d.cover.min} d` : k === 'healthy' ? `${d.cover.min + 1}-${d.cover.max} d` : k === 'over' ? `> ${d.cover.max} d` : '30 d');
  const stockRows = () => [['Band', 'Cases', 'Products', `Value (${currency.code})`], ...(d?.stock?.bands ?? []).map((b) => [b.label, b.cases, b.products, cvRow(b.value)])];
  const stockAtRiskPct = $derived.by(() => {
    if (!d?.stock?.cases) return null;
    const risk = d.stock.bands.find((b) => b.key === 'risk');
    return risk ? Math.round((risk.cases / d.stock.cases) * 100) : 0;
  });

  const sc = $derived(d ? change(d.sales.value, d.sales.prev) : null);
  const pc = $derived(d ? change(d.profit.value, d.profit.prev) : null);
  const mpp = $derived(d && d.profit.margin != null && d.profit.prevMargin != null ? (d.profit.margin - d.profit.prevMargin) * 100 : null);
  const td = $derived(d && d.trucks.value != null && d.trucks.prev != null ? d.trucks.value - d.trucks.prev : null);
  type Rag = 'good' | 'warn' | 'bad' | 'none';
  const ragSales = $derived<Rag>(sc == null ? 'none' : sc >= 0 ? 'good' : 'bad');
  const ragProfit = $derived<Rag>(!d || d.profit.margin == null ? 'none' : d.profit.margin >= d.targetMargin ? 'good' : d.profit.margin >= d.targetMargin * 0.8 ? 'warn' : 'bad');
  const ragCash = $derived<Rag>(!d || d.cash.value == null ? 'none' : !d.cash.overdue ? 'good' : d.cash.overdue / d.cash.value > 0.25 ? 'bad' : 'warn');
  const ragTrucks = $derived<Rag>(!d || d.trucks.value == null ? 'none' : d.trucks.delayed ? 'bad' : d.trucks.onTimeWeek != null && d.trucks.onTimeWeek < 0.9 ? 'warn' : 'good');
  const ragStock = $derived<Rag>(stockAtRiskPct == null ? 'none' : stockAtRiskPct >= 10 ? 'bad' : stockAtRiskPct > 0 ? 'warn' : 'good');
  const ragMargin = $derived(ragProfit);
  const ageTotal = $derived(d ? d.owed.bands.reduce((a, b) => a + b.value, 0) : 0);
  const owedRows = () => [['Customer', `Balance (${currency.code})`], ...(d?.owed.top ?? []).map((x) => [x.customer, cvRow(x.value)])];
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if !d && w.loading}
  <div class="kpis sk">{#each Array(6) as _}<div class="kpi"><div class="skeleton" style="width:50%"></div><div class="skeleton" style="height:28px;width:70%;margin-top:12px"></div></div>{/each}</div>
{:else if d}
  <!-- KPI: Sales hero + five side metrics -->
  <div class="kpis" class:busy={w.loading}>
    <a class="kpi hero rag-{ragSales}" href="#/dashboards/sales" title={res?.definition}>
      <header>
        <span class="lbl">Sales</span>
        {#if sc != null && sc < 0}<span class="chip down">Down</span>{:else if sc != null}<span class="chip up">Up</span>{/if}
      </header>
      <span class="val">{#if d.sales.value == null}No data yet{:else}<small>{currency.code}</small> {amount(d.sales.value)}{/if}</span>
      <span class="chg">
        {#if sc != null}<span class="chip {sc >= 0 ? 'up' : 'down'}">{#if sc >= 0}<ArrowUpRight size={13} />{:else}<ArrowDownRight size={13} />{/if}{Math.abs(sc * 100).toFixed(1)}%</span>{/if}
        <span class="sub">{sc != null ? prevText : 'This period'}</span>
      </span>
      <span class="spk {ragSales}"><SparkArea values={sparkSales.length ? sparkSales : d.sales.spark} height={32} /></span>
    </a>

    <a class="kpi side rag-{ragProfit}" href="#/performance">
      <span class="lbl">Profit</span>
      <span class="val sm">{#if d.profit.value == null}No data yet{:else}<small>{currency.code}</small> {amount(d.profit.value)}{/if}</span>
      <span class="sub">{d.profit.estimated ? 'Part estimated' : 'Landed cost'}{#if pc != null} · {pc >= 0 ? '+' : ''}{(pc * 100).toFixed(1)}%{/if}</span>
    </a>
    <a class="kpi side rag-{ragCash}" href="#/sales?show=owed">
      <span class="lbl">Cash to collect</span>
      <span class="val sm">{#if d.cash.value == null}No data yet{:else}<small>{currency.code}</small> {amount(d.cash.value)}{/if}</span>
      <span class="sub">{#if d.cash.overdue}{currency.code} {amount(d.cash.overdue)} overdue{:else if d.cash.value != null}Nothing overdue{:else}No open balances{/if}</span>
    </a>
    <a class="kpi side rag-{ragTrucks}" href="#/dashboards/fleet">
      <span class="lbl">Trucks on the road</span>
      <span class="val sm">{d.trucks.value ?? 'No data yet'}{#if td != null}<small class="delta">{td >= 0 ? '+' : ''}{td}</small>{/if}</span>
      <span class="sub">{d.trucks.delayed ? `${d.trucks.delayed} delayed` : 'None delayed'} · {d.trucks.arrivingToday} today</span>
    </a>
    <a class="kpi side rag-{ragStock}" href="#/dashboards/warehouse">
      <span class="lbl">Stock at risk</span>
      <span class="val sm">{stockAtRiskPct == null ? 'No data yet' : `${stockAtRiskPct}%`}</span>
      <span class="sub">≤7 days cover</span>
    </a>
    <a class="kpi side wide rag-{ragMargin}" href="#/performance">
      <span class="lbl">Margin</span>
      <span class="val sm">{pctF(d.profit.margin)}</span>
      <span class="sub">{d.profit.margin != null && d.profit.margin < d.targetMargin ? `Below ${pctF(d.targetMargin)}` : `Target ${pctF(d.targetMargin)}`}{#if mpp != null} · {mpp >= 0 ? '+' : ''}{mpp.toFixed(1)} pp{/if}</span>
    </a>
  </div>

  <!-- Decisions | Sales | Stock -->
  <div class="main" class:busy={w.loading}>
    <div class="slot o-dec">
      <TodayCard title="Decisions" tone="primary" definition="Things only a director can unblock, most urgent first." caption="{open.length ? `${open.length} open` : 'All clear'} · owner on each row" updatedAt={res?.freshness ?? null} rows={decRows} filename="decisions-today" viewToggle>
        {#snippet tableView()}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Decision</th><th class="num">Count</th><th>Owner</th></tr></thead>
            <tbody>{#each d.decisions as x}<tr><td>{x.label}</td><td class="num">{x.count ?? '-'}</td><td>{x.owner}</td></tr>{/each}</tbody>
          </table></div>
        {/snippet}
        {#if open.length}
          <ul class="dec">
            {#each open as x (x.key)}
              {@const Icon = ICON[x.key]}
              <li><a href={x.href}>
                <span class="ic sev-{x.severity}"><Icon size={16} aria-hidden="true" /></span>
                <span class="tx"><b>{x.label}</b><span>{x.detail} · <span class="own">{x.owner}</span></span></span>
                <span class="ct"><b>{x.count}</b></span>
                <ChevronRight size={15} class="chev" aria-hidden="true" />
              </a></li>
            {/each}
          </ul>
        {:else}
          <p class="allclear"><CircleCheck size={18} aria-hidden="true" />Nothing waiting for a decision.</p>
        {/if}
        {#if clear.length}
          <details class="clear"><summary>{clear.length} more all clear</summary>
            <ul>{#each clear as x (x.key)}<li><a href={x.href}>{x.label}<span>{x.count == null ? 'No data yet' : x.detail}</span></a></li>{/each}</ul>
          </details>
        {/if}
      </TodayCard>
    </div>

    <div class="slot o-chart">
      <TodayCard title="Sales and profit" caption="{currency.code} · total {compact(chartTotal.sales)} sales, {compact(chartTotal.profit)} profit" updatedAt={res?.freshness ?? null} rows={chartRows} filename="sales-and-profit" empty={!chart.sales.some((v) => v != null)} viewToggle>
        {#snippet actions()}
          <div class="legend" role="group" aria-label="Show or hide a line">
            <button class="lg" aria-pressed={!hideSales} onclick={() => (hideSales = !hideSales)}><i style="background:var(--t-sales)"></i>Sales</button>
            <button class="lg" aria-pressed={!hideProfit} onclick={() => (hideProfit = !hideProfit)}><i style="background:var(--t-profit)"></i>Profit</button>
          </div>
        {/snippet}
        <SmoothTrend label="Sales and profit" labels={chart.labels}
          series={[{ name: 'Sales', values: chart.sales, color: 'var(--t-sales)', area: true, hidden: hideSales }, { name: 'Profit', values: chart.profit, color: 'var(--t-profit)', hidden: hideProfit }]}
          format={axisFmt} xLabel={(s) => dayFmt(s)} tipLabel={(s) => dayFmt(s, { weekday: 'short', day: 'numeric', month: 'short' })} height={260} />
      </TodayCard>
    </div>

    <div class="slot o-stock">
      <TodayCard title="Stock cover" caption="Cases by days of cover" updatedAt={res?.freshness ?? null} rows={stockRows} filename="stock-health" empty={!d.stock} drill={{ label: 'Open warehouse', href: '#/dashboards/warehouse' }} viewToggle>
        {#if d.stock}
          <div class="stock">
            <RingDonut size={130} thickness={14} label="Stock by days of cover" parts={d.stock.bands.map((b) => ({ label: b.label, value: b.cases, color: BAND_COLOR[b.key] }))} centerLabel="Stock value" centerValue={d.stock.value == null ? 'No data yet' : `${currency.code} ${amount(d.stock.value)}`} />
            <ul class="bands">
              {#each d.stock.bands as b (b.key)}
                <li class:zero={!b.cases} title={b.label}><i style:background={BAND_COLOR[b.key]}></i><span>{BAND_SHORT[b.key]}<em>{bandRange(b.key)}</em></span><b>{d.stock.cases ? Math.round((b.cases / d.stock.cases) * 100) : 0}%</b></li>
              {/each}
            </ul>
          </div>
        {/if}
      </TodayCard>
    </div>
  </div>

  <div class="owed-wrap" class:busy={w.loading}>
    <TodayCard title="Money owed" caption="{currency.code} · {d.owed.terms}-day terms" updatedAt={res?.freshness ?? null} rows={owedRows} filename="money-owed" empty={d.owed.total == null} drill={{ label: 'Open customer balances', href: '#/sales?show=owed' }} viewToggle>
      {#snippet tableView()}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Customer</th><th class="num">Balance</th></tr></thead>
          <tbody>{#each d.owed.top as x}<tr><td>{x.customer}</td><td class="num">{moneyTxt(x.value)}</td></tr>{/each}</tbody>
        </table></div>
      {/snippet}
      <div class="owed-grid">
        <div>
          <p class="cap-line">Ageing bands</p>
          {#if ageTotal}
            <BarChart
              label="Receivables by age"
              categories={d.owed.bands.map((b) => b.name)}
              series={[{ name: `Balance (${currency.code})`, values: d.owed.bands.map((b) => cv(b.value)), ink: 'warn' }]}
              format={axisFmt}
              height={200}
            />
          {:else}
            <p class="caption">No open balances</p>
          {/if}
        </div>
        <div>
          <p class="cap-line">Top balances</p>
          {#if d.owed.top.length}
            <BarChart
              label="Top customer balances"
              horizontal
              categories={d.owed.top.map((x) => x.customer)}
              series={[{ name: `Balance (${currency.code})`, values: d.owed.top.map((x) => cv(x.value)), ink: 'warn' }]}
              format={axisFmt}
              height={200}
            />
          {:else}
            <p class="caption">No customer balances</p>
          {/if}
        </div>
      </div>
      <p class="caption foot">{d.owed.overdue ? `${moneyTxt(d.owed.overdue)} overdue` : d.owed.total != null ? `Nothing overdue of ${moneyTxt(d.owed.total)}` : 'No open balances'}</p>
    </TodayCard>
  </div>
{/if}

<style>
  :global(:root) { --t-sales: #1f3a5f; --t-profit: #1b7f5c; }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light'])) { --t-sales: #9bb6d6; --t-profit: #3dbe8a; } }
  :global(:root[data-theme='dark']) { --t-sales: #9bb6d6; --t-profit: #3dbe8a; }

  .busy { opacity: 0.6; transition: opacity 0.2s; }
  .kpis {
    display: grid;
    grid-template-columns: minmax(200px, 1.3fr) repeat(5, minmax(0, 1fr));
    gap: var(--space-3);
    margin-bottom: var(--space-5);
    align-items: stretch;
  }
  .kpi {
    display: flex; flex-direction: column; justify-content: space-between; gap: 6px; min-width: 0; height: 100%;
    padding: var(--space-4) var(--space-5); border-radius: var(--radius-lg);
    background: var(--surface); border: 1px solid var(--border); box-shadow: var(--elevation-1);
    color: var(--text); text-decoration: none;
  }
  .kpis.sk { grid-template-rows: auto; }
  .kpi:hover { border-color: var(--border-strong); }
  .kpi:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  .kpi.hero, .kpi.wide { grid-column: auto; grid-row: auto; min-height: 0; }
  .kpi header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .lbl { font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .cap-line { font-size: 12px; color: var(--text-muted); }
  .val { font-size: 32px; line-height: 1.1; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 6px; }
  .val.sm { font-size: 22px; }
  .val small { font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .val small.delta { font-size: 12px; font-weight: 500; margin-left: 4px; }
  .chg { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; font-size: 12px; }
  .sub { font-size: 12px; color: var(--text-muted); line-height: 1.35; }
  .chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 7px; border-radius: 999px; font-weight: 700; font-variant-numeric: tabular-nums; font-size: 12px; }
  .chip.up { background: var(--success-subtle); color: var(--success); }
  .chip.down { background: var(--danger-subtle); color: var(--danger); }
  .spk { color: var(--text-muted); }
  .spk.good { color: var(--success); }
  .spk.warn { color: var(--warning-solid); }
  .spk.bad { color: var(--danger); }
  .kpi.rag-good .val { color: var(--success); }
  .kpi.rag-warn .val { color: var(--warning); }
  .kpi.rag-bad .val { color: var(--danger); }

  .main {
    display: grid;
    grid-template-columns: minmax(220px, 0.85fr) minmax(0, 1.35fr) minmax(240px, 1fr);
    gap: var(--space-4);
    align-items: stretch;
    margin-bottom: var(--space-5);
  }
  .slot { display: flex; flex-direction: column; min-width: 0; min-height: 100%; }
  .slot > :global(.tc) { flex: 1; width: 100%; }

  .legend { display: flex; gap: 2px; }
  .lg { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 0; background: none; border-radius: var(--radius-md); font: inherit; font-size: 13px; color: var(--text); cursor: pointer; }
  .lg i { width: 10px; height: 10px; border-radius: 50%; }
  .lg[aria-pressed='false'] { color: var(--text-subtle); text-decoration: line-through; }
  .lg[aria-pressed='false'] i { opacity: 0.35; }
  .lg:hover { background: var(--surface-sunken); }

  .dec { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .dec li + li { border-top: 1px solid color-mix(in srgb, var(--text-on-primary) 22%, transparent); }
  .dec a { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto 14px; align-items: center; gap: var(--space-2); padding: 8px 0; color: var(--text-on-primary); text-decoration: none; }
  .dec a:hover b { text-decoration: underline; }
  .dec .ic { display: grid; place-items: center; width: 30px; height: 30px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--text-on-primary) 16%, transparent); color: var(--text-on-primary); }
  .tx { display: flex; flex-direction: column; min-width: 0; font-size: 11px; color: color-mix(in srgb, var(--text-on-primary) 78%, transparent); }
  .tx b { font-size: 13px; font-weight: 600; color: var(--text-on-primary); line-height: 1.3; }
  .tx > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
  .tx .own { color: color-mix(in srgb, var(--text-on-primary) 70%, transparent); }
  .ct b { font-size: 16px; font-variant-numeric: tabular-nums; color: var(--text-on-primary); }
  .dec :global(.chev) { color: var(--text-on-primary); }
  .allclear { display: flex; align-items: center; gap: var(--space-2); color: var(--text-on-primary); margin: 0; font-size: 13px; }
  .clear { margin-top: var(--space-3); font-size: 13px; }
  .clear summary { cursor: pointer; color: color-mix(in srgb, var(--text-on-primary) 80%, transparent); font-weight: 600; }
  .clear ul { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
  .clear a { display: flex; justify-content: space-between; gap: var(--space-3); padding: 6px 0; color: var(--text-on-primary); text-decoration: none; }
  .clear a span { color: color-mix(in srgb, var(--text-on-primary) 75%, transparent); text-align: right; }

  .stock { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
  .bands { list-style: none; margin: 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .bands li { display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: var(--space-2); }
  .bands i { width: 10px; height: 10px; border-radius: 50%; }
  .bands b { font-variant-numeric: tabular-nums; font-size: 14px; }
  .bands em { font-style: normal; color: var(--text-subtle); margin-left: 6px; font-size: 12px; }
  .bands .zero { color: var(--text-subtle); }

  .owed-wrap { margin-bottom: var(--space-4); }
  .owed-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
  .foot { margin-top: var(--space-3); }

  @media (max-width: 1100px) {
    .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .kpi.hero { grid-column: 1 / -1; }
    .main { grid-template-columns: 1fr; }
    .owed-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) {
    .kpis { grid-template-columns: 1fr; gap: var(--space-3); }
  }
</style>
