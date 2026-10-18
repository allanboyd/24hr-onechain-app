<script lang="ts">
  import RecordFor from '../components/RecordFor.svelte';
  import { scopeEntity } from '../lib/company.svelte';
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { loading, lookup, pos, queue as q, ref, shipments, type Loading, type PurchaseOrder, type Shipment, type User, type WaitingEntry } from '@btw/api';
  import { Badge, ago, fmtDateTime, fmtNum, say, router } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import X from '@lucide/svelte/icons/x';
  import PageTabs from '../components/PageTabs.svelte';
  import LoadingOverview from '../components/overview/LoadingOverview.svelte';
  import { currentTab, qp } from '../lib/tab';
  import { defaultConfig, loadingCheck, QUEUE_EDITORS, QUEUE_REMOVE_REASONS, seesLoadingPoint } from '@btw/api/rules';
  import { waitLabel } from '@btw/api/trucks';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import type { LoadingAlternative } from '@btw/api';
  import Minus from '@lucide/svelte/icons/minus';
  let { user }: { user: User } = $props();
  const tab = currentTab();

  const r = ref();
  // Loading points this user works (same rule as the API): office roles all; loaders and truck planners their own.
  const points = $derived(r.suppliers.filter((s) => user.roles.some((x) => x === 'director' || x === 'admin') || seesLoadingPoint(user, s.id)));
  const canQueue = $derived(user.roles.some((x) => QUEUE_EDITORS.includes(x)));
  const LONG_WAIT_H = 24;
  const waitH = (w: WaitingEntry) => Math.max(0, (Date.now() - Date.parse(w.arrivedAt)) / 36e5);
  let lp = $state(qp('lp'));
  $effect(() => { if (!lp && points.length) lp = points[0].id; });

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
  const shipmentFor = (l: Loading) => shipList.find((sh) => sh.poId === l.poId && sh.truckNo === l.truckNo);
  const w = watch(load, () => lp);

  const queue = $derived(waiting.filter((w) => w.status === 'Waiting'));
  const pending = $derived(loadings.filter((l) => l.status === 'Pending'));
  const done = $derived(loadings.filter((l) => l.status === 'Loaded').slice(-5).reverse());
  const poRef = (id: string) => poList.find((p) => p.id === id)?.ref ?? loadings.find((l) => l.poId === id)?.poRef ?? id;
  const poEntity = (l: { poId: string; entityId?: string }) => l.entityId ?? poList.find((p) => p.id === l.poId)?.entityId;

  // Add to queue
  let addDlg = $state<HTMLDialogElement>();
  let addMode = $state<'known' | 'market'>('known');
  let addTruck = $state(''); let addDriver = $state('');
  let mk = $state({ company: '', reg: '', trailer: '', capacityCases: 2000, driverName: '', driverPhone: '' });
  const queuedIds = $derived(new Set(queue.map((w) => w.truckId)));
  function openAdd() {
    const free = ref().trucks.find((t) => !queuedIds.has(t.id)) ?? ref().trucks[0];
    addMode = 'known'; addTruck = free.id; addDriver = free.defaultDriverId ?? ref().drivers[0].id;
    mk = { company: '', reg: '', trailer: '', capacityCases: 2000, driverName: '', driverPhone: '' };
    addErr = '';
    addDlg?.showModal();
  }
  let addErr = $state('');
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
  async function move(w: WaitingEntry, dir: -1 | 1) { await q.move(w.id, dir); say(`${lookup.truck(w.truckId)?.reg} moved ${dir < 0 ? 'up' : 'down'} — the loader is told`); }
  async function moveTo(w: WaitingEntry, position: number) {
    if (!position || position === queue.indexOf(w) + 1) return;
    try { await q.moveTo(w.id, position); say(`${lookup.truck(w.truckId)?.reg} is now #${position} — the loader is told`); } catch (e) { say((e as Error).message); }
  }
  // Drag a row onto another to put it in that place.
  let dragId = $state<string | null>(null); let overId = $state<string | null>(null);
  function dropOn(target: WaitingEntry) { const w = queue.find((x) => x.id === dragId); dragId = null; overId = null; if (w && w.id !== target.id) moveTo(w, queue.indexOf(target) + 1); }
  // Remove with a reason (shown to the loader, kept in the audit log)
  let rmDlg = $state<HTMLDialogElement>(); let rmEntry = $state<WaitingEntry | null>(null); let rmReason = $state<string>(QUEUE_REMOVE_REASONS[0]); let rmNote = $state(''); let rmErr = $state('');
  function drop(w: WaitingEntry) { rmEntry = w; rmReason = QUEUE_REMOVE_REASONS[0]; rmNote = ''; rmErr = ''; rmDlg?.showModal(); }
  async function confirmDrop(e: Event) {
    e.preventDefault();
    const why = rmReason === 'Other' ? rmNote.trim() : `${rmReason}${rmNote.trim() ? ` — ${rmNote.trim()}` : ''}`;
    if (!why) { rmErr = 'Say why the truck leaves the queue'; return; }
    try { await q.remove(rmEntry!.id, why.slice(0, 200)); rmDlg?.close(); say('Removed from the waiting list — the loader sees why'); } catch (err) { rmErr = (err as Error).message; }
  }

  // Record loading
  let recDlg = $state<HTMLDialogElement>();
  let cur = $state<Loading | null>(null);
  let truckId = $state(''); let driverId = $state('');
  let qty = $state<Record<string, number>>({});
  // Loading against the PO (config.toml [loading]): ± allowance on the truck total, optional alternatives, auto PO revision.
  const cfg = r.config?.loading ?? defaultConfig.loading;
  let alts = $state<LoadingAlternative[]>([]);
  let altOpen = $state(false);
  let altProduct = $state(''); let altQty = $state(0); let altFor = $state('');
  const supplierProducts = $derived(cur ? r.products.filter((p) => p.supplierId === cur!.loadingPointId) : []);
  const check = $derived(cur ? loadingCheck(cur.lines, qty, alts, lookup.truck(truckId)?.capacityCases ?? 0, cfg, { supplierId: cur.loadingPointId, products: r.products }) : null);
  const step = (id: string, d: number) => { qty[id] = Math.max(0, (+qty[id] || 0) + d); };
  function addAlt() {
    if (!altProduct || !(altQty > 0)) return;
    alts.push({ productId: altProduct, qty: Math.round(altQty), ...(altFor ? { replacesPlanLineId: altFor } : {}) });
    if (altFor && !(+qty[altFor] > 0)) qty[altFor] = 0;
    altOpen = false; altProduct = ''; altQty = 0; altFor = '';
  }
  function missing(id: string) { qty[id] = 0; altFor = id; altQty = cur?.lines.find((x) => x.planLineId === id)?.orderedQty ?? 0; altOpen = true; }
  let transport = $state(0);
  let docs = $state<Record<string, string>>({ 'Delivery note': '', Invoice: '', 'Gate pass': '' });
  let busy = $state(false);
  let recErr = $state('');
  function openRecord(l: Loading) {
    cur = l;
    const top = queue[0];
    truckId = top?.truckId ?? r.trucks[0].id;
    driverId = top?.driverId ?? lookup.truck(truckId)?.defaultDriverId ?? r.drivers[0].id;
    qty = Object.fromEntries(l.lines.map((x) => [x.planLineId, x.orderedQty]));
    alts = []; altOpen = false; altProduct = ''; altQty = 0; altFor = '';
    recErr = ''; transport = 0; docs = { 'Delivery note': '', Invoice: '', 'Gate pass': '' };
    recDlg?.showModal();
  }
  const total = $derived(check?.loaded ?? 0);
  const cap = $derived(lookup.truck(truckId)?.capacityCases ?? 0);
  async function confirm() {
    recErr = '';
    if (!transport) { recErr = 'Enter the agreed transport price (§17.5)'; return; }
    if (check?.error) { recErr = check.error; return; }
    busy = true;
    try {
      const sh = await loading.confirm(cur!.id, { truckId, driverId, loadedQty: $state.snapshot(qty), alternatives: $state.snapshot(alts), agreedTransport: transport, documents: Object.entries(docs).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`) });
      recDlg?.close(); say(`Loading confirmed — ${sh.ref} created${check?.deviates && cur?.nextRevisionRef ? ` · PO revised → ${cur.nextRevisionRef}` : ''}`); router.go(`/shipments/${sh.id}`);
    } catch (e) { recErr = (e as Error).message; } finally { busy = false; }
  }
</script>

<div class="page-head">
  <div><div class="overline crumb">Logistics</div><h1>Loading & waiting list</h1>
    <p class="muted small">Trucks queue at each supplier loading point; the loader takes the next truck in line for each PO truck line (LD-01, §17.4).</p></div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<PageTabs base="/loading" current={tab} listLabel="Queue & loading" />

{#if tab === 'overview'}
  <LoadingOverview {points} />
{:else}

<div class="tabs" role="tablist">
  {#each points as p}<button role="tab" aria-selected={lp === p.id} onclick={() => (lp = p.id)}>{p.code} {p.city}</button>{/each}
</div>

<div class="grid grid-2">
  <section class="card flush">
    <header><div><h3>Truck waiting list</h3><div class="caption">Queue at {lookup.supplier(lp)?.code} — first in, first loaded{#if canQueue && queue.length > 1} · drag a row or pick a place to reorder{/if}</div></div>{#if canQueue}<RecordFor what="a truck" cue={false}><button class="btn btn-secondary btn-sm" onclick={openAdd}><Plus size={16} />Add truck</button></RecordFor>{/if}</header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th class="num">#</th><th>Provider – Truck</th><th>Driver</th><th>Waiting</th>{#if canQueue}<th><span class="sr-only">Actions</span></th>{/if}</tr></thead>
      <tbody>
        {#each queue as w, i (w.id)}
          {@const t = lookup.truck(w.truckId)}
          {@const pr = t ? lookup.provider(t.providerId) : undefined}
          {@const h = waitH(w)}
          <tr draggable={canQueue} class:dragging={dragId === w.id} class:over={overId === w.id && dragId !== w.id}
            ondragstart={(e) => { dragId = w.id; e.dataTransfer?.setData('text/plain', w.id); }} ondragover={(e) => { if (dragId) { e.preventDefault(); overId = w.id; } }} ondragleave={() => { if (overId === w.id) overId = null; }} ondrop={(e) => { e.preventDefault(); dropOn(w); }} ondragend={() => { dragId = null; overId = null; }}>
            <td class="num">{#if canQueue}<span class="grip" aria-hidden="true"><GripVertical size={14} /></span>{/if}<strong>{i + 1}</strong></td>
            <td><strong>{t?.reg}</strong> <span class="caption">/ {t?.trailer}</span><div class="caption">{pr?.name} {#if pr && !pr.regular}<Badge tone="warning">Market</Badge>{/if}</div></td>
            <td>{lookup.driver(w.driverId)?.name}{#if !lookup.driver(w.driverId)?.hasApp}<div class="caption">No app — SMS updates</div>{/if}</td>
            <td class="small" title={fmtDateTime(w.arrivedAt)}><strong class:long={h > LONG_WAIT_H}>{waitLabel(h)}</strong>{#if h > LONG_WAIT_H} <Badge tone="warning">long wait</Badge>{/if}<div class="caption">since {fmtDateTime(w.arrivedAt)}</div></td>
            {#if canQueue}<td><div class="acts">
              <button class="btn btn-ghost btn-sm" aria-label="Move {t?.reg} up" disabled={i === 0} onclick={() => move(w, -1)}><ArrowUp size={16} /></button>
              <button class="btn btn-ghost btn-sm" aria-label="Move {t?.reg} down" disabled={i === queue.length - 1} onclick={() => move(w, 1)}><ArrowDown size={16} /></button>
              {#if queue.length > 2}<select class="select pos" aria-label="Move {t?.reg} to place" value={i + 1} onchange={(e) => moveTo(w, Number((e.currentTarget as HTMLSelectElement).value))}>{#each queue as _, k}<option value={k + 1}>#{k + 1}</option>{/each}</select>{/if}
              <button class="btn btn-ghost btn-sm" aria-label="Remove {t?.reg} from queue" onclick={() => drop(w)}><X size={16} /></button>
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
          <tr>
            <td class="mono"><a href="#/pos/{l.poId}">{poRef(l.poId)}</a></td>
            <td class="num"><strong>{l.truckNo}</strong></td>
            <td class="small">{#each l.lines as x}<div>{lookup.product(x.productId)?.brand} · {lookup.product(x.productId)?.pack} — <span class="num">{fmtNum(x.orderedQty)}</span></div>{/each}</td>
            <td><RecordFor entityId={poEntity(l)} cue={false}><button class="btn btn-accent btn-sm" onclick={() => openRecord(l)}>Record loading</button></RecordFor></td>
          </tr>
        {:else}<tr><td colspan="4" class="empty">{ready ? 'Nothing to load here — new lines appear when a plan for this supplier is approved' : 'Loading…'}</td></tr>{/each}
      </tbody>
    </table></div>
    {#if done.length}
      <div style="padding:var(--space-4) var(--space-5)" class="stack-sm">
        <div class="overline">Recently loaded</div>
        {#each done as l}{@const sh = shipmentFor(l)}<div class="row between small"><span><span class="mono">{poRef(l.poId)}</span> · Truck {l.truckNo} · {lookup.truck(l.truckId)?.reg}{#if sh} · <a href="#/shipments/{sh.id}" class="mono">{sh.ref}</a>{/if}</span>{#if sh}<Badge status={sh.status} />{:else}<Badge status="Loaded" />{/if}</div>{/each}
      </div>
    {/if}
  </section>
</div>

{/if}

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
          {#each ref().providers.filter((p) => p.active !== false) as p}<optgroup label="{p.name}{p.regular ? '' : ' — market'}">{#each ref().trucks.filter((t) => t.providerId === p.id && t.active !== false) as t}<option value={t.id} disabled={queuedIds.has(t.id)}>{t.reg} / {t.trailer} · {fmtNum(t.capacityCases)} cases{queuedIds.has(t.id) ? ' (already queued)' : ''}</option>{/each}</optgroup>{/each}
        </select></label>
      <label class="field"><span>Driver</span><select class="select" bind:value={addDriver}>{#each ref().drivers.filter((d) => d.active !== false) as d}<option value={d.id}>{d.name} · {d.phone}{d.hasApp ? '' : ' · no app'}</option>{/each}</select></label>
    {:else}
      <p class="caption">Hired from the market when regular trucks are not available. Recorded with company, truck, trailer and driver (§17.4); the driver gets SMS check-ins.</p>
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

<dialog class="sheet wide" bind:this={recDlg}>
  {#if cur}
    <div class="body stack">
      <div><h3>Record loading</h3><div class="caption"><span class="mono">{poRef(cur.poId)}</span> · Truck No. {cur.truckNo} · {lookup.supplier(lp)?.name}</div></div>
      <div class="form-grid">
        <label class="field"><span>Truck</span>
          <select class="select" bind:value={truckId} onchange={() => (driverId = lookup.truck(truckId)?.defaultDriverId ?? driverId)}>
            {#each queue as w}<option value={w.truckId}>#{w.position} in queue · {lookup.truck(w.truckId)?.reg}</option>{/each}
            <optgroup label="Other trucks">{#each ref().trucks.filter((t) => !queue.some((w) => w.truckId === t.id)) as t}<option value={t.id}>{t.reg}</option>{/each}</optgroup>
          </select></label>
        <label class="field"><span>Driver</span><select class="select" bind:value={driverId}>{#each ref().drivers as d}<option value={d.id}>{d.name}</option>{/each}</select></label>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Brand · Package</th><th class="num">Ordered</th><th class="num">Loaded</th><th class="num">Variance</th></tr></thead>
        <tbody>
          {#each cur.lines as x}
            {@const v = (+qty[x.planLineId] || 0) - x.orderedQty}
            <tr><td>{lookup.product(x.productId)?.brand} · {lookup.product(x.productId)?.pack}</td><td class="num">{fmtNum(x.orderedQty)}</td>
              <td class="num"><div class="stepper">
                <button class="btn btn-ghost btn-sm" aria-label="10 fewer cases" onclick={() => step(x.planLineId, -10)}><Minus size={14} /></button>
                <input class="input num" type="number" min="0" aria-label="Loaded cases of {lookup.product(x.productId)?.brand}" bind:value={qty[x.planLineId]} style="width:96px" />
                <button class="btn btn-ghost btn-sm" aria-label="10 more cases" onclick={() => step(x.planLineId, 10)}><Plus size={14} /></button></div>
                {#if cfg.allowAlternatives && +qty[x.planLineId] > 0}<button class="btn btn-ghost btn-sm linkish" onclick={() => missing(x.planLineId)}>Item missing?</button>{/if}</td>
              <td class="num">{#if v}<Badge tone={v < 0 ? 'warning' : 'info'}>{v > 0 ? '+' : ''}{fmtNum(v)}</Badge>{:else}<span class="caption">—</span>{/if}</td></tr>
          {/each}
          {#each alts as a, i}
            <tr><td>{lookup.product(a.productId)?.brand} · {lookup.product(a.productId)?.pack} <Badge tone="accent">alternative</Badge>{#if a.replacesPlanLineId}<div class="caption">instead of {lookup.product(cur.lines.find((x) => x.planLineId === a.replacesPlanLineId)?.productId ?? '')?.brand}</div>{/if}</td>
              <td class="num">—</td><td class="num"><input class="input num" type="number" min="1" aria-label="Alternative cases" bind:value={a.qty} style="width:96px" /></td>
              <td class="num"><button class="btn btn-ghost btn-sm" aria-label="Remove alternative" onclick={() => alts.splice(i, 1)}><X size={14} /></button></td></tr>
          {/each}
          <tr class="subtotal"><td>Total {#if total > cap}<Badge tone="danger">Over capacity {fmtNum(cap)}</Badge>{/if}</td><td class="num">{fmtNum(cur.lines.reduce((a, x) => a + x.orderedQty, 0))}</td><td class="num">{fmtNum(total)}</td><td></td></tr>
        </tbody>
      </table></div>
      {#if cfg.allowAlternatives}
        {#if altOpen}
          <div class="alt card stack-sm">
            <strong class="small">Load an alternative from {lookup.supplier(cur.loadingPointId)?.code}'s price list</strong>
            <div class="form-grid">
              <label class="field"><span>Product</span><select class="select" bind:value={altProduct}><option value="">Choose…</option>{#each supplierProducts as p (p.id)}<option value={p.id}>{p.brand} · {p.pack}</option>{/each}</select></label>
              <label class="field"><span>Cases</span><input class="input num" type="number" min="1" bind:value={altQty} /></label>
              <label class="field"><span>Replaces (optional)</span><select class="select" bind:value={altFor}><option value="">— nothing, extra</option>{#each cur.lines as x}<option value={x.planLineId}>{lookup.product(x.productId)?.brand} · {lookup.product(x.productId)?.pack}</option>{/each}</select></label>
            </div>
            <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick={() => (altOpen = false)}>Cancel</button><button class="btn btn-secondary btn-sm" disabled={!altProduct || !(altQty > 0)} onclick={addAlt}>Add alternative</button></div>
          </div>
        {:else}<button class="btn btn-ghost btn-sm" style="align-self:flex-start" onclick={() => (altOpen = true)}><Plus size={14} />Item missing? Load an alternative</button>{/if}
      {/if}
      {#if check}
        {@const span = Math.max(check.max * 1.15, check.capacity, check.loaded, 1)}
        <div class="meter" class:bad={!!check.error} role="group" aria-label="Loading allowance">
          <div class="row between small"><span>Ordered <strong class="num">{fmtNum(check.ordered)}</strong> · loading <strong class="num">{fmtNum(check.loaded)}</strong> ({check.diffPct > 0 ? '+' : ''}{check.diffPct}%)</span><span>Allowed ±{check.allowancePct}%: {fmtNum(check.min)}–{fmtNum(check.max)} · capacity {fmtNum(check.capacity)}</span></div>
          <div class="bar" aria-hidden="true">
            <span class="band" style:left="{(check.min / span) * 100}%" style:width="{((Math.min(check.max, check.capacity || check.max) - check.min) / span) * 100}%"></span>
            {#if check.capacity}<span class="capmark" style:left="{(check.capacity / span) * 100}%"></span>{/if}
            <span class="fill" style:width="{Math.min(100, (check.loaded / span) * 100)}%"></span>
          </div>
          {#if check.error}<p class="small err">{check.error}</p>
          {:else if check.deviates}<p class="small">Differs from the PO — this will create <strong class="mono">{cur.nextRevisionRef ?? 'a PO revision'}</strong> (no approval needed).</p>
          {:else}<p class="small muted">Exactly as ordered — no PO revision.</p>{/if}
        </div>
      {/if}
      <label class="field"><span>Agreed transport price (USD)</span><input class="input num" type="number" min="0" step="0.01" bind:value={transport} /><span class="help">Carried to trip financials as the transport cost (§17.5).</span></label>
      <div class="stack-sm">
        <span class="label">Supplier documents (LD-04)</span>
        {#each Object.keys(docs) as k}
          <label class="row small"><span style="width:110px">{k}</span><input class="input grow" type="file" accept="image/*,application/pdf" onchange={(e) => (docs[k] = (e.currentTarget as HTMLInputElement).files?.[0]?.name ?? '')} /></label>
        {/each}
      </div>
      {#if recErr}<p class="alert-err" role="alert">{recErr}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => recDlg?.close()}>Cancel</button><button class="btn btn-accent" disabled={busy || !!check?.error} onclick={confirm}>Confirm loading</button></div>
    </div>
  {/if}
</dialog>

<style>
  .alert-err { margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--danger-subtle); color: var(--danger); font-weight: 600; }
  .acts { display: flex; gap: 2px; justify-content: flex-end; align-items: center; }
  .select.pos { width: 72px; height: 32px; padding-top: 0; padding-bottom: 0; }
  .grip { display: inline-flex; color: var(--text-subtle); cursor: grab; margin-right: 4px; vertical-align: middle; }
  tr[draggable='true'] { cursor: grab; }
  tr.dragging { opacity: 0.5; }
  tr.over td { box-shadow: inset 0 2px 0 var(--accent); }
  .long { color: var(--warning); }
  .mono { white-space: nowrap; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  dialog.wide { width: min(720px, calc(100vw - 32px)); }
  .stepper { display: inline-flex; align-items: center; gap: 2px; }
  .linkish { font-size: 12px; }
  .alt { padding: var(--space-3) var(--space-4); background: var(--surface-sunken); }
  .meter { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-sunken); }
  .meter p { margin: 0; }
  .meter.bad { background: var(--danger-subtle); }
  .meter .err { color: var(--danger); font-weight: 600; }
  .bar { position: relative; height: 10px; border-radius: 5px; background: var(--border); overflow: hidden; }
  .bar .band { position: absolute; top: 0; bottom: 0; background: var(--success-subtle, #cdebd6); }
  .bar .fill { position: absolute; left: 0; top: 3px; height: 4px; background: var(--primary); border-radius: 2px; }
  .meter.bad .bar .fill { background: var(--danger); }
  .bar .capmark { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--danger); }
</style>
