<script lang="ts">
  // docs/09 §4: "Create purchase order" (issued at once — or awaiting a director when approval is switched on) and
  // "Update" (saves the next revision <ref>-rev00N with a required reason; the original and every version stay).
  import RecordFor from '../components/RecordFor.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import CompanyMark from '../components/CompanyMark.svelte';
  import ProductPicker from '../components/ProductPicker.svelte';
  import { amount, lookup, plans, pos, ref, type Currency, type PlanLine, type PoDetail, type User } from '@btw/api';
  import { diffPoLines, lineChangeText } from '@btw/api/rules';
  import { Badge, fmtDate, fmtNum, router, say } from '@btw/ui';
  import Trash from '@lucide/svelte/icons/trash-2';
  import Plus from '@lucide/svelte/icons/plus';
  import Layers from '@lucide/svelte/icons/layers';
  import Lock from '@lucide/svelte/icons/lock';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import { untrack } from 'svelte';
  import { company, GROUP } from '../lib/company.svelte';
  import { companyBrand } from '../lib/companies';
  import { poApprovals, prefillLeft, revTag, takePrefill } from '../lib/orders';
  import { planContext, type LineContext } from '../lib/planning';
  import { describe } from '../lib/errors';
  let { params, user }: { params?: { id?: string }; user: User } = $props();

  const r = ref();
  const TRUCK_CAP = 2200; // default until a truck is assigned at loading (§7.3 #3)
  const INSTRUCTION = 'Kindly process and avail stock for loading.';
  const editing = untrack(() => !!params?.id);
  const approvals = poApprovals();
  const today = new Date().toISOString().slice(0, 10);
  type Form = { supplierId: string; title: string; date: string; requiredBy: string; currency: Currency; instruction: string; lines: PlanLine[] };
  let form = $state<Form | null>(null);
  let detail = $state<PoDetail | null | undefined>(editing ? undefined : null);
  let loadError = $state<unknown>(null);
  let tried = $state(false);
  let busy = $state(false);
  let error = $state('');
  let dialog = $state<HTMLDialogElement>();
  let reason = $state('');
  let queued = $state(0);

  // ---- who orders from whom (create): the active company; a planner only for their buyer–supplier pairs ----
  const entityId = $derived(editing ? detail?.po.entityId ?? '' : company.active === GROUP ? '' : company.active);
  const co = $derived(entityId ? companyBrand(entityId) : null);
  const director = $derived(user.roles.some((x) => x === "director" || x === "admin"));
  const choices = $derived(r.suppliers.filter((s) => s.active !== false && (director || !user.pairs?.length || user.pairs.some((p) => p.entityId === entityId && p.supplierId === s.id))));
  const canEdit = $derived(user.roles.some((x) => x === "planner" || x === "director" || x === "admin"));

  async function load() {
    try {
      if (editing) {
        const d = await pos.get(params!.id!);
        const eff = d && d.effectiveId !== d.po.id ? await pos.get(d.effectiveId) : d; // always edit the version in force
        detail = eff;
        if (eff) form = { supplierId: eff.po.supplierId, title: eff.plan.title, date: eff.plan.date, requiredBy: eff.plan.requiredBy, currency: eff.plan.currency, instruction: eff.po.instruction, lines: structuredClone($state.snapshot(eff.plan.lines)) as PlanLine[] };
        if (eff?.plan.id) ctx = await planContext(eff.plan.id).catch(() => []);
      } else {
        const sup = choices[0]?.id ?? '';
        form = { supplierId: sup, title: '', date: today, requiredBy: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), currency: 'USD', instruction: INSTRUCTION, lines: [] };
        if (router.query.get('prefill')) applyPrefill();
      }
    } catch (e) { loadError = e; }
  }
  $effect(() => { untrack(load); });
  /** "Order this" from a report: one supplier's trucks, prefilled (nothing is created until Create). */
  function applyPrefill() {
    const { next, left } = takePrefill();
    queued = left;
    if (!next || !form) return;
    form.supplierId = next.supplierId; form.title = next.title;
    let n = 0;
    form.lines = next.items.flatMap((it) => Array.from({ length: it.trucks }, () => {
      const l = freshLine(++n);
      return { ...l, productId: it.productId, qty: it.capacity, price: lookup.price(it.productId), deliveredToId: lookup.warehouse(it.warehouseId)?.receivingCompanyId ?? l.deliveredToId, routeId: it.routeIds[0] ?? l.routeId };
    }));
  }

  const supplier = $derived(form ? lookup.supplier(form.supplierId) : undefined);
  const products = $derived(form ? r.products.filter((p) => p.supplierId === form!.supplierId && p.active !== false) : []);
  const routes = $derived.by(() => { const own = r.routes.filter((rt) => rt.stops[0].checkpointId === supplier?.checkpointId); return own.length ? own : r.routes; });
  const money = $derived(!detail?.po.pricesHidden && !detail?.plan.pricesHidden);
  const trucks = $derived(form ? [...new Set(form.lines.map((l) => l.truckNo))].sort((a, b) => a - b) : []);
  // ---- loaded trucks are locked (update): no line below what was loaded, no product / route / destination change ----
  const original = $derived(detail?.plan.lines ?? []);
  const loadedTrucks = $derived(new Set(original.filter((l) => detail?.loaded[l.id] !== undefined).map((l) => l.truckNo)));
  const loadedQty = (id: string) => detail?.loaded[id];
  const lockedLine = (l: PlanLine) => editing && original.some((o) => o.id === l.id && loadedTrucks.has(o.truckNo));
  const totalQty = $derived((form?.lines ?? []).reduce((a, l) => a + (Number(l.qty) || 0), 0));
  const totalAmt = $derived((form?.lines ?? []).reduce((a, l) => a + amount(Number(l.qty) || 0, l.price ?? 0), 0));
  const overCap = $derived(trucks.filter((no) => (form?.lines ?? []).filter((l) => l.truckNo === no).reduce((a, l) => a + (Number(l.qty) || 0), 0) > TRUCK_CAP));
  const changes = $derived(editing && form ? diffPoLines(original, form.lines.map((l) => ({ ...l, qty: Math.round(Number(l.qty) || 0) })), 'updated') : []);
  const headerChanged = $derived(editing && !!form && !!detail && (form.title !== detail.plan.title || form.requiredBy !== detail.plan.requiredBy || form.currency !== detail.plan.currency || form.instruction !== detail.po.instruction));
  const problems = $derived.by(() => {
    const out: string[] = [];
    if (!form) return out;
    if (!form.title.trim()) out.push('Add a title, e.g. “October ’26 Order”.');
    if (!form.lines.length) out.push('Add at least one truck.');
    if (form.lines.some((l) => !(Number(l.qty) > 0))) out.push('Every line needs a quantity above zero.');
    for (const l of form.lines) { const got = loadedQty(l.id); if (got !== undefined && Number(l.qty) < got) out.push(`Truck ${l.truckNo} already loaded ${fmtNum(got)} cases on ${lookup.product(l.productId)?.brand} — the quantity can't go below that.`); }
    if (overCap.length) out.push(`Truck ${overCap.join(', ')} is over the ${fmtNum(TRUCK_CAP)}-case capacity.`);
    if (editing && !changes.length && !headerChanged) out.push('Nothing changed yet.');
    return out;
  });
  const nextRev = $derived(editing && detail ? Math.max(0, ...detail.versions.map((v) => v.revision), ...(detail.revisions ?? []).map((x) => x.revision ?? 0)) + 1 : 0);
  const baseRef = $derived(detail ? detail.versions[0]?.ref ?? detail.po.ref : '');

  // ---- against the period plan (information only) — update mode, from the saved version; "this PO" follows the edits ----
  let ctx = $state<LineContext[]>([]);
  const vsPlan = $derived.by(() => {
    const m = new Map<string, { productId: string; planRef?: string; planned: number; before: number; thisPo: number; known: boolean }>();
    for (const l of form?.lines ?? []) {
      const c = ctx.find((x) => original.find((y) => y.id === x.lineId)?.productId === l.productId);
      const row = m.get(l.productId) ?? { productId: l.productId, planRef: c?.periodPlanRef, planned: c?.planned ?? 0, before: c?.orderedBefore ?? 0, thisPo: 0, known: !!c };
      row.thisPo += Number(l.qty) || 0; m.set(l.productId, row);
    }
    return [...m.values()].map((x) => ({ ...x, remaining: x.planned - x.before - x.thisPo }));
  });

  // ---- lines ----
  function companyForRoute(routeId: string) { const end = lookup.route(routeId)?.stops.at(-1)?.checkpointId; return r.warehouses.find((w) => w.checkpointId === end)?.receivingCompanyId; }
  function freshLine(no: number): PlanLine {
    const l = plans.newLine({ supplierId: form!.supplierId }, no);
    if (!routes.some((rt) => rt.id === l.routeId) && routes[0]) l.routeId = routes[0].id;
    l.deliveredToId = companyForRoute(l.routeId) ?? l.deliveredToId;
    return { ...l, qty: 0 };
  }
  function addTruck() { const no = (trucks.at(-1) ?? 0) + 1; form!.lines.push(freshLine(no)); }
  function addLine(truckNo: number) {
    const prev = form!.lines.findLast((l) => l.truckNo === truckNo)!;
    const used = new Set(form!.lines.filter((l) => l.truckNo === truckNo).map((l) => l.productId));
    const next = products.find((p) => !used.has(p.id)) ?? products[0];
    form!.lines.push({ ...freshLine(truckNo), productId: next.id, price: lookup.price(next.id), deliveredToId: prev.deliveredToId, routeId: prev.routeId });
  }
  function remove(id: string) { form!.lines = form!.lines.filter((l) => l.id !== id); }
  function changeProduct(l: PlanLine) { const o = original.find((x) => x.id === l.id); l.price = o && o.productId === l.productId ? o.price : lookup.price(l.productId); }
  function changeRoute(l: PlanLine) { l.deliveredToId = companyForRoute(l.routeId) ?? l.deliveredToId; }
  function changeSupplier() { if (form) form.lines = []; }
  const input = () => {
    const f = $state.snapshot(form!) as Form;
    return { title: f.title.trim(), requiredBy: f.requiredBy, currency: f.currency, instruction: f.instruction, lines: f.lines.map((l) => ({ ...l, qty: Math.round(Number(l.qty)), id: editing && original.some((o) => o.id === l.id) ? l.id : undefined })) };
  };

  async function create() {
    tried = true; error = '';
    if (problems.length) return say('Fix the highlighted items first');
    busy = true;
    try {
      const po = await pos.create({ ...input(), entityId, supplierId: form!.supplierId, date: form!.date });
      say(po.status === 'Awaiting approval' ? `${po.ref} created — waiting for a director's approval` : `Purchase order ${po.ref} created · approved automatically`);
      router.go(prefillLeft() ? '/pos/new?prefill=1' : `/pos/${po.id}`);
      if (prefillLeft()) { form = null; tried = false; await load(); }
    } catch (e) { error = describe(e).message; }
    busy = false;
  }
  function askReason() { tried = true; error = ''; if (problems.length) return say('Fix the highlighted items first'); reason = ''; dialog?.showModal(); }
  async function update() {
    if (!reason.trim()) { error = 'Give a reason for the update — it is kept with the revision'; return; }
    busy = true; error = '';
    try {
      const next = await pos.update(detail!.effectiveId, { ...input(), reason: reason.trim() });
      dialog?.close();
      say(`Saved as ${next.ref} — the earlier version is kept`);
      router.go(`/pos/${next.id}`);
    } catch (e) { error = describe(e).message; }
    busy = false;
  }
  const pname = (id: string) => { const p = lookup.product(id); return p ? `${p.brand} ${p.pack}` : id; };
