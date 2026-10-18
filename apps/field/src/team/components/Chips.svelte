<script lang="ts">
  // Filter chips, horizontally scrollable. Bindable value.
  let { options, value = $bindable(), label = 'Filter' }: { options: { id: string; label: string; count?: number }[]; value: string; label?: string } = $props();
</script>
<div class="chips" role="tablist" aria-label={label}>
  {#each options as o (o.id)}
    <button role="tab" aria-selected={value === o.id} class:on={value === o.id} onclick={() => (value = o.id)}>{o.label}{#if o.count != null}<span class="n">{o.count}</span>{/if}</button>
  {/each}
</div>
<style>
  .chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--t-pad)); padding: 2px var(--t-pad); scroll-padding: var(--t-pad); }
  .chips::-webkit-scrollbar { display: none; }
  button { flex: none; height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--t-line); background: var(--t-card); color: var(--text); font: 600 15px var(--ff-body); display: inline-flex; align-items: center; gap: 8px; cursor: pointer; white-space: nowrap; transition: background var(--motion-fast), transform var(--motion-fast); }
  button:active { transform: scale(.96); }
  button.on { background: var(--text); color: var(--bg); border-color: var(--text); }
  .n { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--surface-sunken); color: var(--text-muted); font: 700 12px/22px var(--ff-body); text-align: center; }
  .on .n { background: color-mix(in srgb, var(--bg) 22%, transparent); color: var(--bg); }
</style>
