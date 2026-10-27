<script lang="ts">
  // Logistics at a glance: status, on-time rate, transit vs plan by lane, border waits vs plan, losses by leg.
  import { lookup, tracking, type Acknowledgement, type Leg, type Shipment } from '@btw/api';
  import { BarChart, ChartCard, Donut, Gauge, Meter, StatTile } from '../charts';
  import { drill } from '../../lib/tab';
  import { shipmentTiles } from '../../lib/tiles';
  import { onTimeOf } from '@btw/api/metrics';
  let { list }: { list: Shipment[] } = $props();
  const B = '/shipments';
  const H = 36e5;
  // docs/18: the tiles and the on-time gauge use the shared definitions (metrics registry)
  const fig = $derived(shipmentTiles(list, (id) => lookup.route(id)?.stops ?? []));
  const delivered = $derived(list.filter(fig.is.delivered));
  const onTime = $derived(fig.onTime);
  const legs = $derived(list.flatMap((s) => s.legs));
  const done = $derived(legs.filter((l) => l.passes.at(-1)?.arrivedAt && l.departedAt));
  const STATUSES = ['Planned', 'Loaded', 'Dispatched', 'In transit', 'At border', 'Delayed', 'Arrived', 'Acknowledged'];
  const byStatus = $derived(STATUSES.map((st) => ({ label: st === 'Acknowledged' ? 'Delivered' : st, value: list.filter((s) => s.status === st).length })).filter((x) => x.value));
  const chipFor = (label: string) => (label === 'Delivered' ? 'delivered' : label === 'Delayed' ? 'delayed' : label === 'At border' ? 'border' : 'road');

  // Transit time by lane: actual (completed legs) vs planned hours
  const lanes = $derived.by(() => {
    const m = new Map<string, { actual: number[]; planned: number }>();
    for (const l of done) {
      const r = lookup.route(l.routeId); if (!r) continue;
      const cur = m.get(r.name) ?? { actual: [], planned: r.stops.at(-1)!.plannedHours };
      cur.actual.push((Date.parse(l.passes.at(-1)!.arrivedAt!) - Date.parse(l.departedAt!)) / H); m.set(r.name, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, actual: Math.round(v.actual.reduce((a, x) => a + x, 0) / v.actual.length), planned: v.planned, n: v.actual.length }));
  });
  // Border waits: average hours stopped at each border vs planned dwell (current waits count up to now)
  const borders = $derived.by(() => {
    const m = new Map<string, { waits: number[]; planned: number }>();
    for (const l of legs) {
      const r = lookup.route(l.routeId);
      l.passes.forEach((p, i) => {
        const cp = lookup.checkpoint(p.checkpointId);
        if (cp?.kind !== 'border' || !p.arrivedAt) return;
        const end = p.departedAt ? Date.parse(p.departedAt) : Date.now();
        const cur = m.get(cp.name) ?? { waits: [], planned: r?.stops[i]?.plannedDwellHours ?? 0 };
        cur.waits.push((end - Date.parse(p.arrivedAt)) / H); m.set(cp.name, cur);
      });
    }
    return [...m.entries()].map(([name, v]) => ({ name: name.replace(/ border.*$/i, ''), avg: Math.round(v.waits.reduce((a, x) => a + x, 0) / v.waits.length), planned: v.planned, n: v.waits.length }));
  });
  // Shortages and damage per leg, from acknowledgements
  let acks = $state<Acknowledgement[]>([]);
  $effect(() => {
    const ids = list.filter((s) => s.legs.some((l) => l.ackId)).map((s) => s.id);
    Promise.all(ids.map((id) => tracking.acks(id))).then((r) => (acks = r.flat())).catch(() => {});
  });
  const losses = $derived(acks.map((a) => {
    const sh = list.find((s) => s.id === a.shipmentId); const leg = sh?.legs.find((l) => l.id === a.legId);
    return { label: `${sh?.ref ?? ''} · leg ${leg?.seq ?? ''}`, id: sh?.id, short: a.lines.reduce((x, l) => x + Math.max(0, l.expected - l.received), 0), damaged: a.lines.reduce((x, l) => x + l.damaged, 0) };
  }).filter((x) => x.short + x.damaged > 0).sort((a, b) => b.short + b.damaged - (a.short + a.damaged)));
  const worst = $derived(losses.slice(0, 10));
</script>

<div class="charts-grid">
  <ChartCard title="Trucks by status" rows={() => [['Status', 'Shipments'], ...byStatus.map((x) => [x.label, x.value])]}>
    <Donut label="Shipments by status" data={byStatus} center={String(list.length)} onselect={(l) => drill(B, { show: chipFor(l) })} />
  </ChartCard>
  <ChartCard title="Arriving on time" subtitle="delivered trips within 6 h of plan" rows={() => [['Measure', 'Value'], ['Delivered trips', delivered.length], ['On time', delivered.filter(onTimeOf).length], ['Late', delivered.filter((s) => !onTimeOf(s)).length]]}>
    <div class="stack" style="align-items:center;padding:var(--space-2) 0">
      {#if onTime == null}<p class="empty small">No delivered trips yet.</p>
      {:else}<Gauge label="On-time arrivals" value={onTime} target={0.9} tone={onTime >= 0.9 ? 'success' : onTime >= 0.7 ? 'warning' : 'danger'} />{/if}
      <div style="width:100%" class="stack-sm">
        <Meter label="At a border now" value={fig.atBorder} max={Math.max(1, fig.onRoad)} format={(n) => `${n} of ${fig.onRoad}`} tone="warning" />
        <Meter label="No check-in" value={fig.noCheckin} max={Math.max(1, fig.onRoad)} format={(n) => `${n} of ${fig.onRoad}`} tone="danger" />
      </div>
    </div>
  </ChartCard>
  <ChartCard span={2} title="Worst legs for shortages and damage" subtitle="top 10 by cases lost · every leg in View data" rows={() => [['Leg', 'Short (cases)', 'Damaged (cases)'], ...losses.map((x) => [x.label, x.short, x.damaged])]}>
    {#if losses.length}<BarChart label="Shortages and damage by leg" stacked horizontal categories={worst.map((x) => x.label)} series={[{ name: 'Short', values: worst.map((x) => x.short), slot: 1 }, { name: 'Damaged', values: worst.map((x) => x.damaged), slot: 6 }]}
      onselect={(c) => { const x = losses.find((l) => l.label === c); if (x?.id) location.hash = `/shipments/${x.id}`; }} />
    {:else}<p class="empty small">No shortages or damage reported.</p>{/if}
  </ChartCard>
</div>
