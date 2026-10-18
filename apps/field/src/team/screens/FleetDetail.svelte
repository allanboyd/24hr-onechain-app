<script lang="ts">
  // One truck: where it is now, its driver and provider to call, open issues, its trips and what it cost.
  // Truck planners can add a trip expense (accounts pay it; above the limit a director approves).
  import { finance, lookup, type CostKind, type User } from '@btw/api';
  import { Badge, fmtDateTime, say } from '@btw/ui';
  import { TRUCK_STATES, costsByTruck, tripTruck, waitLabel } from '@btw/api/trucks';
  import { ref } from '@btw/api';
  import Phone from '@lucide/svelte/icons/phone';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Plus from '@lucide/svelte/icons/plus';
  import { can } from '../access';
  import { co } from '../company.svelte';
  import { loadDesk } from '../desk';
  import { Res, onRefresh } from '../load.svelte';
  import { usd, num } from '../fmt';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { user, view }: { user: User; view: View; query: URLSearchParams } = $props();
  const id = $derived((view as { id?: string }).id!);
  const r = new Res(() => loadDesk(user));
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const x = $derived(r.data?.rows.find((y) => y.truck.id === id));
  const trips = $derived((r.data?.trips ?? []).filter((t) => tripTruck(t) === id).sort((a, b) => (b.shipment.legs[0]?.departedAt ?? '').localeCompare(a.shipment.legs[0]?.departedAt ?? '')));
  const cost = $derived(r.data?.trips ? costsByTruck(trips, ref().trucks)[0] ?? null : null);
  const tone = (s: string) => TRUCK_STATES.find((t) => t.state === s)?.tone ?? 'neutral';
  const label = (s: string) => TRUCK_STATES.find((t) => t.state === s)?.label ?? s;

  let adding = $state(false); let trip = $state(''); let kind = $state<CostKind>('Other'); let amount = $state(0); let docRef = $state('');
  const KINDS: CostKind[] = ['Other', 'Clearing & forwarding', 'Taxes & duties', 'Loading & offloading', 'Storage'];
  async function saveCost() {
    if (!(amount > 0)) { say('Enter an amount above zero'); return; }
    try { await finance.addCost({ shipmentId: trip, kind, amount: Number(amount), currency: 'USD', docRef: docRef.trim() || undefined } as never); adding = false; await r.reload(); say('Expense added to the trip'); }
    catch (e) { say((e as Error).message); }
  }
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="card" /><Skeleton rows={4} />
{:else if !x}
  <Empty title="Truck not found" text="It may be deactivated or belong to another company." />
{:else}
  <section class="t-card hero">
    <div class="t-row between"><span class="t-meta">{x.provider?.name ?? ''}</span><Badge tone={tone(x.state)}>{label(x.state)}</Badge></div>
    <h2 class="t-h1">{x.truck.reg}</h2>
    <p class="t-sub">{x.truck.trailer ? `Trailer ${x.truck.trailer} · ` : ''}{num(x.truck.capacityCases)} cases</p>
    <p class="where">{x.where}</p>
    <dl class="t-kv">
      {#if x.position?.at}<dt>{x.position.source === 'gps' ? 'GPS' : 'Last check-in'}</dt><dd>{fmtDateTime(x.position.at)}</dd>{/if}
      {#if x.eta && !['Waiting', 'Idle'].includes(x.state)}<dt>ETA</dt><dd>{fmtDateTime(x.eta.eta)} · {x.eta.state}{x.eta.hours ? ` ${x.eta.hours} h` : ''}</dd>{/if}
      {#if x.state === 'Waiting'}<dt>Queue</dt><dd>#{x.queuePosition} at {lookup.supplier(x.loadingPointId ?? '')?.code} · {waitLabel(x.waitingHours)}</dd>{/if}
      <dt>Last moved</dt><dd>{x.daysSinceMove == null ? '—' : x.daysSinceMove === 0 ? 'today' : `${x.daysSinceMove} days ago`}</dd>
      {#if x.shipmentRef}<dt>Shipment</dt><dd>{x.shipmentRef}</dd>{/if}
    </dl>
    <div class="t-actions">
      {#if x.driver?.phone}<a class="btn btn-secondary btn-lg" href="tel:{x.driver.phone}"><Phone size={18} />{x.driver.name.split(' ')[0]}</a>{/if}
      {#if x.provider?.phone}<a class="btn btn-secondary btn-lg" href="tel:{x.provider.phone}"><Phone size={18} />Provider</a>{/if}
      {#if x.state === 'Waiting'}<a class="btn btn-secondary btn-lg" href="#/queue?lp={x.loadingPointId}">Queue</a>{/if}
    </div>
  </section>

  {#if x.issues.length}
    <section class="t-card issues">
      {#each x.issues as i (i.id)}<div class="t-row"><TriangleAlert size={18} /><span><strong>{i.reason}</strong><span class="t-meta"> · {i.place} · {fmtDateTime(i.at)}</span></span></div>{/each}
      {#if x.shipmentId}<a class="link" href="#/trucks/{x.shipmentId}">Open the shipment</a>{/if}
    </section>
  {/if}

  {#if cost}
    <h3 class="t-title">What it cost {#if can(user, 'finance') && trips.length && co.active !== null}<button onclick={() => { trip = trips[0].shipment.id; kind = 'Other'; amount = 0; docRef = ''; adding = true; }}><Plus size={14} />Expense</button>{/if}</h3>
    <section class="t-card">
      <dl class="t-kv">
        <dt>Trips</dt><dd>{num(cost.trips)}</dd>
        <dt>Agreed transport</dt><dd>{usd(cost.agreed)}</dd>
        <dt>Extra costs</dt><dd>{usd(cost.extras)}</dd>
        <dt>Paid</dt><dd>{usd(cost.paid)}{cost.pending ? ` (+${usd(cost.pending)} waiting)` : ''}</dd>
        <dt>Balance owed</dt><dd class:owed={cost.balance > 0}>{usd(cost.balance)}</dd>
        <dt>Trip cost per case</dt><dd>${cost.perCase.toFixed(2)}</dd>
      </dl>
    </section>
  {/if}

  <h3 class="t-title">Trips</h3>
  {#if trips.length}
    <div class="t-list">
      {#each trips.slice(0, 10) as t (t.shipment.id)}
        <a class="t-item" href="#/money/{t.shipment.id}">
          <span class="t-main"><span class="t-line1"><span class="t-ellipsis">{t.shipment.ref}</span><Badge status={t.shipment.status} /></span>
            <span class="t-meta t-ellipsis">{lookup.route(t.shipment.legs[0]?.routeId ?? '')?.name ?? ''} · {num(t.cases)} cases</span>
            <span class="t-meta">{usd(t.expenses)} costs · {t.balance > 0 ? `${usd(t.balance)} owed` : 'settled'}</span></span>
          <ChevronRight class="t-chev" size={20} />
        </a>
      {/each}
    </div>
  {:else}<p class="t-meta">No trips yet.</p>{/if}
{/if}

{#if adding}
  <div class="sheet-bg" role="presentation" onclick={() => (adding = false)}></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="cx-h">
    <h3 id="cx-h">Add a trip expense</h3>
    <label class="field"><span>Trip</span><select class="select" bind:value={trip}>{#each trips as t (t.shipment.id)}<option value={t.shipment.id}>{t.shipment.ref}</option>{/each}</select></label>
    <label class="field"><span>Kind</span><select class="select" bind:value={kind}>{#each KINDS as k}<option>{k}</option>{/each}</select></label>
    <label class="field"><span>Amount (USD)</span><input class="input" type="number" inputmode="decimal" min="0" step="0.01" bind:value={amount} /></label>
    <label class="field"><span>Receipt / reference</span><input class="input" bind:value={docRef} placeholder="e.g. weighbridge fine receipt" /></label>
    <p class="t-meta">Accounts record the payment; above the limit a director approves.</p>
    <div class="t-actions"><button class="btn btn-secondary btn-lg" onclick={() => (adding = false)}>Cancel</button><button class="btn btn-primary btn-lg" onclick={saveCost}>Add expense</button></div>
  </div>
{/if}

<style>
  .hero { display: flex; flex-direction: column; gap: 8px; }
  .where { margin: 0; font-weight: 600; font-size: 16px; }
  .issues { display: flex; flex-direction: column; gap: 8px; background: var(--danger-subtle); color: var(--danger); }
  .link { color: var(--link); font-weight: 600; }
  .owed { color: var(--danger); }
  .t-title button { display: inline-flex; align-items: center; gap: 4px; }
  .sheet-bg { position: fixed; inset: 0; background: rgb(0 0 0 / .4); z-index: 40; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 41; background: var(--surface); border-radius: 22px 22px 0 0; padding: 20px 16px calc(env(safe-area-inset-bottom) + 20px); display: flex; flex-direction: column; gap: 12px; max-width: 720px; margin: 0 auto; box-shadow: var(--elevation-3); }
  .sheet h3 { margin: 0; font: 700 20px var(--ff-display); }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--text-muted); }
  .select, .input { height: 48px; font-size: 16px; }
</style>
