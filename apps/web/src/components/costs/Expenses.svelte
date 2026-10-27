<script lang="ts">
  import { untrack } from 'svelte';
  // Expenses tab: every cost line of every trip (transport, loading / offloading, storage, duties, clearing, other) as one
  // filterable list — by kind, provider, route and month of loading. Data: the trips (finance.trips), no extra call.
  import type { CostKind } from '@btw/api';
  import { fmtDate, fmtNum } from '@btw/ui';
  import { FilterBar, ChipGroup, EmptyState } from '../page';
  import { companyLabel } from '../../lib/companies';
  import SearchX from '@lucide/svelte/icons/search-x';
  import { COST_KINDS, providerName, providerOfTruck, routeName, tripLoadedAt, truckReg, type CostFilters, type Trip } from './costs';

  let { trips, f, onopen }: { trips: Trip[] | null; f: CostFilters; onopen: (shipmentId: string) => void } = $props();

  let search = $state(untrack(() => f.values.q));
  $effect(() => { if (search !== f.values.q) f.set('q', search); });
  type Line = { id: string; trip: Trip; kind: CostKind; amount: number; currency: string; usd: number; docRef: string; leg: number; routeId: string; providerId: string | null; at: string | null; month: string };
  const lines = $derived.by<Line[]>(() => (trips ?? []).flatMap((t) => {
    const at = tripLoadedAt(t);
    return t.costs.map((c) => {
      const leg = (c.legId && t.shipment.legs.find((l) => l.id === c.legId)) || t.shipment.legs[0];
      return { id: c.id, trip: t, kind: c.kind, amount: c.amount, currency: c.currency, usd: c.amountUsd ?? c.amount, docRef: c.docRef ?? '', leg: c.legId ? leg?.seq ?? 1 : 0,
        routeId: leg?.routeId ?? '', providerId: providerOfTruck(leg?.truckId), at, month: at ? at.slice(0, 7) : '' };
    });
  }));
  const providers = $derived([...new Set(lines.map((l) => l.providerId).filter((x): x is string => !!x))].sort((a, b) => providerName(a).localeCompare(providerName(b))));
  const routes = $derived([...new Set(lines.map((l) => l.routeId).filter(Boolean))].sort((a, b) => routeName(a).localeCompare(routeName(b))));
  const months = $derived([...new Set(lines.map((l) => l.month).filter(Boolean))].sort().reverse());
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  // every filter except kind (the chips show how many lines each kind has under the other filters)
  const base = $derived.by(() => {
    const v = f.values; const q = (v.q ?? '').toLowerCase();
    return lines.filter((l) => (!v.provider || l.providerId === v.provider) && (!v.route || l.routeId === v.route) && (!v.period || l.month === v.period)
      && (!q || [l.trip.shipment.ref, truckReg(l.trip.shipment.legs[0]?.truckId), providerName(l.providerId), l.docRef, l.kind].join(' ').toLowerCase().includes(q)));
  });
  const shown = $derived(f.values.kind ? base.filter((l) => l.kind === f.values.kind) : base);
  const total = $derived(Math.round(shown.reduce((a, l) => a + l.usd, 0) * 100) / 100);
  const kindOpts = $derived(COST_KINDS.map((k) => ({ value: k, label: k, n: base.filter((l) => l.kind === k).length })));
  let kind = $state(untrack(() => f.values.kind));
  $effect(() => { if (kind !== f.values.kind) f.set('kind', kind); });
  const active = $derived((f.values.kind ? 1 : 0) + (f.values.provider ? 1 : 0) + (f.values.route ? 1 : 0) + (f.values.period ? 1 : 0));
  function clearAll() { f.clear(['q', 'kind', 'provider', 'route', 'period']); search = ''; kind = ''; }
</script>

