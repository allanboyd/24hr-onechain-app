<script lang="ts">
  // Truck desk · one truck in the side drawer: where it is, ETA / queue place, open issues, what it costs (when the
  // person sees transport money) and its latest trips.
  import { lookup, type Shipment } from '@btw/api';
  import { TRUCK_STATES, costsByTruck, tripTruck, waitLabel, type TruckRow } from '@btw/api/trucks';
  import { Badge, ago, fmtDate, fmtDateTime, fmtMoney, fmtNum } from '@btw/ui';
  import { DetailDrawer } from '../page';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import type { Trip } from './MoneyDialogs.svelte';
  import type { Snippet } from 'svelte';
  let { open = $bindable(false), sel, ships, trips, money, onagreed, onqueue, actions }: {
    open?: boolean;
    sel: TruckRow | null;
    ships: Shipment[];
    /** finance trips (null = not loaded / no access) */ trips: Trip[] | null;
    /** may record agreed prices (shows the "record" shortcut on a trip) */ money: boolean;
    onagreed: (shipmentId: string) => void;
    onqueue: (loadingPointId: string) => void;
    /** extra footer actions (e.g. Trip expense) */ actions?: Snippet;
  } = $props();

  const tone = (s: TruckRow['state']) => TRUCK_STATES.find((x) => x.state === s)!.tone;
  const stateLabel = (s: TruckRow['state']) => TRUCK_STATES.find((x) => x.state === s)!.label;
  const lpName = (id?: string) => { const s = id ? lookup.supplier(id) : undefined; return s ? `${s.code} ${s.city}` : '—'; };
  const tripHist = $derived(sel ? ships.filter((s) => s.legs.some((l) => l.truckId === sel!.truck.id)).map((s) => ({ s, leg: s.legs.filter((l) => l.truckId === sel!.truck.id).at(-1)! })).sort((a, b) => (b.leg.plannedArrival ?? '').localeCompare(a.leg.plannedArrival ?? '')) : []);
  const selCosts = $derived(sel && trips ? costsByTruck(trips.filter((t) => tripTruck(t) === sel!.truck.id), [sel.truck])[0] ?? null : null);
</script>

