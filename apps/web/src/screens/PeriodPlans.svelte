<script lang="ts">
  // Period plans as a year of months. Each company keeps its own plan. The year is on the left.
  // A month, the year check, or plan vs actual opens in the panel on the right.
  import { type User } from '@btw/api';
  import { Badge, fmtNum, router } from '@btw/ui';
  import ErrorState from '../components/ErrorState.svelte';
  import PlanCreateDialog from '../components/PlanCreateDialog.svelte';
  import { watch } from '../lib/load.svelte';
  import { PageHeader } from '../components/page';
  import { allCompanies, companyBrand, companyLabel } from '../lib/companies';
  import { allowedIds } from '../lib/company.svelte';
  import { canEditPeriodPlans, monthsOf, onPlanningChange, periodPlans, planTotals, type PeriodPlan } from '../lib/planning';
  let { user }: { user: User } = $props();
  let list = $state<PeriodPlan[] | null>(null);
  const w = watch(async () => { list = await periodPlans.list(); });
  $effect(() => onPlanningChange(() => w.retry()));

  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const YEARS = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let year = $state(String(thisYear));
  let month = $state<string | null>(null);
  let panel = $state<'month' | 'check' | 'actual'>('check');
  let creating = $state(false);
  const canCreate = $derived(canEditPeriodPlans(user));
  const companies = $derived(allCompanies().filter((c) => allowedIds(user).includes(c.id)));
  const ink = (id: string) => companyBrand(id).colors.accent;

  const active = $derived((list ?? []).filter((p) => p.status === 'Active'));
  const covers = (p: PeriodPlan, ym: string) => p.from.slice(0, 7) <= ym && p.to.slice(0, 7) >= ym;
  const months = $derived(NAMES.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { key, name, plans: active.filter((p) => covers(p, key)) };
  }));
  const gaps = $derived(companies.flatMap((c) => months.filter((m) => !m.plans.some((p) => p.entityId === c.id)).map((m) => ({ company: c, month: m.name }))));
  const covered = $derived(list != null && gaps.length === 0);
  const picked = $derived(months.find((m) => m.key === month) ?? null);

  function openMonth(key: string) { month = key; panel = 'month'; }
</script>

<PageHeader overline="Procurement" title="Period plans" description="What each company plans to buy, month by month.">
  {#snippet primary()}{#if canCreate}<button class="btn btn-primary" type="button" onclick={() => (creating = true)}>New period plan</button>{/if}{/snippet}
</PageHeader>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="toolbar">
  <label class="year"><span>Year</span>
    <select class="select" aria-label="Year" bind:value={year}>{#each YEARS as y}<option value={String(y)}>{y}</option>{/each}</select>
  </label>
  <ul class="legend" aria-label="Companies">
    {#each companies as c}<li><span class="swatch" style:background={c.colors.accent}></span>{companyLabel(c.id)}</li>{/each}
  </ul>
  <div class="tools">
    <Badge tone={list == null ? 'neutral' : covered ? 'success' : 'warning'}>{list == null ? 'Loading' : covered ? 'Year is covered' : `${gaps.length} gaps`}</Badge>
    <button type="button" class="btn btn-secondary btn-sm" aria-pressed={panel === 'check'} onclick={() => (panel = 'check')}>Check the year</button>
    <button type="button" class="btn btn-secondary btn-sm" aria-pressed={panel === 'actual'} onclick={() => (panel = 'actual')}>Plan vs actual</button>
  </div>
</div>

<div class="split">
  <div class="year-grid" role="list" aria-label={`Months in ${year}`}>
    {#each months as m (m.key)}
      <button type="button" class="mo" class:on={panel === 'month' && month === m.key} onclick={() => openMonth(m.key)}>
        <span class="name">{m.name}</span>
        {#if m.plans.length}
          <span class="marks">{#each m.plans as p (p.id)}<span class="mark" style:--co={ink(p.entityId)}>{companyLabel(p.entityId)}</span>{/each}</span>
        {:else}<span class="empty">No plan</span>{/if}
      </button>
    {/each}
  </div>

  <aside class="side card" aria-label="Plan detail">
    {#if panel === 'actual'}
      <h2>Plan vs actual</h2>
      <p class="caption">{year}. Orders against the plans that cover this year.</p>
      {#await import('../components/reports/PlannedVsActualTab.svelte') then M}
        <M.default {user} />
      {/await}
    {:else if panel === 'month' && picked}
      <h2>{picked.name} {year}</h2>
      {#if picked.plans.length}
        <ul class="plans">
          {#each picked.plans as p (p.id)}
            <li>
              <span class="swatch" style:background={ink(p.entityId)}></span>
              <div>
                <b>{companyLabel(p.entityId)}</b>
                <span class="caption">{p.ref}{p.title ? ` · ${p.title}` : ''}</span>
                <span class="caption">{fmtNum(planTotals(p).cases)} cases · {monthsOf(p.from, p.to).length} {monthsOf(p.from, p.to).length === 1 ? 'month' : 'months'}</span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" aria-label={`Open the ${companyLabel(p.entityId)} plan`} onclick={() => router.go(`/period-plans/${p.id}`)}>Open</button>
            </li>
          {/each}
        </ul>
      {:else}<p class="caption">No company has a plan in {picked.name}.</p>{/if}
    {:else}
      <h2>Check the year</h2>
      {#if list == null}<p class="caption">Loading the plans.</p>
      {:else if covered}<p>Every company has a plan in each month of {year}.</p>
      {:else}
        <p class="caption">A month is open when that company has no active plan covering it.</p>
        <ul class="gaps">
          {#each companies as c (c.id)}
            {@const miss = gaps.filter((g) => g.company.id === c.id)}
            {#if miss.length}<li><span class="swatch" style:background={c.colors.accent}></span><span><b>{companyLabel(c.id)}</b> <span class="caption">{miss.map((g) => g.month).join(', ')}</span></span></li>{/if}
          {/each}
        </ul>
      {/if}
    {/if}
  </aside>
</div>

<PlanCreateDialog {user} bind:open={creating} />

<style>
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-4); margin-bottom: var(--space-4); }
  .year { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
  .year .select { height: 36px; min-width: 96px; }
  .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 12px; margin: 0; padding: 0; font-size: 13px; }
  .legend li, .gaps li { display: inline-flex; align-items: center; gap: 6px; }
  .swatch { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
  .split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr); gap: var(--space-4); align-items: start; }
  .year-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .mo { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-height: 92px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); color: var(--text); text-align: left; cursor: pointer; }
  .mo:hover { border-color: var(--border-strong); }
  .mo.on { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary); }
  .name { font: 600 14px/1.2 var(--ff-display); }
  .marks { display: flex; flex-wrap: wrap; gap: 4px; }
  .mark { display: inline-flex; align-items: center; gap: 4px; color: var(--text); font-size: 12px; font-weight: 650; line-height: 1; }
  .mark::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--co); flex: none; }
  .empty { font-size: 12px; color: var(--text-muted); }
  .side { padding: var(--space-4) var(--space-5); max-height: calc(100vh - 140px); overflow: auto; }
  .side h2 { margin: 0 0 8px; font-size: var(--fs-h3); }
  .plans, .gaps { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .plans li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .plans li > div { display: flex; flex-direction: column; min-width: 0; }
  @media (max-width: 900px) { .split { grid-template-columns: 1fr; } .side { max-height: none; } .tools { margin-left: 0; } }
</style>
