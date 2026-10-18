<script lang="ts">
  // Order draft. When the company's config asks for director approval (config.approvals.purchaseOrders), a director
  // approves & signs a submitted draft here (or returns / rejects it with a comment). Editing stays in the web app.
  import { lookup, plans, type User } from '@btw/api';
  import { Badge, SignaturePad, fmtDate, fmtDateTime, say } from '@btw/ui';
  import CompanyChip from '../../components/CompanyChip.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { mayApprovePOs, poApprovalRequired } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import { orderCases, orderValue, supplierName } from '../plan';
  import { num, usdFull } from '../fmt';
  import { go } from '../routes';
  import { haptic } from '../../native';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import WebButton from '../components/WebButton.svelte';
  import type { View } from '../routes';
  let { user, view }: { user: User; view: View; query: URLSearchParams } = $props();
  const id = $derived((view as { id?: string }).id!);
  const r = new Res(() => plans.get(id));
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const p = $derived(r.data);
  const canDecide = $derived(!!p && p.status === 'Submitted' && mayApprovePOs(user) && co.active !== null);
  const byProduct = $derived(p ? [...p.lines.reduce((m, l) => m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty), new Map<string, number>())] : []);

  let deciding = $state<'' | 'approved' | 'returned' | 'rejected'>('');
  let comment = $state(''), signature = $state(''), busy = $state(false);
  async function decide() {
    if (deciding === 'approved' && !signature) return say('Sign inside the box to approve');
    if (deciding !== 'approved' && !comment.trim()) return say('Add a comment for the planner');
    busy = true;
    try {
      const done = await plans.decide(id, deciding as 'approved', comment || undefined, signature || undefined);
      haptic('success');
      say(deciding === 'approved' ? 'Approved — purchase order issued' : `Order ${deciding} — planner notified`);
      deciding = '';
      if (done.poId) go(`/orders/po/${done.poId}`); else await r.reload();
    } catch (e) { say((e as Error).message); haptic('warning'); } finally { busy = false; }
  }
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="card" />
{:else if !p}
  <Empty title="Draft not found" text="It may belong to another company. Switch company and try again." />
{:else}
  <section class="t-card hero">
    <div class="t-row between"><span class="ref">{p.ref}</span><Badge status={p.status} /></div>
    <h2 class="t-h1">{supplierName(p.supplierId)}</h2>
    {#if p.title}<p class="t-sub">{p.title}</p>{/if}
    <CompanyChip entityId={p.entityId} />
    <dl class="t-kv">
      <dt>Cases</dt><dd>{num(orderCases(p))}</dd>
      <dt>Value</dt><dd>{usdFull(orderValue(p), p.currency)}</dd>
      <dt>Required by</dt><dd>{fmtDate(p.requiredBy)}</dd>
    </dl>
    {#if p.lines.some((l) => l.exception)}
      <p class="t-hint">{p.lines.filter((l) => l.exception).length} line(s) over the plan or not in it — reasons: {p.lines.filter((l) => l.exceptionReason).map((l) => l.exceptionReason).join('; ') || 'none given'}</p>
    {/if}
    {#if canDecide}
      <div class="t-actions">
        <button class="btn btn-accent btn-lg" onclick={() => (deciding = 'approved')}>Approve & sign</button>
        <button class="btn btn-secondary btn-lg" onclick={() => (deciding = 'returned')}>Return</button>
      </div>
    {:else if p.status === 'Submitted' && !poApprovalRequired()}
      <p class="t-hint">Purchase orders don't need a director's approval in this company — the planner issues them.</p>
    {/if}
  </section>

  <h3 class="t-title">What's ordered</h3>
  <section class="t-card flush">
    <ul class="lines">{#each byProduct as [pid, qty] (pid)}{@const pr = lookup.product(pid)}<li><span><b>{pr?.brand}</b> <span class="t-meta">{pr?.pack}</span></span><b>{num(qty)}</b></li>{/each}</ul>
  </section>

  {#if p.history.length}
    <h3 class="t-title">History</h3>
    <ol class="hist">
      {#each [...p.history].reverse() as h}
        <li><strong>{h.action[0].toUpperCase() + h.action.slice(1)}</strong> · {lookup.user(h.byUserId)?.name ?? ''}<br /><span class="t-meta">{fmtDateTime(h.at)}{h.comment ? ` — ${h.comment}` : ''}</span></li>
      {/each}
    </ol>
  {/if}
  <WebButton path="/plans/{p.id}" label="Edit or submit in web app" />
{/if}

{#if deciding}
  <Sheet modal title={deciding === 'approved' ? 'Approve & sign' : deciding === 'returned' ? 'Return to planner' : 'Reject order'} onclose={() => (deciding = '')}>
    {#if deciding === 'approved'}<SignaturePad bind:value={signature} />{/if}
    <label class="field"><span>Comment {deciding === 'approved' ? '(optional)' : '(required)'}</span><textarea class="textarea" bind:value={comment} rows="3"></textarea></label>
    <div class="t-actions">
      {#if deciding !== 'approved'}<button class="btn btn-secondary btn-lg" onclick={() => (deciding = deciding === 'returned' ? 'rejected' : 'returned')}>{deciding === 'returned' ? 'Reject instead' : 'Return instead'}</button>{/if}
      <button class="btn btn-lg {deciding === 'rejected' ? 'btn-danger' : 'btn-primary'}" onclick={decide} disabled={busy}>{busy ? 'Saving…' : deciding === 'approved' ? 'Approve & issue PO' : deciding === 'returned' ? 'Return' : 'Reject'}</button>
    </div>
  </Sheet>
{/if}

<style>
  .hero { display: flex; flex-direction: column; gap: 8px; border-top: 4px solid var(--t-accent); }
  .ref { font: 700 14px var(--ff-mono); color: var(--text-muted); }
  .lines { list-style: none; margin: 0; padding: 0 16px; }
  .lines li { display: flex; justify-content: space-between; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--t-line); }
  .lines li:last-child { border-bottom: 0; }
  .hist { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
  .hist li { position: relative; }
  .hist li::before { content: ''; position: absolute; left: -21px; top: 5px; width: 12px; height: 12px; border-radius: 50%; background: var(--t-accent); }
</style>
