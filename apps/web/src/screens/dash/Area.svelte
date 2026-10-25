<script lang="ts">
  // "Dashboards" area per feature group (docs/15): Directors / business, Purchasing, Loading, Fleet, Truck expenses & fees,
  // Deliveries, Warehouse, Sales, Admin & alerts — only the groups and dashboards this person may open.
  import type { DashFilter, DashResponse, User } from '@btw/api';
  import { DASH_GROUPS, dashboardsFor, type DashGroup } from '@btw/api/dashboards';
  import Board from './Board.svelte';
  import Filters from './Filters.svelte';
  let { user, params }: { user: User; params?: { group?: string } } = $props();
  const mine = $derived(dashboardsFor(user));
  const groups = $derived(DASH_GROUPS.filter((g) => mine.some((d) => d.group === g.key)));
  const active = $derived((groups.find((g) => g.key === params?.group) ?? groups[0])?.key as DashGroup | undefined);
  const keys = $derived(mine.filter((d) => d.group === active).map((d) => d.key));
  const blurb = $derived(groups.find((g) => g.key === active)?.blurb ?? '');
  const director = $derived(user.roles.includes('director') || user.roles.includes('admin'));
  let filter = $state<DashFilter>({});
  let options = $state<DashResponse['options'] | null>(null);
</script>

<div class="page-head"><div><div class="overline crumb">Dashboards</div><h1>{groups.find((g) => g.key === active)?.label ?? 'Dashboards'}</h1><p class="caption">{blurb}</p></div></div>
{#if !groups.length}
  <div class="card empty"><h2>No dashboards for your role yet</h2></div>
{:else}
  <nav class="tabs" aria-label="Dashboard groups">{#each groups as g}<a href="#/dashboards/{g.key}" class:on={g.key === active} aria-current={g.key === active ? 'page' : undefined}>{g.label}</a>{/each}</nav>
  <Filters bind:filter {options} money={director} />
  {#key active}<Board {keys} {filter} onload={(r) => (options = r.options)} />{/key}
{/if}

<style>
  .tabs { display: flex; gap: var(--space-1); overflow-x: auto; border-bottom: 1px solid var(--border); margin-top: var(--space-2); }
  .tabs a { padding: var(--space-2) var(--space-3); white-space: nowrap; color: var(--text-muted); text-decoration: none; border-bottom: 3px solid transparent; font-weight: 600; font-size: 14px; }
  .tabs a.on { color: var(--text); border-bottom-color: var(--nav-indicator, var(--primary)); }
</style>
