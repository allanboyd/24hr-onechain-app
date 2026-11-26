<script lang="ts">
  // Period plans (§8.3 PL-06..PL-12; docs/17 Phase 1): what each company plans to buy over a month / quarter / half year /
  // year. Work page: opens on the plan list with a strip (registry: in force · upcoming · plan used vs expected). The
  // planned-vs-actual charts live on Home · Purchasing; "Plan or check a period" (from the retired Reports page) is a
  // secondary action. No needs-action default: the list is short and plans are suggestions (nothing waits for approval).
  import { lookup, type User } from '@btw/api';
  import { Badge, fmtNum, router } from '@btw/ui';
  import SearchX from '@lucide/svelte/icons/search-x';
  import ErrorState from '../components/ErrorState.svelte';
  import PlanCreateDialog from '../components/PlanCreateDialog.svelte';
  import { watch } from '../lib/load.svelte';
  import { PageHeader, SummaryStrip, EmptyState, DataTable, queryFilters, tableQuery, type Column, type SummaryTile } from '../components/page';
  import { companyLabel } from '../lib/companies';
  import { planTiles, infoOf } from '../lib/tiles';
  import { canEditPeriodPlans, KIND_LABEL, onPlanningChange, periodFor, periodLabel, periodPlans, plannedVsActual, planTotals, type PeriodPlan, type PlannedVsActual } from '../lib/planning';
  let { user }: { user: User } = $props();
  let list = $state<PeriodPlan[] | null>(null);
  // Plans are suggestions (no approval): Active, or Replaced by a newer plan (kept for history, hidden by default).
  const f = queryFilters({ show: '', status: '', q: '', entity: '', kind: '' });
  const tq = tableQuery(f, { search: 'q', filters: { company: 'entity', kind: 'kind' } });
  let shown = $state(0);
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
  const rows = $derived((list ?? []).filter((p) => (!f.values.show || SHOW[f.values.show]?.(p) !== false) && (!f.values.status || f.values.status === 'all' || p.status === f.values.status)));
  const canCreate = $derived(canEditPeriodPlans(user));
  const filtered = $derived(!!(f.values.show || f.values.status || f.values.q || f.values.entity || f.values.kind));
  let creating = $state(false);
  let view = $state<'plans' | 'actual'>('plans');
  let reportPlan = $state<PeriodPlan | null>(null);
  function clearAll() { f.clear(); }
  function openReport(p: PeriodPlan) { reportPlan = p; view = 'actual'; }
  const columns = $derived<Column<PeriodPlan>[]>([
    { key: 'ref', label: 'Reference', sticky: true, value: (p) => p.ref, cell: refCell },
    { key: 'title', label: 'Title', value: (p) => p.title || '-' },
    { key: 'company', label: 'Company', value: (p) => companyLabel(p.entityId), hideBelow: 900, filter: 'select', filterValue: (p) => p.entityId, filterLabel: (id) => companyLabel(id) || lookup.entity(id)?.code || id },
    { key: 'period', label: 'Period', sortValue: (p) => p.from, value: (p) => periodLabel(p), cell: periodCell },
    { key: 'kind', label: 'Kind', value: (p) => KIND_LABEL[p.periodKind], filter: 'select', filterValue: (p) => p.periodKind, filterLabel: (k) => KIND_LABEL[k as PeriodPlan['periodKind']] ?? k },
    { key: 'lines', label: 'Lines', align: 'right', sortValue: (p) => p.lines.length, value: (p) => p.lines.length },
    { key: 'cases', label: 'Cases', align: 'right', sortValue: (p) => planTotals(p).cases, value: (p) => fmtNum(planTotals(p).cases) },
    { key: 'value', label: 'Value (USD)', align: 'right', sortValue: (p) => planTotals(p).value, value: (p) => fmtNum(planTotals(p).value, 2) },
    { key: 'status', label: 'Status', value: (p) => p.status, cell: statusCell },
    { key: 'actions', label: 'Actions', sortable: false, csv: false, mobile: 'actions', cell: actionsCell },
  ]);
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
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Period plans summary" noun="plans" total={list ? list.length : null} shown={list ? shown : null} />
<DataTable id="period-plans" label="Period plans" noun="plans" rows={list ? rows : null} {columns} rowKey={(p) => p.id} onrowclick={(p) => router.go(`/period-plans/${p.id}`)}
  initialSort={{ key: 'period', dir: 'desc' }} filename="period-plans" searchable searchPlaceholder="Search reference or title"
  bind:search={tq.search.get, tq.search.set} bind:filters={tq.filters.get, tq.filters.set} bind:shown>
  {#snippet toolbar()}
    <label class="plan-status"><span class="dt-sr-only">Status</span><select class="select" aria-label="Status" value={f.values.status} onchange={(e) => f.set('status', e.currentTarget.value)}><option value="">Active</option><option value="Replaced">Replaced</option><option value="all">Active and replaced</option></select></label>
  {/snippet}
  {#snippet empty()}
    {#if filtered}<EmptyState title="No period plans match these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>{:else}<EmptyState title="No period plans yet" hint={canCreate ? 'Create one to compare purchase orders with it.' : undefined} compact />{/if}
  {/snippet}
</DataTable>
{/if}
<PlanCreateDialog {user} bind:open={creating} />

{#snippet refCell(p: PeriodPlan)}<a class="mono nowrap" href="#/period-plans/{p.id}">{p.ref}</a>{/snippet}
{#snippet periodCell(p: PeriodPlan)}<span class="nowrap">{periodLabel(p)}</span>{/snippet}
{#snippet statusCell(p: PeriodPlan)}<Badge tone={p.status === 'Active' ? 'success' : 'neutral'}>{p.status}</Badge>{#if p.version > 1}<span class="caption"> v{p.version}</span>{/if}{/snippet}
{#snippet actionsCell(p: PeriodPlan)}
  <span class="acts"><button type="button" class="btn btn-secondary btn-sm" onclick={() => router.go(`/period-plans/${p.id}`)}>View</button><button type="button" class="btn btn-secondary btn-sm" onclick={() => openReport(p)}>Report</button></span>
{/snippet}

<style>
  .dt-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .acts { display: inline-flex; gap: 6px; }
  .plan-status .select { height: 32px; }
  .nowrap { white-space: nowrap; }
</style>

