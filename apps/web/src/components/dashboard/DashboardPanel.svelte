<script lang="ts">
  // C-02 dashboard frame around one chart / list: title, metric definition (ⓘ), unit or currency, date range, data freshness,
  // filters, drill-down link, loading skeleton, error, an explicit "No data yet" state (never zeros), "View data" and
  // CSV / Excel / PDF export. ChartCard stays as-is for existing screens; new dashboards use this.
  import type { Snippet } from 'svelte';
  import ErrorState from '../ErrorState.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import Freshness, { freshnessText, type When } from './Freshness.svelte';
  import type { Rows } from './export/meta';
  import Info from '@lucide/svelte/icons/info';
  import Calendar from '@lucide/svelte/icons/calendar';
  import Table from '@lucide/svelte/icons/table-2';
  import ChartIcon from '@lucide/svelte/icons/chart-column';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';

  let {
    title, subtitle = '', decision = '', definition = '', owner = '', unit = '', period = '', updatedAt, freshness = 'updated', staleAfter = 60,
    filters, filterText = '', drill, loading = false, error = null, onretry, empty, emptyText = 'No data yet', emptyHint = '',
    rows, filename, span = 1, exports = ['csv', 'xlsx', 'pdf'], skeleton = 240, children, actions,
  }: {
    title: string; subtitle?: string;
    /** what to do with the figure — shown as "Decision: …" under the situation line */ decision?: string;
    /** what the metric means and how it is calculated (ⓘ popover; also printed on exports) */ definition?: string;
    /** accountable data owner */ owner?: string;
    /** unit / currency label, e.g. "KES" or "cases" */ unit?: string;
    /** date range label, e.g. "1–25 Oct 2026" */ period?: string;
    /** when the data was produced; omit to hide the label */ updatedAt?: When; freshness?: 'updated' | 'synced'; /** minutes */ staleAfter?: number;
    /** scoped filters for this panel */ filters?: Snippet; /** the active filters in words, for exports */ filterText?: string;
    drill?: { label: string; href?: string; onclick?: () => void };
    loading?: boolean; error?: unknown; onretry?: () => void;
    /** force the empty state; by default the panel is empty when `rows` has no data rows */ empty?: boolean; emptyText?: string; emptyHint?: string;
    /** header row first — powers View data and every export */ rows?: () => Rows; filename?: string;
    span?: 1 | 2 | 3 | 'full'; exports?: ('csv' | 'xlsx' | 'pdf')[]; /** skeleton height (px) */ skeleton?: number;
    children: Snippet; actions?: Snippet;
  } = $props();

  const uid = `dp-${Math.random().toString(36).slice(2, 8)}`;
  let info = $state(false);
  let table = $state(false);
  let body = $state<HTMLDivElement>();
  let infoEl = $state<HTMLSpanElement>();
  const ready = $derived(!loading && !error);
  const data = $derived(ready && rows ? rows() : []);
  const isEmpty = $derived(ready && (empty ?? (rows ? data.length <= 1 : false)));
  const isNum = (v: unknown) => typeof v === 'number';
  const name = $derived(filename ?? title.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, ''));
  const meta = () => ({ title, subtitle, definition, unit, period, filters: filterText, owner, freshness: updatedAt === undefined ? '' : freshnessText(updatedAt, freshness) });
  $effect(() => {
    if (!info) return;
    const away = (e: Event) => { if (infoEl && !infoEl.contains(e.target as Node)) info = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') info = false; };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  });
</script>

<section class="card dash-panel span-{span}" aria-labelledby="{uid}-t" aria-busy={loading}>
  <header>
    <div class="grow">
      <div class="trow">
        <h3 id="{uid}-t">{title}</h3>
        {#if definition}
          <span class="info" bind:this={infoEl}>
            <button class="ibtn" aria-expanded={info} aria-controls="{uid}-d" aria-label="What {title} means" onclick={() => (info = !info)}><Info size={15} /></button>
            {#if info}<div class="pop" id="{uid}-d" role="note"><strong>{title}</strong><p>{definition}</p>{#if unit}<p class="caption">Unit: {unit}</p>{/if}{#if owner}<p class="caption">Data owner: {owner}</p>{/if}</div>{/if}
          </span>
        {/if}
      </div>
      <div class="caption meta">
        {#if subtitle}<span>{subtitle}</span>{/if}
        {#if unit}<span class="unit">{unit}</span>{/if}
        {#if period}<span class="ic"><Calendar size={13} aria-hidden="true" />{period}</span>{/if}
        {#if updatedAt !== undefined}<Freshness at={updatedAt} kind={freshness} {staleAfter} />{/if}
      </div>
      {#if decision}<p class="decision"><b>Decision</b> {decision}</p>{/if}
    </div>
    <div class="tools">
      {@render actions?.()}
      {#if rows && ready && !isEmpty}
        <button class="btn btn-ghost btn-sm" aria-pressed={table} onclick={() => (table = !table)} title={table ? 'Show chart' : 'View data'}>{#if table}<ChartIcon size={16} /><span class="lbl">Chart</span>{:else}<Table size={16} /><span class="lbl">View data</span>{/if}</button>
        {#if exports.length}<ExportMenu {name} {meta} rows={rows} root={() => body} formats={exports} />{/if}
      {/if}
    </div>
  </header>
  {#if filters}<div class="filters">{@render filters()}</div>{/if}

  <div class="body" bind:this={body}>
    {#if error}
      <ErrorState {error} {onretry} compact />
    {:else if loading}
      <div class="skeleton" style:height="{skeleton}px" aria-label="Loading {title}"></div>
    {:else if isEmpty}
      <div class="nodata" role="status"><CircleDashed size={22} aria-hidden="true" /><strong>{emptyText}</strong>{#if emptyHint}<span class="small muted">{emptyHint}</span>{/if}</div>
    {:else if table}
      <div class="table-wrap" style="max-height:360px;overflow:auto"><table class="table">
        <thead><tr>{#each data[0] ?? [] as h, i}<th class:num={data.length > 1 && isNum(data[1][i])}>{h}</th>{/each}</tr></thead>
        <tbody>{#each data.slice(1) as r}<tr>{#each r as v}<td class:num={isNum(v)}>{isNum(v) ? (v as number).toLocaleString('en-US', { maximumFractionDigits: 2 }) : v}</td>{/each}</tr>{/each}</tbody>
      </table></div>
    {:else}
      {@render children()}
    {/if}
  </div>

  {#if drill && ready && !isEmpty}
    <footer>
      {#if drill.href}<a class="btn btn-ghost btn-sm" href={drill.href}>{drill.label}<ArrowRight size={15} aria-hidden="true" /></a>
      {:else}<button class="btn btn-ghost btn-sm" onclick={drill.onclick}>{drill.label}<ArrowRight size={15} aria-hidden="true" /></button>{/if}
    </footer>
  {/if}
</section>

<style>
  .dash-panel { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; padding: var(--space-4) var(--space-5); }
  .dash-panel > header { display: flex; align-items: flex-start; gap: var(--space-3); margin: 0; }
  .trow { display: flex; align-items: center; gap: 4px; }
  .dash-panel h3 { font-size: var(--fs-h4); line-height: var(--lh-h4); }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--space-3); margin-top: 2px; }
  .decision { margin: 6px 0 0; font-size: 13px; color: var(--text); line-height: 1.4; }
  .decision b { display: inline; margin-right: 6px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
  .ic { display: inline-flex; align-items: center; gap: 4px; }
  .unit { font-weight: 600; color: var(--text-muted); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 6px; }
  .tools { display: flex; gap: var(--space-1); flex-wrap: nowrap; align-items: center; }
  .info { position: relative; display: inline-flex; }
  .ibtn { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-full); border: 0; background: none; color: var(--text-subtle); cursor: pointer; }
  .ibtn:hover, .ibtn[aria-expanded='true'] { color: var(--text); background: var(--surface-sunken); }
  .pop { position: absolute; left: 0; top: calc(100% + 4px); z-index: 30; width: min(320px, 80vw); background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--elevation-2); padding: var(--space-3); font-size: var(--fs-body-sm); }
  .pop p { margin: 4px 0 0; }
  .filters { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .body { min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .nodata { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-1); min-height: 180px; text-align: center; color: var(--text-muted); background: var(--surface-sunken); border-radius: var(--radius-md); padding: var(--space-6); }
  footer { display: flex; justify-content: flex-end; margin-top: auto; }
  footer :global(.btn) { gap: 4px; }
  .span-2 { grid-column: span 2; } .span-3 { grid-column: span 3; } .span-full { grid-column: 1 / -1; }
  @media (max-width: 900px) { .span-2, .span-3, .span-full { grid-column: auto; } }
  @media (max-width: 600px) { .lbl { display: none; } .dash-panel { padding: var(--space-3) var(--space-4); } }
</style>
