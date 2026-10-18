<script lang="ts">
  // Tiny bar strip (e.g. cases sold per day). The last bar is highlighted.
  let { values, height = 36, color = 'var(--t-accent)', label = '' }: { values: number[]; height?: number; color?: string; label?: string } = $props();
  const max = $derived(Math.max(1, ...values));
</script>
<div class="bars" style:height="{height}px" role="img" aria-label={label || 'trend'}>
  {#each values as v, i}<span style:height="{Math.max(6, (v / max) * 100)}%" style:background={color} class:last={i === values.length - 1}></span>{/each}
</div>
<style>
  .bars { display: flex; align-items: flex-end; gap: 2px; }
  span { flex: 1; border-radius: 3px 3px 1px 1px; opacity: .35; min-width: 2px; }
  span.last { opacity: 1; }
</style>
