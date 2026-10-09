<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { finance, lookup, type CostKind, type User } from '@btw/api';
  import { Badge, fmtDate, fmtDateTime, fmtMoney, fmtNum, say } from '@btw/ui';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ExportMenu from '../components/ExportMenu.svelte';
  let { user }: { params?: any; user: User } = $props();
  type Trip = Awaited<ReturnType<typeof finance.trips>>[number];
  let trips = $state<Trip[] | null>(null);
  let open = $state<string | null>(null);
  async function load() { trips = await finance.trips(); }
  const w = watch(load);
  const canApprove = $derived(user.roles.some((r) => r === 'director' || r === 'accounts'));
  const canPay = $derived(user.roles.some((r) => r === 'accounts' || r === 'director'));
  const payStatus = (t: Trip) => (t.transport > 0 && t.paid >= t.transport ? 'Paid' : t.paid > 0 ? 'Part-paid' : 'Unpaid');
  const totals = $derived.by(() => {
    const ts = trips ?? [];
    return { transport: ts.reduce((a, t) => a + t.transport, 0), paid: ts.reduce((a, t) => a + t.paid, 0), balance: ts.reduce((a, t) => a + t.balance, 0), pending: ts.flatMap((t) => t.payments).filter((p) => p.status === 'Pending approval').length };
  });
  const THRESHOLD = 500; // FN-03 director-set threshold (mock default)
  const FOLLOW_UP_DAYS = 30; // §17.5 "follow-up after one month" (Q-P9)
  const loadedAt = (t: Trip) => t.shipment.legs[0].passes[0]?.arrivedAt ?? t.shipment.legs[0].departedAt;
  const followUp = (t: Trip) => { const a = loadedAt(t); return a ? Date.parse(a) + FOLLOW_UP_DAYS * 864e5 : undefined; };
  const byKind = (t: Trip, k: CostKind) => t.costs.filter((c) => c.kind === k).reduce((a, c) => a + c.amount, 0);
  const byProvider = $derived.by(() => {
    const m = new Map<string, { agreed: number; paid: number; trips: number }>();
    for (const t of trips ?? []) {
      const pid = lookup.truck(t.shipment.legs[0].truckId)?.providerId ?? '';
      const cur = m.get(pid) ?? { agreed: 0, paid: 0, trips: 0 };
      cur.agreed += t.transport; cur.paid += t.paid; cur.trips++; m.set(pid, cur);
    }
    return [...m.entries()].sort((a, b) => (b[1].agreed - b[1].paid) - (a[1].agreed - a[1].paid));
  });
  const exportRows = () => [['Shipment', 'Truck', 'Provider', 'Route', 'Agreed transport (USD)', 'Paid (USD)', 'Balance (USD)', 'Goods (USD)', 'Expenses (USD)', 'Landing cost (USD)', 'Cases', 'Landing cost per case (USD)'],
    ...(trips ?? []).map((t) => { const tr = lookup.truck(t.shipment.legs[0].truckId); return [t.shipment.ref, tr?.reg ?? '', lookup.provider(tr?.providerId ?? '')?.name ?? '', lookup.route(t.shipment.legs[0].routeId)?.name ?? '', t.transport, t.paid, t.balance, Math.round(t.goods * 100) / 100, t.expenses, Math.round(t.landing * 100) / 100, t.cases, Math.round(t.perCase * 100) / 100]; })];
  const kinds: CostKind[] = ['Transport', 'Taxes & duties', 'Clearing & forwarding', 'Loading & offloading', 'Storage', 'Other'];

  async function approve(id: string) { await finance.approve(id); say('Payment approved'); }

  // Dialogs
  let payDlg = $state<HTMLDialogElement>(); let costDlg = $state<HTMLDialogElement>();
  let cur = $state<Trip | null>(null);
  let pAmount = $state(0); let pRef = $state(''); let pCost = $state('');
  let cKind = $state<CostKind>('Taxes & duties'); let cAmount = $state(0); let cDoc = $state('');
  function openPay(t: Trip) { cur = t; pCost = t.costs.find((c) => c.kind === 'Transport')?.id ?? t.costs[0]?.id ?? ''; pAmount = Math.max(0, t.balance); pRef = ''; payDlg?.showModal(); }
  function openCost(t: Trip) { cur = t; cKind = 'Taxes & duties'; cAmount = 0; cDoc = ''; costDlg?.showModal(); }
  async function savePay(e: Event) {
    e.preventDefault(); if (!pRef.trim() || pAmount <= 0) return say('Enter amount and reference');
    const p = await finance.pay(cur!.shipment.id, pCost, pAmount, pRef, THRESHOLD); payDlg?.close();
    say(p.status === 'Pending approval' ? 'Above threshold — sent to director for approval (FN-03)' : 'Payment recorded');
  }
  async function saveCost(e: Event) {
    e.preventDefault(); if (cAmount <= 0) return say('Enter an amount');
    await finance.addCost({ shipmentId: cur!.shipment.id, kind: cKind, amount: cAmount, currency: 'USD', docRef: cDoc || undefined }); costDlg?.close(); say('Expense added to landing cost');
  }
