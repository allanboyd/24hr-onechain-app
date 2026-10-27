<script lang="ts" module>
  /** One stock line the receiver can count: company × warehouse × product with the cases held now. */
  export interface CountLine { entityId: string; warehouseId: string; productId: string; held: number }
</script>

<script lang="ts">
  // Count / adjust stock (warehouse stock counts and adjustments): a physical count (the difference is posted), a
  // damaged write-off, goods moved out other than a sale or re-export, or found stock — with the reason. Quantities only:
  // receivers never see values or prices. Opened from a stock line (pre-selected) or from the page header (pick the
  // warehouse and product first). Saves with warehouse.adjust; the page reloads through onChange.
  import { lookup, warehouse, type StockAdjustKind } from '@btw/api';
  import { fmtNum, say } from '@btw/ui';
  import { ADJUST_KINDS, validateAdjust } from '@btw/api/money';
  import { attempt } from '../../lib/load.svelte';
  import { companyLabel } from '../../lib/companies';
  import { company, GROUP } from '../../lib/company.svelte';
  import { DetailDrawer } from '../page';

  let { open = $bindable(false), lines, warehouseIds, start = null }: {
    open?: boolean;
    /** lines the user may record for (their warehouses) */ lines: CountLine[];
    /** warehouses the user may record for, in display order */ warehouseIds: string[];
    /** the line to start on (from a row); null = pick */ start?: CountLine | null;
  } = $props();

  const keyOf = (l: Pick<CountLine, 'entityId' | 'warehouseId' | 'productId'>) => `${l.entityId}|${l.warehouseId}|${l.productId}`;
  const name = (pid: string) => `${lookup.product(pid)?.brand ?? pid} · ${lookup.product(pid)?.pack ?? ''}`;

  let wh = $state('');
  let key = $state('');
  let kind = $state<StockAdjustKind>('count');
  let qty = $state<number | null>(null);
  let counted = $state<number | null>(null);
  let note = $state('');
  let err = $state('');
  let busy = $state(false);

  // reset every time the dialog opens
  let was = false;
  $effect(() => {
    if (open && !was) {
      wh = start?.warehouseId ?? (warehouseIds.length === 1 ? warehouseIds[0] : '');
      key = start ? keyOf(start) : '';
      kind = 'count'; qty = null; counted = start ? start.held : null; note = ''; err = '';
    }
    was = open;
  });

  const choices = $derived(lines.filter((l) => l.warehouseId === wh)
    .sort((a, b) => name(a.productId).localeCompare(name(b.productId)) || a.entityId.localeCompare(b.entityId)));
  const line = $derived(lines.find((l) => keyOf(l) === key) ?? null);
  function pick(k: string) { key = k; const l = lines.find((x) => keyOf(x) === k); counted = l ? l.held : null; err = ''; }
  const preview = $derived(line ? (kind === 'count' ? (counted ?? line.held) - line.held : (ADJUST_KINDS.find((k) => k.kind === kind)!.sign) * (qty ?? 0)) : 0);

  async function save() {
    if (!line) { err = 'Pick the product'; return; }
    const input = { warehouseId: line.warehouseId, productId: line.productId, entityId: line.entityId, kind, qty: qty ?? undefined, counted: counted ?? undefined, note: note || undefined };
    const p = validateAdjust(input); if (p.length) { err = p.join(' · '); return; }
    busy = true; err = await attempt(() => warehouse.adjust(input)); busy = false;
    if (!err) { say(`${ADJUST_KINDS.find((k) => k.kind === kind)!.label} recorded`); open = false; }
  }
</script>

<DetailDrawer bind:open title="Count / adjust stock" subtitle={line ? `${name(line.productId)} · ${lookup.warehouse(line.warehouseId)?.name ?? ''}` : 'Pick the warehouse and product'} width={520}>
  <section class="form" aria-label="Record stock">
    {#if !start}
      <div class="pickers">
        <label class="field"><span>Warehouse</span>
          <select class="select" bind:value={wh} onchange={() => (key = '')}>
            {#if warehouseIds.length !== 1}<option value="">Choose…</option>{/if}
            {#each warehouseIds as id (id)}<option value={id}>{lookup.warehouse(id)?.name ?? id}</option>{/each}
          </select></label>
        <label class="field"><span>Product</span>
          <select class="select" value={key} onchange={(e) => pick(e.currentTarget.value)} disabled={!wh}>
            <option value="">{wh ? 'Choose…' : 'Pick a warehouse first'}</option>
            {#each choices as l (keyOf(l))}<option value={keyOf(l)}>{name(l.productId)}{company.active === GROUP ? ` (${companyLabel(l.entityId)})` : ''} — {fmtNum(l.held)} held</option>{/each}
          </select></label>
      </div>
    {/if}
    {#if line}
      <p class="small held">{companyLabel(line.entityId)} · held now <strong>{fmtNum(line.held)}</strong> cases</p>
      <div class="kinds" role="radiogroup" aria-label="What happened">
        {#each ADJUST_KINDS as k (k.kind)}<label class="sel-chip"><input type="radio" name="kind" value={k.kind} bind:group={kind} />{k.label}</label>{/each}
      </div>
      <div class="form-grid">
        {#if kind === 'count'}
          <label class="field"><span>Cases counted</span><input class="input num" type="number" min="0" step="1" bind:value={counted} /></label>
        {:else}
          <label class="field"><span>Cases</span><input class="input num" type="number" min="1" step="1" bind:value={qty} /></label>
        {/if}
        <label class="field wide"><span>Note {kind === 'moved-out' ? '(where did they go?)' : kind === 'damaged' ? '(what happened?)' : '(optional)'}</span><input class="input" bind:value={note} maxlength="500" /></label>
      </div>
      <p class="small">Effect on stock held: <strong>{preview > 0 ? '+' : ''}{fmtNum(preview)}</strong> → {fmtNum(line.held + preview)} cases</p>
    {/if}
    {#if err}<p class="error small" role="alert">{err}</p>{/if}
  </section>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={() => (open = false)}>Cancel</button>
    <button class="btn btn-primary" disabled={busy || !line} onclick={save}>Record</button>
  {/snippet}
</DetailDrawer>

<style>
  .form { display: grid; gap: var(--space-3); }
  .pickers { display: grid; gap: var(--space-3); }
  .held { margin: 0; }
  .kinds { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .form-grid { display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-3); }
  .error { color: var(--danger); margin: 0; }
  @media (max-width: 520px) { .form-grid { grid-template-columns: 1fr; } }
</style>
