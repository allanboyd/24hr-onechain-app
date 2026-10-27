<script lang="ts" module>
  import type { finance } from '@btw/api';
  export type Trip = Awaited<ReturnType<typeof finance.trips>>[number];
</script>

<script lang="ts">
  // Truck desk · money dialogs: the agreed transport price (recorded after loading, never by the loader) and a trip
  // expense. Both go through the unusual-amount confirmation; payments are recorded and approved by the directors in
  // Transport costs. Open them with `openAgreed(shipmentId?)` / `openCost(truckId?)` (bind:this).
  import { withUnusualConfirm } from '@btw/api/amounts';
  import { finance as fin, lookup, type CostKind } from '@btw/api';
  import { tripTruck } from '@btw/api/trucks';
  import { fmtMoney, say } from '@btw/ui';
  import { describe } from '../../lib/errors';
  let { trips }: { trips: Trip[] | null } = $props();

  type Cur = 'USD' | 'KES' | 'UGX' | 'TZS' | 'RWF';
  const CURS: Cur[] = ['USD', 'KES', 'UGX', 'TZS', 'RWF'];
  const KINDS: CostKind[] = ['Clearing & forwarding', 'Taxes & duties', 'Loading & offloading', 'Storage', 'Other'];
  const tripLabel = (t: Trip) => `${t.shipment.ref} · ${lookup.truck(tripTruck(t))?.reg ?? ''} · ${lookup.route(t.shipment.legs[0]?.routeId ?? '')?.name ?? ''}`;
  let busy = $state(false);

  // ---- agreed transport price ----
  const missingTrips = $derived((trips ?? []).filter((t) => t.agreedRecorded === false));
  let aDlg = $state<HTMLDialogElement>();
  let aTrip = $state(''); let aAmount = $state<number | ''>(''); let aCur = $state<Cur>('USD'); let aDoc = $state(''); let aErr = $state('');
  export function openAgreed(shipmentId?: string) {
    aTrip = shipmentId ?? missingTrips[0]?.shipment.id ?? ''; aAmount = ''; aCur = 'USD'; aDoc = ''; aErr = '';
    aDlg?.showModal();
  }
  async function saveAgreed(e: Event) {
    e.preventDefault(); aErr = '';
    if (!aTrip) { aErr = 'Pick the trip'; return; }
    if (!(Number(aAmount) > 0)) { aErr = 'Enter the agreed transport price (above zero)'; return; }
    busy = true;
    try { if (await withUnusualConfirm((confirmUnusual) => fin.setAgreedPrice(aTrip, { amount: Number(aAmount), currency: aCur, docRef: aDoc.trim() || undefined, confirmUnusual }))) { aDlg?.close(); say('Agreed transport price recorded — it is now the trip\'s transport cost'); } }
    catch (err) { aErr = describe(err).message; } finally { busy = false; }
  }

  // ---- trip expense ----
  let cDlg = $state<HTMLDialogElement>();
  let forTruck = $state('');
  let cTrip = $state(''); let cKind = $state<CostKind>('Other'); let cAmount = $state(0); let cCur = $state<Cur>('USD'); let cDoc = $state(''); let cErr = $state('');
  const tripChoices = $derived((trips ?? []).filter((t) => !forTruck || tripTruck(t) === forTruck).slice(0, 60));
  export function openCost(truckId?: string) {
    forTruck = truckId ?? '';
    const first = (trips ?? []).find((t) => !truckId || tripTruck(t) === truckId);
    cTrip = first?.shipment.id ?? ''; cKind = 'Other'; cAmount = 0; cCur = 'USD'; cDoc = ''; cErr = '';
    cDlg?.showModal();
  }
  async function saveCost(e: Event) {
    e.preventDefault(); cErr = '';
    if (!cTrip) { cErr = 'Pick the trip'; return; }
    if (!(cAmount > 0)) { cErr = 'Enter an amount above zero'; return; }
    busy = true;
    try { if (await withUnusualConfirm((confirmUnusual) => fin.addCost({ shipmentId: cTrip, kind: cKind, amount: Number(cAmount), currency: cCur, docRef: cDoc.trim() || undefined, confirmUnusual } as never))) { cDlg?.close(); say('Expense added to the trip — payments are recorded and approved by the directors'); } }
    catch (err) { cErr = describe(err).message; } finally { busy = false; }
  }
</script>

<dialog class="sheet" bind:this={aDlg} aria-labelledby="ap-title">
  <form class="body stack" onsubmit={saveAgreed}>
    <div><h3 id="ap-title">Record the agreed transport price</h3><div class="caption">Agreed with the transporter after loading (the loader records no price). It becomes the trip's transport cost; the directors record and approve payments.</div></div>
    <label class="field"><span>Trip</span><select class="select" bind:value={aTrip}>
      {#if missingTrips.length}<optgroup label="Not recorded yet">{#each missingTrips as t (t.shipment.id)}<option value={t.shipment.id}>{tripLabel(t)}</option>{/each}</optgroup>{/if}
      <optgroup label="Correct a recorded price (only while unpaid)">{#each (trips ?? []).filter((t) => t.agreedRecorded !== false).slice(0, 60) as t (t.shipment.id)}<option value={t.shipment.id}>{tripLabel(t)} · USD {fmtMoney(t.transport)}</option>{/each}</optgroup>
    </select></label>
    <label class="field"><span>Agreed price</span><span class="row"><select class="select cur" bind:value={aCur} aria-label="Currency">{#each CURS as c}<option>{c}</option>{/each}</select><input class="input num" type="number" min="0" step="0.01" bind:value={aAmount} aria-label="Agreed price" /></span></label>
    <label class="field"><span>Agreement reference (optional)</span><input class="input" bind:value={aDoc} placeholder="e.g. ETS rate card Oct 2026 / SMS from the provider" /></label>
    {#if aErr}<p class="error" role="alert">{aErr}</p>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => aDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>Record price</button></div>
  </form>
</dialog>

<dialog class="sheet" bind:this={cDlg} aria-labelledby="cost-title">
  <form class="body stack" onsubmit={saveCost}>
    <div><h3 id="cost-title">Add a trip expense</h3><div class="caption">Goes into the trip's landing cost. The directors record and approve payments.</div></div>
    <label class="field"><span>Trip</span><select class="select" bind:value={cTrip}>{#each tripChoices as t (t.shipment.id)}<option value={t.shipment.id}>{tripLabel(t)}</option>{/each}</select></label>
    <div class="form-grid">
      <label class="field"><span>Kind</span><select class="select" bind:value={cKind}>{#each KINDS as kd}<option>{kd}</option>{/each}</select></label>
      <label class="field"><span>Amount</span><span class="row"><select class="select cur" bind:value={cCur} aria-label="Currency">{#each CURS as c}<option>{c}</option>{/each}</select><input class="input num" type="number" min="0" step="0.01" bind:value={cAmount} aria-label="Amount" /></span></label>
    </div>
    <label class="field"><span>Receipt / reference</span><input class="input" bind:value={cDoc} placeholder="e.g. border clearing receipt CF-1234" /></label>
    {#if cErr}<p class="error" role="alert">{cErr}</p>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => cDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>Add expense</button></div>
  </form>
</dialog>

<style>
  .select.cur { width: 90px; }
  .error { color: var(--danger); font-weight: 600; margin: 0; }
</style>
