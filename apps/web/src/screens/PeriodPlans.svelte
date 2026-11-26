<script lang="ts">
  // Period plans (§8.3 PL-06..PL-12; docs/17 Phase 1): what each company plans to buy over a month / quarter / half year /
  // year. Work page: opens on the plan list with a strip (registry: in force · upcoming · plan used vs expected). The
  // planned-vs-actual charts live on Home · Purchasing; "Plan or check a period" (from the retired Reports page) is a
  // secondary action. No needs-action default: the list is short and plans are suggestions (nothing waits for approval).
  import { type User } from '@btw/api';
  import { Badge, fmtNum, router } from '@btw/ui';
  import SearchX from '@lucide/svelte/icons/search-x';
  import ErrorState from '../components/ErrorState.svelte';
  import CompanyCell from '../components/CompanyCell.svelte';
  import PlanCreateDialog from '../components/PlanCreateDialog.svelte';
  import { watch } from '../lib/load.svelte';
  import { PageHeader, SummaryStrip, FilterBar, EmptyState, queryFilters, type SummaryTile } from '../components/page';
  import { planTiles, infoOf } from '../lib/tiles';
  import { canEditPeriodPlans, KIND_LABEL, onPlanningChange, periodFor, periodLabel, periodPlans, plannedVsActual, planTotals, type PeriodPlan, type PlannedVsActual } from '../lib/planning';
  let { user }: { user: User } = $props();
  let list = $state<PeriodPlan[] | null>(null);
  // Plans are suggestions (no approval): Active, or Replaced by a newer plan (kept for history, hidden by default).
  const f = queryFilters({ show: '', status: '', q: '' });
  let search = $state(f.values.q);
  $effect(() => { if (search !== f.values.q) f.set('q', search); });
  const showReplaced = $derived(f.values.status === 'Replaced' || f.values.status === 'all');
  let pv = $state<PlannedVsActual | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const w = watch(async () => {
    [list, pv] = await Promise.all([periodPlans.list({ all: showReplaced }), plannedVsActual(periodFor('quarter', today)).catch(() => null)]);
  }, () => showReplaced);
  $effect(() => onPlanningChange(() => w.retry()));
  // docs/18: strip figures from the registry (plans in force / upcoming; this quarter's plan used vs expected by today)
  const fig = $derived(planTiles(list ?? [], pv?.measures ?? null));
  const pctS = (n: number) => `${Math.round(n * 100)} %`;
  const tiles = $derived<SummaryTile[]>([
    { key: 'inforce', label: 'In force today', value: list ? fig.inForce : null, info: infoOf('plansInForce') },
    { key: 'upcoming', label: 'Upcoming', value: list ? fig.upcoming : null, sub: 'plans starting later', info: infoOf('plansUpcoming') },
    { key: 'used', label: 'Plan used this quarter', value: fig.used, format: pctS, filter: false, sub: fig.expected !== null ? `${pctS(fig.expected)} expected by today` : undefined,
      status: fig.used === null || fig.expected === null || !pv ? undefined : fig.used < fig.expected * pv.thresholds.behind ? 'warn' : fig.used > pv.thresholds.over ? 'bad' : 'good',
      statusLabel: fig.used === null || fig.expected === null || !pv ? undefined : fig.used < fig.expected * pv.thresholds.behind ? 'Behind' : fig.used > pv.thresholds.over ? 'Over plan' : 'On track', info: infoOf('planUsed') },
  ]);
  const SHOW: Record<string, (p: PeriodPlan) => boolean> = { inforce: (p) => p.status === 'Active' && p.from <= today && p.to >= today, upcoming: (p) => p.status === 'Active' && p.from > today };
  const rows = $derived((list ?? []).filter((p) => (!f.values.show || SHOW[f.values.show]?.(p) !== false) && (!f.values.status || f.values.status === 'all' || p.status === f.values.status)
    && (!f.values.q || `${p.ref} ${p.title}`.toLowerCase().includes(f.values.q.toLowerCase()))));
  const canCreate = $derived(canEditPeriodPlans(user));
  const active = $derived((f.values.show ? 1 : 0) + (f.values.status ? 1 : 0));
  let creating = $state(false);
  let view = $state<'plans' | 'actual'>('plans');
  let reportPlan = $state<PeriodPlan | null>(null);
  function clearAll() { f.clear(); search = ''; }
  function openReport(e: MouseEvent, p: PeriodPlan) { e.stopPropagation(); reportPlan = p; view = 'actual'; }
