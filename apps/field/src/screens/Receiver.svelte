<script lang="ts">
  // Receiver (Asie / Zonas, MA-03, AK-*): map of trucks coming to my warehouse(s) and ONE card —
  // an arrived truck to receive first, else a transfer to send on (DS-02), else the next truck on its way.
  import { field, lookup, type Leg, type LegView, type User } from '@btw/api';
  import { outbox, type OutboxState } from '@btw/api/outbox';
  import { Badge, fmtDateTime, hoursLabel, say } from '@btw/ui';
  import { cases, cpShort, legPosition } from '../lib';
  import { haptic } from '../native';
  import MapView, { type MapPoint, type MapTruck } from '../components/MapView.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { live } from '../live';
  import TopBar from '../components/TopBar.svelte';
  import MenuSheet from '../components/MenuSheet.svelte';
  import ReceiveSheet from '../components/ReceiveSheet.svelte';
  import HandoverSheet from '../components/HandoverSheet.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  let { user, onlogout }: { user: User; onlogout: () => void } = $props();

  type Item = LegView;
  let incomingAll = $state<LegView[] | null>(null);
  let toSendAll = $state<LegView[]>([]);
  let sync = $state<OutboxState>({ online: true, pending: [], syncing: false });
  let menu = $state(false);
  let receiving = $state<Item | null>(null);
  let sending = $state<Item | null>(null);
  let sheetEl = $state<HTMLElement>();
  let sheetH = $state(300);

  // Working sets: trucks heading to my warehouses + transfer legs waiting to leave from them (DS-02).
  async function load() {
    const [r, g] = await Promise.all([field.receiver(), field.giver()]);
    incomingAll = r.incoming;
    const mine = r.warehouses.map((w) => w.checkpointId);
    toSendAll = g.handover.filter((v) => mine.includes(v.leg.fromId) && !v.leg.passes[0].departedAt);
  }
  $effect(() => live(load));
  $effect(() => outbox.subscribe((s) => (sync = s)));
  $effect(() => { if (!sheetEl) return; const ro = new ResizeObserver(() => (sheetH = sheetEl!.offsetHeight)); ro.observe(sheetEl); return () => ro.disconnect(); });

  // Signed / sent on this phone but not yet synced → hide immediately (optimistic).
  const queuedAck = $derived(new Set(sync.pending.filter((p) => p.op === 'leg.acknowledge').map((p) => (p.payload as { legId: string }).legId)));
  const queuedSend = $derived(new Set(sync.pending.filter((p) => p.op === 'leg.dispatch').map((p) => (p.payload as { legId: string }).legId)));
  const incoming = $derived((incomingAll ?? []).filter((v) => !queuedAck.has(v.leg.id)));
  const toSend = $derived(toSendAll.filter((v) => !queuedSend.has(v.leg.id)));
  const arrivedNow = (l: Leg) => l.status === 'Arrived' || !!l.passes.at(-1)?.arrivedAt;
  const arrived = $derived(incoming.find((i) => arrivedNow(i.leg)) ?? null);
  const focus = $derived<{ kind: 'receive' | 'send' | 'coming'; item: Item } | null>(
    arrived ? { kind: 'receive', item: arrived } : toSend[0] ? { kind: 'send', item: toSend[0] } : incoming[0] ? { kind: 'coming', item: incoming[0] } : null);
  const others = $derived(incoming.filter((i) => i !== focus?.item));
  const myCps = $derived(user.warehouseIds.map((w) => lookup.warehouse(w)?.checkpointId).filter(Boolean) as string[]);
  const points = $derived<MapPoint[]>(myCps.map((id) => { const c = lookup.checkpoint(id)!; return { id, lat: c.lat, lng: c.lng, label: cpShort(id), state: 'place' as const }; }));
  const trucks = $derived<MapTruck[]>(incoming.map((v) => ({ id: v.leg.id, ...legPosition(v.leg), label: v.truck?.reg ?? '', late: v.eta.state === 'Late' })));
  const isFinal = (i: Item) => lookup.warehouse(i.shipment.warehouseId)?.checkpointId === i.leg.toId;
  const total = (l: Leg) => l.lines.reduce((a, x) => a + x.loadedQty, 0);

  async function receive(d: { lines: { productId: string; expected: number; received: number; damaged: number; remarks: string }[]; receiverName: string; signature: string; photos: string[] }) {
    if (!receiving) return;
    const r = await outbox.send('leg.acknowledge', { legId: receiving.leg.id, input: { receiverName: d.receiverName, lines: d.lines, signature: d.signature, photos: d.photos } });
    receiving = null; haptic('success');
    say(r.queued ? 'Signed — saved on the phone, sends when there is signal' : 'Delivery received — thank you');
  }
  async function sendOn() {
    if (!sending) return;
    const leg = sending.leg; const reg = sending.truck?.reg ?? 'Truck';
    const r = await outbox.send('leg.dispatch', { legId: leg.id, source: 'office' });
    sending = null; haptic('success');
    say(r.queued ? 'Saved — sends when there is signal' : `${reg} is on its way to ${cpShort(leg.toId)}`);
  }
