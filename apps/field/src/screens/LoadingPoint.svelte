<script lang="ts">
  import { untrack } from 'svelte';
  // Loading point = the giver (LD-01..04, §17.4 queue, §17.5 agreed price). One card: the next truck to load.
  // Tap → hand-over sheet → slide "Hand over to driver" → loading confirmed, shipment created, driver's trip appears.
  import { field, lookup, pos, ref, type GiverWork, type User } from '@btw/api';
  import { outbox } from '@btw/api/outbox';
  import { ago, say } from '@btw/ui';
  import { cases } from '../lib';
  import { haptic } from '../native';
  import MapView, { type MapPoint } from '../components/MapView.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { live } from '../live';
  import TopBar from '../components/TopBar.svelte';
  import MenuSheet from '../components/MenuSheet.svelte';
  import HandoverSheet from '../components/HandoverSheet.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Plus from '@lucide/svelte/icons/plus';
  let { user, onlogout }: { user: User; onlogout: () => void } = $props();

  const points_ = $derived(user.loadingPointIds);
  let lp = $state(untrack(() => user.loadingPointIds[0] ?? ''));
  let work = $state<GiverWork | null>(null);
  let menu = $state(false);
  let handover = $state(false);
  let arrived = $state(false);
  let sheetEl = $state<HTMLElement>();
  let sheetH = $state(300);

  // One call: queue + trucks to load for all my loading points (cached offline later).
  async function load() { work = await field.giver(); }
  $effect(() => live(load));
  const queue = $derived(work ? work.waiting.filter((w) => w.loadingPointId === lp) : null);
  const pending = $derived((work?.toLoad ?? []).filter((x) => x.loadingPointId === lp).sort((a, b) => a.truckNo - b.truckNo));
  $effect(() => { if (!sheetEl) return; const ro = new ResizeObserver(() => (sheetH = sheetEl!.offsetHeight)); ro.observe(sheetEl); return () => ro.disconnect(); });

  const supplier = $derived(work?.loadingPoints.find((x) => x.id === lp) ?? lookup.supplier(lp));
  const next = $derived(queue?.[0] ?? null);
  const order = $derived(pending[0] ?? null);
  const orderRef = $derived(order?.poRef ?? '');
  // Where this truck goes: the route on its plan line (e.g. Nairobi → Kigali).
  let dest = $state('');
  $effect(() => {
    const o = order; dest = '';
    if (o) pos.get(o.poId).then((r) => { const pl = r?.plan.lines.find((l) => l.id === o.lines[0]?.planLineId); dest = pl ? lookup.route(pl.routeId)?.name ?? '' : ''; }).catch(() => {});
  });
  const site = $derived(supplier ? lookup.checkpoint(supplier.checkpointId) : null);
  const points = $derived<MapPoint[]>(site ? [{ id: site.id, lat: site.lat, lng: site.lng, label: `${supplier?.code} ${supplier?.city}`, state: 'place' }] : []);

  async function submit(d: { truckId: string; driverId: string; qty: Record<string, number>; price: number; photos: string[] }) {
    if (!order) return;
    const r = await outbox.send('loading.confirm', { id: order.id, input: { truckId: d.truckId, driverId: d.driverId, loadedQty: d.qty, agreedTransport: d.price, documents: d.photos } });
    handover = false; haptic('success');
    say(r.queued ? 'Saved on the phone — sends when there is signal' : `${lookup.truck(d.truckId)?.reg} handed over — the driver's trip has started`);
  }

  // "Truck arrived": put a known truck at the back of the queue (§17.4). Market trucks are added in the web app.
  const known = $derived(ref().trucks.filter((t) => !queue?.some((w) => w.truckId === t.id)));
  let pick = $state('');
  async function addArrived() {
    const t = lookup.truck(pick); if (!t) return;
    const r = await outbox.send('waiting.add', { loadingPointId: lp, truckId: t.id, driverId: t.defaultDriverId ?? ref().drivers[0].id });
    arrived = false; pick = ''; say(r.queued ? `${t.reg} saved — added when there is signal` : `${t.reg} added to the queue`);
  }
</script>

<MapView {points} padBottom={sheetH} />
<TopBar onmenu={() => (menu = true)} title="{supplier?.code} {supplier?.city}" />

