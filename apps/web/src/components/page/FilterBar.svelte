<script lang="ts">
  // Filters in one row (docs/17 §3 "Shared page layout" 3): optional search, then the page's selects / chips (children),
  // then "Clear filters" when any filter is on. On phones only the search shows, with a "Filters (n)" button that opens
  // the rest underneath. Wrap each select in <label class="field"><span>Route</span><select class="select">…</label>.
  import type { Snippet } from 'svelte';
  import Search from '@lucide/svelte/icons/search';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import X from '@lucide/svelte/icons/x';
  let { search = $bindable(), searchLabel = 'Search', placeholder = 'Search', active = 0, onclear, end, children }: {
    /** bind:search adds the search box (omit to hide it) */ search?: string;
    searchLabel?: string;
    placeholder?: string;
    /** number of filters that are on (not counting the search) — drives the phone badge and "Clear filters" */ active?: number;
    /** clears every filter (and the search); shown when anything is on */ onclear?: () => void;
    /** right-aligned slot (result count, view toggle) */ end?: Snippet;
    children?: Snippet;
  } = $props();
  const uid = $props.id();
  let open = $state(false);
  const hasSearch = $derived(search !== undefined);
  const any = $derived(active > 0 || !!search);
</script>

<div class="fb" role="search" aria-label="Filters">
  {#if hasSearch}
    <label class="srch"><span class="sr">{searchLabel}</span><Search size={16} aria-hidden="true" />
      <input class="input" type="search" {placeholder} bind:value={search} /></label>
  {/if}
  {#if children}
    <button type="button" class="btn btn-secondary more-btn" aria-expanded={open} aria-controls="{uid}-more" onclick={() => (open = !open)}>
      <SlidersHorizontal size={16} aria-hidden="true" />Filters{#if active}<span class="n" aria-label="{active} on">{active}</span>{/if}</button>
    <div class="more" class:open id="{uid}-more">{@render children()}</div>
  {/if}
  {#if onclear && any}<button type="button" class="btn btn-ghost btn-sm clear" onclick={onclear}><X size={14} aria-hidden="true" />Clear filters</button>{/if}
  {#if end}<div class="end">{@render end()}</div>{/if}
</div>

<style>
  .fb { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2) var(--space-3); margin-bottom: var(--space-4); }
  .srch { position: relative; display: flex; align-items: center; flex: 0 1 260px; min-width: 180px; }
  .srch :global(svg) { position: absolute; left: 10px; color: var(--text-subtle); pointer-events: none; }
  .srch .input { padding-left: 34px; }
  .more { display: contents; }
  .more :global(.field) { min-width: 150px; flex: 0 1 200px; }
  .more :global(.field > span) { font-size: var(--fs-caption); color: var(--text-muted); }
  .more-btn { display: none; }
  .n { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: var(--radius-full); background: var(--primary); color: var(--text-on-primary); font-size: 12px; }
  .clear { gap: 4px; }
  .end { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 600px) {
    .fb { align-items: center; gap: var(--space-2); }
    .srch { flex: 1 1 180px; min-width: 0; }
    .more-btn { display: inline-flex; }
    .more { display: none; }
    .more.open { display: flex; flex-wrap: wrap; gap: var(--space-2); width: 100%; order: 5; padding: var(--space-3); background: var(--surface-sunken); border-radius: var(--radius-md); }
    .more.open :global(.field) { flex: 1 1 140px; }
    .clear { order: 6; }
    .end { order: 7; margin-left: auto; }
  }
</style>