</script>

{#if loadError}
  <ErrorState error={loadError} onretry={() => { loadError = null; load(); }} />
{:else if (editing && detail === undefined) || !form}
  {#if editing && detail === null}<div class="empty"><h2>Purchase order not found</h2><a href="#/pos">Back to purchase orders</a></div>
  {:else}<div class="stack"><div class="skeleton" style="height:40px;width:40%"></div><div class="skeleton" style="height:160px"></div></div>{/if}
{:else if editing && detail && !detail.actions.update}
  <div class="page-head"><div><div class="overline crumb"><a href="#/pos">Purchase orders</a> / <a class="mono" href="#/pos/{detail.po.id}">{detail.po.ref}</a></div><h1>Update purchase order</h1></div></div>
  <div class="card flag-warning note" role="alert"><Lock size={16} /> {detail.actions.updateBlocked ?? 'You can view this purchase order but not change it.'}</div>
{:else}
  <div class="page-head">
    <div>
      <div class="overline crumb"><a href="#/pos">Purchase orders</a>{#if detail} / <a class="mono" href="#/pos/{detail.po.id}">{detail.po.ref}</a>{/if}</div>
      <h1 class="row">{editing ? 'Update purchase order' : 'Create purchase order'}{#if editing}<Badge tone="accent">saves as {revTag(nextRev)}</Badge>{/if}</h1>
      <p class="muted small" style="max-width:70ch">{#if editing}Your changes are saved as <span class="mono">{baseRef}-{revTag(nextRev)}</span>. The original and every earlier version are kept and stay viewable; loadings, shipments and reports follow the new version.
        {:else}{approvals ? 'The purchase order is created at once and waits for a director’s approval before it goes to the supplier.' : 'The purchase order is created and approved automatically — there are no drafts.'} The reference (e.g. <span class="mono">{r.entities.find((e) => e.id === entityId)?.poPrefix ?? 'BTW-PO'}-{today.slice(0, 4)}-00NN</span>) is given on create.{/if}</p>
    </div>
    <div class="row">
      <a class="btn btn-ghost" href={detail ? `#/pos/${detail.po.id}` : '#/pos'}>Cancel</a>
      {#if canEdit}
        <RecordFor entityId={entityId || undefined} what="a purchase order" cue={false}>
          {#if editing}<button class="btn btn-primary" onclick={askReason} disabled={busy}>Save update…</button>
          {:else}<button class="btn btn-primary" onclick={create} disabled={busy || !entityId || !form.supplierId}>{busy ? 'Creating…' : 'Create purchase order'}</button>{/if}
        </RecordFor>
      {/if}
    </div>
  </div>
  {#if !canEdit}<p class="error" role="alert">Only planners and directors {editing ? 'update' : 'create'} purchase orders.</p>{/if}
  {#if queued}<div class="card flag-info note small">{queued} more prefilled order{queued === 1 ? '' : 's'} after this one (from the report).</div>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if tried && problems.length}
    <div class="card flag-danger note" role="alert">
      <div class="row" style="gap:var(--space-2)"><CircleAlert size={18} /><strong>Before saving</strong></div>
      <ul>{#each problems as p}<li>{p}</li>{/each}</ul>
    </div>
  {/if}

  <div class="top-grid">
    <section class="card">
      <div class="form-grid">
        <div class="field"><span>Ordering company (letterhead)</span>
          {#if co}<div class="co"><CompanyMark entityId={entityId} size={28} /><strong>{co.name}</strong></div>{:else}<RecordFor what="a purchase order"><span></span></RecordFor>{/if}</div>
        <label class="field"><span>Addressed to (supplier export section)</span>
          {#if editing}<div class="ro">The Export Section – {supplier?.code}, {supplier?.city}, {supplier?.country}</div>
          {:else}<select class="select" bind:value={form.supplierId} onchange={changeSupplier}>{#each choices as s}<option value={s.id}>{s.code} — {s.city}, {s.country}</option>{:else}<option value="" disabled>None of your buyer–supplier pairs is for this company</option>{/each}</select>{/if}</label>
        <label class="field"><span>Title</span><input class="input" bind:value={form.title} placeholder="e.g. October '26 Order" aria-invalid={tried && !form.title.trim()} /></label>
        <label class="field"><span>Order date</span>{#if editing}<div class="ro">{fmtDate(form.date)}</div>{:else}<input class="input" type="date" bind:value={form.date} />{/if}</label>
        <label class="field"><span>Required by</span><input class="input" type="date" bind:value={form.requiredBy} /></label>
        <label class="field"><span>Order currency</span><select class="select" bind:value={form.currency}><option>USD</option><option>KES</option></select></label>
        <label class="field wide"><span>Instruction to the supplier</span><input class="input" bind:value={form.instruction} /></label>
      </div>
      {#if !editing && !choices.length}<p class="error">None of your buyer–supplier pairs is for this company (e.g. Nihna–GBI orders are raised by the directors — to confirm).</p>{/if}
    </section>
    <section class="card stack-sm">
      <div class="overline">Summary</div>
      <div class="row between"><span class="muted">Trucks</span><strong class="num">{trucks.length}</strong></div>
      <div class="row between"><span class="muted">Cases</span><strong class="num">{fmtNum(totalQty)}</strong></div>
      {#if money}<div class="row between"><span class="muted">Amount</span><strong class="num">{fmtNum(totalAmt, 2)} {form.currency}</strong></div>{/if}
      {#if editing}<div class="row between"><span class="muted">Changed lines</span><strong class="num">{changes.length}</strong></div>
        {#if loadedTrucks.size}<p class="caption"><Lock size={12} /> Truck {[...loadedTrucks].sort().join(', ')} already loaded — locked at what was loaded.</p>{/if}{/if}
    </section>
  </div>

  <section class="card flush" style="margin-top:var(--space-4)">
    <header>
      <div><h3>Trucks and lines</h3><div class="caption">One row per brand on a truck. Mixed loads: use <Layers size={12} /> to add another brand to the same truck.</div></div>
      <button class="btn btn-secondary btn-sm" onclick={addTruck} disabled={!form.supplierId}><Plus size={16} />Add truck</button>
    </header>
    <div class="table-wrap"><table class="table lines editing">
      <thead><tr><th class="num">Truck</th><th>Brand · Package</th><th>Route</th><th>Delivered to</th><th class="num">Quantity (cases)</th>{#if money}<th class="num">Price ({form.currency})</th><th class="num">Amount</th>{/if}<th><span class="sr">Actions</span></th></tr></thead>
      <tbody>
        {#each trucks as no (no)}
          {@const lines = form.lines.filter((l) => l.truckNo === no)}
          {@const truckLoaded = editing && loadedTrucks.has(no)}
          {#each lines as l, i (l.id)}
            {@const locked = lockedLine(l)}
            {@const was = original.find((o) => o.id === l.id)}
            <tr class:first={i === 0} class:changed={editing && (!was || was.qty !== Number(l.qty) || was.productId !== l.productId || was.routeId !== l.routeId || was.deliveredToId !== l.deliveredToId)}>
              <td class="num">{#if i === 0}<strong>{no}</strong>{#if truckLoaded}<div class="caption"><Lock size={11} /> loaded</div>{/if}{/if}</td>
              <td>{#if locked}{pname(l.productId)}{:else}<ProductPicker products={products} bind:value={l.productId} label="Brand and package, truck {no}" onchange={() => changeProduct(l)} />{/if}</td>
              <td>{#if locked}<span class="small">{lookup.route(l.routeId)?.name}</span>{:else}<select class="select" aria-label="Route, truck {no}" bind:value={l.routeId} onchange={() => changeRoute(l)}>{#each routes as rt}<option value={rt.id}>{rt.name}</option>{/each}</select>{/if}</td>
              <td>{#if locked}<span class="small">{lookup.company(l.deliveredToId)?.name}</span>{:else}<select class="select" aria-label="Delivered to, truck {no}" bind:value={l.deliveredToId}>{#each r.receivingCompanies as c}<option value={c.id}>{c.name}</option>{/each}</select>{/if}</td>
              <td class="num"><input class="input num qty" type="number" min={loadedQty(l.id) ?? 0} step="1" aria-label="Quantity, truck {no}" bind:value={l.qty} aria-invalid={tried && (!(Number(l.qty) > 0) || (loadedQty(l.id) ?? 0) > Number(l.qty))} />
                {#if was && editing && was.qty !== Number(l.qty)}<div class="caption">was {fmtNum(was.qty)}</div>{/if}
                {#if loadedQty(l.id) !== undefined}<div class="caption">loaded {fmtNum(loadedQty(l.id) ?? 0)}</div>{/if}</td>
              {#if money}<td class="num">{fmtNum(l.price ?? 0, 2)}</td><td class="num">{fmtNum(amount(Number(l.qty) || 0, l.price ?? 0), 2)}</td>{/if}
              <td><div class="row" style="flex-wrap:nowrap;gap:0">
                {#if i === lines.length - 1 && !truckLoaded}<button class="btn btn-ghost btn-sm" title="Add another brand to truck {no} (mixed load)" aria-label="Add brand to truck {no}" onclick={() => addLine(no)}><Layers size={16} /></button>{/if}
                {#if !locked}<button class="btn btn-ghost btn-sm" title="Remove line" aria-label="Remove line" onclick={() => remove(l.id)}><Trash size={16} /></button>{/if}</div></td>
            </tr>
          {/each}
        {:else}
          <tr><td colspan="8" class="empty">No trucks yet. <button class="btn btn-secondary btn-sm" onclick={addTruck} disabled={!form.supplierId}><Plus size={16} />Add the first truck</button></td></tr>
        {/each}
        {#if form.lines.length}<tr class="grand"><td></td><td colspan="3">Total · {trucks.length} truck{trucks.length === 1 ? '' : 's'}</td><td class="num">{fmtNum(totalQty)}</td>{#if money}<td></td><td class="num">{fmtNum(totalAmt, 2)}</td>{/if}<td></td></tr>{/if}
      </tbody>
    </table></div>
    <p class="caption foot">Prices come from the supplier price list (MD-04); directors may override them. Amount = quantity × price and is never typed.</p>
  </section>

  {#if editing && vsPlan.length}
    <section class="card flush" style="margin-top:var(--space-4)" aria-labelledby="vsplan-h">
      <header><div><h3 id="vsplan-h">Against the period plan</h3><div class="caption">For information only — the period plan never blocks a purchase order.</div></div></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Brand · Package</th><th>Period plan</th><th class="num">Planned</th><th class="num">Already ordered</th><th class="num">This PO</th><th class="num">Remaining</th></tr></thead>
        <tbody>{#each vsPlan as x (x.productId)}<tr><td>{pname(x.productId)}</td><td class="small mono">{x.planRef ?? '—'}</td><td class="num">{x.planned ? fmtNum(x.planned) : '—'}</td><td class="num">{x.planned ? fmtNum(x.before) : '—'}</td><td class="num"><strong>{fmtNum(x.thisPo)}</strong></td><td class="num" class:neg={x.remaining < 0}>{x.planned ? fmtNum(x.remaining) : '—'}</td></tr>{/each}</tbody>
      </table></div>
    </section>
  {/if}

  <dialog class="sheet" bind:this={dialog} aria-labelledby="upd-title">
    <div class="body stack">
      <h3 id="upd-title">Save update as <span class="mono">{baseRef}-{revTag(nextRev)}</span></h3>
      <p class="muted small">The current version stays in the Versions panel; the supplier gets the revised letter when you email it.</p>
      <div class="card flag-info changes">
        <strong>{changes.length} line change{changes.length === 1 ? '' : 's'}{headerChanged ? ' + order details' : ''}</strong>
        <ul class="small">{#each changes as c}<li><Badge tone={c.kind === 'added' ? 'success' : c.kind === 'removed' ? 'danger' : 'info'}>{c.kind}</Badge> {lineChangeText(c, pname)}</li>{/each}</ul>
      </div>
      <label class="field"><span>Reason for the update (required)</span><textarea class="textarea" bind:value={reason} placeholder="e.g. Supplier short on Tusker cans — truck 4 reduced" aria-invalid={!!error && !reason.trim()}></textarea></label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="row" style="justify-content:flex-end">
        <button class="btn btn-ghost" onclick={() => dialog?.close()}>Cancel</button>
        <button class="btn btn-primary" onclick={update} disabled={busy || !reason.trim()}>{busy ? 'Saving…' : `Save as ${revTag(nextRev)}`}</button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .top-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: var(--space-4); align-items: start; }
  @media (max-width: 900px) { .top-grid { grid-template-columns: minmax(0, 1fr); } }
  .top-grid .form-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .wide { grid-column: 1 / -1; }
  .co { display: flex; gap: var(--space-2); align-items: center; min-height: var(--control-md); }
  .ro { min-height: var(--control-md); display: flex; align-items: center; }
  .note { margin-bottom: var(--space-4); padding: var(--space-3) var(--space-5); display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
  .note ul { margin: var(--space-2) 0 0; padding-left: var(--space-5); width: 100%; }
  .neg { color: var(--danger); font-weight: 600; }
  .lines .select { min-width: 120px; }
  .lines td:nth-child(2) .select { min-width: 190px; }
  .lines td { padding-left: var(--space-2); padding-right: var(--space-2); }
  .lines .qty { width: 96px; }
  .lines tr.first:not(:first-child) td { border-top: 2px solid var(--border); }
  .lines tr.changed td { background: var(--warning-subtle, color-mix(in srgb, var(--warning) 10%, transparent)); }
  .foot { padding: var(--space-3) var(--space-5); margin: 0; }
  .changes { padding: var(--space-3) var(--space-4); }
  .changes ul { margin: var(--space-2) 0 0; padding-left: var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); }
  section.card { min-width: 0; max-width: 100%; }
  .table-wrap { overflow-x: auto; max-width: 100%; position: relative; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
