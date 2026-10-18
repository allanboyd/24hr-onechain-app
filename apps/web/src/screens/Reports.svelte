<script lang="ts">
  // Reports & planning: Sales · Quarterly review · Logistics · Inventory · Planning · Finance · Period (plan / check).
  // Lazy route; charts load Plotly on demand. Deep links: #/reports?r=planning&wh=w-goma&prod=p-a300&p=last-12m&mode=check
  import { type GroupBy, type PeriodPreset, type User } from '@btw/api';
  import { qp } from '../lib/tab';
  import ReportFilters from '../components/reports/ReportFilters.svelte';
  import { toFilter } from '../components/reports/filter';
  import SalesTab from '../components/reports/SalesTab.svelte';
  import QuarterlyTab from '../components/reports/QuarterlyTab.svelte';
  import LogisticsTab from '../components/reports/LogisticsTab.svelte';
  import InventoryTab from '../components/reports/InventoryTab.svelte';
  import PlanningTab from '../components/reports/PlanningTab.svelte';
  import FinanceTab from '../components/reports/FinanceTab.svelte';
  import PeriodTab from '../components/reports/PeriodTab.svelte';
  import PlannedVsActualTab from '../components/reports/PlannedVsActualTab.svelte';
  import { can } from '../lib/features';
  import '../components/charts';
  import CompanySplit from '../components/group/CompanySplit.svelte';
  import { salesSplit, inventorySplit, logisticsSplit, financeSplit } from '../lib/splits';
  let { user }: { user: User } = $props();

  const TABS = [
    { key: 'sales', label: 'Sales' }, { key: 'quarterly', label: 'Quarterly review' }, { key: 'logistics', label: 'Logistics' },
    { key: 'inventory', label: 'Inventory' }, { key: 'pv', label: 'Planned vs actual' }, { key: 'planning', label: 'Planning' }, { key: 'finance', label: 'Finance' }, { key: 'period', label: 'Period · plan or check' },
  ] as const;
  type Tab = (typeof TABS)[number]['key'];
  // Same gates as the API (report endpoints are feature-gated): never open a tab whose data the user may not read.
  const any = (...f: Parameters<typeof can>[1][]) => f.some((x) => can(user, x));
  const GATE: Record<Tab, () => boolean> = {
    sales: () => any('reports', 'sales'), quarterly: () => any('reports'), logistics: () => any('reports', 'logistics'),
    inventory: () => any('reports', 'inventory'), pv: () => any('planned-vs-actual'), planning: () => any('reports', 'period-plans'),
    finance: () => any('reports') && any('finance'), period: () => any('reports'),
  };
  const allowed = (k: Tab) => GATE[k]();
  let tab = $state<Tab>((TABS.some((t) => t.key === qp('r') && allowed(t.key)) ? qp('r') : (TABS.find((t) => allowed(t.key))?.key ?? 'sales')) as Tab);
  let preset = $state<PeriodPreset | 'custom'>((qp('p') || 'last-90') as PeriodPreset);
  let from = $state(''), to = $state(''), wh = $state(qp('wh')), prod = $state(qp('prod')), group = $state<GroupBy | ''>('');
  let quarter = $state(qp('q'));
  let mode = $state<'plan' | 'check'>(qp('mode') === 'check' ? 'check' : 'plan');
  const filter = $derived(toFilter({ from, to, wh, prod }));
  // keep the tab in the address so Back and shared links land on the same report (no reload: replaceState)
  $effect(() => { const q = new URLSearchParams({ r: tab }); if (tab === 'period') q.set('mode', mode); history.replaceState(null, '', `#/reports?${q}`); });
  const periodTabs: Tab[] = ['sales', 'logistics', 'finance'];
  const setFilter = (k: 'wh' | 'prod', v: string) => { if (k === 'wh') wh = wh === v ? '' : v; else prod = prod === v ? '' : v; };
</script>

<div class="page-head">
  <div><div class="overline crumb">Analytics</div><h1>Reports</h1></div>
  <p class="caption" style="max-width:56ch">Click a bar, slice or row to filter or open the matching list. Every chart has <b>View data</b> and CSV.</p>
</div>

<div class="tabs rtabs" role="tablist" aria-label="Report">
  {#each TABS.filter((t) => allowed(t.key)) as t}<button role="tab" aria-selected={tab === t.key} onclick={() => (tab = t.key)}>{t.label}</button>{/each}
</div>

{#if tab !== 'period' && tab !== 'pv'}
  <div class="fbar">
    <ReportFilters bind:preset bind:from bind:to bind:wh bind:prod bind:group showGroup={tab === 'sales'} showPeriod={periodTabs.includes(tab)} />
    {#if wh || prod}<button class="btn btn-ghost btn-sm" onclick={() => { wh = ''; prod = ''; }}>Clear filters</button>{/if}
  </div>
{/if}

<div class="rbody">
  {#key `${tab}|${filter.from}|${filter.to}`}
    {#if tab === 'sales' || tab === 'quarterly'}<CompanySplit title="Sales by company" subtitle={filter.from ? 'selected period' : 'last 90 days'} metrics={salesSplit(filter.from ? filter : undefined)} />
    {:else if tab === 'logistics'}<CompanySplit title="Deliveries by company" metrics={logisticsSplit(filter.from ? filter : undefined)} />
    {:else if tab === 'inventory' || tab === 'planning'}<CompanySplit title="Stock by company" metrics={inventorySplit()} />
    {:else if tab === 'finance'}<CompanySplit title="Trip costs by company" metrics={financeSplit(filter.from ? filter : undefined)} />{/if}
  {/key}
  {#if tab === 'sales'}<SalesTab {filter} {group} onfilter={setFilter} />
  {:else if tab === 'quarterly'}<QuarterlyTab {filter} bind:quarter />
  {:else if tab === 'logistics'}<LogisticsTab {filter} />
  {:else if tab === 'inventory'}<InventoryTab {filter} />
  {:else if tab === 'planning'}<PlanningTab {filter} />
  {:else if tab === 'finance'}<FinanceTab {filter} />
  {:else if tab === 'pv'}<PlannedVsActualTab {user} />
  {:else}<PeriodTab bind:mode {wh} />{/if}
</div>

<style>
  .rtabs { flex-wrap: nowrap; overflow-x: auto; }
  .fbar { display: flex; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-4); }
  @media print { .rtabs, .fbar, .page-head { display: none !important; } }
</style>
