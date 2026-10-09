<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { analytics, inventory, lookup, ref, type Flag, type StockRow, type VelocityRow, type User } from '@btw/api';
  import { Badge, fmtNum, say, toneOf, velocityGlyph } from '@btw/ui';
  import ExportMenu from '../components/ExportMenu.svelte';
  import X from '@lucide/svelte/icons/x';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  let { user }: { params?: any; user: User } = $props();
  const r = ref();
  let rows = $state<VelocityRow[] | null>(null);
  let flags = $state<Flag[]>([]);
  let stock = $state<StockRow[]>([]);
  let wh = $state(''); let brand = $state(''); let cls = $state('');
  let drill = $state<{ kind: 'brand' | 'warehouse'; id: string } | null>(null);
  async function load() { [rows, flags, stock] = await Promise.all([analytics.velocity(), analytics.flags(), inventory.stock()]); }
  const w = watch(load);

  // §9.2 thresholds — directors adjust; the mock applies them live, the real build stores them per brand/branch (Q13)
  const t = analytics.thresholds;
  let edit = $state({ ...t });
  const isDirector = $derived(user.roles.includes('director'));
  const dirty = $derived(Object.keys(edit).some((k) => edit[k as keyof typeof edit] !== t[k as keyof typeof t]));
  async function applyThresholds() {
    if (!(edit.fast > edit.normal && edit.normal > edit.slow && edit.slow > 0)) return say('Thresholds must be Fast > Normal > Slow > 0');
    Object.assign(t, $state.snapshot(edit)); await load(); say('Thresholds applied — classes and flags recalculated');
  }

  const shown = $derived((rows ?? []).filter((x) => (!wh || x.warehouseId === wh) && (!brand || x.productId === brand) && (!cls || x.cls === cls)).sort((a, b) => b.index - a.index));
  const prods = $derived([...new Set((rows ?? []).map((x) => x.productId))]);
  const whs = $derived(r.warehouses.filter((w) => (rows ?? []).some((x) => x.warehouseId === w.id)));
  const cell = (pid: string, w: string) => rows?.find((x) => x.productId === pid && x.warehouseId === w);
  const onHand = (pid: string, w: string) => stock.find((x) => x.productId === pid && x.warehouseId === w)?.closing ?? 0;
  const flagText: Record<string, string> = { 'slow-moving': 'Slow moving', overstock: 'Overstock', 'stock-out-risk': 'Stock-out risk', 'dead-stock': 'Dead stock', 'cross-compare': 'Fast elsewhere' };
  const flagTone = (k: string) => (k === 'stock-out-risk' || k === 'dead-stock' ? 'danger' : k === 'cross-compare' ? 'info' : 'warning');
  const counts = $derived(['Fast', 'Normal', 'Slow', 'Stagnant'].map((c) => [c, (rows ?? []).filter((x) => x.cls === c).length] as const));
  const label = (pid: string) => `${lookup.product(pid)?.brand} · ${lookup.product(pid)?.pack}`;

  // §9.4 cross-comparison: Slow/Stagnant in one warehouse, Fast in another → suggested transfer to bring both towards 30 days cover
  const TARGET_COVER = 30;
  const transfers = $derived.by(() => {
    const out: { pid: string; from: VelocityRow; to: VelocityRow; qty: number }[] = [];
    for (const from of rows ?? []) {
      if (from.cls !== 'Slow' && from.cls !== 'Stagnant') continue;
      for (const to of (rows ?? []).filter((x) => x.productId === from.productId && x.cls === 'Fast')) {
        const excess = onHand(from.productId, from.warehouseId) - from.perDay * TARGET_COVER;
        const short = to.perDay * TARGET_COVER - onHand(to.productId, to.warehouseId);
        const qty = Math.floor(Math.min(excess, short) / 10) * 10;
        if (qty > 0) out.push({ pid: from.productId, from, to, qty });
      }
    }
    return out.sort((a, b) => b.qty - a.qty);
  });

  const drillRows = $derived(!drill || !rows ? [] : drill.kind === 'brand'
    ? rows.filter((x) => x.productId === drill!.id).sort((a, b) => b.index - a.index)
    : rows.filter((x) => x.warehouseId === drill!.id).sort((a, b) => b.sold30 - a.sold30));
  const drillSold = $derived(drillRows.reduce((a, x) => a + x.sold30, 0));

  const exportRows = () => [['Brand', 'Package', 'Warehouse', 'Sold (30 days)', 'Avg / day', 'Velocity index %', 'Stock cover (days)', 'Days since last sale', 'Class', 'Flags'],
    ...shown.map((x) => [lookup.product(x.productId)!.brand, lookup.product(x.productId)!.pack, lookup.warehouse(x.warehouseId)!.name, x.sold30, x.perDay, x.index, x.cover >= 999 ? '' : x.cover, x.daysSinceSale >= 99 ? '' : x.daysSinceSale, x.cls, x.flags.join('; ')])];
