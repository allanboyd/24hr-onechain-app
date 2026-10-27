<script lang="ts">
  // Plan a future period (demand → gap after what is already planned → trucks per lane) or check a past one (what was not captured).
  import { auth, reports, type CaptureCheck, type PeriodForecast, type PeriodPreset } from '@btw/api';
  import { Badge, say } from '@btw/ui';
  import { BarChart, ChartCard, Gauge, Meter, StatTile, compact, usd } from '../charts';
  import { watch, attempt } from '../../lib/load.svelte';
  import ErrorState from '../ErrorState.svelte';
  import ReportFilters from './ReportFilters.svelte';
  import { toFilter } from './filter';
  import { openPrefilledPos } from './draft';
  import { day, dayLong, pct } from './fmt';
  import { untrack } from 'svelte';
  let { mode = $bindable('plan'), wh = '', canCheck = true }: { mode?: 'plan' | 'check'; wh?: string; /** the capture check needs the Reports feature */ canCheck?: boolean } = $props();
  let planPreset = $state<PeriodPreset | 'custom'>('next-60'), planFrom = $state(''), planTo = $state(''), planWh = $state(untrack(() => wh)), planProd = $state('');
  let chkPreset = $state<PeriodPreset | 'custom'>('last-quarter'), chkFrom = $state(''), chkTo = $state(''), chkWh = $state(untrack(() => wh));
  let plan = $state<PeriodForecast | null>(null);
  let check = $state<CaptureCheck | null>(null);
  let area = $state(''); let sev = $state('');
  let busy = $state(false);
  const w = watch(async () => {
    if (mode === 'plan') { if (planFrom) plan = await reports.periodPlan(toFilter({ from: planFrom, to: planTo, wh: planWh, prod: planProd })); }
    else if (chkFrom) check = await reports.captureCheck(toFilter({ from: chkFrom, to: chkTo, wh: chkWh }));
  }, () => [mode, planFrom, planTo, planWh, planProd, chkFrom, chkTo, chkWh]);
  const canPlan = $derived(!!auth.me()?.roles.includes('planner'));
  async function draft() {
    if (!plan) return; busy = true;
    const err = await attempt(async () => {
      const n = await openPrefilledPos(plan!.rows.filter((r) => r.gapTrucks && r.supplierId).map((r) => ({ supplierId: r.supplierId!, productId: r.productId, warehouseId: r.warehouseId, trucks: r.gapTrucks, capacity: r.capacity, routeIds: r.routeIds })), `Plan for ${day(plan!.range.from)} – ${day(new Date(Date.parse(plan!.range.to) - 1).toISOString())}`);
      say(`${n} purchase order${n === 1 ? '' : 's'} prefilled from the period plan — check the lines and create`);
    });
    busy = false; if (err) say(err);
  }
  const shown = $derived((check?.issues ?? []).filter((i) => (!area || i.area === area) && (!sev || i.severity === sev)));
  const sevTone = { high: 'danger', medium: 'warning', low: 'neutral' } as const;
  const scoreTone = (s: number) => (s >= 0.95 ? 'success' : s >= 0.8 ? 'warning' : 'danger') as 'success' | 'warning' | 'danger';
</script>