<Sheet bind:el={sheetEl}>
  {#if points_.length > 1}
    <div class="seg" role="group" aria-label="Loading point">
      {#each points_ as id (id)}<button aria-pressed={id === lp} onclick={() => (lp = id)}>{lookup.supplier(id)?.code} {lookup.supplier(id)?.city}</button>{/each}
    </div>
  {/if}
  {#if !work || !queue}
    <div class="skeleton" style="height:24px;width:60%"></div><div class="skeleton" style="height:64px"></div>
  {:else if !order}
    <p class="eyebrow">Nothing to load</p>
    <p class="headline">No open orders here</p>
    <p class="subline">When a purchase order for {supplier?.code} is approved, its trucks appear here.{#if queue.length} {queue.length} truck{queue.length > 1 ? 's' : ''} waiting.{/if}</p>
  {:else if !next}
    <p class="eyebrow">Next to load · {orderRef} truck {order.truckNo}</p>
    <p class="headline">No truck waiting</p>
    <p class="subline">{cases(order.lines.reduce((a, l) => a + l.orderedQty, 0))} ready to load. Add the truck when it reaches the gate.</p>
    <button class="btn btn-primary btn-lg btn-block" onclick={() => (arrived = true)}><Plus size={20} />Truck arrived</button>
  {:else}
    <p class="eyebrow">Next truck · {orderRef} truck {order.truckNo}</p>
    <button class="next" onclick={() => (handover = true)}>
      <span class="grow">
        <span class="headline">{lookup.truck(next.truckId)?.reg}</span>
        <span class="subline">{lookup.driver(next.driverId)?.name} · waiting {ago(next.arrivedAt).replace(' ago', '')}</span>
        <span class="subline">{order.lines.map((l) => `${l.orderedQty} ${lookup.product(l.productId)?.brand}`).join(' + ')}{dest ? ` · ${dest}` : ''}</span>
      </span>
      <ChevronRight size={28} />
    </button>
    <button class="btn btn-accent btn-lg btn-block" onclick={() => (handover = true)}>Load this truck</button>
    <div class="row-actions">
      <span class="caption">{queue.length > 1 ? `${queue.length - 1} more waiting` : 'No one else waiting'} · {pending.length} truck{pending.length > 1 ? 's' : ''} to load</span>
      <button class="text-btn" onclick={() => (arrived = true)}>+ Truck arrived</button>
    </div>
  {/if}
</Sheet>

{#if handover && order}
  <HandoverSheet title="Load & hand over" subtitle="{orderRef} · truck {order.truckNo}{dest ? ` · ${dest}` : ''}"
    trucks={(queue ?? []).map((w) => ({ truckId: w.truckId, driverId: w.driverId, note: `waiting ${ago(w.arrivedAt).replace(' ago', '')}` }))}
    lines={order.lines.map((l) => ({ key: l.planLineId, productId: l.productId, qty: l.orderedQty }))}
    onsubmit={submit} onclose={() => (handover = false)} />
{/if}

{#if arrived}
  <Sheet modal title="Truck arrived" onclose={() => (arrived = false)}>
    <label class="field"><span>Which truck?</span>
      <select class="select" bind:value={pick}><option value="">Choose a truck</option>{#each known as t (t.id)}<option value={t.id}>{t.reg} · {lookup.provider(t.providerId)?.name}</option>{/each}</select></label>
    <p class="caption">A truck from the market (not in the list)? Ask the office to add it in the web app.</p>
    <button class="btn btn-primary btn-lg btn-block" disabled={!pick} onclick={addArrived}>Add to queue</button>
  </Sheet>
{/if}

{#if menu}<MenuSheet {user} {onlogout} onclose={() => (menu = false)} />{/if}

<style>
  .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .next { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: 14px 16px; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--surface-sunken); color: var(--text); text-align: left; font: inherit; cursor: pointer; }
  .row-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .seg { display: flex; gap: 6px; }
  .seg button { flex: 1; min-height: 40px; border-radius: 20px; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); font: 600 14px var(--ff-body); cursor: pointer; }
  .seg button[aria-pressed='true'] { background: var(--primary); color: var(--text-on-primary); border-color: var(--primary); }
</style>
