<script lang="ts">
  // V3-12 step 3: supplier money on the purchase order. The supplier's pro-forma, advances paid against it (part may come
  // from money the supplier already holds for this company), credit notes (promotions), and a director's decision when
  // Management → Settings asks for approval. Management → Supplier balances reads these records; nothing is typed there.
  import { lookup, supplierMoney, type SupplierEntry, type SupplierEntryInput, type SupplierMoney } from '@btw/api';
  import { Badge, fmtDate, fmtNum, say } from '@btw/ui';
  import { watch } from '../lib/load.svelte';
  import { uploadPhoto } from '../lib/upload';
  import ErrorState from './ErrorState.svelte';
  import Wallet from '@lucide/svelte/icons/wallet';
  import Paperclip from '@lucide/svelte/icons/paperclip';

  let { poId, issued }: { poId: string; issued: boolean } = $props();
  let m = $state<SupplierMoney | null>(null);
  const w = watch(async () => { m = await supplierMoney.forPo(poId); }, () => poId);

  const KIND: Record<SupplierEntry['kind'], string> = { proforma: 'Pro-forma', advance: 'Advance paid', 'credit-note': 'Credit note', use: 'Paid from money the supplier holds' };
  const money = (n: number) => `${m?.currency ?? ''} ${fmtNum(n, 2)}`;
  const usd = (n: number) => `USD ${fmtNum(n, 2)}`;
  const tone = (s: SupplierEntry['status']) => (s === 'Recorded' ? 'success' : s === 'Pending approval' ? 'warning' : 'neutral');
  const company = $derived(m ? lookup.entity(m.entityId)?.shortName ?? '' : '');

  let dialog = $state<HTMLDialogElement>();
  type Kind = SupplierEntryInput['kind'];
  let kind = $state<Kind>('proforma');
  let form = $state({ amount: 0, useHeld: 0, date: '', reference: '', note: '' });
  let doc = $state<{ id: string; name: string; url: string } | null>(null);
  let error = $state(''), busy = $state(false);
  const today = () => new Date().toISOString().slice(0, 10);
  function open(k: Kind) {
    kind = k; error = ''; doc = null;
    form = { amount: k === 'advance' ? m?.po.open ?? 0 : 0, useHeld: 0, date: today(), reference: '', note: '' };
    dialog?.showModal();
  }
  async function pick(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (!f) return;
    busy = true; try { doc = await uploadPhoto(f); } catch (err) { error = (err as Error).message; } busy = false;
  }
  async function save(e: Event) {
    e.preventDefault(); error = ''; busy = true;
    try {
      await supplierMoney.record(poId, { kind, amount: Number(form.amount) || 0, useHeld: kind === 'advance' ? Number(form.useHeld) || 0 : undefined, date: form.date || undefined,
        reference: form.reference, note: form.note, documentFileId: doc?.id ?? null, documentName: doc?.name ?? null, documentUrl: doc?.url ?? null });
      dialog?.close();
      say(kind === 'proforma' ? 'Pro-forma added' : kind === 'credit-note' ? 'Credit note recorded · the directors are told' : m?.approvalOn ? 'Advance recorded · waiting for a director' : 'Advance recorded · the directors are told');
      w.retry();
    } catch (err) { error = (err as Error).message; }
    busy = false;
  }
  async function decide(x: SupplierEntry, approve: boolean) {
    busy = true;
    try { await supplierMoney.decide(x.id, approve); say(approve ? 'Advance approved' : 'Advance rejected'); w.retry(); }
    catch (err) { say((err as Error).message); }
    busy = false;
  }
</script>

