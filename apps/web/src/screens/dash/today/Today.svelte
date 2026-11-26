<script lang="ts">
  // Directors' My dashboards = Today (docs/15, docs/21): KPIs first, Decisions beside graphs, Money owed split charts.
  // Filter icon opens a modal. Chart|table on cards. No top products / distribution on the default desk.
  import { dashboards, type DashFilter, type DashResponse, type DashResult } from '@btw/api';
  import type { TodayData, TodayDecision } from '@btw/api/dashboards';
  import { watch } from '../../../lib/load.svelte';
  import ErrorState from '../../../components/ErrorState.svelte';
  import SmoothTrend from '../../../components/charts/SmoothTrend.svelte';
  import RingDonut from '../../../components/charts/RingDonut.svelte';
  import { BarChart } from '../../../components/charts';
  import { compact } from '../../../components/charts/scale';
  import { currency, cv, cvRow } from '../fmt.svelte';
  import '../../../components/dashboard/report.css';
  import TodayCard from './TodayCard.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import HandCoins from '@lucide/svelte/icons/hand-coins';
  import Truck from '@lucide/svelte/icons/truck';
  import Banknote from '@lucide/svelte/icons/banknote';
  import Package from '@lucide/svelte/icons/package';
  import Inbox from '@lucide/svelte/icons/inbox';
  import Tag from '@lucide/svelte/icons/tag';

  let { filter, onload }: { filter: DashFilter; onload?: (options: DashResponse['options']) => void } = $props();

  let res = $state<DashResult<TodayData> | null>(null);
  let extra = $state<DashResponse['results']>({});
  const w = watch(async () => {
    const r = await dashboards.get(['director-today', 'po-pipeline', 'mgmt-plans', 'warehouse-today', 'mgmt-clients'], filter);
    res = (r.results['director-today'] as DashResult<TodayData>) ?? null;
    extra = r.results;
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
  let hideSales = $state(false), hideProfit = $state(false);
  const chart = $derived.by(() => {
    if (!d) return { labels: [] as string[], sales: [] as (number | null)[], profit: [] as (number | null)[] };
    const inRange = d.daily.filter((x) => (!filter.from || x.day >= filter.from.slice(0, 10)) && (!filter.to || x.day <= filter.to.slice(0, 10)));
    const xs = inRange.length ? inRange : d.daily;
    return { labels: xs.map((x) => x.day), sales: xs.map((x) => (x.sales == null ? null : cv(x.sales))), profit: xs.map((x) => (x.profit == null ? null : cv(x.profit))) };
  });
  const chartRows = () => [['Day', `Sales (${currency.code})`, `Profit (${currency.code})`], ...chart.labels.map((l, i) => [l, chart.sales[i] == null ? '' : Math.round(chart.sales[i]! * 100) / 100, chart.profit[i] == null ? '' : Math.round(chart.profit[i]! * 100) / 100])];
  const chartTotal = $derived({ sales: chart.sales.reduce((a: number, v) => a + (v ?? 0), 0), profit: chart.profit.reduce((a: number, v) => a + (v ?? 0), 0) });

  const ICON: Record<TodayDecision['key'], typeof Truck> = { approvals: HandCoins, trucks: Truck, fees: Banknote, stock: Package, acks: Inbox, prices: Tag };
  const STATE: Record<TodayDecision['severity'], string> = { critical: 'Critical', high: 'High', medium: 'Watch', low: 'Clear' };
  const decRows = () => [['Decision', 'State', 'Count', `Value (${currency.code})`, 'Detail', 'Owner', 'Link'], ...(d?.decisions ?? []).map((x) => [x.label, STATE[x.severity], x.count ?? '-', cvRow(x.value), x.detail, x.owner, x.href])];

  const BAND_COLOR: Record<string, string> = { risk: 'var(--danger)', low: 'var(--warning-solid)', healthy: 'var(--success)', over: 'var(--viz-other)', nosales: 'var(--border-strong)' };
  const BAND_SHORT: Record<string, string> = { risk: 'At risk', low: 'Low', healthy: 'Healthy', over: 'Overstocked', nosales: 'No sales' };
  const bandRange = (k: string) => (!d ? '' : k === 'risk' ? '≤ 7 d' : k === 'low' ? `8-${d.cover.min} d` : k === 'healthy' ? `${d.cover.min + 1}-${d.cover.max} d` : k === 'over' ? `> ${d.cover.max} d` : '30 d');
  const stockRows = () => [['Band', 'Cases', 'Products', `Value (${currency.code})`], ...(d?.stock?.bands ?? []).map((b) => [b.label, b.cases, b.products, cvRow(b.value)])];

  const sc = $derived(d ? change(d.sales.value, d.sales.prev) : null);
  const ageTotal = $derived(d ? d.owed.bands.reduce((a, b) => a + b.value, 0) : 0);
  const owedRows = () => [['Customer', `Balance (${currency.code})`], ...(d?.owed.top ?? []).map((x) => [x.customer, cvRow(x.value)])];

  const count = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));
  const moneyVal = (usd: number | null | undefined) => (usd == null ? '-' : `${currency.code} ${amount(usd)}`);
  const stages = $derived(((extra['po-pipeline']?.data as { stages?: { label: string; count: number; items?: { pair: string }[] }[] } | undefined)?.stages) ?? []);
  const openStages = $derived(stages.filter((s) => s.label !== 'Delivered'));
  const poCount = $derived(openStages.reduce((a, s) => a + s.count, 0));
  const onRoad = $derived(stages.find((s) => s.label === 'On the road')?.count ?? 0);
  const suppliers = $derived.by(() => {
    const names = new Set<string>();
    for (const s of openStages) for (const it of s.items ?? []) {
      const sup = it.pair.split('\u2013').at(-1)?.trim();
      if (sup) names.add(sup);
    }
    return names.size;
  });
  const plan = $derived((extra['mgmt-plans']?.data as { measures?: { planned?: number; ordered?: number } } | undefined)?.measures);
  const wh = $derived(extra['warehouse-today']?.data as { sign?: { count: number }; arriving?: { trucks: number }; losses?: { deliveries: number } } | undefined);
  const buyers = $derived((extra['mgmt-clients']?.data as { kpis?: { clients?: number } } | undefined)?.kpis);
  const salesChip = $derived(sc == null ? null : { up: sc >= 0, text: `${Math.abs(sc * 100).toFixed(0)}%` });
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if !d && w.loading}
  <div class="facts sk">{#each Array(8) as _, i (i)}<div class="card skel"></div>{/each}</div>
{:else if d}
  <div class="dash-kpis facts" class:busy={w.loading}>
    <a class="card kpi" href="#/dashboards/sales">
      <span class="lbl">Sales</span>
      <b class="val">{moneyVal(d.sales.value)}</b>
      <span class="sub">{#if salesChip}<span class="dash-chip" class:good={salesChip.up} class:bad={!salesChip.up}>{salesChip.up ? '▲' : '▼'} {salesChip.text}</span>{/if} {d.mtd ? 'vs same days last month' : 'Past period'}</span>
    </a>
    <a class="card kpi" href="#/sales?show=owed">
      <span class="lbl">Cash to collect</span>
      <b class="val">{moneyVal(d.cash.value)}</b>
      <span class="sub">{d.cash.overdue ? `${moneyVal(d.cash.overdue)} overdue` : 'Nothing overdue'}</span>
    </a>
    <a class="card kpi" href="#/sales?show=owed">
      <span class="lbl">Money owed</span>
      <b class="val">{moneyVal(d.owed.total)}</b>
      <span class="sub">{d.owed.total == null ? 'Open balances' : (d.owed.total - (d.owed.overdue ?? 0)) > 0.5 ? `${moneyVal(d.owed.total - (d.owed.overdue ?? 0))} within terms` : 'Nothing within terms'}</span>
    </a>
    <a class="card kpi" href="#/pos">
      <span class="lbl">Purchase orders</span>
      <b class="val">{stages.length ? count(poCount) : '-'}</b>
      <span class="sub">{onRoad ? `${count(onRoad)} on the road` : 'Open orders'}</span>
    </a>
    <a class="card kpi" href="#/period-plans">
      <span class="lbl">Plans</span>
      <b class="val">{plan ? count(plan.planned) : '-'}</b>
      <span class="sub">{plan ? `${count(plan.ordered)} cases ordered` : 'Cases planned'}</span>
    </a>
    <a class="card kpi" href="#/shipments">
      <span class="lbl">Shipments</span>
      <b class="val">{wh ? count((wh.sign?.count ?? 0) + (wh.arriving?.trucks ?? 0)) : '-'}</b>
      <span class="sub">{wh ? `${count(wh.sign?.count)} to sign · ${count(wh.arriving?.trucks)} arriving` : 'To sign and arriving'}</span>
    </a>
    <a class="card kpi" href="#/dashboards/fleet">
      <span class="lbl">Trucks on the road</span>
      <b class="val">{d.trucks.value == null ? '-' : count(d.trucks.value)}</b>
      <span class="sub">{d.trucks.delayed ? `${d.trucks.delayed} delayed` : 'None delayed'} · {d.trucks.arrivingToday} today</span>
    </a>
    <a class="card kpi" href="#/shipments?show=delivered">
      <span class="lbl">Collected trips</span>
      <b class="val">{wh?.losses ? count(wh.losses.deliveries) : '-'}</b>
      <span class="sub">Signed for in the last 30 days</span>
    </a>
    <a class="card kpi" href="#/dashboards/warehouse">
      <span class="lbl">Warehouse stock</span>
      <b class="val">{d.stock ? count(d.stock.cases) : '-'}</b>
      <span class="sub">{d.stock?.value == null ? 'Cases on hand' : `${moneyVal(d.stock.value)} on hand`}</span>
    </a>
    <a class="card kpi" href="#/pos">
      <span class="lbl">Suppliers</span>
      <b class="val">{stages.length ? count(suppliers) : '-'}</b>
      <span class="sub">On open purchase orders</span>
    </a>
    <a class="card kpi" href="#/sales">
      <span class="lbl">Customers</span>
      <b class="val">{buyers ? count(buyers.clients) : '-'}</b>
      <span class="sub">With a sale in this period</span>
    </a>
  </div>

  <!-- Decisions | Sales | Stock -->
  <div class="main" class:busy={w.loading}>
    <div class="slot o-dec">
      <TodayCard title="Decisions" tone="primary" caption="Six things to clear" updatedAt={res?.freshness ?? null} rows={decRows} filename="decisions-today" viewToggle>
        {#snippet tableView()}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Decision</th><th class="num">Count</th><th>Owner</th></tr></thead>
            <tbody>{#each d.decisions as x}<tr><td>{x.label}</td><td class="num">{x.count ?? '-'}</td><td>{x.owner}</td></tr>{/each}</tbody>
          </table></div>
        {/snippet}
        <ul class="dec">
          {#each d.decisions as x (x.key)}
            {@const Icon = ICON[x.key]}
            <li class="sev-{x.severity}"><a href={x.href}>
              <span class="ic"><Icon size={16} aria-hidden="true" /></span>
              <span class="tx"><b>{x.label}</b><span>{x.detail}</span></span>
              <span class="st">{STATE[x.severity]}</span>
              <span class="ct"><b>{x.count ?? '-'}</b></span>
              <ChevronRight size={15} class="chev" aria-hidden="true" />
            </a></li>
          {/each}
        </ul>
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
  .facts { margin-bottom: var(--space-5); }
  .sk { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); }
  .skel { height: 118px; }
  .cap-line { font-size: 12px; color: var(--text-muted); }

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
  .dec a { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto auto 14px; align-items: center; gap: var(--space-2); padding: 8px 0; color: var(--text-on-primary); text-decoration: none; }
  .dec a:hover b { text-decoration: underline; }
  .dec .ic { display: grid; place-items: center; width: 30px; height: 30px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--text-on-primary) 16%, transparent); color: var(--text-on-primary); }
  .tx { display: flex; flex-direction: column; min-width: 0; font-size: 11px; color: color-mix(in srgb, var(--text-on-primary) 78%, transparent); }
  .tx b { font-size: 13px; font-weight: 600; color: var(--text-on-primary); line-height: 1.3; }
  .tx > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
  .st { justify-self: end; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; background: color-mix(in srgb, var(--text-on-primary) 16%, transparent); color: var(--text-on-primary); }
  .sev-critical .st, .sev-critical .ic { background: var(--danger-solid); color: var(--text-on-danger); }
  .sev-high .st, .sev-high .ic { background: var(--warning-solid); color: var(--text); }
  .sev-medium .st, .sev-medium .ic { background: var(--info); color: var(--text-on-primary); }
  .sev-low .st, .sev-low .ic { background: var(--success); color: var(--text-on-primary); }
  .ct b { font-size: 16px; font-variant-numeric: tabular-nums; color: var(--text-on-primary); }
  .dec :global(.chev) { color: var(--text-on-primary); }

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
    .main { grid-template-columns: 1fr; }
    .owed-grid { grid-template-columns: 1fr; }
  }
</style>
