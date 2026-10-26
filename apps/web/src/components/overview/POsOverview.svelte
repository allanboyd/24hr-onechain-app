<script lang="ts">
  // Purchase orders: issued, sent, and how far each order's trucks have got (ordered → loaded → delivered).
  import { amount, lookup, type Loading, type Plan, type PurchaseOrder, type Shipment } from '@btw/api';
  import { BarChart, ChartCard, Donut, StatTile, byMonth, monthLabel, usd } from '../charts';
  import { drill } from '../../lib/tab';
  let { list, plans, loads, ships }: { list: PurchaseOrder[]; plans: Plan[]; loads: Loading[]; ships: Shipment[] } = $props();
  const value = (po: PurchaseOrder) => po.amount ?? plans.find((p) => p.id === po.planId)?.lines.reduce((a, l) => a + amount(l.qty, l.price), 0) ?? 0;
  const prog = (po: PurchaseOrder) => {
    const ld = loads.filter((l) => l.poId === po.id), sh = ships.filter((s) => s.poId === po.id);
    const delivered = sh.filter((s) => s.status === 'Acknowledged').length, moving = sh.length - delivered;
    return { toLoad: ld.filter((l) => l.status === 'Pending').length, moving, delivered, trucks: ld.length };
  };
  const all = $derived(list.map((po) => ({ po, ...prog(po) })));
  const tot = $derived(all.reduce((a, x) => ({ toLoad: a.toLoad + x.toLoad, moving: a.moving + x.moving, delivered: a.delivered + x.delivered, trucks: a.trucks + x.trucks }), { toLoad: 0, moving: 0, delivered: 0, trucks: 0 }));
  const open = $derived(all.filter((x) => x.toLoad + x.moving > 0).slice(0, 12));
  const months = $derived(byMonth(list, (p) => p.date));
  const bySupplier = $derived.by(() => { const m = new Map<string, number>(); for (const po of list) { const s = lookup.supplier(po.supplierId); const k = s ? `${s.code} ${s.city}` : po.supplierId; m.set(k, (m.get(k) ?? 0) + value(po)); } return [...m.entries()].map(([label, v]) => ({ label, value: Math.round(v) })).sort((a, b) => b.value - a.value); });
  import CompanySplit from '../group/CompanySplit.svelte';
  import { plansSplit } from '../../lib/splits';
</script>

<CompanySplit title="Orders by company" metrics={plansSplit()} />

<div class="tiles">
  <StatTile label="Purchase orders" value={String(list.length)} hint={usd(list.reduce((a, p) => a + value(p), 0))} />
  <StatTile label="Not yet sent" value={String(list.filter((p) => !p.sentAt && p.status === 'Issued').length)} hint="to the supplier export section" onclick={() => drill('/pos', { stage: 'Created' })} />
  <StatTile label="Trucks to load" value={String(tot.toLoad)} hint="on open orders" />
  <StatTile label="Trucks delivered" value={`${tot.delivered} of ${tot.trucks}`} hint="{tot.moving} on the road" />
</div>

<div class="charts-grid">
  <ChartCard span={2} title="Open orders: truck progress" subtitle="trucks per order, oldest first" rows={() => [['PO', 'To load', 'On the road', 'Delivered'], ...all.map((x) => [x.po.ref, x.toLoad, x.moving, x.delivered])]}>
    {#if open.length}<BarChart label="Truck progress per open purchase order" horizontal stacked categories={open.map((x) => x.po.ref)} series={[{ name: 'To load', values: open.map((x) => x.toLoad), slot: 8 }, { name: 'On the road', values: open.map((x) => x.moving), slot: 1 }, { name: 'Delivered', values: open.map((x) => x.delivered) }]}
      onselect={(c) => { const x = open.find((o) => o.po.ref === c); if (x) location.hash = `/pos/${x.po.id}`; }} />
    {:else}<p class="empty small">Every order is fully delivered.</p>{/if}
  </ChartCard>
  <ChartCard title="All trucks on orders" rows={() => [['Stage', 'Trucks'], ['To load', tot.toLoad], ['On the road', tot.moving], ['Delivered', tot.delivered]]}>
    <Donut label="Trucks by stage" data={[{ label: 'Delivered', value: tot.delivered }, { label: 'On the road', value: tot.moving }, { label: 'To load', value: tot.toLoad }]} center={String(tot.trucks)} />
  </ChartCard>
  <ChartCard title="Orders by supplier" subtitle="USD" rows={() => [['Supplier', 'Value (USD)'], ...bySupplier.map((x) => [x.label, x.value])]}>
    <BarChart label="Order value by supplier" horizontal categories={bySupplier.map((x) => x.label)} series={[{ name: 'Value', values: bySupplier.map((x) => x.value) }]} format={usd} />
  </ChartCard>
  <ChartCard span={2} title="Orders issued per month" subtitle="USD" rows={() => [['Month', 'Orders', 'Value (USD)'], ...months.map(([m, ps]) => [m, ps.length, Math.round(ps.reduce((a, p) => a + value(p), 0))])]}>
    <BarChart label="Order value per month" categories={months.map(([m]) => monthLabel(m))} series={[{ name: 'Value', values: months.map(([, ps]) => Math.round(ps.reduce((a, p) => a + value(p), 0))) }]} format={usd} labels={months.length <= 12} />
  </ChartCard>
</div>
