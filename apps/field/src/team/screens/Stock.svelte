<script lang="ts">
  // Stock by warehouse with days-of-cover chips: low · ok · overstock (sales pace from the inventory report).
  import { untrack } from 'svelte';
  import type { StockRisk, User } from '@btw/api';
  import { reportsApi } from '../reports';
  import Search from '@lucide/svelte/icons/search';
  import WarehouseIcon from '@lucide/svelte/icons/warehouse';
  import { Res, onRefresh } from '../load.svelte';
  import { compact, num, usd } from '../fmt';
  import Chips from '../components/Chips.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { query }: { user: User; view: View; query: URLSearchParams } = $props();
  const r = new Res(async () => (await reportsApi()).inventory());
  $effect(() => r.live(60_000));
  $effect(() => onRefresh(() => r.reload()));

  type Band = 'low' | 'ok' | 'over';
  const band = (k: StockRisk): Band => (k === 'out' || k === 'stock-out risk' || k === 'low' ? 'low' : k === 'ok' ? 'ok' : 'over');
  const CHIP: Record<StockRisk, { text: string; tone: string }> = {
    out: { text: 'Out', tone: 'danger' }, 'stock-out risk': { text: 'Low', tone: 'danger' }, low: { text: 'Low', tone: 'warning' },
    ok: { text: 'OK', tone: 'success' }, overstock: { text: 'Overstock', tone: 'info' }, dead: { text: 'Not selling', tone: 'neutral' },
  };
  const f0 = untrack(() => query.get('f') ?? '');
  let f = $state(['low', 'ok', 'over'].includes(f0) ? f0 : 'all');
  let q = $state('');
  const rows = $derived((r.data?.rows ?? []).filter((x) => (f === 'all' || band(x.risk) === f) && (!q.trim() || `${x.brand} ${x.pack}`.toLowerCase().includes(q.trim().toLowerCase()))));
  const chips = $derived([
    { id: 'all', label: 'All', count: r.data?.rows.length },
    { id: 'low', label: 'Low', count: r.data?.rows.filter((x) => band(x.risk) === 'low').length },
    { id: 'ok', label: 'OK', count: r.data?.rows.filter((x) => band(x.risk) === 'ok').length },
    { id: 'over', label: 'Overstock', count: r.data?.rows.filter((x) => band(x.risk) === 'over').length },
  ]);
  const order: Record<Band, number> = { low: 0, ok: 1, over: 2 };
  const groups = $derived((r.data?.byWarehouse ?? []).map((w) => ({ w, rows: rows.filter((x) => x.warehouseId === w.warehouseId).sort((a, b) => order[band(a.risk)] - order[band(b.risk)] || (a.coverDays ?? 999) - (b.coverDays ?? 999)) })).filter((g) => g.rows.length));
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton kind="kpis" rows={2} /><Skeleton rows={6} />
{:else if r.data}
  <section class="t-split">
    <div class="t-card sum"><span class="t-meta">Stock value</span><strong>{usd(r.data.totalValue)}</strong><span class="t-meta">{compact(r.data.totalCases)} cases</span></div>
    <div class="t-card sum"><span class="t-meta">On the road</span><strong>{compact(r.data.inTransitCases)}</strong><span class="t-meta">cases · {usd(r.data.inTransitValue)}</span></div>
  </section>
  <label class="t-search"><Search size={20} /><input type="search" placeholder="Search brand" bind:value={q} aria-label="Search stock" /></label>
  <Chips options={chips} bind:value={f} label="Days of cover" />
  {#each groups as g (g.w.warehouseId)}
    <section class="t-card flush wh">
      <header class="t-row">
        <span class="t-icon"><WarehouseIcon size={22} /></span>
        <span class="grow"><strong>{g.w.name}</strong><span class="t-meta">{num(g.w.cases)} cases · {usd(g.w.value)}{g.w.coverDays != null ? ` · ${g.w.coverDays} days cover` : ''}</span></span>
        {#if g.w.risks}<span class="risk">{g.w.risks}</span>{/if}
      </header>
      <ul>
        {#each g.rows as x, i (`${x.productId}:${i}`)}
          <li>
            <span class="grow"><b>{x.brand}</b> <span class="t-meta">{x.pack}</span><br /><span class="t-meta">{num(x.closing)} cases{x.inTransit ? ` · ${num(x.inTransit)} coming` : ''}</span></span>
            <span class="cover"><span class="chip tone-{CHIP[x.risk].tone}">{CHIP[x.risk].text}</span><span class="t-meta">{x.coverDays == null ? '—' : `${x.coverDays} d`}</span></span>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <Empty title="Nothing here" text={q ? 'No brand matches your search.' : 'No stock in this band right now.'} />
  {/each}
{/if}

<style>
  .sum { display: flex; flex-direction: column; gap: 2px; }
  .sum strong { font: 800 24px/30px var(--ff-display); font-variant-numeric: tabular-nums; }
  .wh header { padding: 14px 16px; border-bottom: 1px solid var(--t-line); }
  .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  li .grow { display: block; }
  strong { font-size: 16px; }
  .risk { min-width: 26px; height: 26px; border-radius: 13px; background: var(--danger-subtle); color: var(--danger); font: 700 13px/26px var(--ff-body); text-align: center; padding: 0 8px; }
  ul { list-style: none; margin: 0; padding: 0 16px; }
  li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--t-line); }
  li:last-child { border-bottom: 0; }
  .cover { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
  .chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 13px; font: 700 13px var(--ff-body); }
</style>
