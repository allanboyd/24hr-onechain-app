<script lang="ts">
  // Truck expenses & fees (Testfie, directors) and Sales (directors) — docs/15: agreed transport price vs actual, transport fee
  // payments (status chips + reference search), unpaid & ageing fees, expenses per truck (legs expandable), sales summary,
  // customer balances (ageing).
  import type { DashKey, DashResult } from '@btw/api';
  import { DashboardPanel, AgeingBars, GroupedBars, StatusBadge } from '../../../components/dashboard';
  import { BarChart } from '../../../components/charts';
  import { frame, money, cvRow, n0, day, monthLabel, currency } from '../fmt.svelte';
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
</script>

{#if key === 'agreed-vs-actual'}
  <DashboardPanel span={span ?? 1} title="Agreed transport price vs actual" subtitle="per truck · variance red when over" {...fr} rows={() => [['Shipment', 'Truck', 'Provider', `Agreed (${C})`, `Actual (${C})`, `Variance (${C})`], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.provider, x.agreed == null ? 'Not recorded' : cvRow(x.agreed), cvRow(x.actual), cvRow(x.variance)])]} filename="agreed-vs-actual" {drill}>
    <GroupedBars label="Agreed and actual transport cost per truck" categories={recent.map((x: any) => `${x.truck} · ${x.ref.slice(-4)}`)} series={[{ name: 'Agreed', values: recent.map((x: any) => x.agreed) }, { name: 'Actual', values: recent.map((x: any) => x.actual) }]} format={money} unit={C} tolerance={0.05} />
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Truck</th><th class="num">Agreed</th><th class="num">Actual</th><th class="num">Variance</th></tr></thead>
      <tbody>{#each [...(d.rows ?? [])].reverse() as x}<tr class="clickable" onclick={() => go(`#/shipments/${x.shipmentId}`)}><td><b>{x.truck}</b><div class="caption">{x.ref} · {x.provider}</div></td>
        <td class="num">{x.agreed == null ? 'Not recorded' : money(x.agreed)}</td><td class="num">{money(x.actual)}</td>
        <td class="num">{#if x.variance == null}—{:else if x.variance > 0}<StatusBadge status="bad" label="+{money(x.variance)}" />{:else}<StatusBadge status="good" label={money(x.variance)} />{/if}</td></tr>{/each}</tbody>
    </table></div>
  </DashboardPanel>
{:else if key === 'fee-payments'}
  <DashboardPanel span={span ?? 2} title="Transport fee payments" subtitle="paid · part paid · unpaid against document references" {...fr} rows={() => [['Shipment', 'Truck', 'Provider', 'Loaded', 'Age (days)', `Agreed (${C})`, `Paid (${C})`, `Balance (${C})`, 'Status', 'Flag', 'References'], ...(d.rows ?? []).map((x: any) => [x.ref, x.truck, x.provider, x.loadedAt ?? '', x.ageDays, x.agreed == null ? 'Not recorded' : cvRow(x.agreed), cvRow(x.paid), cvRow(x.balance), x.status, x.flag, x.references.join(' ')])]} filename="transport-fee-payments" {drill} filterText={q ? `Search: ${q}` : ''}>
    {#snippet filters()}<label class="small">Reference <input class="input" style="height:32px" type="search" placeholder="Search reference, truck, provider" bind:value={q} /></label>{/snippet}
    <div class="chips">{#each Object.entries(d.counts ?? {}) as [s, n]}<StatusBadge status={feeTone(s)} label="{s}: {n}" />{/each}<span class="small">Open balance <b>{money(d.balance)}</b></span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Trip</th><th>Status</th><th class="num">Paid of agreed</th><th class="hide-sm">References</th></tr></thead>
      <tbody>{#each fees.slice(0, 20) as x}<tr class="clickable" onclick={() => go(`#/transport-costs?q=${encodeURIComponent(x.ref)}`)}>
        <td><b>{x.truck}</b><div class="caption">{x.ref} · {x.provider} · {day(x.loadedAt)}</div></td>
        <td><StatusBadge status={feeTone(x.status)} label={x.status} />{#if x.flag === 'red' || x.flag === 'amber'} <StatusBadge status={ageTone(x.flag)} label="{x.ageDays} d" />{/if}</td>
        <td class="num">{#if x.agreed == null}<span class="caption">no agreed price</span>{:else}<div class="pbar"><span style:width="{Math.min(100, (x.paid / Math.max(1, x.agreed)) * 100)}%"></span></div><span class="small">{money(x.paid)} / {money(x.agreed)}</span>{/if}</td>
        <td class="small hide-sm">{x.references.join(', ') || '—'}</td></tr>
      {:else}<tr><td colspan="4" class="caption">No fee matches “{q}”.</td></tr>{/each}</tbody>
    </table></div>
  </DashboardPanel>
{:else if key === 'unpaid-fees'}
  <DashboardPanel span={span ?? 1} title="Unpaid and ageing fees" subtitle="open balance by provider and age" {...fr} rows={() => [['Provider', ...(d.bands ?? []).map((b: any) => `${b.name} (${C})`)], ...(d.providers ?? []).map((p: string, i: number) => [p, ...d.bands.map((b: any) => cvRow(b.values[i]))])]} filename="unpaid-fees-ageing" {drill}>
    <AgeingBars label="Unpaid transport fees by provider and age" entities={d.providers ?? []} bands={d.bands ?? []} tones={['good', 'warn', 'bad']} format={money} onselect={() => go('#/transport-costs')} />
    <p class="caption">Total open {money(d.total)}.</p>
  </DashboardPanel>
{:else if key === 'truck-expenses'}
  <DashboardPanel span={span ?? 1} title="Expenses per truck" subtitle="per trip by category · open a trip for its legs" {...fr} rows={() => [['Shipment', 'Truck', 'Leg', ...(d.kinds ?? []).map((k: string) => `${k} (${C})`), `Total (${C})`], ...(d.rows ?? []).flatMap((x: any) => [[x.ref, x.truck, 'all', ...d.kinds.map((k: string) => cvRow(x.byKind[k])), cvRow(x.total)], ...(x.legs.length > 1 ? x.legs.map((l: any) => [x.ref, x.truck, `leg ${l.seq}`, ...d.kinds.map((k: string) => cvRow(l.byKind[k])), '']) : [])])]} filename="expenses-per-truck" {drill}>
    <BarChart label="Trip expenses by category" horizontal stacked categories={(d.rows ?? []).map((x: any) => `${x.truck} — ${x.ref}`)} series={(d.kinds ?? []).map((k: string) => ({ name: k, values: (d.rows ?? []).map((x: any) => x.byKind[k] ?? 0) }))} format={money} onselect={(c) => { const x = d.rows.find((y: any) => `${y.truck} — ${y.ref}` === c); if (x) open = open === x.shipmentId ? null : x.shipmentId; }} />
    {#each (d.rows ?? []).filter((x: any) => x.shipmentId === open) as x}
      <div class="legs"><b class="small">{x.truck} · {x.ref} — legs</b>
        {#each x.legs as l}<div class="small">Leg {l.seq} · {l.route}: {(d.kinds as string[]).filter((k) => l.byKind[k]).map((k) => `${k} ${money(l.byKind[k])}`).join(' · ') || 'no costs recorded'}</div>{/each}
        <a class="small" href="#/shipments/{x.shipmentId}">Open the trip</a></div>
    {/each}
    <p class="caption">Click a bar to see its legs. {(d.rows ?? []).filter((x: any) => !x.agreedRecorded).length} trip(s) without an agreed price yet.</p>
  </DashboardPanel>
{:else if key === 'sales-summary'}
  <DashboardPanel span={span ?? 1} title="Sales by month" subtitle="cash · credit · batch" {...fr} period="Last 6 months" rows={() => [['Month', `Cash (${C})`, `Credit (${C})`, `Batch (${C})`], ...(d.months ?? []).map((m: any) => [m.month, cvRow(m.Cash), cvRow(m.Credit), cvRow(m.Batch)])]} filename="sales-by-month" {drill}>
    <BarChart label="Sales by month and kind" stacked categories={(d.months ?? []).map((m: any) => monthLabel(m.month))} series={['Cash', 'Credit', 'Batch'].map((k, i) => ({ name: k, values: (d.months ?? []).map((m: any) => m[k]), slot: i }))} format={money} onselect={() => go('#/sales')} />
  </DashboardPanel>
  <DashboardPanel span={span ?? 1} title="Top products and customers" subtitle="sales value in the period" {...fr} rows={() => [['Kind', 'Name', `Sales (${C})`], ...(d.topProducts ?? []).map((x: any) => ['Product', x.label, cvRow(x.value)]), ...(d.topCustomers ?? []).map((x: any) => ['Customer', x.label, cvRow(x.value)])]} filename="top-products-customers" empty={!d.topProducts?.length}>
    <BarChart label="Top products by sales value" horizontal categories={(d.topProducts ?? []).map((x: any) => x.label)} series={[{ name: 'Sales', values: (d.topProducts ?? []).map((x: any) => x.value), slot: 0 }]} format={money} />
    <BarChart label="Top customers by sales value" horizontal categories={(d.topCustomers ?? []).map((x: any) => x.label)} series={[{ name: 'Sales', values: (d.topCustomers ?? []).map((x: any) => x.value), slot: 1 }]} format={money} />
    <p class="caption">{n0(d.count)} sales · {money(d.total)} in the period.</p>
  </DashboardPanel>
{:else if key === 'customer-balances'}
  <DashboardPanel span={span ?? 1} title="Customer balances" subtitle="what each customer owes, by age · overdue in red" {...fr} rows={() => [['Customer', ...(d.bands ?? []).map((b: any) => `${b.name} (${C})`)], ...(d.customers ?? []).map((c: string, i: number) => [c, ...d.bands.map((b: any) => cvRow(b.values[i]))])]} filename="customer-balances" {drill}>
    <AgeingBars label="Customer balances by ageing band" entities={d.customers ?? []} bands={d.bands ?? []} tones={['good', 'warn', 'bad']} format={money} onselect={() => go('#/sales?show=owed')} />
    <p class="caption">Owed {money(d.total)}, of which overdue {money(d.overdue)} (terms {d.terms} days, to confirm).</p>
  </DashboardPanel>
{/if}

<style>
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-bottom: var(--space-2); }
  .pbar { height: 6px; background: var(--surface-sunken); border-radius: 3px; overflow: hidden; margin-bottom: 2px; min-width: 80px; }
  .pbar span { display: block; height: 100%; background: var(--success); }
  .legs { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); margin-top: var(--space-2); display: flex; flex-direction: column; gap: 2px; }
  @media (max-width: 600px) { .hide-sm { display: none; } }
</style>
