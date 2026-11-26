<script lang="ts">
  // Four figures across the top of a dashboard tab. The charts sit underneath.
  let { items, label }: { items: { label: string; value: string; sub?: string; href?: string }[]; label: string } = $props();
</script>

<div class="row" role="list" aria-label={label}>
  {#each items as s (s.label)}
    <svelte:element this={s.href ? 'a' : 'div'} class="card kpi" role="listitem" href={s.href || undefined}>
      <span class="lbl">{s.label}</span>
      <b class="val">{s.value}</b>
      {#if s.sub}<span class="sub">{s.sub}</span>{/if}
    </svelte:element>
  {/each}
</div>

<style>
  .row { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); }
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 16px; min-width: 0; color: inherit; text-decoration: none; }
  .lbl { font-size: 13px; color: var(--text-muted); }
  .val { font: 800 25px/1.25 var(--ff-display); font-variant-numeric: tabular-nums; margin: 2px 0 3px; }
  .sub { font-size: 12.5px; color: var(--text-muted); }
  @media (max-width: 1100px) { .row { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 720px) { .row { grid-template-columns: 1fr; } }
</style>
