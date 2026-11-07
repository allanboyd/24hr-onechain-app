<script lang="ts">
  import { untrack } from 'svelte';
  // Trips tab: per trip — agreed transport, paid, balance, payment status, follow-up date and (finance roles) the landing
  // cost per case. Detail (costs, payments, approvals, landing cost) opens in the drawer. No charts: the analysis is on
  // Home · Fees & expenses.
  import * as MX from '@btw/api/metrics';
  import { Badge, fmtDate, fmtNum } from '@btw/ui';
  import { FilterBar, EmptyState, DataTable, type Column } from '../page';
  import { StatusBadge } from '../dashboard';
  import CompanyMark from '../CompanyMark.svelte';
  import { company, GROUP } from '../../lib/company.svelte';
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
  const sum2 = (get: (t: Trip) => number) => (l: Trip[]) => fmtNum(l.reduce((a, t) => a + (get(t) || 0), 0), 2);
  const columns = $derived<Column<Trip>[]>([
    ...(company.active === GROUP ? [{ key: 'company', label: 'Company', value: (t: Trip) => companyLabel(t.shipment.entityId), cell: companyCell, hideBelow: 1000 }] : []),
    { key: 'ref', label: 'Shipment', sticky: true, value: (t) => t.shipment.ref, cell: refCell },
    { key: 'truck', label: 'Truck · Provider', value: (t) => `${truckReg(t.shipment.legs[0]?.truckId)} · ${providerName(provOf(t))}`, cell: truckCell },
    { key: 'route', label: 'Route', value: (t) => routeName(t.shipment.legs[0]?.routeId), class: 'small', hideBelow: 1100 },
    { key: 'agreed', label: 'Agreed (USD)', align: 'right', sortValue: (t) => (t.agreedRecorded === false ? null : t.transport), csv: (t) => (t.agreedRecorded === false ? '' : t.transport), cell: agreedCell, total: sum2((t) => t.transport) },
    { key: 'paid', label: 'Paid', align: 'right', sortValue: (t) => t.paid, value: (t) => fmtNum(t.paid, 2), csv: (t) => t.paid, total: sum2((t) => t.paid) },
    { key: 'balance', label: 'Balance', align: 'right', sortValue: (t) => t.balance, csv: (t) => t.balance, cell: balanceCell, total: sum2((t) => t.balance) },
    { key: 'pay', label: 'Payment', value: (t) => tripStatus(t), cell: payCell },
    { key: 'due', label: 'Follow-up', sortValue: (t) => (t.balance > 0 ? followUp(t) ?? null : null), csv: (t) => { const d = t.balance > 0 ? followUp(t) : undefined; return d ? new Date(d).toISOString().slice(0, 10) : ''; }, cell: dueCell, class: 'small' },
    ...(full ? [{ key: 'perCase', label: 'Landing cost / case (USD)', align: 'right' as const, sortValue: (t: Trip) => t.perCase ?? null, value: (t: Trip) => fmtNum(t.perCase ?? 0, 2), csv: (t: Trip) => t.perCase ?? '', hideBelow: 1200 }] : []),
    { key: 'act', label: '', sortable: false, csv: false, hideable: false, cell: actCell, class: 'nowrap' },
  ]);
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

<DataTable id="trips" label="Trips" noun="trips" rows={trips ? shown : null} {columns} rowKey={(t) => t.shipment.id} onrowclick={(t) => onopen(t.shipment.id)}
  filename="trip-financials-list" empty={emptyTable} card={phoneCard} />

{#snippet emptyTable()}{@render empty(true)}{/snippet}
{#snippet companyCell(t: Trip)}<span class="cc"><CompanyMark entityId={t.shipment.entityId ?? null} size={18} />{companyLabel(t.shipment.entityId)}</span>{/snippet}
{#snippet refCell(t: Trip)}<button type="button" class="linkbtn mono nowrap" onclick={(e) => { e.stopPropagation(); onopen(t.shipment.id); }}>{t.shipment.ref}</button><div class="caption nowrap">Truck {t.shipment.truckNo} · {t.shipment.legs.length} leg{t.shipment.legs.length > 1 ? 's' : ''}</div>{/snippet}
{#snippet truckCell(t: Trip)}{truckReg(t.shipment.legs[0]?.truckId)}<div class="caption">{providerName(provOf(t))}</div>{/snippet}
{#snippet agreedCell(t: Trip)}{#if t.agreedRecorded === false}<span class="nr">not recorded</span>{:else}{fmtNum(t.transport, 2)}{/if}{/snippet}
{#snippet balanceCell(t: Trip)}<span class:accent-text={t.balance > 0}>{fmtNum(t.balance, 2)}</span>{/snippet}
{#snippet payCell(t: Trip)}{@const st = tripStatus(t)}<StatusBadge status={STATUS_TONE[st]} label={st} size={12} />{#if hasPending(t)} <Badge status="Pending approval" />{/if}{/snippet}
{#snippet dueCell(t: Trip)}{@const due = t.balance > 0 ? followUp(t) : undefined}{#if due}<span class:accent-text={due < Date.now()}>{due < Date.now() ? 'Overdue · ' : ''}{fmtDate(due)}</span>{:else}<span class="subtle">—</span>{/if}{/snippet}
{#snippet actCell(t: Trip)}{#if canPay && canPayTrip(refOfTrip(t))}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); onact('pay', t.shipment.id); }}>Pay</button>{/if}{/snippet}
{#snippet phoneCard(t: Trip)}
  {@const st = tripStatus(t)}
  <span class="row between"><strong>{truckReg(t.shipment.legs[0]?.truckId)}</strong><StatusBadge status={STATUS_TONE[st]} label={st} size={12} /></span>
  <span class="caption"><span class="mono">{t.shipment.ref}</span> · {companyLabel(t.shipment.entityId)} · {providerName(provOf(t))}</span>
  <span class="row between small"><span class:nr={t.agreedRecorded === false}>{t.agreedRecorded === false ? 'Agreed not recorded' : `Agreed USD ${fmtNum(t.transport, 2)}`}</span><span>Balance USD {fmtNum(t.balance, 2)}</span></span>
  {#if hasPending(t) || full}<span class="row between caption">{#if hasPending(t)}<span>Payment waiting for approval</span>{:else}<span></span>{/if}{#if full}<span>USD {fmtNum(t.perCase, 2)} / case</span>{/if}</span>{/if}
{/snippet}

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
  .cc { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }
  .prov { margin-top: var(--space-4); max-width: 720px; }
  .prov summary { padding: var(--space-3) var(--space-4); cursor: pointer; }
</style>
