<script lang="ts">
  // Dependency-free SVG bar chart (no chart library on the critical path).
  import { fmtNum, fmtShortDate } from '@btw/ui';
  let { values, labels = [], height = 140 }: { values: number[]; labels?: string[]; height?: number } = $props();
  const max = $derived(Math.max(1, ...values));
  let hover = $state<number | null>(null);
  const w = 600;
  const bw = $derived(w / values.length);
</script>
<div class="spark">
  <svg viewBox="0 0 {w} {height}" preserveAspectRatio="none" role="img" aria-label="Bar chart">
    {#each values as v, i}
      <rect role="presentation" x={i * bw + 1} y={height - (v / max) * (height - 8)} width={Math.max(1, bw - 2)} height={(v / max) * (height - 8)} rx="2"
        class:hot={hover === i} onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)} />
    {/each}
  </svg>
  <div class="row between caption">
    <span>{labels[0] ? fmtShortDate(labels[0]) : ''}</span>
    <span>{hover != null ? `${labels[hover] ? fmtShortDate(labels[hover]) : ''}: ${fmtNum(values[hover])} cases` : `Peak ${fmtNum(max)} cases`}</span>
    <span>{labels.at(-1) ? fmtShortDate(labels.at(-1)) : ''}</span>
  </div>
</div>
<style>
  svg { width: 100%; height: 140px; display: block; }
  rect { fill: var(--primary); opacity: .85; }
  rect.hot { fill: var(--accent); opacity: 1; }
</style>
