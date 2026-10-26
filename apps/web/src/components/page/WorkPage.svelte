<script lang="ts">
  // Work-page frame (docs/17 §3): header → summary strip → filters → the list → detail drawer. Only spacing and order;
  // each part is its own component (PageHeader, SummaryStrip, FilterBar, DetailDrawer) passed in as a snippet.
  import type { Snippet } from 'svelte';
  let { header, strip, filters, drawer, children }: { header: Snippet; strip?: Snippet; filters?: Snippet; drawer?: Snippet; children: Snippet } = $props();
</script>
<div class="wp">
  {@render header()}
  {#if strip}{@render strip()}{/if}
  {#if filters}{@render filters()}{/if}
  <div class="content">{@render children()}</div>
  {#if drawer}{@render drawer()}{/if}
</div>
<style>
  .wp { display: flex; flex-direction: column; min-width: 0; }
  .content { min-width: 0; }
</style>
