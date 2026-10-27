<script lang="ts" module>
  import type { Status } from './status';
  export interface TriageAction { label: string; status: Status }
  /** Default action per cell from its position: higher severity (right) and impact (top) → more urgent. */
  export function defaultAction(row: number, col: number, rows: number, cols: number): TriageAction {
    const score = (cols - 1 ? col / (cols - 1) : 1) + (rows - 1 ? (rows - 1 - row) / (rows - 1) : 1); // 0..2
    return score >= 1.5 ? { label: 'Urgent', status: 'bad' } : score >= 0.75 ? { label: 'Act soon', status: 'warn' } : { label: 'Monitor', status: 'none' };
  }
</script>
<script lang="ts">
  // Severity (columns, low → high) × business impact (rows, high → low) grid with alert counts and the action each cell calls for.
  // Click a cell to filter the alert list beneath (the matrix supplements, never replaces, the list). HTML grid of buttons.
  import { STATUS } from './status';
  let { rows, cols, counts, action, selected = null, rowTitle = 'Business impact', colTitle = 'Severity', onselect }: {
    /** impact levels, highest first */ rows: string[]; /** severity levels, lowest first */ cols: string[]; counts: number[][];
    action?: (row: number, col: number) => TriageAction; selected?: { row: string; col: string } | null; rowTitle?: string; colTitle?: string;
    onselect?: (cell: { row: string; col: string } | null) => void;
  } = $props();
  const act = (r: number, c: number) => (action ?? ((a: number, b: number) => defaultAction(a, b, rows.length, cols.length)))(r, c);
  const isSel = (r: string, c: string) => selected?.row === r && selected?.col === c;
</script>
<div class="triage" style:--cols={cols.length} role="group" aria-label="{rowTitle} by {colTitle}">
  <div class="corner caption">{rowTitle} ↓ · {colTitle} →</div>
  {#each cols as c}<div class="colh overline">{c}</div>{/each}
  {#each rows as r, ri}
    <div class="rowh overline">{r}</div>
    {#each cols as c, ci}
      {@const a = act(ri, ci)}
      {@const m = STATUS[a.status]}
      {@const n = counts[ri]?.[ci] ?? 0}
      <button class="cell" class:zero={!n} class:sel={isSel(r, c)} style:--tint={m.bg} style:--ink={m.ink} aria-pressed={isSel(r, c)} disabled={!n && !isSel(r, c)}
        aria-label="{n} alerts · {r} impact · {c} severity · {a.label}" onclick={() => onselect?.(isSel(r, c) ? null : { row: r, col: c })}>
        <span class="n">{n}</span>
        <span class="act"><m.icon size={14} aria-hidden="true" />{a.label}</span>
      </button>
    {/each}
  {/each}
</div>
<style>
  .triage { display: grid; grid-template-columns: minmax(70px, auto) repeat(var(--cols), minmax(0, 1fr)); gap: 4px; }
  .corner { align-self: end; padding: 0 4px 4px 0; }
  .colh { text-align: center; align-self: end; padding-bottom: 4px; }
  .rowh { display: flex; align-items: center; justify-content: flex-end; padding-right: var(--space-2); text-align: right; }
  .cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 76px; border-radius: var(--radius-md);
    border: 1px solid transparent; background: var(--tint); color: var(--text); font: inherit; cursor: pointer; padding: var(--space-2); }
  .cell:hover:not(:disabled) { border-color: var(--border-strong); }
  .cell.sel { position: relative; border-color: var(--sel-line); box-shadow: inset 0 0 0 2px var(--sel-line); }
  .cell.sel::after { content: ''; position: absolute; top: 4px; right: 6px; width: 4px; height: 8px; border: solid var(--sel-ink); border-width: 0 2px 2px 0; transform: rotate(45deg); }
  .cell:disabled { cursor: default; opacity: 0.55; }
  .n { font: 700 24px/1.1 var(--ff-display); font-variant-numeric: tabular-nums; }
  .act { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-caption); font-weight: 600; color: var(--ink); }
  @media (max-width: 480px) { .cell { min-height: 60px; } .n { font-size: 20px; } }
</style>
