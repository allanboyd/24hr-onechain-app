<script lang="ts">
  // Card around one chart: title, subtitle, period, "View data" (table of the same numbers) and CSV.
  import type { Snippet } from 'svelte';
  import { downloadCsv, type Rows } from './scale';
  import InfoTip from '../page/InfoTip.svelte';
  import Table from '@lucide/svelte/icons/table-2';
  import Download from '@lucide/svelte/icons/download';
  import ChartIcon from '@lucide/svelte/icons/chart-column';
  let { title, subtitle = '', period = '', rows, filename, span = 1, children, actions }: {
    title: string; subtitle?: string; period?: string; /** header row first */ rows?: () => Rows; filename?: string;
    /** grid columns to span in .charts-grid (1 or 2) */ span?: 1 | 2; children: Snippet; actions?: Snippet;
  } = $props();
  let table = $state(false);
  const note = $derived([subtitle, period].filter(Boolean));
  const data = $derived(table && rows ? rows() : []);
  const isNum = (v: unknown) => typeof v === 'number';
</script>
<section class="card chart-card" class:wide={span === 2}>
  <header>
    <div class="title-row">
      <h3>{title}</h3>
      {#if note.length}<InfoTip lines={note} label="About {title}" size={15} />{/if}
    </div>
    <div class="tools">
      {@render actions?.()}
      {#if rows}
        <div class="view-toggle" role="group" aria-label="View mode">
          <button type="button" class="ibtn" aria-pressed={!table} aria-label="Show chart" title="Show chart" onclick={() => (table = false)}><ChartIcon size={16} aria-hidden="true" /></button>
          <button type="button" class="ibtn" aria-pressed={table} aria-label="Show table" title="Show table" onclick={() => (table = true)}><Table size={16} aria-hidden="true" /></button>
        </div>
        <button type="button" class="ibtn" onclick={() => downloadCsv(filename ?? title.toLowerCase().replace(/\W+/g, '-'), rows())} title="Download CSV" aria-label="Download CSV"><Download size={16} aria-hidden="true" /></button>
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
  .chart-card { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; width: 100%; height: auto; align-self: start; padding: var(--space-4) var(--space-5); }
  .chart-card > header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin: 0; min-height: 32px; }
  .title-row { display: flex; align-items: center; gap: 2px; min-width: 0; flex: 1 1 auto; }
  .chart-card h3 { margin: 0; min-width: 0; font-size: var(--fs-h4); line-height: var(--lh-h4); }
  .tools { display: flex; align-items: center; gap: var(--space-1); flex: none; margin-left: auto; }
  .view-toggle { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface-sunken); }
  .ibtn { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-full); border: 0; background: none; color: var(--text-subtle); cursor: pointer; }
  .ibtn:hover, .view-toggle .ibtn[aria-pressed='true'] { color: var(--text); background: var(--surface-sunken); }
  .wide { grid-column: span 2; }
  @media (max-width: 1100px) { .wide { grid-column: auto; } }
</style>
