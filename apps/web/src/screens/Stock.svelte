<script lang="ts">
  // Stock (docs/17 §4): one work page for Inventory + Warehouse stock. Opens on the stock list per company × warehouse ×
  // product (movements over the last 30 days, cases on hand now).
  //  · Receivers (Asie, Yonas): quantities for their own warehouses — received, damaged, short, moved out, sold, count
  //    differences, on hand, last count — and Count / adjust. Never a value or price (docs/12 A-04, docs/14 B-02).
  //  · Directors and other 'inventory' roles with prices: the same list plus landed cost and value (USD, docs/18
  //    stock-value); Count / adjust when they also have 'warehouse-stock'.
  // Strip: inventoryTiles (lib/tiles.ts, the metric registry) over the same rows as Home · Warehouse, so the figures match.
  // Filters live in the hash query: show (strip tile), wh, level, q, company (Group view). Old links (#/inventory?wh=&
  // level=&q=, #/warehouse-stock) are redirected here by the shell with their query; `warehouseId` and `f` are read as
  // aliases of `wh` and `level`.
  import { analytics, inventory, lookup, ref, warehouse, type StockAdjustment, type StockRow, type User, type VelocityRow, type WarehouseStockRow } from '@btw/api';
  import { Badge, fmtDateTime, fmtMoney, fmtNum } from '@btw/ui';
  import { seesPrices } from '@btw/api/access';
  import { canRecordWarehouse } from '@btw/api/money';
  import * as MX from '@btw/api/metrics';
  import { watch } from '../lib/load.svelte';
  import { can } from '../lib/features';
  import { destinationLabel } from '../lib/planning';
  import { companyLabel } from '../lib/companies';
  import { company, GROUP } from '../lib/company.svelte';
  import { inventoryTiles, infoOf } from '../lib/tiles';
  import ErrorState from '../components/ErrorState.svelte';
  import ExportMenu from '../components/ExportMenu.svelte';
  import CompanyMark from '../components/CompanyMark.svelte';
  import CountDialog, { type CountLine } from '../components/stock/CountDialog.svelte';
  import { PageHeader, SummaryStrip, ActionInCompany, WorkPage, DetailDrawer, EmptyState, DataTable, queryFilters, readQuery, writeQuery, takeIntent, ts, tableQuery, processRows, type Column, type SummaryTile } from '../components/page';
  import SearchX from '@lucide/svelte/icons/search-x';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  let { user }: { params?: any; user: User } = $props();

  const money = $derived(seesPrices(user)); // receivers: quantities only (no landed cost, no value)
  const hasInv = $derived(can(user, 'inventory'));
  const hasWh = $derived(can(user, 'warehouse-stock'));
  const scoped = $derived(user.roles.includes('director') || !user.warehouseIds.length ? null : user.warehouseIds);
  const r = ref();
  const warehouses = $derived(r.warehouses.filter((w) => !scoped || scoped.includes(w.id)));
  const group = $derived(company.active === GROUP);

  // ---- filters (hash query). Aliases from older links first, then the page's own keys. ----
  const LEVELS = ['Low', 'Overstock', 'Out of stock', 'OK'] as const;
  type Level = (typeof LEVELS)[number];
  {
    const alias: Record<string, string | null> = {};
    if (!readQuery('wh') && readQuery('warehouseId')) { alias.wh = readQuery('warehouseId'); alias.warehouseId = null; }
    const lv = readQuery('level') || readQuery('f');
    const norm = LEVELS.find((l) => l.toLowerCase() === lv.toLowerCase().replace(/[-_]/g, ' ')) ?? (lv.toLowerCase() === 'out' ? 'Out of stock' : '');
    if (readQuery('f')) alias.f = null;
    if (lv && norm !== readQuery('level')) alias.level = norm || null;
    if (Object.keys(alias).length) writeQuery(alias);
  }
  // Whether the address already says what to show (then the needs-action default below is skipped).
  const explicit = ['show', 'wh', 'level', 'q', 'company'].some((k) => readQuery(k));
  const f = queryFilters({ show: '', wh: '', level: '', q: '', company: '' });
  // V3-8: search + Level in the table; Warehouse and Company stay as choices because they also scope the strip's counts
  const tq = tableQuery(f, { search: 'q', filters: { level: 'level' } });
  const searchExtra = (x: Line) => lookup.product(x.productId)?.sku ?? '';
  function clearAll() { f.clear(); }

  // ---- data ----
  type Line = StockRow & { key: string; w: WarehouseStockRow | null };
  let inv = $state<StockRow[] | null>(null);
  let whRows = $state<WarehouseStockRow[] | null>(null);
  let adjs = $state<StockAdjustment[]>([]);
  let vel = $state<VelocityRow[]>([]);
  const from30 = () => new Date(Date.now() - 30 * 864e5).toISOString();
  const w = watch(async () => {
    const [a, b, c, d] = await Promise.all([
      hasInv ? inventory.stock() : Promise.resolve(null),
      hasWh ? warehouse.stock({ from: from30() }) : Promise.resolve(null),
      hasWh ? warehouse.adjustments() : Promise.resolve([] as StockAdjustment[]),
      analytics.velocity().catch(() => [] as VelocityRow[]),
    ]);
    inv = a; whRows = b; adjs = c; vel = d;
  });
  const keyOf = (x: Pick<StockRow, 'entityId' | 'warehouseId' | 'productId'>) => `${x.entityId}|${x.warehouseId}|${x.productId}`;
  // One line per company × warehouse × product: the inventory row (closing, in transit, landed cost) joined with the
  // warehouse row (short, moved out, last count, held). Without 'inventory' the warehouse rows stand alone.
  const lines = $derived.by<Line[] | null>(() => {
    if (hasInv && !inv) return null;
    if (!hasInv && !whRows) return null;
    const byKey = new Map((whRows ?? []).map((x) => [keyOf(x), x]));
    const base: Line[] = hasInv
      ? inv!.map((x) => ({ ...x, key: keyOf(x), w: byKey.get(keyOf(x)) ?? null }))
      : whRows!.map((x) => ({ entityId: x.entityId, warehouseId: x.warehouseId, productId: x.productId, opening: x.opening, received: x.received, transfersIn: x.transfersIn, transfersOut: x.transfersOut,
        damaged: x.damaged, adjustments: x.adjusted - x.movedOut, sold: x.sold, closing: x.held, inTransit: 0, landedCostPerCase: undefined as unknown as number, key: keyOf(x), w: x }));
    return base.filter((x) => !scoped || scoped.includes(x.warehouseId));
  });

  // ---- level and cover (metrics.stockRisk, as on Home) ----
  const pace = $derived(MX.paceFromVelocity(vel));
  const cover = (x: StockRow) => { const p = pace(x); return p.perDay ? Math.round(x.closing / p.perDay) : 999; };
  const levelOf = (x: StockRow): Level => { const p = pace(x); const k = MX.stockRisk(x.closing, p.perDay, p.daysSinceSale); return k === 'out' ? 'Out of stock' : k === 'stock-out risk' || k === 'low' ? 'Low' : k === 'ok' ? 'OK' : 'Overstock'; };
  const levelTone = { 'Out of stock': 'danger', Low: 'danger', Overstock: 'warning', OK: 'success' } as const;
  const valueOf = (x: StockRow) => Math.max(0, x.closing) * (x.landedCostPerCase ?? 0);
  // V3-15: the cover bar (days of stock against the stock-out and overstock thresholds) and a plain "what to do"
  const th = analytics.thresholds;
  const coverPct = (x: StockRow) => { const c = cover(x); return c >= 999 ? (x.closing > 0 ? 100 : 0) : Math.min(100, Math.max(0, (c / Math.max(1, th.overstockDays)) * 100)); };
  function todo(x: Line): { text: string; tone: 'bad' | 'warn' | 'ok' } {
    const lv = levelOf(x);
    // the same product overstocked in another warehouse of the same company: move it rather than order more
    const spare = (lines ?? []).find((y) => y.productId === x.productId && y.entityId === x.entityId && y.warehouseId !== x.warehouseId && levelOf(y) === 'Overstock');
    if (lv === 'Out of stock' || lv === 'Low') return { text: spare ? `Move from ${destinationLabel(spare.warehouseId)}` : x.inTransit > 0 ? 'Arriving: follow the truck' : 'Order more', tone: 'bad' };
    if (lv === 'Overstock') return { text: 'Stop ordering; sell or move it', tone: 'warn' };
    return { text: '-', tone: 'ok' };
  }
  // warehouse cards on top: what each warehouse holds and how many lines need attention; picking one filters the page
  const whCards = $derived.by(() => {
    const byWh = new Map<string, { id: string; value: number; cases: number; transit: number; out: number; low: number; over: number }>();
    for (const x of (lines ?? []).filter((x) => !f.values.company || x.entityId === f.values.company)) {
      const c = byWh.get(x.warehouseId) ?? { id: x.warehouseId, value: 0, cases: 0, transit: 0, out: 0, low: 0, over: 0 };
      c.value += valueOf(x); c.cases += Math.max(0, x.closing); c.transit += x.inTransit;
      const lv = levelOf(x); if (lv === 'Out of stock') c.out++; else if (lv === 'Low') c.low++; else if (lv === 'Overstock') c.over++;
      byWh.set(x.warehouseId, c);
    }
    return [...byWh.values()].sort((a, b) => b.value - a.value || b.cases - a.cases);
  });
  // group by warehouse (default) or by product (one product's warehouses side by side)
  let byProduct = $state(readQuery('by') === 'product');
  function setBy(v: '' | 'product') { byProduct = v === 'product'; writeQuery({ by: v || null }); }

  // Lines in the chosen warehouse / company: the strip counts these (with no filter: the same rows as Home).
  const base = $derived((lines ?? []).filter((x) => (!f.values.wh || x.warehouseId === f.values.wh) && (!f.values.company || x.entityId === f.values.company)));
  const fig = $derived(inventoryTiles(base, vel, money));
  const attention = $derived(new Set(MX.needsAttentionBy(base, pace).map((x) => keyOf(x))));
  const SHOW: Record<string, (x: Line) => boolean> = {
    value: (x) => x.closing > 0, cases: (x) => x.closing > 0, transit: (x) => x.inTransit > 0, attention: (x) => attention.has(x.key),
  };
  const tiles = $derived<SummaryTile[]>([
    ...(money ? [{ key: 'value', label: 'Stock value', value: fig.value, format: (n: number) => `USD ${fmtNum(Math.round(n))}`, sub: 'at landed cost · highest first', info: infoOf('stockValue') }] : []),
    { key: 'cases', label: 'Cases on hand', value: fig.cases, sub: 'in the warehouses now', info: infoOf('casesOnHand') },
    { key: 'transit', label: 'In transit', value: fig.transit, sub: 'loaded, not yet signed for', info: infoOf('stockInTransit') },
    { key: 'attention', label: 'Needs attention', value: fig.attention, status: fig.attention ? 'warn' : 'good', statusLabel: fig.attention ? 'Check' : 'All fine', sub: 'out, low or overstock', info: infoOf('needsAttention') },
  ]);

  // the strip (Show) + the usual order stay here; the table adds search + Level. BUG-3: the table used to get every line.
  const listed = $derived(base
    .filter((x) => !f.values.show || (SHOW[f.values.show]?.(x) ?? true))
    .sort((a, b) => (f.values.show === 'value' ? valueOf(b) - valueOf(a) : 0) || destinationLabel(a.warehouseId).localeCompare(destinationLabel(b.warehouseId))
      || (lookup.product(a.productId)?.brand ?? '').localeCompare(lookup.product(b.productId)?.brand ?? '') || a.productId.localeCompare(b.productId) || a.entityId.localeCompare(b.entityId)));
  const sum = (k: keyof StockRow) => shown.reduce((a, x) => a + (x[k] as number), 0);
  const sumW = (k: 'short' | 'movedOut') => shown.reduce((a, x) => a + (x.w?.[k] ?? 0), 0);
  const companies = $derived([...new Set((lines ?? []).map((x) => x.entityId))].sort());

  // "Needs action" default: when the address names no filter, the page opens on the lines needing attention — for people
  // who buy and sell (directors, accounts, sales). NOT for receivers (no prices): their job here is counting what is in
  // their warehouse, and cover / overstock is a purchasing signal; they open on every line of their own warehouse(s),
  // which the API already limits to theirs.
  let defaulted = false;
  let auto = $state('');
  $effect(() => {
    if (defaulted || !lines) return;
    defaulted = true;
    if (!explicit && money && fig.attention > 0) { auto = 'attention'; f.set('show', 'attention'); }
  });

  // ---- Count / adjust ----
  const recordable = $derived(hasWh ? warehouses.filter((x) => canRecordWarehouse(user, x.id)).map((x) => x.id) : []);
  const countLines = $derived<CountLine[]>((lines ?? []).filter((x) => recordable.includes(x.warehouseId))
    .map((x) => ({ entityId: x.entityId, warehouseId: x.warehouseId, productId: x.productId, held: x.w?.held ?? x.closing })));
  let counting = $state(false);
  let countStart = $state<CountLine | null>(null);
  function count(x?: Line) {
    countStart = x ? countLines.find((l) => keyOf(l) === x.key) ?? null : null;
    open = false; counting = true;
  }
  const canCount = (x: Line) => recordable.includes(x.warehouseId);
  $effect(() => { if (lines && takeIntent('count')) count(); });

  // ---- row detail ----
  let open = $state(false);
  let sel = $state<Line | null>(null);
  let ledger = $state<Awaited<ReturnType<typeof inventory.ledger>> | null>(null);
  async function show(x: Line) {
    sel = x; ledger = null; open = true;
    if (hasInv) ledger = await inventory.ledger(x.warehouseId, x.productId).catch(() => []);
  }
  const selAdjs = $derived(sel ? adjs.filter((a) => keyOf(a) === sel!.key).slice(0, 20) : []);

  const name = (x: Pick<StockRow, 'productId'>) => `${lookup.product(x.productId)?.brand ?? x.productId} · ${lookup.product(x.productId)?.pack ?? ''}`;
  const dash = (n: number | undefined | null) => (n ? fmtNum(n) : '—');
  const signed = (n: number) => (n ? `${n > 0 ? '+' : ''}${fmtNum(n)}` : '—');
  const exportRows = () => [['Company', 'Warehouse', 'SKU', 'Brand', 'Package', 'Opening', 'Received', 'Transfers in', 'Transfers out', 'Damaged', ...(whRows ? ['Short', 'Moved out'] : []), 'Adjustments', 'Sold', 'On hand', 'In transit', 'Cover (days)', 'Level', ...(whRows ? ['Last count'] : []), ...(money ? ['Landed cost/case (USD)', 'Value (USD)'] : [])],
    ...shown.map((x) => { const p = lookup.product(x.productId); return [companyLabel(x.entityId), lookup.warehouse(x.warehouseId)?.name ?? x.warehouseId, p?.sku ?? '', p?.brand ?? '', p?.pack ?? '', x.opening, x.received, x.transfersIn, x.transfersOut, x.damaged,
      ...(whRows ? [x.w?.short ?? 0, x.w?.movedOut ?? 0] : []), x.adjustments, x.sold, x.closing, x.inTransit, cover(x) >= 999 ? '' : cover(x), levelOf(x), ...(whRows ? [x.w?.lastCountAt?.slice(0, 10) ?? ''] : []),
      ...(money ? [x.landedCostPerCase, Math.round(valueOf(x) * 100) / 100] : [])]; })];
  const active = $derived((f.values.show && f.values.show !== 'all' ? 1 : 0) + (f.values.wh ? 1 : 0) + (f.values.level ? 1 : 0) + (f.values.company ? 1 : 0));
  // the list's columns (DataTable). Totals are over every filtered line, not just the page shown.
  type C = Column<Line>;
  const n = (get: (x: Line) => number, show: (v: number) => string = fmtNum): Pick<C, 'align' | 'sortValue' | 'value' | 'csv' | 'total'> =>
    ({ align: 'right', sortValue: get, value: (x) => show(get(x)), csv: get, total: (l) => fmtNum(l.reduce((a, x) => a + get(x), 0)) });
  const LEVEL_RANK: Record<Level, number> = { 'Out of stock': 0, Low: 1, Overstock: 2, OK: 3 };
  const columns = $derived<C[]>([
    { key: 'product', label: 'Brand · Package', sticky: true, value: (x) => name(x), cell: productCell },
    { key: 'wh', label: 'Warehouse', value: (x) => destinationLabel(x.warehouseId), class: 'nowrap' },
    ...(group ? [{ key: 'company', label: 'Company', value: (x: Line) => companyLabel(x.entityId), cell: companyCell, hideBelow: 1000 }] : []),
    { key: 'opening', label: 'Opening', ...n((x) => x.opening), hideBelow: 1300, hidden: true },
    { key: 'received', label: 'Received', ...n((x) => x.received + x.transfersIn), hidden: true },
    { key: 'damaged', label: 'Damaged', ...n((x) => x.damaged, dash), cell: damagedCell, hideBelow: 900, hidden: true },
    ...(whRows ? [{ key: 'short', label: 'Short', ...n((x) => x.w?.short ?? 0, dash), hideBelow: 1300, hidden: true }] : []),
    { key: 'out', label: 'Sent on / out', ...n((x) => x.transfersOut + (x.w?.movedOut ?? 0), dash), hideBelow: 1000, hidden: true },
    { key: 'sold', label: 'Sold', ...n((x) => x.sold), hidden: true },
    { key: 'adj', label: 'Count ±', ...n((x) => (x.w ? x.w.adjusted : x.adjustments), signed), total: undefined, hideBelow: 1300, hidden: true },
    { key: 'onhand', label: 'On hand · cover', ...n((x) => x.closing), cell: onHandCell },
    { key: 'transit', label: 'In transit', ...n((x) => x.inTransit, dash), cell: transitCell },
    { key: 'level', label: 'Level', filter: 'select', filterValue: (x) => levelOf(x), sortValue: (x) => LEVEL_RANK[levelOf(x)] * 10000 + Math.min(9999, Math.max(0, cover(x))), csv: (x) => levelOf(x), cell: levelCell, class: 'nowrap', title: 'Cover = cases on hand ÷ cases sold per day over 30 days' },
    { key: 'todo', label: 'What to do', value: (x) => todo(x).text, cell: todoCell, class: 'small', filter: 'select' },
    ...(whRows ? [{ key: 'count', label: 'Last count', sortValue: (x: Line) => ts(x.w?.lastCountAt), value: (x: Line) => x.w?.lastCountAt?.slice(0, 10) ?? null, class: 'small nowrap', hideBelow: 1300 }] : []),
    ...(money ? [
      { key: 'landed', label: 'Landed / case (USD)', align: 'right' as const, sortValue: (x: Line) => x.landedCostPerCase, value: (x: Line) => fmtNum(x.landedCostPerCase, 2), csv: (x: Line) => x.landedCostPerCase, hideBelow: 1300 },
      { key: 'value', label: 'Value (USD)', align: 'right' as const, sortValue: valueOf, value: (x: Line) => fmtNum(valueOf(x), 2), csv: (x: Line) => Math.round(valueOf(x) * 100) / 100, total: (l: Line[]) => fmtNum(l.reduce((a, x) => a + valueOf(x), 0), 2) },
    ] : []),
    ...(recordable.length ? [{ key: 'act', label: '', sortable: false, csv: false as const, hideable: false, cell: actCell, mobile: 'actions' as const }] : []),
  ]);
  // what the table shows (also the totals and the export): search + Level on top of the strip, in the usual order
  const shown = $derived(processRows({ rows: listed, columns, rowKey: (x) => x.key, sort: null, search: f.values.q, filters: tq.filters.get(), searchExtra }).rows);
