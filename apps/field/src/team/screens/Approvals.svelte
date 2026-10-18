<script lang="ts">
  // Approvals: transport payments over the limit (directors) and — only when config.approvals.purchaseOrders is on —
  // submitted purchase orders. Period plans are suggestions and never wait for approval.
  import { finance, plans, type Plan, type User } from '@btw/api';
  import { Badge, fmtDateTime, say } from '@btw/ui';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FileText from '@lucide/svelte/icons/file-text';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { mayApprovePOs, mayApprovePayments } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh, settle } from '../load.svelte';
  import { costLabel, pendingOf, transporter } from '../money';
  import { orderCases, orderValue, supplierName } from '../plan';
  import { truckReg } from '../shipment';
  import { num, usd, usdFull } from '../fmt';
  import { haptic } from '../../native';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { user }: { user: User; view: View; query: URLSearchParams } = $props();
  const r = new Res(async () => {
    const [trips, orders] = await Promise.all([mayApprovePayments(user) ? finance.trips() : Promise.resolve([]), mayApprovePOs(user) ? settle(plans.list(), [] as Plan[]) : ([] as Plan[])]);
    return { pays: trips.flatMap((t) => pendingOf(t).map((p) => ({ p, t }))), orders: orders.filter((o) => o.status === 'Submitted') };
  });
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const readOnly = $derived(co.active === null);
  let busy = $state('');
  async function approve(id: string) {
    busy = id;
    try { await finance.approve(id); haptic('success'); say('Payment approved'); await r.reload(); } catch (e) { say((e as Error).message); } finally { busy = ''; }
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
        <a class="t-item" href="#/orders/draft/{o.id}">
          <span class="t-icon"><FileText size={22} /></span>
          <span class="t-main"><span class="t-line1">{#if co.active === null}<CompanyDot entityId={o.entityId} />{/if}<span class="t-ellipsis">{o.ref}</span></span><span class="t-meta t-ellipsis">{supplierName(o.supplierId)} · {num(orderCases(o))} cases</span></span>
          <span class="t-amount">{usd(orderValue(o))}</span><ChevronRight class="t-chev" size={20} />
        </a>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .pay { display: flex; flex-direction: column; gap: 4px; }
  .pay strong { font: 800 20px var(--ff-display); }
  .pay .t-actions { margin-top: 8px; }
  .pay .btn { text-decoration: none; }
</style>
