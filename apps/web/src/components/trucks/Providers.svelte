<script lang="ts">
  // Truck desk · Providers & trucks: the transport providers with their trucks, and the drivers (the same views as
  // Master data). People with transport master data add and edit here or in Master data; everyone else reads.
  import type { User } from '@btw/api';
  import { ChipGroup, readQuery, writeQuery } from '../page';
  import ProvidersTab from '../ProvidersTab.svelte';
  import DriversTab from '../DriversTab.svelte';
  import { can } from '../../lib/features';
  let { user }: { user: User } = $props();
  let view = $state(readQuery('list') === 'drivers' ? 'drivers' : 'providers');
  const edit = $derived(can(user, 'master-data.transport'));
</script>

<div class="bar">
  <ChipGroup label="Show" allowEmpty={false} bind:value={view} onchange={(v) => writeQuery({ list: v === 'drivers' ? v : null })}
    options={[{ value: 'providers', label: 'Providers & trucks' }, { value: 'drivers', label: 'Drivers' }]} />
  {#if edit}<a class="small" href="#/master?tab=providers">Open in Master data</a>{/if}
</div>
{#if view === 'drivers'}<DriversTab {user} />{:else}<ProvidersTab {user} />{/if}

<style>
  .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-3); }
</style>
