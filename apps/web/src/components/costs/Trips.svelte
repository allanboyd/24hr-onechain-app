<script lang="ts">
  import { untrack } from 'svelte';
  // Trips tab: per trip — agreed transport, paid, balance, payment status, follow-up date and (finance roles) the landing
  // cost per case. Detail (costs, payments, approvals, landing cost) opens in the drawer. No charts: the analysis is on
  // Home · Fees & expenses.
  import * as MX from '@btw/api/metrics';
  import { Badge, fmtDate, fmtNum } from '@btw/ui';
  import { FilterBar, EmptyState } from '../page';
  import { StatusBadge } from '../dashboard';
  import CompanyCell from '../CompanyCell.svelte';
  import { companyLabel } from '../../lib/companies';
  import SearchX from '@lucide/svelte/icons/search-x';
  import { FOLLOW_UP_DAYS, STATUS_TONE, canPayTrip, hasPending, providerName, providerOfTruck, refOfTrip, routeName, tripFee, tripLoadedAt, tripStatus, truckReg, type CostAct, type CostFilters, type Trip } from './costs';

  let { trips, f, stripFilters = false, amberDays, redDays, canPay = false, onopen, onact }: {
    trips: Trip[] | null;
    f: CostFilters;
    /** the summary strip filters this list (people who don't see the Fees tab) */ stripFilters?: boolean;
    amberDays: number; redDays: number;
    canPay?: boolean;
    onopen: (shipmentId: string) => void;
    onact: (kind: CostAct, shipmentId: string) => void;
  } = $props();

  let search = $state(untrack(() => f.values.q));
  $effect(() => { if (search !== f.values.q) f.set('q', search); });
  const all = $derived(trips ?? []);
  const full = $derived(all.some((t) => t.perCase !== undefined && t.perCase !== null));
  const provOf = (t: Trip) => providerOfTruck(t.shipment.legs[0]?.truckId);
  const providers = $derived([...new Set(all.map(provOf).filter((x): x is string => !!x))].sort((a, b) => providerName(a).localeCompare(providerName(b))));
  // strip filters (same registry rules as the tiles), used only when the strip filters this tab
  const SHOW: Record<string, (t: Trip) => boolean> = {
    open: (t) => MX.openFees([tripFee(t)]).length > 0, amber: (t) => MX.feesOlderThan([tripFee(t)], amberDays).length > 0,
    red: (t) => MX.feesOlderThan([tripFee(t)], redDays).length > 0, missing: (t) => t.agreedRecorded === false,
    awaiting: (t) => MX.awaitingApproval([tripFee(t)]).length > 0,
  };
  const shown = $derived.by(() => {
    const v = f.values; const q = (v.q ?? '').toLowerCase();
    return all.filter((t) => (!stripFilters || !SHOW[v.show] || SHOW[v.show](t)) && (!v.provider || provOf(t) === v.provider)
      && (!v.pay || (v.pay === 'pending' ? hasPending(t) : tripStatus(t) === v.pay))
      && (!q || [t.shipment.ref, truckReg(t.shipment.legs[0]?.truckId), providerName(provOf(t)), ...t.payments.map((p) => p.reference), ...t.costs.map((c) => c.docRef ?? '')].join(' ').toLowerCase().includes(q)));
  });
  const active = $derived((f.values.provider ? 1 : 0) + (f.values.pay ? 1 : 0) + (stripFilters && f.values.show && f.values.show !== 'all' ? 1 : 0));
  function clearAll() { f.clear(stripFilters ? ['show', 'q', 'provider', 'pay'] : ['q', 'provider', 'pay']); search = ''; }
  const followUp = (t: Trip) => { const a = tripLoadedAt(t); return a ? Date.parse(a) + FOLLOW_UP_DAYS * 864e5 : undefined; };
  const byProvider = $derived.by(() => {
    const m = new Map<string, { agreed: number; paid: number; trips: number }>();
    for (const t of shown) { const pid = provOf(t) ?? ''; const cur = m.get(pid) ?? { agreed: 0, paid: 0, trips: 0 }; cur.agreed += t.transport; cur.paid += t.paid; cur.trips++; m.set(pid, cur); }
    return [...m.entries()].sort((a, b) => (b[1].agreed - b[1].paid) - (a[1].agreed - a[1].paid));
  });
</script>

