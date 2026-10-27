<script lang="ts">
  // New period plan (PL-06, PL-11): pick the period, optionally start from an earlier plan.
  import type { User } from '@btw/api';
  import { router, say } from '@btw/ui';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import RecordFor from '../components/RecordFor.svelte';
  import CompanyMark from '../components/CompanyMark.svelte';
  import { company, GROUP } from '../lib/company.svelte';
  import { companyBrand } from '../lib/companies';
  import { qp } from '../lib/tab';
  import ReplaceDialog from '../components/ReplaceDialog.svelte';
  import { canEditPeriodPlans, KIND_LABEL, monthsOf, periodFor, periodLabel, periodPlans, planTotals, withReplace, type PeriodKind, type PeriodPlan } from '../lib/planning';
  let { user }: { user: User } = $props();
  const entityId = $derived(company.active === GROUP ? '' : company.active);
  const co = $derived(entityId ? companyBrand(entityId) : null);

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  let kind = $state<PeriodKind>('quarter');
  let startMonth = $state(nextMonth);
  let customFrom = $state(`${nextMonth}-01`);
  let customTo = $state(periodFor('quarter', `${nextMonth}-01`).to);
  let title = $state('');
  let copyFrom = $state(qp('copy'));
  let busy = $state(false);
  let earlier = $state<PeriodPlan[]>([]);
  let overlaps = $state<PeriodPlan[]>([]);
  let replaceDialog = $state<ReturnType<typeof ReplaceDialog>>();

  const period = $derived(kind === 'custom' ? { from: customFrom, to: customTo } : periodFor(kind, `${startMonth}-01`));
  const valid = $derived(!!period.from && !!period.to && period.from <= period.to);
  const label = $derived(valid ? periodLabel({ ...period, periodKind: kind }) : '—');
  $effect(() => { periodPlans.list({ all: true }).then((ps) => (earlier = ps.filter((p) => p.entityId === entityId))); });
  $effect(() => {
    const p = { id: '', entityId, from: period.from, to: period.to };
    if (entityId && valid) periodPlans.overlaps(p).then((o) => (overlaps = o)); else overlaps = [];
  });
  const canCreate = $derived(canEditPeriodPlans(user));

  async function create(e: Event) {
    e.preventDefault();
    if (!valid) return say('Choose a valid period');
    busy = true;
    try {
      const t = title.trim() || `${co?.shortName ?? ''} ${label}`.trim();
      // Plans never overlap: on a 409 ask "… already covers … Replace it?" and resend with replace: true.
      let p = await withReplace((replace) => copyFrom ? periodPlans.copy(copyFrom, { ...period, title: t, replace }) : periodPlans.create({ entityId, periodKind: kind, ...period, title: t, replace }), (c) => replaceDialog!.ask(c));
      if (!p) { busy = false; return; }
      if (p.periodKind !== kind) p = await periodPlans.save({ ...p, periodKind: kind });
      router.go(`/period-plans/${p.id}`);
    } catch (err) { say((err as Error).message); busy = false; }
  }
</script>

