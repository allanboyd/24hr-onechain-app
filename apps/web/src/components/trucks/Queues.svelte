<script lang="ts">
  // Truck desk · Queues (was "Loading & waiting list"): per loading point, the truck waiting list (first in, first
  // loaded — reorder, remove with a reason, add a regular or market truck) and the PO truck lines waiting to be loaded.
  // Access as the API: queues — truck planners anywhere, planners on their pairs' points, loaders at their own points;
  // loadings are recorded by the loaders of that point (and the truck follow-up officer at GBI); directors view.
  import { loading, lookup, pos, queue as q, ref, shipments, type Loading, type PurchaseOrder, type Shipment, type User, type WaitingEntry } from '@btw/api';
  import { QUEUE_REMOVE_REASONS, seesLoadingPoint } from '@btw/api/rules';
  import { canEditQueue, canRecordLoading } from '@btw/api/access';
  import { trucksToLoad } from '@btw/api/metrics';
  import { waitLabel } from '@btw/api/trucks';
  import { Badge, fmtDateTime, fmtNum, say } from '@btw/ui';
  import { SummaryStrip, ChipGroup, EmptyState, readQuery, writeQuery, takeIntent, type SummaryTile } from '../page';
  import RecordFor from '../RecordFor.svelte';
  import ErrorState from '../ErrorState.svelte';
  import RecordLoading from './RecordLoading.svelte';
  import { scopeEntity } from '../../lib/company.svelte';
  import { watch } from '../../lib/load.svelte';
  import { can } from '../../lib/features';
  import { queueTiles, infoOf } from '../../lib/tiles';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import X from '@lucide/svelte/icons/x';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  let { user, lp = $bindable(readQuery('lp')) }: { user: User; lp?: string } = $props();

  const r = ref();
  // Loading points this user works (same rule as the API): office roles all; loaders and truck planners their own.
  // A pair-scoped planner (Kabonge) sees the points of his pairs only; the user's own loading points come first.
  const points = $derived(r.suppliers.filter((s) => (user.roles.some((x) => x === 'director' || x === 'admin') || seesLoadingPoint(user, s.id))
    && (!user.roles.includes('planner') || !user.pairs?.length || user.pairs.some((p) => p.supplierId === s.id)))
    .sort((a, b) => Number(user.loadingPointIds.includes(b.id)) - Number(user.loadingPointIds.includes(a.id))));
  $effect(() => { if ((!lp || !points.some((p) => p.id === lp)) && points.length) lp = points[0].id; });
  $effect(() => { if (lp && readQuery('lp') !== lp) writeQuery({ lp }); });

  const LONG_WAIT_H = 24;
  const waitH = (w: WaitingEntry) => Math.max(0, (Date.now() - Date.parse(w.arrivedAt)) / 36e5);
  const canQueue = $derived(!!lp && canEditQueue(user, lp));
  const canRecord = $derived(!!lp && canRecordLoading(user, lp));
  // The agreed transport price is recorded after loading by the truck follow-up officer — never by a loader.
  const priceAtLoading = $derived(can(user, 'truck-expenses'));

  let waiting = $state<WaitingEntry[]>([]);
  let loadings = $state<Loading[]>([]);
  let poList = $state<PurchaseOrder[]>([]);
  let shipList = $state<Shipment[]>([]);
  let ready = $state(false);
  async function load() {
    if (!lp) return;
    [waiting, loadings, poList, shipList] = await Promise.all([loading.waiting(lp), loading.list(lp), pos.list(), shipments.list()]);
    ready = true;
  }
  const w = watch(load, () => lp);

  const queue = $derived(waiting.filter((x) => x.status === 'Waiting'));
  // docs/18: "trucks to load" = pending lines of live orders (the registry), so the list equals the tile
  const pending = $derived.by(() => { const live = new Set(trucksToLoad(loadings, poList)); return loadings.filter((l) => live.has(l)); });
  const done = $derived(loadings.filter((l) => l.status === 'Loaded').slice(-5).reverse());
  const shipmentFor = (l: Loading) => shipList.find((sh) => sh.poId === l.poId && sh.truckNo === l.truckNo);
  const poRef = (id: string) => poList.find((p) => p.id === id)?.ref ?? loadings.find((l) => l.poId === id)?.poRef ?? id;
  const poEntity = (l: { poId: string; entityId?: string }) => l.entityId ?? poList.find((p) => p.id === l.poId)?.entityId;
  const lpLabel = $derived(lookup.supplier(lp)?.code ?? '');

  const fig = $derived(queueTiles(waiting, loadings, poList));
  const tiles = $derived<SummaryTile[]>([
    { key: 'waiting', label: 'Trucks waiting', value: ready ? fig.waiting : null, sub: lpLabel ? `at ${lpLabel}` : undefined, filter: false, info: infoOf('trucksWaiting') },
    { key: 'longest', label: 'Longest wait', value: ready ? fig.longest : null, format: (n) => (n ? waitLabel(n) : '—'), status: fig.longest > LONG_WAIT_H ? 'warn' : undefined, statusLabel: fig.longest > LONG_WAIT_H ? 'Long wait' : undefined, filter: false, info: infoOf('longestWait') },
    { key: 'toLoad', label: 'Trucks to load', value: ready ? fig.toLoad : null, sub: 'PO truck lines', filter: false, info: infoOf('trucksToLoad') },
    { key: 'loadedToday', label: 'Loaded today', value: ready ? fig.loadedToday : null, filter: false, info: infoOf('loadedToday') },
  ]);

  // ---- add to queue ----
  let addDlg = $state<HTMLDialogElement>();
  let addMode = $state<'known' | 'market'>('known');
  let addTruck = $state(''); let addDriver = $state('');
  let mk = $state({ company: '', reg: '', trailer: '', capacityCases: 2000, driverName: '', driverPhone: '' });
  let addErr = $state('');
  const queuedIds = $derived(new Set(queue.map((x) => x.truckId)));
  export function openAdd() {
    const free = r.trucks.find((t) => !queuedIds.has(t.id)) ?? r.trucks[0];
    addMode = 'known'; addTruck = free.id; addDriver = free.defaultDriverId ?? r.drivers[0].id;
    mk = { company: '', reg: '', trailer: '', capacityCases: 2000, driverName: '', driverPhone: '' };
    addErr = '';
    addDlg?.showModal();
  }
  // after a company switch from the "Add truck to queue" action (Group view), open the dialog once the queue is in
  let intentDone = false;
  $effect(() => { if (ready && !intentDone) { intentDone = true; if (takeIntent('add-truck') && canQueue) openAdd(); } });
  async function doAdd() {
    addErr = '';
    try {
      if (addMode === 'known') {
        if (queuedIds.has(addTruck)) { addErr = `${lookup.truck(addTruck)?.reg} is already in this queue`; return; }
        await loading.addWaiting(lp, addTruck, addDriver, scopeEntity());
      } else await q.addMarketTruck(lp, $state.snapshot(mk));
      addDlg?.close(); say('Truck added to the end of the waiting list');
    } catch (e) { addErr = (e as Error).message; }
  }

  // ---- reorder ----
  async function move(x: WaitingEntry, dir: -1 | 1) { await q.move(x.id, dir); say(`${lookup.truck(x.truckId)?.reg} moved ${dir < 0 ? 'up' : 'down'} — the loader is told`); }
  async function moveTo(x: WaitingEntry, position: number) {
    if (!position || position === queue.indexOf(x) + 1) return;
    try { await q.moveTo(x.id, position); say(`${lookup.truck(x.truckId)?.reg} is now #${position} — the loader is told`); } catch (e) { say((e as Error).message); }
  }
  // Drag a row onto another to put it in that place.
  let dragId = $state<string | null>(null); let overId = $state<string | null>(null);
  function dropOn(target: WaitingEntry) { const x = queue.find((y) => y.id === dragId); dragId = null; overId = null; if (x && x.id !== target.id) moveTo(x, queue.indexOf(target) + 1); }

  // ---- remove with a reason (shown to the loader, kept in the audit log) ----
  let rmDlg = $state<HTMLDialogElement>(); let rmEntry = $state<WaitingEntry | null>(null); let rmReason = $state<string>(QUEUE_REMOVE_REASONS[0]); let rmNote = $state(''); let rmErr = $state('');
  function drop(x: WaitingEntry) { rmEntry = x; rmReason = QUEUE_REMOVE_REASONS[0]; rmNote = ''; rmErr = ''; rmDlg?.showModal(); }
  async function confirmDrop(e: Event) {
    e.preventDefault();
    const why = rmReason === 'Other' ? rmNote.trim() : `${rmReason}${rmNote.trim() ? ` — ${rmNote.trim()}` : ''}`;
    if (!why) { rmErr = 'Say why the truck leaves the queue'; return; }
    try { await q.remove(rmEntry!.id, why.slice(0, 200)); rmDlg?.close(); say('Removed from the waiting list — the loader sees why'); } catch (err) { rmErr = (err as Error).message; }
  }

  let rec = $state<RecordLoading>();
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if points.length > 1}
  <div class="points"><ChipGroup label="Loading point" allowEmpty={false} bind:value={lp} options={points.map((p) => ({ value: p.id, label: `${p.code} ${p.city}` }))} /></div>
{/if}
<SummaryStrip {tiles} sync={false} label="Queue at {lpLabel || 'the loading point'}" />

