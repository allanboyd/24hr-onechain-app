<script lang="ts" module>
  import type { Status } from './status';
  export interface CoverBand { label: string; /** inclusive upper bound in days (omit for the last, open band) */ max?: number; status: Status; note?: string }
  /** The client's sample bands: ≤ 7, 8–14, 15–21, 22–28, 29–60, > 60 days. */
  export const DEFAULT_BANDS: CoverBand[] = [
    { label: '≤ 7 days', max: 7, status: 'bad', note: 'Stock-out risk' },
    { label: '8–14 days', max: 14, status: 'warn', note: 'Low' },
    { label: '15–21 days', max: 21, status: 'good', note: 'Healthy' },
    { label: '22–28 days', max: 28, status: 'good', note: 'Healthy' },
    { label: '29–60 days', max: 60, status: 'warn', note: 'Slow' },
    { label: '> 60 days', status: 'bad', note: 'Overstock' },
  ];
  export function bandCounts(days: (number | null)[], bands: CoverBand[] = DEFAULT_BANDS) {
    const known = days.filter((d): d is number => d != null);
    const counts = bands.map(() => 0);
    for (const d of known) { const i = bands.findIndex((b) => b.max == null || d <= b.max); counts[i === -1 ? bands.length - 1 : i]++; }
    return { counts, total: known.length, missing: days.length - known.length };
  }
</script>
<script lang="ts">
  // Distribution of products by days of stock cover: band · products · % · bar, coloured and labelled by state. HTML (no Plotly).
  import { STATUS } from './status';
  let { days, bands = DEFAULT_BANDS, itemLabel = 'Products', onselect, selected = null }: {
    days: (number | null)[]; bands?: CoverBand[]; itemLabel?: string; onselect?: (band: CoverBand | null) => void; selected?: string | null;
  } = $props();
  const c = $derived(bandCounts(days, bands));
</script>
<div class="table-wrap"><table class="table bands">
  <caption class="sr-only">{itemLabel} by days of stock cover</caption>
  <thead><tr><th>Days of cover</th><th class="num">{itemLabel}</th><th class="num">%</th><th class="barcol"><span class="sr-only">Share</span></th></tr></thead>
  <tbody>
    {#each bands as b, i}
      {@const m = STATUS[b.status]}
      {@const p = c.total ? c.counts[i] / c.total : 0}
      <tr class:sel-row={!!onselect} class:on={selected === b.label}>
        <td>
          {#if onselect}<button class="band" aria-pressed={selected === b.label} onclick={() => onselect(selected === b.label ? null : b)}><m.icon size={14} aria-hidden="true" style="color:{m.ink}" />{b.label}</button>
          {:else}<span class="band"><m.icon size={14} aria-hidden="true" style="color:{m.ink}" />{b.label}</span>{/if}
          {#if b.note}<span class="caption"> · {b.note}</span>{/if}
        </td>
        <td class="num">{c.counts[i]}</td>
        <td class="num">{(p * 100).toFixed(1)}%</td>
        <td class="barcol"><div class="track"><div class="fill" style:width="{p * 100}%" style:background={m.fill}></div></div></td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr class="subtotal"><td>Total</td><td class="num">{c.total}</td><td class="num">{c.total ? '100.0%' : '—'}</td><td></td></tr>
    {#if c.missing}<tr><td colspan="4" class="caption">{c.missing} {itemLabel.toLowerCase()} have no sales history yet — not counted (no data, not zero).</td></tr>{/if}
  </tfoot>
</table></div>
<style>
  .bands td { height: 36px; }
  .band { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; padding: 0; font: inherit; color: inherit; }
  button.band { cursor: pointer; color: var(--link); }
  .barcol { width: 42%; }
  .track { height: 10px; border-radius: 5px; background: var(--surface-sunken); }
  .fill { height: 100%; border-radius: 5px; min-width: 2px; }
  tfoot td { font-weight: 600; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
