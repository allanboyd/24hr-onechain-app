<script lang="ts">
  // Truck expenses & fees (Testfie, directors) and Sales (directors) — docs/15: agreed transport price vs actual, transport fee
  // payments (status chips + reference search), unpaid & ageing fees, expenses per truck (legs expandable), sales summary,
  // customer balances (ageing).
  import type { DashKey, DashResult } from '@btw/api';
  import { DashboardPanel, AgeingBars, GroupedBars, StatusBadge } from '../../../components/dashboard';
  import { BarChart } from '../../../components/charts';
  import { compact } from '../../../components/charts/scale';
  import { frame, money, cv, cvRow, n0, day, monthLabel, currency } from '../fmt.svelte';
  import StatRow from '../StatRow.svelte';
  let { key, r, link, span }: { key: DashKey; r: DashResult; link?: string; span?: 1 | 2 | 'full' } = $props();
  const d = $derived(r.data as any);
  const fr = $derived(frame(r));
  const drill = $derived(link ? { label: 'Open the full screen', href: link } : undefined);
  const go = (h: string) => (location.hash = h.replace(/^#/, ''));
  const C = $derived(currency.code);

  // fee payments
  let q = $state('');
  let open = $state<string | null>(null);
  const feeTone = (s: string) => (s === 'Paid' ? 'good' : s === 'Part paid' ? 'warn' : s === 'Unpaid' ? 'bad' : 'none');
  const fees = $derived(key === 'fee-payments' ? (d.rows ?? []).filter((x: any) => !q || `${x.ref} ${x.truck} ${x.provider} ${x.references.join(' ')}`.toLowerCase().includes(q.toLowerCase())) : []);
  const recent = $derived(key === 'agreed-vs-actual' ? (d.rows ?? []).slice(-8) : []);
  const ageTone = (f: string) => (f === 'red' ? 'bad' : f === 'amber' ? 'warn' : 'none');
  const tripTop = $derived(key === 'truck-expenses' ? (d.rows ?? []).slice(0, 8) : []);
  const custTotals = $derived.by(() => {
    if (key !== 'customer-balances' || !d?.customers || !d?.bands) return [] as { label: string; value: number }[];
    return d.customers
      .map((c: string, i: number) => ({ label: c, value: d.bands.reduce((a: number, b: any) => a + (b.values[i] ?? 0), 0) }))
      .filter((x: { value: number }) => x.value > 0)
      .sort((a: { value: number }, b: { value: number }) => b.value - a.value)
      .slice(0, 6);
  });
  const providerTotals = $derived.by(() => {
    if (key !== 'unpaid-fees' || !d?.providers || !d?.bands) return [] as { label: string; value: number }[];
    return d.providers
      .map((p: string, i: number) => ({ label: p, value: d.bands.reduce((a: number, b: any) => a + (b.values[i] ?? 0), 0) }))
      .filter((x: { value: number }) => x.value > 0)
      .sort((a: { value: number }, b: { value: number }) => b.value - a.value)
      .slice(0, 6);
  });
</script>

{#if key === 'agreed-vs-actual'}
  <StatRow label="Agreed against actual" items={[
    { label: 'Trips', value: n0((d.rows ?? []).length), sub: 'In this list', href: '#/transport-costs' },
    { label: 'Over agreed', value: n0((d.rows ?? []).filter((x: any) => (x.variance ?? 0) > 0).length), sub: 'Actual is higher', href: '#/transport-costs' },
    { label: 'No agreed price', value: n0((d.rows ?? []).filter((x: any) => x.agreed == null).length), sub: 'Not recorded', href: '#/transport-costs' },
    { label: `Over by (${C})`, value: compact(cv((d.rows ?? []).reduce((a: number, x: any) => a + Math.max(0, x.variance ?? 0), 0))), sub: 'Sum of the overs', href: '#/transport-costs' },
  ]} />
  <DashboardPanel span={span ?? 1} subtitle="per truck · variance red when over" decision="Ask the provider about every trip over the agreed price." {...fr} title={r.title} rows={() => [['Shipment', 'Truck', 'Provider', `Agreed (${C})`, `Actual (${C})`, `Variance (${C})`], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.provider, x.agreed == null ? 'Not recorded' : cvRow(x.agreed), cvRow(x.actual), cvRow(x.variance)])]} filename="agreed-vs-actual" {drill}>
    <GroupedBars label="Agreed and actual transport cost per truck" categories={recent.map((x: any) => `${x.truck} · ${x.ref.slice(-4)}`)} series={[{ name: 'Agreed', values: recent.map((x: any) => x.agreed), ink: 'allowed' }, { name: 'Actual', values: recent.map((x: any) => x.actual), ink: 'navy' }]} format={money} unit={C} tolerance={0.05} />
  </DashboardPanel>
{:else if key === 'fee-payments'}
  <DashboardPanel span={span ?? 1} subtitle="against document references" decision="Pay or query the oldest unpaid balances first." {...fr} title={r.title} rows={() => [['Shipment', 'Truck', 'Provider', 'Loaded', 'Age (days)', `Agreed (${C})`, `Paid (${C})`, `Balance (${C})`, 'Status', 'Flag', 'References'], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.provider, x.loadedAt ?? '', x.ageDays, x.agreed == null ? 'Not recorded' : cvRow(x.agreed), cvRow(x.paid), cvRow(x.balance), x.status, x.flag, x.references.join(' ')])]} filename="transport-fee-payments" {drill}>
    <div class="chips">{#each Object.entries(d.counts ?? {}) as [s, n]}<StatusBadge status={feeTone(s)} label="{s}: {n}" />{/each}<span class="small">Open balance <b>{money(d.balance)}</b></span></div>
    <div class="table-wrap pay"><table class="table">
      <thead><tr><th>Trip</th><th>Status</th><th class="num">Paid of agreed</th><th class="hide-sm">References</th></tr></thead>
      <tbody>{#each fees.slice(0, 6) as x}<tr class="clickable" onclick={() => go(`#/transport-costs?q=${encodeURIComponent(x.ref)}`)}>
        <td><b>{x.truck}</b><div class="caption">{x.ref} · {x.provider} · {day(x.loadedAt)}</div></td>
        <td><StatusBadge status={feeTone(x.status)} label={x.status} />{#if x.flag === 'red' || x.flag === 'amber'} <StatusBadge status={ageTone(x.flag)} label="{x.ageDays} d" />{/if}</td>
        <td class="num">{#if x.agreed == null}<span class="caption">no agreed price</span>{:else}<div class="pbar"><span style:width="{Math.min(100, (x.paid / Math.max(1, x.agreed)) * 100)}%"></span></div><span class="small">{money(x.paid)} / {money(x.agreed)}</span>{/if}</td>
        <td class="small hide-sm">{x.references.join(', ') || '-'}</td></tr>
      {:else}<tr><td colspan="4" class="caption">No fee matches “{q}”.</td></tr>{/each}</tbody>
    </table></div>
  </DashboardPanel>
{:else if key === 'unpaid-fees'}
  <DashboardPanel span={span ?? 1} subtitle="open balance by provider and age" decision="Clear the red band before it ages further." {...fr} title="Unpaid by age" rows={() => [['Provider', ...(d.bands ?? []).map((b: any) => `${b.name} (${C})`)], ...(d.providers ?? []).map((p: string, i: number) => [p, ...d.bands.map((b: any) => cvRow(b.values[i]))])]} filename="unpaid-fees-ageing" {drill}>
    <AgeingBars label="Unpaid transport fees by provider and age" entities={d.providers ?? []} bands={d.bands ?? []} tones={['good', 'warn', 'bad']} format={money} onselect={() => go('#/transport-costs')} />
    <p class="caption">Total open {money(d.total)}.</p>
  </DashboardPanel>
  <DashboardPanel span={1} subtitle="largest open balances" decision="Pay the largest balance first." {...fr} title="Top unpaid balances" rows={() => [['Provider', `Balance (${C})`], ...providerTotals.map((x) => [x.label, cvRow(x.value)])]} filename="top-unpaid-balances" empty={!providerTotals.length}>
    <BarChart label="Top unpaid balances by provider" horizontal categories={providerTotals.map((x) => x.label)} series={[{ name: `Balance (${C})`, values: providerTotals.map((x) => x.value), ink: 'warn' }]} format={money} height={Math.max(180, providerTotals.length * 40 + 48)} />
  </DashboardPanel>
{:else if key === 'truck-expenses'}
  <DashboardPanel span={span ?? 1} subtitle="per trip by category · open a trip for its legs" decision="Record missing agreed prices and odd categories." {...fr} title={r.title} rows={() => [['Shipment', 'Truck', 'Leg', ...(d.kinds ?? []).map((k: string) => `${k} (${C})`), `Total (${C})`], ...(d.rows ?? []).flatMap((x: any) => [[x.ref, x.truck, 'all', ...d.kinds.map((k: string) => cvRow(x.byKind[k])), cvRow(x.total)], ...(x.legs.length > 1 ? x.legs.map((l: any) => [x.ref, x.truck, `leg ${l.seq}`, ...d.kinds.map((k: string) => cvRow(l.byKind[k])), '']) : [])])]} filename="expenses-per-truck" {drill}>
    <BarChart label="Trip expenses by category" horizontal stacked categories={tripTop.map((x: any) => `${x.truck} · ${x.ref}`)} series={(d.kinds ?? []).map((k: string) => ({ name: k, values: tripTop.map((x: any) => x.byKind[k] ?? 0) }))} format={money} onselect={(c) => { const x = d.rows.find((y: any) => `${y.truck} · ${y.ref}` === c); if (x) open = open === x.shipmentId ? null : x.shipmentId; }} />
    {#each (d.rows ?? []).filter((x: any) => x.shipmentId === open) as x}
      <div class="legs"><b class="small">{x.truck} · {x.ref} · legs</b>
        {#each x.legs as l}<div class="small">Leg {l.seq} · {l.route}: {(d.kinds as string[]).filter((k) => l.byKind[k]).map((k) => `${k} ${money(l.byKind[k])}`).join(' · ') || 'no costs recorded'}</div>{/each}
        <a class="small" href="#/shipments/{x.shipmentId}">Open the trip</a></div>
    {/each}
    <p class="caption">Showing {tripTop.length} of {(d.rows ?? []).length} trips. Click a bar for legs. {(d.rows ?? []).filter((x: any) => !x.agreedRecorded).length} trip(s) without an agreed price yet.</p>
  </DashboardPanel>
{:else if key === 'cash-vs-credit'}
  <DashboardPanel span={span ?? 1} subtitle="last 6 months · cash share on the caption" decision="Chase credit when cash share falls; keep the cash customers supplied." {...fr} title={r.title} period="Last 6 months" rows={() => [['Month', `Cash (${C})`, `Credit (${C})`, 'Cash share'], ...(d.months ?? []).map((m: any) => [m.month, cvRow(m.cash), cvRow(m.credit), m.share == null ? '' : `${Math.round(m.share * 100)}%`])]} filename="cash-vs-credit" {drill}>
    <BarChart label="Cash received against credit given by month" categories={(d.months ?? []).map((m: any) => monthLabel(m.month))} series={[{ name: 'Cash', values: (d.months ?? []).map((m: any) => m.cash), ink: 'good' }, { name: 'Credit', values: (d.months ?? []).map((m: any) => m.credit), ink: 'warn' }]} format={money} labels={false} onselect={() => go('#/sales')} />
    <p class="caption">This period: cash {money(d.cash)} · credit {money(d.credit)}{d.share == null ? '' : ` · cash share ${Math.round(d.share * 100)}%`}{d.batch ? ` · batch ${money(d.batch)}` : ''}.</p>
  </DashboardPanel>
{:else if key === 'sales-summary'}
  <StatRow label="Sales this period" items={[
    { label: `Sales (${C})`, value: compact(cv(d.total ?? 0)), sub: `${n0(d.count)} sales`, href: '#/sales' },
    { label: `Cash (${C})`, value: compact(cv((d.months ?? []).reduce((a: number, m: any) => a + (m.Cash ?? 0), 0))), sub: 'Last 6 months', href: '#/sales' },
    { label: `Credit (${C})`, value: compact(cv((d.months ?? []).reduce((a: number, m: any) => a + (m.Credit ?? 0), 0))), sub: 'Last 6 months', href: '#/sales' },
    { label: `Batch (${C})`, value: compact(cv((d.months ?? []).reduce((a: number, m: any) => a + (m.Batch ?? 0), 0))), sub: 'Last 6 months', href: '#/sales' },
  ]} />
  <DashboardPanel span={span ?? 1} subtitle="last 6 months" decision="Watch credit share and the customers who buy most." {...fr} title={r.title} period="Last 6 months" rows={() => [['Month', `Cash (${C})`, `Credit (${C})`, `Batch (${C})`], ...(d.months ?? []).map((m: any) => [m.month, cvRow(m.Cash), cvRow(m.Credit), cvRow(m.Batch)])]} filename="sales-by-month" {drill}>
    <BarChart label="Sales by month and kind" stacked categories={(d.months ?? []).map((m: any) => monthLabel(m.month))} series={[{ name: 'Cash', values: (d.months ?? []).map((m: any) => m.Cash), ink: 'good' }, { name: 'Credit', values: (d.months ?? []).map((m: any) => m.Credit), ink: 'warn' }, { name: 'Batch', values: (d.months ?? []).map((m: any) => m.Batch), ink: 'teal' }]} format={money} height={220} onselect={() => go('#/sales')} />
  </DashboardPanel>
  <DashboardPanel span={1} subtitle="sales value in the period" decision="Keep the top products in stock." {...fr} title="Top products" rows={() => [['Product', `Sales (${C})`], ...(d.topProducts ?? []).map((x: any) => [x.label, cvRow(x.value)])]} filename="top-products" empty={!d.topProducts?.length}>
    <BarChart label="Top products by sales value" horizontal categories={(d.topProducts ?? []).slice(0, 6).map((x: any) => x.label)} series={[{ name: 'Sales', values: (d.topProducts ?? []).slice(0, 6).map((x: any) => x.value), ink: 'navy' }]} format={money} height={220} />
  </DashboardPanel>
  <DashboardPanel span={1} subtitle="sales value in the period" decision="Visit the customers who buy most." {...fr} title="Top customers" rows={() => [['Customer', `Sales (${C})`], ...(d.topCustomers ?? []).map((x: any) => [x.label, cvRow(x.value)])]} filename="top-customers" empty={!d.topCustomers?.length}>
    <BarChart label="Top customers by sales value" horizontal categories={(d.topCustomers ?? []).slice(0, 6).map((x: any) => x.label)} series={[{ name: 'Sales', values: (d.topCustomers ?? []).slice(0, 6).map((x: any) => x.value), ink: 'teal' }]} format={money} height={220} />
  </DashboardPanel>
{:else if key === 'customer-balances'}
  <DashboardPanel span={span ?? 1} subtitle="{C} · {d.terms}-day terms · overdue in red" decision="Call the customers in the overdue bands." {...fr} title="Balances by age" rows={() => [['Customer', ...(d.bands ?? []).map((b: any) => `${b.name} (${C})`)], ...(d.customers ?? []).map((c: string, i: number) => [c, ...d.bands.map((b: any) => cvRow(b.values[i]))])]} filename="customer-balances" {drill}>
    <AgeingBars label="Customer balances by ageing band" entities={d.customers ?? []} bands={d.bands ?? []} tones={['good', 'warn', 'bad']} format={money} onselect={() => go('#/sales?show=owed')} />
    <p class="caption">Owed {money(d.total)}, of which overdue {money(d.overdue)}.</p>
  </DashboardPanel>
  <DashboardPanel span={1} subtitle="largest open balances" decision="Call the largest balance first." {...fr} title="Top balances" rows={() => [['Customer', `Balance (${C})`], ...custTotals.map((x) => [x.label, cvRow(x.value)])]} filename="top-customer-balances" empty={!custTotals.length}>
    <BarChart label="Top customer balances" horizontal categories={custTotals.map((x) => x.label)} series={[{ name: `Balance (${C})`, values: custTotals.map((x) => x.value), ink: 'warn' }]} format={money} height={Math.max(180, custTotals.length * 40 + 48)} />
  </DashboardPanel>
{/if}

<style>
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-bottom: var(--space-2); }
  .pay { max-height: 320px; overflow: auto; }
  .pbar { height: 6px; background: var(--surface-sunken); border-radius: 3px; overflow: hidden; margin-bottom: 2px; min-width: 80px; }
  .pbar span { display: block; height: 100%; background: var(--success); }
  .legs { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); margin-top: var(--space-2); display: flex; flex-direction: column; gap: 2px; }
  .split { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: stretch; }
  .split > div { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; }
  .cap-line { margin: 0 0 var(--space-2); font-size: 12px; font-weight: 600; color: var(--text-muted); }
  @media (max-width: 900px) { .split { flex-direction: column; } }
  @media (max-width: 600px) { .hide-sm { display: none; } }
</style>