<div class="modes" role="tablist" aria-label="Period mode">
  <!-- radio-style cards: the chosen one is filled, ticked and labelled "Selected" so it can't be missed -->
  <button role="tab" class="sel-card" aria-selected={mode === 'plan'} onclick={() => (mode = 'plan')}>
    <i class="sel-mark" aria-hidden="true"></i><span class="txt"><b class="sel-title">Plan a period</b><span>What will we need, and is it already planned?</span></span>{#if mode === 'plan'}<span class="sel-tag">Selected</span>{/if}
  </button>
  {#if canCheck}<button role="tab" class="sel-card" aria-selected={mode === 'check'} onclick={() => (mode = 'check')}>
    <i class="sel-mark" aria-hidden="true"></i><span class="txt"><b class="sel-title">Check a period</b><span>Was everything captured properly?</span></span>{#if mode === 'check'}<span class="sel-tag">Selected</span>{/if}
  </button>{/if}
</div>

{#if mode === 'plan'}
  <ReportFilters bind:preset={planPreset} bind:from={planFrom} bind:to={planTo} bind:wh={planWh} bind:prod={planProd} presets={['next-30', 'next-60', 'next-90', 'next-quarter', 'custom']} />
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if !plan}<div class="card" style="margin-top:var(--space-4)"><div class="skeleton" style="height:120px"></div></div>
  {:else}
    <p class="caption" style="margin:var(--space-3) 0">{dayLong(plan.range.from)} – {dayLong(new Date(Date.parse(plan.range.to) - 1).toISOString())} · {plan.days} days. {plan.method}</p>
    <div class="tiles">
      <StatTile label="Expected demand" value="{compact(plan.totals.demand)} cases" hint="forecast for the period" />
      <StatTile label="Already planned" value="{compact(plan.totals.plannedCases)} cases" hint="{plan.alreadyPlanned.length} plan{plan.alreadyPlanned.length === 1 ? '' : 's'} arriving in the period" />
      <StatTile label="Still to order" value="{plan.totals.gapTrucks} trucks" upIsGood={false} hint="{compact(plan.totals.gapCases)} cases short of 14 days' closing cover" />
      <StatTile label="Budget for the gap" value={usd(plan.totals.estLanding)} hint="purchase {usd(plan.totals.estPurchase)} · transport ≈ {usd(plan.totals.budgetTransport)}" />
    </div>
    <section class="card" style="margin-top:var(--space-4)">
      <header class="row between"><div><h3>What still needs ordering</h3><p class="caption">After stock on hand, trucks on the road and plans already made.</p></div>
        {#if canPlan && plan.totals.gapTrucks}<button class="btn btn-primary" disabled={busy} onclick={draft}>{busy ? 'Opening…' : 'Order the gap (prefill purchase orders)'}</button>{/if}</header>
      <ul class="gap">{#each plan.byLane as l}<li><Badge tone={l.orderBy && Date.parse(l.orderBy) - Date.now() < 7 * 864e5 ? 'warning' : 'info'}>Order by {l.orderBy ? day(l.orderBy) : '—'}</Badge><span class="grow">{l.text}</span><span class="caption">{l.lane}</span></li>
        {:else}<li class="empty">Nothing extra to order: what is in stock, on the road and already planned covers this period.</li>{/each}</ul>
      {#if !canPlan && plan.totals.gapTrucks}<p class="caption">A planner can turn this into purchase orders with one click.</p>{/if}
    </section>
    <div class="charts-grid">
      <ChartCard title="Supply vs demand by brand" subtitle="cases for the period" filename="period-supply-demand" rows={() => [['Brand', 'Warehouse', 'Demand', 'Start stock', 'Arriving', 'Already planned', 'Gap (cases)', 'Gap (trucks)'], ...plan!.rows.map((r) => [`${r.brand} ${r.pack}`, r.warehouse, r.demand, r.startStock, r.arriving, r.alreadyPlanned, r.gapCases, r.gapTrucks])]}>
        <BarChart label="Supply and demand by brand and warehouse" horizontal stacked categories={plan.rows.map((r) => `${r.brand.replace(/^Brand /, '')} · ${r.warehouse.split(' ').at(-1)}`)}
          series={[{ name: 'Start stock', values: plan.rows.map((r) => r.startStock), slot: 8 }, { name: 'Arriving', values: plan.rows.map((r) => r.arriving), slot: 0 }, { name: 'Already planned', values: plan.rows.map((r) => r.alreadyPlanned), slot: 2 }, { name: 'Still to order', values: plan.rows.map((r) => r.gapCases), slot: 1 }]} />
      </ChartCard>
      <section class="card">
        <h3>Already planned for this period</h3>
        <ul class="gap">{#each plan.alreadyPlanned as p}<li><a href="#/plans/{p.planId}" class="mono" title="Opens the purchase order">{p.ref}</a><Badge status={p.status} /><span class="grow">{p.supplier} · {p.trucks} truck{p.trucks > 1 ? 's' : ''} · {compact(p.cases)} cases</span><span class="caption">arrives ≈ {day(p.arriveBy)}</span></li>
          {:else}<li class="empty">No plans or POs arrive in this period yet.</li>{/each}</ul>
      </section>
      <ChartCard span={2} title="Plan by brand and warehouse" filename="period-plan" rows={() => [['Brand', 'Pack', 'Warehouse', 'Supplier', 'Lane', 'Demand', 'Start stock', 'Arriving', 'Already planned', 'Projected closing', 'Stock-out', 'Required', 'Gap', 'Trucks', 'Order by', 'Purchase (USD)', 'Landing (USD)'], ...plan!.rows.map((r) => [r.brand, r.pack, r.warehouse, r.supplier, r.lane, r.demand, r.startStock, r.arriving, r.alreadyPlanned, r.projectedClosing, r.stockOutDate ? day(r.stockOutDate) : '', r.requiredCases, r.gapCases, r.gapTrucks, r.orderBy ? day(r.orderBy) : '', r.estPurchase, r.estLanding])]}>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Brand</th><th>Warehouse</th><th class="num">Demand</th><th class="num">Start</th><th class="num">Arriving</th><th class="num">Planned</th><th>Stock-out</th><th class="num">Gap</th><th class="num">Trucks</th><th>Order by</th></tr></thead>
          <tbody>{#each plan.rows as r}<tr class:hot={r.gapTrucks > 0}><td>{r.brand} <span class="caption">{r.pack}</span></td><td>{r.warehouse}</td><td class="num">{compact(r.demand)}</td><td class="num">{compact(r.startStock)}</td><td class="num">{r.arriving ? compact(r.arriving) : '—'}</td><td class="num">{r.alreadyPlanned ? compact(r.alreadyPlanned) : '—'}</td><td>{r.stockOutDate ? day(r.stockOutDate) : '—'}</td><td class="num">{r.gapCases ? compact(r.gapCases) : '—'}</td><td class="num"><b>{r.gapTrucks || '—'}</b></td><td>{r.orderBy ? day(r.orderBy) : '—'}</td></tr>{/each}</tbody>
        </table></div>
      </ChartCard>
    </div>
  {/if}
{:else}
  <ReportFilters bind:preset={chkPreset} bind:from={chkFrom} bind:to={chkTo} bind:wh={chkWh} showBrand={false} presets={['last-30', 'last-month', 'last-90', 'last-quarter', 'this-quarter', 'ytd', 'custom']} />
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if !check}<div class="card" style="margin-top:var(--space-4)"><div class="skeleton" style="height:120px"></div></div>
  {:else}
    <div class="charts-grid">
      <section class="card score">
        <h3>Completeness</h3>
        <Gauge label="Overall completeness" value={check.score} tone={scoreTone(check.score)} target={0.95} />
        <p class="caption">{check.issues.length} item{check.issues.length === 1 ? '' : 's'} to fix · {check.issues.filter((i) => i.severity === 'high').length} high priority · {dayLong(check.range.from)} – {dayLong(new Date(Date.parse(check.range.to) - 1).toISOString())}</p>
      </section>
      <section class="card">
        <h3>By area</h3>
        <div class="stack-sm" style="margin-top:var(--space-2)">
          {#each check.areas.filter((a) => a.checked) as a}
            <button class="arow sel-row" class:on={area === a.area} aria-pressed={area === a.area} onclick={() => (area = area === a.area ? '' : a.area)} title="Show only {a.area}">
              <Meter label="{a.area} · {a.issues} of {a.checked}" value={a.score} max={1} target={0.95} format={(n) => pct(n)} tone={scoreTone(a.score)} />
            </button>
          {/each}
        </div>
      </section>
      <ChartCard span={2} title="What was missed" subtitle="click a bar to filter the list" filename="capture-issues" rows={() => [['Issue', 'Area', 'Severity', 'Count'], ...check!.kinds.map((k) => [k.kind, k.area, k.severity, k.count])]}>
        {#if check.kinds.length}<BarChart label="Capture issues by kind" horizontal categories={check.kinds.map((k) => k.kind)} series={[{ name: 'Items', values: check.kinds.map((k) => k.count), slot: 1 }]} onselect={(c) => { const k = check!.kinds.find((x) => x.kind === c); if (k) { area = k.area; sev = ''; } }} />
        {:else}<p class="empty">Everything in this period was captured.</p>{/if}
      </ChartCard>
    </div>
    <section class="card" style="margin-top:var(--space-4)">
      <header class="row between"><h3>Items to fix {#if area}<span class="caption">· {area} <button class="btn btn-ghost btn-sm" onclick={() => (area = '')}>show all</button></span>{/if}</h3>
        <label class="field" style="min-width:140px"><span>Priority</span><select class="select" bind:value={sev}><option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Priority</th><th>Area</th><th>What</th><th>Date</th><th></th></tr></thead>
        <tbody>{#each shown as i (i.id)}<tr><td><Badge tone={sevTone[i.severity]}>{i.severity === 'high' ? 'High' : i.severity === 'medium' ? 'Medium' : 'Low'}</Badge></td><td class="small">{i.area}</td><td>{i.text}</td><td class="small">{day(i.at)}</td><td><a class="btn btn-ghost btn-sm" href={i.link}>Fix</a></td></tr>
          {:else}<tr><td colspan="5" class="empty">Nothing to fix here.</td></tr>{/each}</tbody>
      </table></div>
    </section>
  {/if}
{/if}

<style>
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4); }
  /* radio-cards: look and chosen state from base.css .sel-card (Selection states) */
  .modes .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .modes .txt span { font-size: var(--fs-body-sm); }
  .gap { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
  .gap li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
  .arow { all: unset; cursor: pointer; display: block; border-radius: var(--radius-sm); padding: 2px 4px; }
  .arow:focus-visible { outline: 2px solid var(--focus-ring); }
  tr.hot td { background: var(--accent-subtle); }
  .score { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
  @media (max-width: 600px) { .modes { grid-template-columns: 1fr; } }
</style>
