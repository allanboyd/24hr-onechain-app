<script lang="ts">
  // Purchase order: stage, revision, lines per truck, every version (original, office updates, revisions at loading)
  // with what changed. Planners/directors download & email the letter, update it on the web (= a new revision) or delete
  // it while nothing is loaded; directors approve / reject when config.approvals.purchaseOrders is on.
  import { lookup, mode, pos, type PoVersion, type PurchaseOrder, type User } from '@btw/api';
  import * as R from '@btw/api/rules';
  import { Badge, SignaturePad, fmtDate, fmtDateTime, say } from '@btw/ui';
  import Download from '@lucide/svelte/icons/download';
  import Send from '@lucide/svelte/icons/send';
  import Trash from '@lucide/svelte/icons/trash-2';
  import TruckIcon from '@lucide/svelte/icons/truck';
  import CompanyChip from '../../components/CompanyChip.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { canIssuePO, mayApprovePOs } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import { STAGE_TONE, orderCases, revLabel, stageOf, supplierName } from '../plan';
  import { num, plural, usdFull } from '../fmt';
  import { cpShort } from '../../lib';
  import { haptic } from '../../native';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import WebButton from '../components/WebButton.svelte';
  import type { View } from '../routes';
  let { user, view }: { user: User; view: View; query: URLSearchParams } = $props();
  const id = $derived((view as { id?: string }).id!);
  const r = new Res(() => pos.get(id));
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const po = $derived(r.data?.po);
  const plan = $derived(r.data?.plan);
  const acts = $derived(r.data?.actions);
  const stage = $derived(po ? stageOf(po) : 'Created');
  const deleted = $derived(po?.status === 'Deleted' || stage === 'Deleted');
  const awaiting = $derived(po?.status === 'Awaiting approval');
  const newer = $derived(r.data && r.data.effectiveId !== id ? r.data.effectiveId : null);
  const trucks = $derived(plan ? [...new Set(plan.lines.map((l) => l.truckNo))].sort((a, b) => a - b).map((n) => ({ n, lines: plan.lines.filter((l) => l.truckNo === n) })) : []);
  const value = $derived(plan && !po?.pricesHidden ? plan.lines.reduce((a, l) => a + l.qty * (l.price ?? 0), 0) : null);
  const versions = $derived([...(r.data?.versions ?? [])].reverse());
  const destOf = (routeId: string) => cpShort(lookup.route(routeId)?.stops.at(-1)?.checkpointId);
  const product = (pid: string) => { const p = lookup.product(pid); return p ? `${p.brand} ${p.pack}` : pid; };
  const who = (uid?: string) => (uid ? lookup.user(uid)?.name ?? '—' : '—');
  const KIND: Record<PoVersion['kind'], string> = { original: 'Original', updated: 'Updated by office', 'revised at loading': 'Revised at loading' };
  const live = $derived(co.active !== null);
  const may = $derived(canIssuePO(user) && live && !deleted && !awaiting);
  const mayDecide = $derived(!!acts?.approve && mayApprovePOs(user) && live);
  let busy = $state<'' | 'pdf' | 'send' | 'delete' | 'decide'>('');

  async function pdf() {
    busy = 'pdf';
    try {
      const blob = await pos.pdf(id);
      if (!blob) { say('The PDF letter is made by the server — open the order in the web app to print it.'); return; }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `${po!.ref}.pdf` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) { say((e as Error).message); } finally { busy = ''; }
  }
  async function send() {
    busy = 'send';
    try {
      await pos.send(id); haptic('success');
      const to = lookup.supplier(po!.supplierId)?.email;
      say(mode === 'http' ? `Emailed to ${to ?? 'the supplier'}` : 'Marked as sent (demo: no email leaves the phone)');
      await r.reload();
    } catch (e) { say((e as Error).message); haptic('warning'); } finally { busy = ''; }
  }

  // Sheets: delete (reason required) · approve (signature) · reject (comment required; deletes the PO).
  let sheet = $state<'' | 'delete' | 'approved' | 'rejected'>('');
  let text = $state(''), signature = $state('');
  const openSheet = (k: typeof sheet) => { sheet = k; text = ''; signature = ''; };
  async function confirm() {
    if (sheet === 'delete' && !text.trim()) return say('Say why the order is deleted');
    if (sheet === 'rejected' && !text.trim()) return say('Say why the order is rejected');
    if (sheet === 'approved' && !signature) return say('Sign inside the box to approve');
    const k = sheet;
    busy = k === 'delete' ? 'delete' : 'decide';
    try {
      const done: PurchaseOrder = k === 'delete' ? await pos.remove(id, text.trim()) : await pos.decide(id, k as 'approved' | 'rejected', text.trim() || undefined, signature || undefined);
      haptic('success');
      say(k === 'delete' ? `${done.ref} deleted` : k === 'approved' ? `${done.ref} approved — issued` : `${done.ref} rejected`);
      sheet = ''; await r.reload();
    } catch (e) { say((e as Error).message); haptic('warning'); } finally { busy = ''; }
  }
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="card" /><Skeleton rows={3} />
{:else if !po || !plan}
  <Empty title="Order not found" text="It may belong to another company. Switch company and try again." />
{:else}
  <section class="t-card hero" class:gone={deleted}>
    <div class="t-row between"><span class="t-row"><span class="ref">{po.baseRef ?? po.ref}</span>{#if po.revision}<span class="rev">{revLabel(po.revision)}</span>{/if}</span><Badge tone={STAGE_TONE[stage]}>{stage}</Badge></div>
    <h2 class="t-h1">{supplierName(po.supplierId)}</h2>
    {#if po.title}<p class="t-sub">{po.title}</p>{/if}
    <CompanyChip entityId={po.entityId} />
    {#if deleted}<p class="note danger">Deleted{po.deleteReason ? ` · ${po.deleteReason}` : ''}{po.deletedById ? ` — ${who(po.deletedById)}` : ''}{po.deletedAt ? `, ${fmtDate(po.deletedAt)}` : ''}</p>{/if}
    {#if newer}<a class="note" href="#/orders/po/{newer}">This version was replaced by a later revision — open the current one</a>{/if}
    <div class="t-split totals">
      <div><span class="t-meta">Cases</span><strong>{num(orderCases(plan))}</strong></div>
      {#if value != null}<div><span class="t-meta">Value</span><strong>{usdFull(value, po.currency)}</strong></div>{/if}
      <div><span class="t-meta">Trucks</span><strong>{trucks.length}</strong></div>
      <div><span class="t-meta">Dated</span><strong>{fmtDate(po.date)}</strong></div>
    </div>
    {#if awaiting}<p class="t-hint">Waiting for a director's approval before it can be sent to the supplier.</p>
    {:else if !deleted && po.approvedAt}<p class="t-meta">{R.approvalText(po, who(po.approvedById))}{po.sentAt ? ` · sent ${fmtDate(po.sentAt)}` : ' · not sent yet'}</p>{/if}

    {#if mayDecide}
      <div class="t-actions">
        <button class="btn btn-secondary btn-lg" onclick={() => openSheet('rejected')}>Reject</button>
        <button class="btn btn-accent btn-lg" onclick={() => openSheet('approved')}>Approve & sign</button>
      </div>
    {/if}
    {#if may && !newer}
      <div class="t-actions">
        <button class="btn btn-secondary btn-lg" onclick={pdf} disabled={busy !== ''}><Download size={18} />{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
        <button class="btn btn-primary btn-lg" onclick={send} disabled={busy !== ''}><Send size={18} />{busy === 'send' ? 'Sending…' : po.sentAt ? 'Email again' : 'Email to supplier'}</button>
      </div>
    {:else if canIssuePO(user) && !live && !deleted}
      <p class="t-hint">Switch to the order's company to download, send, update or delete it.</p>
    {/if}
    {#if live && !deleted && !newer}
      {#if acts?.update}<WebButton path="/pos/{po.id}/edit" label="Update on the web" />
      {:else if acts?.updateBlocked && canIssuePO(user)}<p class="t-hint">{acts.updateBlocked}</p>{/if}
      {#if acts?.delete}<button class="btn btn-secondary btn-lg del" onclick={() => openSheet('delete')} disabled={busy !== ''}><Trash size={18} />Delete</button>
      {:else if acts?.deleteBlocked && canIssuePO(user)}<p class="t-hint">{acts.deleteBlocked}</p>{/if}
    {/if}
  </section>

  <h3 class="t-title">Lines per truck</h3>
  {#each trucks as t (t.n)}
    <section class="t-card truck">
      <div class="t-row between"><span class="t-row"><span class="t-icon sm"><TruckIcon size={18} /></span><strong>Truck {t.n}</strong></span><span class="t-meta">{num(t.lines.reduce((a, l) => a + l.qty, 0))} cases</span></div>
      <ul>
        {#each t.lines as l (l.id)}
          {@const p = lookup.product(l.productId)}
          <li>
            <span class="grow"><b>{p?.brand ?? l.productId}</b> <span class="t-meta">{p?.pack ?? ''}</span><br /><span class="t-meta">to {destOf(l.routeId)}</span></span>
            <span class="num"><b>{num(l.qty)}</b>{#if l.price != null}<br /><span class="t-meta">× {usdFull(l.price, '')}</span>{/if}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  {#if versions.length}
    <h3 class="t-title">Versions · {versions.length}</h3>
    <ol class="hist">
      {#each versions as v (v.poId)}
        <li class:cur={v.poId === r.data?.effectiveId}>
          <a class="vref" href="#/orders/po/{v.poId}">{v.ref}</a> · <strong>{KIND[v.kind]}</strong>
          <br /><span class="t-meta">{who(v.byUserId)} · {fmtDateTime(v.at)}</span>
          {#if v.reason}<br /><span class="t-meta">“{v.reason}”</span>{/if}
          {#if v.lineChanges.length}
            <ul class="changes">
              {#each v.lineChanges as c, i (c.lineId + i)}<li class={c.kind === 'added' ? 'add' : c.kind === 'removed' ? 'rm' : ''}>{R.lineChangeText(c, product)}</li>{/each}
            </ul>
          {:else if v.kind === 'original'}<br /><span class="t-meta">{plural(new Set(v.lines.map((l) => l.truckNo)).size, 'truck')} · {num(v.lines.reduce((a, l) => a + l.qty, 0))} cases</span>{/if}
        </li>
      {/each}
    </ol>
  {/if}

  {#if po.approvedById && po.signature?.startsWith('data:')}
    <section class="t-card sig">
      <span class="t-meta">Signed by</span>
      <img src={po.signature} alt="Signature" />
      <strong>{who(po.approvedById)}</strong>
      <span class="t-meta">{fmtDateTime(po.approvedAt)}</span>
    </section>
  {/if}
  <WebButton path="/pos/{po.id}" label="View the letter in web app" />
{/if}

{#if sheet}
  <Sheet modal title={sheet === 'delete' ? `Delete ${po?.ref ?? ''}` : sheet === 'approved' ? 'Approve & sign' : 'Reject order'} onclose={() => (sheet = '')}>
    {#if sheet === 'approved'}<SignaturePad bind:value={signature} />
    {:else}<p class="t-hint">{sheet === 'delete' ? 'The order is kept for the record but no longer counts. Nothing has been loaded yet.' : 'Rejecting deletes the purchase order; the planner sees your comment.'}</p>{/if}
    <label class="field"><span>{sheet === 'delete' ? 'Reason' : 'Comment'} {sheet === 'approved' ? '(optional)' : '(required)'}</span><textarea class="textarea" bind:value={text} rows="3"></textarea></label>
    <div class="t-actions">
      <button class="btn btn-lg {sheet === 'approved' ? 'btn-primary' : 'btn-danger'}" onclick={confirm} disabled={busy !== ''}>{busy ? 'Saving…' : sheet === 'delete' ? 'Delete order' : sheet === 'approved' ? 'Approve & issue' : 'Reject'}</button>
    </div>
  </Sheet>
{/if}

<style>
  .hero { display: flex; flex-direction: column; gap: 8px; border-top: 4px solid var(--t-accent); }
  .ref { font: 700 14px var(--ff-mono); color: var(--text-muted); }
  .totals { margin: 6px 0 4px; }
  .totals div { display: flex; flex-direction: column; padding: 10px 12px; border-radius: 14px; background: var(--surface-sunken); }
  .totals strong { font: 700 17px var(--ff-display); font-variant-numeric: tabular-nums; }
  .t-icon.sm { width: 34px; height: 34px; border-radius: 10px; }
  .truck ul { list-style: none; margin: 8px 0 0; padding: 0; }
  .truck li { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--t-line); }
  .grow { flex: 1; min-width: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .hero.gone { border-top-color: var(--danger, #B4231B); }
  .rev { font: 700 11px var(--ff-mono); padding: 2px 6px; border-radius: 6px; background: var(--surface-sunken); color: var(--text-muted); }
  .note { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--surface-sunken); font-weight: 600; color: inherit; }
  .note.danger { color: var(--danger, #B4231B); }
  .del { border-radius: 14px; }
  .hist { list-style: none; margin: 0 0 16px; padding: 0 0 0 14px; border-left: 2px solid var(--border); display: flex; flex-direction: column; gap: 14px; }
  .hist > li { position: relative; }
  .hist > li::before { content: ''; position: absolute; left: -21px; top: 5px; width: 12px; height: 12px; border-radius: 50%; background: var(--border); }
  .hist > li.cur::before { background: var(--t-accent); }
  .vref { font: 700 13px var(--ff-mono); color: inherit; }
  .changes { margin: 6px 0 0; padding: 0 0 0 16px; font-size: 14px; display: flex; flex-direction: column; gap: 2px; }
  .changes .add { color: var(--success, #1F7A3A); }
  .changes .rm { color: var(--danger, #B4231B); }
  .sig { display: flex; flex-direction: column; gap: 4px; }
  .sig img { max-height: 70px; max-width: 220px; object-fit: contain; background: #fff; border-radius: 8px; }
</style>
