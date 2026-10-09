<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { amount, lookup, plans, type Plan, type User } from '@btw/api';
  import { Badge, fmtDate, fmtMoney, fmtNum, router } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import { untrack } from 'svelte';
  let { user }: { user: User } = $props();
  let list = $state<Plan[] | null>(null);
  // Directors land on what needs them; planners on everything
  let status = $state(untrack(() => (user.roles.includes('director') && !user.roles.includes('planner') ? 'Submitted' : '')));
  let entity = $state('');
  let q = $state('');
  async function load() { list = await plans.list(); }
  const w = watch(load);
  const STATUSES = ['Draft', 'Submitted', 'Returned', 'Approved', 'Rejected'];
  const count = (s: string) => (list ?? []).filter((p) => !s || p.status === s).length;
  const rows = $derived((list ?? []).filter((p) =>
    (!status || p.status === status) && (!entity || p.entityId === entity) &&
    (!q || `${p.ref} ${p.title}`.toLowerCase().includes(q.toLowerCase()))));
  const total = (p: Plan) => p.lines.reduce((a, l) => a + amount(l.qty, l.price), 0);
</script>

<div class="page-head">
  <div><div class="overline crumb">Procurement</div><h1>Plans & approvals</h1></div>
  {#if user.roles.includes('planner')}<a class="btn btn-primary" href="#/plans/new"><Plus size={16} />New plan</a>{/if}
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="tabs" role="tablist" aria-label="Plan status">
  <button role="tab" aria-selected={status === ''} onclick={() => (status = '')}>All <span class="caption">{count('')}</span></button>
  {#each STATUSES as s}
    <button role="tab" aria-selected={status === s} onclick={() => (status = s)}>{s === 'Submitted' ? 'Awaiting approval' : s} <span class="caption">{count(s)}</span></button>
  {/each}
</div>
<div class="filters">
  <label class="field"><span>Search</span><input class="input" type="search" bind:value={q} placeholder="Reference or title" /></label>
  <label class="field"><span>Ordering entity</span><select class="select" bind:value={entity}><option value="">All entities</option>{#each [['e-btw', 'BTW'], ['e-nud', 'NUD'], ['e-kivu', 'Kivu']] as [id, code]}<option value={id}>{code}</option>{/each}</select></label>
</div>

<div class="card flush table-wrap desktop">
  <table class="table">
    <thead><tr><th>Reference</th><th>Title</th><th>Entity</th><th>Supplier</th><th class="num">Trucks</th><th class="num">Cases</th><th class="num">Amount</th><th>Date</th><th>Status</th></tr></thead>
    <tbody>
      {#if !list}{#each Array(3) as _}<tr><td colspan="9"><div class="skeleton"></div></td></tr>{/each}{/if}
      {#each rows as p (p.id)}
        <tr class="clickable" onclick={() => router.go(`/plans/${p.id}`)}>
          <td class="mono"><a href="#/plans/{p.id}">{p.ref}</a></td>
          <td>{p.title || '—'}</td>
          <td>{lookup.entity(p.entityId)?.code}</td>
          <td>{lookup.supplier(p.supplierId)?.code}, {lookup.supplier(p.supplierId)?.city}</td>
          <td class="num">{new Set(p.lines.map((l) => l.truckNo)).size}</td>
          <td class="num">{fmtNum(p.lines.reduce((a, l) => a + l.qty, 0))}</td>
          <td class="num">{fmtMoney(total(p), p.currency)}</td>
          <td class="small">{fmtDate(p.date)}</td>
          <td><Badge status={p.status} />{#if p.version > 1}<span class="caption"> v{p.version}</span>{/if}</td>
        </tr>
      {:else}{#if list}<tr><td colspan="9" class="empty">No plans match these filters.{#if status || entity || q} <button class="btn btn-ghost btn-sm" onclick={() => { status = ''; entity = ''; q = ''; }}>Clear filters</button>{/if}</td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<!-- Phone: stacked cards (02-design-system §5 Tables) -->
<ul class="cards mobile">
  {#each rows as p (p.id)}
    <li><a class="card" href="#/plans/{p.id}">
      <div class="row between"><span class="mono">{p.ref}</span><Badge status={p.status} /></div>
      <div>{p.title || '—'}</div>
      <div class="row between small muted"><span>{lookup.entity(p.entityId)?.code} → {lookup.supplier(p.supplierId)?.code} {lookup.supplier(p.supplierId)?.city}</span><span>{fmtDate(p.date)}</span></div>
      <div class="row between"><span class="small">{new Set(p.lines.map((l) => l.truckNo)).size} trucks · {fmtNum(p.lines.reduce((a, l) => a + l.qty, 0))} cases</span><strong class="num">{fmtMoney(total(p), p.currency)}</strong></div>
    </a></li>
  {:else}{#if list}<li class="empty">No plans match these filters.</li>{/if}{/each}
</ul>

<style>
  .cards { list-style: none; margin: 0; padding: 0; display: none; flex-direction: column; gap: var(--space-3); }
  .cards a { display: flex; flex-direction: column; gap: var(--space-2); color: inherit; text-decoration: none; padding: var(--space-4); }
  @media (max-width: 700px) { .desktop { display: none; } .cards { display: flex; } }
</style>
