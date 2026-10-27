<script lang="ts">
  // Record dialog of the Transport costs page: the agreed transport price (Testfie, directors), a trip expense per trip /
  // leg (Testfie, directors, fleet), or a payment (directors; above the threshold it waits for a director's approval).
  // Opened on a trip (row / drawer) or from the header action, where the trip is picked first. Every save goes through
  // withUnusualConfirm (amount sanity check) and the currency is always shown and chosen explicitly.
  import { withUnusualConfirm } from '@btw/api/amounts';
  import { CURRENCIES } from '@btw/api/money';
  import { finance, type CostKind, type Currency } from '@btw/api';
  import { fmtNum, say } from '@btw/ui';
  import { attempt } from '../../lib/load.svelte';
  import { companyLabel } from '../../lib/companies';
  import { EXPENSE_KINDS, PAY_THRESHOLD, routeName, truckReg, type CostAct, type TripRef } from './costs';

  let { open = $bindable(false), kind, trips, shipmentId = '' }: {
    open?: boolean;
    kind: CostAct;
    /** trips the action can be recorded on (already filtered for this action and company) */ trips: TripRef[];
    /** preselected trip ('' = pick one) */ shipmentId?: string;
  } = $props();

  let dlg = $state<HTMLDialogElement>();
  let pick = $state('');
  let amount = $state<number | null>(null);
  let currency = $state<Currency>('USD');
  let docRef = $state('');
  let legId = $state('');
  let cost = $state<CostKind>('Taxes & duties');
  let costId = $state('');
  let err = $state(''); let busy = $state(false);

  const trip = $derived(trips.find((t) => t.shipmentId === pick) ?? null);
  const payCost = $derived(trip?.costs.find((c) => c.id === costId) ?? null);
  const TITLE: Record<CostAct, string> = { price: 'Record agreed price', expense: 'Trip expense', pay: 'Record payment' };
  const SAVED: Record<CostAct, string> = { price: 'Agreed price recorded', expense: 'Truck expense added', pay: 'Payment recorded' };

  function reset() {
    const t = trip; err = '';
    amount = kind === 'pay' ? (t?.balanceUsd ?? null) : kind === 'price' ? (t?.agreed?.amount ?? null) : null;
    currency = (kind === 'price' && t?.agreed?.currency) || 'USD';
    docRef = ''; cost = 'Taxes & duties'; legId = t?.legs[0]?.id ?? '';
    costId = t?.costs.find((c) => c.kind === 'Transport')?.id ?? t?.costs[0]?.id ?? '';
    if (kind === 'pay' && t) { const c = t.costs.find((x) => x.id === costId); if (c && c.currency !== 'USD' && t.balanceUsd !== null) amount = Math.round(t.balanceUsd * (c.fxRate ?? 1) * 100) / 100; }
  }
  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) { pick = shipmentId || (trips.length === 1 ? trips[0].shipmentId : ''); reset(); dlg.showModal(); }
    else if (!open && dlg.open) dlg.close();
  });
  function choose(id: string) { pick = id; reset(); }
  const payUsd = $derived(payCost && amount ? amount / (payCost.fxRate ?? 1) : 0);

  async function save(e: Event) {
    e.preventDefault();
    const t = trip; const amt = Number(amount);
    if (!t) { err = 'Choose the trip'; return; }
    if (!(amt > 0)) { err = 'Enter an amount above zero'; return; }
    if (kind === 'pay' && !docRef.trim()) { err = 'Enter the payment reference'; return; }
    if (kind === 'pay' && !payCost) { err = 'Record the agreed price first'; return; }
    busy = true;
    let saved = true;
    let pending = false;
    err = await attempt(async () => {
      const r = await withUnusualConfirm(async (confirmUnusual) => {
        if (kind === 'price') return finance.setAgreedPrice(t.shipmentId, { amount: amt, currency, docRef: docRef.trim() || undefined, confirmUnusual });
        if (kind === 'expense') return finance.addCost({ shipmentId: t.shipmentId, legId: legId || undefined, kind: cost, amount: amt, currency, docRef: docRef.trim() || undefined, entityId: t.entityId, confirmUnusual });
        return finance.pay(t.shipmentId, payCost!.id, amt, docRef.trim(), PAY_THRESHOLD, { confirmUnusual });
      });
      saved = !!r;
      pending = !!r && (r as { status?: string }).status === 'Pending approval';
    });
    busy = false;
    if (err || !saved) return;
    say(pending ? `Above USD ${PAY_THRESHOLD}: sent to a director for approval` : SAVED[kind]);
    open = false;
  }
