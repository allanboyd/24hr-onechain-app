<script lang="ts">
  // C-05 web home: each person's own dashboards (client's dashboards document §10) — directors the executive overview first,
  // Kabonge purchasing, Testfie trucks and fees, loaders today's loading, Asie / Yonas their warehouse. docs/15.
  import type { DashFilter, DashResponse, User } from '@btw/api';
  import { homeFor, dashboardsFor } from '@btw/api/dashboards';
  import { company, GROUP } from '../../lib/company.svelte';
  import { roleText } from '../../lib/roles';
  import Board from './Board.svelte';
  import Filters from './Filters.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  let { user }: { user: User } = $props();
  const keys = $derived(homeFor(user));
  const director = $derived(user.roles.includes('director') || user.roles.includes('admin'));
  let filter = $state<DashFilter>({});
  let options = $state<DashResponse['options'] | null>(null);
  const group = company.active === GROUP;
  const hour = new Date().getHours();
</script>

<div class="page-head">
  <div><div class="overline crumb">{roleText(user.roles)}{group ? ' · Group view (read-only)' : ''}</div><h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]}</h1>
    <p class="caption">Your dashboards — only the companies, suppliers, routes and warehouses you work on.</p></div>
  <div class="row">
    {#if dashboardsFor(user).length > keys.length}<a class="btn btn-secondary" href="#/dashboards">All dashboards <ArrowRight size={16} /></a>{/if}
    {#if director}<a class="btn btn-ghost" href="#/overview">{group ? 'Companies side by side' : 'Command view'}</a>{/if}
  </div>
</div>
{#if !keys.length}
  <div class="card empty"><h2>No dashboards for your role yet</h2><p class="small">Use the menu to open your work.</p></div>
{:else}
  <Filters bind:filter {options} money={director} />
  <Board {keys} {filter} onload={(r) => (options = r.options)} />
{/if}
