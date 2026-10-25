<script lang="ts">
  // docs/14 B-04 (roles document §8): transport-fee tracking — each trip's agreed transport price against the payments made
  // under document references: Paid / Part paid / Unpaid / not recorded, with the age since loading (amber after
  // config [fees] amber_days, red after red_days — 14 / 30, to confirm Q9). Testfie records the agreed price after loading
  // and the truck expenses per trip and leg; the directors record (and approve) payments. No goods value here.
  import { auth, finance, lookup, ref, type CostKind, type Currency, type TransportFeeRow, type User } from '@btw/api';
  import { fmtDate, fmtNum, say } from '@btw/ui';
  import { CURRENCIES, feeAgeing, feesConfig } from '@btw/api/money';
  import { AgeingBars, DashboardGrid, DashboardPanel, StatusBadge } from '../components/dashboard';
  import { attempt, watch } from '../lib/load.svelte';
  import { companyLabel } from '../lib/companies';
  import ErrorState from '../components/ErrorState.svelte';
  import Search from '@lucide/svelte/icons/search';
  let { user }: { params?: any; user: User } = $props();

  const cfg = feesConfig(ref().config);
  let rows = $state<TransportFeeRow[] | null>(null);
  const w = watch(async () => { rows = await finance.fees(); });
  let status = $state(''); let flag = $state(''); let q = $state('');
  const truckReg = (id: string) => lookup.truck(id)?.reg ?? '—';
  const provider = (id: string | null) => (id ? lookup.provider(id)?.name ?? id : '—');
  const shown = $derived((rows ?? []).filter((r) => (!status || r.status === status) && (!flag || r.flag === flag)
    && (!q || [r.ref, truckReg(r.truckId), provider(r.providerId), ...r.references].join(' ').toLowerCase().includes(q.toLowerCase()))));
  const open = $derived((rows ?? []).filter((r) => r.status === 'Unpaid' || r.status === 'Part paid'));
  const k = $derived({ balance: open.reduce((a, r) => a + (r.balanceUsd ?? 0), 0), amber: open.filter((r) => r.flag === 'amber').length, red: open.filter((r) => r.flag === 'red').length, missing: (rows ?? []).filter((r) => r.status === 'Not recorded').length, pending: (rows ?? []).reduce((a, r) => a + r.pendingUsd, 0) });
  const ageing = $derived(feeAgeing(rows ?? [], ref().config));
  const FLAG: Record<string, { s: string; l: string }> = { ok: { s: 'good', l: 'On time' }, amber: { s: 'warn', l: `Over ${cfg.amberDays} days` }, red: { s: 'bad', l: `Over ${cfg.redDays} days` }, none: { s: 'none', l: 'No price' } };
  const STATUS: Record<string, string> = { Paid: 'good', 'Part paid': 'warn', Unpaid: 'bad', 'Not recorded': 'none' };
  const usd = (n: number) => `USD ${fmtNum(n)}`;
  const canExpense = $derived(user.features?.includes('truck-expenses') ?? user.roles.some((r) => ['director', 'truck_planner'].includes(r)));
  const canPay = $derived(user.roles.some((r) => r === 'director' || r === 'accounts'));
  void auth;

  // actions: agreed price, truck expense (per trip / leg), payment (directors)
  type Act = { row: TransportFeeRow; kind: 'price' | 'expense' | 'pay'; amount: number | null; currency: Currency; docRef: string; legId: string; cost: CostKind };
  let act = $state<Act | null>(null);
  let err = $state(''); let busy = $state(false);
  const KINDS: CostKind[] = ['Taxes & duties', 'Clearing & forwarding', 'Loading & offloading', 'Storage', 'Other'];
  function start(row: TransportFeeRow, kind: Act['kind']) { act = { row, kind, amount: kind === 'pay' ? row.balanceUsd : row.agreed?.amount ?? null, currency: row.agreed?.currency ?? 'USD', docRef: '', legId: row.legs[0]?.id ?? '', cost: 'Taxes & duties' }; err = ''; }
  async function save() {
    if (!act) return;
    const a = act; const amt = Number(a.amount);
    busy = true;
    err = await attempt(async () => {
      if (a.kind === 'price') await finance.setAgreedPrice(a.row.shipmentId, { amount: amt, currency: a.currency, docRef: a.docRef || undefined });
      else if (a.kind === 'expense') await finance.addCost({ shipmentId: a.row.shipmentId, legId: a.legId || undefined, kind: a.cost, amount: amt, currency: a.currency, docRef: a.docRef || undefined, entityId: a.row.entityId });
      else { const c = a.row.costs.find((x) => x.kind === 'Transport'); if (!c) throw new Error('Record the agreed price first'); if (!a.docRef.trim()) throw new Error('Enter the payment reference'); await finance.pay(a.row.shipmentId, c.id, amt, a.docRef.trim()); }
    });
    busy = false;
    if (!err) { say(a.kind === 'price' ? 'Agreed price recorded' : a.kind === 'expense' ? 'Truck expense added' : 'Payment recorded'); act = null; }
  }
  const exportRows = () => [['Shipment', 'Company', 'Truck', 'Provider', 'Loaded', 'Age (days)', 'Agreed', 'Currency', 'Agreed USD', 'Paid USD', 'Waiting approval USD', 'Balance USD', 'Status', 'Flag', 'References'],
    ...shown.map((r) => [r.ref, companyLabel(r.entityId), truckReg(r.truckId), provider(r.providerId), r.loadedAt?.slice(0, 10) ?? '', r.ageDays, r.agreed?.amount ?? '', r.agreed?.currency ?? '', r.agreedUsd ?? '', r.paidUsd, r.pendingUsd, r.balanceUsd ?? '', r.status, FLAG[r.flag].l, r.references.join('; ')])];
