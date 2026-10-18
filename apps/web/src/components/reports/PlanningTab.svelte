<script lang="ts">
  import { destinationLabel } from '../../lib/planning';
  import { auth, lookup, reports, type PlanningReport, type ReportFilter } from '@btw/api';
  import { Badge, say } from '@btw/ui';
  import { BarChart, ChartCard, StatTile, compact, usd } from '../charts';
  import { watch, attempt } from '../../lib/load.svelte';
  import ErrorState from '../ErrorState.svelte';
  import { createDraftPlans } from './draft';
  import { day } from './fmt';
  let { filter }: { filter: ReportFilter } = $props();
  let horizon = $state(90);
  let r = $state<PlanningReport | null>(null);
  let busy = $state('');
  const w = watch(async () => { r = await reports.planning({ warehouseId: filter.warehouseId, productId: filter.productId, horizonDays: horizon }); }, () => [filter.warehouseId, filter.productId, horizon]);
  const canPlan = $derived(!!auth.me()?.roles.includes('planner'));
  const tone = { overdue: 'danger', 'this week': 'warning', soon: 'info' } as const;
  async function draft(items: PlanningReport['suggestions'], key: string) {
    busy = key;
    const err = await attempt(async () => { const refs = await createDraftPlans(items.map((s) => ({ supplierId: s.supplierId, productId: s.productId, warehouseId: s.warehouseId, trucks: s.trucks, capacity: Math.round(s.cases / s.trucks), routeIds: s.routeIds })), 'Replenishment (from planning report)'); say(`Draft ${refs.join(', ')} created — review and submit it`); });
    busy = ''; if (err) say(err);
  }
  const risky = $derived((r?.forecasts ?? []).filter((f) => f.daysToStockOut !== null && f.daysToStockOut <= horizon));
</script>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<div class="row between" style="margin-bottom:var(--space-3)">
  <p class="caption grow" style="max-width:80ch">{r?.method ?? ''}</p>
  <label class="field" style="min-width:150px"><span>Look ahead</span><select class="select" bind:value={horizon}><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option></select></label>
