<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { amount, loading, lookup, plans, pos, shipments, type Loading, type Plan, type PurchaseOrder, type Shipment, type User } from '@btw/api';
  import { Badge, fmtDate, fmtDateTime, fmtMoney, fmtNum, router } from '@btw/ui';
  import PageTabs from '../components/PageTabs.svelte';
  import POsOverview from '../components/overview/POsOverview.svelte';
  import { currentTab } from '../lib/tab';
  import { groupRevisions, poApprovals, revTag } from '../lib/orders';
  let { user }: { params?: any; user: User } = $props();
  const tab = currentTab();
  let list = $state<PurchaseOrder[] | null>(null);
  let planList = $state<Plan[]>([]);
  let loads = $state<Loading[]>([]);
  let ships = $state<Shipment[]>([]);
  async function load() { [list, planList, loads, ships] = await Promise.all([pos.list(), plans.list(), loading.list(), shipments.list()]); }
  const w = watch(load);
  // One row per order: a PO revised at loading shows its latest revision (badge "rev001"); the original stays reachable.
  const rows = $derived(groupRevisions(list ?? []));
  const current = $derived(rows.map((r) => r.latest));
  let revPlans = $state<Record<string, Plan>>({});
  // revision copies are not in plans.list(): fetch their lines through the PO
  $effect(() => { for (const r of rows) if (r.latest.revisionOf && !revPlans[r.latest.id] && !planList.some((p) => p.id === r.latest.planId)) { const id = r.latest.id; pos.get(id).then((d) => { if (d) revPlans = { ...revPlans, [id]: d.plan }; }); } });
  const planOf = (po: PurchaseOrder) => planList.find((p) => p.id === po.planId) ?? revPlans[po.id];
  const approvals = poApprovals();
  function progress(po: PurchaseOrder) {
    const ld = loads.filter((l) => l.poId === po.id);
    const sh = ships.filter((s) => s.poId === po.id);
    return {
      trucks: ld.length,
      loaded: ld.filter((l) => l.status === 'Loaded').length,
      transit: sh.filter((s) => s.status !== 'Acknowledged').length,
      delivered: sh.filter((s) => s.status === 'Acknowledged').length,
    };
  }
</script>

<div class="page-head">
  <div><div class="overline crumb">Procurement</div><h1>Purchase orders</h1></div>
  <p class="muted small" style="max-width:420px">{approvals ? 'POs are generated automatically when a director approves a plan (PO-01).' : 'POs are generated when the planner issues the order (PO-01).'} Nothing is retyped. A PO changed at loading becomes a revision (…-rev001).</p>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<PageTabs base="/pos" current={tab} listLabel="Order list" />

{#if tab === 'overview'}
  {#if !list}<div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
  {:else}<POsOverview list={current} plans={[...planList, ...Object.values(revPlans)]} {loads} {ships} />{/if}
{:else}

<div class="card flush table-wrap desktop">
  <table class="table">
    <thead><tr><th>Reference</th><th>Title</th><th>Entity</th><th>Supplier</th><th class="num">Trucks</th><th class="num">Cases</th><th class="num">Amount</th><th>{approvals ? 'Approved' : 'Issued'}</th><th>Sent</th><th>Progress</th></tr></thead>
    <tbody>
      {#if !list}<tr><td colspan="10"><div class="skeleton"></div></td></tr>{/if}
      {#each rows as g (g.base.id)}
        {@const po = g.latest}
        {@const p = planOf(po)}
        {@const pr = progress(po)}
        <tr class="clickable" onclick={() => router.go(`/pos/${po.id}`)}>
          <td class="mono"><a href="#/pos/{po.id}">{po.ref}</a>{#if po.revision}{' '}<Badge tone="accent">{revTag(po.revision)}</Badge>
            <div class="caption">revised at loading from <a href="#/pos/{g.base.id}" onclick={(e) => e.stopPropagation()}>{g.base.ref}</a>{#if g.chain.length > 2} · {g.chain.length - 1} revisions{/if}</div>{/if}</td>
          <td>{po.title || '—'}</td>
          <td>{lookup.entity(po.entityId)?.code}</td>
          <td>{lookup.supplier(po.supplierId)?.code}, {lookup.supplier(po.supplierId)?.city}</td>
          <td class="num">{p ? new Set(p.lines.map((l) => l.truckNo)).size : '—'}</td>
          <td class="num">{p ? fmtNum(p.lines.reduce((a, l) => a + l.qty, 0)) : '—'}</td>
          <td class="num">{p ? fmtMoney(p.lines.reduce((a, l) => a + amount(l.qty, l.price), 0), po.currency) : '—'}</td>
          <td class="small">{fmtDate(po.approvedAt)}<div class="caption">{lookup.user(po.approvedById)?.name}</div></td>
          <td class="small">{#if po.sentAt}{fmtDateTime(po.sentAt)}{:else}<Badge tone="warning">Not sent</Badge>{/if}</td>
          <td><div class="row" style="gap:4px">
            <Badge tone="info">{pr.loaded}/{pr.trucks} loaded</Badge>
            {#if pr.transit}<Badge tone="accent">{pr.transit} on road</Badge>{/if}
            {#if pr.delivered}<Badge tone="success">{pr.delivered} delivered</Badge>{/if}
          </div></td>
        </tr>
      {:else}{#if list}<tr><td colspan="10" class="empty">No purchase orders yet — issue an order to generate one.</td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<!-- Phone: stacked cards -->
<ul class="cards mobile">
  {#each rows as g (g.base.id)}
    {@const po = g.latest}
    {@const p = planOf(po)}
    {@const pr = progress(po)}
    <li><a class="card" href="#/pos/{po.id}">
      <div class="row between"><span class="mono">{po.ref}{#if po.revision}{' '}<Badge tone="accent">{revTag(po.revision)}</Badge>{/if}</span>{#if po.sentAt}<Badge tone="success">Sent</Badge>{:else}<Badge tone="warning">Not sent</Badge>{/if}</div>
      <div>{po.title || '—'} · <span class="muted">{lookup.supplier(po.supplierId)?.code} {lookup.supplier(po.supplierId)?.city}</span></div>
      <div class="row between"><span class="small">{pr.loaded}/{pr.trucks} loaded · {pr.delivered} delivered</span>{#if p}<strong class="num">{fmtMoney(p.lines.reduce((a, l) => a + amount(l.qty, l.price), 0), po.currency)}</strong>{/if}</div>
    </a></li>
  {:else}{#if list}<li class="empty">No purchase orders yet — issue an order to generate one.</li>{/if}{/each}
</ul>

{/if}

<style>
  .cards { list-style: none; margin: 0; padding: 0; display: none; flex-direction: column; gap: var(--space-3); }
  .cards a { display: flex; flex-direction: column; gap: var(--space-2); color: inherit; text-decoration: none; padding: var(--space-4); }
  @media (max-width: 700px) { .desktop { display: none; } .cards { display: flex; } }
</style>