</script>

<div class="page-head">
  <div><div class="overline crumb">Finance · trucks</div><h1>Transport fees</h1>
    <p class="muted small">The agreed transport price of each trip and what has been paid against it, with the payment references. Unpaid fees turn amber after {cfg.amberDays} days and red after {cfg.redDays} days from loading.</p></div>
</div>

<div class="grid-kpi kpis">
  <div class="card kpi"><div class="overline">Open balance</div><div class="display">{rows ? usd(k.balance) : '…'}</div><div class="caption">{open.length} trips unpaid or part paid</div></div>
  <div class="card kpi"><div class="overline">Over {cfg.amberDays} days</div><div class="display">{k.amber}</div><StatusBadge status="warn" label="Follow up" size={12} /></div>
  <div class="card kpi"><div class="overline">Over {cfg.redDays} days</div><div class="display">{k.red}</div><StatusBadge status="bad" label="Overdue" size={12} /></div>
  <div class="card kpi"><div class="overline">Agreed price not recorded</div><div class="display">{k.missing}</div><div class="caption">{k.pending ? `${usd(k.pending)} waiting for approval` : 'record it after loading'}</div></div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if act}
  <section class="card form-card" aria-label="Record">
    <h2 class="h4">{act.kind === 'price' ? 'Agreed transport price' : act.kind === 'expense' ? 'Truck expense' : 'Payment'} · {act.row.ref} · {truckReg(act.row.truckId)}</h2>
    <div class="form-grid">
      {#if act.kind === 'expense'}
        <label class="field"><span>Expense</span><select class="select" bind:value={act.cost}>{#each KINDS as x}<option value={x}>{x}</option>{/each}</select></label>
        <label class="field"><span>Leg</span><select class="select" bind:value={act.legId}>{#each act.row.legs as l (l.id)}<option value={l.id}>Leg {l.seq} · {lookup.route(l.routeId)?.name}</option>{/each}</select></label>
      {/if}
      <label class="field"><span>Amount{act.kind === 'pay' ? ` (${act.row.costs.find((c) => c.kind === 'Transport')?.currency ?? 'USD'})` : ''}</span><input class="input num" type="number" min="0" step="0.01" bind:value={act.amount} /></label>
      {#if act.kind !== 'pay'}<label class="field"><span>Currency</span><select class="select" bind:value={act.currency}>{#each CURRENCIES as c}<option value={c}>{c}</option>{/each}</select></label>{/if}
      <label class="field"><span>{act.kind === 'pay' ? 'Payment reference (M-Pesa, bank TT…)' : 'Document reference'}</span><input class="input" bind:value={act.docRef} maxlength="120" /></label>
    </div>
    {#if err}<p class="error small" role="alert">{err}</p>{/if}
    <div class="row"><button class="btn btn-primary" disabled={busy} onclick={save}>Save</button><button class="btn btn-ghost" onclick={() => (act = null)}>Cancel</button></div>
  </section>
{/if}

<DashboardGrid cols={2}>
  <DashboardPanel span="full" title="Unpaid fees by age" subtitle="open balance per transport provider" unit="USD" period="Since loading" updatedAt={new Date().toISOString()}
    definition="Agreed transport price less payments made (not those waiting for approval), for trips unpaid or part paid, grouped by days since loading." loading={!rows && !w.error}
    rows={() => [['Provider', ...ageing.bands.map((b) => b.name)], ...ageing.providers.map((p, i) => [provider(p), ...ageing.bands.map((b) => b.values[i])])]} filename="unpaid-fees-ageing">
    <AgeingBars label="Unpaid transport fees by provider and age, USD" entities={ageing.providers.map(provider)} bands={ageing.bands} tones={['good', 'warn', 'bad']} format={usd} />
  </DashboardPanel>
</DashboardGrid>

<div class="filters" style="margin-top:var(--space-4)">
  <label class="field"><span>Status</span><select class="select" bind:value={status}><option value="">All</option>{#each Object.keys(STATUS) as s}<option value={s}>{s}</option>{/each}</select></label>
  <label class="field"><span>Age</span><select class="select" bind:value={flag}><option value="">All</option><option value="ok">On time</option><option value="amber">Over {cfg.amberDays} days</option><option value="red">Over {cfg.redDays} days</option></select></label>
  <label class="field"><span>Search</span><span class="search"><Search size={16} /><input class="input" type="search" bind:value={q} placeholder="Shipment, truck, provider or reference" /></span></label>
</div>

<DashboardPanel span="full" title="Transport fee per trip" subtitle="{shown.length} trips" unit="USD (agreed in its own currency)" rows={exportRows} filename="transport-fees" loading={!rows && !w.error}>
  <div class="table-wrap" style="max-height:640px">
    <table class="table">
      <thead><tr><th>Shipment</th><th>Truck · provider</th><th>Loaded</th><th class="num">Age</th><th class="num">Agreed</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th>References</th><th></th></tr></thead>
      <tbody>
        {#each shown.slice(0, 300) as r (r.shipmentId)}
          <tr>
            <td><a href="#/shipments/{r.shipmentId}">{r.ref}</a><div class="caption">{companyLabel(r.entityId)}{r.reexport ? ' · re-export' : ''}</div></td>
            <td class="small">{truckReg(r.truckId)}<div class="caption">{provider(r.providerId)}</div></td>
            <td class="small nowrap">{r.loadedAt ? fmtDate(r.loadedAt) : '—'}</td>
            <td class="num"><StatusBadge status={FLAG[r.flag].s} label={`${r.ageDays} d`} size={12} /></td>
            <td class="num nowrap">{r.agreed ? `${r.agreed.currency} ${fmtNum(r.agreed.amount)}` : 'not recorded'}{#if r.agreed && r.agreed.currency !== 'USD'}<div class="caption">USD {fmtNum(r.agreedUsd ?? 0)}</div>{/if}</td>
            <td class="num">{fmtNum(r.paidUsd)}{#if r.pendingUsd}<div class="caption">+{fmtNum(r.pendingUsd)} waiting</div>{/if}</td>
            <td class="num">{r.balanceUsd === null ? '—' : fmtNum(r.balanceUsd)}</td>
            <td><StatusBadge status={STATUS[r.status]} label={r.status} size={12} /></td>
            <td class="small refs">{r.references.join(' · ') || '—'}</td>
            <td class="nowrap">
              {#if canExpense && (r.status === 'Not recorded' || (r.status === 'Unpaid' && !r.paidUsd && !r.pendingUsd))}<button class="btn btn-ghost btn-sm" onclick={() => start(r, 'price')}>{r.status === 'Not recorded' ? 'Agreed price' : 'Correct price'}</button>{/if}
              {#if canExpense}<button class="btn btn-ghost btn-sm" onclick={() => start(r, 'expense')}>Expense</button>{/if}
              {#if canPay && r.agreed && r.status !== 'Paid'}<button class="btn btn-ghost btn-sm" onclick={() => start(r, 'pay')}>Pay</button>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</DashboardPanel>

<style>
  .kpis { margin-bottom: var(--space-4); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); }
  .form-card { margin-bottom: var(--space-4); display: grid; gap: var(--space-3); }
  .error { color: var(--danger); }
  .nowrap { white-space: nowrap; }
  .refs { max-width: 220px; }
  .search { position: relative; display: flex; align-items: center; }
  .search :global(svg) { position: absolute; left: 10px; color: var(--text-muted); }
  .search input { padding-left: 32px; min-width: 260px; }
</style>
