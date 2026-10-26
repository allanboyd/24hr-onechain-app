<script lang="ts">
  // Planned vs actual (§8.14 PV-01..PV-07, §10.1): measures, flags, monthly running totals with a "today" marker,
  // plan used per brand, and a line table drilling down to the purchase orders.
  import { lookup, ref, type User } from '@btw/api';
  import { Badge, fmtDate, fmtNum, say } from '@btw/ui';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { ChartCard, Meter, PlotlyChart, StatTile, BarChart, baseLayout, pct, alpha, type Theme } from '../charts';
  import ErrorState from '../ErrorState.svelte';
  import CompanyMark from '../CompanyMark.svelte';
  import { watch } from '../../lib/load.svelte';
  import { isGroup } from '../../lib/company.svelte';
  import { companyLabel } from '../../lib/companies';
  import { destinationLabel, flagTone, monthLabel, onPlanningChange, periodFor, plannedVsActual, setPvThresholds, type PlannedVsActual, type PvFlag } from '../../lib/planning';
  let { user }: { user: User } = $props();

  const r = ref();
  const today = new Date().toISOString().slice(0, 10);
  type Preset = 'current' | 'quarter' | 'half' | 'year' | 'custom';
  // Default: the approved plans running today (the API picks their dates when none are sent).
  let preset = $state<Preset>('current');
  let from = $state(periodFor('quarter', today).from), to = $state(periodFor('quarter', today).to);
  let supplierId = $state(''), productId = $state('');
  let data = $state<PlannedVsActual | null>(null);
  let open = $state<Record<string, boolean>>({});
  let flagFilter = $state<PvFlag | ''>('');
  let behindPct = $state(85), overPct = $state(105), editTh = $state(false);

  const range = $derived(preset === 'current' ? { from: undefined, to: undefined } : preset === 'custom' ? { from, to } : periodFor(preset, today));
  const w = watch(async () => {
    data = await plannedVsActual({ from: range.from, to: range.to, supplierId: supplierId || undefined, productId: productId || undefined });
    behindPct = Math.round(data.thresholds.behind * 100); overPct = Math.round(data.thresholds.over * 100);
  }, () => [range.from, range.to, supplierId, productId]);
  $effect(() => onPlanningChange(() => w.retry()));

  const FLAGS: PvFlag[] = ['Behind plan', 'On track', 'Over plan', 'Unplanned'];
  const flagCount = (f: PvFlag) => (data?.lines ?? []).filter((l) => l.flag === f).length;
  const lines = $derived((data?.lines ?? []).filter((l) => !flagFilter || l.flag === flagFilter));
  const m = $derived(data?.measures);
  const products = $derived(supplierId ? r.products.filter((p) => p.supplierId === supplierId) : r.products);
  const brandName = (id: string) => { const p = lookup.product(id); return p ? `${p.brand} · ${p.pack}` : id; };
  const brandExpected = (pid: string) => (data?.lines ?? []).filter((l) => l.productId === pid).reduce((a, l) => a + l.expectedToDate, 0);
  const toneOf = (f: PvFlag) => (f === 'On track' ? 'success' : f === 'Behind plan' ? 'warning' : f === 'Over plan' ? 'danger' : 'accent') as 'success' | 'warning' | 'danger' | 'accent';
  const key = (l: { lineId: string | null; entityId: string; supplierId: string; productId: string }) => l.lineId ?? `u-${l.entityId}-${l.supplierId}-${l.productId}`;
  const entities = $derived(Object.entries(data?.byEntity ?? {}));
  const canEditTh = $derived(user.roles.includes('director')); // thresholds: directors (PUT settings/pv-thresholds)

  async function saveTh() {
    try { await setPvThresholds({ behind: behindPct / 100, over: overPct / 100 }); editTh = false; say('Thresholds saved — flags recalculated'); w.retry(); }
    catch (e) { say((e as Error).message); }
  }

  // Running totals by month (single axis: cases), "today" as a vertical marker.
  function runningSpec(t: Theme) {
    const ms = data?.months ?? [];
    const x = ms.map((k) => `${k.month}-15`);
    const cutoff = today.slice(0, 7);
    const actualX = ms.filter((k) => k.month <= cutoff).map((k) => `${k.month}-15`);
    const lay = baseLayout(t, { legend: true, height: 300 });
    lay.hovermode = 'x unified';
    lay.xaxis = { ...lay.xaxis, type: 'date', tickformat: '%b %Y', dtick: 'M1' };
    lay.yaxis = { ...lay.yaxis, rangemode: 'tozero', tickformat: '~s', title: { text: 'cases (running total)', font: { color: t.muted, size: 11 } } };
    lay.shapes = [{ type: 'line', xref: 'x', yref: 'paper', x0: today, x1: today, y0: 0, y1: 1, line: { color: t.text, width: 1.5, dash: 'dot' } }];
    lay.annotations = [{ xref: 'x', yref: 'paper', x: today, y: 1, yanchor: 'bottom', text: 'Today', showarrow: false, font: { color: t.text, size: 11 } }];
    return {
      data: [
        { type: 'scatter', mode: 'lines', name: 'Planned (running)', x, y: ms.map((k) => k.cumPlanned), line: { color: t.series[1], width: 2, dash: 'dash' }, hovertemplate: '%{y:,} cases<extra>Planned</extra>' },
        { type: 'scatter', mode: 'lines+markers', name: 'Ordered (running)', x: actualX, y: ms.filter((k) => k.month <= cutoff).map((k) => k.cumOrdered), line: { color: t.series[0], width: 2 }, marker: { size: 8, color: t.series[0], line: { color: t.surface, width: 2 } }, fill: 'tozeroy', fillcolor: alpha(t.series[0], 0.08), hovertemplate: '%{y:,} cases<extra>Ordered</extra>' },
      ],
      layout: lay,
    };
  }
