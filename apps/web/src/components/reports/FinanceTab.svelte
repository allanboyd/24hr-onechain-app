<script lang="ts">
  import { reports, type FinanceReport, type ReportFilter } from '@btw/api';
  import { BarChart, ChartCard, Donut, LineChart, StatTile, usd } from '../charts';
  import { drill } from '../../lib/tab';
  import { watch } from '../../lib/load.svelte';
  import ErrorState from '../ErrorState.svelte';
  import { pct } from './fmt';
  let { filter }: { filter: ReportFilter } = $props();
  let r = $state<FinanceReport | null>(null);
  const w = watch(async () => { r = await reports.finance(filter); }, () => JSON.stringify(filter));
  const perCase = (n: number) => `USD ${n.toFixed(2)}`;
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if !r}<div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
{:else}
  <div class="tiles">
    <StatTile label="Landing cost per case" value={perCase(r.totals.perCase)} upIsGood={false} hint="{r.totals.trips} trucks loaded · goods + all trip costs" trend={r.trend.map((x) => x.perCase ?? 0)} />
    <StatTile label="Landing cost (total)" value={usd(r.totals.landing)} hint="goods {usd(r.totals.goods)} + costs {usd(r.totals.expenses)}" />
    <StatTile label="Owed to transporters" value={usd(r.payments.dueAmount)} upIsGood={false} hint="{r.payments.dueTrips} trips · {r.payments.overdueTrips} over 30 days ({usd(r.payments.overdueAmount)})" onclick={() => drill('/transport-costs', { tab: 'trips' })} />
    <StatTile label="Payments awaiting approval" value={String(r.payments.pendingCount)} hint={r.payments.pendingCount ? usd(r.payments.pendingApproval) : 'nothing waiting'} onclick={() => drill('/transport-costs', { tab: 'trips' })} />
    <StatTile label="Agreed price not recorded" value={String(r.totals.agreedMissing ?? 0)} upIsGood={false} hint={(r.totals.agreedMissing ?? 0) ? 'trucks loaded without an agreed transport price — counted, not as zero' : 'every truck has its agreed price'} onclick={() => drill('/trucks', {})} />
  </div>
  <div class="charts-grid">
    <ChartCard title="Landing cost per case by month" subtitle="goods + transport + duties + clearing + handling, per case" filename="landing-trend" rows={() => [['Month', 'Landing cost per case (USD)', 'Transport per case (USD)', 'Trucks'], ...r!.trend.map((x) => [x.label, x.perCase ?? '', x.transportPerCase ?? '', x.trips])]}>
      <LineChart label="Landing cost per case by month" labels={r.trend.map((x) => x.key)} series={[{ name: 'Landing cost per case', values: r.trend.map((x) => x.perCase) }]} format={perCase} rangeslider={false} />
    </ChartCard>
    <ChartCard title="Transport per case by month" subtitle="agreed transport only" filename="transport-trend" rows={() => [['Month', 'Transport per case (USD)', 'Trucks'], ...r!.trend.map((x) => [x.label, x.transportPerCase ?? '', x.trips])]}>
      <LineChart label="Transport cost per case by month" labels={r.trend.map((x) => x.key)} series={[{ name: 'Transport per case', values: r.trend.map((x) => x.transportPerCase), slot: 1 }]} format={perCase} rangeslider={false} />
    </ChartCard>
    <ChartCard title="Landing cost by lane" subtitle="per case, in this period" filename="landing-by-lane" rows={() => [['Lane', 'Trucks', 'Landing per case (USD)', 'Transport per case (USD)'], ...r!.byLane.map((l) => [l.name, l.trips, l.perCase, l.transportPerCase])]}>
      <BarChart label="Landing cost per case by lane" horizontal categories={r.byLane.map((l) => l.name)} series={[{ name: 'Per case', values: r.byLane.map((l) => l.perCase), slot: 2 }]} format={perCase} />
    </ChartCard>
    <ChartCard title="Where the money goes" subtitle="trip costs by kind" filename="cost-mix" rows={() => [['Cost', 'Amount (USD)'], ...r!.costMix.map((c) => [c.kind, c.amount])]}>
      <Donut label="Trip costs by kind" data={r.costMix.map((c) => ({ label: c.kind, value: c.amount }))} format={usd} center={usd(r.totals.expenses)} />
    </ChartCard>
    <ChartCard title="Gross margin by brand" subtitle="sales − cases sold × landing cost per case" filename="margin-by-brand" rows={() => [['Brand', 'Pack', 'Revenue (USD)', 'Cost of goods (USD)', 'Margin (USD)', 'Margin %'], ...r!.byBrand.map((b) => [b.brand, b.pack, b.revenue, b.cogs, b.margin, pct(b.marginPct, 1)])]}>
      <BarChart label="Gross margin by brand" horizontal categories={r.byBrand.map((b) => b.brand)} series={[{ name: 'Margin', values: r.byBrand.map((b) => b.margin), slot: 3 }]} format={usd} onselect={(c) => drill('/performance', { tab: 'products' })} />
    </ChartCard>
    <ChartCard title="Transport by provider" subtitle="agreed vs paid, in this period" filename="transport-by-provider" rows={() => [['Provider', 'Trucks', 'Agreed (USD)', 'Paid (USD)', 'Balance (USD)', 'Agreed price not recorded (trucks)'], ...r!.byProvider.map((p) => [p.name, p.trips, p.agreed, p.paid, p.balance, p.agreedMissing ?? 0])]}>
      <BarChart label="Transport agreed and paid by provider" horizontal categories={r.byProvider.map((p) => p.name)} series={[{ name: 'Paid', values: r.byProvider.map((p) => p.paid) }, { name: 'Still owed', values: r.byProvider.map((p) => p.balance), slot: 1 }]} stacked format={usd} onselect={() => drill('/transport-costs', { tab: 'trips' })} />
    </ChartCard>
  </div>
{/if}
