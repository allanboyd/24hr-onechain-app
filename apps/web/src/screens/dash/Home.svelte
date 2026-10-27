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
  let { user, params }: { user: User; params?: { group?: string } } = $props();

  const groupView = company.active === GROUP; // the shell remounts screens on a company switch
  const director = $derived(user.roles.includes('director') || user.roles.includes('admin'));
  const mine = $derived(dashboardsFor(user));
  const home = $derived(homeFor(user));
  type Tab = { key: string; label: string; blurb: string };
  // Short tab names so every tab fits on one row (the group's full name stays in the page caption)
  const SHORT: Record<string, string> = { business: 'Business', fees: 'Fees & expenses', admin: 'Alerts & admin' };
  const tabs = $derived<Tab[]>([
    { key: 'mine', label: 'My dashboards', blurb: home.includes('director-today') ? 'Today — what needs your decision and where the business stands. Each card opens the full tab.' : 'Your own set — only the companies, suppliers, routes and warehouses you work on.' },
    ...DASH_GROUPS.filter((g) => mine.some((d) => d.group === g.key)).map((g) => ({ key: g.key as string, label: SHORT[g.key] ?? g.label, blurb: `${g.label} — ${g.blurb}` })),
    ...(director && groupView ? [{ key: 'companies', label: 'Companies', blurb: 'BTW, Nihna and Kivu compared on the same measures.' }] : []),
  ]);
  const wanted = $derived(params?.group ?? (location.hash.startsWith('#/overview') ? 'companies' : 'mine'));
  const active = $derived((tabs.find((t) => t.key === wanted) ?? tabs[0]).key);
  const keys = $derived(active === 'mine' ? home : mine.filter((d) => d.group === active).map((d) => d.key));
  const analysisKeys = $derived(keys.filter((k) => dashDef(k)?.analysis));
  const hrefOf = (k: string) => (k === 'mine' ? '#/' : `#/dashboards/${k}`);
  let filter = $state<DashFilter>({});
  let options = $state<DashResponse['options'] | null>(null);
  const hour = new Date().getHours();
</script>

<div class="page-head">
  <div><div class="overline crumb">{roleText(user.roles)}{groupView ? ' · Group view (read-only)' : ''}</div>
    <h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}</h1>
    <p class="caption">{tabs.find((t) => t.key === active)?.blurb ?? ''}</p></div>
  {#if user.roles.includes('planner') && can(user, 'purchase-orders')}
    {#await import('../../components/page/ActionInCompany.svelte') then A}<A.default label="New purchase order" what="purchase order" href="#/pos/new" />{/await}
  {/if}
</div>

{#if tabs.length > 1}
  <Tabs label="Dashboards" {tabs} value={active} {hrefOf} />
{/if}

{#if active === 'companies'}
  {#await import('../../components/group/GroupDashboard.svelte') then m}<m.default {user} embedded />{/await}
{:else if active === 'mine' && home.includes('director-today')}
  <!-- directors: one curated daily view (docs/15 §3); the feature tabs keep every other dashboard -->
  {#await import('./today/Today.svelte') then m}<m.default />{/await}
{:else if !keys.length}
  <div class="card empty"><h2>No dashboards for your role yet</h2><p class="small">Use the menu to open your work.</p></div>
{:else}
  <Filters bind:filter {options} money={director} />
  {#key active}<Board {keys} {filter} onload={(r) => (options = r.options)} />
    {#if analysisKeys.length}{#await import('./Analysis.svelte') then An}<An.default keys={analysisKeys} {filter} {user} />{/await}{/if}{/key}
{/if}

