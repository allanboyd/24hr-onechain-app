<script lang="ts">
  // Card frame for directors' Today: title, caption, decision, chart|table icon toggle, export, optional drill.
  import type { Snippet } from 'svelte';
  import ExportMenu from '../../../components/dashboard/ExportMenu.svelte';
  import type { Rows } from '../../../components/dashboard/export/meta';
  import { freshnessText } from '../../../components/dashboard/Freshness.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import ChartIcon from '@lucide/svelte/icons/chart-column';
  import TableIcon from '@lucide/svelte/icons/table-2';
  let {
    title, definition = '', caption = '', decision = '', updatedAt, rows, filename, drill, empty = false, emptyText = 'No data yet',
    actions, children, tableView,     flush = false, viewToggle = false, tone = 'default', fill = false,
  }: {
    title: string; definition?: string; caption?: string; decision?: string; updatedAt?: string | null;
    rows?: () => Rows; filename?: string; drill?: { label: string; href: string };
    empty?: boolean; emptyText?: string; actions?: Snippet; children: Snippet; tableView?: Snippet;
    flush?: boolean; /** show chart | table icon pair when rows + tableView exist */ viewToggle?: boolean;
    tone?: 'default' | 'primary' | 'attention';
    /** grow so a map can fill the leftover height of the row */
    fill?: boolean;
  } = $props();
  const uid = `tc-${Math.random().toString(36).slice(2, 8)}`;
  let table = $state(false);
  let body = $state<HTMLDivElement>();
  const name = $derived(filename ?? title.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, ''));
  const canToggle = $derived(viewToggle && !!rows && !!tableView && !empty);
  const data = $derived(rows ? rows() : []);
  const isNum = (v: unknown) => typeof v === 'number';
  $effect(() => { decision; });
</script>

<section class="tc" class:primary={tone === 'primary'} class:attention={tone === 'attention'} class:fill aria-labelledby="{uid}-t">
  <header>
    <div class="ttl">
      <h3 id="{uid}-t">{title}</h3>
    </div>
    <div class="tools">
      {@render actions?.()}
      {#if canToggle || (rows && !empty)}
        <div class="vt" role="group" aria-label="Chart, table or export">
          {#if canToggle}
            <button type="button" class="vbtn" aria-pressed={!table} aria-label="Show chart" title="Show chart" onclick={() => (table = false)}><ChartIcon size={16} /></button>
            <button type="button" class="vbtn" aria-pressed={table} aria-label="Show table" title="Show table" onclick={() => (table = true)}><TableIcon size={16} /></button>
          {/if}
          {#if rows && !empty}<ExportMenu iconOnly {name} meta={() => ({ title, subtitle: caption, definition, unit: '', period: caption, filters: '', owner: 'Directors', freshness: updatedAt === undefined ? '' : freshnessText(updatedAt) })} {rows} root={() => body} />{/if}
        </div>
      {/if}
    </div>
  </header>
  <div class="body" class:flush={!table && flush} bind:this={body}>
    {#if empty}<div class="nodata" role="status"><CircleDashed size={20} aria-hidden="true" /><span>{emptyText}</span></div>
    {:else if table && canToggle}
      {#if tableView}{@render tableView()}{:else}
        <div class="table-wrap" style="max-height:360px;overflow:auto"><table class="table">
          <thead><tr>{#each data[0] ?? [] as h, i}<th class:num={data.length > 1 && isNum(data[1][i])}>{h}</th>{/each}</tr></thead>
          <tbody>{#each data.slice(1) as r}<tr>{#each r as v}<td class:num={isNum(v)}>{isNum(v) ? (v as number).toLocaleString('en-US', { maximumFractionDigits: 2 }) : v}</td>{/each}</tr>{/each}</tbody>
        </table></div>
      {/if}
    {:else}{@render children()}{/if}
  </div>
  {#if drill && !empty}<a class="drill" href={drill.href}>{drill.label}<ArrowRight size={15} aria-hidden="true" /></a>{/if}
</section>

<style>
  .tc { display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--elevation-1); padding: var(--space-5) var(--space-6); }
  .tc.primary, .tc.attention { color: var(--text-on-primary); border-color: transparent; }
  .tc.primary { background: var(--primary); }
  .tc.attention { background: var(--attention); }
  .tc.primary h3, .tc.attention h3, .tc.primary .drill, .tc.attention .drill { color: var(--text-on-primary); }
  .tc.primary .vt, .tc.attention .vt, .tc.primary .vbtn, .tc.attention .vbtn { border-color: color-mix(in srgb, var(--text-on-primary) 28%, transparent); color: var(--text-on-primary); }
  .tc.primary .vbtn[aria-pressed='true'], .tc.attention .vbtn[aria-pressed='true'] { background: color-mix(in srgb, var(--text-on-primary) 16%, transparent); color: var(--text-on-primary); }
  .tc.primary .vbtn:hover, .tc.attention .vbtn:hover { color: var(--text-on-primary); }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 32px; }
  .ttl { display: flex; align-items: center; gap: 2px; min-width: 0; flex: 1 1 auto; }
  h3 { font-size: 16px; line-height: 1.3; font-weight: 700; margin: 0; min-width: 0; font-family: var(--font-display, inherit); }
  .tools { display: flex; align-items: center; gap: var(--space-2); flex: none; margin-left: auto; }
  .vt { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: var(--radius-md); overflow: visible; }
  .tc.primary :global(.ib), .tc.attention :global(.ib) { color: var(--text-on-primary); border-color: color-mix(in srgb, var(--text-on-primary) 28%, transparent); }
  .tc.primary :global(.ib:hover), .tc.attention :global(.ib:hover) { color: var(--text-on-primary); background: color-mix(in srgb, var(--text-on-primary) 16%, transparent); }
  .vbtn { display: grid; place-items: center; width: 32px; height: 30px; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
  .vbtn + .vbtn { border-left: 1px solid var(--border); }
  .vbtn[aria-pressed='true'] { background: var(--surface-sunken); color: var(--text); }
  .vbtn:hover { color: var(--text); }
  .body { margin-top: var(--space-4); min-width: 0; display: flex; flex-direction: column; }
  .fill { height: 100%; }
  .fill .body { flex: 1; min-height: 0; }
  .body.flush { margin-left: calc(-1 * var(--space-6)); margin-right: calc(-1 * var(--space-6)); }
  .nodata { display: flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 140px; color: var(--text-muted); background: var(--surface-sunken); border-radius: var(--radius-md); font-size: 14px; }
  .drill { align-self: stretch; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: var(--space-4); padding: 9px var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border); color: var(--text); font-weight: 600; font-size: 13px; text-decoration: none; }
  .drill:hover { background: var(--surface-sunken); }
  @media (max-width: 600px) { .tc { padding: var(--space-4); } .body.flush { margin-left: calc(-1 * var(--space-4)); margin-right: calc(-1 * var(--space-4)); } }
</style>