<DetailDrawer bind:open width={640} title={sel ? `${sel.truck.reg} / ${sel.truck.trailer || '—'}` : ''}
  subtitle={sel ? `${sel.provider?.name ?? '—'} · ${fmtNum(sel.truck.capacityCases)} cases · driver ${sel.driver?.name ?? '—'}${sel.driver ? ` (${sel.driver.phone})` : ''}` : ''}>
  {#snippet header()}{#if sel}<Badge tone={tone(sel.state)}>{stateLabel(sel.state)}</Badge>{/if}{/snippet}
  {#if sel}
    <div class="stack">
      <div class="facts">
        <div><span class="caption">Where now</span><strong>{sel.where}</strong>{#if sel.position?.at}<span class="caption">{sel.position.source === 'gps' ? 'GPS' : 'last check-in'} {ago(sel.position.at)}</span>{/if}</div>
        {#if sel.eta && !['Waiting', 'Idle'].includes(sel.state)}<div><span class="caption">ETA</span><strong>{fmtDateTime(sel.eta.eta)}</strong><span class="caption">{sel.eta.state}{sel.eta.hours ? ` ${sel.eta.hours} h` : ''}</span></div>{/if}
        {#if sel.state === 'Waiting'}<div><span class="caption">Queue</span><strong>#{sel.queuePosition} at {lpName(sel.loadingPointId)}</strong><span class="caption">waiting {waitLabel(sel.waitingHours)}</span></div>{/if}
        <div><span class="caption">Last moved</span><strong>{sel.lastMoveAt ? fmtDateTime(sel.lastMoveAt) : '—'}</strong><span class="caption">{sel.daysSinceMove ?? '—'} days ago</span></div>
      </div>
      {#if sel.issues.length}<div class="issues">{#each sel.issues as i}<div class="row small"><TriangleAlert size={16} /><span><strong>{i.reason}</strong> · {i.place} · {fmtDateTime(i.at)}{#if i.newDueDate} · new due {fmtDate(i.newDueDate)}{/if}</span></div>{/each}</div>{/if}
      {#if selCosts}
        <div class="facts">
          <div><span class="caption">Agreed transport</span><strong>{fmtMoney(selCosts.agreed)}</strong><span class="caption">{selCosts.trips} trips{selCosts.notRecorded ? ` · ${selCosts.notRecorded} not recorded yet` : ''}</span></div>
          <div><span class="caption">Extra costs</span><strong>{fmtMoney(selCosts.extras)}</strong></div>
          <div><span class="caption">Paid</span><strong>{fmtMoney(selCosts.paid)}</strong>{#if selCosts.pending}<span class="caption">{fmtMoney(selCosts.pending)} waiting approval</span>{/if}</div>
          <div><span class="caption">Balance owed</span><strong class:owed={selCosts.balance > 0}>{fmtMoney(selCosts.balance)}</strong><span class="caption">{fmtMoney(selCosts.perCase)} per case</span></div>
        </div>
      {/if}
      <div>
        <div class="overline">Trips ({tripHist.length})</div>
        <ul class="trips">
          {#each tripHist.slice(0, 12) as h (h.s.id)}
            {@const t = (trips ?? []).find((x) => x.shipment.id === h.s.id)}
            <li>
              <div class="row between"><a class="mono" href="#/shipments/{h.s.id}" onclick={() => (open = false)}>{h.s.ref}</a><Badge status={h.s.status} /></div>
              <div class="caption">{lookup.route(h.leg.routeId)?.name ?? '—'} · {h.leg.departedAt ? `left ${fmtDate(h.leg.departedAt)}` : 'not left yet'} · {fmtNum(h.leg.lines.reduce((a, l) => a + l.loadedQty, 0))} cases</div>
              {#if trips}
                <div class="small">Costs {t ? fmtMoney(t.expenses) : '—'}{#if t?.costs.length} <span class="caption">({t.costs.map((c) => c.kind).join(', ')})</span>{/if} · owed {t ? fmtMoney(Math.max(0, t.balance)) : '—'}</div>
                {#if t && t.agreedRecorded === false}{#if money}<button class="btn btn-ghost btn-sm nr" onclick={() => onagreed(t.shipment.id)}>Agreed price not recorded · record</button>{:else}<span class="caption nr">Agreed price not recorded</span>{/if}{/if}
              {/if}
            </li>
          {:else}<li class="caption">No trips yet.</li>{/each}
        </ul>
        {#if tripHist.length > 12}<p class="caption">Latest 12 of {tripHist.length} trips — <a href="#/transport-costs">see every trip in Transport costs</a>.</p>{/if}
      </div>
    </div>
  {/if}
  {#snippet footer()}
    {#if sel?.shipmentId}<a class="btn btn-secondary" href="#/shipments/{sel.shipmentId}" onclick={() => (open = false)}>Open current shipment</a>{/if}
    {#if sel?.state === 'Waiting' && sel.loadingPointId}{@const lp = sel.loadingPointId}<button class="btn btn-secondary" onclick={() => { open = false; onqueue(lp); }}>Open the queue</button>{/if}
    {@render actions?.()}
    <button class="btn btn-primary" onclick={() => (open = false)}>Close</button>
  {/snippet}
</DetailDrawer>

<style>
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3); padding: var(--space-3); background: var(--surface-sunken); border-radius: var(--radius-md); }
  .facts div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .issues { padding: var(--space-2) var(--space-3); background: var(--danger-subtle); color: var(--danger); border-radius: var(--radius-md); }
  .owed { color: var(--danger); }
  .nr { color: var(--warning); font-weight: 600; }
  .trips { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: flex; flex-direction: column; }
  .trips li { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
  .trips li:last-child { border-bottom: 0; }
  .trips .btn { align-self: flex-start; padding-left: 0; }
  .mono { white-space: nowrap; }
</style>
