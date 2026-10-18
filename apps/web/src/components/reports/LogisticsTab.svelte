<script lang="ts">
  import { reports, type LogisticsReport, type ReportFilter } from '@btw/api';
  import { BarChart, ChartCard, LineChart, StatTile } from '../charts';
  import { drill } from '../../lib/tab';
  import { watch } from '../../lib/load.svelte';
  import ErrorState from '../ErrorState.svelte';
  import { pct, points } from './fmt';
  let { filter }: { filter: ReportFilter } = $props();
  let r = $state<LogisticsReport | null>(null);
  const w = watch(async () => { r = await reports.logistics(filter); }, () => JSON.stringify(filter));
  const days = (n: number) => `${n.toFixed(1)} d`;
  const hours = (n: number) => `${Math.round(n)} h`;
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if !r}<div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
{:else}
  <div class="tiles">
    <StatTile label="On-time deliveries" value={r.onTimePct === null ? '—' : pct(r.onTimePct)} delta={points(r.onTimePct, r.prevOnTimePct)} deltaLabel="points vs previous period" hint="{r.delivered} delivered · within 6 h of plan" trend={r.trend.map((t) => t.onTimePct ?? 0)} />
    <StatTile label="Average transit" value={r.avgTransitDays === null ? '—' : `${r.avgTransitDays} days`} hint="loading point → final warehouse" upIsGood={false} />
    <StatTile label="Damaged or short" value={r.damagePct === null ? '—' : pct(r.damagePct, 2)} upIsGood={false} hint="of cases expected at delivery" />
    <StatTile label="On the road now" value={String(r.open.active)} hint="{r.open.delayed} delayed · {r.open.atBorder} at a border · {r.open.overdue} missed check-in" onclick={() => drill('/shipments', { chip: r!.open.overdue ? 'no-checkin' : r!.open.delayed ? 'Delayed' : 'active' })} />
  </div>
  <div class="charts-grid">
    <ChartCard span={2} title="On-time deliveries by month" subtitle="share of deliveries within 6 h of the planned arrival" filename="on-time-trend"
      rows={() => [['Month', 'On time', 'Deliveries', 'Average transit (days)'], ...r!.trend.map((t) => [t.label, t.onTimePct === null ? '' : pct(t.onTimePct), t.deliveries, t.transitDays ?? ''])]}>
      <LineChart label="On-time deliveries by month" labels={r.trend.map((t) => t.key)} series={[{ name: 'On time', values: r.trend.map((t) => (t.onTimePct === null ? null : Math.round(t.onTimePct * 1000) / 10)), area: true }]} format={(n) => `${n.toFixed(0)}%`} yTitle="% on time" rangeslider={false} />
    </ChartCard>
    <ChartCard title="Transit time by lane" subtitle="median and the slowest 20% (P80), in days" filename="transit-by-lane" rows={() => [['Lane', 'Trips', 'Median days', 'P80 days', 'On time', 'Damaged/short'], ...r!.lanes.map((l) => [l.name, l.trips, l.medianDays, l.p80Days, pct(l.onTimePct), pct(l.damagePct, 2)])]}>
      <BarChart label="Transit days by lane" horizontal categories={r.lanes.map((l) => l.name)} series={[{ name: 'Median', values: r.lanes.map((l) => l.medianDays) }, { name: 'P80', values: r.lanes.map((l) => l.p80Days), slot: 2 }]} format={days} />
    </ChartCard>
    <ChartCard title="Border waiting" subtitle="actual hours vs planned dwell" filename="border-dwell" rows={() => [['Border', 'Crossings', 'Median hours', 'P80 hours', 'Planned hours'], ...r!.borders.map((b) => [b.name, b.crossings, b.medianHours, b.p80Hours, b.plannedHours])]}>
      <BarChart label="Border waiting hours" horizontal categories={r.borders.map((b) => b.name.replace(/ border.*/, ''))} series={[{ name: 'Median actual', values: r.borders.map((b) => b.medianHours), slot: 1 }, { name: 'Planned', values: r.borders.map((b) => b.plannedHours), slot: 8 }]} format={hours} />
    </ChartCard>
    <ChartCard title="Delays by cause" subtitle="truck issues logged in the period · hours stopped" filename="delays-by-cause" rows={() => [['Cause', 'Issues', 'Hours stopped'], ...r!.delays.map((d) => [d.reason, d.count, d.hours])]}>
      {#if r.delays.length}<BarChart label="Hours stopped by cause" horizontal categories={r.delays.map((d) => d.reason)} series={[{ name: 'Hours', values: r.delays.map((d) => d.hours), slot: 3 }]} format={hours} />{:else}<p class="empty">No truck issues in this period.</p>{/if}
    </ChartCard>
    <ChartCard title="Truck use" subtitle="share of the period on the road · average load" filename="truck-utilisation" rows={() => [['Truck', 'Provider', 'Trips', 'Days on road', 'Utilisation', 'Average load'], ...r!.trucks.map((t) => [t.reg, t.provider, t.trips, t.daysOnRoad, pct(t.utilisationPct), pct(t.avgLoadPct)])]}>
      <BarChart label="Truck utilisation" horizontal categories={r.trucks.map((t) => `${t.reg} · ${t.provider}`)} series={[{ name: 'Days on the road', values: r.trucks.map((t) => t.daysOnRoad), slot: 5 }]} format={(n) => `${n.toFixed(0)} d`} />
    </ChartCard>
    <ChartCard span={2} title="Drivers" filename="drivers" rows={() => [['Driver', 'Trips', 'On time', 'Cases lost (short + damaged)'], ...r!.drivers.map((d) => [d.name, d.trips, pct(d.onTimePct), d.lostCases])]}>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Driver</th><th class="num">Trips</th><th class="num">On time</th><th class="num">Cases short or damaged</th></tr></thead>
        <tbody>{#each r.drivers as d}<tr><td>{d.name}</td><td class="num">{d.trips}</td><td class="num">{pct(d.onTimePct)}</td><td class="num">{d.lostCases}</td></tr>{:else}<tr><td colspan="4" class="empty">No deliveries in this period.</td></tr>{/each}</tbody>
      </table></div>
    </ChartCard>
  </div>
{/if}
