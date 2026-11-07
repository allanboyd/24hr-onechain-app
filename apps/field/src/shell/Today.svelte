<script lang="ts">
  // Loader list tab: today's to-load + dispatched, as a page (same data as the old sheet).
  import { field, type GiverWork, type User } from '@btw/api';
  import { live } from '../live';
  import { focus } from './focus.svelte';
  import TodaySheet from '../components/TodaySheet.svelte';
  let { user }: { user: User } = $props();
  let work = $state<GiverWork | null>(null);
  $effect(() => live(async () => { work = await field.giver(); }));
  const lp = $derived(focus.loadingPointId || user.loadingPointIds[0] || '');
</script>

{#if work && lp}
  <TodaySheet page {lp} toLoad={work.toLoad} />
{:else}
  <div class="page"><div class="skeleton" style="height:64px"></div></div>
{/if}

<style>
  .page { padding: calc(env(safe-area-inset-top) + 20px) var(--space-5) calc(var(--field-nav, 68px) + 16px); }
</style>
