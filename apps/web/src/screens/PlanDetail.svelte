<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { amount, lookup, plans, ref, type Plan, type PlanLine, type User } from '@btw/api';
  import { Badge, SignaturePad, fmtDate, fmtDateTime, fmtMoney, fmtNum, say } from '@btw/ui';
  import Trash from '@lucide/svelte/icons/trash-2';
  import Plus from '@lucide/svelte/icons/plus';
  import Layers from '@lucide/svelte/icons/layers';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  let { params, user }: { params: { id: string }; user: User } = $props();

  const r = ref();
  const TRUCK_CAP = 2200; // default until a truck is assigned at loading (§7.3 #3)
  let plan = $state<Plan | null | undefined>(undefined);
  let dirty = $state(false);
  let tried = $state(false); // show validation only after a submit attempt
  let dialog = $state<HTMLDialogElement>();
  let decision = $state<'approved' | 'returned' | 'rejected'>('approved');
  let comment = $state('');
  let signature = $state('');

  const w = watch(async () => { if (!dirty) plan = await plans.get(params.id); });

  const editable = $derived(!!plan && (plan.status === 'Draft' || plan.status === 'Returned') && user.roles.includes('planner'));
  const canDecide = $derived(!!plan && plan.status === 'Submitted' && user.roles.includes('director'));
  const supplier = $derived(plan ? lookup.supplier(plan.supplierId) : undefined);
  const products = $derived(plan ? r.products.filter((p) => p.supplierId === plan!.supplierId) : []);
  // Only routes that start at this supplier's loading point (§17.2 lanes)
  const routes = $derived.by(() => {
    const own = r.routes.filter((rt) => rt.stops[0].checkpointId === supplier?.checkpointId);
    return own.length ? own : r.routes;
  });
  const trucks = $derived(plan ? [...new Set(plan.lines.map((l) => l.truckNo))].sort((a, b) => a - b) : []);
  const byPack = $derived.by(() => {
    const m = new Map<string, { label: string; qty: number; amt: number }>();
    for (const l of plan?.lines ?? []) {
      const p = lookup.product(l.productId)!;
      const cur = m.get(p.id) ?? { label: `${p.brand} · ${p.pack}`, qty: 0, amt: 0 };
      cur.qty += l.qty; cur.amt += amount(l.qty, l.price); m.set(p.id, cur);
    }
    return [...m.values()];
  });
  const totalQty = $derived((plan?.lines ?? []).reduce((a, l) => a + l.qty, 0));
  const totalAmt = $derived((plan?.lines ?? []).reduce((a, l) => a + amount(l.qty, l.price), 0));
  const overCap = $derived(trucks.filter((no) => (plan?.lines ?? []).filter((l) => l.truckNo === no).reduce((a, l) => a + l.qty, 0) > TRUCK_CAP));
  const problems = $derived.by(() => {
    const out: string[] = [];
    if (!plan) return out;
    if (!plan.title.trim()) out.push('Add a title, e.g. “October ’26 Order”.');
    if (!plan.lines.length) out.push('Add at least one truck.');
    if (plan.lines.some((l) => !l.qty || l.qty <= 0)) out.push('Every line needs a quantity above zero.');
    if (overCap.length) out.push(`Truck ${overCap.join(', ')} is over the ${fmtNum(TRUCK_CAP)}-case capacity.`);
    return out;
  });
  const span = $derived(editable ? 3 : 2);
  const lastComment = $derived(plan?.history.findLast((h) => h.action === 'returned' || h.action === 'rejected'));

  // Delivered-to follows the route's destination warehouse (§17.7); planner can still change it.
  function companyForRoute(routeId: string) {
    const end = lookup.route(routeId)?.stops.at(-1)?.checkpointId;
    return r.warehouses.find((w) => w.checkpointId === end)?.receivingCompanyId;
  }
  function freshLine(no: number): PlanLine {
    const l = plans.newLine(plan!, no);
    if (!routes.some((rt) => rt.id === l.routeId)) l.routeId = routes[0].id;
    l.deliveredToId = companyForRoute(l.routeId) ?? l.deliveredToId;
    return l;
  }
  function addTruck() { const no = (trucks.at(-1) ?? 0) + 1; plan!.lines.push(freshLine(no)); dirty = true; }
  function addLine(truckNo: number) {
    const prev = plan!.lines.findLast((l) => l.truckNo === truckNo)!;
    const used = new Set(plan!.lines.filter((l) => l.truckNo === truckNo).map((l) => l.productId));
    const next = products.find((p) => !used.has(p.id)) ?? products[0];
    plan!.lines.push({ ...freshLine(truckNo), productId: next.id, price: lookup.price(next.id), deliveredToId: prev.deliveredToId, routeId: prev.routeId });
    dirty = true;
  }
  function remove(id: string) { plan!.lines = plan!.lines.filter((l) => l.id !== id); dirty = true; }
  function changeProduct(l: PlanLine) { l.price = lookup.price(l.productId); dirty = true; }
  function changeRoute(l: PlanLine) { l.deliveredToId = companyForRoute(l.routeId) ?? l.deliveredToId; dirty = true; }
  async function save(quiet = false) {
    try { plan = await plans.save($state.snapshot(plan!) as Plan); dirty = false; if (!quiet) say('Draft saved'); return true; }
    catch (e) { say((e as Error).message); return false; }
  }
  async function submit() {
    tried = true;
    if (problems.length) return say('Fix the highlighted items before submitting');
    try { if (dirty && !(await save(true))) return; plan = await plans.submit(plan!.id); say('Submitted — directors have been notified (PL-05)'); }
    catch (e) { say((e as Error).message); }
  }
  function openDecision(d: typeof decision) { decision = d; comment = ''; signature = ''; dialog?.showModal(); }
  async function decide() {
    if (decision === 'approved' && !signature) return say('Signature required to approve (PL-03)');
    if (decision !== 'approved' && !comment.trim()) return say('Add a comment for the planner');
    plan = await plans.decide(plan!.id, decision, comment, signature); dialog?.close();
    say(decision === 'approved' ? 'Approved — purchase order generated (PO-01)' : `Plan ${decision} — planner notified`);
  }
