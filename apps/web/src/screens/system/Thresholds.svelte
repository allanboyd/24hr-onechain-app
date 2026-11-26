<script lang="ts">
  // V3-13 Settings & alerts → Thresholds: when the system flags a plan behind or over, and how stock is classed.
  // Directors change them (Save / Cancel / Reset to defaults); planners see them.
  import { analytics, settings, type PvThresholds, type User } from '@btw/api';
  import { defaultPvThresholds, defaultThresholds, type Thresholds } from '@btw/api/rules';
  import { say } from '@btw/ui';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  let { user }: { user: User; params?: unknown; section?: boolean } = $props();
  const canEdit = $derived(user.roles.includes('director'));

  let pv = $state<PvThresholds | null>(null), st = $state<Thresholds | null>(null);
  // the forms hold percentages / days as people read them
  let pvf = $state({ behind: 0, over: 0 }), stf = $state<Thresholds>({ ...defaultThresholds });
  const fromPv = (x: PvThresholds) => ({ behind: Math.round(x.behind * 100), over: Math.round(x.over * 100) });
  const w = watch(async () => { pv = await settings.pvThresholds(); st = { ...(analytics.thresholds as Thresholds) }; pvf = fromPv(pv); stf = { ...st }; });
  const pvDirty = $derived(!!pv && (pvf.behind !== fromPv(pv).behind || pvf.over !== fromPv(pv).over));
  const stDirty = $derived(!!st && (Object.keys(stf) as (keyof Thresholds)[]).some((k) => Number(stf[k]) !== st![k]));
  let busy = $state(''), err = $state<Record<string, string>>({});

  let confirmDlg = $state<HTMLDialogElement>();
  let pending = $state<'pv' | 'st' | null>(null);
  function ask(which: 'pv' | 'st') { pending = which; confirmDlg?.showModal(); }
  async function save() {
    const which = pending; if (!which) return;
    busy = which; err = {};
    try {
      if (which === 'pv') { pv = await settings.setPvThresholds({ behind: pvf.behind / 100, over: pvf.over / 100 }); pvf = fromPv(pv); say('Plan thresholds saved: flags recalculated'); }
      else { st = { ...(await analytics.setThresholds(Object.fromEntries(Object.entries(stf).map(([k, v]) => [k, Number(v)])) as Partial<Thresholds>)) } as Thresholds; stf = { ...st }; say('Stock thresholds saved'); }
      confirmDlg?.close();
    } catch (e) { err = { [which]: (e as Error).message }; confirmDlg?.close(); } finally { busy = ''; }
  }
  const STOCK: { k: keyof Thresholds; label: string; hint: string; unit: string }[] = [
    { k: 'fast', label: 'Fast at', hint: 'sells at least this % of the usual speed for the product', unit: '%' },
    { k: 'normal', label: 'Normal at', hint: 'from this % up to fast', unit: '%' },
    { k: 'slow', label: 'Slow at', hint: 'from this % up to normal; below it the product is stagnant', unit: '%' },
    { k: 'overstockDays', label: 'Overstock above', hint: 'days of stock cover', unit: 'days' },
    { k: 'stockOutDays', label: 'Stock-out risk below', hint: 'days of cover for a fast product', unit: 'days' },
    { k: 'deadDays', label: 'Dead stock after', hint: 'days without a sale', unit: 'days' },
  ];
</script>

<div class="page-head"><div><h1>Thresholds</h1><p class="muted small">When plans are flagged behind or over, and how stock is classed.{canEdit ? '' : ' Directors change them.'}</p></div></div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if pv && st}
  <section class="card blk" aria-labelledby="th-pv">
    <header><h3 id="th-pv">Planned vs actual</h3><p class="caption">Flags on period plans and Management → Plans and orders.</p></header>
    <div class="grid">
      <label class="field"><span>Behind when ordered to date is below</span><span class="unit"><input class="input num" type="number" min="1" max="100" step="1" bind:value={pvf.behind} disabled={!canEdit} /><i>% of expected</i></span></label>
      <label class="field"><span>Over when ordered is above</span><span class="unit"><input class="input num" type="number" min="100" max="200" step="1" bind:value={pvf.over} disabled={!canEdit} /><i>% of plan</i></span></label>
    </div>
    {#if err.pv}<p class="error" role="alert">{err.pv}</p>{/if}
    {#if canEdit}<div class="acts">
      <button class="btn btn-ghost btn-sm" onclick={() => (pvf = fromPv(defaultPvThresholds))}>Reset to defaults</button><span class="grow"></span>
      <button class="btn btn-ghost btn-sm" disabled={!pvDirty} onclick={() => (pvf = fromPv(pv!))}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled={!pvDirty || busy === 'pv'} onclick={() => ask('pv')}>Save</button></div>{/if}
  </section>

  <section class="card blk" aria-labelledby="th-st">
    <header><h3 id="th-st">Stock</h3><p class="caption">How products are classed on Stock and the dashboards (speed compared with the same product in the other warehouses).</p></header>
    <div class="grid three">
      {#each STOCK as s (s.k)}
        <label class="field"><span>{s.label}</span><span class="unit"><input class="input num" type="number" min="0" step="1" bind:value={stf[s.k]} disabled={!canEdit} /><i>{s.unit}</i></span><small class="caption">{s.hint}</small></label>
      {/each}
    </div>
    {#if err.st}<p class="error" role="alert">{err.st}</p>{/if}
    {#if canEdit}<div class="acts">
      <button class="btn btn-ghost btn-sm" onclick={() => (stf = { ...defaultThresholds })}>Reset to defaults</button><span class="grow"></span>
      <button class="btn btn-ghost btn-sm" disabled={!stDirty} onclick={() => (stf = { ...st! })}>Cancel</button>
      <button class="btn btn-primary btn-sm" disabled={!stDirty || busy === 'st'} onclick={() => ask('st')}>Save</button></div>{/if}
  </section>
{/if}

<dialog class="sheet" bind:this={confirmDlg} style="width:min(440px,calc(100vw - 32px))" aria-labelledby="thc-h">
  <div class="body stack">
    <h3 id="thc-h">Save the {pending === 'pv' ? 'planned vs actual' : 'stock'} thresholds?</h3>
    <p class="small">Flags are worked out again with the new values for everyone. The change is kept in the audit log.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => confirmDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={!!busy} onclick={save}>Save</button></div>
  </div>
</dialog>

<style>
  .blk { padding: var(--space-4) var(--space-5); margin-bottom: var(--space-4); }
  .blk header h3 { margin: 0; font-size: 15px; } .blk header p { margin: 2px 0 var(--space-3); }
  .grid { display: grid; gap: var(--space-3) var(--space-4); grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .unit { display: flex; align-items: center; gap: 8px; } .unit .input { width: 110px; } .unit i { font-style: normal; color: var(--text-muted); font-size: 13px; }
  .acts { display: flex; align-items: center; gap: 8px; margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border); }
  .grow { flex: 1; }
</style>