<div class="page-head"><div><div class="overline crumb"><a href="#/period-plans">Period plans</a></div><h1>New period plan</h1></div></div>
<div class="grid wrap">
  <form class="card stack" onsubmit={create}>
    <div class="field"><span>Company</span>
      {#if co}<div class="co"><CompanyMark {entityId} size={32} /><div><strong>{co.name}</strong><div class="caption">Switch company in the top bar to plan for another company.</div></div></div>
      {:else}<RecordFor what="a period plan"><span></span></RecordFor>{/if}</div>

    <fieldset class="kinds">
      <legend class="label">Period</legend>
      {#each Object.entries(KIND_LABEL) as [k, l] (k)}
        <label class="sel-chip kind"><input type="radio" name="kind" value={k} bind:group={kind} />{l}</label>
      {/each}
    </fieldset>
    {#if kind === 'custom'}
      <div class="form-grid">
        <label class="field"><span>From</span><input class="input" type="date" bind:value={customFrom} /></label>
        <label class="field"><span>To</span><input class="input" type="date" bind:value={customTo} aria-invalid={!valid} /></label>
      </div>
      <p class="caption">Tip: pick the first day of a month and the last day of another to plan whole months.</p>
    {:else}
      <label class="field"><span>{kind === 'month' ? 'Month' : 'Starting in'}</span><input class="input" type="month" bind:value={startMonth} />
        {#if kind !== 'month'}<span class="help">{KIND_LABEL[kind]}s follow the calendar: the period below is aligned automatically.</span>{/if}</label>
    {/if}
    <div class="summary"><strong>{label}</strong><span class="caption">{period.from} → {period.to} · {valid ? monthsOf(period.from, period.to).length : 0} month(s)</span></div>

    <label class="field"><span>Title (optional)</span><input class="input" bind:value={title} placeholder={`${co?.shortName ?? 'Company'} ${label}`} /></label>
    <label class="field"><span>Start from an earlier plan (optional)</span>
      <select class="select" bind:value={copyFrom}>
        <option value="">Start empty</option>
        {#each earlier as p (p.id)}<option value={p.id}>{p.ref} · {periodLabel(p)} · {p.lines.length} lines · {p.status}</option>{/each}
      </select>
      <span class="help">Copies every line (supplier, brand, cases, price, destination); monthly splits are spread evenly over the new period.</span></label>

    {#if overlaps.length}
      <div class="card flag-warning warn" role="alert">
        <div class="row" style="gap:var(--space-2)"><TriangleAlert size={18} /><strong>This period overlaps {overlaps.length} existing plan{overlaps.length === 1 ? '' : 's'}</strong></div>
        <ul>{#each overlaps as o (o.id)}<li><a href="#/period-plans/{o.id}" class="mono">{o.ref}</a> · {periodLabel(o)} · {planTotals(o).cases.toLocaleString()} cases</li>{/each}</ul>
        <p class="caption">Plans never overlap: creating this one will ask to replace {overlaps.length === 1 ? 'it' : 'them'} (kept for history, no longer counted).</p>
      </div>
    {/if}
    {#if !canCreate}<p class="error">Only planners, directors and admins create period plans.</p>{/if}
    <div class="row"><button class="btn btn-primary" disabled={busy || !canCreate || !entityId || !valid}>{copyFrom ? 'Copy into a new plan' : 'Create plan'} <ArrowRight size={16} /></button><a class="btn btn-ghost" href="#/period-plans">Cancel</a></div>
  </form>
  <aside class="card stack-sm">
    <div class="overline">How period plans work</div>
    <ol class="small steps">
      <li>Add lines: supplier, brand · package, planned cases, price, destination.</li>
      <li>Optionally spread each line over the months.</li>
      <li>Save — the plan is in force at once (no approval); every save is kept in the edit history.</li>
      <li>One plan per period: a new plan over an existing period replaces it (the old one is kept for history).</li>
      <li>Purchase orders show planned, already ordered and remaining for information — a plan never blocks an order.</li>
    </ol>
  </aside>
</div>
<ReplaceDialog bind:this={replaceDialog} />

<style>
  .wrap { grid-template-columns: minmax(0, 640px) minmax(0, 340px); align-items: start; }
  @media (max-width: 1100px) { .wrap { grid-template-columns: minmax(0, 1fr); } }
  .co { display: flex; gap: var(--space-3); align-items: center; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-left: 4px solid var(--company-accent, var(--accent)); border-radius: var(--radius-md); background: var(--surface); }
  .kinds { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .kinds legend { margin-bottom: var(--space-2); }
  .kind { height: var(--control-md); padding: 0 14px; font-size: 14px; } /* .sel-chip: filled + tick when chosen */
  .summary { display: flex; flex-direction: column; padding: var(--space-3); background: var(--surface-sunken); border-radius: var(--radius-md); }
  .warn { padding: var(--space-3) var(--space-4); } .warn ul { margin: var(--space-2) 0; padding-left: var(--space-4); }
  .steps { margin: 0; padding-left: var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); }
</style>
