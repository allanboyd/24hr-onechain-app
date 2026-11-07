<script lang="ts">
  // Directors' "My dashboards" = Today (docs/15 §3, 26 Oct 2026): the few figures a director needs each morning, one question
  // per card, details one click away on the feature tabs. One GET /v1/dashboards?keys=director-today call (company switch,
  // Group view and filters apply as everywhere); money in the chosen currency. Lazy chunk — never in the web entry.
  import { dashboards, lookup, type DashFilter, type DashResult } from '@btw/api';
  import type { TodayData, TodayDecision } from '@btw/api/dashboards';
  import { company, GROUP } from '../../../lib/company.svelte';
  import { companyBrand } from '../../../lib/companies';
  import { watch } from '../../../lib/load.svelte';
  import ErrorState from '../../../components/ErrorState.svelte';
  import SparkArea from '../../../components/charts/SparkArea.svelte';
  import SmoothTrend from '../../../components/charts/SmoothTrend.svelte';
  import RingDonut from '../../../components/charts/RingDonut.svelte';
  import { compact } from '../../../components/charts/scale';
  import { CODES, currency, setCurrency, cv, cvRow, pctF } from '../fmt.svelte';
  import { DEFAULT_PERIOD, PERIODS, datesOf, type PeriodKey } from '../period';
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
  import MapPin from '@lucide/svelte/icons/map-pin';

  const DAY = 864e5;
  const groupView = company.active === GROUP;

  // ---- filters (compact: period starts on Today, warehouse, currency) ----
  let preset = $state<PeriodKey>(DEFAULT_PERIOD);
  let warehouseId = $state('');
  const filter = $derived.by((): DashFilter => ({ ...datesOf(preset), ...(warehouseId ? { warehouseId } : {}) }));
  const periodShort = $derived(PERIODS.find((x) => x.key === preset)!.short);

  // ---- data ----
  let res = $state<DashResult<TodayData> | null>(null);
  let whOptions = $state<string[]>([]);
  const w = watch(async () => {
    const r = await dashboards.get(['director-today'], filter);
    res = (r.results['director-today'] as DashResult<TodayData>) ?? null;
    if (!warehouseId) whOptions = r.options.warehouses;
  }, () => JSON.stringify(filter));
  const d = $derived(res?.data ?? null);

  // ---- formats ----
  const amount = (usd: number) => compact(cv(usd));
  const cmp1 = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const axisFmt = (n: number) => cmp1.format(n);
  const moneyTxt = (usd: number | null | undefined) => (usd == null ? 'No data yet' : `${currency.code} ${amount(usd)}`);
  const dayFmt = (iso: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
  function change(v: number | null, p: number | null) {
    if (v == null || p == null || !p) return null;
    return (v - p) / Math.abs(p);
  }
  const prevText = $derived(d ? (d.mtd ? `vs same days last month` : `vs ${d.prev.label}`) : '');

  // ---- main chart ----
  let range = $state<'7' | '30' | '90' | 'year'>('7');
  let hideSales = $state(false), hideProfit = $state(false);
  const chart = $derived.by(() => {
    if (!d) return { labels: [] as string[], sales: [] as (number | null)[], profit: [] as (number | null)[], weekly: false };
    if (range !== 'year') { const xs = d.daily.slice(-Number(range)); return { labels: xs.map((x) => x.day), sales: xs.map((x) => (x.sales == null ? null : cv(x.sales))), profit: xs.map((x) => (x.profit == null ? null : cv(x.profit))), weekly: false }; }
    // this year, by week (Monday start) — calmer than 300 daily points
    const y0 = `${new Date().getUTCFullYear()}-01-01`;
    const m = new Map<string, { s: number | null; p: number | null }>();
    for (const x of d.daily.filter((x) => x.day >= y0)) {
      const t = Date.parse(`${x.day}T00:00:00Z`); const wd = (new Date(t).getUTCDay() + 6) % 7; const k = new Date(t - wd * DAY).toISOString().slice(0, 10);
      const a = m.get(k) ?? { s: null, p: null };
      if (x.sales != null) a.s = (a.s ?? 0) + x.sales; if (x.profit != null) a.p = (a.p ?? 0) + x.profit; m.set(k, a);
    }
    const ks = [...m.keys()].sort();
    return { labels: ks, sales: ks.map((k) => (m.get(k)!.s == null ? null : cv(m.get(k)!.s!))), profit: ks.map((k) => (m.get(k)!.p == null ? null : cv(m.get(k)!.p!))), weekly: true };
  });
  const chartRows = () => [[chart.weekly ? 'Week starting' : 'Day', `Sales (${currency.code})`, `Profit (${currency.code})`], ...chart.labels.map((l, i) => [l, chart.sales[i] == null ? '' : Math.round(chart.sales[i]! * 100) / 100, chart.profit[i] == null ? '' : Math.round(chart.profit[i]! * 100) / 100])];
  const chartTotal = $derived({ sales: chart.sales.reduce((a: number, v) => a + (v ?? 0), 0), profit: chart.profit.reduce((a: number, v) => a + (v ?? 0), 0) });

  // ---- decisions ----
  const ICON: Record<TodayDecision['key'], typeof Truck> = { approvals: HandCoins, trucks: Truck, fees: Banknote, stock: Package, acks: Inbox, prices: Tag };
  const open = $derived((d?.decisions ?? []).filter((x) => (x.count ?? 0) > 0));
  const clear = $derived((d?.decisions ?? []).filter((x) => !(x.count ?? 0)));
  const decRows = () => [['Decision', 'Count', `Value (${currency.code})`, 'Detail', 'Owner', 'Link'], ...(d?.decisions ?? []).map((x) => [x.label, x.count ?? 'No data yet', cvRow(x.value), x.detail, x.owner, x.href])];

  // ---- stock ----
  const BAND_COLOR: Record<string, string> = { risk: 'var(--danger)', low: 'var(--warning-solid)', healthy: 'var(--success)', over: 'var(--viz-other)', nosales: 'var(--border-strong)' };
  const BAND_SHORT: Record<string, string> = { risk: 'At risk', low: 'Low', healthy: 'Healthy', over: 'Overstocked', nosales: 'No sales' };
  const bandRange = (k: string) => (!d ? '' : k === 'risk' ? '≤ 7 d' : k === 'low' ? `8–${d.cover.min} d` : k === 'healthy' ? `${d.cover.min + 1}–${d.cover.max} d` : k === 'over' ? `> ${d.cover.max} d` : '30 d');
  const stockRows = () => [['Band', 'Cases', 'Products', `Value (${currency.code})`], ...(d?.stock?.bands ?? []).map((b) => [b.label, b.cases, b.products, cvRow(b.value)])];

  // ---- distribution ----
  let distBy = $state<'company' | 'warehouse'>(groupView ? 'company' : 'warehouse');
  let distWhen = $state<'week' | 'month'>('month');
  const showCompanies = $derived((d?.distribution.companies.length ?? 0) > 1);
  const by = $derived(showCompanies ? distBy : 'warehouse');
  const dist = $derived.by(() => {
    if (!d) return [];
    const xs = by === 'company' ? d.distribution.companies.map((c) => ({ id: c.entityId, label: c.label, v: c[distWhen], logo: companyBrand(c.entityId).mark })) : d.distribution.warehouses.map((x) => ({ id: x.warehouseId, label: x.label, v: x[distWhen], logo: undefined as string | undefined }));
    return [...xs].sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  });
  const distTotal = $derived(dist.reduce((a, x) => a + (x.v ?? 0), 0));
  const distRows = () => [[by === 'company' ? 'Company' : 'Warehouse', `Sales (${currency.code})`, 'Share'], ...dist.map((x) => [x.label, cvRow(x.v), x.v != null && distTotal ? `${Math.round((x.v / distTotal) * 100)}%` : ''])];

  // ---- top products ----
  const topRows = () => [['Product', 'Pack', 'Warehouses', 'Cases per week', 'Cases sold', `Revenue (${currency.code})`, 'Margin', 'Days of cover'], ...(d?.top ?? []).map((x) => [x.brand, x.pack, x.warehouses.join(', '), x.perWeek, x.cases, cvRow(x.revenue), pctF(x.margin), x.cover ?? 'No sales'])];
  const coverTone = (c: number | null) => (c == null ? 'none' : c <= 7 ? 'bad' : c <= (d?.cover.min ?? 14) ? 'warn' : c > (d?.cover.max ?? 60) ? 'over' : 'ok');
  // KPI changes — RAG: green progress, amber approaching danger, red danger
  const sc = $derived(d ? change(d.sales.value, d.sales.prev) : null);
  const pc = $derived(d ? change(d.profit.value, d.profit.prev) : null);
  const mpp = $derived(d && d.profit.margin != null && d.profit.prevMargin != null ? (d.profit.margin - d.profit.prevMargin) * 100 : null);
  const td = $derived(d && d.trucks.value != null && d.trucks.prev != null ? d.trucks.value - d.trucks.prev : null);
  type Rag = 'good' | 'warn' | 'bad' | 'none';
  const ragSales = $derived<Rag>(sc == null ? 'none' : sc >= 0 ? 'good' : 'bad');
  const ragProfit = $derived<Rag>(!d || d.profit.margin == null ? 'none' : d.profit.margin >= d.targetMargin ? 'good' : d.profit.margin >= d.targetMargin * 0.8 ? 'warn' : 'bad');
  const ragCash = $derived<Rag>(!d || d.cash.value == null ? 'none' : !d.cash.overdue ? 'good' : d.cash.overdue / d.cash.value > 0.25 ? 'bad' : 'warn');
  const ragTrucks = $derived<Rag>(!d || d.trucks.value == null ? 'none' : d.trucks.delayed ? 'bad' : d.trucks.onTimeWeek != null && d.trucks.onTimeWeek < 0.9 ? 'warn' : 'good');
  const ageTotal = $derived(d ? d.owed.bands.reduce((a, b) => a + b.value, 0) : 0);
</script>

<div class="fbar" role="group" aria-label="Filters">
  <label>Period <select class="select" bind:value={preset}>{#each PERIODS as p}<option value={p.key}>{p.label}</option>{/each}</select></label>
  {#if whOptions.length > 1}
    <label>Warehouse <select class="select" bind:value={warehouseId}><option value="">All warehouses</option>{#each whOptions as id}<option value={id}>{lookup.warehouse(id)?.name ?? id}</option>{/each}</select></label>
  {/if}
  <label>Currency <select class="select" value={currency.code} onchange={(e) => setCurrency(e.currentTarget.value)}>{#each CODES as c}<option>{c}</option>{/each}</select></label>
  <span class="scope">{groupView ? 'Group · all companies (read-only)' : lookup.entity(company.active)?.shortName ?? ''}{#if currency.code !== 'USD' && currency.month} · {currency.code} at the {currency.month} rate{/if}</span>
</div>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if !d && w.loading}
  <div class="kpis">{#each Array(4) as _}<div class="kpi"><div class="skeleton" style="width:50%"></div><div class="skeleton" style="height:32px;width:70%;margin-top:12px"></div><div class="skeleton" style="height:36px;margin-top:12px"></div></div>{/each}</div>
  <div class="grid"><div class="col"><div class="tcs skeleton" style="height:360px"></div></div><div class="col"><div class="tcs skeleton" style="height:360px"></div></div></div>
{:else if d}
  <!-- ── KPI strip ── -->
  <div class="kpis" class:busy={w.loading}>
    <a class="kpi rag-{ragSales}" href="#/dashboards/sales" title={res?.definition}>
      <span class="lbl">Sales · {periodShort.toLowerCase()}</span>
      <span class="val">{#if d.sales.value == null}No data yet{:else}<small>{currency.code}</small> {amount(d.sales.value)}{/if}</span>
      <span class="chg">{#if sc != null}<span class="chip {sc >= 0 ? 'up' : 'down'}">{#if sc >= 0}<ArrowUpRight size={13} />{:else}<ArrowDownRight size={13} />{/if}{sc >= 0 ? '+' : ''}{(sc * 100).toFixed(1)}%</span>{/if}<span class="sub">{sc != null ? prevText : 'Nothing earlier to compare'}</span></span>
      <span class="spk {ragSales}"><SparkArea values={d.sales.spark} /></span>
    </a>
    <a class="kpi rag-{ragProfit}" href="#/performance">
      <span class="lbl">Profit · margin {pctF(d.profit.margin)}</span>
      <span class="val">{#if d.profit.value == null}No data yet{:else}<small>{currency.code}</small> {amount(d.profit.value)}{/if}</span>
      <span class="chg">{#if pc != null}<span class="chip {pc >= 0 ? 'up' : 'down'}">{#if pc >= 0}<ArrowUpRight size={13} />{:else}<ArrowDownRight size={13} />{/if}{pc >= 0 ? '+' : ''}{(pc * 100).toFixed(1)}%</span>{/if}{#if d.profit.margin != null}<span class="chip {ragProfit === 'good' ? 'up' : ragProfit === 'warn' ? 'warn' : 'down'}">{ragProfit === 'good' ? 'At target' : 'Below target'} {pctF(d.targetMargin)}</span>{/if}<span class="sub">{mpp != null ? `margin ${mpp >= 0 ? '+' : ''}${mpp.toFixed(1)} pp` : 'landed cost based'}{d.profit.estimated ? ' · part estimated' : ''}</span></span>
      <span class="spk {ragProfit}"><SparkArea values={d.profit.spark} /></span>
    </a>
    <a class="kpi rag-{ragCash}" href="#/sales?show=owed">
      <span class="lbl">Cash to collect</span>
      <span class="val">{#if d.cash.value == null}No data yet{:else}<small>{currency.code}</small> {amount(d.cash.value)}{/if}</span>
      <span class="chg">{#if d.cash.overdue}<span class="chip warn">{currency.code} {amount(d.cash.overdue)} overdue</span>{:else if d.cash.value != null}<span class="chip up">Nothing overdue</span>{/if}<span class="sub">{d.cash.collectedShare != null ? `${Math.round(d.cash.collectedShare * 100)}% of ${periodShort.toLowerCase()}'s sales paid` : `${d.cash.customers} customers`}</span></span>
      <span class="spk {ragCash}"><SparkArea values={d.cash.spark} /></span>
    </a>
    <a class="kpi rag-{ragTrucks}" href="#/dashboards/fleet">
      <span class="lbl">Trucks on the road</span>
      <span class="val">{d.trucks.value ?? 'No data yet'}{#if td != null}<small class="delta">{td >= 0 ? '+' : ''}{td} vs a week ago</small>{/if}</span>
      <span class="chg">{#if d.trucks.delayed}<span class="chip down">{d.trucks.delayed} delayed</span>{:else if d.trucks.value != null}<span class="chip up">None delayed</span>{/if}<span class="sub">{d.trucks.arrivingToday} arriving today{#if d.trucks.onTimeWeek != null} · {Math.round(d.trucks.onTimeWeek * 100)}% on time (7 d){/if}</span></span>
      <span class="spk {ragTrucks}"><SparkArea values={d.trucks.spark} /></span>
    </a>
  </div>

  <div class="grid" class:busy={w.loading}>
    <!-- ── left: trend + top products ── -->
    <div class="col">
      <div class="slot o-chart"><TodayCard title="Sales and profit" definition={res?.definition} caption="{currency.code} · {chart.weekly ? 'by week, this year' : `daily, last ${range} days`}{preset === 'today' && range === '7' ? ' · Today, last 7 days behind' : ''} · total {compact(chartTotal.sales)} sales, {compact(chartTotal.profit)} profit" decision="If profit lags sales, open the profit bridge." updatedAt={res?.freshness ?? null} rows={chartRows} filename="sales-and-profit" empty={!chart.sales.some((v) => v != null)}>
        {#snippet actions()}
          <div class="legend" role="group" aria-label="Show or hide a line">
            <button class="lg" aria-pressed={!hideSales} onclick={() => (hideSales = !hideSales)}><i style="background:var(--t-sales)"></i>Sales</button>
            <button class="lg" aria-pressed={!hideProfit} onclick={() => (hideProfit = !hideProfit)}><i style="background:var(--t-profit)"></i>Profit</button>
          </div>
          <select class="select sm" bind:value={range} aria-label="Chart period"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="year">This year</option></select>
        {/snippet}
        <SmoothTrend label="Sales and profit, {chart.weekly ? 'weekly this year' : `daily over the last ${range} days`}" labels={chart.labels}
          series={[{ name: 'Sales', values: chart.sales, color: 'var(--t-sales)', area: true, hidden: hideSales }, { name: 'Profit', values: chart.profit, color: 'var(--t-profit)', hidden: hideProfit }]}
          format={axisFmt} xLabel={(s) => (chart.weekly ? dayFmt(s, { month: 'short' }) : dayFmt(s))} tipLabel={(s) => (chart.weekly ? `Week of ${dayFmt(s)}` : dayFmt(s, { weekday: 'short', day: 'numeric', month: 'short' }))} height={300} />
      </TodayCard></div>

      <div class="slot o-top"><TodayCard title="Top products" definition="The products that brought in the most sales in the period. Cases per week = cases sold ÷ weeks in the period. Margin = profit ÷ sales at landed cost v2 (amber when below the target margin). Days of cover = cases held now ÷ average daily sales of the last 30 days." caption="{periodShort} · by sales value" decision="Protect cover on the best sellers; review prices below target." rows={topRows} filename="top-products" empty={!d.top.length} drill={{ label: 'View all in Performance', href: '#/performance' }} flush>
        <div class="table-wrap"><table class="tp">
          <thead><tr><th class="rank">#</th><th>Product</th><th class="hide-md">Warehouses</th><th class="num hide-sm">Cases / week</th><th class="num">Revenue</th><th class="num">Margin</th><th class="num">Cover</th></tr></thead>
          <tbody>
            {#each d.top as x, i}
              {@const ct = coverTone(x.cover)}
              <tr>
                <td class="rank">{i + 1}</td>
                <td><b>{x.brand}</b>{#if x.pack}<span class="pk">{x.pack}</span>{/if}</td>
                <td class="hide-md muted">{x.warehouses.join(', ')}</td>
                <td class="num hide-sm">{x.perWeek.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td class="num">{moneyTxt(x.revenue)}</td>
                <td class="num"><span class:below={x.margin != null && x.margin < d.targetMargin}>{pctF(x.margin)}</span></td>
                <td class="num"><span class="cov {ct}">{x.cover == null ? 'No sales' : `${x.cover} d`}</span></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      </TodayCard></div>
    </div>

    <!-- ── right: decisions, stock, distribution ── -->
    <div class="col side">
      <div class="slot o-dec"><TodayCard title="Needs your decision today" definition="Things only a director can unblock, most urgent first: truck payments waiting for approval, delayed or silent trucks, transport fees past the red limit, products running below the minimum days of stock, deliveries not signed for a day, and top sellers priced below the target margin. Each row opens the list behind it." caption="{open.length ? `${open.length} open` : 'All clear'} · owner shown on each" decision="Work the red rows before anything else." updatedAt={res?.freshness ?? null} rows={decRows} filename="decisions-today">
        {#if open.length}
          <ul class="dec">
            {#each open as x (x.key)}
              {@const Icon = ICON[x.key]}
              <li><a href={x.href}>
                <span class="ic sev-{x.severity}"><Icon size={17} aria-hidden="true" /></span>
                <span class="tx"><b>{x.label}</b><span>{x.detail} · <span class="own">{x.owner}</span></span></span>
                <span class="ct"><b>{x.count}</b>{#if x.value != null}<span>{moneyTxt(x.value)}</span>{/if}</span>
                <ChevronRight size={16} class="chev" aria-hidden="true" />
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
      </TodayCard></div>

      <div class="slot o-stock"><TodayCard title="Which stock needs action today?" definition="Cases held now in every warehouse in view, by days of cover (cases held ÷ average daily sales of the last 30 days). Minimum {d.cover.min} days, overstocked above {d.cover.max} days (to confirm per category). Centre = stock value at landed cost." caption="Cases by days of cover · now" decision="Tell purchasing to reorder at-risk products; count no-sales lines." updatedAt={res?.freshness ?? null} rows={stockRows} filename="stock-health" empty={!d.stock} drill={{ label: 'View details', href: '#/dashboards/warehouse' }}>
        {#if d.stock}
          <div class="stock">
            <RingDonut size={140} thickness={14} label="Stock by days of cover" parts={d.stock.bands.map((b) => ({ label: b.label, value: b.cases, color: BAND_COLOR[b.key] }))} centerLabel="Stock value" centerValue={d.stock.value == null ? 'No data yet' : `${currency.code} ${amount(d.stock.value)}`} />
            <ul class="bands">
              {#each d.stock.bands as b (b.key)}
                <li class:zero={!b.cases} title={b.label}><i style:background={BAND_COLOR[b.key]}></i><span>{BAND_SHORT[b.key]}<em>{bandRange(b.key)}</em></span><b>{d.stock.cases ? Math.round((b.cases / d.stock.cases) * 100) : 0}%</b></li>
              {/each}
            </ul>
          </div>
        {/if}
      </TodayCard></div>

      <div class="slot o-owed"><TodayCard title="Who owes us?" definition="Unpaid and part-paid sales by days since the sale. Overdue after {d.owed.terms} days payment terms (to confirm). Green = within terms, amber = 1–30 days overdue, red = over 30 days overdue." caption="{currency.code} · terms {d.owed.terms} days" decision="Call the customers in the overdue bands." updatedAt={res?.freshness ?? null} rows={() => [['Band', `Amount (${currency.code})`], ...d.owed.bands.map((b) => [b.name, cvRow(b.value)]), ...d.owed.top.map((x) => [x.customer, cvRow(x.value)])]} filename="who-owes-us" empty={d.owed.total == null} drill={{ label: 'View customer balances', href: '#/sales?show=owed' }}>
        {#if ageTotal}
          <div class="age-strip" role="img" aria-label="Receivables ageing">{#each d.owed.bands as b}<span class={b.tone} style:width="{Math.max(0, (b.value / ageTotal) * 100)}%">{b.value ? amount(b.value) : ''}</span>{/each}</div>
          <ul class="age-leg">{#each d.owed.bands as b}<li><i class={b.tone}></i>{b.name}<b>{moneyTxt(b.value)}</b></li>{/each}</ul>
        {/if}
        {#if d.owed.top.length}
          <ul class="owed">
            {#each d.owed.top as x}
              <li><span>{x.customer}</span><b>{moneyTxt(x.value)}</b></li>
            {/each}
          </ul>
        {/if}
        <p class="caption">{d.owed.overdue ? `${moneyTxt(d.owed.overdue)} overdue of ${moneyTxt(d.owed.total)}` : d.owed.total != null ? `Nothing overdue of ${moneyTxt(d.owed.total)}` : 'No open balances'}</p>
      </TodayCard></div>

      <div class="slot o-dist"><TodayCard title="Sales distribution" definition="Sales value by company (Group view) or by warehouse, over the last 7 days or the chosen period. Sales between our own companies are removed in the Group view." caption="{currency.code} · {distWhen === 'week' ? 'last 7 days' : periodShort.toLowerCase()}" decision="Ask why a warehouse or company is off the usual share." rows={distRows} filename="sales-distribution" empty={!dist.some((x) => x.v != null)} drill={{ label: 'View details', href: '#/dashboards/sales' }}>
        <div class="drow">
          {#if showCompanies}
            <div class="sel-seg" role="radiogroup" aria-label="Group by">
              <button type="button" role="radio" aria-checked={by === 'company'} onclick={() => (distBy = 'company')}>Company</button>
              <button type="button" role="radio" aria-checked={by === 'warehouse'} onclick={() => (distBy = 'warehouse')}>Warehouse</button>
            </div>
          {:else}<span class="caption">By warehouse</span>{/if}
          <select class="select sm" bind:value={distWhen} aria-label="Distribution period"><option value="week">Last 7 days</option><option value="month">{d.mtd ? 'This month' : 'Period'}</option></select>
        </div>
        <ul class="dist">
          {#each dist as x (x.id)}
            <li>
              <span class="who">{#if x.logo}<img src={x.logo} alt="" width="24" height="24" />{:else}<span class="pin"><MapPin size={14} aria-hidden="true" /></span>{/if}{x.label}</span>
              <span class="bar" aria-hidden="true"><span style:width="{x.v != null && distTotal ? (x.v / distTotal) * 100 : 0}%"></span></span>
              <b>{x.v == null ? 'No data yet' : amount(x.v)}</b>
              <span class="sh">{x.v != null && distTotal ? `${Math.round((x.v / distTotal) * 100)}%` : ''}</span>
            </li>
          {/each}
        </ul>
      </TodayCard></div>
    </div>
  </div>
{/if}

<style>
  /* chart colours: navy sales line + orange profit in light, lighter blue + orange in dark */
  :global(:root) { --t-sales: #2a5fa8; --t-profit: #e0601c; }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light'])) { --t-sales: #6aa5ee; --t-profit: #f08a4b; } }
  :global(:root[data-theme='dark']) { --t-sales: #6aa5ee; --t-profit: #f08a4b; }

  .fbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); margin: 0 0 var(--space-5); }
  .fbar label { display: flex; align-items: center; gap: var(--space-2); font-size: 13px; color: var(--text-muted); font-weight: 600; }
  .fbar .select { height: 34px; width: auto; min-width: 120px; padding-right: 28px; }
  .scope { margin-left: auto; font-size: 12px; color: var(--text-muted); }
  .select.sm { height: 32px; width: auto; min-width: 0; padding: 0 28px 0 10px; font-size: 13px; }

  .busy { opacity: 0.6; transition: opacity 0.2s; }
  /* KPI strip */
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-5); margin-bottom: var(--space-5); }
  .kpi { position: relative; display: grid; grid-template-rows: auto auto 1fr auto; min-height: 172px; padding: var(--space-5) var(--space-5) var(--space-4); border-radius: var(--radius-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--elevation-1); color: var(--text); text-decoration: none; overflow: hidden; }
  .kpi:hover { border-color: var(--border-strong); }
  .kpi:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  .lbl { font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .val { margin-top: var(--space-2); font-size: 30px; line-height: 1.15; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 6px; }
  .val small { font-size: 14px; font-weight: 600; color: var(--text-muted); letter-spacing: 0; }
  .val small.delta { font-size: 12px; font-weight: 500; }
  .chg { margin-top: var(--space-2); display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 12px; align-self: start; }
  .sub { color: var(--text-muted); }
  .chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 7px; border-radius: 999px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .chip.up { background: var(--success-subtle); color: var(--success); }
  .chip.down { background: var(--danger-subtle); color: var(--danger); }
  .chip.warn { background: var(--warning-subtle); color: var(--warning); }
  .spk { margin-top: var(--space-3); color: var(--text-muted); }
  .spk.good { color: var(--success); }
  .spk.warn { color: var(--warning-solid); }
  .spk.bad { color: var(--danger); }
  .kpi.rag-good { border-left: 3px solid var(--success); }
  .kpi.rag-warn { border-left: 3px solid var(--warning-solid); }
  .kpi.rag-bad { border-left: 3px solid var(--danger); }

  /* main grid: 2/3 + 1/3 */
  .grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(360px, 1fr); gap: var(--space-5); align-items: start; }
  .col { display: flex; flex-direction: column; gap: var(--space-5); min-width: 0; }
  .tcs { border-radius: var(--radius-lg); }
  .slot { display: flex; flex-direction: column; min-width: 0; }
  .slot > :global(.tc) { flex: 1; }

  .legend { display: flex; gap: 2px; }
  .lg { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 0; background: none; border-radius: var(--radius-md); font: inherit; font-size: 13px; color: var(--text); cursor: pointer; }
  .lg i { width: 10px; height: 10px; border-radius: 50%; }
  .lg[aria-pressed='false'] { color: var(--text-subtle); text-decoration: line-through; }
  .lg[aria-pressed='false'] i { opacity: 0.35; }
  .lg:hover { background: var(--surface-sunken); }

  /* top products */
  .tp { width: 100%; border-collapse: collapse; font-size: 14px; }
  .tp th { text-align: left; font-size: 12px; font-weight: 600; color: var(--text-muted); padding: 0 var(--space-3) var(--space-2); border-bottom: 1px solid var(--border); white-space: nowrap; }
  .tp td { padding: 12px var(--space-3); border-bottom: 1px solid var(--border); vertical-align: middle; }
  .tp tr:last-child td { border-bottom: 0; }
  .tp th:first-child, .tp td:first-child { padding-left: var(--space-6); }
  .tp th:last-child, .tp td:last-child { padding-right: var(--space-6); }
  .tp .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tp .rank { width: 28px; color: var(--text-subtle); font-variant-numeric: tabular-nums; }
  .tp b { font-weight: 600; }
  .pk { display: block; font-size: 12px; color: var(--text-muted); }
  .muted { color: var(--text-muted); font-size: 13px; }
  .below { color: var(--warning); font-weight: 600; }
  .cov { display: inline-block; min-width: 46px; text-align: center; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--surface-sunken); color: var(--text-muted); }
  .cov.bad { background: var(--danger-subtle); color: var(--danger); }
  .cov.warn { background: var(--warning-subtle); color: var(--warning); }
  .cov.ok { background: var(--success-subtle); color: var(--success); }
  .cov.over { background: var(--surface-sunken); color: var(--text-muted); }

  /* decisions */
  .dec { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .dec li + li { border-top: 1px solid var(--border); }
  .dec a { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto 16px; align-items: center; gap: var(--space-3); padding: 12px 0; color: var(--text); text-decoration: none; }
  .dec a:hover b { text-decoration: underline; }
  .dec .ic { display: grid; place-items: center; width: 34px; height: 34px; border-radius: var(--radius-md); background: var(--surface-sunken); color: var(--text-muted); }
  .dec .sev-critical, .dec .sev-high { background: var(--danger-subtle); color: var(--danger); }
  .dec .sev-medium { background: var(--warning-subtle); color: var(--warning); }
  .tx { display: flex; flex-direction: column; min-width: 0; font-size: 12px; color: var(--text-muted); }
  .tx b { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.3; }
  .tx > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
  .tx .own { color: var(--text-subtle); }
  .ct { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
  .ct b { font-size: 20px; line-height: 1.1; }
  .ct span { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
  .dec :global(.chev) { color: var(--text-subtle); }
  .allclear { display: flex; align-items: center; gap: var(--space-2); color: var(--success); margin: 0; }
  .clear { margin-top: var(--space-3); font-size: 13px; }
  .clear summary { cursor: pointer; color: var(--text-muted); font-weight: 600; }
  .clear ul { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
  .clear a { display: flex; justify-content: space-between; gap: var(--space-3); padding: 6px 0; color: var(--text); text-decoration: none; }
  .clear a span { color: var(--text-muted); text-align: right; }

  /* stock */
  .stock { display: flex; align-items: center; gap: var(--space-5); }
  .bands { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .bands li { display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: var(--space-2); }
  .bands i { width: 10px; height: 10px; border-radius: 50%; }
  .bands b { font-variant-numeric: tabular-nums; font-size: 14px; }
  .bands em { font-style: normal; color: var(--text-subtle); margin-left: 6px; font-size: 12px; }
  .bands .zero { color: var(--text-subtle); }
  .bands .zero b { font-weight: 500; }

  /* distribution */
  .drow { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-4); }
  .drow .select { flex: none; }
  .side :global(.xm .lbl) { display: none; }
  .dist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  .dist li { display: grid; grid-template-columns: minmax(96px, 1fr) minmax(40px, 1fr) auto 36px; align-items: center; gap: var(--space-3); font-size: 14px; }
  .who { display: flex; align-items: center; gap: var(--space-2); min-width: 0; color: var(--text); }
  .who img { width: 24px; height: 24px; border-radius: 6px; background: #fff; border: 1px solid var(--border); object-fit: contain; padding: 1px; flex: none; }
  .pin { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: var(--surface-sunken); color: var(--text-muted); flex: none; }
  .bar { height: 6px; border-radius: 3px; background: var(--surface-sunken); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 3px; background: var(--viz-1); opacity: 0.7; }
  .dist b { font-variant-numeric: tabular-nums; text-align: right; }
  .sh { font-size: 12px; color: var(--text-muted); text-align: right; font-variant-numeric: tabular-nums; }

  .age-strip { display: flex; height: 28px; border-radius: 6px; overflow: hidden; margin-bottom: var(--space-3); }
  .age-strip span { display: flex; align-items: center; justify-content: center; min-width: 0; overflow: hidden; font-size: 11px; font-weight: 700; color: #fff; }
  .age-strip .good, .age-leg i.good { background: var(--success); }
  .age-strip .warn, .age-leg i.warn { background: var(--warning-solid); }
  .age-strip .bad, .age-leg i.bad { background: var(--danger); }
  .age-leg { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
  .age-leg li { display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: var(--space-2); }
  .age-leg i { width: 10px; height: 10px; border-radius: 50%; }
  .age-leg b { font-variant-numeric: tabular-nums; }
  .owed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
  .owed li { display: flex; justify-content: space-between; gap: var(--space-3); border-top: 1px solid var(--border); padding-top: 8px; }
  .owed b { font-variant-numeric: tabular-nums; }

  @media (max-width: 1280px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 1100px) {
    /* one column: what needs a decision first, then the trend, stock, distribution and products */
    .grid { grid-template-columns: minmax(0, 1fr); }
    .col { display: contents; }
    .o-dec { order: 1; } .o-chart { order: 2; } .o-stock { order: 3; } .o-owed { order: 4; } .o-dist { order: 5; } .o-top { order: 6; }
  }
  @media (min-width: 700px) and (max-width: 1100px) {
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .o-dec, .o-chart, .o-top { grid-column: 1 / -1; }
    .stock { flex-direction: column; align-items: stretch; } .stock > :global(.ring) { align-self: center; }
  }
  @media (max-width: 380px) { .stock { flex-direction: column; } }
  @media (max-width: 340px) { .kpis { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 900px) { .hide-md { display: none; } }
  @media (max-width: 600px) {
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
    .kpi { min-height: 0; padding: var(--space-3) var(--space-3) var(--space-2); }
    .lbl { font-size: 12px; }
    .val { font-size: 22px; }
    .val small { font-size: 12px; }
    .val small.delta { display: none; }
    .chg { font-size: 11px; }
    .hide-sm { display: none; }
    .grid, .col { gap: var(--space-3); }
    .fbar { gap: var(--space-2); }
    .fbar label { flex: 1 1 45%; }
    .fbar .select { flex: 1; min-width: 0; }
    .scope { margin-left: 0; }
    .tp th:first-child, .tp td:first-child { padding-left: var(--space-4); }
    .tp th:last-child, .tp td:last-child { padding-right: var(--space-4); }
    .tp td, .tp th { padding-left: 8px; padding-right: 8px; }
    .tp .rank { display: none; }
  }
</style>
