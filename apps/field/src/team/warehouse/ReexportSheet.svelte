<script lang="ts">
  // docs/14 B-03 on the phone (Asie): raise a re-export order Gisenyi → Juba from her stock, then load it — a truck from the
  // list or a market truck — no prices. Loading creates the shipment; the home card then shows "Load & hand over" for the
  // driver to leave. Lazy chunk opened from the receiver home.
  import { lookup, ref, reexports, warehouse, type ReexportOrder, type User, type WarehouseStockRow } from '@btw/api';
  import { say } from '@btw/ui';
  import { canRaiseReexport } from '@btw/api/money';
  import Sheet from '../../components/Sheet.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { haptic } from '../../native';
  let { user, onclose }: { user: User; onclose: () => void } = $props();

  const from = $derived(ref().warehouses.find((w) => canRaiseReexport(user, w.id)));
  let orders = $state<ReexportOrder[] | null>(null);
  let stock = $state<WarehouseStockRow[]>([]);
  const load = async () => {
    orders = (await reexports.list().catch(() => [])).filter((o) => o.fromWarehouseId === from?.id && o.status !== 'Cancelled');
    if (from) stock = (await warehouse.stock({ warehouseId: from.id }).catch(() => [])).filter((r) => r.held > 0);
  };
  $effect(() => { load(); });
  const pname = (id: string) => lookup.product(id)?.brand ?? id;
  const total = (o: ReexportOrder) => o.lines.reduce((a, l) => a + (l.loadedQty ?? l.qty), 0);

  let mode = $state<'list' | 'new' | 'load'>('list');
  let busy = $state(false); let error = $state('');
  // new order
  let pick = $state<WarehouseStockRow | null>(null);
  let qty = $state(0); let note = $state('');
  async function raise() {
    if (!pick || !from) return;
    busy = true; error = '';
    try { const o = await reexports.create({ fromWarehouseId: from.id, entityId: pick.entityId, lines: [{ productId: pick.productId, qty }], note: note || undefined }); haptic('success'); say(`${o.ref} raised`); mode = 'list'; pick = null; load(); }
    catch (x) { error = (x as Error).message; } finally { busy = false; }
  }
  // load
  let order = $state<ReexportOrder | null>(null);
  let market = $state(false);
  let truckId = $state(''); let driverId = $state('');
  let reg = $state(''); let company = $state(''); let driverName = $state(''); let driverPhone = $state('');
  let loaded = $state<Record<string, number>>({});
  const trucks = $derived(ref().trucks.filter((t) => t.active !== false));
  function startLoad(o: ReexportOrder) { order = o; loaded = Object.fromEntries(o.lines.map((l) => [l.productId, l.qty])); truckId = ''; driverId = ''; market = false; error = ''; mode = 'load'; }
  $effect(() => { if (truckId) driverId = lookup.truck(truckId)?.defaultDriverId ?? driverId; });
  async function doLoad() {
    if (!order) return;
    busy = true; error = '';
    try {
      const o = await reexports.load(order.id, market ? { market: { reg, company, driverName, driverPhone }, loadedQty: loaded } : { truckId, driverId, loadedQty: loaded });
      haptic('success'); say(`${o.ref} loaded — slide "Load & hand over" when the truck leaves`); onclose();
    } catch (x) { error = (x as Error).message; } finally { busy = false; }
  }
</script>

