<script lang="ts">
  import { slot } from './scale';
  let { items }: { items: { name: string; slot?: number; kind?: 'line' | 'rect' | 'dash'; color?: string }[] } = $props();
</script>
<ul class="legend" aria-label="Legend">
  {#each items as it, i}<li><span class="viz-key {it.kind ?? 'rect'}" style:background={it.kind === 'dash' ? undefined : it.color ?? slot(it.slot ?? i)} style:color={it.color ?? slot(it.slot ?? i)}></span>{it.name}</li>{/each}
</ul>
<style>
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: var(--fs-caption); color: var(--text-muted); }
  .legend li { display: inline-flex; align-items: center; gap: 6px; }
</style>