<FilterBar bind:search placeholder="Shipment, truck, provider or document" {active} onclear={clearAll}>
  <ChipGroup label="Expense" options={kindOpts} bind:value={kind} />
  <label class="field"><span>Provider</span><select class="select" value={f.values.provider} onchange={(e) => f.set('provider', e.currentTarget.value)}>
    <option value="">All providers</option>{#each providers as p}<option value={p}>{providerName(p)}</option>{/each}</select></label>
  <label class="field"><span>Route</span><select class="select" value={f.values.route} onchange={(e) => f.set('route', e.currentTarget.value)}>
    <option value="">All routes</option>{#each routes as r}<option value={r}>{routeName(r)}</option>{/each}</select></label>
  <label class="field"><span>Loaded in</span><select class="select" value={f.values.period} onchange={(e) => f.set('period', e.currentTarget.value)}>
    <option value="">Any month</option>{#each months as m}<option value={m}>{monthLabel(m)}</option>{/each}</select></label>
  {#snippet end()}{#if trips}<span class="caption">{shown.length} lines · USD {fmtNum(total, 2)}</span>{/if}{/snippet}
</FilterBar>

{#snippet empty(compact: boolean)}
  {#if active || f.values.q}<EmptyState title="No expenses match these filters" icon={SearchX} {compact}><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>
  {:else}<EmptyState title="No trip expenses yet" hint="Record one with Trip expense above." {compact} />{/if}
{/snippet}

<div class="card flush table-wrap wide" style="max-height:70vh">
  <table class="table" aria-label="Trip expenses">
    <thead><tr><th>Loaded</th><th>Shipment</th><th>Truck · provider</th><th>Route</th><th>Expense</th><th>Document</th><th class="num">Amount</th><th class="num">USD</th></tr></thead>
    <tbody>
      {#if !trips}<tr><td colspan="8"><div class="skeleton"></div></td></tr>{/if}
      {#each shown.slice(0, 500) as l (l.id)}
        <tr class="clickable" onclick={() => onopen(l.trip.shipment.id)}>
          <td class="small nowrap">{l.at ? fmtDate(l.at) : '—'}</td>
          <td><button type="button" class="linkbtn mono nowrap" onclick={(e) => { e.stopPropagation(); onopen(l.trip.shipment.id); }}>{l.trip.shipment.ref}</button><div class="caption">{companyLabel(l.trip.shipment.entityId)}</div></td>
          <td class="small">{truckReg(l.trip.shipment.legs[0]?.truckId)}<div class="caption">{providerName(l.providerId)}</div></td>
          <td class="small">{routeName(l.routeId)}{#if l.leg}<div class="caption">leg {l.leg}</div>{/if}</td>
          <td>{l.kind}</td>
          <td class="small">{l.docRef || '—'}</td>
          <td class="num nowrap">{l.currency} {fmtNum(l.amount, 2)}</td>
          <td class="num">{fmtNum(l.usd, 2)}</td>
        </tr>
      {:else}{#if trips}<tr><td colspan="8">{@render empty(true)}</td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<ul class="cards narrow" aria-label="Trip expenses">
  {#each shown.slice(0, 500) as l (l.id)}
    <li><button type="button" class="card rowcard" onclick={() => onopen(l.trip.shipment.id)}>
      <span class="row between"><strong>{l.kind}</strong><strong class="num">{l.currency} {fmtNum(l.amount, 2)}</strong></span>
      <span class="caption"><span class="mono">{l.trip.shipment.ref}</span> · {truckReg(l.trip.shipment.legs[0]?.truckId)} · {providerName(l.providerId)}</span>
      <span class="caption">{routeName(l.routeId)}{l.leg ? ` · leg ${l.leg}` : ''} · {l.at ? fmtDate(l.at) : '—'}{l.docRef ? ` · ${l.docRef}` : ''}</span>
    </button></li>
  {:else}{#if trips}<li>{@render empty(false)}</li>{/if}{/each}
</ul>

<style>
  .nowrap { white-space: nowrap; }
  .linkbtn { border: 0; background: none; padding: 0; color: var(--link); font: inherit; cursor: pointer; }
  .linkbtn:hover { text-decoration: underline; }
  .cards { list-style: none; margin: 0; padding: 0; display: none; flex-direction: column; gap: var(--space-2); }
  .rowcard { display: flex; flex-direction: column; gap: var(--space-1); width: 100%; padding: var(--space-3) var(--space-4); text-align: left; font: inherit; color: inherit; cursor: pointer; }
  @media (max-width: 760px) { .wide { display: none; } .cards { display: flex; } }
</style>
