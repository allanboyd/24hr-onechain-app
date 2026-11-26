<script lang="ts">
  // docs/14 B-03: re-export orders Asie → Yonas (Rwanda → Juba). Asie raises an order from her Gisenyi stock, loads it herself
  // (a truck from the list or a market truck — no prices) and it ships as a new shipment with the order's ref; Yonas
  // acknowledges it into Juba stock. Yonas sees what is coming, Testfie follows the trucks up (owner to confirm, Q3), the
  // directors see everything.
  // docs/17 Phase 1: work page with a strip (registry: open · loaded · in transit · delivered) that filters the list.
  // Needs-action default: the person who loads (Asie) opens on Open orders when there are any.
  import { lookup, ref, reexports, warehouse, type ReexportOrder, type User, type WarehouseStockRow } from '@btw/api';
  import { fmtDateTime, fmtNum, say } from '@btw/ui';
  import { REEXPORT_ROUTE, canRaiseReexport } from '@btw/api/money';
  import { StatusBadge } from '../components/dashboard';
  import { attempt, watch } from '../lib/load.svelte';
  import { companyLabel } from '../lib/companies';
  import ErrorState from '../components/ErrorState.svelte';
  import { PageHeader, SummaryStrip, EmptyState, DataTable, queryFilters, readQuery, tableQuery, ts, type Column, type SummaryTile } from '../components/page';
  import { reexportTiles, infoOf } from '../lib/tiles';
  import Plus from '@lucide/svelte/icons/plus';
  import SearchX from '@lucide/svelte/icons/search-x';
  let { user }: { params?: any; user: User } = $props();

  const fromWhs = $derived(ref().warehouses.filter((w) => canRaiseReexport(user, w.id)));
  const raiser = $derived(fromWhs.length > 0);
  let orders = $state<ReexportOrder[] | null>(null);
  let stock = $state<WarehouseStockRow[]>([]);
  const w = watch(async () => {
    orders = await reexports.list();
    if (raiser) stock = (await warehouse.stock({ warehouseId: fromWhs[0].id })).filter((r) => r.held > 0);
  });
  const f = queryFilters({ show: '', q: '', route: '', company: '' });
  // V3-8: search + From → to / Company filters in the table; Status = the strip (and its choice in the toolbar)
  const tq = tableQuery(f, { search: 'q', filters: { route: 'route', company: 'company' } });
  const searchExtra = (o: ReexportOrder) => `${o.note ?? ''} ${o.lines.map((l) => lookup.product(l.productId)?.brand).join(' ')} ${o.truckId ? lookup.truck(o.truckId)?.reg ?? '' : ''} ${o.driverId ? lookup.driver(o.driverId)?.name ?? '' : ''}`;
  let shown = $state(0);
  const fig = $derived(reexportTiles(orders ?? []));
  const KEY: Record<string, ReexportOrder['status']> = { open: 'Open', loaded: 'Loaded', transit: 'In transit', delivered: 'Delivered', cancelled: 'Cancelled' };
  const tiles = $derived<SummaryTile[]>([
    { key: 'open', label: 'Open', value: orders ? fig.open : null, sub: 'to load', status: fig.open && raiser ? 'warn' : undefined, statusLabel: fig.open && raiser ? 'To load' : undefined, info: infoOf('rxOpen') },
    { key: 'loaded', label: 'Loaded', value: orders ? fig.loaded : null, info: infoOf('rxLoaded') },
    { key: 'transit', label: 'In transit', value: orders ? fig.transit : null, info: infoOf('rxInTransit') },
    { key: 'delivered', label: 'Delivered', value: orders ? fig.delivered : null, info: infoOf('rxDelivered') },
  ]);
  let defaulted = false;
  let auto = $state('');
  $effect(() => { if (defaulted || !orders) return; defaulted = true; if (!readQuery('show') && !readQuery('q') && raiser && fig.open) { auto = 'open'; f.set('show', 'open'); } });
  const listed = $derived((orders ?? []).filter((o) => !f.values.show || f.values.show === 'all' || o.status === KEY[f.values.show]));
  function clearAll() { f.clear(); }
  const STATUS: Record<ReexportOrder['status'], string> = { Open: 'none', Loaded: 'warn', 'In transit': 'warn', Delivered: 'good', Cancelled: 'none' };
  const cases = (o: ReexportOrder) => o.lines.reduce((a, l) => a + (l.loadedQty ?? l.qty), 0);
  const whName = (id: string) => lookup.warehouse(id)?.name ?? id;
  const routeOf = (o: ReexportOrder) => `${o.fromWarehouseId}>${o.toWarehouseId}`;
  const routeLabel = (k: string) => { const [a, b] = k.split('>'); return `${whName(a)} → ${whName(b)}`; };
  const columns: Column<ReexportOrder>[] = [
    { key: 'ref', label: 'Order', sticky: true, value: (o) => o.ref, cell: refCell, mobile: 'title' },
    { key: 'status', label: 'Status', value: (o) => o.status, cell: statusCell, mobile: 'aside' },
    { key: 'route', label: 'From → to', value: (o) => routeLabel(routeOf(o)), class: 'small', filter: 'select', filterValue: routeOf, filterLabel: routeLabel },
    { key: 'company', label: 'Company', value: (o) => companyLabel(o.entityId), class: 'small', filter: 'select', filterValue: (o) => o.entityId, filterLabel: (id) => companyLabel(id), hideBelow: 900 },
    { key: 'goods', label: 'Goods', sortable: false, csv: (o) => o.lines.map((l) => `${lookup.product(l.productId)?.brand} x ${l.loadedQty ?? l.qty}`).join('; '), cell: goodsCell, class: 'small', hideBelow: 1000 },
    { key: 'cases', label: 'Cases', align: 'right', sortValue: cases, value: (o) => fmtNum(cases(o)), csv: cases, total: (l) => fmtNum(l.reduce((a, o) => a + cases(o), 0)) },
    { key: 'truck', label: 'Truck', value: (o) => (o.truckId ? lookup.truck(o.truckId)?.reg ?? null : null), cell: truckCell, class: 'small', hideBelow: 1100 },
    { key: 'raised', label: 'Raised', sortValue: (o) => ts(o.createdAt), csv: (o) => o.createdAt, cell: raisedCell, class: 'small' },
    { key: 'act', label: '', sortable: false, csv: false, hideable: false, searchable: false, cell: actCell, class: 'nowrap', mobile: 'actions' },
  ];
  const pname = (id: string) => `${lookup.product(id)?.brand ?? id} · ${lookup.product(id)?.pack ?? ''}`;

  // raise
  let draft = $state<{ entityId: string; lines: { productId: string; qty: number | null }[]; note: string } | null>(null);
  const companies = $derived([...new Set(stock.map((r) => r.entityId))]);
  const heldOf = (e: string, p: string) => stock.find((r) => r.entityId === e && r.productId === p)?.held ?? 0;
  let err = $state(''); let busy = $state(false);
  function newDraft() { const e = companies[0] ?? ''; draft = { entityId: e, lines: [{ productId: stock.find((r) => r.entityId === e)?.productId ?? '', qty: null }], note: '' }; err = ''; }
  async function raise() {
    if (!draft) return;
    const lines = draft.lines.filter((l) => l.productId && l.qty).map((l) => ({ productId: l.productId, qty: Number(l.qty) }));
    busy = true; err = await attempt(() => reexports.create({ fromWarehouseId: fromWhs[0].id, entityId: draft!.entityId, lines, note: draft!.note || undefined })); busy = false;
    if (!err) { say('Re-export order raised — load it when the truck is there'); draft = null; }
  }
  // load
  let loading = $state<{ o: ReexportOrder; mode: 'list' | 'market'; truckId: string; driverId: string; reg: string; company: string; driverName: string; driverPhone: string; qty: Record<string, number> } | null>(null);
  const trucks = $derived(ref().trucks.filter((t) => t.active !== false));
  const drivers = $derived(ref().drivers.filter((d) => d.active !== false));
  function startLoad(o: ReexportOrder) { loading = { o, mode: 'list', truckId: o.truckId ?? '', driverId: o.driverId ?? '', reg: '', company: '', driverName: '', driverPhone: '', qty: Object.fromEntries(o.lines.map((l) => [l.productId, l.qty])) }; err = ''; }
  $effect(() => { if (loading && loading.mode === 'list' && loading.truckId && !loading.driverId) loading.driverId = lookup.truck(loading.truckId)?.defaultDriverId ?? ''; });
  async function load() {
    if (!loading) return;
    const l = loading;
    const input = l.mode === 'market' ? { market: { company: l.company, reg: l.reg, driverName: l.driverName, driverPhone: l.driverPhone }, loadedQty: l.qty } : { truckId: l.truckId, driverId: l.driverId, loadedQty: l.qty };
    busy = true; err = await attempt(() => reexports.load(l.o.id, input)); busy = false;
    if (!err) { say(`${l.o.ref} loaded — hand it over to the driver`); loading = null; }
  }
  async function cancel(o: ReexportOrder) { if (!confirm(`Cancel ${o.ref}?`)) return; const e = await attempt(() => reexports.cancel(o.id, 'Cancelled from the web')); say(e || `${o.ref} cancelled`); }