{#if !points.length}
  <EmptyState title="No loading point to show" hint="Your account is not linked to a loading point yet." />
{:else}
<div class="grid grid-2">
  <section class="card flush">
    <header><div><h3>Truck waiting list</h3><div class="caption">Queue at {lpLabel} — first in, first loaded{#if canQueue && queue.length > 1} · drag a row or pick a place to reorder{/if}</div></div></header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th class="num">#</th><th>Provider – Truck</th><th class="opt">Driver</th><th>Waiting</th>{#if canQueue}<th><span class="sr-only">Actions</span></th>{/if}</tr></thead>
      <tbody>
        {#each queue as x, i (x.id)}
          {@const t = lookup.truck(x.truckId)}
          {@const pr = t ? lookup.provider(t.providerId) : undefined}
          {@const h = waitH(x)}
          <tr draggable={canQueue} class:dragging={dragId === x.id} class:over={overId === x.id && dragId !== x.id}
            ondragstart={(e) => { dragId = x.id; e.dataTransfer?.setData('text/plain', x.id); }} ondragover={(e) => { if (dragId) { e.preventDefault(); overId = x.id; } }} ondragleave={() => { if (overId === x.id) overId = null; }} ondrop={(e) => { e.preventDefault(); dropOn(x); }} ondragend={() => { dragId = null; overId = null; }}>
            <td class="num">{#if canQueue}<span class="grip" aria-hidden="true"><GripVertical size={14} /></span>{/if}<strong>{i + 1}</strong></td>
            <td><strong>{t?.reg}</strong> <span class="caption">/ {t?.trailer}</span><div class="caption">{pr?.name} {#if pr && !pr.regular}<Badge tone="warning">Market</Badge>{/if}</div><div class="caption phone">{lookup.driver(x.driverId)?.name}</div></td>
            <td class="opt">{lookup.driver(x.driverId)?.name}{#if !lookup.driver(x.driverId)?.hasApp}<div class="caption">No app — SMS updates</div>{/if}</td>
            <td class="small" title={fmtDateTime(x.arrivedAt)}><strong class:long={h > LONG_WAIT_H}>{waitLabel(h)}</strong>{#if h > LONG_WAIT_H} <Badge tone="warning">long wait</Badge>{/if}<div class="caption opt">since {fmtDateTime(x.arrivedAt)}</div></td>
            {#if canQueue}<td><div class="acts">
              <button class="btn btn-ghost btn-sm" aria-label="Move {t?.reg} up" disabled={i === 0} onclick={() => move(x, -1)}><ArrowUp size={16} /></button>
              <button class="btn btn-ghost btn-sm" aria-label="Move {t?.reg} down" disabled={i === queue.length - 1} onclick={() => move(x, 1)}><ArrowDown size={16} /></button>
              {#if queue.length > 2}<select class="select pos" aria-label="Move {t?.reg} to place" value={i + 1} onchange={(e) => moveTo(x, Number((e.currentTarget as HTMLSelectElement).value))}>{#each queue as _, k}<option value={k + 1}>#{k + 1}</option>{/each}</select>{/if}
              <button class="btn btn-ghost btn-sm" aria-label="Remove {t?.reg} from queue" onclick={() => drop(x)}><X size={16} /></button>
            </div></td>{/if}
          </tr>
        {:else}<tr><td colspan="5" class="empty">{ready ? 'No trucks waiting at this loading point' : 'Loading…'}</td></tr>{/each}
      </tbody>
    </table></div>
  </section>

  <section class="card flush">
    <header><div><h3>Waiting to be loaded</h3><div class="caption">Truck lines from approved purchase orders</div></div></header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>PO</th><th class="num">Truck No.</th><th>Lines ordered</th><th></th></tr></thead>
      <tbody>
        {#each pending as l (l.id)}
          {@const ent = poEntity(l)}
          <tr>
            <td class="mono"><a href="#/pos/{l.poId}">{poRef(l.poId)}</a></td>
            <td class="num"><strong>{l.truckNo}</strong></td>
            <td class="small">{#each l.lines as x}<div>{lookup.product(x.productId)?.brand} · {lookup.product(x.productId)?.pack} — <span class="num">{fmtNum(x.orderedQty)}</span></div>{/each}</td>
            <td>{#if canRecord}{#if ent}<RecordFor entityId={ent} cue={false}><button class="btn btn-accent btn-sm" onclick={() => rec?.open(l, queue)}>Record loading</button></RecordFor>{:else}<button class="btn btn-accent btn-sm" onclick={() => rec?.open(l, queue)}>Record loading</button>{/if}{:else}<span class="caption">Recorded by the loader</span>{/if}</td>
          </tr>
        {:else}<tr><td colspan="4" class="empty">{ready ? 'Nothing to load here — new lines appear when a plan for this supplier is approved' : 'Loading…'}</td></tr>{/each}
      </tbody>
    </table></div>
    {#if done.length}
      <div class="recent stack-sm">
        <div class="overline">Recently loaded</div>
        {#each done as l}{@const sh = shipmentFor(l)}<div class="row between small"><span><span class="mono">{poRef(l.poId)}</span> · Truck {l.truckNo} · {lookup.truck(l.truckId)?.reg}{#if sh} · <a href="#/shipments/{sh.id}" class="mono">{sh.ref}</a>{/if}</span>{#if sh}<Badge status={sh.status} />{:else}<Badge status="Loaded" />{/if}</div>{/each}
      </div>
    {/if}
  </section>
</div>
{/if}

<RecordLoading bind:this={rec} {lp} {poRef} {priceAtLoading} />

<dialog class="sheet" bind:this={addDlg} aria-labelledby="add-title">
  <div class="body stack">
    <div><h3 id="add-title">Add truck to queue</h3><div class="caption">{lookup.supplier(lp)?.name}, {lookup.supplier(lp)?.city} — goes to the end of the line</div></div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={addMode === 'known'} onclick={() => (addMode = 'known')}>Regular / known truck</button>
      <button role="tab" aria-selected={addMode === 'market'} onclick={() => (addMode = 'market')}>New market truck</button>
    </div>
    {#if addMode === 'known'}
      <label class="field"><span>Truck</span>
        <select class="select" bind:value={addTruck} onchange={() => (addDriver = lookup.truck(addTruck)?.defaultDriverId ?? addDriver)}>
          {#each r.providers.filter((p) => p.active !== false) as p}<optgroup label="{p.name}{p.regular ? '' : ' — market'}">{#each r.trucks.filter((t) => t.providerId === p.id && t.active !== false) as t}<option value={t.id} disabled={queuedIds.has(t.id)}>{t.reg} / {t.trailer} · {fmtNum(t.capacityCases)} cases{queuedIds.has(t.id) ? ' (already queued)' : ''}</option>{/each}</optgroup>{/each}
        </select></label>
      <label class="field"><span>Driver</span><select class="select" bind:value={addDriver}>{#each r.drivers.filter((d) => d.active !== false) as d}<option value={d.id}>{d.name} · {d.phone}{d.hasApp ? '' : ' · no app'}</option>{/each}</select></label>
    {:else}
      <p class="caption">Hired from the market when regular trucks are not available. Recorded with company, truck, trailer and driver; the driver gets SMS check-ins.</p>
      <div class="form-grid">
        <label class="field"><span>Transport company</span><input class="input" bind:value={mk.company} placeholder="e.g. Company Y" /></label>
        <label class="field"><span>Capacity (cases)</span><input class="input num" type="number" min="0" bind:value={mk.capacityCases} /></label>
        <label class="field"><span>Truck registration</span><input class="input" bind:value={mk.reg} placeholder="KDC 123X" /></label>
        <label class="field"><span>Trailer</span><input class="input" bind:value={mk.trailer} placeholder="ZF 0000" /></label>
        <label class="field"><span>Driver name</span><input class="input" bind:value={mk.driverName} /></label>
        <label class="field"><span>Driver phone</span><input class="input" type="tel" bind:value={mk.driverPhone} placeholder="+254…" /></label>
      </div>
    {/if}
    {#if addErr}<p class="error" role="alert">{addErr}</p>{/if}
    <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => addDlg?.close()}>Cancel</button><button class="btn btn-primary" onclick={doAdd}>Add to queue</button></div>
  </div>
</dialog>

<dialog class="sheet" bind:this={rmDlg} aria-labelledby="rm-title">
  {#if rmEntry}
    <form class="body stack" onsubmit={confirmDrop}>
      <div><h3 id="rm-title">Remove {lookup.truck(rmEntry.truckId)?.reg} from the queue</h3><div class="caption">#{queue.indexOf(rmEntry) + 1} at {lookup.supplier(rmEntry.loadingPointId)?.code} · waiting {waitLabel(waitH(rmEntry))}. The loader sees the reason.</div></div>
      <label class="field"><span>Reason</span><select class="select" bind:value={rmReason}>{#each QUEUE_REMOVE_REASONS as x}<option>{x}</option>{/each}</select></label>
      <label class="field"><span>{rmReason === 'Other' ? 'What happened' : 'Note (optional)'}</span><input class="input" bind:value={rmNote} maxlength="150" placeholder="e.g. clutch failure, towed to Athi River" /></label>
      {#if rmErr}<p class="alert-err" role="alert">{rmErr}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => rmDlg?.close()}>Cancel</button><button class="btn btn-danger">Remove from queue</button></div>
    </form>
  {/if}
</dialog>

<style>
  .points { margin-bottom: var(--space-3); }
  .recent { padding: var(--space-4) var(--space-5); }
  .alert-err { margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--danger-subtle); color: var(--danger); font-weight: 600; }
  .error { color: var(--danger); font-weight: 600; margin: 0; }
  .acts { display: flex; gap: 2px; justify-content: flex-end; align-items: center; }
  .select.pos { width: 72px; height: 32px; padding-top: 0; padding-bottom: 0; }
  .grip { display: inline-flex; color: var(--text-subtle); cursor: grab; margin-right: 4px; vertical-align: middle; }
  tr[draggable='true'] { cursor: grab; }
  tr.dragging { opacity: 0.5; }
  tr.over td { box-shadow: inset 0 2px 0 var(--accent); }
  .long { color: var(--warning); }
  .mono { white-space: nowrap; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .phone { display: none; }
  @media (max-width: 600px) {
    .opt { display: none; }
    .phone { display: block; }
    .grip { display: none; }
    .recent { padding: var(--space-3) var(--space-4); }
  }
</style>
