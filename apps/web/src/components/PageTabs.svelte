<script lang="ts">
  // Overview | List tabs, remembered in the URL (#/inventory?tab=list&level=Low) so links, refresh and Back work.
  import { router } from '@btw/ui';
  import ChartIcon from '@lucide/svelte/icons/chart-column';
  import ListIcon from '@lucide/svelte/icons/list';
  let { base, current, listLabel = 'List' }: { base: string; current: 'overview' | 'list'; listLabel?: string } = $props();
  const go = (t: 'overview' | 'list') => { if (t !== current) router.go(t === 'list' ? `${base}?tab=list` : base); };
</script>
<div class="tabs" role="tablist" aria-label="View">
  <button role="tab" aria-selected={current === 'overview'} onclick={() => go('overview')}><ChartIcon size={16} /> Overview</button>
  <button role="tab" aria-selected={current === 'list'} onclick={() => go('list')}><ListIcon size={16} /> {listLabel}</button>
</div>
<style>.tabs button { display: inline-flex; align-items: center; gap: 6px; }</style>
