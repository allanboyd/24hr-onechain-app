<script lang="ts">
  // Period plan editor (§8.3 PL-06..PL-12): lines, optional monthly split, copy to the next period. Plans are suggestions:
  // no approval — planners, directors and admins save them directly (each save is a new version in the history).
  // Active plans never overlap; a replaced plan is read-only and links to the plan that replaced it.
  import { lookup, ref, type User } from '@btw/api';
  import { Badge, fmtDate, fmtDateTime, fmtMoney, fmtNum, router, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash from '@lucide/svelte/icons/trash-2';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Copy from '@lucide/svelte/icons/copy';
  import RecordFor from '../components/RecordFor.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import CompanyMark from '../components/CompanyMark.svelte';
  import { watch } from '../lib/load.svelte';
  import ReplaceDialog from '../components/ReplaceDialog.svelte';
  import { companyLabel } from '../lib/companies';
  import ProductPicker from '../components/ProductPicker.svelte';
  import { canEditPeriodPlans, destinations, destinationLabel, evenSplit, withReplace, KIND_LABEL, lineValue, monthLabel, monthsOf, periodLabel, periodPlans, planTotals, splitSum, type PeriodPlan, type PeriodPlanLine } from '../lib/planning';
  let { params, user }: { params: { id: string }; user: User } = $props();

  const r = ref();
  const dests = destinations();
  let plan = $state<PeriodPlan | null | undefined>(undefined);
  let dirty = $state(false);
  let tried = $state(false);
  let open = $state<Record<string, boolean>>({});
  let replaceDialog = $state<ReturnType<typeof ReplaceDialog>>();

  const w = watch(async () => { if (!dirty) plan = await periodPlans.get(params.id); });
  const canEdit = $derived(canEditPeriodPlans(user));
  const editable = $derived(!!plan && plan.status === 'Active' && canEdit);
  const months = $derived(plan ? monthsOf(plan.from, plan.to) : []);
  const totals = $derived(plan ? planTotals(plan) : { cases: 0, value: 0 });
  let replacedBy = $state<PeriodPlan | null>(null);
  $effect(() => { const id = plan?.replacedById; if (id) periodPlans.get(id).then((x) => (replacedBy = x)).catch(() => (replacedBy = null)); else replacedBy = null; });

  const problems = $derived.by(() => {
    const out: string[] = [];
    if (!plan) return out;
    if (!plan.lines.length) out.push('Add at least one line.');
    plan.lines.forEach((l, i) => {
      const n = `Line ${i + 1}`;
      if (!l.supplierId || !l.productId) out.push(`${n}: choose a supplier and a brand.`);
      if (!l.destinationId) out.push(`${n}: choose the destination.`);
      if (!(l.cases > 0)) out.push(`${n}: planned cases must be above zero.`);
      if (l.months && splitSum(l.months) !== l.cases) out.push(`${n}: the monthly split adds up to ${fmtNum(splitSum(l.months))}, not ${fmtNum(l.cases)}.`);
    });
    return out;
  });

  const productsFor = (supplierId: string) => r.products.filter((p) => p.supplierId === supplierId);
  function addLine() {
    const sup = r.suppliers[0]; const prod = productsFor(sup.id)[0];
    plan!.lines.push({ id: `ppl-${Date.now().toString(36)}`, supplierId: sup.id, productId: prod?.id ?? '', cases: 0, price: prod ? lookup.price(prod.id) : 0, destinationId: dests[0]?.id ?? '' });
    dirty = true;
  }
  function changeSupplier(l: PeriodPlanLine) { const p = productsFor(l.supplierId)[0]; l.productId = p?.id ?? ''; l.price = p ? lookup.price(p.id) : 0; dirty = true; }
  function changeProduct(l: PeriodPlanLine) { l.price = lookup.price(l.productId); dirty = true; }
  function changeCases(l: PeriodPlanLine) { if (l.months) l.months = evenSplit(Math.max(0, Math.round(l.cases || 0)), months); dirty = true; }
  function toggleSplit(l: PeriodPlanLine) {
    if (l.months) { delete l.months; open[l.id] = false; } else { l.months = evenSplit(Math.max(0, Math.round(l.cases || 0)), months); open[l.id] = true; }
    dirty = true;
  }
  function spread(l: PeriodPlanLine) { l.months = evenSplit(Math.max(0, Math.round(l.cases || 0)), months); dirty = true; }
  function remove(id: string) { plan!.lines = plan!.lines.filter((l) => l.id !== id); dirty = true; }

  async function save() {
    tried = true;
    const snap = $state.snapshot(plan!) as PeriodPlan;
    try {
      const saved = await withReplace((replace) => periodPlans.save(snap, { replace }), (c) => replaceDialog!.ask(c));
      if (!saved) return false;
      plan = saved; dirty = false; say(problems.length ? 'Saved — some lines still need attention' : 'Plan saved'); return true;
    } catch (e) { say((e as Error).message); return false; }
  }
  const ACTION: Record<string, string> = { created: 'Created', edited: 'Edited', replaced: 'Replaced', approved: 'Approved (before plans became suggestions)', submitted: 'Submitted', amended: 'Amended' };
</script>

{#if plan === undefined && w.error}
  <ErrorState error={w.error} onretry={w.retry} />
{:else if plan === undefined}
  <div class="stack"><div class="skeleton" style="height:40px;width:40%"></div><div class="skeleton" style="height:240px"></div></div>
{:else if plan === null}
  <div class="empty"><h2>Period plan not found</h2><a href="#/period-plans">Back to period plans</a></div>
{:else}
  <div class="page-head">
    <div>
      <div class="overline crumb"><a href="#/period-plans">Period plans</a> / {companyLabel(plan.entityId)}</div>
      <h1 class="row"><span class="mono">{plan.ref}</span> <Badge status={plan.status} />{#if plan.version > 1}<Badge tone="neutral">v{plan.version}</Badge>{/if}</h1>
      <p class="muted small row" style="gap:6px"><CompanyMark entityId={plan.entityId} size={18} />{plan.title} · <CalendarDays size={14} /> {periodLabel(plan)} ({fmtDate(plan.from)} – {fmtDate(plan.to)})</p>
    </div>
    <div class="row">
      {#if editable}
        <RecordFor entityId={plan.entityId} cue={false}><button class="btn btn-primary" onclick={() => save()} disabled={!dirty}>{dirty ? 'Save plan' : 'Saved'}</button></RecordFor>
      {/if}
      {#if canEdit}
        <button class="btn btn-ghost" onclick={() => router.go(`/period-plans/new?copy=${plan!.id}`)}><Copy size={16} />Copy to a new period</button>
      {/if}
    </div>
  </div>

  {#if plan.status === 'Replaced'}
    <div class="card flag-warning note small" role="status">
      <strong>Replaced</strong> — kept for history; it no longer counts.
      {#if plan.replacedById}Replaced by <a class="mono" href="#/period-plans/{plan.replacedById}">{replacedBy?.ref ?? 'the newer plan'}</a>{#if replacedBy} ({periodLabel(replacedBy)}){/if}.{/if}
    </div>
  {:else}
    <div class="card flag-info note small">Period plans are suggestions: saving makes the change at once (no approval). Purchase orders show it for information and are never blocked by it.</div>
  {/if}
  {#if tried && problems.length}
    <div class="card flag-warning note" role="alert"><div class="row" style="gap:var(--space-2)"><CircleAlert size={18} /><strong>Lines to check</strong></div><ul>{#each problems as p}<li>{p}</li>{/each}</ul></div>
  {/if}

  <div class="top-grid">
    <section class="card">
      <div class="form-grid">
        <label class="field"><span>Title</span>{#if editable}<input class="input" bind:value={plan.title} oninput={() => (dirty = true)} />{:else}<div class="ro">{plan.title}</div>{/if}</label>
        <div class="field"><span>Period</span><div class="ro">{KIND_LABEL[plan.periodKind]} · {periodLabel(plan)}</div></div>
        <div class="field"><span>From</span><div class="ro">{fmtDate(plan.from)}</div></div>
        <div class="field"><span>To</span><div class="ro">{fmtDate(plan.to)}</div></div>
      </div>
      {#if plan.copiedFromId}<p class="caption">Started from a copy of an earlier plan.</p>{/if}
    </section>
    <section class="card stack-sm">
      <div class="overline">Summary</div>
      <div class="row between"><span class="muted">Lines</span><strong class="num">{plan.lines.length}</strong></div>
      <div class="row between"><span class="muted">Planned cases</span><strong class="num">{fmtNum(totals.cases)}</strong></div>
      <div class="row between"><span class="muted">Planned value</span><strong class="num">{fmtMoney(totals.value, 'USD')}</strong></div>
      <div class="row between"><span class="muted">Months</span><span>{months.length}</span></div>
      {#if plan.status === 'Active'}<a class="small" href="#/reports?r=pv">Planned vs actual →</a>{/if}
    </section>
  </div>

  <section class="card flush" style="margin-top:var(--space-4)">
    <header>
      <div><h3>Plan lines</h3><div class="caption">One line per supplier, brand · package and destination. Use “Split by month” to spread the cases over the period.</div></div>
      {#if editable}<button class="btn btn-secondary btn-sm" onclick={addLine}><Plus size={16} />Add line</button>{/if}
    </header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Supplier</th><th>Brand · Package</th><th>Delivered to</th><th class="num">Planned cases</th><th class="num">Price (USD)</th><th class="num">Amount (USD)</th><th>Monthly split</th>{#if editable}<th><span class="sr">Actions</span></th>{/if}</tr></thead>
      <tbody>
        {#each plan.lines as l, i (l.id)}
          <tr>
            <td>{#if editable}<select class="select" aria-label="Supplier, line {i + 1}" bind:value={l.supplierId} onchange={() => changeSupplier(l)}>{#each r.suppliers as s}<option value={s.id}>{s.code} — {s.city}</option>{/each}</select>
              {:else}{lookup.supplier(l.supplierId)?.code} · {lookup.supplier(l.supplierId)?.city}{/if}</td>
            <td>{#if editable}<ProductPicker products={productsFor(l.supplierId)} bind:value={l.productId} label="Brand, line {i + 1}" invalid={tried && !l.productId} onchange={() => changeProduct(l)} />
              {:else}{lookup.product(l.productId)?.brand} · {lookup.product(l.productId)?.pack}{/if}</td>
            <td>{#if editable}<select class="select" aria-label="Destination, line {i + 1}" bind:value={l.destinationId} onchange={() => (dirty = true)} aria-invalid={tried && !l.destinationId}>{#each dests as d}<option value={d.id}>{d.label}</option>{/each}</select>
              {:else}{destinationLabel(l.destinationId)}{/if}</td>
            <td class="num">{#if editable}<input class="input num qty" type="number" min="0" step="100" aria-label="Planned cases, line {i + 1}" bind:value={l.cases} oninput={() => changeCases(l)} aria-invalid={tried && !(l.cases > 0)} />{:else}{fmtNum(l.cases)}{/if}</td>
            <td class="num">{fmtNum(l.price, 2)}</td>
            <td class="num">{fmtNum(lineValue(l), 2)}</td>
            <td>
              {#if l.months}
                <button class="btn btn-ghost btn-sm" aria-expanded={!!open[l.id]} onclick={() => (open[l.id] = !open[l.id])}>{months.length} months{#if splitSum(l.months) !== l.cases}<Badge tone="danger">{fmtNum(splitSum(l.months))}</Badge>{/if}</button>
              {:else if editable}<button class="btn btn-ghost btn-sm" onclick={() => toggleSplit(l)}>Split by month</button>
              {:else}<span class="caption">evenly</span>{/if}
            </td>
            {#if editable}<td><button class="btn btn-ghost btn-sm" title="Remove line" aria-label="Remove line {i + 1}" onclick={() => remove(l.id)}><Trash size={16} /></button></td>{/if}
          </tr>
          {#if l.months && open[l.id]}
            <tr class="split"><td colspan={editable ? 8 : 7}>
              <div class="months">
                {#each months as k (k)}
                  <label class="m"><span class="caption">{monthLabel(k)}</span>
                    {#if editable}<input class="input num" type="number" min="0" step="10" aria-label="{monthLabel(k)} cases, line {i + 1}" bind:value={l.months[k]} oninput={() => (dirty = true)} />{:else}<strong class="num">{fmtNum(l.months[k] ?? 0)}</strong>{/if}</label>
                {/each}
                <div class="m sum" class:bad={splitSum(l.months) !== l.cases}><span class="caption">Total</span><strong class="num">{fmtNum(splitSum(l.months))} / {fmtNum(l.cases)}</strong></div>
              </div>
              {#if editable}<div class="row" style="margin-top:var(--space-2)"><button class="btn btn-ghost btn-sm" onclick={() => spread(l)}>Spread evenly</button><button class="btn btn-ghost btn-sm" onclick={() => toggleSplit(l)}>Remove split</button></div>{/if}
            </td></tr>
          {/if}
        {:else}
          <tr><td colspan="8" class="empty">No lines yet. {#if editable}<button class="btn btn-secondary btn-sm" onclick={addLine}><Plus size={16} />Add the first line</button>{/if}</td></tr>
        {/each}
        {#if plan.lines.length}<tr class="grand"><td colspan="3">Total · {plan.lines.length} line{plan.lines.length === 1 ? '' : 's'}</td><td class="num">{fmtNum(totals.cases)}</td><td></td><td class="num">{fmtNum(totals.value, 2)}</td><td></td>{#if editable}<td></td>{/if}</tr>{/if}
      </tbody>
    </table></div>
  </section>

  <section class="card" style="margin-top:var(--space-4)">
    <div class="overline" style="margin-bottom:var(--space-3)">Edit history · version {plan.version}</div>
    <ol class="timeline">
      {#if !plan.history.some((h) => h.action === 'created')}<li class="done"><span class="dot"></span><div><div style="font-weight:600">Created</div><div class="caption">{lookup.user(plan.createdById)?.name ?? '—'}</div></div><span></span></li>{/if}
      {#each plan.history as h}
        <li class="done"><span class="dot"></span><div>
          <div style="font-weight:600">{ACTION[h.action] ?? h.action}</div>
          <div class="caption">{lookup.user(h.byUserId)?.name ?? '—'} · {fmtDateTime(h.at)}</div>
          {#if h.comment}<div class="small">{h.comment}</div>{/if}
        </div><span></span></li>
      {/each}
    </ol>
  </section>
  <ReplaceDialog bind:this={replaceDialog} />
{/if}

<style>
  .top-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: var(--space-4); align-items: start; }
  @media (max-width: 900px) { .top-grid { grid-template-columns: minmax(0, 1fr); } }
  .ro { min-height: var(--control-md); display: flex; align-items: center; }
  .note { margin-bottom: var(--space-4); padding: var(--space-3) var(--space-5); }
  .note ul { margin: var(--space-2) 0 0; padding-left: var(--space-4); }
  .qty { width: 110px; }
  .split td { background: var(--surface-sunken); }
  .months { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .m { display: flex; flex-direction: column; gap: 2px; min-width: 96px; }
  .m .input { width: 96px; }
  .m.sum { justify-content: flex-end; padding-left: var(--space-3); border-left: 1px solid var(--border); }
  .m.sum.bad strong { color: var(--danger); }
</style>
