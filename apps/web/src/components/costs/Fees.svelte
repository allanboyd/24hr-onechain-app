<script lang="ts">
  import { untrack } from 'svelte';
  // Fees tab: each trip's agreed transport price against the payments made under document references — Paid / Part paid /
  // Unpaid / not recorded, with the age since loading (amber after config [fees] amber_days, red after red_days). Testfie
  // records the agreed price and the truck expenses; the directors record (and approve) payments. No goods value here.
  import * as MX from '@btw/api/metrics';
  import type { TransportFeeRow } from '@btw/api';
  import { fmtDate, fmtNum } from '@btw/ui';
  import { FilterBar, EmptyState } from '../page';
  import { StatusBadge } from '../dashboard';
  import { companyLabel } from '../../lib/companies';
  import SearchX from '@lucide/svelte/icons/search-x';
  import { STATUS_TONE, canPayTrip, canSetPrice, providerName, refOfFee, truckReg, type CostAct, type CostFilters } from './costs';

  let { rows, f, amberDays, redDays, flagLabel, canExpense = false, canPay = false, onopen, onact }: {
    rows: TransportFeeRow[] | null;
    f: CostFilters;
    amberDays: number; redDays: number;
    flagLabel: (fl: TransportFeeRow['flag']) => { s: string; l: string };
    canExpense?: boolean; canPay?: boolean;
    onopen: (shipmentId: string) => void;
    onact: (kind: CostAct, shipmentId: string) => void;
  } = $props();

  let search = $state(untrack(() => f.values.q));
  $effect(() => { if (search !== f.values.q) f.set('q', search); });
  const all = $derived(rows ?? []);
  // the strip's filters: the same registry rules as the counts on the tiles
  const SHOW: Record<string, (list: TransportFeeRow[]) => TransportFeeRow[]> = {
    open: (l) => MX.openFees(l), amber: (l) => MX.feesOlderThan(l, amberDays), red: (l) => MX.feesOlderThan(l, redDays), missing: (l) => l.filter((r) => r.agreedUsd === null), awaiting: (l) => MX.awaitingApproval(l),
  };
  const providers = $derived([...new Set(all.map((r) => r.providerId).filter((x): x is string => !!x))].sort((a, b) => providerName(a).localeCompare(providerName(b))));
  const shown = $derived.by(() => {
    const v = f.values; const q = (v.q ?? '').toLowerCase();
    const base = SHOW[v.show] ? SHOW[v.show](all) : all;
    return base.filter((r) => (!v.status || (v.status === 'pending' ? r.pendingUsd > 0 : r.status === v.status)) && (!v.flag || r.flag === v.flag) && (!v.provider || r.providerId === v.provider)
      && (!q || [r.ref, truckReg(r.truckId), providerName(r.providerId), ...r.references].join(' ').toLowerCase().includes(q)));
  });
  const active = $derived((f.values.status ? 1 : 0) + (f.values.flag ? 1 : 0) + (f.values.provider ? 1 : 0) + (f.values.show && f.values.show !== 'all' ? 1 : 0));
  function clearAll() { f.clear(['show', 'q', 'status', 'flag', 'provider']); search = ''; }
  const agreedText = (r: TransportFeeRow) => (r.agreed ? `${r.agreed.currency} ${fmtNum(r.agreed.amount)}` : 'not recorded');
</script>

