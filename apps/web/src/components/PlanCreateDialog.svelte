<script lang="ts">
  // New period plan, one form over the list. Month and year, then the length.
  // The end date is the start month plus the length (a quarter from January 2027 ends 31 March 2027).
  import type { User } from '@btw/api';
  import { router, say } from '@btw/ui';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import FormSelect from './FormSelect.svelte';
  import ReplaceDialog from './ReplaceDialog.svelte';
  import { company, GROUP, allowedIds } from '../lib/company.svelte';
  import { allCompanies, companyLabel } from '../lib/companies';
  import { canEditPeriodPlans, monthsOf, periodLabel, periodPlans, withReplace, type PeriodKind, type PeriodPlan } from '../lib/planning';

  let { user, open = $bindable(false) }: { user: User; open?: boolean } = $props();
  const group = $derived(company.active === GROUP);
  const lockedId = $derived(company.active === GROUP ? '' : company.active);
  const companies = $derived(allCompanies().filter((c) => allowedIds(user).includes(c.id)));
  const nextMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));
  const YEARS = [0, 1].map((n) => { const y = String(new Date().getUTCFullYear() + n); return { value: y, label: y }; });
  const LENGTH: { k: PeriodKind; label: string; hint: string }[] = [
    { k: 'month', label: 'Month', hint: '1 month' },
    { k: 'quarter', label: 'Quarter', hint: '3 months' },
    { k: 'half', label: 'Half year', hint: '6 months' },
    { k: 'year', label: 'Year', hint: '12 months' },
    { k: 'custom', label: 'Custom', hint: 'Both dates' },
  ];

  let dlg = $state<HTMLDialogElement>();
  let picked = $state('');
  let kind = $state<PeriodKind>('quarter');
  let startM = $state(nextMonth.slice(5, 7));
  let startY = $state(nextMonth.slice(0, 4));
  let customFrom = $state(`${nextMonth}-01`);
  let customTo = $state('');
  let title = $state('');
  let copyFrom = $state('');
  let busy = $state(false);
  let earlier = $state<PeriodPlan[]>([]);
  let overlaps = $state<PeriodPlan[]>([]);
  let replaceDialog = $state<ReturnType<typeof ReplaceDialog>>();

  const entityId = $derived(lockedId || picked);
  const startMonth = $derived(`${startY}-${startM}`);
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
      const ym = nextMonth;
      const end = spanOf('quarter', ym).to;
      picked = lockedId; kind = 'quarter'; startY = ym.slice(0, 4); startM = ym.slice(5, 7);
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
      <h2 id="plan-new-title">New period plan</h2>
      <button type="button" class="btn btn-ghost btn-sm" onclick={close}>Close</button>
    </header>
    <div class="grid2">
      {#if group}
        <label class="field"><span>Company</span>
          <FormSelect label="Company" bind:value={picked} placeholder="Choose a company" options={companies.map((c) => ({ value: c.id, label: `${companyLabel(c.id)} · ${c.name}` }))} />
        </label>
      {/if}
      <label class="field" class:wide={!group}><span>Title</span><input class="input" bind:value={title} placeholder={entityId ? `${companyLabel(entityId)} ${label}` : 'Plan title'} /></label>
    </div>
    <div class="pair">
      <label class="field"><span>Month</span>
        <FormSelect label="Month" bind:value={startM} options={MONTHS} />
      </label>
      <label class="field"><span>Year</span>
        <FormSelect label="Year" bind:value={startY} options={YEARS} />
      </label>
    </div>
    <div class="field"><span>Length</span>
      <div class="lengths" role="radiogroup" aria-label="Length">
        {#each LENGTH as x (x.k)}
          <button type="button" role="radio" aria-checked={kind === x.k} class:on={kind === x.k} onclick={() => (kind = x.k)}>
            <span>{x.label}</span><small>{x.hint}</small>
          </button>
        {/each}
      </div>
    </div>
    {#if kind === 'custom'}
      <div class="pair">
        <label class="field"><span>From</span><input class="input" type="date" bind:value={customFrom} /></label>
        <label class="field"><span>To</span><input class="input" type="date" bind:value={customTo} /></label>
      </div>
    {/if}
    <p class="when">{valid ? `${day(period.from)} to ${day(period.to)} · ${monthCount} ${monthCount === 1 ? 'month' : 'months'}` : 'Choose a valid period'}</p>
    {#if overlaps.length}
      <div class="clash" role="alert">
        <span class="ico"><TriangleAlert size={16} /></span>
        <span>Overlaps {overlaps.map((o) => o.ref).join(', ')}. Change the month, the year, or the length.</span>
      </div>
    {/if}
    <label class="field"><span>Copy lines</span>
      <FormSelect label="Copy lines" bind:value={copyFrom} options={[{ value: '', label: 'No lines yet' }, ...earlier.map((p) => ({ value: p.id, label: `${p.ref} · ${periodLabel(p)} · ${p.lines.length} lines` }))]} />
      <span class="hint">No lines yet means you add the products on the next screen.</span>
    </label>
    {#if !canCreate}<p class="error">Only planners, directors and admins create period plans.</p>{/if}
    <div class="row end">
      <button class="btn btn-primary" disabled={busy || !canCreate || !entityId || !valid || overlaps.length > 0}>{busy ? 'Saving' : copyFrom ? 'Copy into a new plan' : 'Create plan'}</button>
    </div>
  </form>
</dialog>
<ReplaceDialog bind:this={replaceDialog} />

<style>
  dialog.plan { width: min(640px, calc(100vw - 32px)); }
  .body { display: flex; flex-direction: column; gap: 14px; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
  h2 { margin: 0; font-size: 20px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid2 .wide { grid-column: 1 / -1; }
  .lengths { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .lengths button { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 6px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface); color: var(--text); font: 600 12px/1.2 var(--ff-body); text-align: left; cursor: pointer; }
  .lengths button small { font-weight: 500; font-size: 10px; color: var(--text-muted); }
  .lengths button:hover:not(.on) { background: var(--surface-sunken); }
  .lengths button.on { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary); }
  .lengths button.on small { color: color-mix(in srgb, var(--text-on-primary) 78%, transparent); }
  .pair { display: grid; grid-template-columns: 1fr 140px; gap: 12px; }
  .hint { color: var(--text-muted); font-size: 12px; font-weight: 500; }
  .when { margin: 0; padding: 6px 10px; background: var(--surface-sunken); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-muted); }
  .end { justify-content: flex-end; }
  .clash { display: flex; gap: 8px; align-items: center; margin: 0; padding: 6px 10px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--warning-solid) 12%, var(--surface)); font-size: 12px; }
  .ico { display: flex; flex: none; color: var(--warning); }
  .field { display: flex; flex-direction: column; gap: 6px; }
</style>