</div>
{#if !r}<div class="card"><div class="skeleton" style="height:120px"></div></div>
{:else}
  <div class="tiles">
    <StatTile label="Orders to place" value={String(r.suggestions.length)} hint="{r.suggestions.filter((s) => s.urgency !== 'soon').length} this week or overdue" />
    <StatTile label="Trucks suggested" value={String(r.suggestions.reduce((a, s) => a + s.trucks, 0))} hint="{compact(r.suggestions.reduce((a, s) => a + s.cases, 0))} cases" />
    <StatTile label="Estimated purchase" value={usd(r.suggestions.reduce((a, s) => a + s.estValue, 0))} hint="at current supplier prices" />
    <StatTile label="Stock-outs ahead" value={String(risky.length)} upIsGood={false} hint="within {horizon} days if nothing is ordered" />
  </div>

  <section class="card" style="margin-top:var(--space-4)">
    <header class="row between"><div><h3>Suggested orders</h3><p class="caption">Order by = stock-out date − lane lead time (actual median transit + 4 days to order and load) − 3 days safety.</p></div>
      {#if canPlan && r.suggestions.length}<button class="btn btn-primary" disabled={!!busy} onclick={() => draft(r!.suggestions, 'all')}>{busy === 'all' ? 'Creating…' : 'Create draft plans for all'}</button>{/if}</header>
    <ul class="sugg">
      {#each r.suggestions as s, i}
        <li>
          <Badge tone={tone[s.urgency]}>{s.urgency === 'overdue' ? 'Order now' : s.urgency === 'this week' ? 'This week' : 'Soon'}</Badge>
          <div class="grow"><div><b>{s.text}</b></div><div class="caption">{s.lane} · lead time {s.leadTimeDays} days · arrives by {day(s.arriveBy)} · ≈ {usd(s.estValue)}</div></div>
          {#if canPlan}<button class="btn btn-secondary btn-sm" disabled={!!busy} onclick={() => draft([s], String(i))}>{busy === String(i) ? 'Creating…' : 'Create draft plan'}</button>{/if}
        </li>
      {:else}<li class="empty">No orders needed in the next 4 weeks — stock and trucks on the road cover expected demand.</li>{/each}
    </ul>
    {#if !canPlan}<p class="caption">Planners can turn a suggestion into a draft plan with one click.</p>{/if}
  </section>

  <div class="charts-grid">
    <ChartCard title="Days until stock-out" subtitle="if nothing new is ordered (trucks on the road included)" filename="days-to-stockout" rows={() => [['Brand', 'Warehouse', 'Days to stock-out', 'Stock-out date'], ...risky.map((f) => [`${f.brand} ${f.pack}`, destinationLabel(f.warehouseId) ?? f.warehouseId, f.daysToStockOut ?? '', f.stockOutDate ? day(f.stockOutDate) : ''])]}>
      {#if risky.length}<BarChart label="Days until stock-out" horizontal categories={risky.map((f) => `${f.brand} · ${destinationLabel(f.warehouseId)}`)} series={[{ name: 'Days', values: risky.map((f) => f.daysToStockOut ?? 0), slot: 1 }]} format={(n) => `${n} d`} />{:else}<p class="empty">No stock-outs expected in {horizon} days.</p>{/if}
    </ChartCard>
    <ChartCard title="By supplier lane" filename="orders-by-lane" rows={() => [['Supplier', 'Lane', 'Trucks', 'Cases', 'First order by'], ...r!.byLane.map((l) => [l.supplier, l.lane, l.trucks, l.cases, day(l.firstOrderBy)])]}>
      <div class="table-wrap"><table class="table"><thead><tr><th>Supplier</th><th>Lane</th><th class="num">Trucks</th><th class="num">Cases</th><th>Order by</th></tr></thead>
        <tbody>{#each r.byLane as l}<tr><td>{l.supplier}</td><td class="small">{l.lane}</td><td class="num">{l.trucks}</td><td class="num">{compact(l.cases)}</td><td>{day(l.firstOrderBy)}</td></tr>{:else}<tr><td colspan="5" class="empty">Nothing to order.</td></tr>{/each}</tbody></table></div>
    </ChartCard>
    <ChartCard span={2} title="Demand forecast" subtitle="cases expected to sell, per brand and warehouse" filename="demand-forecast" rows={() => [['Brand', 'Pack', 'Warehouse', 'Per day now', 'Next 30 days', 'Next 60 days', 'Next 90 days', 'On hand', 'In transit', 'Stock-out', 'Lead time (days)'], ...r!.forecasts.map((f) => [f.brand, f.pack, destinationLabel(f.warehouseId) ?? '', f.perDay, f.next30, f.next60, f.next90, f.stock, f.inTransit, f.stockOutDate ? day(f.stockOutDate) : '', f.lane?.leadDays ?? ''])]}>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Brand</th><th>Warehouse</th><th class="num">Per day</th><th class="num">30 days</th><th class="num">60 days</th><th class="num">90 days</th><th class="num">On hand</th><th class="num">In transit</th><th>Runs out</th></tr></thead>
        <tbody>{#each r.forecasts as f}<tr><td>{f.brand} <span class="caption">{f.pack}</span></td><td>{destinationLabel(f.warehouseId)}</td><td class="num">{f.perDay}</td><td class="num">{compact(f.next30)}</td><td class="num">{compact(f.next60)}</td><td class="num">{compact(f.next90)}</td><td class="num">{compact(f.stock)}</td><td class="num">{f.inTransit ? compact(f.inTransit) : '—'}</td><td>{f.stockOutDate ? day(f.stockOutDate) : 'Not within 120 days'}</td></tr>{/each}</tbody>
      </table></div>
    </ChartCard>
  </div>
{/if}

<style>
  .sugg { list-style: none; margin: var(--space-3) 0 0; padding: 0; }
  .sugg li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
</style>
