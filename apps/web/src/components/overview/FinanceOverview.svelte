<script lang="ts">
  // Trip costs (Home · Fees & expenses, docs/17 Phase 2): trip expenses by month and type, payments waiting for a director.
  import { lookup, type CostKind, type finance } from '@btw/api';
  import { fmtMoney } from '@btw/ui';
  import { BarChart, ChartCard, Donut, LineChart, StatTile, byMonth, monthLabel, usd } from '../charts';
  import { drill } from '../../lib/tab';
  import { tripMoneyTiles } from '../../lib/tiles';
  type Trip = Awaited<ReturnType<typeof finance.trips>>[number];
  let { trips }: { trips: Trip[] } = $props();
  const KINDS: CostKind[] = ['Transport', 'Taxes & duties', 'Clearing & forwarding', 'Loading & offloading', 'Storage', 'Other'];
  const provider = (t: Trip) => lookup.provider(lookup.truck(t.shipment.legs[0].truckId)?.providerId ?? '')?.name ?? 'Unknown';
  const loaded = (t: Trip) => t.shipment.legs[0].passes[0]?.arrivedAt ?? t.shipment.legs[0].departedAt ?? '';
  const sorted = $derived([...trips].sort((a, b) => loaded(a).localeCompare(loaded(b))));
  const tot = $derived({
    agreed: trips.reduce((a, t) => a + t.transport, 0), paid: trips.reduce((a, t) => a + t.paid, 0), balance: tripMoneyTiles(trips).owed,
    pending: trips.flatMap((t) => t.payments).filter((p) => p.status === 'Pending approval'),
    landing: trips.reduce((a, t) => a + t.landing, 0), cases: trips.reduce((a, t) => a + t.cases, 0),
  });
  const providers = $derived.by(() => {
    const m = new Map<string, { paid: number; balance: number }>();
    for (const t of trips) { const k = provider(t); const c = m.get(k) ?? { paid: 0, balance: 0 }; c.paid += t.paid; c.balance += Math.max(0, t.balance); m.set(k, c); }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.balance - a.balance);
  });
  const mix = $derived(KINDS.map((k) => ({ label: k, value: Math.round(trips.reduce((a, t) => a + t.costs.filter((c) => c.kind === k).reduce((b, c) => b + (c.amountUsd ?? c.amount), 0), 0)) })).filter((x) => x.value > 0));
  const pendingBy = $derived(trips.map((t) => ({ ref: t.shipment.ref, reg: lookup.truck(t.shipment.legs[0].truckId)?.reg ?? '', v: t.payments.filter((p) => p.status === 'Pending approval').reduce((a, p) => a + (p.amountUsd ?? p.amount), 0) })).filter((x) => x.v > 0));
  const months = $derived(byMonth(trips, loaded));
  const kindSum = (ts: Trip[], k: CostKind) => Math.round(ts.reduce((a, t) => a + t.costs.filter((c) => c.kind === k).reduce((b, c) => b + (c.amountUsd ?? c.amount), 0), 0));
  const label = (t: Trip) => `${t.shipment.ref} · ${lookup.truck(t.shipment.legs[0].truckId)?.reg ?? ''}`;
</script>

<div class="charts-grid">
  <ChartCard title="Trip expenses by month" subtitle="USD by cost type (goods excluded)" rows={() => [['Month', ...KINDS], ...months.map(([m, ts]) => [m, ...KINDS.map((k) => kindSum(ts, k))])]}>
    <BarChart label="Trip expenses by month and type" stacked labels={false} categories={months.map(([m]) => monthLabel(m))} series={KINDS.map((k, i) => ({ name: k, slot: i, values: months.map(([, ts]) => kindSum(ts, k)) }))} format={usd} />
  </ChartCard>
  <ChartCard title="Payments awaiting approval" subtitle="above the director threshold, USD" rows={() => [['Shipment', 'Truck', 'Pending (USD)'], ...pendingBy.map((x) => [x.ref, x.reg, x.v])]}>
    {#if pendingBy.length}<BarChart label="Pending payments by trip" horizontal categories={pendingBy.map((x) => `${x.ref} · ${x.reg}`)} series={[{ name: 'Pending', values: pendingBy.map((x) => x.v), slot: 1 }]} format={usd} onselect={() => drill('/transport-costs', { tab: 'trips' })} />
    {:else}<p class="empty small">No payments waiting for approval.</p>{/if}
  </ChartCard>
</div>
