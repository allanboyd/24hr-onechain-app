<script lang="ts">
  // Section tabs on a phone screen — the same Home-page tab style as the web (base.css `.tabs`): plain text, thin bottom
  // border, the chosen tab in normal text colour with a 3 px coloured underline. Bigger targets for thumbs. Use the
  // Segmented switch only for a choice inside a form (Cash / Credit).
  let { options, value = $bindable(), label = 'Sections' }: { options: { id: string; label: string; count?: number | null }[]; value: string; label?: string } = $props();
</script>
<div class="tabs t-tabs" role="tablist" aria-label={label}>
  {#each options as o (o.id)}<button type="button" role="tab" aria-selected={value === o.id} onclick={() => (value = o.id)}>{o.label}{#if o.count != null}<span class="n">{o.count}</span>{/if}</button>{/each}
</div>
<style>
  .t-tabs { margin: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .t-tabs::-webkit-scrollbar { display: none; }
  .t-tabs > button { flex: 1 0 auto; justify-content: center; min-height: 44px; font-size: 15px; }
</style>
