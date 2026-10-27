<script lang="ts">
  // Trip detail of the Transport costs page, in the page kit's side drawer: the transport fee (agreed vs paid, references,
  // age), every cost line, the payments (directors approve the ones waiting) and — for finance roles — the landing cost.
  import { finance, type CostKind, type TransportFeeRow } from '@btw/api';
  import { Badge, fmtDate, fmtDateTime, fmtNum, say } from '@btw/ui';
  import { DetailDrawer } from '../page';
  import { StatusBadge } from '../dashboard';
  import { attempt } from '../../lib/load.svelte';
  import { companyLabel } from '../../lib/companies';
  import { COST_KINDS, STATUS_TONE, canPayTrip, canSetPrice, providerName, providerOfTruck, refOfFee, refOfTrip, routeName, tripLoadedAt, truckReg, type CostAct, type Trip } from './costs';

  let { open = $bindable(false), fee = null, trip = null, flagLabel, canApprove = false, canPay = false, canExpense = false, onact }: {
    open?: boolean;
    fee?: TransportFeeRow | null;
    trip?: Trip | null;
    /** age flag → words (from config amber / red days) */ flagLabel: (f: TransportFeeRow['flag']) => { s: string; l: string };
    canApprove?: boolean; canPay?: boolean; canExpense?: boolean;
    onact: (kind: CostAct, shipmentId: string) => void;
  } = $props();

  const r = $derived(fee ? refOfFee(fee) : trip ? refOfTrip(trip) : null);
  const truckId = $derived(fee?.truckId ?? trip?.shipment.legs[0]?.truckId);
  const legs = $derived(trip?.shipment.legs ?? []);
  const costs = $derived(trip?.costs ?? fee?.costs ?? []);
  const loaded = $derived(fee?.loadedAt ?? (trip ? tripLoadedAt(trip) : null));
  const full = $derived(!!trip && trip.goods !== undefined && trip.goods !== null);
  const byKind = (k: CostKind) => (trip?.costs ?? []).filter((c) => c.kind === k).reduce((a, c) => a + (c.amountUsd ?? c.amount), 0);
  let busy = $state('');
  async function approve(id: string) {
    busy = id;
    const err = await attempt(() => finance.approve(id));
    busy = '';
    say(err || 'Payment approved');
  }
</script>

