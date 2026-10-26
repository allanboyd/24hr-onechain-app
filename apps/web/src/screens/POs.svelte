<script lang="ts">
  // docs/09 §4: the one Purchase orders area — list (search, filters, status chips), create, view, update, delete.
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import RecordFor from '../components/RecordFor.svelte';
  import { loading, lookup, plans, pos, ref, shipments, type Loading, type Plan, type PoStage, type PurchaseOrder, type Shipment, type User } from '@btw/api';
  import { Badge, fmtDate, fmtMoney, fmtNum, router } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import { untrack } from 'svelte';
  import PageTabs from '../components/PageTabs.svelte';
  import POsOverview from '../components/overview/POsOverview.svelte';
  import { currentTab, qp } from '../lib/tab';
  import { labelTone, poApprovals, revTag, STAGES, stageLabel } from '../lib/orders';
  import { seesPrices } from '@btw/api/access';
  let { user }: { params?: any; user: User } = $props();
  const money = $derived(seesPrices(user)); // loaders and receivers: no prices (docs/12 A-04)
  const tab = currentTab();
  const approvals = poApprovals();
  const canCreate = $derived(user.roles.some((r) => r === "planner" || r === "director" || r === "admin"));
  let list = $state<PurchaseOrder[] | null>(null);
  let planList = $state<Plan[]>([]);
  let loads = $state<Loading[]>([]);
  let ships = $state<Shipment[]>([]);
  async function load() { [list, planList, loads, ships] = await Promise.all([pos.list({ all: true }), plans.list(), loading.list().catch(() => []), shipments.list().catch(() => [])]); }
  const w = watch(load);
  // Directors land on what needs them when approval is on
  let stage = $state<PoStage | ''>(untrack(() => (qp('stage') as PoStage) || (approvals && user.roles.includes('director') && !user.roles.includes('planner') ? 'Awaiting approval' : '')));
  let entity = $state(qp('entity'));
  let supplier = $state(qp('supplier'));
  let q = $state(qp('q'));
  const live = $derived((list ?? []).filter((p) => p.status !== 'Deleted'));
  const count = (s: PoStage | '') => (s ? (list ?? []).filter((p) => p.stage === s).length : live.length);
  const rows = $derived((stage === 'Deleted' ? list ?? [] : live).filter((p) =>
    (!stage || p.stage === stage) && (!entity || p.entityId === entity) && (!supplier || p.supplierId === supplier) &&
    (!q || `${p.ref} ${p.baseRef ?? ''} ${p.title}`.toLowerCase().includes(q.toLowerCase()))));
  const r = ref();
  function progress(po: PurchaseOrder) {
    const ld = loads.filter((l) => l.poId === po.id), sh = ships.filter((s) => s.poId === po.id && !s.fromWarehouseId);
    return { trucks: ld.length || po.trucks || 0, loaded: ld.filter((l) => l.status === 'Loaded').length, delivered: sh.filter((s) => s.status === 'Acknowledged').length };
  }
</script>

