<script lang="ts">
  // Status chips with counts (tap → list): fleet by status, PO pipeline by stage, orders by age. Big tap targets,
  // the tone is shown with an icon and the words, never by colour alone.
  import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Info from '@lucide/svelte/icons/info';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import type { CountTile } from '../glance';
  let { tiles, label, cols = 3 }: { tiles: CountTile[]; label: string; cols?: 2 | 3 } = $props();
  const ICON = { danger: OctagonAlert, warning: TriangleAlert, success: CircleCheck, info: Info, neutral: CircleDashed };
</script>
<nav class="tiles c{cols}" aria-label={label}>
  {#each tiles as x (x.id)}
    {@const Icon = ICON[x.tone]}
    <a class="tile t-press tone-{x.tone}" class:zero={!x.count} href="#{x.href}" aria-label="{x.label}: {x.count}">
      <span class="n">{x.count}</span>
      <span class="l"><Icon size={14} aria-hidden="true" />{x.label}</span>
    </a>
  {/each}
</nav>
<style>
  .tiles { display: grid; gap: 8px; }
  .c3 { grid-template-columns: repeat(3, 1fr); } .c2 { grid-template-columns: repeat(2, 1fr); }
  .tile { display: flex; flex-direction: column; gap: 4px; min-height: 76px; padding: 10px 12px; border-radius: var(--t-radius-sm); background: var(--t-card); border: 1px solid var(--t-line); box-shadow: var(--t-shadow); color: var(--text); text-decoration: none; min-width: 0; border-top: 3px solid var(--tc); }
  .n { font: 800 26px/30px var(--ff-display); font-variant-numeric: tabular-nums; }
  .l { display: flex; align-items: flex-start; gap: 4px; font: 600 13px/16px var(--ff-body); color: var(--text-muted); }
  .l :global(svg) { flex: none; margin-top: 1px; color: var(--tc); }
  .zero .n { color: var(--text-subtle); }
  .tone-danger { --tc: var(--danger); } .tone-warning { --tc: var(--warning-solid); } .tone-success { --tc: var(--success); } .tone-info { --tc: var(--info, var(--t-accent)); } .tone-neutral { --tc: var(--border-strong); }
</style>