<DetailDrawer bind:open title={r ? `${r.ref} · ${truckReg(truckId)}` : ''} subtitle={r ? `${companyLabel(r.entityId)} · ${providerName(fee?.providerId ?? providerOfTruck(truckId))}` : ''}>
  {#snippet header()}
    {#if r}<StatusBadge status={STATUS_TONE[r.status]} label={r.status} size={12} />
      {#if fee}{@const fl = flagLabel(fee.flag)}<StatusBadge status={fl.s} label={`${fee.ageDays} d · ${fl.l}`} size={12} />{/if}
      {#if trip?.payments.some((p) => p.status === 'Pending approval')}<Badge status="Pending approval" />{/if}{/if}
  {/snippet}
  {#if r}
    <dl class="facts">
      <dt>Route</dt><dd>{#if legs.length}{#each legs as l, i (l.id)}{i ? ' · ' : ''}{routeName(l.routeId)}{/each}{:else}{#each fee?.legs ?? [] as l, i (l.id)}{i ? ' · ' : ''}{routeName(l.routeId)}{/each}{/if}</dd>
      <dt>Loaded</dt><dd>{loaded ? fmtDate(loaded) : '—'}</dd>
      <dt>Agreed price</dt><dd>{#if r.agreed}{r.agreed.currency} {fmtNum(r.agreed.amount, 2)}{#if fee?.agreedUsd != null && r.agreed.currency !== 'USD'} <span class="caption">(USD {fmtNum(fee.agreedUsd, 2)})</span>{/if}{:else}<span class="nr">not recorded yet</span>{/if}</dd>
      {#if fee}
        <dt>Paid</dt><dd>USD {fmtNum(fee.paidUsd, 2)}{#if fee.pendingUsd} <span class="caption">+ USD {fmtNum(fee.pendingUsd, 2)} waiting for approval</span>{/if}</dd>
      {:else if trip}
        <dt>Paid</dt><dd>USD {fmtNum(trip.paid, 2)}</dd>
      {/if}
      <dt>Balance</dt><dd>{r.balanceUsd === null ? '—' : `USD ${fmtNum(r.balanceUsd, 2)}`}</dd>
      {#if fee}<dt>References</dt><dd>{fee.references.join(' · ') || '—'}</dd>{/if}
    </dl>

    <section class="sec">
      <div class="overline">Costs</div>
      <table class="table">
        <tbody>
          {#each costs as c (c.id)}<tr><td>{c.kind}{#if c.legId}<span class="caption"> · leg {legs.find((l) => l.id === c.legId)?.seq ?? ''}</span>{/if}</td><td class="caption">{c.docRef ?? ''}</td><td class="num nowrap">{c.currency} {fmtNum(c.amount, 2)}</td></tr>
          {:else}<tr><td class="empty small">No costs yet</td></tr>{/each}
        </tbody>
      </table>
    </section>

    {#if trip}
      <section class="sec">
        <div class="overline">Payments</div>
        <table class="table">
          <tbody>
            {#each trip.payments as p (p.id)}
              <tr><td class="small">{fmtDateTime(p.at)}</td><td class="mono small nowrap">{p.reference}</td><td class="num">{fmtNum(p.amount, 2)}</td>
                <td>{#if p.status === 'Pending approval' && canApprove}<button class="btn btn-accent btn-sm" disabled={busy === p.id} onclick={() => approve(p.id)}>Approve</button>{:else}<Badge status={p.status} />{/if}</td></tr>
            {:else}<tr><td class="empty small">No payments yet</td></tr>{/each}
          </tbody>
        </table>
      </section>
    {/if}

    {#if full && trip}
      <section class="sec card landing">
        <div class="overline">Landing cost · truck {trip.shipment.truckNo}</div>
        <div class="row between"><span class="muted">Goods (price × loaded qty)</span><span class="num">{fmtNum(trip.goods, 2)}</span></div>
        {#each COST_KINDS as k}{@const v = byKind(k)}<div class="row between small"><span class="muted">+ {k}</span><span class="num" class:subtle={!v}>{v ? fmtNum(v, 2) : '—'}</span></div>{/each}
        <div class="row between total"><span>Landing cost (USD)</span><span class="num">{fmtNum(trip.landing, 2)}</span></div>
        <div class="row between"><span class="muted">Cases</span><span class="num">{fmtNum(trip.cases)}</span></div>
        <div class="row between"><strong>Per case (USD)</strong><strong class="num">{fmtNum(trip.perCase, 2)}</strong></div>
      </section>
    {/if}
  {/if}
  {#snippet footer()}
    {#if r}
      <a class="btn btn-ghost" href="#/shipments/{r.shipmentId}">Open shipment</a>
      {#if canExpense && canSetPrice(r)}<button class="btn btn-secondary" onclick={() => onact('price', r.shipmentId)}>{r.status === 'Not recorded' ? 'Record agreed price' : 'Correct agreed price'}</button>{/if}
      {#if canExpense}<button class="btn btn-secondary" onclick={() => onact('expense', r.shipmentId)}>Add expense</button>{/if}
      {#if canPay && canPayTrip(r)}<button class="btn btn-primary" onclick={() => onact('pay', r.shipmentId)}>Record payment</button>{/if}
    {/if}
  {/snippet}
</DetailDrawer>

<style>
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-2) var(--space-4); margin: 0 0 var(--space-4); }
  .facts dt { color: var(--text-muted); font-size: var(--fs-label); font-weight: 600; }
  .facts dd { margin: 0; }
  .sec { margin-bottom: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
  .nowrap { white-space: nowrap; }
  .nr { color: var(--warning); font-weight: 600; }
  .landing { padding: var(--space-3); }
  .landing .total { border-top: 1px solid var(--border); padding-top: var(--space-2); font-weight: 700; }
</style>
