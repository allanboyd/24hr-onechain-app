<script lang="ts">
  // Card around one chart: title, subtitle, period, "View data" (table of the same numbers) and CSV.
  import type { Snippet } from 'svelte';
  import { downloadCsv, type Rows } from './scale';
  import Table from '@lucide/svelte/icons/table-2';
  import Download from '@lucide/svelte/icons/download';
  import ChartIcon from '@lucide/svelte/icons/chart-column';
  let { title, subtitle = '', period = '', rows, filename, span = 1, children, actions }: {
    title: string; subtitle?: string; period?: string; /** header row first */ rows?: () => Rows; filename?: string;
    /** grid columns to span in .charts-grid (1 or 2) */ span?: 1 | 2; children: Snippet; actions?: Snippet;
  } = $props();
  let table = $state(false);
  const data = $derived(table && rows ? rows() : []);
  const isNum = (v: unknown) => typeof v === 'number';
</script>
<section class="card chart-card" class:wide={span === 2}>
  <header>
    <div class="grow"><h3>{title}</h3>{#if subtitle || period}<div class="caption">{subtitle}{#if subtitle && period}{' · '}{/if}{period}</div>{/if}</div>
    <div class="row" style="gap:var(--space-1);flex-wrap:nowrap">
      {@render actions?.()}
      {#if rows}
        <button class="btn btn-ghost btn-sm" aria-pressed={table} onclick={() => (table = !table)} title={table ? 'Show chart' : 'View data'}>{#if table}<ChartIcon size={16} /><span class="lbl">Chart</span>{:else}<Table size={16} /><span class="lbl">View data</span>{/if}</button>
        <button class="btn btn-ghost btn-sm" onclick={() => downloadCsv(filename ?? title.toLowerCase().replace(/\W+/g, '-'), rows())} title="Download CSV" aria-label="Download CSV"><Download size={16} /></button>
      {/if}
    </div>
  </header>
  {#if table}
    <div class="table-wrap" style="max-height:340px;overflow:auto"><table class="table">
      <thead><tr>{#each data[0] ?? [] as h, i}<th class:num={data.length > 1 && isNum(data[1][i])}>{h}</th>{/each}</tr></thead>
      <tbody>{#each data.slice(1) as r}<tr>{#each r as v}<td class:num={isNum(v)}>{isNum(v) ? (v as number).toLocaleString('en-US', { maximumFractionDigits: 2 }) : v}</td>{/each}</tr>{:else}<tr><td class="empty">No data</td></tr>{/each}</tbody>
    </table></div>
  {:else}
    {@render children()}
  {/if}
</section>
<style>
  .chart-card { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; padding: var(--space-4) var(--space-5); }
  .chart-card > header { display: flex; align-items: flex-start; gap: var(--space-3); margin: 0; }
  .chart-card h3 { font-size: var(--fs-h4); line-height: var(--lh-h4); }
  .wide { grid-column: span 2; }
  @media (max-width: 1100px) { .wide { grid-column: auto; } }
  @media (max-width: 600px) { .lbl { display: none; } }
</style>
