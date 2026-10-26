<script lang="ts">
  // Approvals: transport payments over the limit (directors) and — only when config.approvals.purchaseOrders is on —
  // purchase orders awaiting approval (approve & sign / reject here or on the PO). Period plans never wait for approval.
  import { finance, pos, type PurchaseOrder, type User } from '@btw/api';
  import { Badge, SignaturePad, fmtDateTime, say } from '@btw/ui';
  import Sheet from '../../components/Sheet.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FileText from '@lucide/svelte/icons/file-text';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { mayApprovePOs, mayApprovePayments } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh, settle } from '../load.svelte';
  import { costLabel, pendingOf, transporter } from '../money';
  import { revLabel, supplierName } from '../plan';
  import { truckReg } from '../shipment';
  import { num, usd, usdFull } from '../fmt';
  import { haptic } from '../../native';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { user }: { user: User; view: View; query: URLSearchParams } = $props();
  const r = new Res(async () => {
    const [trips, orders] = await Promise.all([mayApprovePayments(user) ? finance.trips() : Promise.resolve([]), mayApprovePOs(user) ? settle(pos.list(), [] as PurchaseOrder[]) : ([] as PurchaseOrder[])]);
    return { pays: trips.flatMap((t) => pendingOf(t).map((p) => ({ p, t }))), orders: orders.filter((o) => o.status === 'Awaiting approval') };
  });
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const readOnly = $derived(co.active === null);
  let busy = $state('');
  async function approve(id: string) {
    busy = id;
    try { await finance.approve(id); haptic('success'); say('Payment approved'); await r.reload(); } catch (e) { say((e as Error).message); } finally { busy = ''; }
  }
  // PO decision sheet: approve needs a signature, reject (= soft delete) needs a comment.
  let deciding = $state<{ po: PurchaseOrder; action: 'approved' | 'rejected' } | null>(null);
  let comment = $state(''), signature = $state('');
  function open(po: PurchaseOrder, action: 'approved' | 'rejected') { deciding = { po, action }; comment = ''; signature = ''; }
  async function decide() {
    if (!deciding) return;
    const { po, action } = deciding;
    if (action === 'approved' && !signature) return say('Sign inside the box to approve');
    if (action === 'rejected' && !comment.trim()) return say('Say why the order is rejected');
    busy = po.id;
    try {
      await pos.decide(po.id, action, comment.trim() || undefined, signature || undefined);
      haptic('success'); say(action === 'approved' ? `${po.ref} approved — issued` : `${po.ref} rejected`);
      deciding = null; await r.reload();
    } catch (e) { say((e as Error).message); haptic('warning'); } finally { busy = ''; }
  }
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton rows={4} />
{:else if r.data && !r.data.pays.length && !r.data.orders.length}
  <Empty title="Nothing to approve" text="You're all caught up." />
{:else if r.data}
  {#if readOnly}<p class="t-hint">You're in the Group view. Switch to a company to approve.</p>{/if}
  {#if r.data.pays.length}
    <h3 class="t-title">Transport payments · {r.data.pays.length}</h3>
    <div class="t-list">
      {#each r.data.pays as { p, t } (p.id)}
        <div class="t-card pay">
          <div class="t-row between"><span class="t-row">{#if co.active === null}<CompanyDot entityId={t.shipment.entityId} />{/if}<strong>{usdFull(p.amount, t.costs.find((c) => c.id === p.costId)?.currency ?? 'USD')}</strong></span><Badge status={p.status} /></div>
          <span class="t-meta">{transporter(t.shipment)} · {truckReg(t.shipment.legs[0])} · {t.shipment.ref}</span>
          <span class="t-meta">{costLabel(t, p.costId)} · ref {p.reference} · {fmtDateTime(p.at)}</span>
          <span class="t-meta">Trip: {usd(t.paid)} paid of {usd(t.transport)}</span>
          <div class="t-actions">
            <a class="btn btn-secondary btn-lg" href="#/money/{t.shipment.id}">Open trip</a>
            <button class="btn btn-accent btn-lg" onclick={() => approve(p.id)} disabled={readOnly || busy === p.id}>{busy === p.id ? 'Approving…' : 'Approve'}</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {#if r.data.orders.length}
    <h3 class="t-title">Purchase orders · {r.data.orders.length}</h3>
    <div class="t-list">
      {#each r.data.orders as o (o.id)}
        <div class="t-card pay">
          <a class="t-row between po" href="#/orders/po/{o.id}">
            <span class="t-row">{#if co.active === null}<CompanyDot entityId={o.entityId} />{/if}<span class="t-icon sm"><FileText size={18} /></span><strong class="t-ellipsis">{o.baseRef ?? o.ref}{o.revision ? ` · ${revLabel(o.revision)}` : ''}</strong></span>
            <ChevronRight class="t-chev" size={20} />
          </a>
          <span class="t-meta t-ellipsis">{supplierName(o.supplierId)}{o.title ? ` · ${o.title}` : ''}</span>
          <span class="t-meta">{o.cases != null ? `${num(o.cases)} cases` : ''}{o.trucks ? ` · ${o.trucks} trucks` : ''}{o.amount != null ? ` · ${usd(o.amount)}` : ''}</span>
          <div class="t-actions">
            <button class="btn btn-secondary btn-lg" onclick={() => open(o, 'rejected')} disabled={readOnly || busy === o.id}>Reject</button>
            <button class="btn btn-accent btn-lg" onclick={() => open(o, 'approved')} disabled={readOnly || busy === o.id}>Approve</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

{#if deciding}
  <Sheet modal title={deciding.action === 'approved' ? `Approve ${deciding.po.ref}` : `Reject ${deciding.po.ref}`} onclose={() => (deciding = null)}>
    {#if deciding.action === 'approved'}<SignaturePad bind:value={signature} />{:else}<p class="t-hint">Rejecting deletes the purchase order; the planner sees your comment.</p>{/if}
    <label class="field"><span>Comment {deciding.action === 'approved' ? '(optional)' : '(required)'}</span><textarea class="textarea" bind:value={comment} rows="3"></textarea></label>
    <div class="t-actions">
      <button class="btn btn-lg {deciding.action === 'rejected' ? 'btn-danger' : 'btn-primary'}" onclick={decide} disabled={busy !== ''}>{busy ? 'Saving…' : deciding.action === 'approved' ? 'Approve & issue' : 'Reject'}</button>
    </div>
  </Sheet>
{/if}

<style>
  .pay { display: flex; flex-direction: column; gap: 4px; }
  .pay strong { font: 800 20px var(--ff-display); }
  .pay .t-actions { margin-top: 8px; }
  .pay .btn { text-decoration: none; }
  .po { color: inherit; text-decoration: none; }
  .t-icon.sm { width: 34px; height: 34px; border-radius: 10px; }
</style>
