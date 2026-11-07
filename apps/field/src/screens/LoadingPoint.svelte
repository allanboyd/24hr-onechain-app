<script lang="ts">
  import CompanyChip from '../components/CompanyChip.svelte';
  import { untrack } from 'svelte';
  // Loading point = the giver (LD-01..04, §17.4 queue). One card: the next truck to load. Quantities and documents only —
  // no prices or payments (docs/12 A-04): the agreed transport price is recorded later by the truck follow-up officer.
  // Tap → hand-over sheet → slide "Hand over to driver" → loading confirmed, shipment created, driver's trip appears.
  import { field, lookup, pos, ref, type GiverWork, type LoadingAlternative, type User } from '@btw/api';
  import { defaultConfig, loadingCheck } from '@btw/api/rules';
  import { outbox } from '@btw/api/outbox';
  import { ago, say } from '@btw/ui';
  import { cases } from '../lib';
  import { haptic } from '../native';
  import MapView, { type MapPoint } from '../components/MapView.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { live } from '../live';
  import TopBar from '../components/TopBar.svelte';
  import MenuSheet from '../components/MenuSheet.svelte';
  import Stepper from '../components/Stepper.svelte';
  import PhotoInput from '../components/PhotoInput.svelte';
  import SlideToConfirm from '../components/SlideToConfirm.svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Plus from '@lucide/svelte/icons/plus';
  import ListChecks from '@lucide/svelte/icons/list-checks';
  import { focus } from '../shell/focus.svelte';
  let { user, onlogout, onback, shell = false }: { user: User; onlogout: () => void; /** opened from BTW Team (Testfie at GBI) */ onback?: () => void; shell?: boolean } = $props();

  const points_ = $derived(user.loadingPointIds);
  let lp = $state(untrack(() => focus.loadingPointId || user.loadingPointIds[0] || ''));
  $effect(() => { if (lp) focus.loadingPointId = lp; });
  let work = $state<GiverWork | null>(null);
  let menu = $state(false);
  let handover = $state(false);
  let arrived = $state(false);
  // D-A1 / C-P1-09: today's loading list + dispatched today (no prices) — lazy sheet
  let todayOpen = $state(false);
  const TODAY = () => import('../components/TodaySheet.svelte');
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
  // Where this truck goes: the route on its plan line (e.g. Nairobi → Gisenyi).
  let dest = $state('');
  $effect(() => {
    const o = order; dest = '';
    if (o) pos.get(o.poId).then((r) => { const pl = r?.plan.lines.find((l) => l.id === o.lines[0]?.planLineId); dest = pl ? lookup.route(pl.routeId)?.name ?? '' : ''; }).catch(() => {});
  });
  const site = $derived(supplier ? lookup.checkpoint(supplier.checkpointId) : null);
  const points = $derived<MapPoint[]>(site ? [{ id: site.id, lat: site.lat, lng: site.lng, label: `${supplier?.code} ${supplier?.city}`, state: 'place' }] : []);

  // ---- Hand-over against the PO (rule 3): per-line quantities, alternatives, ±allowance, automatic PO revision ----
  const cfg = $derived(ref().config?.loading ?? defaultConfig.loading);
  let truckId = $state(''); let driverId = $state(''); let choosing = $state(false);
  let qty = $state<Record<string, number>>({});
  let alts = $state<LoadingAlternative[]>([]);
  let photos = $state<string[]>([]);
  let error = $state(''); let busy = $state(false);
  function openHandover() {
    if (!order) return;
    truckId = next?.truckId ?? ''; driverId = next?.driverId ?? ''; choosing = false;
    qty = Object.fromEntries(order.lines.map((l) => [l.planLineId, l.orderedQty])); alts = []; photos = []; error = '';
    handover = true;
  }
  const truck = $derived(lookup.truck(truckId));
  const check = $derived(order ? loadingCheck(order.lines, qty, alts, truck?.capacityCases ?? 0, cfg, { supplierId: order.loadingPointId, products: ref().products }) : null);
  const meterMax = $derived(check ? Math.max(check.max, check.loaded, check.capacity || 0, 1) : 1);
  const pctOf = (n: number) => `${Math.min(100, (n / meterMax) * 100)}%`;
  const name = (pid: string) => { const p = lookup.product(pid); return p ? `${p.brand} ${p.pack}` : pid; };

  async function go() {
    error = '';
    if (!order || !check) return;
    if (check.error) { error = check.error; return; }
    busy = true;
    try {
      const alternatives = $state.snapshot(alts).filter((a) => a.qty > 0);
      const r = await outbox.send('loading.confirm', { id: order.id, input: { truckId, driverId, loadedQty: $state.snapshot(qty), documents: $state.snapshot(photos), ...(alternatives.length ? { alternatives } : {}) } });
      handover = false; haptic('success');
      say(r.queued ? 'Saved on the phone — sends when there is signal' : `${lookup.truck(truckId)?.reg} handed over — the driver's trip has started`);
    } catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }

  // "Item missing? Load an alternative": products on this supplier's price list.
  let altOpen = $state(false); let altQ = $state(''); let altPid = $state(''); let altQty = $state(0); let altFor = $state(''); let altZero = $state(true);
  const supplierProducts = $derived(order ? ref().products.filter((p) => p.supplierId === order.loadingPointId) : []);
  const altMatches = $derived(supplierProducts.filter((p) => { const q = altQ.trim().toLowerCase(); return !q || `${p.brand} ${p.pack} ${p.sku}`.toLowerCase().includes(q); }).slice(0, 30));
  function openAlt(forLine = '') {
    altQ = ''; altPid = ''; altFor = forLine; altZero = true;
    altQty = forLine ? order?.lines.find((l) => l.planLineId === forLine)?.orderedQty ?? 0 : 0;
    altOpen = true;
  }
  function addAlt() {
    if (!altPid || !(altQty > 0)) return;
    alts = [...alts, { productId: altPid, qty: altQty, ...(altFor ? { replacesPlanLineId: altFor } : {}) }];
    if (altFor && altZero) qty[altFor] = 0;
    altOpen = false;
  }

  // "Truck arrived": put a known truck at the back of the queue (§17.4). Market trucks are added in the web app.
  const known = $derived(ref().trucks.filter((t) => !queue?.some((w) => w.truckId === t.id)));
  let pick = $state('');
  async function addArrived() {
    const t = lookup.truck(pick); if (!t) return;
    // The truck arrives for the order being loaded here, so it joins that order's company queue.
    const r = await outbox.send('waiting.add', { loadingPointId: lp, truckId: t.id, driverId: t.defaultDriverId ?? ref().drivers[0].id, entityId: order?.entityId });
    arrived = false; pick = ''; say(r.queued ? `${t.reg} saved — added when there is signal` : `${t.reg} added to the queue`);
  }
