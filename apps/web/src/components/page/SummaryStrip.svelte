<script lang="ts" module>
  import type { Status } from '../charts/status';
  export interface SummaryTile {
    /** filter value written to the query when the tile is on (e.g. 'delayed') */ key: string;
    label: string;
    /** count or amount; null = no data yet ("—") */ value: number | string | null;
    /** number formatter (money, %, …); default en-US grouping */ format?: (n: number) => string;
    /** short line under the value (e.g. "2 over 24 h") */ sub?: string;
    /** status tone, shown as icon + word (never colour alone) */ status?: Status | string;
    /** the status word (defaults to the status' own word: On track / At risk / Delayed / No data) */ statusLabel?: string;
    /** false = information only, not a filter */ filter?: boolean;
    /** ⓘ explanation of how the figure is counted */ info?: string;
  }
</script>

<script lang="ts">
  // Summary strip for work pages (docs/17 §3): at most 4 counts in one row, each one a filter for the list below.
  // Clicking a tile sets `?<param>=<key>` in the hash query (no remount, see query.svelte.ts); clicking it again goes back
  // to everything (`allValue`). Tiles are radio-cards (base.css "Selection states"): the active one is tinted, has a 2px
  // border and a "✓ Showing" tag; aria-pressed. 2×2 on phones.
  // With `noun` the strip also shows the active-filter bar under it: "Showing: Delayed (5 of 140) · Show all", or, with
  // no tile filter, a selected "All shipments" chip. `auto` = the needs-action default the page opened on ("Showing what
  // needs action: …") until the person picks something.
  import { statusMeta } from '../charts/status';
  import { readQuery, writeQuery } from './query.svelte';
  import InfoTip from './InfoTip.svelte';
  import X from '@lucide/svelte/icons/x';
  let { tiles, param = 'show', sync = true, value = $bindable(sync ? readQuery(param) : ''), label = 'Summary', onchange, allValue = '', noun, total = null, shown = null, auto = '', labels = {} }: {
    /** 2–4 tiles (extra tiles are dropped) */ tiles: SummaryTile[];
    /** active tile key ('' = none). Starts from the query when `sync` */ value?: string;
    /** query key the strip writes */ param?: string;
    /** write the active tile to the hash query */ sync?: boolean;
    /** accessible name of the group, e.g. "Shipments summary" */ label?: string;
    onchange?: (key: string) => void;
    /** the value that means "everything" ('' by default; 'all' on pages that open on a needs-action filter, so it sticks) */ allValue?: string;
    /** plural noun of the list ("shipments") — turns on the active-filter bar */ noun?: string;
    /** rows in the whole list / rows shown now (for "5 of 140") */ total?: number | null; shown?: number | null;
    /** the needs-action filter the page opened on, if any */ auto?: string;
    /** names of filter values that are not tiles (set from the page's own Show select), e.g. { delivered: 'Delivered' } */ labels?: Record<string, string>;
  } = $props();
  const shownTiles = $derived(tiles.slice(0, 4));
  const fmt = (t: SummaryTile) => (t.value === null || t.value === undefined ? '—' : typeof t.value === 'number' ? (t.format ?? ((n: number) => n.toLocaleString('en-US')))(t.value) : t.value);
  let touched = $state(false);
  const filtered = $derived(!!value && value !== allValue);
  const activeLabel = $derived(tiles.find((t) => t.key === value)?.label ?? labels[value] ?? value);
  const needsAction = $derived(filtered && !touched && !!auto && value === auto);
  const count = (n: number | null) => (n === null || n === undefined ? '' : n.toLocaleString('en-US'));

  function set(v: string) {
    touched = true;
    value = v;
    if (sync) writeQuery({ [param]: value || null });
    onchange?.(value);
  }
  const toggle = (t: SummaryTile) => set(value === t.key ? allValue : t.key);
  const showAll = () => set(allValue);
</script>

