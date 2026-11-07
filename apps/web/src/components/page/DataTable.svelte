<script lang="ts" generics="T">
  // DataTable (docs/13-dashboard-kit.md "DataTable"): the one list table for work pages. Sort by clicking a header
  // (numbers / dates by `sortValue`), pages of 25 with "Show 25 more", comfortable / compact density, column menu, CSV of
  // the filtered + sorted rows, sticky header (with `maxHeight`) and first column, fade edges when it scrolls sideways,
  // keyboard rows (↑ ↓ Home End, Enter opens) and, below `cardsBelow` px of its own width, one card per row.
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import SearchX from '@lucide/svelte/icons/search-x';
  import Download from '@lucide/svelte/icons/download';
  import Columns from '@lucide/svelte/icons/columns-3';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import EmptyState from './EmptyState.svelte';
  import { downloadCsv } from '../charts/scale';
  import { sortRows, type Cell, type Column, type SortState } from './datatable';

  let {
    rows, columns, rowKey, onrowclick, selected = null, rowClass, initialSort, pageSize = 25, density: initialDensity = 'comfortable',
    id = '', label, caption = '', noun = 'rows', loading = false, empty, emptyTitle = '', emptyHint = '', onclear,
    filename = '', maxHeight = '', cardsBelow = 640, card, totalLabel = 'Total', tools = true, toolbar,
  }: {
    /** null = still loading (skeleton rows) */
    rows: T[] | null;
    columns: Column<T>[];
    rowKey: (row: T) => string;
    /** row click / Enter (rows become focusable and keyboard-navigable) */
    onrowclick?: (row: T) => void;
    /** the open / chosen row (highlighted with the .sel-row look): its key, or a test */
    selected?: string | ((row: T) => boolean) | null;
    rowClass?: (row: T) => string;
    initialSort?: SortState;
    pageSize?: number;
    density?: 'comfortable' | 'compact';
    /** remembers density + hidden columns per person (localStorage) */
    id?: string;
    /** aria-label of the table */
    label: string;
    /** visually hidden caption */
    caption?: string;
    /** "Showing 1–25 of 140 shipments" */
    noun?: string;
    loading?: boolean;
    empty?: Snippet;
    /** default empty state: "No shipments match these filters" + Clear filters (when `onclear`) */
    emptyTitle?: string;
    emptyHint?: string;
    onclear?: () => void;
    /** enables "CSV" (<filename>-YYYY-MM-DD.csv) */
    filename?: string;
    /** scroll inside the card with a sticky header, e.g. '70vh' */
    maxHeight?: string;
    /** card layout below this table width (px); 0 = never */
    cardsBelow?: number;
    /** custom phone card content (default: title / aside / label: value lines / actions from the columns) */
    card?: Snippet<[T]>;
    totalLabel?: string;
    /** density, columns and CSV buttons */
    tools?: boolean;
    /** extra content on the left of the tool row */
    toolbar?: Snippet;
  } = $props();

  // ---- per-person preferences (density, hidden columns) ----
  const PREF = untrack(() => (id ? `btw.table.${id}` : ''));
  function readPref(): { density?: 'comfortable' | 'compact'; hidden?: string[] } {
    if (!PREF) return {};
    try { return JSON.parse(localStorage.getItem(PREF) ?? '{}'); } catch { return {}; }
  }
  const pref = readPref();
  let density = $state<'comfortable' | 'compact'>(pref.density ?? untrack(() => initialDensity));
  let hidden = $state<string[]>(pref.hidden ?? untrack(() => columns.filter((c) => c.hidden).map((c) => c.key)));
  function savePref() {
    if (!PREF) return;
    try { localStorage.setItem(PREF, JSON.stringify({ density, hidden })); } catch { /* private mode: not remembered */ }
  }

  // ---- layout ----
  let width = $state(0);
  const cards = $derived(cardsBelow > 0 && width > 0 && width < cardsBelow);
  const visible = $derived(columns.filter((c) => !hidden.includes(c.key) && !(c.hideBelow && width > 0 && width < c.hideBelow)));
  const hideable = $derived(columns.filter((c) => c.hideable !== false));

  // ---- sorting ----
  let sort = $state<SortState | null>(untrack(() => initialSort ?? null));
  const sortable = (c: Column<T>) => c.sortable ?? !!(c.sortValue || c.value);
  const sorted = $derived.by(() => {
    const list = rows ?? [];
    if (!sort) return list;
    return sortRows(list, columns.find((c) => c.key === sort!.key), sort.dir);
  });
  function sortBy(c: Column<T>) {
    if (sort?.key === c.key) sort = { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
    else sort = { key: c.key, dir: c.align === 'right' ? 'desc' : 'asc' }; // figures: biggest first
    start = 0;
  }
  const ariaSort = (c: Column<T>) => (sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : sortable(c) ? 'none' : undefined);

  // ---- paging: a window [start, start + count) ----
  let start = $state(0);
  let count = $state(untrack(() => pageSize));
  const total = $derived(sorted.length);
  // a different filter (another number of rows) goes back to the first page; a refresh with the same rows keeps the place
  let lastTotal = -1;
  $effect(() => {
    const n = total;
    untrack(() => { if (n !== lastTotal) { if (lastTotal !== -1) { start = 0; count = pageSize; } lastTotal = n; } });
  });
  const page = $derived(sorted.slice(start, start + count));
  const end = $derived(Math.min(total, start + count));
  const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
  const pageNo = $derived(Math.floor(start / pageSize) + 1);
  const more = $derived(Math.min(pageSize, total - end));
  function go(to: number) { start = Math.max(0, Math.min((pages - 1) * pageSize, to)); count = pageSize; fi = 0; scroller?.scrollTo({ top: 0 }); }

  // ---- selection / rows ----
  const isSel = (r: T) => (typeof selected === 'function' ? selected(r) : selected != null && selected === rowKey(r));
  const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role=button]';
  function click(e: MouseEvent, r: T) {
    if (!onrowclick || (e.target as Element).closest(INTERACTIVE)) return;
    onrowclick(r);
  }
  // roving focus: one row is in the tab order; arrows move between rows
  let fi = $state(0);
  let scroller = $state<HTMLDivElement>();
  let host = $state<HTMLElement>();
  function key(e: KeyboardEvent, r: T, i: number) {
    if (e.target !== e.currentTarget) return;
    const all = [...(host?.querySelectorAll<HTMLElement>('[data-dt-row]') ?? [])];
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onrowclick?.(r); return; }
    if (to < 0 || to >= all.length) return;
    e.preventDefault(); fi = to; all[to].focus();
  }

  // ---- sideways scroll fades ----
  let canL = $state(false), canR = $state(false);
  function edges() {
    const s = scroller; if (!s) return;
    canL = s.scrollLeft > 2; canR = s.scrollLeft + s.clientWidth < s.scrollWidth - 2;
  }
  $effect(() => { void width; void visible.length; void page.length; void density; queueMicrotask(edges); });

  // ---- CSV of the filtered + sorted rows (all pages, the visible columns) ----
  const csvOf = (c: Column<T>) => (c.csv === false ? null : c.csv ?? c.value ?? c.sortValue ?? null);
  function exportCsv() {
    const cols = columns.filter((c) => !hidden.includes(c.key) && csvOf(c)); // responsive hiding doesn't drop CSV columns
    const v = (x: Cell) => (x === null || x === undefined ? '' : x);
    downloadCsv(`${filename}-${new Date().toISOString().slice(0, 10)}`, [cols.map((c) => c.label), ...sorted.map((r) => cols.map((c) => v(csvOf(c)!(r))))]);
  }
  const hasTotals = $derived(columns.some((c) => c.total));
  const text = (c: Column<T>, r: T) => { const x = (c.value ?? c.sortValue)?.(r); return x === null || x === undefined || x === '' ? '—' : x; };
  const fmtN = (n: number) => n.toLocaleString('en-US');

  // column menu
  let menu = $state<HTMLDetailsElement>();
  function toggleCol(k: string) { hidden = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]; savePref(); }
  function setDensity(d: 'comfortable' | 'compact') { density = d; savePref(); }
  $effect(() => {
    const close = (e: Event) => { if (menu?.open && !menu.contains(e.target as Node)) menu.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  });
  const busy = $derived(loading || rows === null);
  const titleCol = $derived(columns.find((c) => c.mobile === 'title') ?? columns.find((c) => c.mobile !== false && c.mobile !== 'aside' && c.mobile !== 'actions'));
</script>

{#snippet content(c: Column<T>, r: T)}{#if c.cell}{@render c.cell(r)}{:else}{text(c, r)}{/if}{/snippet}

{#snippet emptyState(compact: boolean)}
  {#if empty}{@render empty()}
  {:else}<EmptyState title={emptyTitle || `No ${noun} match these filters`} hint={emptyHint} icon={onclear ? SearchX : undefined} {compact}>
    {#if onclear}<button type="button" class="btn btn-secondary btn-sm" onclick={onclear}>Clear filters</button>{/if}</EmptyState>{/if}
{/snippet}

<section class="dt" class:compact={density === 'compact'} bind:clientWidth={width} bind:this={host} aria-label={label}>
  {#if tools || toolbar}
    <div class="dt-tools">
      <div class="dt-left">{#if toolbar}{@render toolbar()}{/if}</div>
      {#if tools}
        <div class="dt-right">
          {#if !cards}
            <div class="sel-seg dt-seg" role="group" aria-label="Row density">
              <button type="button" aria-pressed={density === 'comfortable'} title="Comfortable rows" onclick={() => setDensity('comfortable')}>Comfortable</button>
              <button type="button" aria-pressed={density === 'compact'} title="Compact rows" onclick={() => setDensity('compact')}>Compact</button>
            </div>
          {/if}
          {#if hideable.length > 1 && !(cards && card)}
            <details class="dt-menu" bind:this={menu}>
              <summary class="btn btn-ghost btn-sm" title="Show or hide columns"><Columns size={14} aria-hidden="true" />Columns{#if hidden.length}<span class="dt-n">{columns.length - hidden.length}/{columns.length}</span>{/if}</summary>
              <div class="dt-pop card" role="group" aria-label="Columns">
                {#each hideable as c (c.key)}
                  <label><input type="checkbox" checked={!hidden.includes(c.key)} onchange={() => toggleCol(c.key)} />{c.label || c.key}</label>
                {/each}
                {#if hidden.length}<button type="button" class="btn btn-ghost btn-sm" onclick={() => { hidden = []; savePref(); }}>Show all columns</button>{/if}
              </div>
            </details>
          {/if}
          {#if filename}<button type="button" class="btn btn-ghost btn-sm" onclick={exportCsv} disabled={busy || !total} title="Download these {fmtN(total)} {noun} as CSV (filters and sort applied)"><Download size={14} aria-hidden="true" />CSV</button>{/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if cards}
    <ul class="dt-cards" aria-label={label}>
      {#if busy}{#each Array(3) as _}<li class="card dt-card"><div class="skeleton" style="height:56px"></div></li>{/each}
      {:else}
        {#each page as r, i (rowKey(r))}
          {@const actions = columns.filter((c) => c.mobile === 'actions')}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <li class="card dt-card {rowClass?.(r) ?? ''}" class:click={!!onrowclick} class:sel-row={!!onrowclick} class:on={isSel(r)} data-dt-row
            tabindex={onrowclick ? (i === fi ? 0 : -1) : undefined} onclick={(e) => click(e, r)} onkeydown={(e) => key(e, r, i)} onfocus={() => (fi = i)}>
            {#if card}{@render card(r)}
            {:else}
              {@const aside = columns.filter((c) => c.mobile === 'aside')}
              <div class="dt-card-top">{#if titleCol}<div class="dt-card-title">{@render content(titleCol, r)}</div>{/if}{#each aside as c (c.key)}<div>{@render content(c, r)}</div>{/each}</div>
              <dl class="dt-dl">
                {#each columns.filter((c) => c !== titleCol && c.mobile === undefined && !hidden.includes(c.key)) as c (c.key)}
                  <dt>{c.label}</dt><dd class:num={c.align === 'right'}>{@render content(c, r)}</dd>
                {/each}
              </dl>
            {/if}
            {#if actions.length}<div class="dt-card-acts">{#each actions as c (c.key)}{@render content(c, r)}{/each}</div>{/if}
          </li>
        {:else}<li>{@render emptyState(false)}</li>{/each}
      {/if}
    </ul>
  {:else}
    <div class="dt-frame card flush" class:fade-l={canL} class:fade-r={canR}>
      <div class="dt-scroll" bind:this={scroller} onscroll={edges} style:max-height={maxHeight || null}>
        <table class="table dt-table" aria-label={label} aria-rowcount={busy ? undefined : total}>
          {#if caption}<caption class="dt-sr">{caption}</caption>{/if}
          <thead><tr>
            {#each visible as c (c.key)}
              <th scope="col" class:num={c.align === 'right'} class:center={c.align === 'center'} class:sticky={c.sticky} style:width={c.width || null} aria-sort={ariaSort(c)} title={c.title || null}>
                {#if sortable(c)}<button type="button" class="dt-sort" class:on={sort?.key === c.key} onclick={() => sortBy(c)}>
                  <span>{c.label}</span><span class="dt-ind" aria-hidden="true">{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '▲'}</span>
                  <span class="dt-sr">{sort?.key === c.key ? (sort.dir === 'asc' ? ', sorted ascending' : ', sorted descending') : ', sort'}</span></button>
                {:else}{#if c.label}{c.label}{:else}<span class="dt-sr">{c.key}</span>{/if}{/if}
              </th>
            {/each}
          </tr></thead>
          <tbody>
            {#if busy}
              {#each Array(5) as _}<tr class="dt-sk">{#each visible as c (c.key)}<td><div class="skeleton"></div></td>{/each}</tr>{/each}
            {:else}
              {#each page as r, i (rowKey(r))}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
                <tr class={rowClass?.(r) ?? ''} class:clickable={!!onrowclick} class:sel-row={!!onrowclick} class:on={isSel(r)} data-dt-row aria-current={isSel(r) ? 'true' : undefined}
                  tabindex={onrowclick ? (i === fi ? 0 : -1) : undefined} onclick={(e) => click(e, r)} onkeydown={(e) => key(e, r, i)} onfocus={() => (fi = i)}>
                  {#each visible as c (c.key)}
                    <td class={c.class ?? ''} class:num={c.align === 'right'} class:center={c.align === 'center'} class:sticky={c.sticky}>{@render content(c, r)}</td>
                  {/each}
                </tr>
              {:else}<tr><td colspan={visible.length}>{@render emptyState(true)}</td></tr>{/each}
            {/if}
          </tbody>
          {#if hasTotals && !busy && total}
            <tfoot><tr class="grand">
              {#each visible as c, i (c.key)}
                {@const t = c.total?.(sorted)}
                <td class:num={c.align === 'right'} class:sticky={c.sticky}>{#if t !== undefined && t !== null}{typeof t === 'number' ? fmtN(t) : t}{:else if i === 0}{totalLabel}{/if}</td>
              {/each}
            </tr></tfoot>
          {/if}
        </table>
      </div>
    </div>
  {/if}

  {#if !busy && total > 0}
    <div class="dt-foot">
      <span class="caption" aria-live="polite">Showing {fmtN(start + 1)}–{fmtN(end)} of {fmtN(total)} {noun}</span>
      <span class="dt-pager">
        {#if more > 0}<button type="button" class="btn btn-secondary btn-sm" onclick={() => (count += pageSize)}>Show {more} more</button>{/if}
        {#if pages > 1}
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => go(start - pageSize)} disabled={start === 0} aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
          <span class="caption">Page {pageNo} of {pages}</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => go(start + pageSize)} disabled={end >= total} aria-label="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
        {/if}
      </span>
    </div>
  {/if}
</section>

<style>
  .dt { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .dt-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  /* tools */
  .dt-tools { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; min-height: 32px; }
  .dt-left { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  .dt-right { display: flex; align-items: center; gap: var(--space-1); margin-left: auto; }
  .dt-seg { display: inline-flex; }
  .dt-seg > button { padding: 3px 10px; font-size: 12px; }
  .dt-menu { position: relative; }
  .dt-menu summary { list-style: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .dt-menu summary::-webkit-details-marker { display: none; }
  .dt-n { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .dt-pop { position: absolute; right: 0; top: calc(100% + 4px); z-index: 30; min-width: 220px; max-height: 360px; overflow: auto; padding: var(--space-2); display: flex; flex-direction: column; gap: 2px; box-shadow: var(--shadow-lg, 0 8px 24px rgb(0 0 0 / .16)); }
  .dt-pop label { display: flex; align-items: center; gap: var(--space-2); padding: 6px var(--space-2); border-radius: var(--radius-sm); cursor: pointer; font-size: var(--fs-small, 14px); white-space: nowrap; }
  .dt-pop label:hover { background: var(--surface-sunken); }
  /* frame + scroller with fade edges */
  .dt-frame { position: relative; overflow: hidden; }
  .dt-frame::before, .dt-frame::after { content: ''; position: absolute; top: 0; bottom: 0; width: 40px; pointer-events: none; opacity: 0; transition: opacity .15s; z-index: 3; }
  .dt-frame::before { left: 0; background: linear-gradient(to right, var(--surface) 15%, transparent); }
  .dt-frame::after { right: 0; background: linear-gradient(to left, var(--surface) 15%, transparent); box-shadow: inset -1px 0 0 var(--border); }
  .dt-frame.fade-l::before, .dt-frame.fade-r::after { opacity: 1; }
  .dt-scroll { overflow: auto; position: relative; overscroll-behavior-x: contain; }
  .dt-table { margin: 0; }
  .dt :global(.nowrap) { white-space: nowrap; }
  .dt-table thead th { position: sticky; top: 0; z-index: 2; }
  .dt-table th.center, .dt-table td.center { text-align: center; }
  .dt-table th.sticky, .dt-table td.sticky { position: sticky; left: 0; z-index: 1; background: var(--surface); }
  .dt-table th.sticky { z-index: 4; background: var(--surface-sunken); }
  .fade-l .dt-table .sticky { box-shadow: 6px 0 8px -6px rgb(0 0 0 / .25); }
  .dt-table tbody tr:hover td.sticky { background: var(--primary-subtle); }
  .dt-table tbody tr.on td.sticky { background: var(--sel-bg); }
  .dt-table tbody tr:last-child td { border-bottom: 0; }
  .dt-table tfoot td { border-bottom: 0; }
  .dt-table tfoot td.sticky { background: var(--primary-subtle); }
  .dt-table tbody tr:focus-visible { outline: 2px solid var(--focus, var(--primary)); outline-offset: -2px; }
  .dt-table tbody tr:focus-visible td { background: var(--primary-subtle); }
  .dt-sk td { height: 44px; }
  /* sortable headers */
  .dt-sort { all: unset; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; border-radius: var(--radius-sm); }
  th.num .dt-sort { flex-direction: row-reverse; }
  .dt-sort:hover { color: var(--text); }
  .dt-sort:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .dt-ind { font-size: 9px; line-height: 1; opacity: 0; transition: opacity .1s; }
  .dt-sort:hover .dt-ind { opacity: .45; }
  .dt-sort.on { color: var(--text); }
  .dt-sort.on .dt-ind { opacity: 1; color: var(--primary); }
  /* density */
  .compact .dt-table td { height: 32px; padding-top: 2px; padding-bottom: 2px; }
  .compact .dt-table th { padding-top: 6px; padding-bottom: 6px; }
  .compact .dt-table :global(.caption) { display: inline; margin-left: 6px; }
  .compact .dt-table :global(td > div.caption) { display: block; margin-left: 0; }
  /* footer */
  .dt-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
  .dt-pager { display: inline-flex; align-items: center; gap: var(--space-1); }
  /* phone cards */
  .dt-cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .dt-card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4); }
  .dt-card.click { cursor: pointer; }
  .dt-card:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .dt-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); }
  .dt-card-title { font-weight: 600; min-width: 0; }
  .dt-dl { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-3); margin: 0; font-size: var(--fs-small, 14px); }
  .dt-dl dt { color: var(--text-muted); white-space: nowrap; }
  .dt-dl dd { margin: 0; text-align: right; min-width: 0; overflow-wrap: anywhere; }
  .dt-card-acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
