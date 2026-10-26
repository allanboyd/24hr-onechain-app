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
  // Clicking a tile sets `?<param>=<key>` in the hash query (no remount, see query.svelte.ts); clicking it again clears it.
  // Tiles are toggle buttons (aria-pressed); the active one gets a border, tint and a check mark. 2×2 on phones.
  import { statusMeta } from '../charts/status';
  import { readQuery, writeQuery } from './query.svelte';
  import InfoTip from './InfoTip.svelte';
  import Check from '@lucide/svelte/icons/check';
  let { tiles, param = 'show', sync = true, value = $bindable(sync ? readQuery(param) : ''), label = 'Summary', onchange }: {
    /** 2–4 tiles (extra tiles are dropped) */ tiles: SummaryTile[];
    /** active tile key ('' = none). Starts from the query when `sync` */ value?: string;
    /** query key the strip writes */ param?: string;
    /** write the active tile to the hash query */ sync?: boolean;
    /** accessible name of the group, e.g. "Shipments summary" */ label?: string;
    onchange?: (key: string) => void;
  } = $props();
  const shown = $derived(tiles.slice(0, 4));
  const fmt = (t: SummaryTile) => (t.value === null || t.value === undefined ? '—' : typeof t.value === 'number' ? (t.format ?? ((n: number) => n.toLocaleString('en-US')))(t.value) : t.value);

  function toggle(t: SummaryTile) {
    value = value === t.key ? '' : t.key;
    if (sync) writeQuery({ [param]: value || null });
    onchange?.(value);
  }
</script>

<div class="strip n{shown.length}" role="group" aria-label={label}>
  {#each shown as t (t.key)}
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
        <button type="button" class="face" aria-pressed={on} title={on ? `Showing ${t.label.toLowerCase()} — click to show all` : `Show ${t.label.toLowerCase()} only`} onclick={() => toggle(t)}>
          <span class="lbl">{t.label}{#if on}<Check size={14} class="chk" aria-hidden="true" />{/if}</span>
          <span class="val" class:none={empty}>{fmt(t)}</span>
          {@render foot(t, m, Icon, empty)}
        </button>
      {/if}
      {#if t.info}<span class="info"><InfoTip text={t.info} title={t.label} label="How {t.label} is counted" size={14} align="right" /></span>{/if}
    </div>
  {/each}
</div>

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
  .strip.n2 { --n: 2; } .strip.n3 { --n: 3; } .strip.n4 { --n: 4; } .strip.n1 { --n: 1; }
  .tile { position: relative; min-width: 0; }
  .face { display: flex; flex-direction: column; justify-content: center; gap: 2px; width: 100%; min-height: 72px; height: 100%; padding: var(--space-2) var(--space-4);
    background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-lg); text-align: left; font: inherit; }
  button.face { cursor: pointer; transition: border-color var(--motion-fast) var(--motion-easing), background var(--motion-fast) var(--motion-easing); }
  button.face:hover { border-color: var(--border-strong); background: var(--surface-sunken); }
  button.face:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  .on button.face { border: 2px solid var(--primary); padding: calc(var(--space-2) - 1px) calc(var(--space-4) - 1px); background: var(--primary-subtle); }
  .lbl { display: flex; align-items: center; gap: 4px; font: 600 var(--fs-label) / var(--lh-label) var(--ff-body); color: var(--text-muted); padding-right: 24px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .on .lbl { color: var(--text); }
  .lbl :global(.chk) { flex: none; color: var(--primary); }
  .val { font: 700 22px / 28px var(--ff-display); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .val.none { color: var(--text-subtle); }
  .sub { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: var(--fs-caption); line-height: var(--lh-caption); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; flex: none; }
  .st :global(svg) { flex: none; }
  .dot { color: var(--text-subtle); }
  .muted { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
  .info { position: absolute; top: 8px; right: 8px; }
  @media (max-width: 600px) {
    .strip { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
    .strip.n1 { grid-template-columns: 1fr; }
    .strip.n3 .tile:last-child { grid-column: 1 / -1; }
    .face { padding: var(--space-2) var(--space-3); min-height: 68px; }
    .on button.face { padding: calc(var(--space-2) - 1px) calc(var(--space-3) - 1px); }
    .val { font-size: 20px; line-height: 26px; }
  }
</style>