</script>

<div class="page-head">
  <div><div class="overline crumb">Finance</div><h1>Trip financials & landing cost</h1></div>
  <div class="row"><p class="muted small" style="max-width:440px;margin:0">Agreed transport price is captured at loading (§17.5). Payments above USD {THRESHOLD} need director approval (FN-03; threshold set by directors).</p><ExportMenu name="trip-financials" rows={exportRows} /></div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="grid grid-kpi" style="margin-bottom:var(--space-4)">
  <div class="card kpi"><div class="overline">Agreed transport</div><div class="value">{fmtMoney(totals.transport)}</div></div>
  <div class="card kpi"><div class="overline">Paid</div><div class="value">{fmtMoney(totals.paid)}</div></div>
  <div class="card kpi"><div class="overline">Outstanding</div><div class="value accent-text">{fmtMoney(totals.balance)}</div></div>
  <div class="card kpi"><div class="overline">Awaiting approval</div><div class="value">{totals.pending}</div><div class="delta">payments</div></div>
</div>

<div class="card flush table-wrap">
  <table class="table">
    <thead><tr><th></th><th>Shipment</th><th>Truck · Provider</th><th>Route</th><th class="num">Agreed (USD)</th><th class="num">Paid</th><th class="num">Balance</th><th>Payment</th><th>Follow-up</th><th class="num">Landing cost / case (USD)</th></tr></thead>
    <tbody>
      {#if !trips}<tr><td colspan="10"><div class="skeleton"></div></td></tr>{/if}
      {#each trips ?? [] as t (t.shipment.id)}
        {@const leg = t.shipment.legs[0]}
        {@const truck = lookup.truck(leg.truckId)}
        <tr class="clickable" onclick={() => (open = open === t.shipment.id ? null : t.shipment.id)}>
          <td>{#if open === t.shipment.id}<ChevronDown size={16} />{:else}<ChevronRight size={16} />{/if}</td>
          <td><span class="mono" style="white-space:nowrap">{t.shipment.ref}</span><div class="caption" style="white-space:nowrap">Truck {t.shipment.truckNo} · {t.shipment.legs.length} leg{t.shipment.legs.length > 1 ? 's' : ''}</div></td>
          <td>{truck?.reg}<div class="caption">{lookup.provider(truck?.providerId ?? '')?.name}</div></td>
          <td class="small">{lookup.route(leg.routeId)?.name}</td>
          <td class="num">{fmtNum(t.transport, 2)}</td>
          <td class="num">{fmtNum(t.paid, 2)}</td>
          <td class="num" class:accent-text={t.balance > 0}>{fmtNum(t.balance, 2)}</td>
          <td><Badge status={payStatus(t)} />{#if t.payments.some((p) => p.status === 'Pending approval')} <Badge status="Pending approval" />{/if}</td>
          <td class="small">{#if t.balance > 0 && followUp(t)}{@const due = followUp(t)!}<span class:accent-text={due < Date.now()}>{due < Date.now() ? 'Overdue · ' : ''}{fmtDate(due)}</span>{:else}<span class="subtle">—</span>{/if}</td>
          <td class="num">{fmtNum(t.perCase, 2)}</td>
        </tr>
        {#if open === t.shipment.id}
          <tr class="detail"><td colspan="10">
            <div class="detail-grid">
              <section>
                <div class="row between"><div class="overline">Costs</div>{#if canPay}<button class="btn btn-ghost btn-sm" onclick={() => openCost(t)}>Add expense</button>{/if}</div>
                <table class="table">
                  <tbody>
                    {#each t.costs as c}<tr><td>{c.kind}{#if c.legId}<span class="caption"> · leg</span>{/if}</td><td class="caption">{c.docRef ?? ''}</td><td class="num">{fmtNum(c.amount, 2)}</td></tr>{/each}
                    <tr class="subtotal"><td colspan="2">Total expenses</td><td class="num">{fmtNum(t.expenses, 2)}</td></tr>
                  </tbody>
                </table>
              </section>
              <section>
                <div class="row between"><div class="overline">Payments</div>{#if canPay}<button class="btn btn-ghost btn-sm" onclick={() => openPay(t)}>Record payment</button>{/if}</div>
                <table class="table">
                  <tbody>
                    {#each t.payments as p}
                      <tr><td class="small">{fmtDateTime(p.at)}</td><td class="mono small" style="white-space:nowrap">{p.reference}</td><td class="num">{fmtNum(p.amount, 2)}</td>
                        <td>{#if p.status === 'Pending approval' && canApprove}<button class="btn btn-accent btn-sm" onclick={() => approve(p.id)}>Approve</button>{:else}<Badge status={p.status} />{/if}</td></tr>
                    {:else}<tr><td class="empty small">No payments yet</td></tr>{/each}
                  </tbody>
                </table>
              </section>
              <section class="card landing">
                <div class="overline">Landing cost · truck {t.shipment.truckNo} (§17.6)</div>
                <div class="row between"><span class="muted">Goods (price × loaded qty)</span><span class="num">{fmtNum(t.goods, 2)}</span></div>
                {#each kinds as k}{@const v = byKind(t, k)}<div class="row between small"><span class="muted">+ {k}</span><span class="num" class:subtle={!v}>{v ? fmtNum(v, 2) : '—'}</span></div>{/each}
                <div class="row between total"><span>Landing cost (USD)</span><span class="num">{fmtNum(t.landing, 2)}</span></div>
                <div class="row between"><span class="muted">Cases</span><span class="num">{fmtNum(t.cases)}</span></div>
                <div class="row between"><strong>Per case (USD)</strong><strong class="num">{fmtNum(t.perCase, 2)}</strong></div>
                <p class="caption">Allocation across SKUs on mixed loads: rule to be agreed (Q-P3).</p>
              </section>
            </div>
          </td></tr>
        {/if}
      {:else}{#if trips}<tr><td colspan="10" class="empty">No trips yet</td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<section class="card flush" style="margin-top:var(--space-4);max-width:720px">
  <header><h3>Balances by transport provider</h3><span class="caption">§10 Finance · follow-up {FOLLOW_UP_DAYS} days after loading (Q-P9)</span></header>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>Provider</th><th class="num">Trips</th><th class="num">Agreed (USD)</th><th class="num">Paid (USD)</th><th class="num">Balance (USD)</th></tr></thead>
    <tbody>{#each byProvider as [pid, v]}<tr><td>{lookup.provider(pid)?.name ?? '—'} {#if lookup.provider(pid) && !lookup.provider(pid)!.regular}<span class="caption">market</span>{/if}</td><td class="num">{v.trips}</td><td class="num">{fmtNum(v.agreed, 2)}</td><td class="num">{fmtNum(v.paid, 2)}</td><td class="num" class:accent-text={v.agreed - v.paid > 0}>{fmtNum(v.agreed - v.paid, 2)}</td></tr>{/each}</tbody>
  </table></div>
</section>

<dialog class="sheet" bind:this={payDlg}>
  <form class="body stack" onsubmit={savePay}>
    <h3>Record payment</h3>
    {#if cur}<p class="muted small"><span class="mono">{cur.shipment.ref}</span> · balance {fmtMoney(cur.balance)}</p>
    <label class="field"><span>Against cost</span><select class="select" bind:value={pCost}>{#each cur.costs as c}<option value={c.id}>{c.kind} · {fmtMoney(c.amount)}</option>{/each}</select></label>{/if}
    <div class="form-grid">
      <label class="field"><span>Amount (USD)</span><input class="input num" type="number" step="0.01" bind:value={pAmount} /></label>
      <label class="field"><span>Reference</span><input class="input" bind:value={pRef} placeholder="M-Pesa / bank ref" /></label>
    </div>
    {#if pAmount > THRESHOLD}<div class="note warn small">Above USD {THRESHOLD}: this payment will wait for director approval before it counts as paid (FN-03).</div>{/if}
    <label class="field"><span>Receipt (FN-02)</span><input class="input" type="file" accept="image/*,application/pdf" style="padding-top:8px" /><span class="help">Stored in the document store against the shipment in the real build.</span></label>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => payDlg?.close()}>Cancel</button><button class="btn btn-primary">Save payment</button></div>
  </form>
</dialog>

<dialog class="sheet" bind:this={costDlg}>
  <form class="body stack" onsubmit={saveCost}>
    <h3>Add expense</h3>
    <div class="form-grid">
      <label class="field"><span>Type</span><select class="select" bind:value={cKind}>{#each kinds as k}<option>{k}</option>{/each}</select></label>
      <label class="field"><span>Amount (USD)</span><input class="input num" type="number" step="0.01" bind:value={cAmount} /></label>
      <label class="field"><span>Document reference</span><input class="input" bind:value={cDoc} /></label>
    </div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => costDlg?.close()}>Cancel</button><button class="btn btn-primary">Add</button></div>
  </form>
</dialog>

<style>
  tr.detail > td { background: var(--surface-sunken); padding: var(--space-4); height: auto; }
  tr.detail:hover > td { background: var(--surface-sunken) !important; }
  .detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 300px; gap: var(--space-4); align-items: start; }
  .detail-grid .table td { background: var(--surface); }
  @media (max-width: 1100px) { .detail-grid { grid-template-columns: minmax(0, 1fr); } }
  .landing { display: flex; flex-direction: column; gap: var(--space-2); }
  .note.warn { background: var(--warning-subtle); color: var(--warning); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); }
  .landing .total { border-top: 1px solid var(--border); padding-top: var(--space-2); font-weight: 700; }
</style>
