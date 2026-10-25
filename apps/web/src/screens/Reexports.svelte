<script lang="ts">
  // docs/14 B-03: re-export orders Asie → Yonas (Rwanda → Juba). Asie raises an order from her Gisenyi stock, loads it herself
  // (a truck from the list or a market truck — no prices) and it ships as a new shipment with the order's ref; Yonas
  // acknowledges it into Juba stock. Yonas sees what is coming, Testfie follows the trucks up (owner to confirm, Q3), the
  // directors see everything.
  import { lookup, ref, reexports, warehouse, type ReexportOrder, type User, type WarehouseStockRow } from '@btw/api';
  import { fmtDateTime, fmtNum, say } from '@btw/ui';
  import { REEXPORT_ROUTE, canRaiseReexport } from '@btw/api/money';
  import { StatusBadge } from '../components/dashboard';
  import { attempt, watch } from '../lib/load.svelte';
  import { companyLabel } from '../lib/companies';
  import ErrorState from '../components/ErrorState.svelte';
  let { user }: { params?: any; user: User } = $props();

  const fromWhs = $derived(ref().warehouses.filter((w) => canRaiseReexport(user, w.id)));
  const raiser = $derived(fromWhs.length > 0);
  let orders = $state<ReexportOrder[] | null>(null);
  let stock = $state<WarehouseStockRow[]>([]);
  const w = watch(async () => {
    orders = await reexports.list();
    if (raiser) stock = (await warehouse.stock({ warehouseId: fromWhs[0].id })).filter((r) => r.held > 0);
  });
  const STATUS: Record<ReexportOrder['status'], string> = { Open: 'none', Loaded: 'warn', 'In transit': 'warn', Delivered: 'good', Cancelled: 'none' };
  const cases = (o: ReexportOrder) => o.lines.reduce((a, l) => a + (l.loadedQty ?? l.qty), 0);
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

<div class="page-head">
  <div><div class="overline crumb">Logistics</div><h1>Re-export orders</h1>
    <p class="muted small">Goods re-exported from Asie's warehouse in Rwanda (Gisenyi) to Yonas in Juba: raised from stock, loaded at the warehouse (no prices), shipped as a new shipment with the order's reference and acknowledged in Juba. Follow-up: Testfie (to confirm).</p></div>
  {#if raiser}<button class="btn btn-primary" onclick={newDraft} disabled={!stock.length}>New re-export order</button>{/if}
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

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
    <div class="kinds"><label class="chip" class:on={loading.mode === 'list'}><input type="radio" value="list" bind:group={loading.mode} />Truck from the list</label><label class="chip" class:on={loading.mode === 'market'}><input type="radio" value="market" bind:group={loading.mode} />Market truck</label></div>
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

<div class="card flush table-wrap">
  <table class="table">
    <thead><tr><th>Order</th><th>Status</th><th>From → to</th><th>Company</th><th>Goods</th><th class="num">Cases</th><th>Truck</th><th>Raised</th><th></th></tr></thead>
    <tbody>
      {#if !orders}{#each Array(3) as _}<tr><td colspan="9"><div class="skeleton"></div></td></tr>{/each}{/if}
      {#each orders ?? [] as o (o.id)}
        <tr>
          <td><strong>{o.ref}</strong>{#if o.note}<div class="caption">{o.note}</div>{/if}</td>
          <td><StatusBadge status={STATUS[o.status]} label={o.status} size={12} /></td>
          <td class="small">{lookup.warehouse(o.fromWarehouseId)?.name} → {lookup.warehouse(o.toWarehouseId)?.name}</td>
          <td class="small">{companyLabel(o.entityId)}</td>
          <td class="small">{#each o.lines as l (l.productId)}<div>{lookup.product(l.productId)?.brand} × {fmtNum(l.loadedQty ?? l.qty)}</div>{/each}</td>
          <td class="num">{fmtNum(cases(o))}</td>
          <td class="small">{o.truckId ? lookup.truck(o.truckId)?.reg ?? '—' : '—'}{#if o.driverId}<div class="caption">{lookup.driver(o.driverId)?.name}</div>{/if}</td>
          <td class="small">{fmtDateTime(o.createdAt)}<div class="caption">by {lookup.user(o.createdById)?.name ?? o.createdById}</div></td>
          <td class="nowrap">
            {#if o.shipmentId}<a class="btn btn-ghost btn-sm" href="#/shipments/{o.shipmentId}">Shipment</a>{/if}
            {#if o.status === 'Open' && canRaiseReexport(user, o.fromWarehouseId)}<button class="btn btn-primary btn-sm" onclick={() => startLoad(o)}>Load</button><button class="btn btn-ghost btn-sm" onclick={() => cancel(o)}>Cancel</button>{/if}
          </td>
        </tr>
      {/each}
      {#if orders && !orders.length}<tr><td colspan="9" class="muted">No re-export orders yet.</td></tr>{/if}
    </tbody>
  </table>
</div>

<style>
  .form-card { margin-bottom: var(--space-4); display: grid; gap: var(--space-3); }
  .line { display: flex; gap: var(--space-3); align-items: flex-end; flex-wrap: wrap; }
  .kinds { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 14px; }
  .chip.on { border-color: var(--primary); background: var(--surface-sunken); font-weight: 600; }
  .error { color: var(--danger); }
  .nowrap { white-space: nowrap; }
</style>
