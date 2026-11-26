<script lang="ts">
  // New period plan, opened over the list. Three steps: company, the start month and length, then the name.
  // The end date is the start month plus the length (a quarter from January 2027 ends 31 March 2027).
  import type { User } from '@btw/api';
  import { router, say } from '@btw/ui';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CompanyMark from './CompanyMark.svelte';
  import ReplaceDialog from './ReplaceDialog.svelte';
  import { company, GROUP, allowedIds } from '../lib/company.svelte';
  import { allCompanies, companyBrand, companyLabel } from '../lib/companies';
  import { canEditPeriodPlans, KIND_LABEL, monthsOf, periodLabel, periodPlans, planTotals, withReplace, type PeriodKind, type PeriodPlan } from '../lib/planning';

  let { user, open = $bindable(false) }: { user: User; open?: boolean } = $props();
  const group = $derived(company.active === GROUP);
  const lockedId = $derived(company.active === GROUP ? '' : company.active);
  const companies = $derived(allCompanies().filter((c) => allowedIds(user).includes(c.id)));
  const nextMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  const monthChoices = (() => {
    const y0 = new Date().getUTCFullYear();
    const out: { key: string; label: string }[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(Date.UTC(y0, i, 1));
      out.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) });
    }
    return out;
  })();
  const LENGTH: { k: PeriodKind; label: string; hint: string }[] = [
    { k: 'month', label: 'Month', hint: '1 month' },
    { k: 'quarter', label: 'Quarter', hint: '3 months' },
    { k: 'half', label: 'Half year', hint: '6 months' },
    { k: 'year', label: 'Year', hint: '12 months' },
    { k: 'custom', label: 'Custom', hint: 'Both dates' },
  ];

  let dlg = $state<HTMLDialogElement>();
  let step = $state<1 | 2 | 3>(1);
  let picked = $state('');
  let kind = $state<PeriodKind>('quarter');
  let startMonth = $state(nextMonth);
  let customFrom = $state(`${nextMonth}-01`);
  let customTo = $state('');
  let title = $state('');
  let copyFrom = $state('');
  let busy = $state(false);
  let earlier = $state<PeriodPlan[]>([]);
  let overlaps = $state<PeriodPlan[]>([]);
  let replaceDialog = $state<ReturnType<typeof ReplaceDialog>>();

  const entityId = $derived(lockedId || picked);
  const co = $derived(entityId ? companyBrand(entityId) : null);
  function spanOf(k: PeriodKind, ym: string) {
    if (k === 'custom') return { from: customFrom, to: customTo };
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const span = k === 'quarter' ? 3 : k === 'half' ? 6 : k === 'year' ? 12 : 1;
    const end = new Date(Date.UTC(y, m - 1 + span, 0));
    return { from: `${ym}-01`, to: end.toISOString().slice(0, 10) };
  }
  const period = $derived(spanOf(kind, startMonth));
  const valid = $derived(!!period.from && !!period.to && period.from <= period.to);
  const label = $derived(valid ? periodLabel({ ...period, periodKind: kind }) : '-');
  const monthCount = $derived(valid ? monthsOf(period.from, period.to).length : 0);
  const canCreate = $derived(canEditPeriodPlans(user));
  const day = (iso: string) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '-';

  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) {
      const ym = monthChoices.some((m) => m.key === nextMonth) ? nextMonth : monthChoices[0].key;
      const end = spanOf('quarter', ym).to;
      step = 1; picked = lockedId; kind = 'quarter'; startMonth = ym;
      customFrom = `${ym}-01`; customTo = end; title = ''; copyFrom = '';
      dlg.showModal();
    } else if (!open && dlg.open) dlg.close();
  });
  $effect(() => { if (open && entityId) periodPlans.list({ all: true }).then((ps) => (earlier = ps.filter((p) => p.entityId === entityId))); else earlier = []; });
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
      const t = title.trim() || `${companyLabel(entityId)} ${label}`.trim();
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
        <p class="eyebrow">New period plan</p>
        <h2 id="plan-new-title">{step === 1 ? 'Which company' : step === 2 ? 'When it runs' : 'Name the plan'}</h2>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick={close}>Close</button>
    </header>
    <ol class="steps" aria-label="Steps">
      <li class:on={step === 1} class:done={step > 1}>1. Company</li>
      <li class:on={step === 2} class:done={step > 2}>2. Period</li>
      <li class:on={step === 3}>3. Name</li>
    </ol>

    {#if step === 1}
      <p class="lead">{group ? 'Group view keeps every company. Choose which one this plan belongs to.' : 'This plan is recorded for the company you are in.'}</p>
      {#if group}
        <label class="field"><span>Company</span>
          <select class="select" bind:value={picked}>
            <option value="">Choose a company</option>
            {#each companies as c (c.id)}<option value={c.id}>{companyLabel(c.id)} · {c.name}</option>{/each}
          </select>
        </label>
      {:else if co}
        <div class="co card"><CompanyMark entityId={entityId} size={32} /><div><strong>{co.name}</strong><span>{companyLabel(entityId)}</span></div></div>
      {/if}
      <div class="row end">
        <button type="button" class="btn btn-primary" disabled={!entityId} onclick={() => (step = 2)}>Continue</button>
      </div>
    {:else if step === 2}
      <p class="lead">Pick the first month, then how long the plan runs. The end date is worked out from that.</p>
      <label class="field"><span>Starts</span>
        <select class="select" bind:value={startMonth}>
          {#each monthChoices as m (m.key)}<option value={m.key}>{m.label}</option>{/each}
        </select>
      </label>
      <div class="field"><span>Length</span>
        <div class="kinds" role="group" aria-label="Length">
          {#each LENGTH as x (x.k)}
            <button type="button" class="sel-chip" aria-pressed={kind === x.k} onclick={() => (kind = x.k)}>{x.label}<small>{x.hint}</small></button>
          {/each}
        </div>
      </div>
      {#if kind === 'custom'}
        <div class="form-grid">
          <label class="field"><span>From</span><input class="input" type="date" bind:value={customFrom} /></label>
          <label class="field"><span>To</span><input class="input" type="date" bind:value={customTo} /></label>
        </div>
      {/if}
      <p class="when">
        <strong>{valid ? label : 'Choose a valid period'}</strong>
        <span>{valid ? `${day(period.from)} to ${day(period.to)}` : '-'} · {monthCount} {monthCount === 1 ? 'month' : 'months'}</span>
        {#if kind !== 'custom' && valid}<span>Ends {day(period.to)}</span>{/if}
      </p>
      <div class="row end">
        <button type="button" class="btn btn-ghost" onclick={() => (step = 1)}>Back</button>
        <button type="button" class="btn btn-primary" disabled={!valid} onclick={() => (step = 3)}>Continue</button>
      </div>
    {:else}
      <p class="when"><strong>{label}</strong><span>{companyLabel(entityId)} · {day(period.from)} to {day(period.to)} · {KIND_LABEL[kind]}</span></p>
      <label class="field"><span>Title</span><input class="input" bind:value={title} placeholder={`${companyLabel(entityId)} ${label}`} /></label>
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
        <button type="button" class="btn btn-ghost" onclick={() => (step = 2)}>Back</button>
        <button class="btn btn-primary" disabled={busy || !canCreate || !entityId || !valid}>{busy ? 'Saving' : copyFrom ? 'Copy into a new plan' : 'Create plan'}</button>
      </div>
    {/if}
  </form>
</dialog>
<ReplaceDialog bind:this={replaceDialog} />

<style>
  dialog.plan { width: min(720px, calc(100vw - 32px)); }
  .body { display: flex; flex-direction: column; gap: 22px; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
  .eyebrow { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); }
  h2 { margin: 0; font-size: 24px; }
  .lead { margin: 0; color: var(--text-muted); font-size: 14px; }
  .steps { display: flex; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .steps li { flex: 1; padding: 8px 12px; border-radius: var(--radius-md); background: var(--surface-sunken); font-size: 13px; font-weight: 600; color: var(--text-muted); }
  .steps li.on { background: var(--primary); color: var(--text-on-primary); }
  .steps li.done { background: var(--primary-subtle); color: var(--primary); }
  .co { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); }
  .co div { display: flex; flex-direction: column; }
  .co span { color: var(--text-muted); font-size: 13px; }
  .kinds { display: flex; flex-wrap: wrap; gap: 8px; }
  .kinds .sel-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 108px; padding: 10px 12px; }
  .kinds small { font-weight: 500; font-size: 11px; opacity: 0.8; }
  .when { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: var(--space-4); background: var(--surface-sunken); border-radius: var(--radius-md); }
  .when span { color: var(--text-muted); font-size: 13px; }
  .end { justify-content: flex-end; gap: var(--space-2); }
  .warn { padding: var(--space-4); } .warn ul { margin: var(--space-2) 0 0; padding-left: var(--space-4); }
  .field { display: flex; flex-direction: column; gap: 8px; }
</style>
