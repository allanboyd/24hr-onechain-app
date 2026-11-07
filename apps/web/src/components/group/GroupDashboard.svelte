<script lang="ts">
  // Group command view for directors (docs/06 §3–4). Data: reports.group() — consolidated total (intercompany
  // removed), each company's KPIs, a league table and the monthly trend per company — plus each company's
  // stock-out suggestions. Read-only: acting on anything switches to the company that owns it.
  import { reports, type GroupReport, type Suggestion, type User } from '@btw/api';
  import { watch } from '../../lib/load.svelte';
  import ErrorState from '../ErrorState.svelte';
  import CompanyMark from '../CompanyMark.svelte';
  import { BarChart, ChartCard, Donut, LineChart, StatTile, compact, usd } from '../charts';
  import { pct } from '../reports/fmt';
  import PlanUsedTile from '../PlanUsedTile.svelte';
  import { can } from '../../lib/features';
  import { allowedIds, setCompany } from '../../lib/company.svelte';
  import { companyBrand, companyLabel } from '../../lib/companies';
  import { DEFAULT_PERIOD, PERIODS, datesOf, type PeriodKey } from '../../screens/dash/period';
  // embedded: shown as the "Companies side by side" tab of Home, which has its own heading
  let { user, embedded = false }: { user: User; embedded?: boolean } = $props();

  type Kpis = GroupReport['total'];
  let period = $state<PeriodKey>(DEFAULT_PERIOD);
  const periodShort = $derived(PERIODS.find((p) => p.key === period)!.short);
  let g = $state<GroupReport | null>(null);
  let sugg = $state<(Suggestion & { entityId: string })[]>([]);
  const w = watch(async () => {
    const range = datesOf(period);
    const ids = allowedIds(user);
    const [gr, ...plans] = await Promise.all([reports.group(range), ...ids.map((id) => reports.planning({ horizonDays: 60, entityId: id }))]);
    g = gr;
    sugg = plans.flatMap((p, i) => p.suggestions.filter((s) => s.urgency !== 'soon').map((s) => ({ ...s, entityId: ids[i] }))).sort((a, b) => a.orderBy.localeCompare(b.orderBy)).slice(0, 8);
  }, () => period);

  type Col = { label: string; get: (k: Kpis) => number | null; fmt: (v: number) => string; low?: boolean };
  const cols: Col[] = [
    { label: 'Sales', get: (k) => k.revenue, fmt: usd },
    { label: 'Gross margin', get: (k) => k.marginPct, fmt: (v) => pct(v, 1) },
    { label: 'On time', get: (k) => k.onTimePct, fmt: (v) => pct(v) },
    { label: 'Stock value', get: (k) => k.stockValue, fmt: usd },
    { label: 'Stock turns', get: (k) => k.stockTurns, fmt: (v) => `${v.toFixed(1)}×` },
    { label: 'Owed by customers', get: (k) => k.receivables, fmt: usd, low: true },
    { label: 'Landing / case', get: (k) => k.landingCostPerCase, fmt: (v) => `USD ${v.toFixed(2)}`, low: true },
  ];
  // End the trend at the last complete month (a 10-day-old month would look like a collapse).
  const trend = $derived(g ? g.trend.filter((m) => m.key.slice(0, 7) !== new Date().toISOString().slice(0, 7)) : []);
  const league = $derived(g ? [...g.league].sort((a, b) => b.revenue - a.revenue) : []);
  const sumRev = $derived(league.reduce((a, c) => a + c.revenue, 0));
  const best = (col: Col, v: number | null) => {
    if (v == null || league.length < 2) return false;
    const vals = league.map((c) => col.get(c)).filter((x): x is number => x != null);
    return v === (col.low ? Math.min(...vals) : Math.max(...vals));
  };
  const go = (id: string) => setCompany(user, id);
</script>

