<script lang="ts">
  // Planning pipeline: what is waiting, value by entity and supplier, how fast approvals happen.
  import { amount, lookup, type Plan } from '@btw/api';
  import { BarChart, ChartCard, Donut, LineChart, StatTile, byMonth, monthLabel, usd } from '../charts';
  import { drill } from '../../lib/tab';
  import { poApprovals } from '../../lib/orders';
  let { list }: { list: Plan[] } = $props();
  const B = '/plans';
  const value = (p: Plan) => p.lines.reduce((a, l) => a + amount(l.qty, l.price), 0);
  const approvals = poApprovals();
  const STATUSES = approvals ? ['Draft', 'Submitted', 'Returned', 'Approved', 'Rejected'] as const : ['Draft', 'Submitted', 'Approved'] as const;
  const LABEL: Record<string, string> = approvals ? {} : { Submitted: 'Ready to issue', Approved: 'Issued' };
  const issuedNow = $derived(list.filter((p) => p.status === 'Approved' && p.history.some((h) => (h.action === 'issued' || h.action === 'approved') && h.at.startsWith(new Date().toISOString().slice(0, 7)))));
  const byStatus = $derived(STATUSES.map((s) => ({ s: LABEL[s] ?? s, n: list.filter((p) => p.status === s).length, v: Math.round(list.filter((p) => p.status === s).reduce((a, p) => a + value(p), 0)) })));
  const waiting = $derived(list.filter((p) => p.status === 'Submitted'));
  const decided = (p: Plan) => {
    const sub = [...p.history].reverse().find((h) => h.action === 'submitted');
    const dec = [...p.history].reverse().find((h) => h.action === 'approved' || h.action === 'returned' || h.action === 'rejected');
    return sub && dec && Date.parse(dec.at) >= Date.parse(sub.at) ? { at: dec.at, hours: (Date.parse(dec.at) - Date.parse(sub.at)) / 36e5 } : null;
  };
  const turn = $derived(list.map(decided).filter((x): x is { at: string; hours: number } => !!x));
  const avgTurn = $derived(turn.length ? turn.reduce((a, x) => a + x.hours, 0) / turn.length : null);
  const months = $derived(byMonth(turn, (x) => x.at));
  const group = (key: (p: Plan) => string) => { const m = new Map<string, number>(); for (const p of list.filter((x) => x.status !== 'Rejected')) m.set(key(p), (m.get(key(p)) ?? 0) + value(p)); return [...m.entries()].map(([label, v]) => ({ label, value: Math.round(v) })).sort((a, b) => b.value - a.value); };
  const byEntity = $derived(group((p) => lookup.entity(p.entityId)?.code ?? p.entityId));
  const bySupplier = $derived(group((p) => { const s = lookup.supplier(p.supplierId); return s ? `${s.code} ${s.city}` : p.supplierId; }));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const approvedNow = $derived(list.filter((p) => p.status === 'Approved' && p.history.some((h) => h.action === 'approved' && h.at.startsWith(thisMonth))));
  const hrs = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.round(h)} h`);
  import CompanySplit from '../group/CompanySplit.svelte';
  import { plansSplit } from '../../lib/splits';
</script>

<CompanySplit title="Plans by company" metrics={plansSplit()} />

{#if approvals}
<div class="tiles">
  <StatTile label="Awaiting approval" value={String(waiting.length)} hint={usd(waiting.reduce((a, p) => a + value(p), 0))} onclick={() => drill(B, { status: 'Submitted' })} />
  <StatTile label="Approved this month" value={String(approvedNow.length)} hint={usd(approvedNow.reduce((a, p) => a + value(p), 0))} onclick={() => drill(B, { status: 'Approved' })} />
  <StatTile label="Returned or rejected" value={String(list.filter((p) => p.status === 'Returned' || p.status === 'Rejected').length)} hint="need the planner's attention" onclick={() => drill(B, { status: 'Returned' })} />
  <StatTile label="Average approval time" value={avgTurn == null ? '—' : hrs(avgTurn)} hint="submitted → decision" />
</div>
{:else}
<div class="tiles">
  <StatTile label="Drafts" value={String(list.filter((p) => p.status === 'Draft' || p.status === 'Submitted').length)} hint="not yet issued" onclick={() => drill(B, { status: 'Draft' })} />
  <StatTile label="Issued this month" value={String(issuedNow.length)} hint={usd(issuedNow.reduce((a, p) => a + value(p), 0))} onclick={() => drill(B, { status: 'Approved' })} />
  <StatTile label="Issued, all time" value={String(list.filter((p) => p.status === 'Approved').length)} hint={usd(list.filter((p) => p.status === 'Approved').reduce((a, p) => a + value(p), 0))} />
</div>
{/if}

<div class="charts-grid">
  <ChartCard title="Pipeline by status" subtitle="plan value, USD" rows={() => [['Status', 'Plans', 'Value (USD)'], ...byStatus.map((x) => [x.s, x.n, x.v])]}>
    <BarChart label="Plan value by status" horizontal categories={byStatus.map((x) => x.s)} series={[{ name: 'Value', values: byStatus.map((x) => x.v) }]} format={usd} onselect={(c) => drill(B, { status: Object.keys(LABEL).find((k) => LABEL[k] === c) ?? c })} />
  </ChartCard>
  <ChartCard title="Value by ordering entity" subtitle="USD, excluding rejected" rows={() => [['Entity', 'Value (USD)'], ...byEntity.map((x) => [x.label, x.value])]}>
    <Donut label="Plan value by entity" data={byEntity} format={usd} center={usd(byEntity.reduce((a, x) => a + x.value, 0))} onselect={(c) => drill(B, { entity: list.find((p) => lookup.entity(p.entityId)?.code === c)?.entityId })} />
  </ChartCard>
  <ChartCard title="Value by supplier" subtitle="USD, excluding rejected" rows={() => [['Supplier', 'Value (USD)'], ...bySupplier.map((x) => [x.label, x.value])]}>
    <BarChart label="Plan value by supplier" horizontal categories={bySupplier.map((x) => x.label)} series={[{ name: 'Value', values: bySupplier.map((x) => x.value) }]} format={usd} />
  </ChartCard>
  {#if approvals}<ChartCard title="Approval turnaround" subtitle="average hours from submission to decision, by month" rows={() => [['Month', 'Decisions', 'Average hours'], ...months.map(([m, xs]) => [m, xs.length, Math.round(xs.reduce((a, x) => a + x.hours, 0) / xs.length)])]}>
    {#if months.length}<LineChart label="Average approval time by month" labels={months.map(([m]) => m)} series={[{ name: 'Average hours', values: months.map(([, xs]) => Math.round(xs.reduce((a, x) => a + x.hours, 0) / xs.length)) }]} format={(n) => `${n} h`} rangeslider={false} />
    {:else}<p class="empty small">No decisions yet.</p>{/if}
  </ChartCard>{/if}
</div>
