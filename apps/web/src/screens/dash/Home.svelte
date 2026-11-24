<script lang="ts">
  // One home for every web user (docs/15, C-05): tabs = "My dashboards" (the person's own set, client's dashboards
  // document §10) + each feature group they may open + (directors, Group view) the companies side by side.
  // Replaces the separate Home / Dashboards / Command view pages. Routes: #/ · #/dashboards/<group> · #/overview.
  import type { DashFilter, DashResponse, User } from '@btw/api';
  import Tabs from '../../components/page/Tabs.svelte';
  import { DASH_GROUPS, dashboardsFor, homeFor } from '@btw/api/dashboards';
  import { company, GROUP } from '../../lib/company.svelte';
  import { roleText } from '../../lib/roles';
  import { can } from '../../lib/features';
  import { dashDef } from '@btw/api/dashboards';
  import Board from './Board.svelte';
  import Filters from './Filters.svelte';
  import FilterPanel from './FilterPanel.svelte';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import { DEFAULT_PERIOD, datesOf } from './period';
  import { HOME_TAB, reportKeys } from './room';
  let { user, params }: { user: User; params?: { group?: string } } = $props();

  const groupView = company.active === GROUP; // the shell remounts screens on a company switch
  const director = $derived(user.roles.includes('director') || user.roles.includes('admin'));
  const mine = $derived(dashboardsFor(user));
  const home = $derived(homeFor(user));
  type Tab = { key: string; label: string; blurb: string };
  // Short tab names so every tab fits on one row (the group's full name stays in the page caption)
  const SHORT: Record<string, string> = { business: 'Business', fees: 'Fees & expenses', admin: 'Alerts & admin' };
  const ROOM_BLURB: Record<string, string> = {
    business: 'Stand of the business: KPIs, exceptions, profit bridge, and prices vs target.',
    purchasing: 'What to order, the pipeline, open orders, and plan vs actual.',
    loading: 'Today’s loading list, how far each order is loaded, and where trucks wait.',
    fleet: 'Live board, delays, open issues, and quiet trucks.',
    fees: 'Agreed vs actual, trip costs, payments, and unpaid ageing.',
    deliveries: 'Incoming trucks, damage and shortage, and loss causes.',
    warehouse: 'Warehouse today, stock cover, in transit, spend, and movements.',
    sales: 'Sales mix, cash vs credit, and who still owes.',
    admin: 'Alerts to handle first, and missing documents.',
  };
  const placed = (k: string) => HOME_TAB[k as keyof typeof HOME_TAB] ?? dashDef(k)?.group ?? '';
  const tabs = $derived<Tab[]>([
    { key: 'mine', label: 'My dashboards', blurb: home.includes('director-today') ? 'What needs a decision, and where the business stands.' : home.includes('warehouse-today') ? 'Today at the warehouse: what to sign, what arrives this week, what is running out.' : home.includes('order-this-week') ? 'What to order this week, then the pipeline and open orders.' : 'Your own set: only the companies, suppliers, routes and warehouses you work on.' },
    ...DASH_GROUPS.filter((g) => mine.some((d) => placed(d.key) === g.key)).map((g) => ({ key: g.key as string, label: SHORT[g.key] ?? g.label, blurb: ROOM_BLURB[g.key] ?? `${g.label}: ${g.blurb}` })),
    ...(director && groupView ? [{ key: 'companies', label: 'Companies', blurb: 'BTW, Nihna and Kivu compared on the same measures.' }] : []),
  ]);
  const wanted = $derived(params?.group ?? (location.hash.startsWith('#/overview') ? 'companies' : 'mine'));
  const active = $derived((tabs.find((t) => t.key === wanted) ?? tabs[0]).key);
  const tabAll = $derived(active === 'mine' ? home : reportKeys(active, mine.filter((d) => placed(d.key) === active).map((d) => d.key), user.roles));
  const analysisKeys = $derived(tabAll.filter((k) => dashDef(k)?.analysis));
  const panelKeys = $derived(tabAll.filter((k) => !dashDef(k)?.analysis));
  const hrefOf = (k: string) => (k === 'mine' ? '#/' : `#/dashboards/${k}`);
  let filter = $state<DashFilter>(datesOf(DEFAULT_PERIOD));
  let options = $state<DashResponse['options'] | null>(null);
  let filterOpen = $state(false);
  let filtersRef = $state<{ reset: () => void }>();
  let filterActive = $state(false);
  let filterChip = $state('');
  const showFilterBar = $derived.by(() => {
    if (active === 'companies') return false;
    if (active === 'mine' && home.includes('director-today')) return false;
    return panelKeys.length > 0 || analysisKeys.length > 0;
  });
  const hour = new Date().getHours();
</script>

<div class="page-head">
  <div><div class="overline crumb">{roleText(user.roles)}{groupView ? ' · Group view (read-only)' : ''}</div>
    <h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}</h1>
    <p class="caption">{tabs.find((t) => t.key === active)?.blurb ?? ''}</p></div>
  <div class="head-actions">
    {#if showFilterBar}
      <button type="button" class="btn btn-secondary btn-sm icon-only" aria-expanded={filterOpen} aria-label="Filters" onclick={() => (filterOpen = true)}>
        <SlidersHorizontal size={16} aria-hidden="true" />
      </button>
      {#if filterActive && filterChip}<span class="fchip">{filterChip}</span>{/if}
    {/if}
    {#if user.roles.includes('planner') && can(user, 'purchase-orders')}
      {#await import('../../components/page/ActionInCompany.svelte') then A}<A.default label="New purchase order" what="purchase order" href="#/pos/new" />{/await}
    {/if}
  </div>
</div>

{#if tabs.length > 1}
  <Tabs label="Dashboards" {tabs} value={active} {hrefOf} />
{/if}

{#if active === 'companies'}
  {#await import('../../components/group/GroupDashboard.svelte') then m}<m.default {user} embedded />{/await}
{:else if active === 'mine' && home.includes('director-today')}
  {#await import('./today/Today.svelte') then m}<m.default />{/await}
{:else if !panelKeys.length && !analysisKeys.length}
  <div class="card empty"><h2>No dashboards for your role yet</h2><p class="small">Use the menu to open your work.</p></div>
{:else}
  {#key active}
    {#if panelKeys.length}<Board keys={panelKeys} {filter} onload={(r) => (options = r.options)} />{/if}
    {#if analysisKeys.length}{#await import('./Analysis.svelte') then An}<An.default keys={analysisKeys} {filter} {user} />{/await}{/if}
  {/key}
{/if}

{#if showFilterBar}
  <FilterPanel bind:open={filterOpen} onClear={() => filtersRef?.reset()}>
    <Filters bind:this={filtersRef} bind:filter bind:active={filterActive} bind:chip={filterChip} {options} money={director} embedded />
  </FilterPanel>
{/if}

<style>
  .head-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .fchip { font-size: 12px; font-weight: 600; color: var(--text-muted); padding: 2px 10px; border-radius: var(--radius-full); border: 1px solid var(--border); background: var(--surface-sunken); }
  .icon-only { gap: 0; padding-inline: var(--space-2); }
</style>