<div class="page-head">
  <div><div class="overline crumb">Procurement</div><h1>Purchase orders</h1>
    <p class="muted small" style="max-width:70ch">A purchase order is created, updated or deleted — never drafted. {approvals ? 'A director approves each new PO before it goes to the supplier.' : 'A new PO is approved automatically.'} An update or a difference at loading saves the next revision (…-rev001); the original and every version stay viewable.</p></div>
  {#if canCreate}<RecordFor what="a purchase order"><a class="btn btn-primary" href="#/pos/new"><Plus size={16} />Create purchase order</a></RecordFor>{/if}
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<PageTabs base="/pos" current={tab} listLabel="Order list" />

{#if tab === 'overview'}
  {#if !list}<div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
  {:else}<POsOverview list={live} plans={planList} {loads} {ships} />{/if}
{:else}

<div class="tabs chips" role="tablist" aria-label="Status">
  <button role="tab" aria-selected={stage === ''} onclick={() => (stage = '')}>All <span class="caption">{count('')}</span></button>
  {#each STAGES() as s}
    <button role="tab" aria-selected={stage === s} onclick={() => (stage = s)}>{stageLabel(s)} <span class="caption">{count(s)}</span></button>
  {/each}
</div>
<div class="filters">
  <label class="field"><span>Search</span><input class="input" type="search" bind:value={q} placeholder="Reference or title" /></label>
  <label class="field"><span>Ordering company</span><select class="select" bind:value={entity}><option value="">All companies</option>{#each r.entities as e}<option value={e.id}>{e.shortName || e.code}</option>{/each}</select></label>
  <label class="field"><span>Supplier</span><select class="select" bind:value={supplier}><option value="">All suppliers</option>{#each r.suppliers as s}<option value={s.id}>{s.code} {s.city}</option>{/each}</select></label>
</div>

<div class="card flush table-wrap desktop">
  <table class="table">
    <thead><tr><th>Reference</th><th>Title</th><th>Company</th><th>Supplier</th><th class="num">Trucks</th><th class="num">Cases</th>{#if money}<th class="num">Amount</th>{/if}<th>Created</th><th>Status</th><th>Progress</th></tr></thead>
    <tbody>
      {#if !list}<tr><td colspan="10"><div class="skeleton"></div></td></tr>{/if}
      {#each rows as po (po.id)}
        {@const pr = progress(po)}
        <tr class="clickable" class:deleted={po.status === 'Deleted'} onclick={() => router.go(`/pos/${po.id}`)}>
          <td class="mono"><a href="#/pos/{po.id}">{po.baseRef ?? po.ref}</a>{#if po.revision}{' '}<Badge tone="accent">{revTag(po.revision)}</Badge>
            <div class="caption">{po.revisionKind === 'updated' ? 'updated by the office' : 'revised at loading'}</div>{/if}</td>
          <td>{po.title || '—'}{#if po.status === 'Deleted' && po.deleteReason}<div class="caption">“{po.deleteReason}”</div>{/if}</td>
          <td>{lookup.entity(po.entityId)?.code}</td>
          <td>{lookup.supplier(po.supplierId)?.code}, {lookup.supplier(po.supplierId)?.city}</td>
          <td class="num">{po.trucks ?? '—'}</td>
          <td class="num">{po.cases !== undefined ? fmtNum(po.cases) : '—'}</td>
          {#if money}<td class="num">{po.amount !== undefined ? fmtMoney(po.amount, po.currency) : '—'}</td>{/if}
          <td class="small">{fmtDate(po.date)}<div class="caption">{lookup.user(po.approvedById)?.name ?? ''}</div></td>
          <td><Badge tone={labelTone(po.stage ?? '')}>{stageLabel(po.stage)}</Badge></td>
          <td>{#if po.status === 'Issued'}<span class="small">{pr.loaded}/{pr.trucks} loaded{#if pr.delivered} · {pr.delivered} delivered{/if}</span>{/if}</td>
        </tr>
      {:else}{#if list}<tr><td colspan="10" class="empty">{stage || q || entity || supplier ? 'No purchase orders match.' : 'No purchase orders yet — create one.'}</td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<!-- Phone: stacked cards -->
<ul class="cards mobile">
  {#each rows as po (po.id)}
    <li><a class="card" href="#/pos/{po.id}">
      <div class="row between"><span class="mono">{po.baseRef ?? po.ref}{#if po.revision}{' '}<Badge tone="accent">{revTag(po.revision)}</Badge>{/if}</span><Badge tone={labelTone(po.stage ?? '')}>{stageLabel(po.stage)}</Badge></div>
      <div>{po.title || '—'} · <span class="muted">{lookup.supplier(po.supplierId)?.code} {lookup.supplier(po.supplierId)?.city}</span></div>
      <div class="row between"><span class="small">{po.trucks} trucks · {fmtNum(po.cases ?? 0)} cases</span>{#if money && po.amount !== undefined}<strong class="num">{fmtMoney(po.amount, po.currency)}</strong>{/if}</div>
    </a></li>
  {:else}{#if list}<li class="empty">No purchase orders match.</li>{/if}{/each}
</ul>

{/if}

<style>
  .chips { flex-wrap: wrap; }
  tr.deleted td { color: var(--text-muted); }
  tr.deleted .mono a { text-decoration: line-through; }
  .cards { list-style: none; margin: 0; padding: 0; display: none; flex-direction: column; gap: var(--space-3); }
  .cards a { display: flex; flex-direction: column; gap: var(--space-2); color: inherit; text-decoration: none; padding: var(--space-4); }
  @media (max-width: 700px) { .desktop { display: none; } .cards { display: flex; } }
</style>