</script>

<PageHeader overline="Logistics" title="Re-export orders" description="Goods re-exported from Gisenyi (Rwanda) to Juba." analysis="warehouse"
  info="Asie raises an order from her Gisenyi stock and loads it at the warehouse (no prices). It ships as a new shipment with the order's reference and Yonas signs for it in Juba. Truck follow-up: Testfie (to confirm).">
  {#snippet primary()}{#if raiser}<button class="btn btn-primary" onclick={newDraft} disabled={!stock.length}><Plus size={16} aria-hidden="true" />New re-export order</button>{/if}{/snippet}
</PageHeader>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Re-export orders summary" allValue="all" noun="orders" total={orders ? orders.length : null} shown={orders ? shown : null} {auto} labels={KEY} />

{#if draft}
  <section class="card form-card" aria-label="New re-export order">
    <h2 class="h4">From {fromWhs[0]?.name} to Juba · {ref().routes.find((r) => r.id === REEXPORT_ROUTE)?.name}</h2>
    <div class="form-grid">
      <label class="field"><span>Whose stock</span><select class="select" bind:value={draft.entityId} onchange={() => (draft!.lines = [{ productId: stock.find((r) => r.entityId === draft!.entityId)?.productId ?? '', qty: null }])}>{#each companies as e}<option value={e}>{companyLabel(e)}</option>{/each}</select></label>
      <label class="field"><span>Note</span><input class="input" bind:value={draft.note} maxlength="500" placeholder="e.g. Juba order for Konyo Konyo Traders" /></label>
    </div>
    {#each draft.lines as l, i (i)}
      <div class="line">
        <label class="field grow"><span>Product</span><select class="select" bind:value={l.productId}>{#each stock.filter((r) => r.entityId === draft!.entityId) as r (r.productId)}<option value={r.productId}>{pname(r.productId)} — {fmtNum(r.held)} held</option>{/each}</select></label>
        <label class="field"><span>Cases</span><input class="input num" type="number" min="1" max={heldOf(draft.entityId, l.productId)} bind:value={l.qty} /></label>
        {#if draft.lines.length > 1}<button class="btn btn-ghost btn-sm" onclick={() => draft!.lines.splice(i, 1)}>Remove</button>{/if}
      </div>
    {/each}
    <button class="btn btn-ghost btn-sm" onclick={() => draft!.lines.push({ productId: '', qty: null })}>Add a product</button>
    {#if err}<p class="error small" role="alert">{err}</p>{/if}
    <div class="row"><button class="btn btn-primary" disabled={busy} onclick={raise}>Raise order</button><button class="btn btn-ghost" onclick={() => (draft = null)}>Cancel</button></div>
  </section>
{/if}

{#if loading}
  <section class="card form-card" aria-label="Load and hand over">
    <h2 class="h4">Load {loading.o.ref} <span class="caption">no prices — the agreed transport price is recorded by Testfie after loading</span></h2>
    <div class="kinds"><label class="sel-chip"><input type="radio" value="list" bind:group={loading.mode} />Truck from the list</label><label class="sel-chip"><input type="radio" value="market" bind:group={loading.mode} />Market truck</label></div>
    <div class="form-grid">
      {#if loading.mode === 'list'}
        <label class="field"><span>Truck</span><select class="select" bind:value={loading.truckId}><option value="">Pick a truck</option>{#each trucks as t (t.id)}<option value={t.id}>{t.reg} · {lookup.provider(t.providerId)?.name}</option>{/each}</select></label>
        <label class="field"><span>Driver</span><select class="select" bind:value={loading.driverId}><option value="">Pick the driver</option>{#each drivers as d (d.id)}<option value={d.id}>{d.name}</option>{/each}</select></label>
      {:else}
        <label class="field"><span>Truck registration</span><input class="input" bind:value={loading.reg} placeholder="RAD 123A" /></label>
        <label class="field"><span>Transporter</span><input class="input" bind:value={loading.company} placeholder="Company or owner" /></label>
        <label class="field"><span>Driver name</span><input class="input" bind:value={loading.driverName} /></label>
        <label class="field"><span>Driver phone</span><input class="input" bind:value={loading.driverPhone} placeholder="+250…" /></label>
      {/if}
      {#each loading.o.lines as l (l.productId)}<label class="field"><span>{pname(l.productId)} (ordered {fmtNum(l.qty)})</span><input class="input num" type="number" min="0" bind:value={loading.qty[l.productId]} /></label>{/each}
    </div>
    {#if err}<p class="error small" role="alert">{err}</p>{/if}
    <div class="row"><button class="btn btn-primary" disabled={busy} onclick={load}>Loaded — create the shipment</button><button class="btn btn-ghost" onclick={() => (loading = null)}>Cancel</button></div>
  </section>
{/if}


<DataTable id="reexports" label="Re-export orders" noun="orders" rows={orders ? listed : null} {columns} rowKey={(o) => o.id} initialSort={{ key: 'raised', dir: 'desc' }} filename="re-export-orders"
  searchable searchPlaceholder="Order, note, product, truck…" {searchExtra} bind:search={tq.search.get, tq.search.set} bind:filters={tq.filters.get, tq.filters.set} bind:shown>
  {#snippet toolbar()}<select class="select" aria-label="Status" value={f.values.show || 'all'} onchange={(e) => f.set('show', e.currentTarget.value)}><option value="all">All statuses</option>{#each Object.entries(KEY) as [k, v]}<option value={k}>{v}</option>{/each}</select>{/snippet}
  {#snippet empty()}{#if orders?.length}<EmptyState title="No re-export orders match these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>{:else}<EmptyState title="No re-export orders yet" compact />{/if}{/snippet}
</DataTable>

{#snippet refCell(o: ReexportOrder)}<strong>{o.ref}</strong>{#if o.note}<div class="caption">{o.note}</div>{/if}{/snippet}
{#snippet statusCell(o: ReexportOrder)}<StatusBadge status={STATUS[o.status]} label={o.status} size={12} />{/snippet}
{#snippet goodsCell(o: ReexportOrder)}{#each o.lines as l (l.productId)}<div>{lookup.product(l.productId)?.brand} × {fmtNum(l.loadedQty ?? l.qty)}</div>{/each}{/snippet}
{#snippet truckCell(o: ReexportOrder)}{o.truckId ? lookup.truck(o.truckId)?.reg ?? '-' : '-'}{#if o.driverId}<div class="caption">{lookup.driver(o.driverId)?.name}</div>{/if}{/snippet}
{#snippet raisedCell(o: ReexportOrder)}{fmtDateTime(o.createdAt)}<div class="caption">by {lookup.user(o.createdById)?.name ?? o.createdById}</div>{/snippet}
{#snippet actCell(o: ReexportOrder)}
  {#if o.shipmentId}<a class="btn btn-ghost btn-sm" href="#/shipments/{o.shipmentId}">Shipment</a>{/if}
  {#if o.status === 'Open' && canRaiseReexport(user, o.fromWarehouseId)}<button class="btn btn-primary btn-sm" onclick={() => startLoad(o)}>Load</button><button class="btn btn-ghost btn-sm" onclick={() => cancel(o)}>Cancel</button>{/if}
{/snippet}

<style>
  .form-card { margin-bottom: var(--space-4); display: grid; gap: var(--space-3); }
  .line { display: flex; gap: var(--space-3); align-items: flex-end; flex-wrap: wrap; }
  .kinds { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .error { color: var(--danger); }
</style>