<div class="strip n{shownTiles.length}" class:noted={!!noun} role="group" aria-label={label}>
  {#each shownTiles as t (t.key)}
    {@const m = t.status ? statusMeta(t.status, t.statusLabel) : null}
    {@const empty = t.value === null || t.value === undefined}
    {@const on = value === t.key}
    {@const Icon = m?.icon}
    <div class="tile" class:on class:static={t.filter === false}>
      {#if t.filter === false}
        <div class="face">
          <span class="lbl">{t.label}</span>
          <span class="val" class:none={empty}>{fmt(t)}</span>
          {@render foot(t, m, Icon, empty)}
        </div>
      {:else}
        <button type="button" class="face sel-card" aria-pressed={on} title={on ? `Showing ${t.label.toLowerCase()} — click to show all` : `Show ${t.label.toLowerCase()} only`} onclick={() => toggle(t)}>
          <span class="top"><span class="lbl">{t.label}</span></span>
          <span class="vrow"><span class="val" class:none={empty}>{fmt(t)}</span>{#if on}<span class="sel-tag">Showing</span>{/if}</span>
          {@render foot(t, m, Icon, empty)}
        </button>
      {/if}
      {#if t.info}<span class="info"><InfoTip text={t.info} title={t.label} label="How {t.label} is counted" size={14} align="right" /></span>{/if}
    </div>
  {/each}
</div>
{#if noun}
  <div class="filter-note" class:on={filtered}>
    <button type="button" class="sel-chip" aria-pressed={!filtered} onclick={showAll} title={filtered ? `Show all ${noun}` : `Showing all ${noun}`}>All {noun}{#if total !== null && total !== undefined}<span class="n">{count(total)}</span>{/if}</button>
    <span class="say" aria-live="polite">
      {#if filtered}{needsAction ? 'Showing what needs action:' : 'Showing:'} <b>{activeLabel}</b>{#if shown !== null && total !== null}{' '}({count(shown)} of {count(total)}){:else if shown !== null}{' '}({count(shown)}){/if}
      {:else if shown !== null && total !== null && shown !== total}Showing {count(shown)} of {count(total)} {noun} (other filters below)
      {:else}Showing all {noun} · pick a figure above to see only those{/if}
    </span>
    {#if filtered}<button type="button" class="btn btn-ghost btn-sm all-btn" onclick={showAll}>Show all<X size={14} aria-hidden="true" /></button>{/if}
  </div>
{/if}

{#snippet foot(t: SummaryTile, m: ReturnType<typeof statusMeta> | null, Icon: any, empty: boolean)}
  {#if empty}<span class="sub muted">No data yet</span>
  {:else if m || t.sub}
    <span class="sub">
      {#if m}<span class="st" style:color={m.ink}><Icon size={13} aria-hidden="true" />{m.label}</span>{/if}
      {#if m && t.sub}<span class="dot" aria-hidden="true">·</span>{/if}
      {#if t.sub}<span class="muted">{t.sub}</span>{/if}
    </span>
  {/if}
{/snippet}

<style>
  .strip { display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4); }
  .strip.noted { margin-bottom: var(--space-2); }
  .strip.n2 { --n: 2; } .strip.n3 { --n: 3; } .strip.n4 { --n: 4; } .strip.n1 { --n: 1; }
  .tile { position: relative; min-width: 0; }
  /* layout only — colours, border and the chosen state come from .sel-card (base.css) */
  .face { flex-direction: column; align-items: stretch; justify-content: center; gap: 2px; width: 100%; min-height: 72px; height: 100%; padding: var(--space-2) var(--space-4); }
  div.face { display: flex; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-lg); }
  .top { display: flex; align-items: center; gap: 6px; min-width: 0; padding-right: 22px; }
  .vrow { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
  .lbl { font: 600 var(--fs-label) / var(--lh-label) var(--ff-body); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  div.face .lbl { color: var(--text-muted); padding-right: 22px; }
  .on .lbl { color: var(--sel-ink); font-weight: 700; }
  .val { font: 700 22px / 28px var(--ff-display); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
  .val.none { color: var(--text-subtle); }
  .sub { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: var(--fs-caption); line-height: var(--lh-caption); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; flex: none; }
  .st :global(svg) { flex: none; }
  .dot { color: var(--text-subtle); }
  .muted { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
  .info { position: absolute; top: 8px; right: 8px; }
  .say { min-width: 0; }
  .all-btn { gap: 4px; }
  @media (max-width: 600px) {
    .strip { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
    .strip.n1 { grid-template-columns: 1fr; }
    .strip.n3 .tile:last-child { grid-column: 1 / -1; }
    .face { padding: var(--space-2) var(--space-3); min-height: 68px; }
    .val { font-size: 20px; line-height: 26px; }
  }
</style>
