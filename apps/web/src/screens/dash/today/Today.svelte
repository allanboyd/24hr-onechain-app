<script lang="ts">
  // Directors' Overview: stats and the truck map on the left, charts on the right, money owed under them.
  import { amount as lineAmount, dashboards, lookup, sales, shipments, type DashFilter, type DashResponse, type DashResult, type Sale, type Shipment } from '@btw/api';
  import type { TodayData, TodayDecision } from '@btw/api/dashboards';
  import { termsOf } from '@btw/api/metrics';
  import { watch } from '../../../lib/load.svelte';
  import ErrorState from '../../../components/ErrorState.svelte';
  import SmoothTrend from '../../../components/charts/SmoothTrend.svelte';
  import { BarChart, Donut } from '../../../components/charts';
  import type { Ink } from '../../../components/charts/theme.svelte';
  import { compact } from '../../../components/charts/scale';
  import { currency, cv, cvRow } from '../fmt.svelte';
  import '../../../components/dashboard/report.css';
  import TodayCard from './TodayCard.svelte';
  import TruckMap, { truckStanding } from './TruckMap.svelte';
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
  let trips = $state<Shipment[] | null>(null);
  let saleList = $state<Sale[] | null>(null);
  const w = watch(async () => {
    const [r, list, sold] = await Promise.all([
      dashboards.get(['director-today', 'po-pipeline', 'mgmt-plans', 'warehouse-today', 'mgmt-clients'], filter),
      shipments.list().catch(() => [] as Shipment[]),
      sales.list().catch(() => [] as Sale[]),
    ]);
    res = (r.results['director-today'] as DashResult<TodayData>) ?? null;
    extra = r.results;
    trips = list;
    saleList = sold;
    onload?.(r.options);
  }, () => JSON.stringify(filter));
  const d = $derived(res?.data ?? null);

  const amount = (usd: number) => compact(cv(usd));
  const cmp1 = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const axisFmt = (n: number) => cmp1.format(n);
  const moneyTxt = (usd: number | null | undefined) => (usd == null ? 'No data yet' : `${currency.code} ${amount(usd)}`);
  const dayFmt = (iso: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
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

  const sold = $derived([...(d?.top ?? [])].sort((a, b) => b.cases - a.cases).slice(0, 5));
  const soldName = (x: { brand: string; pack: string }) => {
    const kind = /bottle/i.test(x.pack) ? 'bottles' : /can/i.test(x.pack) ? 'cans' : '';
    return kind && !new RegExp(kind, 'i').test(x.brand) ? `${x.brand} ${kind}` : x.brand;
  };
  const soldRows = () => [['Product', 'Cases', `Sales (${currency.code})`], ...sold.map((x) => [x.pack ? `${x.brand} ${x.pack}` : x.brand, x.cases, cvRow(x.revenue)])];

  const DAY = 864e5;
  const debtors = $derived.by(() => {
    const map = new Map<string, { customer: string; value: number; late: number }>();
    for (const s of saleList ?? []) {
      if (s.status === 'Paid') continue;
      const value = s.lines.reduce((a, l) => a + lineAmount(l.qty, l.price), 0) - s.paid;
      if (value <= 0.5) continue;
      const late = Math.floor((Date.now() - Date.parse(s.at)) / DAY) - termsOf(s);
      const cur = map.get(s.customer) ?? { customer: s.customer, value: 0, late: -999 };
      cur.value += value;
      cur.late = Math.max(cur.late, late);
      map.set(s.customer, cur);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  });
  const owedTotal = $derived(debtors.reduce((a, x) => a + cv(x.value), 0));
  const owedPie = $derived(debtors.map((x) => ({ label: x.customer, value: cv(x.value) })));
  const lateLabel = (n: number) => (n < 1 ? 'On time' : n === 1 ? '1 day late' : `${n} days late`);
  const owedRows = () => [['Customer', 'Standing', `Balance (${currency.code})`], ...debtors.map((x) => [x.customer, lateLabel(x.late), cvRow(x.value)])];

  const moving = $derived((trips ?? []).filter((s) => s.status !== 'Acknowledged' && s.status !== 'Cancelled'));
  const legOf = (sh: Shipment) => sh.legs.find((l) => l.status !== 'Acknowledged' && l.status !== 'Cancelled') ?? sh.legs.at(-1);
  const placeOf = (sh: Shipment) => {
    const leg = legOf(sh);
    const hit = leg ? [...leg.passes].reverse().find((p) => p.arrivedAt) ?? leg.passes[0] : undefined;
    return (hit ? lookup.checkpoint(hit.checkpointId)?.name : '')?.split(' (')[0] || 'On the road';
  };
  const onMap = $derived([...moving].sort((a, b) => {
    const at = (sh: Shipment) => {
      const leg = legOf(sh);
      const times = [leg?.lastPing?.at, ...(leg?.passes.map((p) => p.arrivedAt) ?? [])].filter(Boolean) as string[];
      return Math.max(0, ...times.map((t) => Date.parse(t)));
    };
    return at(b) - at(a);
  }).slice(0, 5));
  const truckRows = () => [['Truck', 'Where', 'Standing'], ...onMap.map((sh) => [lookup.truck(legOf(sh)?.truckId ?? '')?.reg ?? '-', placeOf(sh), truckStanding(sh)])];

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
  const wh = $derived(extra['warehouse-today']?.data as { sign?: { count: number }; arriving?: { trucks: number } } | undefined);
  const PO_INK: Record<string, Ink> = { 'Awaiting approval': 'warn', Created: 'slate', 'Sent to supplier': 'navy', Loading: 'teal', 'On the road': 'good', Delivered: 'planned' };
  const poStatus = $derived(stages.filter((s) => s.count > 0));
  const poRows = () => [['Stage', 'Orders'], ...poStatus.map((s) => [s.label, s.count])];
  const poSeries = $derived(poStatus.map((s) => ({ name: s.label, values: poStatus.map((o) => (o.label === s.label ? s.count : 0)), ink: PO_INK[s.label] ?? 'navy' })));
  const SHIP_LABEL: Record<string, string> = { Acknowledged: 'Signed for' };
  const SHIP_INK: Record<string, Ink> = { Planned: 'slate', Loaded: 'navy', Dispatched: 'planned', 'In transit': 'teal', 'At border': 'cost', Delayed: 'warn', Arrived: 'allowed', 'Signed for': 'good' };
  const SHIP_ORDER = ['Planned', 'Loaded', 'Dispatched', 'In transit', 'At border', 'Delayed', 'Arrived', 'Acknowledged'];
  const shipStatus = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const s of trips ?? []) {
      if (s.status === 'Cancelled') continue;
      counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
    }
    return SHIP_ORDER.filter((k) => counts.has(k)).map((k) => ({ label: SHIP_LABEL[k] ?? k, count: counts.get(k)! }));
  });
  const shipPie = $derived(shipStatus.map((s) => ({ label: s.label, value: s.count, ink: SHIP_INK[s.label] ?? 'teal' })));
  const shipTotal = $derived(shipStatus.reduce((a, s) => a + s.count, 0));
  const shipRows = () => [['State', 'Shipments'], ...shipStatus.map((s) => [s.label, s.count])];
  const buyers = $derived((extra['mgmt-clients']?.data as { kpis?: { clients?: number } } | undefined)?.kpis);
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if !d && w.loading}
  <div class="facts sk">{#each Array(7) as _, i (i)}<div class="card skel"></div>{/each}</div>
{:else if d}
  <div class="band" class:busy={w.loading}>
  <div class="side">
  <div class="dash-kpis facts">
    <a class="card kpi" href="#/pos">
      <span class="lbl">Purchase orders</span>
      <b class="val">{stages.length ? count(poCount) : '-'}</b>
      <span class="sub">{onRoad ? `${count(onRoad)} on the road` : 'Open orders'}</span>
    </a>
    <a class="card kpi" href="#/shipments">
      <span class="lbl">Shipments</span>
      <b class="val">{trips ? count(moving.length) : '-'}</b>
      <span class="sub">{wh?.sign?.count ? `${count(wh.sign.count)} waiting to be signed` : 'Still moving'}</span>
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
  <div class="dash-kpis facts trio">
    <a class="card kpi" href="#/period-plans">
      <span class="lbl">Plans</span>
      <b class="val">{plan ? count(plan.planned) : '-'}</b>
      <span class="sub">{plan ? `${count(plan.ordered)} cases ordered` : 'Cases planned'}</span>
    </a>
    <a class="card kpi" href="#/dashboards/warehouse">
      <span class="lbl">Warehouse stock</span>
      <b class="val">{d.stock ? count(d.stock.cases) : '-'}</b>
      <span class="sub">{d.stock?.value == null ? 'Cases on hand' : `${moneyVal(d.stock.value)} on hand`}</span>
    </a>
    <a class="card kpi" href="#/dashboards/fleet">
      <span class="lbl">Trucks on the road</span>
      <b class="val">{d.trucks.value == null ? '-' : count(d.trucks.value)}</b>
      <span class="sub">{d.trucks.delayed ? `${d.trucks.delayed} delayed` : 'None delayed'} · {d.trucks.arrivingToday} today</span>
    </a>
  </div>
  <div class="map-slot">
    <TodayCard title="Trucks" caption="Where they are now" updatedAt={res?.freshness ?? null} rows={truckRows} filename="trucks-now" empty={!onMap.length} emptyText="No trucks on the road" drill={{ label: 'Open shipments', href: '#/shipments' }} viewToggle>
      {#snippet tableView()}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Truck</th><th>Where</th><th>Standing</th></tr></thead>
          <tbody>{#each onMap as sh (sh.id)}<tr><td>{lookup.truck(legOf(sh)?.truckId ?? '')?.reg ?? '-'}</td><td>{placeOf(sh)}</td><td>{truckStanding(sh)}</td></tr>{/each}</tbody>
        </table></div>
      {/snippet}
      <TruckMap items={onMap} />
    </TodayCard>
  </div>
  </div>

  <div class="graphs">
    <div>
      <TodayCard title="Sales and profit" caption="{currency.code} · total {compact(chartTotal.sales)} sales, {compact(chartTotal.profit)} profit" updatedAt={res?.freshness ?? null} rows={chartRows} filename="sales-and-profit" empty={!chart.sales.some((v) => v != null)} viewToggle>
        {#snippet actions()}
          <div class="legend" role="group" aria-label="Show or hide a line">
            <button class="lg" aria-pressed={!hideSales} onclick={() => (hideSales = !hideSales)}><i style="background:var(--t-sales)"></i>Sales</button>
            <button class="lg" aria-pressed={!hideProfit} onclick={() => (hideProfit = !hideProfit)}><i style="background:var(--t-profit)"></i>Profit</button>
          </div>
        {/snippet}
        <SmoothTrend label="Sales and profit" labels={chart.labels}
          series={[{ name: 'Sales', values: chart.sales, color: 'var(--t-sales)', area: true, hidden: hideSales }, { name: 'Profit', values: chart.profit, color: 'var(--t-profit)', hidden: hideProfit }]}
          format={axisFmt} xLabel={(s) => dayFmt(s)} tipLabel={(s) => dayFmt(s, { weekday: 'short', day: 'numeric', month: 'short' })} height={240} />
      </TodayCard>
    </div>
    <div>
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
    <div>
      <TodayCard title="Purchase orders" caption="Orders at each stage" updatedAt={res?.freshness ?? null} rows={poRows} filename="purchase-order-status" empty={!poStatus.length} drill={{ label: 'Open purchase orders', href: '#/pos' }} viewToggle>
        <BarChart stacked label="Purchase order status" categories={poStatus.map((s) => s.label)} series={poSeries} format={(n) => Math.round(n).toLocaleString('en-US')} height={220} />
      </TodayCard>
    </div>
    <div>
      <TodayCard title="Shipments" caption="Current state, including signed for" updatedAt={res?.freshness ?? null} rows={shipRows} filename="shipment-state" empty={!shipStatus.length} drill={{ label: 'Open shipments', href: '#/shipments' }} viewToggle>
        <Donut label="Shipment state" data={shipPie} format={(n) => Math.round(n).toLocaleString('en-US')} height={220} center={String(shipTotal)} />
      </TodayCard>
    </div>
  </div>
  </div>

  <div class="bottom" class:busy={w.loading}>
    <TodayCard title="Money owed" caption="{currency.code} still to collect" updatedAt={res?.freshness ?? null} rows={owedRows} filename="money-owed" empty={!debtors.length} drill={{ label: 'Open customer balances', href: '#/sales?show=owed' }} viewToggle>
      {#snippet tableView()}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Customer</th><th>Standing</th><th class="num">Balance</th></tr></thead>
          <tbody>{#each debtors as x (x.customer)}<tr><td>{x.customer}</td><td>{lateLabel(x.late)}</td><td class="num">{moneyTxt(x.value)}</td></tr>{/each}</tbody>
        </table></div>
      {/snippet}
      <Donut label="Money owed" data={owedPie} format={axisFmt} height={260} center={axisFmt(owedTotal)} />
    </TodayCard>
    <TodayCard title="Most sold" caption="Top 5 products by cases" updatedAt={res?.freshness ?? null} rows={soldRows} filename="most-sold" empty={!sold.length} drill={{ label: 'Open sales', href: '#/sales' }} viewToggle>
      {#snippet tableView()}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Product</th><th class="num">Cases</th><th class="num">Sales</th></tr></thead>
          <tbody>{#each sold as x (x.productId)}<tr><td>{x.brand}{x.pack ? ` ${x.pack}` : ''}</td><td class="num">{count(x.cases)}</td><td class="num">{moneyTxt(x.revenue)}</td></tr>{/each}</tbody>
        </table></div>
      {/snippet}
      <BarChart horizontal label="Most sold" categories={sold.map(soldName)} series={[{ name: 'Cases', values: sold.map((x) => x.cases), ink: 'navy' }]} format={(n) => Math.round(n).toLocaleString('en-US')} height={260} />
    </TodayCard>
  </div>
{/if}

<style>
  :global(:root) { --t-sales: #1f3a5f; --t-profit: #1b7f5c; }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light'])) { --t-sales: #9bb6d6; --t-profit: #3dbe8a; } }
  :global(:root[data-theme='dark']) { --t-sales: #9bb6d6; --t-profit: #3dbe8a; }

  .busy { opacity: 0.6; transition: opacity 0.2s; }
  .band { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.2fr); gap: var(--space-4); align-items: start; margin-bottom: var(--space-4); }
  .side { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
  .map-slot { display: flex; min-width: 0; }
  .map-slot > :global(.tc) { flex: 1; width: 100%; }
  .facts { grid-template-columns: repeat(4, minmax(0, 1fr)); align-content: start; }
  .facts.trio { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sk { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: var(--space-4); }
  .skel { height: 118px; }

  .graphs { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); align-items: stretch; }
  .graphs > div { display: flex; min-width: 0; }
  .graphs > div > :global(.tc) { flex: 1; width: 100%; }
  .bottom { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-4); margin-bottom: var(--space-4); align-items: stretch; }
  .dec { display: grid; grid-template-columns: 1fr; }

  .legend { display: flex; gap: 2px; }
  .lg { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 0; background: none; border-radius: var(--radius-md); font: inherit; font-size: 13px; color: var(--text); cursor: pointer; }
  .lg i { width: 10px; height: 10px; border-radius: 50%; }
  .lg[aria-pressed='false'] { color: var(--text-subtle); text-decoration: line-through; }
  .lg[aria-pressed='false'] i { opacity: 0.35; }
  .lg:hover { background: var(--surface-sunken); }

  .dec { list-style: none; margin: 0; padding: 0; }
  .dec li { border-top: 1px solid color-mix(in srgb, var(--text-on-primary) 22%, transparent); }
  .dec li:first-child { border-top: 0; }
  .dec a { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto auto 14px; align-items: center; gap: var(--space-2); padding: 8px 0; color: var(--text-on-primary); text-decoration: none; }
  .dec a:hover b { text-decoration: underline; }
  .dec .ic { display: grid; place-items: center; width: 30px; height: 30px; border-radius: var(--radius-md); background: transparent; color: var(--text-on-primary); }
  .tx { display: flex; flex-direction: column; min-width: 0; font-size: 11px; color: color-mix(in srgb, var(--text-on-primary) 78%, transparent); }
  .tx b { font-size: 13px; font-weight: 600; color: var(--text-on-primary); line-height: 1.3; }
  .tx > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
  .st { justify-self: end; padding: 0; border-radius: 0; font-size: 12px; font-weight: 700; background: transparent; color: var(--text-on-primary); }
  .sev-critical .st, .sev-critical .ic { background: transparent; color: color-mix(in srgb, var(--danger-solid) 70%, white); }
  .sev-high .st, .sev-high .ic { background: transparent; color: var(--warning-solid); }
  .sev-medium .st, .sev-medium .ic { background: transparent; color: color-mix(in srgb, var(--info) 45%, white); }
  .sev-low .st, .sev-low .ic { background: transparent; color: color-mix(in srgb, var(--success) 50%, white); }
  .ct b { font-size: 16px; font-variant-numeric: tabular-nums; color: var(--text-on-primary); }
  .dec :global(.chev) { color: var(--text-on-primary); }

  @media (max-width: 1280px) {
    .band { grid-template-columns: 1fr; }
  }
  @media (max-width: 1100px) {
    .facts, .sk { grid-template-columns: 1fr 1fr; }
    .graphs, .bottom { grid-template-columns: 1fr; }
  }
</style>