<FilterBar bind:search placeholder="Shipment, truck, provider or reference" {active} onclear={clearAll}>
  <label class="field"><span>Payment</span><select class="select" value={f.values.pay} onchange={(e) => f.set('pay', e.currentTarget.value)}>
    <option value="">All</option>{#each Object.keys(STATUS_TONE) as s}<option value={s}>{s}</option>{/each}<option value="pending">Waiting for approval</option></select></label>
  <label class="field"><span>Provider</span><select class="select" value={f.values.provider} onchange={(e) => f.set('provider', e.currentTarget.value)}>
    <option value="">All providers</option>{#each providers as p}<option value={p}>{providerName(p)}</option>{/each}</select></label>
  {#snippet end()}{#if trips}<span class="caption">{shown.length} of {all.length} trips</span>{/if}{/snippet}
</FilterBar>

{#snippet empty(compact: boolean)}
  {#if active || f.values.q}<EmptyState title="No trips match these filters" icon={SearchX} {compact}><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>
  {:else}<EmptyState title="No trips yet" {compact} />{/if}
{/snippet}

<div class="card flush table-wrap wide">
  <table class="table" aria-label="Trips">
    <thead><tr><CompanyCell head /><th>Shipment</th><th>Truck · Provider</th><th>Route</th><th class="num">Agreed (USD)</th><th class="num">Paid</th><th class="num">Balance</th><th>Payment</th><th>Follow-up</th>{#if full}<th class="num">Landing cost / case (USD)</th>{/if}<th></th></tr></thead>
    <tbody>
      {#if !trips}<tr><td colspan="11"><div class="skeleton"></div></td></tr>{/if}
      {#each shown as t (t.shipment.id)}
        {@const leg = t.shipment.legs[0]}
        {@const st = tripStatus(t)}
        {@const due = t.balance > 0 ? followUp(t) : undefined}
        <tr class="clickable" onclick={() => onopen(t.shipment.id)}>
          <CompanyCell entityId={t.shipment.entityId} />
          <td><button type="button" class="linkbtn mono nowrap" onclick={(e) => { e.stopPropagation(); onopen(t.shipment.id); }}>{t.shipment.ref}</button><div class="caption nowrap">Truck {t.shipment.truckNo} · {t.shipment.legs.length} leg{t.shipment.legs.length > 1 ? 's' : ''}</div></td>
          <td>{truckReg(leg?.truckId)}<div class="caption">{providerName(provOf(t))}</div></td>
          <td class="small">{routeName(leg?.routeId)}</td>
          <td class="num">{#if t.agreedRecorded === false}<span class="nr">not recorded</span>{:else}{fmtNum(t.transport, 2)}{/if}</td>
          <td class="num">{fmtNum(t.paid, 2)}</td>
          <td class="num" class:accent-text={t.balance > 0}>{fmtNum(t.balance, 2)}</td>
          <td><StatusBadge status={STATUS_TONE[st]} label={st} size={12} />{#if hasPending(t)} <Badge status="Pending approval" />{/if}</td>
          <td class="small">{#if due}<span class:accent-text={due < Date.now()}>{due < Date.now() ? 'Overdue · ' : ''}{fmtDate(due)}</span>{:else}<span class="subtle">—</span>{/if}</td>
          {#if full}<td class="num">{fmtNum(t.perCase, 2)}</td>{/if}
          <td class="nowrap">{#if canPay && canPayTrip(refOfTrip(t))}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); onact('pay', t.shipment.id); }}>Pay</button>{/if}</td>
        </tr>
      {:else}{#if trips}<tr><td colspan="11">{@render empty(true)}</td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<ul class="cards narrow" aria-label="Trips">
  {#each shown as t (t.shipment.id)}
    {@const st = tripStatus(t)}
    <li><button type="button" class="card rowcard" onclick={() => onopen(t.shipment.id)}>
      <span class="row between"><strong>{truckReg(t.shipment.legs[0]?.truckId)}</strong><StatusBadge status={STATUS_TONE[st]} label={st} size={12} /></span>
      <span class="caption"><span class="mono">{t.shipment.ref}</span> · {companyLabel(t.shipment.entityId)} · {providerName(provOf(t))}</span>
      <span class="row between small"><span class:nr={t.agreedRecorded === false}>{t.agreedRecorded === false ? 'Agreed not recorded' : `Agreed USD ${fmtNum(t.transport, 2)}`}</span><span>Balance USD {fmtNum(t.balance, 2)}</span></span>
      {#if hasPending(t) || full}<span class="row between caption">{#if hasPending(t)}<span>Payment waiting for approval</span>{:else}<span></span>{/if}{#if full}<span>USD {fmtNum(t.perCase, 2)} / case</span>{/if}</span>{/if}
    </button></li>
  {:else}{#if trips}<li>{@render empty(false)}</li>{/if}{/each}
</ul>

{#if byProvider.length}
  <details class="card flush prov">
    <summary><strong>Balances by transport provider</strong> <span class="caption">follow up {FOLLOW_UP_DAYS} days after loading</span></summary>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Provider</th><th class="num">Trips</th><th class="num">Agreed (USD)</th><th class="num">Paid (USD)</th><th class="num">Balance (USD)</th></tr></thead>
      <tbody>{#each byProvider as [pid, v] (pid)}<tr><td>{providerName(pid || null)}</td><td class="num">{v.trips}</td><td class="num">{fmtNum(v.agreed, 2)}</td><td class="num">{fmtNum(v.paid, 2)}</td><td class="num" class:accent-text={v.agreed - v.paid > 0}>{fmtNum(v.agreed - v.paid, 2)}</td></tr>{/each}</tbody>
    </table></div>
  </details>
{/if}

<style>
  .nowrap { white-space: nowrap; }
  .nr { color: var(--warning); font-weight: 600; }
  .linkbtn { border: 0; background: none; padding: 0; color: var(--link); font: inherit; cursor: pointer; }
  .linkbtn:hover { text-decoration: underline; }
  .cards { list-style: none; margin: 0; padding: 0; display: none; flex-direction: column; gap: var(--space-2); }
  .rowcard { display: flex; flex-direction: column; gap: var(--space-1); width: 100%; padding: var(--space-3) var(--space-4); text-align: left; font: inherit; color: inherit; cursor: pointer; }
  .prov { margin-top: var(--space-4); max-width: 720px; }
  .prov summary { padding: var(--space-3) var(--space-4); cursor: pointer; }
  @media (max-width: 760px) { .wide { display: none; } .cards { display: flex; } }
</style>