<section class="card supplier-money no-print" aria-labelledby="sm-h">
  <header class="row between">
    <h3 id="sm-h" class="row"><Wallet size={18} />Supplier money</h3>
    {#if m?.canRecord && issued}
      <div class="row acts">
        <button class="btn btn-ghost btn-sm" onclick={() => open('proforma')}>Add pro-forma</button>
        <button class="btn btn-ghost btn-sm" onclick={() => open('credit-note')}>Record credit note</button>
        <button class="btn btn-primary btn-sm" onclick={() => open('advance')} disabled={!m.po.open}>Record advance</button>
      </div>
    {/if}
  </header>
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if m}
    <dl class="facts">
      <div><dt>Pro-forma</dt><dd>{m.po.proforma ? money(m.po.proforma) : '-'}</dd></div>
      <div><dt>Advances paid</dt><dd>{money(m.po.advances)}</dd></div>
      {#if m.po.pending}<div><dt>Waiting for a director</dt><dd class="warn">{money(m.po.pending)}</dd></div>{/if}
      <div><dt>Still open</dt><dd>{money(m.po.open)}</dd></div>
      <div class="held"><dt>The supplier holds for {company}</dt><dd>{usd(m.held.balance)}</dd>
        <span class="caption">short loads {usd(m.held.shortLoads)} · credit notes {usd(m.held.creditNotes)} · used {usd(m.held.used)}{#if m.held.pendingUse} · set aside {usd(m.held.pendingUse)}{/if}</span></div>
    </dl>
    {#if m.entries.length}
      <div class="table-wrap"><table class="table small">
        <thead><tr><th>Date</th><th>What</th><th class="num">Amount</th><th>Reference</th><th>By</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {#each m.entries as x (x.id)}
            <tr>
              <td class="nowrap">{fmtDate(x.date)}</td>
              <td>{KIND[x.kind]}{#if x.poId && x.poId !== poId} · <span class="mono">{x.poRef}</span>{/if}{#if x.note}<div class="caption">{x.note}</div>{/if}</td>
              <td class="num nowrap">{x.currency} {fmtNum(x.amount, 2)}{#if x.currency !== 'USD'}<div class="caption">USD {fmtNum(x.amountUsd, 2)}</div>{/if}</td>
              <td>{x.reference ?? '-'}{#if x.document?.url} <a href={x.document.url} target="_blank" rel="noopener" aria-label="Open {x.document.name}"><Paperclip size={14} /></a>{/if}</td>
              <td>{lookup.user(x.byUserId)?.name ?? '-'}</td>
              <td><Badge tone={tone(x.status)}>{x.status}</Badge></td>
              <td class="nowrap">{#if m.canDecide && x.status === 'Pending approval' && x.kind === 'advance'}<button class="btn btn-primary btn-sm" disabled={busy} onclick={() => decide(x, true)}>Approve</button> <button class="btn btn-ghost btn-sm" disabled={busy} onclick={() => decide(x, false)}>Reject</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    {:else}
      <p class="caption">Nothing recorded yet. Add the supplier's pro-forma when it arrives; advances are paid against it.{m.approvalOn ? ' Advances wait for a director (Management → Settings).' : ''}</p>
    {/if}
  {/if}
</section>

<dialog class="sheet" bind:this={dialog} style="width:min(560px,calc(100vw - 32px))" aria-labelledby="smd-h">
  {#if m}
  <form class="body stack" onsubmit={save}>
    <h3 id="smd-h">{kind === 'proforma' ? 'Add the supplier\'s pro-forma' : kind === 'credit-note' ? 'Record a credit note' : 'Record an advance payment'}</h3>
    {#if kind === 'advance'}<p class="caption">Open on the pro-forma: <strong>{money(m.po.open)}</strong>. The supplier holds <strong>{usd(m.held.available)}</strong> for {company}.{m.approvalOn ? ' This advance waits for a director.' : ' It counts at once; the directors are told.'}</p>{/if}
    {#if kind === 'credit-note'}<p class="caption">A credit note (promotion) adds to what the supplier holds for {company}. It can be used on a later advance.</p>{/if}
    <div class="form-grid">
      <label class="field"><span>{kind === 'advance' ? `Paid now (${m.currency})` : `Amount (${m.currency})`}</span><input class="input num" type="number" min="0" step="0.01" bind:value={form.amount} /></label>
      {#if kind === 'advance'}<label class="field"><span>From money the supplier holds ({m.currency})</span><input class="input num" type="number" min="0" step="0.01" bind:value={form.useHeld} /></label>{/if}
      <label class="field"><span>Date</span><input class="input" type="date" bind:value={form.date} max={today()} /></label>
      <label class="field"><span>Reference</span><input class="input" bind:value={form.reference} placeholder={kind === 'proforma' ? 'Pro-forma number' : kind === 'credit-note' ? 'Credit note number' : 'Transfer or slip number'} autocomplete="off" /></label>
    </div>
    <label class="field"><span>Note</span><input class="input" bind:value={form.note} autocomplete="off" /></label>
    <label class="field"><span>Document</span><input class="input" type="file" accept="image/*,application/pdf" onchange={pick} />{#if doc}<small class="caption">Attached: {doc.name}</small>{/if}</label>
    {#if error}<div class="error" role="alert">{error}</div>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => dialog?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>{kind === 'proforma' ? 'Add pro-forma' : kind === 'credit-note' ? 'Record credit note' : 'Record advance'}</button></div>
  </form>
  {/if}
</dialog>

<style>
  .supplier-money { display: flex; flex-direction: column; gap: var(--space-3); }
  .acts { gap: 6px; flex-wrap: wrap; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0; }
  .facts div { background: var(--surface-sunken); border-radius: 10px; padding: 10px 12px; }
  .facts dt { font-size: 12px; color: var(--text-muted); }
  .facts dd { margin: 2px 0 0; font-weight: 700; font-size: 17px; font-variant-numeric: tabular-nums; }
  .facts dd.warn { color: var(--warning); }
  .facts .held { grid-column: span 2; }
  @media (max-width: 700px) { .facts .held { grid-column: auto; } }
</style>