</script>

<div class="page-head">
  <div><div class="overline crumb">Analytics</div><h1>Sales velocity & flags</h1>
    <p class="muted small" style="max-width:620px;margin:var(--space-1) 0 0">Rolling 30 days. Velocity index = actual ÷ benchmark × 100; benchmark = director target, else the average of the same SKU across warehouses (Q-P7). In the real build dashboards read the reporting store (§11).</p></div>
  <ExportMenu name="sales-velocity" rows={exportRows} />
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

<div class="grid grid-kpi" style="margin-bottom:var(--space-4)">
  {#each counts as [c, n]}
    <button class="card kpi pick" class:on={cls === c} aria-pressed={cls === c} onclick={() => (cls = cls === c ? '' : c)}><div class="overline">{c}</div><div class="value">{n}</div><div class="delta"><Badge status={c} /> SKU × warehouse</div></button>
  {/each}
</div>

<div class="layout">
  <div class="stack">
    <section class="card flush">
      <header><h3>Heatmap · brand × warehouse</h3><span class="caption">Click a brand or warehouse to drill down; click a cell to filter the table</span></header>
      <div class="table-wrap"><table class="table heat">
        <thead><tr><th>Brand · Package</th>{#each whs as w}<th><button class="hdr" class:on={drill?.kind === 'warehouse' && drill.id === w.id} onclick={() => (drill = { kind: 'warehouse', id: w.id })}>{w.name}</button></th>{/each}</tr></thead>
        <tbody>
          {#if !rows}{#each Array(4) as _}<tr><td colspan={4}><div class="skeleton"></div></td></tr>{/each}{/if}
          {#each prods as pid}
            <tr><td><button class="hdr row-hdr" class:on={drill?.kind === 'brand' && drill.id === pid} onclick={() => (drill = { kind: 'brand', id: pid })}>{lookup.product(pid)?.brand} <span class="caption">{lookup.product(pid)?.pack}</span></button></td>
              {#each whs as w}
                {@const c = cell(pid, w.id)}
                <td>{#if c}<button class="hc tone-{toneOf(c.cls)}" class:sel={brand === pid && wh === w.id} onclick={() => { brand = pid; wh = w.id; }} aria-label="{label(pid)} at {w.name}: {c.cls}, index {c.index}%"><span aria-hidden="true">{velocityGlyph[c.cls]}</span> {c.cls} <span class="num">{c.index}%</span></button>{:else}<span class="subtle small" title="Not stocked">not stocked</span>{/if}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table></div>
    </section>

    {#if drill}
      <section class="card flush drill">
        <header>
          <div><div class="overline">{drill.kind === 'brand' ? 'Brand → warehouses' : 'Warehouse → brands'} (§9.4)</div>
            <h3>{drill.kind === 'brand' ? label(drill.id) : lookup.warehouse(drill.id)?.name}</h3>
            <div class="caption">{drill.kind === 'brand' ? 'Where it moves and where it is stuck' : 'Brands driving and dragging this warehouse'} · {fmtNum(drillSold)} cases sold in 30 days</div></div>
          <button class="btn btn-ghost btn-sm" onclick={() => (drill = null)} aria-label="Close drill-down"><X size={16} /></button>
        </header>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>{drill.kind === 'brand' ? 'Warehouse' : 'Brand · Package'}</th><th class="num">On hand</th><th class="num">Sold (30 d)</th><th class="num">Share</th><th class="num">Index</th><th class="num">Cover</th><th>Class</th><th></th></tr></thead>
          <tbody>
            {#each drillRows as x (x.productId + x.warehouseId)}
              <tr>
                <td>{drill.kind === 'brand' ? lookup.warehouse(x.warehouseId)?.name : label(x.productId)}</td>
                <td class="num">{fmtNum(onHand(x.productId, x.warehouseId))}</td>
                <td class="num">{fmtNum(x.sold30)}</td>
                <td class="num"><span class="bar" style:--w="{drillSold ? (x.sold30 / drillSold) * 100 : 0}%"></span>{drillSold ? Math.round((x.sold30 / drillSold) * 100) : 0}%</td>
                <td class="num">{x.index}%</td>
                <td class="num">{x.cover >= 999 ? '—' : `${Math.max(0, x.cover)} d`}</td>
                <td><Badge status={x.cls} /></td>
                <td><button class="btn btn-ghost btn-sm" onclick={() => (drill = drill!.kind === 'brand' ? { kind: 'warehouse', id: x.warehouseId } : { kind: 'brand', id: x.productId })}>{drill.kind === 'brand' ? 'Brands' : 'Warehouses'} <ArrowRight size={14} /></button></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      </section>
    {/if}

  </div>

  <aside class="stack">
    <section class="card flush">
      <header><h3>Suggested transfers</h3><span class="caption">{transfers.length}</span></header>
      <ul class="list">
        {#each transfers as s}
          <li>
            <div class="small" style="font-weight:600">{label(s.pid)}</div>
            <div class="row small" style="gap:6px;flex-wrap:wrap"><span>{lookup.warehouse(s.from.warehouseId)?.name}</span><Badge status={s.from.cls} /><ArrowRight size={14} /><span>{lookup.warehouse(s.to.warehouseId)?.name}</span><Badge status={s.to.cls} /></div>
            <div class="row between" style="width:100%"><strong class="num">{fmtNum(s.qty)} cases</strong><button class="btn btn-ghost btn-sm" onclick={() => say('Stock transfers with approval (IN-03) come in the follow-on release')}>Create transfer</button></div>
            <div class="caption">Brings both towards {TARGET_COVER} days cover</div>
          </li>
        {:else}<li class="empty small">No cross-warehouse imbalances</li>{/each}
      </ul>
    </section>

    <details class="card stack-sm thr">
      <summary class="row between"><span class="overline">Thresholds (§9.2)</span><span class="caption">Fast ≥ {t.fast}% · Normal ≥ {t.normal}% · Slow ≥ {t.slow}%{isDirector ? ' · edit' : ''}</span></summary>
      <div class="th"><Badge status="Fast" /><span class="small">index ≥</span><input class="input num" type="number" bind:value={edit.fast} disabled={!isDirector} aria-label="Fast threshold %" /><span class="small">%</span></div>
      <div class="th"><Badge status="Normal" /><span class="small">index ≥</span><input class="input num" type="number" bind:value={edit.normal} disabled={!isDirector} aria-label="Normal threshold %" /><span class="small">%</span></div>
      <div class="th"><Badge status="Slow" /><span class="small">index ≥</span><input class="input num" type="number" bind:value={edit.slow} disabled={!isDirector} aria-label="Slow threshold %" /><span class="small">%</span></div>
      <div class="th"><Badge status="Stagnant" /><span class="small">no sale for</span><input class="input num" type="number" bind:value={edit.deadDays} disabled={!isDirector} aria-label="Dead stock days" /><span class="small">d</span></div>
      <hr class="sep" style="margin:var(--space-2) 0" />
      <div class="th"><span class="small grow">Overstock cover &gt;</span><input class="input num" type="number" bind:value={edit.overstockDays} disabled={!isDirector} aria-label="Overstock days" /><span class="small">d</span></div>
      <div class="th"><span class="small grow">Stock-out risk cover &lt;</span><input class="input num" type="number" bind:value={edit.stockOutDays} disabled={!isDirector} aria-label="Stock-out days" /><span class="small">d</span></div>
      {#if isDirector}<div class="row" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" disabled={!dirty} onclick={() => (edit = { ...t })}>Reset</button><button class="btn btn-primary btn-sm" disabled={!dirty} onclick={applyThresholds}>Apply</button></div>{/if}
      <p class="caption">Per brand/branch targets and the measurement period are to be confirmed (Q13).</p>
    </details>

    <section class="card flush">
      <header><h3>Flags <span class="muted">{flags.length}</span></h3></header>
      <ul class="list">
        {#each flags as f (f.id)}
          <li><Badge tone={flagTone(f.kind)}>{f.text}</Badge><button class="linkish small" onclick={() => (drill = { kind: 'brand', id: f.productId })}>{label(f.productId)}</button><div class="caption">{lookup.warehouse(f.warehouseId)?.name}</div></li>
        {:else}<li class="empty small">No flags</li>{/each}
      </ul>
    </section>
  </aside>
</div>

<div class="stack" style="margin-top:var(--space-4)">
    <div class="filters" style="margin:0">
    <label class="field"><span>Warehouse</span><select class="select" bind:value={wh}><option value="">All</option>{#each whs as w}<option value={w.id}>{w.name}</option>{/each}</select></label>
    <label class="field"><span>Brand</span><select class="select" bind:value={brand}><option value="">All</option>{#each prods as p}<option value={p}>{label(p)}</option>{/each}</select></label>
    <label class="field"><span>Class</span><select class="select" bind:value={cls}><option value="">All</option>{#each ['Fast', 'Normal', 'Slow', 'Stagnant'] as c}<option>{c}</option>{/each}</select></label>
    <label class="field"><span>Period</span><select class="select" disabled><option>Last 30 days (rolling)</option></select></label>
    {#if wh || brand || cls}<button class="btn btn-ghost" onclick={() => { wh = ''; brand = ''; cls = ''; }}>Clear</button>{/if}
  </div>

  <section class="card flush table-wrap">
    <table class="table">
      <thead><tr><th>Brand / SKU</th><th>Warehouse</th><th class="num">Sold (30 days)</th><th class="num">Avg / day</th><th class="num">Velocity index</th><th class="num">Stock cover</th><th class="num">Days since sale</th><th>Class and flags</th></tr></thead>
      <tbody>
        {#if !rows}<tr><td colspan="8"><div class="skeleton"></div></td></tr>{/if}
        {#each shown as x (x.productId + x.warehouseId)}
          <tr>
            <td><span style="white-space:nowrap">{lookup.product(x.productId)?.brand}</span> <span class="muted small" style="white-space:nowrap">{lookup.product(x.productId)?.pack}</span></td>
            <td>{lookup.warehouse(x.warehouseId)?.name}</td>
            <td class="num">{fmtNum(x.sold30)}</td>
            <td class="num">{fmtNum(x.perDay, 1)}</td>
            <td class="num">{x.index}%</td>
            <td class="num">{x.cover >= 999 ? '∞' : `${Math.max(0, x.cover)} days`}</td>
            <td class="num">{x.daysSinceSale >= 99 ? '—' : x.daysSinceSale}</td>
            <td><div class="row" style="gap:4px"><Badge status={x.cls} />{#each x.flags as f}<Badge tone={flagTone(f)}>{flagText[f]}</Badge>{/each}</div></td>
          </tr>
        {:else}{#if rows}<tr><td colspan="8" class="empty">No rows match these filters</td></tr>{/if}{/each}
      </tbody>
    </table>
  </section>
</div>

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--space-4); align-items: start; }
  @media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  .page-head p { font-family: var(--ff-body); }
  .pick { text-align: left; cursor: pointer; font: inherit; color: inherit; }
  .pick.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .hc { border: 0; border-radius: var(--radius-sm); padding: 6px 10px; width: 100%; min-width: 120px; text-align: left; font: 600 13px var(--ff-body); cursor: pointer; display: flex; gap: 6px; align-items: center; }
  .hc .num { margin-left: auto; }
  .hc.sel { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
  .heat td { padding: 4px; }
  .heat td:first-child { padding: var(--space-1) var(--space-2); white-space: nowrap; }
  .hdr { background: none; border: 0; padding: 4px 6px; border-radius: var(--radius-sm); font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; text-align: left; border-bottom: 2px solid transparent; }
  .hdr:hover { color: var(--link); background: var(--primary-subtle); }
  .hdr.on { border-bottom-color: var(--accent); color: var(--text); }
  .row-hdr { font-family: var(--ff-body); font-size: var(--fs-body); font-weight: 500; }
  .drill { border-top: 3px solid var(--accent); }
  .bar { display: inline-block; vertical-align: middle; width: 48px; height: 6px; margin-right: 8px; border-radius: 3px; background: linear-gradient(90deg, var(--primary) var(--w), var(--surface-sunken) var(--w)); }
  .list { list-style: none; margin: 0; padding: 0; max-height: 340px; overflow-y: auto; }
  .thr summary { cursor: pointer; list-style: none; gap: var(--space-2); }
  .thr summary::-webkit-details-marker { display: none; }
  .thr[open] summary { margin-bottom: var(--space-2); }
  .list li { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border); }
  .list li:last-child { border-bottom: 0; }
  .th { display: flex; align-items: center; gap: var(--space-2); }
  .th :global(.badge) { min-width: 92px; }
  .th .input { width: 72px; height: 32px; margin-left: auto; }
  .linkish { background: none; border: 0; padding: 0; color: var(--link); cursor: pointer; font: inherit; text-align: left; }
  .linkish:hover { text-decoration: underline; }
</style>
