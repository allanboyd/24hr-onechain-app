<script lang="ts">
  import CompanyChip from '../components/CompanyChip.svelte';
  import CompanyDot from '../components/CompanyDot.svelte';
  // Receiver (Asie / Yonas, MA-03, AK-*): map of trucks coming to my warehouse(s) and ONE card —
  // an arrived truck to receive first, else a transfer to send on (DS-02), else the next truck on its way.
  import { field, lookup, type Leg, type LegView, type User } from '@btw/api';
  import { outbox, type OutboxState } from '@btw/api/outbox';
  import { Badge, fmtDateTime, hoursLabel, say } from '@btw/ui';
  import { cases, cpShort, legPosition, warehouseLabel } from '../lib';
  import { haptic } from '../native';
  import MapView, { type MapPoint, type MapTruck } from '../components/MapView.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { live } from '../live';
  import TopBar from '../components/TopBar.svelte';
  import MenuSheet from '../components/MenuSheet.svelte';
  import ReceiveSheet from '../components/ReceiveSheet.svelte';
  import HandoverSheet from '../components/HandoverSheet.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Receipt from '@lucide/svelte/icons/receipt';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
  import { focus } from '../shell/focus.svelte';
  let { user, onlogout, shell = false }: { user: User; onlogout: () => void; shell?: boolean } = $props();

  type Item = LegView;
  let incomingAll = $state<LegView[] | null>(null);
  let toSendAll = $state<LegView[]>([]);
  let sync = $state<OutboxState>({ online: true, pending: [], syncing: false });
  let menu = $state(false);
  let receiving = $state<Item | null>(null);
  let sending = $state<Item | null>(null);
  let sheetEl = $state<HTMLElement>();
  let sheetH = $state(300);
  // docs/14: warehouse tools for Asie / Yonas — expenses, stock counts, re-exports (Asie). Each sheet is its own lazy chunk.
  const TOOLS = {
    expense: () => import('../team/warehouse/ExpenseSheet.svelte'),
    stock: () => import('../team/warehouse/StockSheet.svelte'),
    reexport: () => import('../team/warehouse/ReexportSheet.svelte'),
  } as const;
  let tool = $state<keyof typeof TOOLS | null>(null);
  let toolRev = $state(0);
  // D-A1: Asie / Yonas home strip (to sign, on the way, stock low / over, expenses this month, re-exports) — lazy chunk.
  const glance = import('../team/warehouse/WarehouseGlance.svelte');
  const can = (f: string) => !!user.features?.includes(f as never);

  // Working sets: trucks heading to my warehouses + transfer legs waiting to leave from them (DS-02).
  async function load() {
    const [r, g] = await Promise.all([field.receiver(), field.giver()]);
    incomingAll = r.incoming;
    const mine = r.warehouses.map((w) => w.checkpointId);
    // only the re-export planner (Asie) loads and dispatches onward moves from her warehouses (docs/12 §7)
    toSendAll = user.roles.includes('reexport') ? g.handover.filter((v) => mine.includes(v.leg.fromId) && !v.leg.passes[0].departedAt) : [];
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
  const picked = $derived(incoming.find((i) => i.leg.id === focus.legId) ?? toSend.find((i) => i.leg.id === focus.legId) ?? null);
  const job = $derived<{ kind: 'receive' | 'send' | 'coming'; item: Item } | null>(
    picked ? { kind: arrivedNow(picked.leg) ? 'receive' : toSend.includes(picked) ? 'send' : 'coming', item: picked }
    : arrived ? { kind: 'receive', item: arrived } : toSend[0] ? { kind: 'send', item: toSend[0] } : incoming[0] ? { kind: 'coming', item: incoming[0] } : null);
  const others = $derived(incoming.filter((i) => i !== job?.item));
  // Trucks waiting to be loaded here (send-on legs, Asie's re-exports) stay reachable while an arrival waits to be signed.
  const toLoadMore = $derived(toSend.filter((i) => i !== job?.item));
  const myCps = $derived(user.warehouseIds.map((w) => lookup.warehouse(w)?.checkpointId).filter(Boolean) as string[]);
  const points = $derived<MapPoint[]>(myCps.map((id) => { const c = lookup.checkpoint(id)!; return { id, lat: c.lat, lng: c.lng, label: cpShort(id), state: 'place' as const }; }));
  const trucks = $derived<MapTruck[]>(incoming.map((v) => ({ id: v.leg.id, ...legPosition(v.leg), label: v.truck?.reg ?? '', late: v.eta.state === 'Late' })));
  const isFinal = (i: Item) => lookup.warehouse(i.shipment.warehouseId)?.checkpointId === i.leg.toId;
  const total = (l: Leg) => l.lines.reduce((a, x) => a + x.loadedQty, 0);

  async function receive(d: { lines: { productId: string; expected: number; received: number; damaged: number; remarks: string }[]; receiverName: string; signature: string; photos: string[] }) {
    if (!receiving) return;
    const r = await outbox.send('leg.acknowledge', { legId: receiving.leg.id, input: { receiverName: d.receiverName, lines: d.lines, signature: d.signature, photos: d.photos } });
    const final = isFinal(receiving); const at = cpShort(receiving.leg.toId);
    receiving = null; haptic('success');
    say(r.queued ? 'Signed — saved on the phone, sends when there is signal' : final ? 'Delivery received — thank you' : `Received into stock at ${at} — send it on as a new shipment when the truck is ready`);
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
<TopBar onmenu={shell ? undefined : () => (menu = true)} title={user.warehouseIds.map((w) => warehouseLabel(w)).join(' · ')} />

<Sheet bind:el={sheetEl}>
  <nav class="tools" aria-label="Warehouse">
    {#if can('warehouse-expenses')}<button onclick={() => (tool = 'expense')}><Receipt size={20} />Expense</button>{/if}
    {#if can('warehouse-stock')}<button onclick={() => (tool = 'stock')}><ClipboardCheck size={20} />Stock count</button>{/if}
    {#if user.roles.includes('reexport')}<button onclick={() => (tool = 'reexport')}><ArrowRightLeft size={20} />Re-export</button>{/if}
  </nav>
  {#if incomingAll && !shell}
    {#await glance then m}<m.default {user} {incoming} rev={toolRev} onreceive={(v: Item) => (receiving = v)} ontool={(t: keyof typeof TOOLS) => (tool = t)} />{/await}
  {/if}
  {#if !incomingAll}
    <div class="skeleton" style="height:24px;width:60%"></div><div class="skeleton" style="height:64px"></div>
  {:else if !job}
    <p class="eyebrow">Nothing on the way</p>
    <p class="headline">No trucks coming</p>
    <p class="subline">When a truck is loaded for {user.warehouseIds.map((w) => warehouseLabel(w)).join(' or ')}, you'll see it here with its arrival time.</p>
  {:else}
    {@const { shipment, leg } = job.item}
    {@const eta = job.item.eta}
    {@const t = job.item.truck}
    <CompanyChip entityId={shipment.entityId} />
    {#if job.kind === 'receive'}
      <p class="eyebrow">Arrived at {cpShort(leg.toId)}</p>
      <p class="headline">{t?.reg} is here</p>
      <p class="subline">{cases(total(leg))} · {job.item.driver?.name} · {shipment.ref}</p>
      <button class="btn btn-accent btn-lg btn-block" onclick={() => (receiving = job.item)}>Receive & sign</button>
    {:else if job.kind === 'send'}
      <p class="eyebrow">New shipment from {cpShort(leg.fromId)} · {job.item.route?.name}</p>
      <p class="headline">{t?.reg} to {cpShort(leg.toId)}</p>
      <p class="subline">{cases(total(leg))} from stock · {job.item.driver?.name} · {shipment.ref}</p>
      <button class="btn btn-accent btn-lg btn-block" onclick={() => (sending = job.item)}>Load & hand over</button>
    {:else}
      <p class="eyebrow">Next truck · {job.item.route?.name}</p>
      <div class="row">
        <p class="headline grow">{t?.reg}</p>
        <Badge status={eta.state}>{eta.state}{eta.state !== 'On time' ? ` ${hoursLabel(eta.hours)}` : ''}</Badge>
      </div>
      <p class="subline">Arrives {fmtDateTime(eta.eta)} · {cases(total(leg))}</p>
      <button class="btn btn-secondary btn-lg btn-block" onclick={() => (receiving = job.item)}>It's here — receive now</button>
    {/if}
    {#if toLoadMore.length && !shell}
      <p class="eyebrow list-head">Ready to load here</p>
      <ul class="others">
        {#each toLoadMore.slice(0, 2) as o (o.leg.id)}
          <li><button onclick={() => (sending = o)}><CompanyDot entityId={o.shipment.entityId} /><span class="grow"><strong>{o.truck?.reg}</strong> <span class="caption">to {cpShort(o.leg.toId)} · {cases(total(o.leg))}</span></span><span class="caption load">Load & hand over</span><ChevronRight size={18} /></button></li>
        {/each}
      </ul>
    {/if}
    {#if others.length && !shell}
      <ul class="others">
        {#each others.slice(0, 2) as o (o.leg.id)}
          {@const e = o.eta}
          <li><button onclick={() => (receiving = o)}><CompanyDot entityId={o.shipment.entityId} /><span class="grow"><strong>{o.truck?.reg}</strong> <span class="caption">· {cases(total(o.leg))}</span></span><span class="caption">{arrivedNow(o.leg) ? 'Arrived' : fmtDateTime(e.eta)}</span><ChevronRight size={18} /></button></li>
        {/each}
      </ul>
    {/if}
  {/if}
</Sheet>

{#if receiving}
  <ReceiveSheet entityId={receiving.shipment.entityId} leg={receiving.leg} {user} isFinal={isFinal(receiving)} onsubmit={receive} onclose={() => (receiving = null)} />
{/if}
{#if sending}
  <HandoverSheet entityId={sending.shipment.entityId} title="Hand over" subtitle="New shipment {sending.shipment.ref} · {sending.route?.name}"
    trucks={[{ truckId: sending.leg.truckId, driverId: sending.leg.driverId }]}
    lines={sending.leg.lines.map((l, i) => ({ key: String(i), productId: l.productId, qty: l.loadedQty }))}
    editable={false} qtyLabel="good on receipt" onsubmit={sendOn} onclose={() => (sending = null)} />
{/if}
{#if menu}<MenuSheet {user} {onlogout} onclose={() => (menu = false)} />{/if}
{#if tool}
  {#await TOOLS[tool]() then m}<m.default {user} onclose={() => { tool = null; toolRev = toolRev + 1; load(); }} />{:catch}<p class="sr-only">Couldn't open — check the connection</p>{/await}
{/if}

<style>
  .row { display: flex; align-items: center; gap: var(--space-3); }
  .tools { display: flex; gap: var(--space-2); margin-bottom: var(--space-2); }
  .tools button { flex: 1; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-sunken); color: var(--text); font: 600 14px var(--ff-body); cursor: pointer; }
  .grow { flex: 1; min-width: 0; }
  .list-head { margin: var(--space-3) 0 0; }
  .load { color: var(--accent-text, var(--accent)); font-weight: 600; }
  .others { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
  .others button { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 52px; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; padding: 0; }
</style>