</script>

<div class="fbar">
  <label class="field"><span>Period</span>
    <select class="select" bind:value={preset}><option value="current">Plans running today</option><option value="quarter">This quarter</option><option value="half">This half year</option><option value="year">This year</option><option value="custom">Custom</option></select></label>
  {#if preset === 'custom'}
    <label class="field"><span>From</span><input class="input" type="date" bind:value={from} /></label>
    <label class="field"><span>To</span><input class="input" type="date" bind:value={to} /></label>
  {/if}
  <label class="field"><span>Supplier</span><select class="select" bind:value={supplierId} onchange={() => (productId = '')}><option value="">All suppliers</option>{#each r.suppliers as s}<option value={s.id}>{s.code} — {s.city}</option>{/each}</select></label>
  <label class="field"><span>Brand</span><select class="select" bind:value={productId}><option value="">All brands</option>{#each products as p}<option value={p.id}>{p.brand} · {p.pack}</option>{/each}</select></label>
  {#if supplierId || productId}<button class="btn btn-ghost btn-sm" onclick={() => { supplierId = ''; productId = ''; }}>Clear filters</button>{/if}
</div>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if !data || !m}
  <div class="tiles">{#each Array(6) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
{:else}
  <p class="caption">{fmtDate(data.range.from)} – {fmtDate(data.range.to)} · ordered = cases on approved purchase orders · expected to date follows the monthly split (or evenly when none) · {isGroup() ? 'all companies' : companyLabel(data.lines[0]?.entityId)}</p>
  <div class="tiles six">
    <StatTile label="Planned" value={fmtNum(m.planned)} hint="cases in period plans" />
    <StatTile label="Ordered" value={fmtNum(m.ordered)} hint="cases on approved POs" />
    <StatTile label="Plan used" value={pct(m.usedPct / 100)} hint="ordered ÷ planned" />
    <StatTile label="Expected to date" value={fmtNum(m.expectedToDate)} hint={`as of ${fmtDate(data.today)}`} />
    <StatTile label="Variance" value={`${m.variance > 0 ? '+' : ''}${fmtNum(m.variance)}`} hint="ordered − planned (cases)" />
    <StatTile label="Remaining" value={fmtNum(m.remaining)} hint="cases still to order this period" />
  </div>

  <div class="flags" role="group" aria-label="Filter by flag">
    {#each FLAGS as f}
      <button class="flag" aria-pressed={flagFilter === f} onclick={() => (flagFilter = flagFilter === f ? '' : f)}><Badge tone={flagTone(f)}>{f}</Badge><strong class="num">{flagCount(f)}</strong></button>
    {/each}
    <span class="caption th">Behind &lt; {behindPct}% of expected · Over &gt; {overPct}% of plan
      {#if canEditTh && !editTh}<button class="btn btn-ghost btn-sm" onclick={() => (editTh = true)}>Change</button>{/if}</span>
  </div>
  {#if editTh}
    <div class="card thbox">
      <label class="field"><span>“Behind plan” below (% of expected to date)</span><input class="input num" type="number" min="50" max="99" bind:value={behindPct} /></label>
      <label class="field"><span>“Over plan” above (% of plan)</span><input class="input num" type="number" min="101" max="200" bind:value={overPct} /></label>
      <div class="row"><button class="btn btn-primary btn-sm" onclick={saveTh}>Save thresholds</button><button class="btn btn-ghost btn-sm" onclick={() => (editTh = false)}>Cancel</button></div>
    </div>
  {/if}

  <div class="charts-grid">
    <ChartCard title="Running total by month" subtitle="planned vs ordered, cases · dotted line = today" span={2}
      rows={() => [['Month', 'Planned', 'Ordered', 'Planned (running)', 'Ordered (running)'], ...data!.months.map((k) => [monthLabel(k.month), k.planned, k.ordered, k.cumPlanned, k.cumOrdered])]}>
      {#if data.months.length}<PlotlyChart label="Running total of planned and ordered cases by month" spec={runningSpec} height={300} filename="planned-vs-actual" />
      {:else}<p class="empty small">No period plan covers this period.</p>{/if}
    </ChartCard>
    <ChartCard title="Plan used by brand" subtitle="ordered · right figure and tick = expected by today" rows={() => [['Brand', 'Planned', 'Ordered', 'Used %', 'Flag'], ...data!.byBrand.map((b) => [brandName(b.productId), b.planned, b.ordered, Math.round(b.usedPct), b.flag])]}>
      <div class="meters">
        {#each data.byBrand as b (b.productId)}
          <div class="meter-row">
            <Meter label={brandName(b.productId)} value={b.ordered} max={Math.max(b.planned, b.ordered, 1)} target={brandExpected(b.productId)} format={(n) => fmtNum(n)} tone={toneOf(b.flag)} note={b.planned ? `${pct(b.usedPct / 100)} of ${fmtNum(b.planned)} planned` : 'not in the plan'} />
            <Badge tone={flagTone(b.flag)}>{b.flag}</Badge>
          </div>
        {:else}<p class="empty small">Nothing planned or ordered in this period.</p>{/each}
      </div>
    </ChartCard>
    {#if isGroup() && entities.length}
      <ChartCard title="By company" subtitle="planned vs ordered, cases" rows={() => [['Company', 'Planned', 'Ordered', 'Used %'], ...entities.map(([id, x]) => [companyLabel(id), x.planned, x.ordered, Math.round(x.usedPct)])]}>
        <BarChart label="Planned and ordered cases by company" categories={entities.map(([id]) => companyLabel(id))} series={[{ name: 'Planned', values: entities.map(([, x]) => x.planned), slot: 1 }, { name: 'Ordered', values: entities.map(([, x]) => x.ordered), slot: 0 }]} />
      </ChartCard>
    {/if}
  </div>

  <section class="card flush" style="margin-top:var(--space-4)">
    <header><div><h3>Plan lines</h3><div class="caption">Open a line to see the purchase orders that draw on it.</div></div>{#if flagFilter}<button class="btn btn-ghost btn-sm" onclick={() => (flagFilter = '')}>Show all flags</button>{/if}</header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th><span class="sr">Open</span></th>{#if isGroup()}<th>Company</th>{/if}<th>Plan</th><th>Supplier</th><th>Brand · Package</th><th>Destination</th><th class="num">Planned</th><th class="num">Expected to date</th><th class="num">Ordered</th><th class="num">Variance</th><th class="num">Remaining</th><th>Flag</th></tr></thead>
      <tbody>
        {#each lines as l (key(l))}
          <tr class="clickable" onclick={() => (open[key(l)] = !open[key(l)])}>
            <td><button class="btn btn-ghost btn-sm chev" class:on={open[key(l)]} aria-expanded={!!open[key(l)]} aria-label="Show purchase orders for {brandName(l.productId)}"><ChevronRight size={16} /></button></td>
            {#if isGroup()}<td><span class="row" style="gap:6px"><CompanyMark entityId={l.entityId} size={16} />{companyLabel(l.entityId)}</span></td>{/if}
            <td class="small nowrap">{#if l.planId}<a href="#/period-plans/{l.planId}" class="mono" onclick={(e) => e.stopPropagation()}>{l.planRef}</a>{:else}<span class="muted">none</span>{/if}</td>
            <td class="small">{lookup.supplier(l.supplierId)?.code}</td>
            <td>{brandName(l.productId)}</td>
            <td class="small">{l.destinationId ? destinationLabel(l.destinationId) : '—'}</td>
            <td class="num">{fmtNum(l.planned)}</td>
            <td class="num">{fmtNum(l.expectedToDate)}</td>
            <td class="num"><strong>{fmtNum(l.ordered)}</strong></td>
            <td class="num" class:neg={l.variance < 0}>{l.variance > 0 ? '+' : ''}{fmtNum(l.variance)}</td>
            <td class="num">{fmtNum(l.remaining)}</td>
            <td><Badge tone={flagTone(l.flag)}>{l.flag}</Badge></td>
          </tr>
          {#if open[key(l)]}
            <tr class="drill"><td></td><td colspan={isGroup() ? 11 : 10}>
              {#if l.pos.length}
                <ul class="pos">{#each l.pos as p (p.id)}<li><a class="mono" href="#/pos/{p.id}">{p.ref}</a><span class="caption">{fmtDate(p.date)}</span><span class="num">{fmtNum(p.cases)} cases</span></li>{/each}</ul>
              {:else}<span class="small muted">No approved purchase order for this line yet.</span>{/if}
            </td></tr>
          {/if}
        {:else}<tr><td colspan="12" class="empty">No plan lines match.</td></tr>{/each}
      </tbody>
    </table></div>
  </section>
{/if}

<style>
  .nowrap { white-space: nowrap; }
  .fbar { display: flex; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-4); }
  .six { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .flags { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: var(--space-4) 0; }
  .flag { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius-md); padding: 4px 10px; cursor: pointer; font: inherit; color: var(--text); }
  .flag[aria-pressed='true'] { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary); }
  .th { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-2); }
  .thbox { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; margin-bottom: var(--space-4); }
  .meters { display: flex; flex-direction: column; gap: var(--space-3); }
  .meter-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-3); align-items: end; }
  .chev :global(svg) { transition: transform var(--motion-fast); } .chev.on :global(svg) { transform: rotate(90deg); }
  .drill td { background: var(--surface-sunken); }
  .pos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  .pos li { display: flex; gap: var(--space-3); align-items: baseline; }
  .neg { color: var(--danger); font-weight: 600; }
</style>