</script>

<MapView {points} {trucks} padBottom={sheetH} />
<TopBar onmenu={() => (menu = true)} title={user.warehouseIds.map((w) => lookup.warehouse(w)?.name).join(' · ')} />

<Sheet bind:el={sheetEl}>
  {#if !incomingAll}
    <div class="skeleton" style="height:24px;width:60%"></div><div class="skeleton" style="height:64px"></div>
  {:else if !focus}
    <p class="eyebrow">Nothing on the way</p>
    <p class="headline">No trucks coming</p>
    <p class="subline">When a truck is loaded for {user.warehouseIds.map((w) => lookup.warehouse(w)?.name).join(' or ')}, you'll see it here with its arrival time.</p>
  {:else}
    {@const { shipment, leg } = focus.item}
    {@const eta = focus.item.eta}
    {@const t = focus.item.truck}
    {#if focus.kind === 'receive'}
      <p class="eyebrow">Arrived at {cpShort(leg.toId)}</p>
      <p class="headline">{t?.reg} is here</p>
      <p class="subline">{cases(total(leg))} · {focus.item.driver?.name} · {shipment.ref}</p>
      <button class="btn btn-accent btn-lg btn-block" onclick={() => (receiving = focus.item)}>Receive & sign</button>
    {:else if focus.kind === 'send'}
      <p class="eyebrow">Send on · {focus.item.route?.name}</p>
      <p class="headline">{t?.reg} to {cpShort(leg.toId)}</p>
      <p class="subline">{cases(total(leg))} · {focus.item.driver?.name} · {shipment.ref} leg {leg.seq}</p>
      <button class="btn btn-accent btn-lg btn-block" onclick={() => (sending = focus.item)}>Load & hand over</button>
    {:else}
      <p class="eyebrow">Next truck · {focus.item.route?.name}</p>
      <div class="row">
        <p class="headline grow">{t?.reg}</p>
        <Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge>
      </div>
      <p class="subline">Arrives {fmtDateTime(eta.eta)} · {cases(total(leg))}</p>
      <button class="btn btn-secondary btn-lg btn-block" onclick={() => (receiving = focus.item)}>It's here — receive now</button>
    {/if}
    {#if others.length}
      <ul class="others">
        {#each others.slice(0, 3) as o (o.leg.id)}
          {@const e = o.eta}
          <li><button onclick={() => (receiving = o)}><span class="grow"><strong>{o.truck?.reg}</strong> <span class="caption">· {cases(total(o.leg))}</span></span><span class="caption">{arrivedNow(o.leg) ? 'Arrived' : fmtDateTime(e.eta)}</span><ChevronRight size={18} /></button></li>
        {/each}
      </ul>
    {/if}
  {/if}
</Sheet>

{#if receiving}
  <ReceiveSheet leg={receiving.leg} {user} isFinal={isFinal(receiving)} onsubmit={receive} onclose={() => (receiving = null)} />
{/if}
{#if sending}
  <HandoverSheet title="Hand over" subtitle="{sending.shipment.ref} leg {sending.leg.seq} · {sending.route?.name}"
    trucks={[{ truckId: sending.leg.truckId, driverId: sending.leg.driverId }]}
    lines={sending.leg.lines.map((l, i) => ({ key: String(i), productId: l.productId, qty: l.loadedQty }))}
    editable={false} askPrice={false} qtyLabel="good on receipt" onsubmit={sendOn} onclose={() => (sending = null)} />
{/if}
{#if menu}<MenuSheet {user} {onlogout} onclose={() => (menu = false)} />{/if}

<style>
  .row { display: flex; align-items: center; gap: var(--space-3); }
  .grow { flex: 1; min-width: 0; }
  .others { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
  .others button { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 52px; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; padding: 0; }
</style>
