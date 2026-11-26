<script lang="ts">
  // Map plus a truck for each trip, so Loading and Shipments open on where the trucks are.
  import { lookup, shipments, type Shipment } from '@btw/api';
  import Truck from '@lucide/svelte/icons/truck';
  import TruckMap, { truckStanding } from './today/TruckMap.svelte';

  let { mode = 'shipments' }: { mode?: 'loading' | 'shipments' } = $props();

  let trips = $state<Shipment[] | null>(null);
  $effect(() => {
    let dead = false;
    shipments.list().then((list) => { if (!dead) trips = list; }).catch(() => { if (!dead) trips = []; });
    return () => { dead = true; };
  });

  const legOf = (sh: Shipment) => sh.legs.find((l) => l.status !== 'Acknowledged' && l.status !== 'Cancelled') ?? sh.legs.at(-1);
  const placeOf = (sh: Shipment) => {
    const leg = legOf(sh);
    const hit = leg ? [...leg.passes].reverse().find((p) => p.arrivedAt) ?? leg.passes[0] : undefined;
    return (hit ? lookup.checkpoint(hit.checkpointId)?.name : '')?.split(' (')[0] || 'On the road';
  };
  const moving = $derived((trips ?? []).filter((s) => s.status !== 'Acknowledged' && s.status !== 'Cancelled'));
  const loadingOnly = $derived(moving.filter((s) => s.status === 'Loading'));
  const shown = $derived(mode === 'loading' && loadingOnly.length ? loadingOnly : moving);
  const note = $derived(mode === 'loading' && trips && !loadingOnly.length ? 'No truck is at a loading point. These are on the road.' : '');
</script>

<div class="stage">
  <section class="card map-card">
    <h3>Where they are</h3>
    {#if note}<p class="caption">{note}</p>{/if}
    {#if trips && !shown.length}<p class="caption">No trucks on the road.</p>{:else}<TruckMap items={shown} />{/if}
  </section>
  <section class="card trucks" aria-label="Trucks and their standing">
    <h3>Trucks</h3>
    <ul>
      {#each shown as sh (sh.id)}
        {@const standing = truckStanding(sh)}
        <li>
          <a href="#/shipments/{sh.id}">
            <span class="mark" class:late={standing === 'Delayed'} class:over={standing === 'Over the limit'}><Truck size={22} aria-hidden="true" /></span>
            <span class="tx"><b>{lookup.truck(legOf(sh)?.truckId ?? '')?.reg ?? 'Truck'}</b><span>{standing} · {placeOf(sh)}</span></span>
          </a>
        </li>
      {:else}
        <li class="empty">No trucks to show.</li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .stage { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr); gap: var(--space-4); align-items: stretch; min-height: 420px; }
  .map-card, .trucks { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; min-height: 0; padding: var(--space-4) var(--space-5); }
  h3 { margin: 0; font-size: var(--fs-h4); line-height: var(--lh-h4); }
  .map-card :global(.wrap) { flex: 1; min-height: 280px; }
  ul { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; min-height: 0; }
  li a { display: flex; align-items: center; gap: var(--space-3); padding: 8px 0; border-top: 1px solid var(--border); color: inherit; text-decoration: none; }
  li:first-child a { border-top: 0; }
  li a:hover b { text-decoration: underline; }
  .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; flex: none; background: var(--success); color: var(--nav-strong); }
  .mark.late { background: var(--warning-solid); color: var(--primary); }
  .mark.over { background: var(--danger); color: var(--nav-strong); }
  .tx { display: flex; flex-direction: column; min-width: 0; }
  .tx b { font-size: 14px; }
  .tx span { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { padding: 12px 0; color: var(--text-muted); font-size: 13px; }
  @media (max-width: 900px) { .stage { grid-template-columns: 1fr; min-height: 0; } .trucks { max-height: 320px; } }
</style>