</script>

<PageHeader overline="Procurement" title={view === 'actual' ? 'Plan vs actual' : 'Period plans'} description={view === 'actual' ? (reportPlan ? `${reportPlan.ref} · what this plan said, against the orders placed in its period.` : 'What the plan said, against the orders placed in that period.') : 'What each company plans to buy over a month, quarter, half year or year.'}>
  {#snippet secondary()}
    {#if view === 'actual'}<button class="btn btn-secondary" type="button" onclick={() => { view = 'plans'; reportPlan = null; }}>Period plans</button>
    {:else}<button class="btn btn-secondary" type="button" onclick={() => { reportPlan = null; view = 'actual'; }}>Plan vs actual</button>{/if}
  {/snippet}
  {#snippet primary()}{#if canCreate && view === 'plans'}<button class="btn btn-primary" type="button" onclick={() => (creating = true)}>New period plan</button>{/if}{/snippet}
</PageHeader>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if view === 'actual'}
  {#await import('../components/reports/PlannedVsActualTab.svelte') then M}<M.default {user} focus={reportPlan ? { id: reportPlan.id, ref: reportPlan.ref, title: reportPlan.title, from: reportPlan.from, to: reportPlan.to, entityId: reportPlan.entityId } : undefined} />{/await}
{:else}
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Period plans summary" noun="plans" total={list ? list.length : null} shown={list ? rows.length : null} />
<FilterBar bind:search placeholder="Reference or title" {active} onclear={clearAll}>
  <label class="field"><span>Status</span><select class="select" value={f.values.status} onchange={(e) => f.set('status', e.currentTarget.value)}><option value="">Active</option><option value="Replaced">Replaced</option><option value="all">Active and replaced</option></select></label>
  {#snippet end()}{#if list}<span class="caption">{rows.length} plans</span>{/if}{/snippet}
</FilterBar>
  <div class="card flush table-wrap">
    <table class="table">
      <thead><tr><th>Reference</th><th>Title</th><CompanyCell head /><th>Period</th><th>Kind</th><th class="num">Lines</th><th class="num">Cases</th><th class="num">Value (USD)</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        {#if !list}{#each Array(3) as _, i (i)}<tr><td colspan="10"><div class="skeleton"></div></td></tr>{/each}{/if}
        {#each rows as p (p.id)}
          <tr class="clickable" onclick={() => router.go(`/period-plans/${p.id}`)}>
            <td class="mono"><a href="#/period-plans/{p.id}">{p.ref}</a></td>
            <td>{p.title || '-'}</td>
            <CompanyCell entityId={p.entityId} />
            <td>{periodLabel(p)}</td>
            <td class="small">{KIND_LABEL[p.periodKind]}</td>
            <td class="num">{p.lines.length}</td>
            <td class="num">{fmtNum(planTotals(p).cases)}</td>
            <td class="num">{fmtNum(planTotals(p).value, 2)}</td>
            <td><Badge tone={p.status === 'Active' ? 'success' : 'neutral'}>{p.status}</Badge>{#if p.version > 1}<span class="caption"> v{p.version}</span>{/if}</td>
            <td><button type="button" class="btn btn-secondary btn-sm" onclick={(e) => openReport(e, p)}>Report</button></td>
          </tr>
        {:else}{#if list}<tr><td colspan="10">{#if active || f.values.q}<EmptyState title="No period plans match these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>{:else}<EmptyState title="No period plans yet" hint={canCreate ? 'Create one to compare purchase orders with it.' : undefined} compact />{/if}</td></tr>{/if}{/each}
      </tbody>
    </table>
  </div>
{/if}
<PlanCreateDialog {user} bind:open={creating} />

