<script lang="ts">
  // Reconciliation table beneath <GroupedBars>: each series per item, then the absolute and % gap between consecutive series, with status chips.
  import StatusBadge from './StatusBadge.svelte';
  import { gapOf, gapText } from './gap';
  let { categories, series, format = (n: number) => n.toLocaleString('en-US'), tolerance = 0.005, itemLabel = 'Item', unit = '', onselect }: {
    categories: string[]; series: { name: string; values: (number | null)[] }[]; format?: (n: number) => string;
    tolerance?: number; itemLabel?: string; unit?: string; onselect?: (category: string) => void;
  } = $props();
  const steps = $derived(series.slice(1).map((s, i) => ({ from: series[i], to: s })));
  const worst = (i: number) => {
    const gs = steps.map((st) => gapOf(st.from.values[i], st.to.values[i], tolerance).status);
    return gs.includes('bad') ? 'bad' : gs.includes('warn') ? 'warn' : gs.every((g) => g === 'none') ? 'none' : 'good';
  };
  const word = { good: 'Matches', warn: 'Check', bad: 'Gap', none: 'No data' } as const;
</script>
<div class="table-wrap gap-table"><table class="table">
  <caption class="sr-only">Gaps between {series.map((s) => s.name.toLowerCase()).join(', ')}{unit ? ` in ${unit}` : ''}</caption>
  <thead><tr><th>{itemLabel}</th>{#each series as s}<th class="num">{s.name}</th>{/each}{#each steps as st}<th class="num">{st.to.name} vs {st.from.name.toLowerCase()}</th>{/each}<th>Status</th></tr></thead>
  <tbody>
    {#each categories as c, i}
      {@const st = worst(i)}
      <tr>
        <td>{#if onselect}<button class="linkish" onclick={() => onselect(c)}>{c}</button>{:else}{c}{/if}</td>
        {#each series as s}<td class="num">{s.values[i] == null ? '—' : format(s.values[i]!)}</td>{/each}
        {#each steps as stp}{@const g = gapOf(stp.from.values[i], stp.to.values[i], tolerance)}<td class="num g-{g.status}">{gapText(g, format)}</td>{/each}
        <td><StatusBadge status={st} label={word[st]} /></td>
      </tr>
    {:else}<tr><td colspan={series.length + steps.length + 2} class="empty">No data yet</td></tr>{/each}
  </tbody>
</table></div>
<style>
  .gap-table { margin-top: var(--space-2); }
  .gap-table td { height: 38px; }
  .g-bad { color: var(--danger); font-weight: 600; } .g-warn { color: var(--warning); font-weight: 600; }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--link); cursor: pointer; text-align: left; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
