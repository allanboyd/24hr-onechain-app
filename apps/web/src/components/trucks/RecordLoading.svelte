<script lang="ts">
  // Truck desk · Queues: record a loading against a PO truck line (quantities within the ± allowance, optional
  // alternatives, automatic PO revision when it differs). Open with `open(loading, queue)` (bind:this).
  import { withUnusualConfirm } from '@btw/api/amounts';
  import { loading, lookup, ref, type Loading, type LoadingAlternative, type WaitingEntry } from '@btw/api';
  import { defaultConfig, loadingCheck } from '@btw/api/rules';
  import { Badge, fmtNum, say, router } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Minus from '@lucide/svelte/icons/minus';
  import X from '@lucide/svelte/icons/x';
  let { lp, poRef, priceAtLoading }: {
    lp: string;
    poRef: (poId: string) => string;
    /** the agreed transport price may be given here (truck follow-up officer, never a loader) */ priceAtLoading: boolean;
  } = $props();

  const r = ref();
  let recDlg = $state<HTMLDialogElement>();
  let cur = $state<Loading | null>(null);
  let queue = $state<WaitingEntry[]>([]);
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
  let transport = $state<number | ''>('');
  let transportCurrency = $state<'USD' | 'KES' | 'UGX' | 'TZS' | 'RWF'>('USD');
  let docs = $state<Record<string, string>>({ 'Delivery note': '', Invoice: '', 'Gate pass': '' });
  let busy = $state(false);
  let recErr = $state('');
  export function open(l: Loading, waiting: WaitingEntry[]) {
    cur = l; queue = waiting;
    const top = waiting[0];
    truckId = top?.truckId ?? r.trucks[0].id;
    driverId = top?.driverId ?? lookup.truck(truckId)?.defaultDriverId ?? r.drivers[0].id;
    qty = Object.fromEntries(l.lines.map((x) => [x.planLineId, x.orderedQty]));
    alts = []; altOpen = false; altProduct = ''; altQty = 0; altFor = '';
    recErr = ''; transport = ''; transportCurrency = 'USD'; docs = { 'Delivery note': '', Invoice: '', 'Gate pass': '' };
    recDlg?.showModal();
  }
  const total = $derived(check?.loaded ?? 0);
  const cap = $derived(lookup.truck(truckId)?.capacityCases ?? 0);
  async function confirm() {
    recErr = '';
    if (check?.error) { recErr = check.error; return; }
    busy = true;
    try {
      const sh = await withUnusualConfirm((confirmUnusual) => loading.confirm(cur!.id, { truckId, driverId, loadedQty: $state.snapshot(qty), alternatives: $state.snapshot(alts), ...(priceAtLoading && Number(transport) > 0 ? { agreedTransport: Number(transport), transportCurrency, confirmUnusual } : {}), documents: Object.entries(docs).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`) }));
      if (!sh) return;
      recDlg?.close(); say(`Loading confirmed — ${sh.ref} created${check?.deviates && cur?.nextRevisionRef ? ` · PO revised → ${cur.nextRevisionRef}` : ''}`); router.go(`/shipments/${sh.id}`);
    } catch (e) { recErr = (e as Error).message; } finally { busy = false; }
  }
</script>

<dialog class="sheet wide" bind:this={recDlg}>
  {#if cur}
    <div class="body stack">
      <div><h3>Record loading</h3><div class="caption"><span class="mono">{poRef(cur.poId)}</span> · Truck No. {cur.truckNo} · {lookup.supplier(lp)?.name}</div></div>
      <div class="form-grid">
        <label class="field"><span>Truck</span>
          <select class="select" bind:value={truckId} onchange={() => (driverId = lookup.truck(truckId)?.defaultDriverId ?? driverId)}>
            {#each queue as w}<option value={w.truckId}>#{w.position} in queue · {lookup.truck(w.truckId)?.reg}</option>{/each}
            <optgroup label="Other trucks">{#each r.trucks.filter((t) => !queue.some((w) => w.truckId === t.id)) as t}<option value={t.id}>{t.reg}</option>{/each}</optgroup>
          </select></label>
        <label class="field"><span>Driver</span><select class="select" bind:value={driverId}>{#each r.drivers as d}<option value={d.id}>{d.name}</option>{/each}</select></label>
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
      {#if priceAtLoading}
        <div class="form-grid">
          <label class="field"><span>Agreed transport price (optional)</span><input class="input num" type="number" min="0" step="0.01" bind:value={transport} /><span class="help">Can be recorded later on the Truck desk (Costs).</span></label>
          <label class="field"><span>Currency</span><select class="select" bind:value={transportCurrency}>{#each ['USD', 'KES', 'UGX', 'TZS', 'RWF'] as c}<option>{c}</option>{/each}</select></label>
        </div>
      {:else}<p class="caption">No prices here — the agreed transport price is recorded after loading by the truck follow-up officer.</p>{/if}
      <div class="stack-sm">
        <span class="label">Supplier documents</span>
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
  .mono { white-space: nowrap; }
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
