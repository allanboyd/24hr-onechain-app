<script lang="ts">
  // iOS-style segmented control for switching a screen's lists.
  let { options, value = $bindable(), label = 'View' }: { options: { id: string; label: string }[]; value: string; label?: string } = $props();
</script>
<div class="seg" role="tablist" aria-label={label} style:--n={options.length} style:--i={Math.max(0, options.findIndex((o) => o.id === value))}>
  <span class="thumb" aria-hidden="true"></span>
  {#each options as o (o.id)}<button role="tab" aria-selected={value === o.id} class:on={value === o.id} onclick={() => (value = o.id)}>{o.label}</button>{/each}
</div>
<style>
  .seg { position: relative; display: grid; grid-template-columns: repeat(var(--n), 1fr); padding: 4px; border-radius: 16px; background: var(--surface-sunken); }
  .thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n)); border-radius: 12px; background: var(--surface); box-shadow: var(--elevation-1); transform: translateX(calc(var(--i) * 100%)); transition: transform var(--motion-base) var(--motion-easing); }
  button { position: relative; z-index: 1; height: 42px; border: 0; background: none; color: var(--text-muted); font: 600 15px var(--ff-body); cursor: pointer; border-radius: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 6px; }
  button.on { color: var(--text); font-weight: 700; }
</style>