<FilterBar bind:search placeholder="Shipment, truck, provider or reference" {active} onclear={clearAll}>
  <label class="field"><span>Status</span><select class="select" value={f.values.status} onchange={(e) => f.set('status', e.currentTarget.value)}>
    <option value="">All</option>{#each Object.keys(STATUS_TONE) as s}<option value={s}>{s}</option>{/each}<option value="pending">Waiting for approval</option></select></label>
  <label class="field"><span>Age</span><select class="select" value={f.values.flag} onchange={(e) => f.set('flag', e.currentTarget.value)}>
    <option value="">All</option><option value="ok">On time</option><option value="amber">Over {amberDays} days</option><option value="red">Over {redDays} days</option></select></label>
  <label class="field"><span>Provider</span><select class="select" value={f.values.provider} onchange={(e) => f.set('provider', e.currentTarget.value)}>
    <option value="">All providers</option>{#each providers as p}<option value={p}>{providerName(p)}</option>{/each}</select></label>
  {#snippet end()}{#if rows}<span class="caption">{shown.length} of {all.length} trips</span>{/if}{/snippet}
</FilterBar>

{#snippet acts(r: TransportFeeRow)}
  {@const x = refOfFee(r)}
  {#if canExpense && canSetPrice(x)}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); onact('price', r.shipmentId); }}>{r.status === 'Not recorded' ? 'Agreed price' : 'Correct price'}</button>{/if}
  {#if canExpense}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); onact('expense', r.shipmentId); }}>Expense</button>{/if}
  {#if canPay && canPayTrip(x)}<button class="btn btn-ghost btn-sm" onclick={(e) => { e.stopPropagation(); onact('pay', r.shipmentId); }}>Pay</button>{/if}
{/snippet}

{#snippet empty(compact: boolean)}
  {#if active || f.values.q}<EmptyState title="No trips match these filters" icon={SearchX} {compact}><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>
  {:else}<EmptyState title="No transport fees yet" hint="Trips appear here once they are loaded." {compact} />{/if}
{/snippet}

<div class="card flush table-wrap wide" style="max-height:70vh">
  <table class="table" aria-label="Transport fee per trip">
    <thead><tr><th>Shipment</th><th>Truck · provider</th><th>Loaded</th><th class="num">Age</th><th class="num">Agreed</th><th class="num">Paid (USD)</th><th class="num">Balance (USD)</th><th>Status</th><th>References</th><th></th></tr></thead>
    <tbody>
      {#if !rows}<tr><td colspan="10"><div class="skeleton"></div></td></tr>{/if}
      {#each shown.slice(0, 300) as r (r.shipmentId)}
        {@const fl = flagLabel(r.flag)}
        <tr class="clickable" onclick={() => onopen(r.shipmentId)}>
          <td><button type="button" class="linkbtn mono nowrap" onclick={(e) => { e.stopPropagation(); onopen(r.shipmentId); }}>{r.ref}</button><div class="caption">{companyLabel(r.entityId)}{r.reexport ? ' · re-export' : ''}</div></td>
          <td class="small">{truckReg(r.truckId)}<div class="caption">{providerName(r.providerId)}</div></td>
          <td class="small nowrap">{r.loadedAt ? fmtDate(r.loadedAt) : '—'}</td>
          <td class="num"><StatusBadge status={fl.s} label={`${r.ageDays} d`} size={12} /></td>
          <td class="num nowrap" class:nr={!r.agreed}>{agreedText(r)}{#if r.agreed && r.agreed.currency !== 'USD'}<div class="caption">USD {fmtNum(r.agreedUsd ?? 0)}</div>{/if}</td>
          <td class="num">{fmtNum(r.paidUsd)}{#if r.pendingUsd}<div class="caption">+{fmtNum(r.pendingUsd)} waiting</div>{/if}</td>
          <td class="num">{r.balanceUsd === null ? '—' : fmtNum(r.balanceUsd)}</td>
          <td><StatusBadge status={STATUS_TONE[r.status]} label={r.status} size={12} /></td>
          <td class="small refs">{r.references.join(' · ') || '—'}</td>
          <td class="nowrap">{@render acts(r)}</td>
        </tr>
      {:else}{#if rows}<tr><td colspan="10">{@render empty(true)}</td></tr>{/if}{/each}
    </tbody>
  </table>
</div>

<ul class="cards narrow" aria-label="Transport fee per trip">
  {#each shown.slice(0, 300) as r (r.shipmentId)}
    {@const fl = flagLabel(r.flag)}
    <li class="card rowcard">
      <button type="button" class="open" onclick={() => onopen(r.shipmentId)}>
        <span class="row between"><strong>{truckReg(r.truckId)}</strong><StatusBadge status={STATUS_TONE[r.status]} label={r.status} size={12} /></span>
        <span class="caption"><span class="mono">{r.ref}</span> · {companyLabel(r.entityId)} · {providerName(r.providerId)}</span>
        <span class="row between small"><span class:nr={!r.agreed}>Agreed {agreedText(r)}</span><span>Balance {r.balanceUsd === null ? '—' : `USD ${fmtNum(r.balanceUsd)}`}</span></span>
        <span class="row between"><StatusBadge status={fl.s} label={`${r.ageDays} d · ${fl.l}`} size={12} />{#if r.pendingUsd}<span class="caption">USD {fmtNum(r.pendingUsd)} waiting</span>{/if}</span>
      </button>
      <span class="row acts">{@render acts(r)}</span>
    </li>
  {:else}{#if rows}<li>{@render empty(false)}</li>{/if}{/each}
</ul>

<style>
  .nowrap { white-space: nowrap; }
  .refs { max-width: 180px; min-width: 140px; }
  .nr { color: var(--warning); font-weight: 600; }
  .linkbtn { border: 0; background: none; padding: 0; color: var(--link); font: inherit; cursor: pointer; }
  .linkbtn:hover { text-decoration: underline; }
  .cards { list-style: none; margin: 0; padding: 0; display: none; flex-direction: column; gap: var(--space-2); }
  .rowcard { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4); }
  .open { display: flex; flex-direction: column; gap: var(--space-1); width: 100%; border: 0; background: none; padding: 0; text-align: left; font: inherit; color: inherit; cursor: pointer; }
  .acts { flex-wrap: wrap; gap: var(--space-2); }
  .acts:empty { display: none; }
  @media (max-width: 760px) { .wide { display: none; } .cards { display: flex; } }
</style>