{#if embedded}
  <div class="fbar"><p class="caption">BTW Global · Nihna Unique · Kivu combined{g ? ` · ${g.fxBasis}` : ''}</p>
    <label>Period <select class="select" bind:value={period}>{#each PERIODS as p}<option value={p.key}>{p.label}</option>{/each}</select></label></div>
{:else}
<div class="page-head">
  <div><div class="overline crumb">Group command view</div><h1>Good day, {user.name.split(' ')[0]}</h1>
    <p class="caption">BTW Global · Nihna Unique · Kivu combined{g ? ` · ${g.fxBasis}` : ''}</p></div>
  <label class="field" style="width:auto">Period <select class="select" bind:value={period}>{#each PERIODS as p}<option value={p.key}>{p.label}</option>{/each}</select></label>
</div>
{/if}
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if !g}
  <div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="height:32px;margin-top:12px"></div></div>{/each}</div>
{:else}
  {@const T = g.total}
  {@const split = (f: (k: Kpis) => number | null, fmt: (v: number) => string) => league.map((c) => `${companyLabel(c.entityId)} ${f(c) == null ? '—' : fmt(f(c)!)}`).join(' · ')}
  <div class="tiles">
    <StatTile label="Group sales · {periodShort.toLowerCase()}" value={usd(T.revenue)} hint={league.map((c) => `${companyLabel(c.entityId)} ${pct(c.share)}`).join(' · ')} />
    <StatTile label="Cases sold" value={compact(T.cases)} hint={split((k) => k.cases, compact)} />
    <StatTile label="Gross margin" value={pct(T.marginPct, 1)} hint={split((k) => k.marginPct, (v) => pct(v, 1))} />
    <StatTile label="On-time deliveries" value={T.onTimePct == null ? '—' : pct(T.onTimePct)} hint="{T.deliveries} deliveries · all lanes" />
    <StatTile label="Group stock value" value={usd(T.stockValue)} hint={split((k) => k.stockValue, usd)} />
    <StatTile label="Owed by customers" value={usd(T.receivables)} upIsGood={false} hint={split((k) => k.receivables, usd)} />
  </div>

  {#if can(user, 'planned-vs-actual')}<div style="margin-top:var(--space-4)"><PlanUsedTile group /></div>{/if}

  <section class="card flush" style="margin-top:var(--space-4)">
    <header class="pad"><h3>How the companies compare</h3><p class="caption">ranked by sales · best in each column in bold green · click a company to work in it</p></header>
    <div class="table-wrap"><table class="table league">
      <thead><tr><th>#</th><th>Company</th>{#each cols as c}<th class="num">{c.label}</th>{/each}<th class="num">Share</th><th class="num">vs previous</th></tr></thead>
      <tbody>
        {#each league as c, i (c.entityId)}
          <tr class="clickable" onclick={() => go(c.entityId)}>
            <td class="num">{i + 1}</td>
            <td><span class="co"><CompanyMark entityId={c.entityId} size={22} /><strong>{c.shortName}</strong></span></td>
            {#each cols as col}{@const v = col.get(c)}<td class="num" class:best={best(col, v)}>{v == null ? '—' : col.fmt(v)}</td>{/each}
            <td class="num">{pct(c.share)}</td>
            <td class="num">{c.revenueChange == null ? '—' : `${c.revenueChange >= 0 ? '+' : '−'}${Math.abs(Math.round(c.revenueChange * 100))}%`}</td>
          </tr>
        {/each}
        <tr class="subtotal"><td></td><td>Sum of companies</td><td class="num">{usd(sumRev)}</td><td colspan={cols.length + 1}></td></tr>
        <tr class="subtotal"><td></td><td>Less intercompany</td><td class="num">− {usd(g.lessIntercompany.revenue)}</td><td colspan={cols.length + 1} class="caption">{g.lessIntercompany.sales ? `${g.lessIntercompany.sales} sales between the sibling companies (${compact(g.lessIntercompany.cases)} cases)` : 'no sales between the sibling companies in this period'}</td></tr>
        <tr class="grand"><td></td><td><strong>Group (consolidated)</strong></td>{#each cols as col}{@const v = col.get(T)}<td class="num">{v == null ? '—' : col.fmt(v)}</td>{/each}<td class="num">100%</td><td></td></tr>
      </tbody>
    </table></div>
  </section>

  <div class="charts-grid" style="margin-top:var(--space-4)">
    <ChartCard span={2} title="Sales by month, by company" subtitle="each company and the consolidated group (dashed) · click a line to work in that company" filename="group-sales-by-month"
      rows={() => [['Month', ...league.map((c) => c.shortName), 'Group'], ...trend.map((m) => [m.label, ...league.map((c) => m.byEntity[c.entityId] ?? 0), m.total])]}>
      <LineChart label="Sales by month for each company and the group" labels={trend.map((m) => m.key)} format={usd} rangeslider={false}
        series={[...league.map((c, i) => ({ name: c.shortName, values: trend.map((m) => m.byEntity[c.entityId] ?? 0), slot: i })), { name: 'Group', values: trend.map((m) => m.total), dashed: true, slot: 8 }]}
        onselect={(_, name) => { const c = league.find((x) => x.shortName === name); if (c) go(c.entityId); }} />
    </ChartCard>
    <ChartCard title="Share of group sales" subtitle="last 30 days" filename="group-share" rows={() => [['Company', 'Sales (USD)', 'Share'], ...league.map((c) => [c.name, c.revenue, pct(c.share)])]}>
      <Donut label="Share of group sales by company" data={league.map((c) => ({ label: c.shortName, value: c.revenue }))} format={usd} center={usd(T.revenue)}
        onselect={(l) => { const c = league.find((x) => x.shortName === l); if (c) go(c.entityId); }} />
    </ChartCard>
    <ChartCard title="Where each company stands" subtitle="stock value, money owed and transport spend, USD" filename="group-position"
      rows={() => [['Company', 'Stock value', 'Owed by customers', 'Transport spend'], ...league.map((c) => [c.name, c.stockValue, c.receivables, c.transportSpend])]}>
      <BarChart label="Stock value, money owed and transport spend by company" categories={league.map((c) => c.shortName)} format={usd}
        series={[{ name: 'Stock value', values: league.map((c) => c.stockValue) }, { name: 'Owed by customers', values: league.map((c) => c.receivables), slot: 1 }, { name: 'Transport spend', values: league.map((c) => c.transportSpend), slot: 2 }]}
        onselect={(cat) => { const c = league.find((x) => x.shortName === cat); if (c) go(c.entityId); }} />
    </ChartCard>
  </div>

  <section class="card flush" style="margin-top:var(--space-4)">
    <header class="pad"><h3>Order before you run out — by company</h3><p class="caption">overdue and this week · each company orders on its own letterhead</p></header>
    <ul class="att">
      {#each sugg as s}
        <li><CompanyMark entityId={s.entityId} size={22} /><span class="grow small"><strong>{companyBrand(s.entityId).shortName}</strong> · {s.text}</span>
          <button class="btn btn-ghost btn-sm" onclick={() => { go(s.entityId); location.hash = '/reports?r=planning'; }}>Plan in {companyLabel(s.entityId)}</button></li>
      {:else}<li class="empty small">No urgent orders in any company.</li>{/each}
    </ul>
  </section>
{/if}

<style>
  .pad { padding: var(--space-4) var(--space-5); }
  .co { display: inline-flex; align-items: center; gap: var(--space-2); white-space: nowrap; }
  .league td.best { font-weight: 700; color: var(--success); }
  .att { list-style: none; margin: 0; padding: 0; }
  .att li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border); }
  .fbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
  .fbar label { display: flex; align-items: center; gap: var(--space-2); font-size: 13px; color: var(--text-muted); }
</style>
