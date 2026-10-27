<script lang="ts">
  // docs/14 B-05: selling price per product, set by the directors (§7: directors only until someone else is named, Q6) —
  // a company-wide price with optional per-warehouse prices, each from an effective date (history kept). The target-margin
  // helper (§6.4) proposes price = landed cost per case ÷ (1 − target margin). New sales default their line price from here.
  // docs/17 Phase 1: work page with a strip (registry: missing prices · below target margin) that filters the price list.
  // Needs-action default (no filter in the address): Missing prices when any, else Below target when any.
  import { lookup, pricing, ref, reports, type PerfRow, type SellingPrice, type User } from '@btw/api';
  import { fmtDate, fmtNum, say, router } from '@btw/ui';
  import { marginAt, priceForMargin, sellingPriceFor, validateSellingPrice } from '@btw/api/money';
  import { DashboardPanel, StatusBadge } from '../components/dashboard';
  import { attempt, watch } from '../lib/load.svelte';
  import { companyLabel } from '../lib/companies';
  import ErrorState from '../components/ErrorState.svelte';
  import { PageHeader, SummaryStrip, FilterBar, queryFilters, readQuery, type SummaryTile } from '../components/page';
  import { priceTiles, infoOf } from '../lib/tiles';
  let { user }: { params?: any; user: User } = $props();

  const entities = $derived(ref().entities.filter((e) => user.allowedEntityIds.includes(e.id)));
  let entityId = $state(''); let target = $state(20); let q = $state('');
  $effect(() => { if (!entityId && entities.length) entityId = entities[0].id; });
  const whs = ref().warehouses;
  let prices = $state<SellingPrice[] | null>(null);
  let landed = $state<Map<string, PerfRow>>(new Map()); // `${warehouseId|''}|${productId}`
  const w = watch(async () => {
    const range = reports.resolvePeriod('last-90', Date.now());
    const [p, ...reps] = await Promise.all([pricing.list(), reports.performance({ level: 'product', entityId: entityId || undefined, from: range.from, to: range.to }), ...whs.map((x) => reports.performance({ level: 'product', entityId: entityId || undefined, warehouseId: x.id, from: range.from, to: range.to }))]);
    prices = p;
    const m = new Map<string, PerfRow>();
    reps.forEach((r, i) => r.rows.forEach((row) => m.set(`${i === 0 ? '' : whs[i - 1].id}|${row.productId}`, row)));
    landed = m;
  }, () => [entityId]);

  const today = new Date().toISOString().slice(0, 10);
  // products of this company that have a price, stock or sales
  const products = $derived.by(() => {
    const ids = new Set<string>();
    for (const p of prices ?? []) if (p.entityId === entityId) ids.add(p.productId);
    for (const k of landed.keys()) ids.add(k.split('|')[1]);
    return [...ids].map((id) => lookup.product(id)).filter((x): x is NonNullable<typeof x> => !!x).filter((p) => !q || `${p.brand} ${p.pack} ${p.sku}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.brand.localeCompare(b.brand));
  });
  type Line = { productId: string; warehouseId: string | null; price: number | null; own: boolean; unit: number | null; row?: PerfRow };
  const lines = $derived(products.flatMap((p) => [null, ...whs.map((x) => x.id)].map((wh): Line | null => {
    const row = landed.get(`${wh ?? ''}|${p.id}`);
    const own = (prices ?? []).some((x) => x.entityId === entityId && x.productId === p.id && (x.warehouseId ?? null) === wh);
    if (wh && !row && !own) return null;
    const unit = row?.landedPerUnit ?? (row && row.qtySold ? row.cogs / row.qtySold : null);
    return { productId: p.id, warehouseId: wh, price: sellingPriceFor(prices ?? [], entityId, wh, p.id, today), own, unit, row };
  }).filter((x): x is Line => !!x)));
  const f = queryFilters({ show: '' });
  const fig = $derived(priceTiles(lines, target / 100));
  const tiles = $derived<SummaryTile[]>([
    { key: 'missing', label: 'Missing prices', value: prices ? fig.missing : null, sub: 'no price in force', status: fig.missing ? 'warn' : undefined, statusLabel: fig.missing ? 'Set a price' : undefined, info: infoOf('pricesMissing') },
    { key: 'below', label: `Below ${target} % margin`, value: prices ? fig.below : null, sub: 'over landed cost', status: fig.below ? 'bad' : undefined, statusLabel: fig.below ? 'Review' : undefined, info: infoOf('pricesBelow') },
  ]);
  let defaulted = false;
  $effect(() => { if (defaulted || !prices || !landed.size) return; defaulted = true; if (readQuery('show') || readQuery('product')) return; if (fig.missing) f.set('show', 'missing'); else if (fig.below) f.set('show', 'below'); });
  const shownLines = $derived(lines.filter((l) => !f.values.show || (f.values.show === 'missing' ? fig.isMissing(l) : fig.isBelow(l))));
  const status = (m: number | null) => (m === null ? 'none' : m >= target / 100 ? 'good' : m >= 0 ? 'warn' : 'bad');

  // set a price
  let form = $state<{ productId: string; warehouseId: string; price: number | null; from: string; note: string } | null>(null);
  let err = $state(''); let busy = $state(false);
  $effect(() => { const pid = router.query.get('product'); if (pid && !form && lookup.product(pid)) form = { productId: pid, warehouseId: '', price: null, from: today, note: '' }; });
  function open(l: Line, suggest = false) { form = { productId: l.productId, warehouseId: l.warehouseId ?? '', price: suggest && l.unit !== null ? priceForMargin(l.unit, target / 100) : l.price, from: today, note: suggest ? `Target margin ${target} %` : '' }; err = ''; }
  async function save() {
    if (!form) return;
    const input = { entityId, productId: form.productId, warehouseId: form.warehouseId || null, price: Number(form.price), from: form.from, note: form.note || undefined };
    const p = validateSellingPrice(input, { productIds: ref().products.map((x) => x.id), warehouseIds: whs.map((x) => x.id) }); if (p.length) { err = p.join(' · '); return; }
    busy = true; err = await attempt(() => pricing.set(input)); busy = false;
    if (!err) { say('Selling price saved'); form = null; }
  }
  const history = $derived(form ? (prices ?? []).filter((x) => x.entityId === entityId && x.productId === form!.productId) : []);
  const formUnit = $derived(form ? (lines.find((l) => l.productId === form!.productId && (l.warehouseId ?? '') === form!.warehouseId)?.unit ?? null) : null);
  const exportRows = () => [['Product', 'Warehouse', 'Selling price', 'Landed per case', 'Margin', `Price for ${target} %`], ...lines.map((l) => [lookup.product(l.productId)?.brand ?? l.productId, l.warehouseId ? lookup.warehouse(l.warehouseId)?.name ?? '' : 'All warehouses', l.price ?? '', l.unit === null ? '' : Math.round(l.unit * 100) / 100, l.price && l.unit !== null ? Math.round(marginAt(l.price, l.unit)! * 1000) / 10 : '', l.unit === null ? '' : priceForMargin(l.unit, target / 100) ?? ''])];
</script>

<PageHeader overline="Finance" title="Selling prices" description="The price per case of each product, company-wide or for one warehouse." analysis="business"
  info="New sales start from the price in force. A warehouse price wins over the company price. Landed cost per case is over the last 90 days; the helper proposes price = landed cost ÷ (1 − target margin).">
  {#snippet secondary()}<a class="btn btn-secondary" href="#/performance">Performance and margins</a>{/snippet}
</PageHeader>
<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Selling prices summary" />
<FilterBar bind:search={q} searchLabel="Product" placeholder="Brand, pack or SKU" active={f.values.show ? 1 : 0} onclear={() => { f.clear(); q = ''; }}>
  <label class="field"><span>Company</span><select class="select" bind:value={entityId}>{#each entities as e (e.id)}<option value={e.id}>{companyLabel(e.id)}</option>{/each}</select></label>
  <label class="field" style="min-width:120px"><span>Target margin %</span><input class="input num" type="number" min="0" max="90" bind:value={target} /></label>
  {#snippet end()}{#if prices}<span class="caption">{shownLines.length} of {lines.length} price lines</span>{/if}{/snippet}
</FilterBar>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if form}
  {@const p = lookup.product(form.productId)}
  <section class="card form-card" aria-label="Set a selling price">
    <h2 class="h4">{p?.brand} · {p?.pack} <span class="caption">{companyLabel(entityId)}</span></h2>
    <div class="form-grid">
      <label class="field"><span>Applies to</span><select class="select" bind:value={form.warehouseId}><option value="">All warehouses (company price)</option>{#each whs as x (x.id)}<option value={x.id}>{x.name} only</option>{/each}</select></label>
      <label class="field"><span>Price per case (USD)</span><input class="input num" type="number" min="0" step="0.01" bind:value={form.price} /></label>
      <label class="field"><span>Effective from</span><input class="input" type="date" bind:value={form.from} /></label>
      <label class="field"><span>Note</span><input class="input" bind:value={form.note} maxlength="300" /></label>
    </div>
    {#if formUnit !== null}
      <p class="small">Landed cost {fmtNum(formUnit, 2)} per case · margin at this price <strong>{form.price ? `${fmtNum((marginAt(Number(form.price), formUnit) ?? 0) * 100, 1)} %` : '—'}</strong> ·
        <button class="link" onclick={() => (form!.price = priceForMargin(formUnit!, target / 100))}>use the {target} % price ({fmtNum(priceForMargin(formUnit, target / 100) ?? 0, 2)})</button></p>
    {/if}
    {#if err}<p class="error small" role="alert">{err}</p>{/if}
    <div class="row"><button class="btn btn-primary" disabled={busy} onclick={save}>Save price</button><button class="btn btn-ghost" onclick={() => (form = null)}>Cancel</button></div>
    {#if history.length}
      <h3 class="small">History</h3>
      <table class="table"><thead><tr><th>From</th><th>Applies to</th><th class="num">Price</th><th>Note</th><th>Set by</th></tr></thead>
        <tbody>{#each history as h (h.id)}<tr><td>{fmtDate(h.from)}</td><td>{h.warehouseId ? lookup.warehouse(h.warehouseId)?.name : 'All warehouses'}</td><td class="num">{fmtNum(h.price, 2)}</td><td class="small">{h.note ?? ''}</td><td class="small">{lookup.user(h.byUserId)?.name ?? h.byUserId}</td></tr>{/each}</tbody></table>
    {/if}
  </section>
{/if}

<DashboardPanel span="full" title="Prices in force today" subtitle="{companyLabel(entityId)} · company price and warehouse prices" unit="USD per case" period="Landed cost: last 90 days"
  definition="Selling price in force today (a warehouse price wins over the company price). Margin = (price − landed cost per case) ÷ price. Price for target = landed cost ÷ (1 − target margin)." loading={!prices && !w.error} rows={exportRows} filename="selling-prices">
  <div class="table-wrap" style="max-height:620px">
    <table class="table">
      <thead><tr><th>Product</th><th>Applies to</th><th class="num">Selling price</th><th class="num">Landed per case</th><th class="num">Margin</th><th class="num">Price for {target} %</th><th></th></tr></thead>
      <tbody>
        {#each shownLines as l (`${l.productId}|${l.warehouseId}`)}
          {@const m = l.price !== null && l.unit !== null ? marginAt(l.price, l.unit) : null}
          <tr class:sub={!!l.warehouseId}>
            <td>{#if !l.warehouseId || f.values.show}<strong>{lookup.product(l.productId)?.brand}</strong> <span class="caption">{lookup.product(l.productId)?.pack}</span>{/if}</td>
            <td class="small">{l.warehouseId ? lookup.warehouse(l.warehouseId)?.name : 'All warehouses'}{#if l.warehouseId && !l.own}<span class="caption"> · company price</span>{/if}</td>
            <td class="num">{l.price === null ? '—' : fmtNum(l.price, 2)}</td>
            <td class="num">{l.unit === null ? '—' : fmtNum(l.unit, 2)}</td>
            <td class="num"><StatusBadge status={status(m)} label={m === null ? 'No data' : `${fmtNum(m * 100, 1)} %`} size={12} /></td>
            <td class="num">{l.unit === null ? '—' : fmtNum(priceForMargin(l.unit, target / 100) ?? 0, 2)}</td>
            <td class="nowrap"><button class="btn btn-ghost btn-sm" onclick={() => open(l)}>Set price</button>{#if l.unit !== null}<button class="btn btn-ghost btn-sm" onclick={() => open(l, true)}>Use {target} %</button>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</DashboardPanel>

<style>
  .form-card { margin-bottom: var(--space-4); display: grid; gap: var(--space-3); }
  .error { color: var(--danger); }
  .link { border: 0; background: none; color: var(--link); font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
  tr.sub td:first-child { border-top-color: transparent; }
  .nowrap { white-space: nowrap; }
</style>
