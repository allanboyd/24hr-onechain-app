<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { analytics, lookup, plans, shipments, type User } from '@btw/api';
  import { Badge, fmtCompact, fmtMoney, fmtNum, fmtDateTime, hoursLabel } from '@btw/ui';
  import Sparkline from '../components/Sparkline.svelte';
  let { user }: { user: User } = $props();

  let s = $state<Awaited<ReturnType<typeof analytics.summary>>>();
  let flags = $state<Awaited<ReturnType<typeof analytics.flags>>>([]);
  let active = $state<Awaited<ReturnType<typeof shipments.list>>>([]);
  let pending = $state<Awaited<ReturnType<typeof plans.list>>>([]);
  async function load() {
    [s, flags, active, pending] = await Promise.all([analytics.summary(), analytics.flags(), shipments.list(), plans.list()]);
    active = active.filter((x) => x.status !== 'Acknowledged');
    pending = pending.filter((p) => p.status === 'Submitted');
  }
  const w = watch(load);
  const flagTone = (k: string) => (k === 'stock-out-risk' || k === 'dead-stock' ? 'danger' : k === 'cross-compare' ? 'info' : 'warning');
</script>

<div class="page-head">
  <div><div class="overline crumb">Executive summary</div><h1>Good day, {user.name.split(' ')[0]}</h1></div>
  <div class="row"><a class="btn btn-secondary" href="#/tracking">Open tracking map</a>{#if user.roles.includes('planner')}<a class="btn btn-primary" href="#/plans/new">New plan</a>{/if}</div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if !s}
  <div class="grid grid-kpi">{#each Array(4) as _}<div class="card"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="height:32px;margin-top:12px"></div></div>{/each}</div>
{:else}
  <div class="grid grid-kpi">
    <a class="card kpi" href="#/tracking"><div class="overline">Trucks on the road</div><div class="value">{s.trucksActive}</div><div class="delta"><span class="accent-text">{s.trucksDelayed} delayed</span> · {s.trucksAtBorder} at border</div></a>
    <a class="card kpi" href="#/plans"><div class="overline">Awaiting approval</div><div class="value">{s.plansPending + s.paymentsPending}</div><div class="delta">{s.plansPending} plan{s.plansPending === 1 ? '' : 's'} · {s.paymentsPending} payment{s.paymentsPending === 1 ? '' : 's'}</div></a>
    <a class="card kpi" href="#/inventory"><div class="overline">Stock on hand</div><div class="value">{fmtCompact(s.stockCases)}</div><div class="delta">cases · {fmtNum(s.inTransitCases)} in transit · ≈ USD {fmtCompact(s.stockValue)}</div></a>
    <a class="card kpi" href="#/sales"><div class="overline">Sales · 30 days</div><div class="value">USD {fmtCompact(s.sales30)}</div><div class="delta">Unpaid balances USD {fmtCompact(s.unpaidBalance)}</div></a>
  </div>

  <div class="grid dash" style="margin-top:var(--space-4)">
    <section class="card flush">
      <header><h3>Trucks in transit</h3><a href="#/shipments" class="small">All shipments</a></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Truck</th><th class="hide-sm">Route</th><th>Status</th><th>ETA</th></tr></thead>
        <tbody>
          {#each active as sh}
            {@const leg = sh.legs.find((l) => l.status !== 'Acknowledged') ?? sh.legs.at(-1)!}
            {@const eta = shipments.eta(leg)}
            <tr class="clickable" onclick={() => (location.hash = `/shipments/${sh.id}`)}>
              <td><strong>{lookup.truck(leg.truckId)?.reg}</strong><div class="caption">{sh.ref} · leg {leg.seq}/{sh.legs.length}</div></td>
              <td class="small hide-sm">{lookup.route(leg.routeId)?.name}</td>
              <td><Badge status={sh.status} /></td>
              <td><Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge><div class="caption">{fmtDateTime(eta.eta)}</div></td>
            </tr>
          {:else}<tr><td colspan="4" class="empty">No trucks on the road</td></tr>{/each}
        </tbody>
      </table></div>
    </section>

    <section class="card flush">
      <header><h3>Flags <span class="caption">{flags.length} open</span></h3><a href="#/analytics" class="small">Velocity analysis</a></header>
      <ul class="flags">
        {#each flags.slice(0, 6) as f}
          <li class="flag"><Badge tone={flagTone(f.kind)}>{f.text}</Badge><span class="what small"><strong>{lookup.product(f.productId)?.brand}</strong> {lookup.product(f.productId)?.pack}</span><span class="caption where">{lookup.warehouse(f.warehouseId)?.name}</span></li>
        {:else}<li class="empty">No flags</li>{/each}
      </ul>
    </section>

    <section class="card">
      <header><h3>Cases sold per day</h3><span class="caption">last 30 days, all warehouses</span></header>
      <Sparkline values={s.daily.map((d) => d.cases)} labels={s.daily.map((d) => d.day)} />
    </section>

    <section class="card flush">
      <header><h3>Plans awaiting approval</h3><a href="#/plans" class="small">All plans</a></header>
      <ul class="flags">
        {#each pending as p}
          {@const total = p.lines.reduce((a, l) => a + l.qty * l.price, 0)}
          <li><a class="grow" href="#/plans/{p.id}"><strong class="mono">{p.ref}</strong> · {p.title}</a><span class="small">{lookup.entity(p.entityId)?.code} → {lookup.supplier(p.supplierId)?.code}</span><span class="num small">{fmtMoney(total, p.currency)}</span></li>
        {:else}<li class="empty small">Nothing waiting</li>{/each}
      </ul>
    </section>
  </div>
{/if}

<style>
  .dash { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 1000px) { .dash { grid-template-columns: minmax(0, 1fr); } }
  a.card { color: inherit; text-decoration: none; display: block; }
  a.card:hover { border-color: var(--border-strong); }
  .flags { list-style: none; margin: 0; padding: 0; }
  .flags li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border); }
  .flags li:last-child { border-bottom: 0; }
  .flag { display: grid !important; grid-template-columns: auto 1fr auto; }
  .flag .where { text-align: right; }
  .flag > :global(.badge) { justify-self: start; }
  @media (max-width: 600px) {
    .flag { grid-template-columns: 1fr; gap: var(--space-1) !important; }
    .flag .where { text-align: left; }
    .hide-sm { display: none; }
  }
</style>
