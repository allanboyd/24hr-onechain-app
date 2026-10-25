<script lang="ts">
  // docs/14 B-02 on the phone (Asie, Yonas): stock held per product at my warehouse (quantities only) and a stock count or
  // adjustment with its reason — count, damaged write-off, moved out (not a sale or re-export), found. Lazy chunk.
  import { lookup, warehouse, type StockAdjustKind, type User, type WarehouseStockRow } from '@btw/api';
  import { say } from '@btw/ui';
  import { untrack } from 'svelte';
  import { ADJUST_KINDS, validateAdjust } from '@btw/api/money';
  import Sheet from '../../components/Sheet.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { haptic } from '../../native';
  let { user, onclose }: { user: User; onclose: () => void } = $props();

  let wh = $state(untrack(() => user.warehouseIds[0] ?? ''));
  let rows = $state<WarehouseStockRow[] | null>(null);
  let q = $state('');
  const load = () => warehouse.stock({ warehouseId: wh }).then((r) => (rows = r.filter((x) => x.held > 0 || x.received > 0).sort((a, b) => b.held - a.held))).catch((e) => { rows = []; say((e as Error).message); });
  $effect(() => { void wh; rows = null; load(); });
  const name = (pid: string) => lookup.product(pid)?.brand ?? pid;
  const shown = $derived((rows ?? []).filter((r) => !q || `${name(r.productId)} ${lookup.product(r.productId)?.pack}`.toLowerCase().includes(q.toLowerCase())));
  let row = $state<WarehouseStockRow | null>(null);
  let kind = $state<StockAdjustKind>('count');
  let n = $state(0); let note = $state('');
  let busy = $state(false); let error = $state('');
  function open(r: WarehouseStockRow) { row = r; kind = 'count'; n = r.held; note = ''; error = ''; }
  const delta = $derived(row ? (kind === 'count' ? n - row.held : ADJUST_KINDS.find((k) => k.kind === kind)!.sign * n) : 0);
  $effect(() => { if (row) n = kind === 'count' ? row.held : 0; void kind; });
  async function save() {
    if (!row) return;
    const input = { warehouseId: wh, productId: row.productId, entityId: row.entityId, kind, ...(kind === 'count' ? { counted: n } : { qty: n }), note: note || undefined };
    const p = validateAdjust(input); if (p.length) { error = p[0]; return; }
    busy = true; error = '';
    try { await warehouse.adjust(input); haptic('success'); say(`${ADJUST_KINDS.find((k) => k.kind === kind)!.label} saved`); row = null; load(); }
    catch (x) { error = (x as Error).message; } finally { busy = false; }
  }
</script>

<Sheet modal title={row ? name(row.productId) : 'Stock'} onclose={row ? () => (row = null) : onclose}>
  {#if !row}
    {#if user.warehouseIds.length > 1}
      <div class="seg" role="radiogroup" aria-label="Warehouse">{#each user.warehouseIds as w (w)}<button class:on={wh === w} role="radio" aria-checked={wh === w} onclick={() => (wh = w)}>{lookup.warehouse(w)?.town ?? w}</button>{/each}</div>
    {/if}
    <input class="input" type="search" bind:value={q} placeholder="Find a brand" aria-label="Find a brand" />
    <p class="caption">Cases held now. Tap a product to count it or record damage, goods moved out or found.</p>
    {#if !rows}<div class="skeleton" style="height:120px"></div>{/if}
    <ul class="list">
      {#each shown as r (`${r.entityId}|${r.productId}`)}
        <li><button onclick={() => open(r)}>
          <CompanyDot entityId={r.entityId} />
          <span class="grow"><strong>{name(r.productId)}</strong><span class="caption"> · {lookup.product(r.productId)?.pack}</span>
            <span class="caption block">in {r.received + r.transfersIn} · damaged {r.damaged} · short {r.short} · out {r.movedOut + r.transfersOut} (30 days){r.lastCountAt ? ` · counted ${r.lastCountAt.slice(5, 10)}` : ''}</span></span>
          <strong class="num">{r.held.toLocaleString('en-US')}</strong>
        </button></li>
      {/each}
    </ul>
  {:else}
    <p class="subline">{lookup.product(row.productId)?.pack} · held {row.held.toLocaleString('en-US')} cases</p>
    <div class="chips" role="radiogroup" aria-label="What happened">
      {#each ADJUST_KINDS as k (k.kind)}<button class="chip" class:on={kind === k.kind} role="radio" aria-checked={kind === k.kind} onclick={() => (kind = k.kind)}>{k.label}</button>{/each}
    </div>
    <label class="field"><span>{kind === 'count' ? 'Cases counted' : 'Cases'}</span><Stepper bind:value={n} min={0} label={kind === 'count' ? 'cases counted' : 'cases'} /></label>
    <label class="field"><span>{kind === 'moved-out' ? 'Where did they go?' : kind === 'damaged' ? 'What happened?' : 'Note (optional)'}</span><input class="input" bind:value={note} /></label>
    <p class="effect" class:neg={delta < 0}>Stock {delta >= 0 ? '+' : ''}{delta} → {(row.held + delta).toLocaleString('en-US')} cases</p>
    {#if error}<p class="error-box" role="alert">{error}</p>{/if}
    <button class="btn btn-accent btn-lg btn-block" disabled={busy} onclick={save}>{busy ? 'Saving…' : 'Save'}</button>
  {/if}
</Sheet>

<style>
  .seg { display: flex; gap: 6px; background: var(--surface-sunken); padding: 4px; border-radius: 999px; }
  .seg button { flex: 1; min-height: 40px; border: 0; border-radius: 999px; background: none; font: 600 15px var(--ff-body); color: var(--text-muted); }
  .seg button.on { background: var(--surface); color: var(--text); box-shadow: var(--elevation-1); }
  .list { list-style: none; margin: 0; padding: 0; }
  .list button { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 60px; border: 0; border-bottom: 1px solid var(--border); background: none; color: var(--text); font: inherit; text-align: left; padding: 8px 0; cursor: pointer; }
  .grow { flex: 1; min-width: 0; }
  .block { display: block; }
  .num { font-variant-numeric: tabular-nums; font-size: 18px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: 600 15px var(--ff-body); }
  .chip.on { border-color: var(--primary); background: var(--primary); color: var(--text-on-primary); }
  .effect { font-weight: 700; }
  .effect.neg { color: var(--danger); }
  .error-box { color: var(--danger); font-weight: 600; }
</style>