</script>

{#if plan === undefined && w.error}
  <ErrorState error={w.error} onretry={w.retry} />
{:else if plan === undefined}
  <div class="stack"><div class="skeleton" style="height:40px;width:40%"></div><div class="skeleton" style="height:160px"></div><div class="skeleton" style="height:240px"></div></div>
{:else if plan === null}
  <div class="empty"><h2>Plan not found</h2><a href="#/plans">Back to plans</a></div>
{:else}
  <div class="page-head">
    <div>
      <div class="overline crumb"><a href="#/plans">Plans</a> / {lookup.entity(plan.entityId)?.code}</div>
      <h1 class="row"><span class="mono">{plan.ref}</span> <Badge status={plan.status} />{#if plan.version > 1}<Badge tone="neutral">v{plan.version}</Badge>{/if}</h1>
    </div>
    <div class="row">
      {#if editable}
        <button class="btn btn-secondary" onclick={() => save()} disabled={!dirty}>{dirty ? 'Save draft' : 'Saved'}</button>
        <button class="btn btn-primary" onclick={submit}>Submit for approval</button>
      {/if}
      {#if canDecide}
        <button class="btn btn-secondary" onclick={() => openDecision('returned')}>Return</button>
        <button class="btn btn-danger" onclick={() => openDecision('rejected')}>Reject</button>
        <button class="btn btn-accent" onclick={() => openDecision('approved')}>Approve & sign</button>
      {/if}
      {#if plan.poId}
        <button class="btn btn-secondary" onclick={() => say('Amendment = new version with reason + director approval; v1 stays in history (PL-04) — next iteration')}>Amend</button>
        <a class="btn btn-primary" href="#/pos/{plan.poId}">View purchase order</a>
      {/if}
    </div>
  </div>

  {#if lastComment && (plan.status === 'Returned' || plan.status === 'Rejected')}
    <div class="card flag-{plan.status === 'Rejected' ? 'danger' : 'warning'} note">
      <strong>{plan.status === 'Rejected' ? 'Rejected' : 'Returned for changes'} by {lookup.user(lastComment.byUserId)?.name}</strong> · {fmtDateTime(lastComment.at)}
      {#if lastComment.comment}<div>“{lastComment.comment}”</div>{/if}
    </div>
  {/if}
  {#if plan.status === 'Approved'}
    <div class="card flag-info note small">Approved plans are locked (PL-03). Changes go through a versioned amendment with a reason and director approval (PL-04).</div>
  {/if}
  {#if tried && problems.length}
    <div class="card flag-danger note" role="alert">
      <div class="row" style="gap:var(--space-2)"><CircleAlert size={18} /><strong>Before submitting</strong></div>
      <ul>{#each problems as p}<li>{p}</li>{/each}</ul>
    </div>
  {/if}

  <div class="top-grid">
    <section class="card">
      <div class="form-grid">
        <div class="field"><span>Ordering entity</span><div class="ro">{lookup.entity(plan.entityId)?.name}</div></div>
        <div class="field"><span>Addressed to</span><div class="ro">The Export Section – {supplier?.code}, {supplier?.city}, {supplier?.country}</div></div>
        <label class="field"><span>Title</span>
          {#if editable}<input class="input" bind:value={plan.title} oninput={() => (dirty = true)} placeholder="e.g. October '26 Order" aria-invalid={tried && !plan.title.trim()} />
          {:else}<div class="ro">{plan.title || '—'}</div>{/if}</label>
        <label class="field"><span>Order date</span>
          {#if editable}<input class="input" type="date" bind:value={plan.date} oninput={() => (dirty = true)} /><span class="help">{fmtDate(plan.date)}</span>
          {:else}<div class="ro">{fmtDate(plan.date)}</div>{/if}</label>
        <label class="field"><span>Required by</span>
          {#if editable}<input class="input" type="date" bind:value={plan.requiredBy} oninput={() => (dirty = true)} /><span class="help">{fmtDate(plan.requiredBy)}</span>
          {:else}<div class="ro">{fmtDate(plan.requiredBy)}</div>{/if}</label>
        <label class="field"><span>Order currency</span>
          {#if editable}<select class="select" bind:value={plan.currency} onchange={() => (dirty = true)}><option>USD</option><option>KES</option></select>
          {:else}<div class="ro">{plan.currency}</div>{/if}</label>
      </div>
    </section>
    <section class="card stack-sm">
      <div class="overline">Summary</div>
      <div class="row between"><span class="muted">Trucks</span><strong class="num">{trucks.length}</strong></div>
      <div class="row between"><span class="muted">Cases</span><strong class="num">{fmtNum(totalQty)}</strong></div>
      <div class="row between"><span class="muted">Amount</span><strong class="num">{fmtMoney(totalAmt, plan.currency)}</strong></div>
      <div class="row between"><span class="muted">Prepared by</span><span>{lookup.user(plan.createdById)?.name}</span></div>
      <div class="row between"><span class="muted">Version</span><span>v{plan.version}</span></div>
    </section>
  </div>

  <section class="card flush" style="margin-top:var(--space-4)">
    <header>
      <div><h3>Order lines</h3><div class="caption">One row per brand on a truck. Mixed loads: use <Layers size={12} /> to add another brand to the same truck.</div></div>
      {#if editable}<button class="btn btn-secondary btn-sm" onclick={addTruck}><Plus size={16} />Add truck</button>{/if}
    </header>
    <div class="table-wrap"><table class="table lines" class:editing={editable}>
      <thead><tr><th class="num">Truck No.</th><th>Brand · Package</th><th>Route{#if !editable}{' · delivered to'}{/if}</th>{#if editable}<th>Delivered to</th>{/if}<th class="num">Quantity (cases)</th><th class="num">Price ({plan.currency})</th><th class="num">Amount ({plan.currency})</th>{#if editable}<th><span class="sr">Actions</span></th>{/if}</tr></thead>
      <tbody>
        {#each trucks as no (no)}
          {@const lines = plan.lines.filter((l) => l.truckNo === no)}
          {@const tq = lines.reduce((a, l) => a + l.qty, 0)}
          {#each lines as l, i (l.id)}
            <tr class:first={i === 0}>
              <td class="num">{#if i === 0}<strong>{no}</strong>{/if}</td>
              <td>{#if editable}<select class="select" aria-label="Brand and package, truck {no}" bind:value={l.productId} onchange={() => changeProduct(l)}>{#each products as p}<option value={p.id}>{p.brand} · {p.pack}</option>{/each}</select>
                {:else}{lookup.product(l.productId)?.brand} · {lookup.product(l.productId)?.pack}{/if}</td>
              <td>{#if editable}<select class="select" aria-label="Route, truck {no}" bind:value={l.routeId} onchange={() => changeRoute(l)}>{#each routes as rt}<option value={rt.id}>{rt.name}</option>{/each}</select>
                {:else}<span class="small">{lookup.route(l.routeId)?.name}</span><div class="caption">→ {lookup.company(l.deliveredToId)?.name}</div>{/if}</td>
              {#if editable}<td><select class="select" aria-label="Delivered to, truck {no}" bind:value={l.deliveredToId} onchange={() => (dirty = true)}>{#each r.receivingCompanies as c}<option value={c.id}>{c.name}</option>{/each}</select></td>{/if}
              <td class="num">{#if editable}<input class="input num qty" type="number" min="0" step="1" aria-label="Quantity, truck {no}" bind:value={l.qty} oninput={() => (dirty = true)} aria-invalid={tried && !(l.qty > 0)} />{:else}{fmtNum(l.qty)}{/if}</td>
              <td class="num">{fmtNum(l.price, 2)}</td>
              <td class="num">{fmtNum(amount(l.qty, l.price), 2)}</td>
              {#if editable}<td><div class="row" style="flex-wrap:nowrap;gap:0">
                {#if i === lines.length - 1}<button class="btn btn-ghost btn-sm" title="Add another brand to truck {no} (mixed load)" aria-label="Add brand to truck {no}" onclick={() => addLine(no)}><Layers size={16} /></button>{/if}
                <button class="btn btn-ghost btn-sm" title="Remove line" aria-label="Remove line" onclick={() => remove(l.id)}><Trash size={16} /></button></div></td>{/if}
            </tr>
          {/each}
          {#if lines.length > 1 || tq > TRUCK_CAP}
            <tr class="subtotal"><td></td><td colspan={span}>Truck {no} subtotal{#if lines.length > 1}{' · mixed load'}{/if} {#if tq > TRUCK_CAP}<Badge tone="danger">Over capacity · max {fmtNum(TRUCK_CAP)}</Badge>{/if}</td><td class="num">{fmtNum(tq)}</td><td></td><td class="num">{fmtNum(lines.reduce((a, l) => a + amount(l.qty, l.price), 0), 2)}</td>{#if editable}<td></td>{/if}</tr>
          {/if}
        {:else}
          <tr><td colspan={span + 5} class="empty">No trucks yet. {#if editable}<button class="btn btn-secondary btn-sm" onclick={addTruck}><Plus size={16} />Add the first truck</button>{/if}</td></tr>
        {/each}
        {#if byPack.length > 1}
          {#each byPack as b}<tr class="subtotal"><td></td><td colspan={span}>Subtotal · {b.label}</td><td class="num">{fmtNum(b.qty)}</td><td></td><td class="num">{fmtNum(b.amt, 2)}</td>{#if editable}<td></td>{/if}</tr>{/each}
        {/if}
        {#if plan.lines.length}
          <tr class="grand"><td></td><td colspan={span}>Grand total · {trucks.length} truck{trucks.length === 1 ? '' : 's'}</td><td class="num">{fmtNum(totalQty)}</td><td></td><td class="num">{fmtNum(totalAmt, 2)}</td>{#if editable}<td></td>{/if}</tr>
        {/if}
      </tbody>
    </table></div>
    {#if editable}<p class="caption foot">Prices come from the supplier price list (MD-04) and can only be changed by permitted users. Amount = quantity × price and is never typed.</p>{/if}
  </section>

  <section class="card" style="margin-top:var(--space-4)">
    <div class="overline" style="margin-bottom:var(--space-3)">Approval history</div>
    <ol class="timeline">
      <li class="done"><span class="dot"></span><div><div style="font-weight:600">Created</div><div class="caption">{lookup.user(plan.createdById)?.name} · {fmtDate(plan.date)}</div></div><span></span></li>
      {#each plan.history as h}
        <li class="done"><span class="dot"></span><div>
          <div style="font-weight:600;text-transform:capitalize">{h.action}</div>
          <div class="caption">{lookup.user(h.byUserId)?.name} · {fmtDateTime(h.at)}</div>
          {#if h.comment}<div class="small">“{h.comment}”</div>{/if}
          {#if h.signature}<div class="sigrow">{#if h.signature.startsWith('data:')}<img src={h.signature} alt="Signature of {lookup.user(h.byUserId)?.name}" />{/if}<span class="caption">E-signature and date stamp applied</span></div>{/if}
        </div><span></span></li>
      {/each}
      {#if plan.status === 'Draft'}<li><span class="dot"></span><div><div style="font-weight:600">Waiting for submission</div><div class="caption">Directors are notified when you submit</div></div><span></span></li>{/if}
      {#if plan.status === 'Submitted'}<li class="here"><span class="dot"></span><div><div style="font-weight:600">Waiting for director decision</div><div class="caption">Approve, return or reject — on web or in the app</div></div><span></span></li>{/if}
    </ol>
  </section>

  <dialog class="sheet" bind:this={dialog} aria-labelledby="dec-title">
    <div class="body stack">
      <h3 id="dec-title">{decision === 'approved' ? 'Approve & sign' : decision === 'returned' ? 'Return to planner' : 'Reject plan'}</h3>
      <p class="muted small"><span class="mono">{plan.ref}</span> · {plan.title} · {trucks.length} trucks · {fmtNum(totalQty)} cases · <strong>{fmtMoney(totalAmt, plan.currency)}</strong></p>
      {#if decision === 'approved'}
        <SignaturePad bind:value={signature} />
        <p class="caption">Your signature and today's date stamp go on the purchase order. The plan is then locked and the PO is generated (PL-03, PO-01).</p>
      {/if}
      <label class="field"><span>Comment {decision === 'approved' ? '(optional)' : '(required)'}</span><textarea class="textarea" bind:value={comment} placeholder={decision === 'approved' ? '' : 'Tell the planner what to change'}></textarea></label>
      <div class="row" style="justify-content:flex-end">
        <button class="btn btn-ghost" onclick={() => dialog?.close()}>Cancel</button>
        <button class="btn {decision === 'approved' ? 'btn-accent' : decision === 'rejected' ? 'btn-danger' : 'btn-primary'}" onclick={decide}>{decision === 'approved' ? 'Approve & sign' : decision === 'returned' ? 'Return plan' : 'Reject plan'}</button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .top-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: var(--space-4); align-items: start; }
  @media (max-width: 900px) { .top-grid { grid-template-columns: minmax(0, 1fr); } }
  .top-grid .form-grid { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .lines:not(.editing) th { white-space: normal; }
  .ro { min-height: var(--control-md); display: flex; align-items: center; }
  .note { margin-bottom: var(--space-4); padding: var(--space-3) var(--space-5); }
  .note ul { margin: var(--space-2) 0 0; padding-left: var(--space-5); }
  .lines.editing .select { min-width: 100px; }
  .lines.editing td:nth-child(2) .select { min-width: 190px; }
  .lines.editing td:nth-child(3) .select { min-width: 160px; }
  .lines.editing td { padding-left: var(--space-2); padding-right: var(--space-2); }
  .lines .qty { width: 96px; }
  .lines tr.first:not(:first-child) td { border-top: 2px solid var(--border); }
  .foot { padding: var(--space-3) var(--space-5); margin: 0; }
  .sigrow { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-1); }
  .sigrow img { height: 36px; background: var(--surface-sunken); border-radius: var(--radius-sm); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
