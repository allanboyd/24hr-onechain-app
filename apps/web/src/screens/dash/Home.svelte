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
    business: 'Sales, expenses and profit, then prices and landed cost.',
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
    { key: 'mine', label: 'Overview', blurb: '' },
    ...DASH_GROUPS.filter((g) => mine.some((d) => placed(d.key) === g.key)).map((g) => ({ key: g.key as string, label: SHORT[g.key] ?? g.label, blurb: ROOM_BLURB[g.key] ?? `${g.label}: ${g.blurb}` })),
    ...(director && groupView ? [{ key: 'companies', label: 'Companies', blurb: 'BTW, Nihna and Kivu compared on the same measures.' }] : []),
  ]);
  // Operations → Live dashboards (#/dashboards) opens the first dashboard tab the person may see; Home (#/) stays on Overview
  const wanted = $derived(params?.group ?? (location.hash.startsWith('#/overview') ? 'companies' : /^#\/dashboards\/?$/.test(location.hash) ? (tabs[1]?.key ?? 'mine') : 'mine'));
  const active = $derived((tabs.find((t) => t.key === wanted) ?? tabs[0]).key);
  const tabAll = $derived(active === 'mine' ? home : reportKeys(active, mine.filter((d) => placed(d.key) === active).map((d) => d.key), user.roles));
  const analysisKeys = $derived(tabAll.filter((k) => dashDef(k)?.analysis));
  const panelKeys = $derived(tabAll.filter((k) => !dashDef(k)?.analysis));
  const hrefOf = (k: string) => (k === 'mine' ? '#/' : `#/dashboards/${k}`);
  let filter = $state<DashFilter>(datesOf(DEFAULT_PERIOD));
  let options = $state<DashResponse['options'] | null>(null);
  const showFilterBar = $derived(active !== 'companies' && (panelKeys.length > 0 || analysisKeys.length > 0 || (active === 'mine' && home.includes('director-today'))));
  const hour = new Date().getHours();
</script>

<div class="page-head">
  <div><div class="overline crumb">{roleText(user.roles)}{groupView ? ' · Group view' : ''}</div>
    <h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}</h1>
    </div>
    <div class="head-actions">
    <!-- V3-11a: My dashboards puts its filter toolbar here, at the right of the greeting (lib/portal.ts) -->
    <div id="home-head-tools" class="head-tools"></div>
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
  <Filters bind:filter {options} money={director} />
  {#await import('./today/Today.svelte') then m}<m.default {filter} onload={(o) => (options = o)} />{/await}
{:else if !panelKeys.length && !analysisKeys.length}
  <div class="card empty"><h2>No dashboards for your role yet</h2><p class="small">Use the menu to open your work.</p></div>
{:else}
  {#key active}
    {#if showFilterBar}<Filters bind:filter {options} money={director} />{/if}
    {#if panelKeys.length}<Board keys={panelKeys} {filter} onload={(r) => (options = r.options)} />{/if}
    {#if analysisKeys.length}{#await import('./Analysis.svelte') then An}<An.default keys={analysisKeys} {filter} {user} />{/await}{/if}
  {/key}
{/if}

<style>
  .head-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .head-tools { display: contents; }
</style>

