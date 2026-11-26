<script lang="ts">
  // C-02 dashboard frame around one chart / list: title, metric definition (ⓘ), unit or currency, date range, data freshness,
  // filters, drill-down link, loading skeleton, error, an explicit "No data yet" state (never zeros), "View data" and
  // CSV / Excel / PDF export. ChartCard stays as-is for existing screens; new dashboards use this.
  import type { Snippet } from 'svelte';
  import ErrorState from '../ErrorState.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import { freshnessText, type When } from './Freshness.svelte';
  import type { Rows } from './export/meta';
  import InfoTip from '../page/InfoTip.svelte';
  import Table from '@lucide/svelte/icons/table-2';
  import ChartIcon from '@lucide/svelte/icons/chart-column';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import './report.css';

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
  let table = $state(false);
  let body = $state<HTMLDivElement>();
  let now = $state(Date.now());
  $effect(() => { const id = setInterval(() => (now = Date.now()), 30_000); return () => clearInterval(id); });
  const ready = $derived(!loading && !error);
  const stale = $derived(updatedAt != null && now - +new Date(updatedAt) > staleAfter * 60000);
  const infoLines = $derived([subtitle, definition, unit ? `Unit: ${unit}` : '', period, updatedAt !== undefined ? freshnessText(updatedAt, freshness, now) : '', owner ? `Data owner: ${owner}` : ''].filter((x): x is string => !!x));
  const data = $derived(ready && rows ? rows() : []);
  const isEmpty = $derived(ready && (empty ?? (rows ? data.length <= 1 : false)));
  const isNum = (v: unknown) => typeof v === 'number';
  const name = $derived(filename ?? title.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, ''));
  const itemCount = $derived.by(() => {
    if (!ready || isEmpty || data.length < 2) return 0;
    const head = String(data[0]?.[0] ?? '');
    if (head === 'Measure' || head === 'Kind') return 0;
    return data.length - 1;
  });
  const meta = () => ({ title, subtitle, definition, unit, period, filters: filterText, owner, freshness: updatedAt === undefined ? '' : freshnessText(updatedAt, freshness, now) });
</script>

<section class="card dash-panel span-{span}" aria-labelledby="{uid}-t" aria-busy={loading}>
  <header>
    <div class="title-row">
      <h3 id="{uid}-t" title={title}>{title}</h3>
      {#if infoLines.length}<InfoTip lines={infoLines} label="About {title}" mark={stale} size={15} />{/if}
      {#if decision}<InfoTip kind="alert" text={decision} label="Recommendation" size={15} />{/if}
      {#if itemCount}<span class="dash-chip">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>{/if}
    </div>
    <div class="tools">
      {@render actions?.()}
      {#if rows && ready && !isEmpty}
        <div class="view-toggle" role="group" aria-label="View mode">
          <button type="button" class="ibtn" aria-pressed={!table} aria-label="Show chart" title="Show chart" onclick={() => (table = false)}><ChartIcon size={16} aria-hidden="true" /></button>
          <button type="button" class="ibtn" aria-pressed={table} aria-label="Show table" title="Show table" onclick={() => (table = true)}><Table size={16} aria-hidden="true" /></button>
        </div>
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
  .dash-panel { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; width: 100%; height: auto; align-self: start; padding: var(--space-4) var(--space-5); container-type: inline-size; container-name: dash-panel; }
  .dash-panel > header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); margin: 0; min-height: 32px; }
  .title-row { display: flex; align-items: center; gap: 2px; min-width: 0; flex: 1 1 auto; }
  .dash-panel h3 { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-h4); line-height: var(--lh-h4); }
  .tools { display: flex; align-items: center; gap: var(--space-1); flex: none; margin-left: auto; }
  /* Narrow cards: the title stays one line beside the info icons; chart, table and export drop to the next row. */
  @container dash-panel (max-width: 460px) {
    .dash-panel > header { flex-wrap: wrap; align-items: center; }
    .title-row { flex: 1 1 100%; }
    .tools { margin-left: 0; }
  }
  .view-toggle { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface-sunken); }
  .view-toggle .ibtn[aria-pressed='true'] { color: var(--text); background: var(--surface-raised); box-shadow: var(--elevation-1); }
  .ibtn { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-full); border: 0; background: none; color: var(--text-subtle); cursor: pointer; }
  .ibtn:hover, .ibtn[aria-pressed='true'] { color: var(--text); background: var(--surface-sunken); }
  .filters { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .body { min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .nodata { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-1); min-height: 180px; text-align: center; color: var(--text-muted); background: var(--surface-sunken); border-radius: var(--radius-md); padding: var(--space-6); }
  footer { display: flex; justify-content: flex-end; }
  footer :global(.btn) { gap: 4px; }
  .span-2 { grid-column: span 2; } .span-3 { grid-column: span 3; } .span-full { grid-column: 1 / -1; }
  @media (max-width: 900px) { .span-2, .span-3, .span-full { grid-column: auto; } }
  @media (max-width: 600px) { .dash-panel { padding: var(--space-3) var(--space-4); } }
</style>
