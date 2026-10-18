<script lang="ts">
  import RecordFor from '../components/RecordFor.svelte';
  // Director's command view: summary first (KPIs with deltas), then what needs action, then trends and plans.
  // Data: reports.dashboard() (shared report functions) + analytics.summary() for live counts. Charts load Plotly lazily.
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { analytics, lookup, reports, shipments, type DashboardReport, type User } from '@btw/api';
  import { Badge, fmtDateTime, hoursLabel } from '@btw/ui';
  import { BarChart, ChartCard, LineChart, Meter, StatTile, compact, usd } from '../components/charts';
  import { drill } from '../lib/tab';
  import { change, day, pct, points } from '../components/reports/fmt';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import GroupDashboard from '../components/group/GroupDashboard.svelte';
  import PlanUsedTile from '../components/PlanUsedTile.svelte';
  import { can } from '../lib/features';
  import { poApprovals } from '../lib/orders';
  import { company, GROUP } from '../lib/company.svelte';
  import { companyBrand } from '../lib/companies';
  let { user }: { user: User } = $props();
  const groupView = company.active === GROUP; // the shell remounts screens on a company switch
  const co = groupView ? null : companyBrand(company.active);

  const canReports = $derived(can(user, 'dashboard'));
  const canPeriod = $derived(can(user, 'reports'));
  let s = $state<Awaited<ReturnType<typeof analytics.summary>>>();
  let d = $state<DashboardReport | null>(null);
  let active = $state<Awaited<ReturnType<typeof shipments.list>>>([]);
  const w = watch(async () => {
    const [sum, list, dash] = await Promise.all([analytics.summary(), shipments.list(), canReports ? reports.dashboard() : Promise.resolve(null)]);
    s = sum; active = list.filter((x) => x.status !== 'Acknowledged'); d = dash;
  });
  const attention = $derived.by(() => {
    if (!s) return [];
    const items: { n: number; text: string; href: string; tone: 'danger' | 'warning' | 'info' }[] = [
      { n: poApprovals() ? s.plansPending : 0, text: `purchase order${s.plansPending === 1 ? '' : 's'} waiting for approval`, href: '#/plans?status=Submitted', tone: 'warning' },
      { n: s.paymentsPending, text: `transport payment${s.paymentsPending === 1 ? '' : 's'} to approve`, href: '#/finance', tone: 'warning' },
      { n: d?.logistics.overdue ?? 0, text: `truck${d?.logistics.overdue === 1 ? '' : 's'} missed a check-in`, href: '#/shipments?chip=no-checkin', tone: 'danger' },
      { n: s.trucksDelayed, text: `truck${s.trucksDelayed === 1 ? '' : 's'} running late`, href: '#/shipments?chip=Delayed', tone: 'danger' },
      { n: d?.suggestions.filter((x) => x.urgency !== 'soon').length ?? 0, text: 'orders to place this week to avoid stock-outs', href: '#/reports?r=planning', tone: 'warning' },
      { n: d?.capture.high ?? 0, text: 'high-priority capture gaps in the last 30 days', href: '#/reports?r=period&mode=check', tone: 'info' },
    ];
    return items.filter((i) => i.n > 0);
  });
  const q = $derived(d?.quarter);
</script>

