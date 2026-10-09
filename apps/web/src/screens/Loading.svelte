<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { loading, lookup, pos, queue as q, ref, shipments, type Loading, type PurchaseOrder, type Shipment, type User, type WaitingEntry } from '@btw/api';
  import { Badge, ago, fmtDateTime, fmtNum, say, router } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import X from '@lucide/svelte/icons/x';
  let { user }: { user: User } = $props();

  const r = ref();
  const points = $derived(user.roles.includes('loader') && !user.roles.some((x) => ['director', 'admin', 'planner'].includes(x))
    ? r.suppliers.filter((s) => user.loadingPointIds.includes(s.id)) : r.suppliers);
  let lp = $state('');
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
  const poRef = (id: string) => poList.find((p) => p.id === id)?.ref ?? id;

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
        await loading.addWaiting(lp, addTruck, addDriver);
      } else await q.addMarketTruck(lp, $state.snapshot(mk));
      addDlg?.close(); say('Truck added to the end of the waiting list');
    } catch (e) { addErr = (e as Error).message; }
  }
  async function move(w: WaitingEntry, dir: -1 | 1) { await q.move(w.id, dir); }
  async function drop(w: WaitingEntry) { if (window.confirm(`Remove ${lookup.truck(w.truckId)?.reg} from the queue?`)) { await q.remove(w.id); say('Removed from the waiting list'); } }

  // Record loading
  let recDlg = $state<HTMLDialogElement>();
  let cur = $state<Loading | null>(null);
  let truckId = $state(''); let driverId = $state('');
  let qty = $state<Record<string, number>>({});
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
    recErr = ''; transport = 0; docs = { 'Delivery note': '', Invoice: '', 'Gate pass': '' };
    recDlg?.showModal();
  }
  const total = $derived(Object.values(qty).reduce((a, b) => a + (+b || 0), 0));
  const cap = $derived(lookup.truck(truckId)?.capacityCases ?? 0);
  async function confirm() {
    recErr = '';
    if (!transport) { recErr = 'Enter the agreed transport price (§17.5)'; return; }
    busy = true;
    try {
      const sh = await loading.confirm(cur!.id, { truckId, driverId, loadedQty: $state.snapshot(qty), agreedTransport: transport, documents: Object.entries(docs).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`) });
      recDlg?.close(); say(`Loading confirmed — ${sh.ref} created`); router.go(`/shipments/${sh.id}`);
    } catch (e) { recErr = (e as Error).message; } finally { busy = false; }
  }
</script>

<div class="page-head">
  <div><div class="overline crumb">Logistics</div><h1>Loading & waiting list</h1>
    <p class="muted small">Trucks queue at each supplier loading point; the loader takes the next truck in line for each PO truck line (LD-01, §17.4).</p></div>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="tabs" role="tablist">
  {#each points as p}<button role="tab" aria-selected={lp === p.id} onclick={() => (lp = p.id)}>{p.code} {p.city}</button>{/each}
</div>

<div class="grid grid-2">
  <section class="card flush">
    <header><div><h3>Truck waiting list</h3><div class="caption">Queue at {lookup.supplier(lp)?.code} — first in, first loaded</div></div><button class="btn btn-secondary btn-sm" onclick={openAdd}><Plus size={16} />Add truck</button></header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th class="num">#</th><th>Provider – Truck</th><th>Driver</th><th>Waiting</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>
        {#each queue as w, i (w.id)}
          {@const t = lookup.truck(w.truckId)}
          {@const pr = t ? lookup.provider(t.providerId) : undefined}
          <tr>
            <td class="num"><strong>{i + 1}</strong></td>
            <td><strong>{t?.reg}</strong> <span class="caption">/ {t?.trailer}</span><div class="caption">{pr?.name} {#if pr && !pr.regular}<Badge tone="warning">Market</Badge>{/if}</div></td>
            <td>{lookup.driver(w.driverId)?.name}{#if !lookup.driver(w.driverId)?.hasApp}<div class="caption">No app — SMS updates</div>{/if}</td>
            <td class="small" title={fmtDateTime(w.arrivedAt)}>{ago(w.arrivedAt)}<div class="caption">since {fmtDateTime(w.arrivedAt)}</div></td>
            <td><div class="acts">
              <button class="btn btn-ghost btn-sm" aria-label="Move {t?.reg} up" disabled={i === 0} onclick={() => move(w, -1)}><ArrowUp size={16} /></button>
              <button class="btn btn-ghost btn-sm" aria-label="Move {t?.reg} down" disabled={i === queue.length - 1} onclick={() => move(w, 1)}><ArrowDown size={16} /></button>
              <button class="btn btn-ghost btn-sm" aria-label="Remove {t?.reg} from queue" onclick={() => drop(w)}><X size={16} /></button>
            </div></td>
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
            <td><button class="btn btn-accent btn-sm" onclick={() => openRecord(l)}>Record loading</button></td>
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
          {#each ref().providers as p}<optgroup label="{p.name}{p.regular ? '' : ' — market'}">{#each ref().trucks.filter((t) => t.providerId === p.id) as t}<option value={t.id} disabled={queuedIds.has(t.id)}>{t.reg} / {t.trailer} · {fmtNum(t.capacityCases)} cases{queuedIds.has(t.id) ? ' (already queued)' : ''}</option>{/each}</optgroup>{/each}
        </select></label>
      <label class="field"><span>Driver</span><select class="select" bind:value={addDriver}>{#each ref().drivers as d}<option value={d.id}>{d.name} · {d.phone}{d.hasApp ? '' : ' · no app'}</option>{/each}</select></label>
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
              <td class="num"><input class="input num" type="number" min="0" bind:value={qty[x.planLineId]} style="width:110px" /></td>
              <td class="num">{#if v}<Badge tone={v < 0 ? 'warning' : 'info'}>{v > 0 ? '+' : ''}{fmtNum(v)}</Badge>{:else}<span class="caption">—</span>{/if}</td></tr>
          {/each}
          <tr class="subtotal"><td>Total {#if total > cap}<Badge tone="danger">Over capacity {fmtNum(cap)}</Badge>{/if}</td><td class="num">{fmtNum(cur.lines.reduce((a, x) => a + x.orderedQty, 0))}</td><td class="num">{fmtNum(total)}</td><td></td></tr>
        </tbody>
      </table></div>
      <div class="cap small" class:over={total > cap}><span>Truck capacity <strong class="num">{fmtNum(cap)}</strong> cases</span><span>Loading <strong class="num">{fmtNum(total)}</strong></span><span>{total > cap ? `Over by ${fmtNum(total - cap)}` : `${fmtNum(cap - total)} spare`}</span></div>
      <label class="field"><span>Agreed transport price (USD)</span><input class="input num" type="number" min="0" step="0.01" bind:value={transport} /><span class="help">Carried to trip financials as the transport cost (§17.5).</span></label>
      <div class="stack-sm">
        <span class="label">Supplier documents (LD-04)</span>
        {#each Object.keys(docs) as k}
          <label class="row small"><span style="width:110px">{k}</span><input class="input grow" type="file" accept="image/*,application/pdf" onchange={(e) => (docs[k] = (e.currentTarget as HTMLInputElement).files?.[0]?.name ?? '')} /></label>
        {/each}
      </div>
      {#if recErr}<p class="alert-err" role="alert">{recErr}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => recDlg?.close()}>Cancel</button><button class="btn btn-accent" disabled={busy} onclick={confirm}>Confirm loading</button></div>
    </div>
  {/if}
</dialog>

<style>
  .alert-err { margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--danger-subtle); color: var(--danger); font-weight: 600; }
  .acts { display: flex; gap: 2px; justify-content: flex-end; }
  .mono { white-space: nowrap; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .cap { display: flex; gap: var(--space-4); flex-wrap: wrap; justify-content: space-between; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--surface-sunken); }
  .cap.over { background: var(--danger-subtle); color: var(--danger); }
  dialog.wide { width: min(720px, calc(100vw - 32px)); }
</style>