</script>

<MapView {points} padBottom={sheetH} />
<TopBar onmenu={shell ? undefined : () => (menu = true)} {onback} title="{supplier?.code} {supplier?.city}" />

<Sheet bind:el={sheetEl}>
  {#if points_.length > 1}
    <div class="seg" role="group" aria-label="Loading point">
      {#each points_ as id (id)}<button type="button" class="sel-ticked" aria-pressed={id === lp} onclick={() => (lp = id)}>{lookup.supplier(id)?.code} {lookup.supplier(id)?.city}</button>{/each}
    </div>
  {/if}
  {#if work && !shell}
    <button class="today" onclick={() => (todayOpen = true)}><ListChecks size={20} />Today's list<span class="tn">{pending.length} to load</span></button>
  {/if}
  {#if !work || !queue}
    <div class="skeleton" style="height:24px;width:60%"></div><div class="skeleton" style="height:64px"></div>
  {:else if !order}
    <p class="eyebrow">Nothing to load</p>
    <p class="headline">No open orders here</p>
    <p class="subline">When a purchase order for {supplier?.code} is approved, its trucks appear here.{#if queue.length} {queue.length} truck{queue.length > 1 ? 's' : ''} waiting.{/if}</p>
  {:else if !next}
    <CompanyChip entityId={order.entityId} />
    <p class="eyebrow">Next to load · {orderRef} truck {order.truckNo}</p>
    <p class="headline">No truck waiting</p>
    <p class="subline">{cases(order.lines.reduce((a, l) => a + l.orderedQty, 0))} ready to load. Add the truck when it reaches the gate.</p>
    <button class="btn btn-primary btn-lg btn-block" onclick={() => (arrived = true)}><Plus size={20} />Truck arrived</button>
  {:else}
    <CompanyChip entityId={order.entityId} />
    <p class="eyebrow">Next truck · {orderRef} truck {order.truckNo}</p>
    <button class="next" onclick={openHandover}>
      <span class="grow">
        <span class="headline">{lookup.truck(next.truckId)?.reg}</span>
        <span class="subline">{lookup.driver(next.driverId)?.name} · waiting {ago(next.arrivedAt).replace(' ago', '')}</span>
        <span class="subline">{order.lines.map((l) => `${l.orderedQty} ${lookup.product(l.productId)?.brand}`).join(' + ')}{dest ? ` · ${dest}` : ''}</span>
      </span>
      <ChevronRight size={28} />
    </button>
    <button class="btn btn-accent btn-lg btn-block" onclick={openHandover}>Load this truck</button>
    <div class="row-actions">
      <span class="caption">{queue.length > 1 ? `${queue.length - 1} more waiting` : 'No one else waiting'} · {pending.length} truck{pending.length > 1 ? 's' : ''} to load</span>
      <button class="text-btn" onclick={() => (arrived = true)}>+ Truck arrived</button>
    </div>
  {/if}
</Sheet>

{#if handover && order && check}
  <Sheet modal title="Load & hand over" onclose={() => (handover = false)}>
    <CompanyChip entityId={order.entityId} big />
    <p class="subline">{orderRef} · truck {order.truckNo}{dest ? ` · ${dest}` : ''}</p>

    <section class="group">
      <p class="eyebrow">Truck</p>
      <div class="picked">
        <p class="big">{truck?.reg} <span class="caption">· {truck?.trailer} · {lookup.provider(truck?.providerId ?? '')?.name}</span></p>
        {#if (queue ?? []).length > 1}<button type="button" class="text-btn" onclick={() => (choosing = !choosing)}>{choosing ? 'Done' : 'Change'}</button>{/if}
      </div>
      {#if choosing}
        <div class="choices">
          {#each queue ?? [] as w (w.id)}
            <button type="button" class="choice" aria-pressed={w.truckId === truckId} onclick={() => { truckId = w.truckId; driverId = w.driverId; choosing = false; }}>
              <strong>{lookup.truck(w.truckId)?.reg}</strong><span class="caption">{lookup.provider(lookup.truck(w.truckId)?.providerId ?? '')?.name} · waiting {ago(w.arrivedAt).replace(' ago', '')}</span>
            </button>
          {/each}
        </div>
      {/if}
      <label class="field"><span>Driver</span>
        <select class="select" bind:value={driverId}>{#each ref().drivers as d (d.id)}<option value={d.id}>{d.name}{d.hasApp ? '' : ' (no app — SMS)'}</option>{/each}</select></label>
    </section>

    <section class="group">
      <p class="eyebrow">Cases loaded · {cases(check.loaded)}{#if check.diff} <span class="diff">({check.diff > 0 ? '+' : ''}{check.diff} vs PO)</span>{/if}</p>
      {#each order.lines as l (l.planLineId)}
        {@const p = lookup.product(l.productId)}
        <div class="line">
          <div class="line-name"><strong>{p?.brand}</strong><span class="caption">{p?.pack} · ordered {l.orderedQty}{#if qty[l.planLineId] === 0} · <span class="err">missing</span>{/if}</span></div>
          <Stepper bind:value={qty[l.planLineId]} label="{p?.brand} cases" step={10} invalid={!!check.error} />
        </div>
      {/each}
      {#each alts as a, i (i)}
        <div class="line">
          <div class="line-name"><strong>{lookup.product(a.productId)?.brand} <span class="tag">alternative</span></strong><span class="caption">{lookup.product(a.productId)?.pack}{#if a.replacesPlanLineId} · for {name(order.lines.find((l) => l.planLineId === a.replacesPlanLineId)?.productId ?? '')}{/if} · <button type="button" class="text-btn" onclick={() => (alts = alts.filter((_, k) => k !== i))}>Remove</button></span></div>
          <Stepper bind:value={a.qty} label="{lookup.product(a.productId)?.brand} cases" step={10} min={1} invalid={!!check.error} />
        </div>
      {/each}
      {#if cfg.allowAlternatives}<button type="button" class="btn btn-block alt-btn" onclick={() => openAlt()}>Item missing? Load an alternative</button>{/if}

      <div class="meter" class:bad={!!check.error} role="img" aria-label="Loaded {check.loaded} of {check.ordered} ordered, allowed {check.min} to {check.max}">
        <div class="band" style:left={pctOf(check.min)} style:width="calc({pctOf(check.max)} - {pctOf(check.min)})"></div>
        <div class="fill" style:width={pctOf(check.loaded)}></div>
        <div class="tick" style:left={pctOf(check.ordered)}></div>
        {#if check.capacity}<div class="cap" style:left={pctOf(check.capacity)}></div>{/if}
      </div>
      <p class="caption" class:err={!!check.error}>
        {cases(check.loaded)} of {cases(check.ordered)} ordered ({check.diffPct > 0 ? '+' : ''}{check.diffPct}%) · allowed ±{check.allowancePct}%: {check.min}–{check.max}{#if truck} · truck holds {cases(truck.capacityCases)}{/if}
      </p>
    </section>

    <section class="group">
      <p class="eyebrow">Documents</p>
      <PhotoInput bind:names={photos} label="Delivery note" />
    </section>

    <p class="note">Agreed price is recorded later by the truck follow-up officer.</p>

    {#if check.error}<p class="error-box" role="alert">{check.error}</p>{:else if error}<p class="error-box" role="alert">{error}</p>{/if}
    {#if check.deviates && !check.error}<p class="note">Loaded differs from the PO — this will create <strong>{order.nextRevisionRef ?? 'a PO revision'}</strong> and tell the planner.</p>{/if}
    <SlideToConfirm label={busy ? 'Sending…' : 'Hand over to driver'} disabled={busy || !!check.error || !truckId} onconfirm={go} />
  </Sheet>
{/if}

{#if altOpen && order}
  <Sheet modal title="Load an alternative" onclose={() => (altOpen = false)}>
    <label class="field"><span>Instead of (optional)</span>
      <select class="select" bind:value={altFor} onchange={() => { const l = order?.lines.find((x) => x.planLineId === altFor); if (l && !altQty) altQty = qty[l.planLineId] || l.orderedQty; }}>
        <option value="">Nothing — an extra product</option>
        {#each order.lines as l (l.planLineId)}<option value={l.planLineId}>{name(l.productId)} (ordered {l.orderedQty})</option>{/each}
      </select></label>
    {#if altFor}<label class="check"><input type="checkbox" bind:checked={altZero} /> {lookup.product(order.lines.find((l) => l.planLineId === altFor)?.productId ?? '')?.brand} is missing — set it to 0</label>{/if}
    <input class="input" type="search" placeholder="Search {supplier?.code} products" bind:value={altQ} aria-label="Search products" />
    <div class="choices list">
      {#each altMatches as p (p.id)}
        <button type="button" class="choice" aria-pressed={p.id === altPid} onclick={() => (altPid = p.id)}><strong>{p.brand}</strong><span class="caption">{p.pack} · {p.sku}</span></button>
      {:else}<p class="caption">No product of {supplier?.code} matches.</p>{/each}
    </div>
    <div class="line"><div class="line-name"><strong>Cases</strong></div><Stepper bind:value={altQty} label="Alternative cases" step={10} /></div>
    <button class="btn btn-primary btn-lg btn-block" disabled={!altPid || !(altQty > 0)} onclick={addAlt}>Add {altPid ? lookup.product(altPid)?.brand : 'alternative'}</button>
  </Sheet>
{/if}

{#if arrived}
  <Sheet modal title="Truck arrived" onclose={() => (arrived = false)}>
    <label class="field"><span>Which truck?</span>
      <select class="select" bind:value={pick}><option value="">Choose a truck</option>{#each known as t (t.id)}<option value={t.id}>{t.reg} · {lookup.provider(t.providerId)?.name}</option>{/each}</select></label>
    <p class="caption">A truck from the market (not in the list)? Ask the office to add it in the web app.</p>
    <button class="btn btn-primary btn-lg btn-block" disabled={!pick} onclick={addArrived}>Add to queue</button>
  </Sheet>
{/if}

{#if todayOpen && work}
  {#await TODAY() then m}<m.default {lp} toLoad={work.toLoad} onclose={() => (todayOpen = false)} />{/await}
{/if}

{#if menu}<MenuSheet {user} {onlogout} onclose={() => (menu = false)} />{/if}

<style>
  .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .next { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: 14px 16px; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--surface-sunken); color: var(--text); text-align: left; font: inherit; cursor: pointer; }
  .today { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 48px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-sunken); color: var(--text); font: 600 15px var(--ff-body); cursor: pointer; }
  .tn { margin-left: auto; font: 700 13px var(--ff-body); color: var(--text-muted); }
  .row-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .seg { display: flex; gap: 6px; }
  .seg button { flex: 1; min-height: 40px; border-radius: 20px; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); font: 600 14px var(--ff-body); cursor: pointer; }
  .group { display: flex; flex-direction: column; gap: var(--space-2); }
  .choices { display: flex; flex-direction: column; gap: var(--space-2); }
  .choices.list { max-height: 38vh; overflow: auto; }
  .choice { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); min-height: 56px; padding: 0 14px; border-radius: var(--radius-md); border: 2px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; text-align: left; }
  /* chosen: the shared radio-card look (base.css "Selection states") — primary border, tint, tick in the corner */
  .choice[aria-pressed='true'] { position: relative; border-color: var(--sel-line); background: var(--sel-bg); padding-right: 40px; }
  .choice[aria-pressed='true']::after { content: ''; position: absolute; right: 16px; top: 50%; width: 6px; height: 12px; margin-top: -8px; border: solid var(--sel-ink); border-width: 0 3px 3px 0; transform: rotate(45deg); }
  .big { font: 700 20px var(--ff-display); margin: 0; }
  .picked { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .line { display: grid; grid-template-columns: 1fr 190px; gap: var(--space-3); align-items: center; }
  .line-name { display: flex; flex-direction: column; min-width: 0; }
  .tag { font: 600 11px var(--ff-body); text-transform: uppercase; color: var(--accent-text); }
  .diff { color: var(--accent-text); text-transform: none; letter-spacing: 0; }
  .err { color: var(--danger); font-weight: 600; }
  .alt-btn { min-height: 52px; border: 1px dashed var(--border-strong); background: var(--surface); color: var(--text); font-weight: 600; }
  .meter { position: relative; height: 14px; border-radius: 7px; background: var(--surface-sunken); overflow: hidden; margin-top: var(--space-2); }
  .meter .band { position: absolute; top: 0; bottom: 0; background: var(--success-subtle, #d9f2e3); }
  .meter .fill { position: absolute; left: 0; top: 4px; bottom: 4px; border-radius: 3px; background: var(--success, #1f8a4c); }
  .meter.bad .fill { background: var(--danger); }
  .meter .tick { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--text); }
  .meter .cap { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--danger); }
  .note { margin: 0; padding: 10px 12px; border-radius: var(--radius-md); background: var(--accent-subtle); color: var(--text); }
  .check { display: flex; align-items: center; gap: var(--space-2); min-height: 44px; }
  .error-box { margin: 0; padding: 10px 12px; border-radius: var(--radius-md); background: var(--danger-subtle); color: var(--danger); font-weight: 600; }
  @media (max-width: 380px) { .line { grid-template-columns: 1fr; } }
  .seg button[aria-pressed='true'] { background: var(--sel-fill); color: var(--sel-on-fill); border-color: var(--sel-fill); font-weight: 700; }
</style>