{#if groupView}
  <GroupDashboard {user} />
{:else}
<div class="page-head">
  <div><div class="overline crumb">{co?.shortName ?? ''} · command view</div><h1>Good day, {user.name.split(' ')[0]}</h1>
    {#if d}<p class="caption">As of {day(d.asOf)} · last 30 days compared with the 30 days before</p>{/if}</div>
  <div class="row">
    {#if canPeriod}<a class="btn btn-secondary" href="#/reports?r=period&mode=plan"><CalendarRange size={16} />Plan a period</a><a class="btn btn-secondary" href="#/reports">All reports</a>{/if}
    {#if user.roles.includes('planner')}<RecordFor what="a purchase order" cue={false}><a class="btn btn-primary" href="#/plans/new">New purchase order</a></RecordFor>{/if}
  </div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if !s}
  <div class="tiles">{#each Array(6) as _}<div class="card"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="height:32px;margin-top:12px"></div></div>{/each}</div>
{:else}
  {#if d}
    {@const k = d.kpis}
    <div class="tiles">
      <StatTile label="Sales · 30 days" value={usd(k.revenue30)} delta={change(k.revenue30, k.revenuePrev30)} trend={d.spark.revenue} hint={k.revenueLy30 ? `${pct(change(k.revenue30, k.revenueLy30) ?? 0)} on last year` : undefined} onclick={() => drill('/sales', {})} />
      <StatTile label="Cases sold · 30 days" value={compact(k.cases30)} delta={change(k.cases30, k.casesPrev30)} trend={d.spark.cases} onclick={() => drill('/sales', {})} />
      <StatTile label="Gross margin" value={pct(k.marginPct30, 1)} delta={points(k.marginPct30, k.marginPctPrev30)} deltaLabel="points vs previous 30 days" hint="after landing cost" onclick={() => (location.hash = '/reports?r=finance')} />
      <StatTile label="On-time deliveries" value={k.onTimePct === null ? '—' : pct(k.onTimePct)} delta={points(k.onTimePct, k.onTimePrev)} deltaLabel="points vs previous 90 days" trend={d.spark.onTime.map((x) => x ?? 0)} hint="last 90 days" onclick={() => (location.hash = '/reports?r=logistics')} />
      <StatTile label="Owed by customers" value={usd(k.outstanding)} upIsGood={false} delta={change(k.outstanding, k.outstandingPrev)} deltaLabel="vs 30 days ago" onclick={() => drill('/sales', { status: 'Unpaid' })} />
      <StatTile label="Stock value" value={usd(k.stockValue)} hint={k.stockCover ? `${k.stockCover} days of cover · ${compact(s.inTransitCases)} cases on the road` : undefined} onclick={() => drill('/inventory', {})} />
    </div>
  {:else}
    <div class="tiles">
      <StatTile label="Trucks on the road" value={String(s.trucksActive)} hint="{s.trucksDelayed} delayed · {s.trucksAtBorder} at a border" onclick={() => drill('/shipments', { chip: 'active' })} />
      <StatTile label="Stock on hand" value="{compact(s.stockCases)} cases" hint="{compact(s.inTransitCases)} in transit" onclick={() => drill('/inventory', {})} />
    </div>
  {/if}

  <div class="charts-grid">
    <section class="card">
      <header class="row between"><h3>Needs your attention</h3><span class="caption">{attention.length ? `${attention.length} item${attention.length === 1 ? '' : 's'}` : 'all clear'}</span></header>
      <ul class="att">
        {#each attention as a}<li><Badge tone={a.tone}>{a.n}</Badge><a class="grow" href={a.href}>{a.text}</a><ArrowRight size={16} /></li>
        {:else}<li class="empty">Nothing needs action right now.</li>{/each}
      </ul>
    </section>
    {#if q}
      <section class="card">
        <header class="row between"><h3>{q.label} so far</h3><a class="small" href="#/reports?r=quarterly">Quarterly review</a></header>
        <div class="stack-sm" style="margin-top:var(--space-2)">
          <Meter label="Sales against the projected quarter" value={q.revenue} max={Math.max(q.projected, q.lyFull ?? 0, q.revenue) * 1.05} target={q.lyFull ?? undefined} format={usd}
            note="{Math.round(q.elapsedPct * 100)}% of the quarter gone · on pace for {usd(q.projected)}{q.lyFull ? ` vs ${usd(q.lyFull)} in the same quarter last year (target tick)` : ''}" />
          <p class="small">{change(q.revenue, q.prevSamePoint) === null ? '' : `${(change(q.revenue, q.prevSamePoint)! >= 0 ? '+' : '−') + Math.abs(Math.round(change(q.revenue, q.prevSamePoint)! * 100))}% on the same point of last quarter.`}</p>
        </div>
      </section>
    {/if}

    {#if d}
      <ChartCard span={2} title="Sales by month vs last year" subtitle="click the chart's legend to hide a line" filename="sales-12-months"
        rows={() => [['Month', 'Revenue (USD)', 'Last year (USD)'], ...d!.trend.map((t) => [t.label, t.revenue, t.lyRevenue ?? ''])]}>
        <LineChart label="Sales by month, this year and last year" labels={d.trend.map((t) => t.key)} format={usd} rangeslider={false}
          series={[{ name: 'This year', values: d.trend.map((t) => t.revenue), area: true }, { name: 'Last year', values: d.trend.map((t) => t.lyRevenue), dashed: true, slot: 8 }]}
          onselect={(x) => (location.hash = `/reports?r=sales`)} />
      </ChartCard>

      <section class="card">
        <header class="row between"><div><h3>Order before you run out</h3><p class="caption">from sales pace, stock, trucks on the road and lane lead times</p></div><a class="small" href="#/reports?r=planning">Planning</a></header>
        <ul class="att">
          {#each d.suggestions.slice(0, 5) as x}<li><Badge tone={x.urgency === 'overdue' ? 'danger' : x.urgency === 'this week' ? 'warning' : 'info'}>{day(x.orderBy)}</Badge><span class="grow small">{x.text}</span></li>
          {:else}<li class="empty">No stock-outs expected in the next 60 days.</li>{/each}
        </ul>
      </section>
      {#if can(user, 'planned-vs-actual')}<PlanUsedTile />{/if}
      <section class="card period">
        <h3>Plan a period or check what was captured</h3>
        <div class="pgrid">
          <a class="pcard" href="#/reports?r=period&mode=plan"><CalendarRange size={20} /><b>Plan</b><span>Demand, stock and trucks for the next 30/60/90 days, against what is already planned.</span></a>
          <a class="pcard" href="#/reports?r=period&mode=check"><ClipboardCheck size={20} /><b>Check</b><span>Completeness {pct(d.capture.score)} over the last 30 days · {d.capture.issues} item{d.capture.issues === 1 ? '' : 's'} to fix.</span></a>
        </div>
      </section>

      <ChartCard title="On-time deliveries by month" subtitle="within 6 h of the planned arrival" filename="on-time-12-months" rows={() => [['Month', 'On time'], ...d!.logistics.onTimeTrend.map((t) => [t.label, t.onTimePct === null ? '' : pct(t.onTimePct)])]}>
        <LineChart label="On-time deliveries by month" labels={d.logistics.onTimeTrend.map((t) => t.key)} series={[{ name: 'On time', values: d.logistics.onTimeTrend.map((t) => (t.onTimePct === null ? null : Math.round(t.onTimePct * 1000) / 10)), slot: 2 }]} format={(n) => `${n.toFixed(0)}%`} yTitle="% on time" rangeslider={false} height={220} />
      </ChartCard>
      <ChartCard title="What customers owe, by age" subtitle="click to see unpaid sales" filename="receivables" rows={() => [['Age', 'Amount (USD)'], ...d!.receivables.map((r) => [r.label, r.amount])]}>
        <BarChart label="Customer balances by age" categories={d.receivables.map((r) => r.label)} series={[{ name: 'Owed', values: d.receivables.map((r) => r.amount), slot: 1 }]} format={usd} height={220} onselect={() => drill('/sales', { status: 'Unpaid' })} />
      </ChartCard>

      <section class="card">
        <header class="row between"><h3>Movers</h3><span class="caption">last 30 days vs the 30 before</span></header>
        <ul class="att">
          {#each [...d.movers.up, ...d.movers.down] as m}<li><a class="mover" href="#/analytics?tab=list&brand={m.productId}">
            <Badge tone={m.change >= 0 ? 'success' : 'danger'}>{m.change >= 0 ? '▲' : '▼'} {Math.abs(Math.round(m.change * 100))}%</Badge><span class="grow small"><b>{m.brand}</b> {m.pack} · {m.warehouse}</span><span class="num small">{usd(m.revenue)}</span></a></li>
          {:else}<li class="empty">No big moves.</li>{/each}
        </ul>
      </section>
    {/if}

    <section class="card flush">
      <header><h3>Trucks on the road</h3><a href="#/tracking" class="small">Tracking map</a></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Truck</th><th class="hide-sm">Route</th><th>Status</th><th>ETA</th></tr></thead>
        <tbody>
          {#each active.slice(0, 6) as sh}
            {@const leg = sh.legs.find((l) => l.status !== 'Acknowledged') ?? sh.legs.at(-1)!}
            {@const eta = shipments.eta(leg)}
            <tr class="clickable" onclick={() => (location.hash = `/shipments/${sh.id}`)}>
              <td><strong>{lookup.truck(leg.truckId)?.reg}</strong><div class="caption">{sh.ref} · leg {leg.seq}/{sh.legs.length}</div></td>
              <td class="small hide-sm">{lookup.route(leg.routeId)?.name}</td>
              <td><Badge status={sh.status} /></td>
              <td><Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge><div class="caption">{fmtDateTime(eta.eta)}</div></td>
            </tr>
          {:else}<tr><td colspan="4" class="empty">No trucks on the road</td></tr>{/each}
        </tbody>
      </table></div>
    </section>
  </div>
{/if}
{/if}

<style>
  .att { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
  .att li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-top: 1px solid var(--border); }
  .att li:first-child { border-top: 0; }
  .mover { display: flex; align-items: center; gap: var(--space-3); flex: 1; text-decoration: none !important; }
  .mover:hover { background: var(--primary-subtle); }
  .att a { color: var(--text); }
  .pgrid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-top: var(--space-3); }
  .pcard { display: flex; flex-direction: column; gap: 4px; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--text); text-decoration: none !important; }
  .pcard:hover { border-color: var(--primary); background: var(--primary-subtle); }
  .pcard span { color: var(--text-muted); font-size: var(--fs-body-sm); }
  @media (max-width: 600px) { .hide-sm { display: none; } .pgrid { grid-template-columns: 1fr; } }
</style>