</script>

<dialog class="sheet" bind:this={dlg} onclose={() => (open = false)} aria-labelledby="cost-dlg-title">
  <form class="body stack" onsubmit={save}>
    <h3 id="cost-dlg-title">{TITLE[kind]}</h3>
    {#if !shipmentId}
      <label class="field"><span>Trip</span>
        <select class="select" value={pick} onchange={(e) => choose(e.currentTarget.value)} aria-label="Trip">
          <option value="">{trips.length ? 'Choose a trip' : 'No trip to record this on'}</option>
          {#each trips as t (t.shipmentId)}<option value={t.shipmentId}>{t.ref} · {truckReg(t.truckId)} · {companyLabel(t.entityId)}</option>{/each}
        </select></label>
    {/if}
    {#if trip}
      <p class="muted small"><span class="mono">{trip.ref}</span> · {truckReg(trip.truckId)} · {companyLabel(trip.entityId)}
        {#if trip.agreed} · agreed {trip.agreed.currency} {fmtNum(trip.agreed.amount, 2)}{/if}{#if trip.balanceUsd !== null} · balance USD {fmtNum(trip.balanceUsd, 2)}{/if}</p>
      <div class="form-grid">
        {#if kind === 'expense'}
          <label class="field"><span>Expense</span><select class="select" bind:value={cost}>{#each EXPENSE_KINDS as x}<option value={x}>{x}</option>{/each}</select></label>
          <label class="field"><span>Leg</span><select class="select" bind:value={legId}>{#each trip.legs as l (l.id)}<option value={l.id}>Leg {l.seq} · {routeName(l.routeId)}</option>{/each}</select></label>
        {/if}
        {#if kind === 'pay'}
          <label class="field"><span>Against cost</span><select class="select" bind:value={costId}>{#each trip.costs as c (c.id)}<option value={c.id}>{c.kind} · {c.currency} {fmtNum(c.amount, 2)}</option>{/each}</select></label>
        {/if}
        <label class="field"><span>Amount ({kind === 'pay' ? payCost?.currency ?? 'USD' : currency})</span><input class="input num" type="number" min="0" step="0.01" bind:value={amount} aria-label={kind === 'price' ? 'Agreed price' : 'Amount'} /></label>
        {#if kind !== 'pay'}<label class="field"><span>Currency</span><select class="select" bind:value={currency}>{#each CURRENCIES as c}<option value={c}>{c}</option>{/each}</select></label>{/if}
        <label class="field"><span>{kind === 'pay' ? 'Payment reference (M-Pesa, bank TT…)' : 'Document reference'}</span><input class="input" bind:value={docRef} maxlength="120" placeholder={kind === 'pay' ? 'M-Pesa / bank ref' : ''} /></label>
      </div>
      {#if kind === 'pay' && payUsd > PAY_THRESHOLD}<div class="note warn small">Above USD {PAY_THRESHOLD}: this payment will wait for director approval before it counts as paid.</div>{/if}
    {/if}
    {#if err}<p class="error small" role="alert">{err}</p>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => (open = false)}>Cancel</button>
      <button class="btn btn-primary" disabled={busy || !trip}>{kind === 'pay' ? 'Save payment' : 'Save'}</button></div>
  </form>
</dialog>

<style>
  .error { color: var(--danger); margin: 0; }
  .note.warn { background: var(--warning-subtle); color: var(--warning); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); }
</style>