</script>

<WorkPage>
  {#snippet header()}
    <PageHeader overline="Warehouse" title="Stock" analysis="warehouse"
      description={money ? 'Cases on hand, in transit and their value, per warehouse and product.' : 'Cases received, sold, damaged and held at your warehouse, per product.'}
      info="Movements over the last 30 days; on hand is now. Stock posts only after the delivery is signed for; cases on a truck show under In transit and are not on hand. Cover = cases on hand ÷ cases sold per day over 30 days.{money ? ' Value = cases on hand × landed cost per case.' : ''}">
      {#snippet secondary()}<ExportMenu name="stock" rows={exportRows} />{/snippet}
      {#snippet primary()}<ActionInCompany label="Count / adjust stock" what="stock count" feature="warehouse-stock" intent="count" when={recordable.length > 0} onclick={() => count()} />{/snippet}
    </PageHeader>
  {/snippet}
  {#snippet strip()}<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Stock summary" allValue="all" noun="stock lines" total={lines ? lines.length : null} shown={lines ? shown.length : null} {auto} />{/snippet}

  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

  {#if whCards.length > 1}
    <div class="whs" role="group" aria-label="Warehouses">
      {#each whCards as c (c.id)}
        <button type="button" class="whc" class:on={f.values.wh === c.id} aria-pressed={f.values.wh === c.id} onclick={() => f.set('wh', f.values.wh === c.id ? '' : c.id)}>
          <span class="nm">{destinationLabel(c.id)}</span>
          <span class="big">{money ? `USD ${fmtNum(Math.round(c.value))}` : `${fmtNum(c.cases)} cases`}</span>
          <span class="caption">{money ? `${fmtNum(c.cases)} cases on hand · ` : ''}{fmtNum(c.transit)} in transit</span>
          <span class="flags">{#if c.out}<span class="fl bad">{c.out} out</span>{/if}{#if c.low}<span class="fl bad">{c.low} low</span>{/if}{#if c.over}<span class="fl warn">{c.over} overstock</span>{/if}{#if !c.out && !c.low && !c.over}<span class="fl ok">All fine</span>{/if}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#key byProduct}
  <DataTable id="stock" label="Stock lines" noun="stock lines" rows={lines ? listed : null} {columns} rowKey={(x) => x.key} onrowclick={show} selected={open && sel ? sel.key : null}
    loading={!lines && !w.error} filename="stock-list" initialSort={byProduct ? { key: 'product', dir: 'asc' } : undefined} empty={emptyTable} card={phoneCard}
    searchable searchPlaceholder="Brand, package or SKU code" {searchExtra} bind:search={tq.search.get, tq.search.set} bind:filters={tq.filters.get, tq.filters.set}>
    {#snippet toolbar()}
      {#if warehouses.length > 1}
        <select class="select" aria-label="Warehouse" value={f.values.wh} onchange={(e) => f.set('wh', e.currentTarget.value)}><option value="">All warehouses{scoped ? ' (mine)' : ''}</option>{#each warehouses as x (x.id)}<option value={x.id}>{destinationLabel(x.id)}</option>{/each}</select>
      {/if}
      {#if group && companies.length > 1}
        <select class="select" aria-label="Company" value={f.values.company} onchange={(e) => f.set('company', e.currentTarget.value)}><option value="">All companies</option>{#each companies as id (id)}<option value={id}>{companyLabel(id)}</option>{/each}</select>
      {/if}
      <div class="by" role="group" aria-label="Group by"><button class:on={!byProduct} onclick={() => setBy('')}>By warehouse</button><button class:on={byProduct} onclick={() => setBy('product')}>By product</button></div>
    {/snippet}
  </DataTable>
  {/key}

  {#snippet drawer()}
    <DetailDrawer bind:open title={sel ? name(sel) : ''} subtitle={sel ? `${destinationLabel(sel.warehouseId)} · ${companyLabel(sel.entityId)}` : ''} width={560}>
      {#snippet header()}{#if sel}{@const lv = levelOf(sel)}<Badge tone={levelTone[lv]}>{lv}</Badge>{#if cover(sel) < 999}<span class="caption">{Math.max(0, cover(sel))} days of cover</span>{/if}{/if}{/snippet}
      {#if sel}
        <dl class="facts">
          <dt>Opening (30 days ago)</dt><dd>{fmtNum(sel.opening)}</dd>
          <dt>Received</dt><dd>{fmtNum(sel.received)}{#if sel.transfersIn} <span class="caption">+ {fmtNum(sel.transfersIn)} transfers in</span>{/if}</dd>
          <dt>Damaged</dt><dd>{fmtNum(sel.damaged)}</dd>
          {#if sel.w}<dt>Short on delivery</dt><dd>{fmtNum(sel.w.short)}</dd><dt>Moved out</dt><dd>{fmtNum(sel.w.movedOut)}</dd>{/if}
          <dt>Sent on / re-exported</dt><dd>{fmtNum(sel.transfersOut)}</dd>
          <dt>Sold</dt><dd>{fmtNum(sel.sold)}</dd>
          <dt>Count differences</dt><dd>{signed(sel.w ? sel.w.adjusted : sel.adjustments)}</dd>
          <dt>On hand</dt><dd><strong>{fmtNum(sel.closing)}</strong> cases</dd>
          <dt>In transit</dt><dd>{fmtNum(sel.inTransit)}</dd>
          {#if sel.w}<dt>Last count</dt><dd>{sel.w.lastCountAt ? fmtDateTime(sel.w.lastCountAt) : 'Not counted yet'}</dd>{/if}
          {#if money}<dt>Value</dt><dd>{fmtMoney(valueOf(sel))} <span class="caption">at {fmtNum(sel.landedCostPerCase, 2)} per case</span></dd>{/if}
        </dl>
        {#if selAdjs.length}
          <h3 class="h5">Counts and adjustments</h3>
          <ul class="adj">
            {#each selAdjs as a (a.at + a.reason + a.ref)}
              <li><span class="grow"><strong>{a.reason}</strong>{#if a.note}<span class="caption"> · {a.note}</span>{/if}<span class="caption block">{fmtDateTime(a.at)} · {lookup.user(a.byUserId ?? '')?.name ?? ''}</span></span><span class="num" class:neg={a.qty < 0}>{signed(a.qty)}</span></li>
            {/each}
          </ul>
        {/if}
        {#if hasInv}
          <h3 class="h5">Stock ledger</h3>
          {#if !ledger}<div class="skeleton"></div>
          {:else}
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Date</th><th>Movement</th><th>Reference</th><th class="num">Cases</th></tr></thead>
              <tbody>
                {#each ledger as m}
                  {@const sign = m.kind === 'received' || m.kind === 'transferIn' || m.kind === 'adjustment' ? 1 : -1}
                  <tr><td class="small">{fmtDateTime(m.at)}</td><td class="cap">{m.kind.replace(/([A-Z])/g, ' $1').toLowerCase()}</td><td class="mono small">{m.ref}</td><td class="num" class:neg={sign < 0}>{sign > 0 ? '+' : '−'}{fmtNum(m.qty)}</td></tr>
                {:else}<tr><td colspan="4" class="empty">No movements</td></tr>{/each}
              </tbody>
            </table></div>
            <p class="caption">Most recent 50 movements, each with its source document.</p>
          {/if}
        {/if}
      {/if}
      {#snippet footer()}
        <button class="btn btn-secondary" onclick={() => (open = false)}>Close</button>
        {#if sel && canCount(sel)}<button class="btn btn-primary" onclick={() => count(sel!)}><ClipboardCheck size={16} aria-hidden="true" />Count / adjust</button>{/if}
      {/snippet}
    </DetailDrawer>
    <CountDialog bind:open={counting} lines={countLines} warehouseIds={recordable} start={countStart} />
  {/snippet}
</WorkPage>

{#snippet emptyTable()}{@render empty(true)}{/snippet}
{#snippet companyCell(x: Line)}<span class="cc"><CompanyMark entityId={x.entityId} size={18} />{companyLabel(x.entityId)}</span>{/snippet}
{#snippet productCell(x: Line)}<span class="nowrap">{lookup.product(x.productId)?.brand}</span> <span class="muted small nowrap">{lookup.product(x.productId)?.pack}</span>{/snippet}
{#snippet damagedCell(x: Line)}<span class:accent-text={x.damaged > 0}>{dash(x.damaged)}</span>{/snippet}
{#snippet onHandCell(x: Line)}{@const lv = levelOf(x)}<div class="oh"><strong>{fmtNum(x.closing)}</strong><span class="cbar {levelTone[lv]}" title="{cover(x) >= 999 ? 'no recent sales' : `${Math.max(0, cover(x))} days of cover`}"><i style:width="{coverPct(x)}%"></i></span><span class="caption">{cover(x) >= 999 ? (x.closing > 0 ? 'no sales' : '') : `${Math.max(0, cover(x))} d`}</span></div>{/snippet}
{#snippet todoCell(x: Line)}{@const t = todo(x)}<span class="todo {t.tone}">{t.text}</span>{/snippet}
{#snippet transitCell(x: Line)}<span class="muted">{dash(x.inTransit)}</span>{/snippet}
{#snippet levelCell(x: Line)}{@const lv = levelOf(x)}<Badge tone={levelTone[lv]}>{lv}</Badge>{/snippet}
{#snippet actCell(x: Line)}{#if canCount(x)}<button class="btn btn-secondary btn-sm nowrap" onclick={(e) => { e.stopPropagation(); count(x); }}>Count / adjust</button>{/if}{/snippet}
{#snippet phoneCard(x: Line)}
  {@const lv = levelOf(x)}
  <span class="row between"><strong>{name(x)}</strong><Badge tone={levelTone[lv]}>{lv}</Badge></span>
  <span class="caption">{destinationLabel(x.warehouseId)}{group ? ` · ${companyLabel(x.entityId)}` : ''}</span>
  <span class="small figs"><span><b>{fmtNum(x.closing)}</b> on hand</span>{#if x.inTransit}<span>{fmtNum(x.inTransit)} in transit</span>{/if}<span>{fmtNum(x.sold)} sold</span>{#if x.damaged}<span class="accent-text">{fmtNum(x.damaged)} damaged</span>{/if}{#if money}<span>{fmtMoney(valueOf(x))}</span>{/if}</span>
{/snippet}


{#snippet empty(compact: boolean)}
  {#if (lines ?? []).length}
    <EmptyState title="No stock matches these filters" icon={SearchX} {compact}><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState>
  {:else}
    <EmptyState title="No stock recorded yet" hint="Stock appears here once a delivery is signed for at the warehouse." {compact} />
  {/if}
{/snippet}

<style>
  .nowrap, .mono { white-space: nowrap; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-2) var(--space-4); margin: 0 0 var(--space-4); }
  .facts dt { color: var(--text-muted); font-size: var(--fs-label); font-weight: 600; }
  .facts dd { margin: 0; font-variant-numeric: tabular-nums; }
  .h5 { margin: var(--space-4) 0 var(--space-2); font-size: var(--fs-body); }
  .adj { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .adj li { display: flex; gap: var(--space-3); align-items: baseline; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  .grow { flex: 1; min-width: 0; }
  .block { display: block; }
  .neg { color: var(--danger); }
  .cap { text-transform: capitalize; }
  .figs { display: flex; flex-wrap: wrap; gap: 2px var(--space-3); }
  .cc { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }
  .whs { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: var(--space-4); }
  .whc { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
  .whc:hover { border-color: var(--border-strong, var(--border)); } .whc.on { border-color: var(--primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 25%, transparent); }
  .whc:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .whc .nm { font-size: 13px; color: var(--text-muted); } .whc .big { font: 800 20px/1.25 var(--ff-display); font-variant-numeric: tabular-nums; }
  .flags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .fl { font-size: 11.5px; font-weight: 600; padding: 1px 7px; border-radius: 99px; }
  .fl.bad { background: var(--danger-subtle); color: var(--danger); } .fl.warn { background: var(--warning-subtle, var(--surface-sunken)); color: var(--warning); } .fl.ok { background: var(--success-subtle); color: var(--success); }
  .oh { display: grid; grid-template-columns: auto 70px auto; align-items: center; gap: 8px; justify-content: end; }
  .cbar { height: 6px; border-radius: 3px; background: var(--surface-sunken); overflow: hidden; }
  .cbar i { display: block; height: 100%; border-radius: 3px; background: var(--success); }
  .cbar.danger i { background: var(--danger); } .cbar.warning i { background: var(--warning-solid, var(--warning)); }
  .todo.bad { color: var(--danger); font-weight: 600; } .todo.warn { color: var(--warning); font-weight: 600; }
  .by { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-sunken); }
  .by button { border: 0; background: none; padding: 5px 10px; border-radius: 8px; font: inherit; font-size: 13px; color: var(--text-muted); cursor: pointer; }
  .by button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / .08); }
</style>
