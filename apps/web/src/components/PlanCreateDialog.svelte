<script lang="ts">
  // New period plan, opened over the list. Two steps: the period, then the name.
  import type { User } from '@btw/api';
  import { router, say } from '@btw/ui';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import RecordFor from './RecordFor.svelte';
  import CompanyMark from './CompanyMark.svelte';
  import ReplaceDialog from './ReplaceDialog.svelte';
  import { company, GROUP } from '../lib/company.svelte';
  import { companyBrand } from '../lib/companies';
  import { canEditPeriodPlans, KIND_LABEL, monthsOf, periodFor, periodLabel, periodPlans, planTotals, withReplace, type PeriodKind, type PeriodPlan } from '../lib/planning';

  let { user, open = $bindable(false) }: { user: User; open?: boolean } = $props();
  const entityId = $derived(company.active === GROUP ? '' : company.active);
  const co = $derived(entityId ? companyBrand(entityId) : null);
  const nextMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();

  let dlg = $state<HTMLDialogElement>();
  let step = $state<1 | 2>(1);
  let kind = $state<PeriodKind>('quarter');
  let startMonth = $state(nextMonth);
  let customFrom = $state(`${nextMonth}-01`);
  let customTo = $state(periodFor('quarter', `${nextMonth}-01`).to);
  let title = $state('');
  let copyFrom = $state('');
  let busy = $state(false);
  let earlier = $state<PeriodPlan[]>([]);
  let overlaps = $state<PeriodPlan[]>([]);
  let replaceDialog = $state<ReturnType<typeof ReplaceDialog>>();

  const period = $derived(kind === 'custom' ? { from: customFrom, to: customTo } : periodFor(kind, `${startMonth}-01`));
  const valid = $derived(!!period.from && !!period.to && period.from <= period.to);
  const label = $derived(valid ? periodLabel({ ...period, periodKind: kind }) : '-');
  const canCreate = $derived(canEditPeriodPlans(user));

  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) { step = 1; dlg.showModal(); }
    else if (!open && dlg.open) dlg.close();
  });
  $effect(() => { if (open) periodPlans.list({ all: true }).then((ps) => (earlier = ps.filter((p) => p.entityId === entityId))); });
  $effect(() => {
    if (!(open && entityId && valid)) { overlaps = []; return; }
    periodPlans.overlaps({ id: '', entityId, from: period.from, to: period.to }).then((o) => (overlaps = o));
  });

  function close() { open = false; }
  async function create(e: Event) {
    e.preventDefault();
    if (!valid || !entityId) return say('Choose a company and a valid period');
    busy = true;
    try {
      const t = title.trim() || `${co?.shortName ?? ''} ${label}`.trim();
      let p = await withReplace((replace) => copyFrom ? periodPlans.copy(copyFrom, { ...period, title: t, replace }) : periodPlans.create({ entityId, periodKind: kind, ...period, title: t, replace }), (c) => replaceDialog!.ask(c));
      if (!p) { busy = false; return; }
      if (p.periodKind !== kind) p = await periodPlans.save({ ...p, periodKind: kind });
      open = false;
      router.go(`/period-plans/${p.id}`);
    } catch (err) { say((err as Error).message); busy = false; }
  }
</script>

<dialog class="sheet plan" bind:this={dlg} onclose={close} aria-labelledby="plan-new-title">
  <form class="body" onsubmit={create}>
    <header class="top">
      <div>
        <p class="eyebrow">Step {step} of 2</p>
        <h2 id="plan-new-title">{step === 1 ? 'Choose the period' : 'Name the plan'}</h2>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick={close}>Close</button>
    </header>

    {#if step === 1}
      <div class="field"><span>Company</span>
        {#if co}<div class="co"><CompanyMark {entityId} size={28} /><strong>{co.name}</strong></div>
        {:else}<RecordFor what="a period plan"><span></span></RecordFor>{/if}
      </div>
      <div class="kinds" role="group" aria-label="Period">
        {#each Object.entries(KIND_LABEL) as [k, l] (k)}
          <button type="button" class="sel-chip" aria-pressed={kind === k} onclick={() => (kind = k as PeriodKind)}>{l}</button>
        {/each}
      </div>
      {#if kind === 'custom'}
        <div class="form-grid">
          <label class="field"><span>From</span><input class="input" type="date" bind:value={customFrom} /></label>
          <label class="field"><span>To</span><input class="input" type="date" bind:value={customTo} /></label>
        </div>
      {:else}
        <label class="field"><span>{kind === 'month' ? 'Month' : 'Starting in'}</span><input class="input" type="month" bind:value={startMonth} /></label>
      {/if}
      <p class="when"><strong>{label}</strong><span>{period.from} to {period.to} · {valid ? monthsOf(period.from, period.to).length : 0} months</span></p>
      <div class="row end">
        <button type="button" class="btn btn-primary" disabled={!valid || !entityId} onclick={() => (step = 2)}>Continue</button>
      </div>
    {:else}
      <p class="when"><strong>{label}</strong><span>{co?.shortName ?? 'Company'} · {period.from} to {period.to}</span></p>
      <label class="field"><span>Title</span><input class="input" bind:value={title} placeholder={`${co?.shortName ?? 'Company'} ${label}`} /></label>
      <label class="field"><span>Start from an earlier plan</span>
        <select class="select" bind:value={copyFrom}>
          <option value="">Start empty</option>
          {#each earlier as p (p.id)}<option value={p.id}>{p.ref} · {periodLabel(p)} · {p.lines.length} lines</option>{/each}
        </select>
      </label>
      {#if overlaps.length}
        <div class="card flag-warning warn" role="alert">
          <div class="row"><TriangleAlert size={18} /><strong>This period overlaps {overlaps.length} existing plan{overlaps.length === 1 ? '' : 's'}</strong></div>
          <ul>{#each overlaps as o (o.id)}<li>{o.ref} · {periodLabel(o)} · {planTotals(o).cases.toLocaleString()} cases</li>{/each}</ul>
        </div>
      {/if}
      {#if !canCreate}<p class="error">Only planners, directors and admins create period plans.</p>{/if}
      <div class="row end">
        <button type="button" class="btn btn-ghost" onclick={() => (step = 1)}>Back</button>
        <button class="btn btn-primary" disabled={busy || !canCreate || !entityId || !valid}>{busy ? 'Saving' : copyFrom ? 'Copy into a new plan' : 'Create plan'}</button>
      </div>
    {/if}
  </form>
</dialog>
<ReplaceDialog bind:this={replaceDialog} />

<style>
  dialog.plan { width: min(640px, calc(100vw - 32px)); }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
  .eyebrow { margin: 0 0 2px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); }
  h2 { margin: 0; font-size: 22px; }
  .co { display: flex; align-items: center; gap: var(--space-2); }
  .kinds { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .when { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: var(--space-3); background: var(--surface-sunken); border-radius: var(--radius-md); }
  .when span { color: var(--text-muted); font-size: 13px; }
  .end { justify-content: flex-end; }
  .warn { padding: var(--space-3); } .warn ul { margin: var(--space-2) 0 0; padding-left: var(--space-4); }
</style>