<Sheet modal title={mode === 'new' ? 'New re-export' : mode === 'load' ? `Load ${order?.ref}` : 'Re-exports to Juba'} onclose={mode === 'list' ? onclose : () => (mode = 'list')}>
  {#if mode === 'list'}
    <p class="subline">From {from?.name ?? 'your warehouse'} to Yonas in Juba. No prices — Testfie records the transport price.</p>
    <button class="btn btn-accent btn-lg btn-block" onclick={() => { mode = 'new'; pick = stock[0] ?? null; qty = 0; note = ''; error = ''; }} disabled={!stock.length}>New re-export order</button>
    {#if !orders}<div class="skeleton" style="height:100px"></div>{/if}
    <ul class="list">
      {#each orders ?? [] as o (o.id)}
        <li>
          <CompanyDot entityId={o.entityId} />
          <span class="grow"><strong>{o.ref}</strong> <span class="caption">· {o.status}</span>
            <span class="caption block">{o.lines.map((l) => `${pname(l.productId)} × ${l.loadedQty ?? l.qty}`).join(', ')} · {total(o).toLocaleString('en-US')} cases</span></span>
          {#if o.status === 'Open'}<button class="btn btn-secondary" onclick={() => startLoad(o)}>Load</button>{/if}
        </li>
      {/each}
    </ul>
  {:else if mode === 'new'}
    <label class="field"><span>Product (held at {from?.town})</span>
      <select class="input" value={pick ? `${pick.entityId}|${pick.productId}` : ''} onchange={(e) => (pick = stock.find((r) => `${r.entityId}|${r.productId}` === e.currentTarget.value) ?? null)}>
        {#each stock as r (`${r.entityId}|${r.productId}`)}<option value="{r.entityId}|{r.productId}">{pname(r.productId)} · {lookup.entity(r.entityId)?.shortName} — {r.held} held</option>{/each}
      </select></label>
    <label class="field"><span>Cases to re-export</span><Stepper bind:value={qty} min={0} max={pick?.held ?? 0} step={10} label="cases" /></label>
    <label class="field"><span>Note</span><input class="input" bind:value={note} placeholder="e.g. Juba order for Konyo Konyo" /></label>
    {#if error}<p class="error-box" role="alert">{error}</p>{/if}
    <button class="btn btn-accent btn-lg btn-block" disabled={busy || !qty} onclick={raise}>{busy ? 'Saving…' : `Raise order · ${qty} cases`}</button>
  {:else if order}
    <div class="seg" role="radiogroup" aria-label="Truck"><button class:on={!market} onclick={() => (market = false)}>Truck from the list</button><button class:on={market} onclick={() => (market = true)}>Market truck</button></div>
    {#if !market}
      <label class="field"><span>Truck</span><select class="input" bind:value={truckId}><option value="">Pick the truck</option>{#each trucks as t (t.id)}<option value={t.id}>{t.reg} · {lookup.provider(t.providerId)?.name}</option>{/each}</select></label>
      <label class="field"><span>Driver</span><select class="input" bind:value={driverId}><option value="">Pick the driver</option>{#each ref().drivers.filter((d) => d.active !== false) as d (d.id)}<option value={d.id}>{d.name}</option>{/each}</select></label>
    {:else}
      <label class="field"><span>Registration</span><input class="input" bind:value={reg} placeholder="RAD 123A" /></label>
      <label class="field"><span>Transporter</span><input class="input" bind:value={company} /></label>
      <label class="field"><span>Driver name</span><input class="input" bind:value={driverName} /></label>
      <label class="field"><span>Driver phone</span><input class="input" type="tel" bind:value={driverPhone} placeholder="+250…" /></label>
    {/if}
    {#each order.lines as l (l.productId)}<label class="field"><span>{pname(l.productId)} loaded (ordered {l.qty})</span><Stepper bind:value={loaded[l.productId]} min={0} label="{pname(l.productId)} loaded" /></label>{/each}
    {#if error}<p class="error-box" role="alert">{error}</p>{/if}
    <button class="btn btn-accent btn-lg btn-block" disabled={busy || (market ? !reg || !driverName : !truckId || !driverId)} onclick={doLoad}>{busy ? 'Saving…' : 'Loaded — create the shipment'}</button>
  {/if}
</Sheet>

<style>
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; align-items: center; gap: var(--space-2); min-height: 60px; border-bottom: 1px solid var(--border); padding: 8px 0; }
  .grow { flex: 1; min-width: 0; }
  .block { display: block; }
  .seg { display: flex; gap: 6px; background: var(--surface-sunken); padding: 4px; border-radius: 999px; }
  .seg button { flex: 1; min-height: 40px; border: 0; border-radius: 999px; background: none; font: 600 14px var(--ff-body); color: var(--text-muted); }
  .seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--elevation-1); }
  .error-box { color: var(--danger); font-weight: 600; }
</style>
