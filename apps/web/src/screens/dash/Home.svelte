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
  import { analysisMode, initAnalysisMode, setAdvanced } from './analysis-mode.svelte';
  import { HOME_TAB, ROOM, WORK } from './room';
  $effect(() => { initAnalysisMode(); });
  let { user, params }: { user: User; params?: { group?: string } } = $props();

  const groupView = company.active === GROUP; // the shell remounts screens on a company switch
  const director = $derived(user.roles.includes('director') || user.roles.includes('admin'));
  const mine = $derived(dashboardsFor(user));
  const home = $derived(homeFor(user));
  type Tab = { key: string; label: string; blurb: string };
  // Short tab names so every tab fits on one row (the group's full name stays in the page caption)
  const SHORT: Record<string, string> = { business: 'Business', fees: 'Fees & expenses', admin: 'Alerts & admin' };
  const ROOM_BLURB: Record<string, string> = {
    business: 'Overview and the executive report — sales, profit, what to act on, and where each $100 went.',
    purchasing: 'Plans and orders — planned cases against the purchase orders issued.',
    loading: 'What to load today. The longer queue report is under Advanced analysis.',
    fleet: 'Fleet and delays — where each truck is, and which ones ran long.',
    fees: 'Expenses, bills and balances — trip costs, what is paid, and what is still waiting.',
    deliveries: 'What is coming in, and what arrived damaged or short.',
    warehouse: 'Stock run-out and warehouse performance — cover, trucks on the way, and warehouse spend.',
    sales: 'Sales and clients — who bought, how they paid, and who still owes.',
    admin: 'Documents and alerts — what is missing, and what to handle first.',
  };
  const placed = (k: string) => HOME_TAB[k as keyof typeof HOME_TAB] ?? dashDef(k)?.group ?? '';
  const tabs = $derived<Tab[]>([
    { key: 'mine', label: 'My dashboards', blurb: home.includes('director-today') ? (analysisMode.on ? 'Today, then the charts that are not part of the control-room pages.' : 'Today — what needs your decision and where the business stands.') : home.includes('warehouse-today') ? 'Today at the warehouse — what to sign, what arrives this week, what is running out.' : home.includes('order-this-week') ? 'What to order this week, then the pipeline and open orders.' : 'Your own set — only the companies, suppliers, routes and warehouses you work on.' },
    ...DASH_GROUPS.filter((g) => mine.some((d) => placed(d.key) === g.key)).map((g) => ({ key: g.key as string, label: SHORT[g.key] ?? g.label, blurb: ROOM_BLURB[g.key] ?? `${g.label} — ${g.blurb}` })),
    ...(director && groupView ? [{ key: 'companies', label: 'Companies', blurb: 'BTW, Nihna and Kivu compared on the same measures.' }] : []),
  ]);
  const wanted = $derived(params?.group ?? (location.hash.startsWith('#/overview') ? 'companies' : 'mine'));
  const active = $derived((tabs.find((t) => t.key === wanted) ?? tabs[0]).key);
  const tabAll = $derived(active === 'mine' ? home : mine.filter((d) => placed(d.key) === active).map((d) => d.key));
  const analysisKeys = $derived(tabAll.filter((k) => dashDef(k)?.analysis));
  const panelKeys = $derived(tabAll.filter((k) => !dashDef(k)?.analysis));
  // Feature tabs lead with the control-room pages. The other cards wait for the switch. A person's own home set is left whole.
  const roomOnTab = $derived(panelKeys.filter((k) => ROOM.has(k) || WORK.has(k)));
  const extraOnTab = $derived(panelKeys.filter((k) => !ROOM.has(k) && !WORK.has(k)));
  const shownPanels = $derived(active === 'mine' || analysisMode.on ? panelKeys : roomOnTab);
  const SECTION = ['business', 'purchasing', 'loading', 'fleet', 'fees', 'deliveries', 'warehouse', 'sales', 'admin'];
  const sectionOfKey = (k: string) => placed(k);
  const deskExtra = $derived(mine.filter((d) => d.key !== 'director-today' && !d.analysis && !ROOM.has(d.key) && !WORK.has(d.key)).map((d) => d.key).sort((a, b) => SECTION.indexOf(sectionOfKey(a)) - SECTION.indexOf(sectionOfKey(b))));
  const deskAnalysis = $derived(mine.filter((d) => d.analysis).map((d) => d.key));
  const hrefOf = (k: string) => (k === 'mine' ? '#/' : `#/dashboards/${k}`);
  let filter = $state<DashFilter>(datesOf(DEFAULT_PERIOD));
  let options = $state<DashResponse['options'] | null>(null);
  const hour = new Date().getHours();
</script>

<div class="page-head">
  <div><div class="overline crumb">{roleText(user.roles)}{groupView ? ' · Group view (read-only)' : ''}</div>
    <h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}</h1>
    <p class="caption">{tabs.find((t) => t.key === active)?.blurb ?? ''}</p></div>
  <div class="head-actions">
    <button type="button" class="btn btn-secondary btn-sm" aria-pressed={analysisMode.on} onclick={() => setAdvanced(!analysisMode.on)}>{analysisMode.on ? 'Advanced analysis on' : 'Advanced analysis'}</button>
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
  {#if analysisMode.on}
    <h2 class="all-rep">Advanced analysis</h2>
    <p class="caption">Charts that are not on the control-room pages. Overview, plans, stock, fleet, expenses and sales stay on their tabs.</p>
    <Filters bind:filter {options} money={director} />
    {#key 'desk'}
      {#if deskExtra.length}<Board keys={deskExtra} {filter} sections onload={(r) => (options = r.options)} />{/if}
      {#if deskAnalysis.length}{#await import('./Analysis.svelte') then An}<An.default keys={deskAnalysis} {filter} {user} advanced />{/await}{/if}
    {/key}
  {/if}
{:else if !shownPanels.length && !analysisKeys.length}
  <div class="card empty"><h2>No dashboards for your role yet</h2><p class="small">Use the menu to open your work.</p></div>
{:else}
  <Filters bind:filter {options} money={director} />
  {#key active}
    {#if shownPanels.length}<Board keys={shownPanels} {filter} onload={(r) => (options = r.options)} />
    {:else}<p class="caption">The rest of this tab is under Advanced analysis.</p>{/if}
    {#if analysisKeys.length}{#await import('./Analysis.svelte') then An}<An.default keys={analysisKeys} {filter} {user} advanced={analysisMode.on} bare={analysisMode.on && analysisKeys.length === tabAll.length} />{/await}{/if}
    {#if !analysisMode.on && extraOnTab.length}<p class="caption">Advanced analysis adds {extraOnTab.length} more chart{extraOnTab.length === 1 ? '' : 's'} on this tab.</p>{/if}
  {/key}
{/if}

<style>
  .head-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
  .all-rep { margin: var(--space-6) 0 var(--space-2); }
</style>

