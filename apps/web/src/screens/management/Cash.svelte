<script lang="ts">
  // Management · Cash and closing on live data (V3-10 step 3d): money in and out from what we record (mgmt-cash), in the
  // report's look. Opening cash and transfers to the company account are not recorded yet: the net movement, not cash in hand.
  import { dashboards, type DashResult } from '@btw/api';
  import type { MgmtCash } from '@btw/api/dashboards';
  import GroupedBars from '../../components/charts/GroupedBars.svelte';
  import { compact } from '../../components/charts/scale';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import { destinationLabel } from '../../lib/planning';
  import ReportFilters, { reportFilters, apiFilter } from './ReportFilters.svelte';

  const f = reportFilters();
  let res = $state<DashResult | null>(null);
  const w = watch(async () => { res = (await dashboards.get(['mgmt-cash'], apiFilter(f))).results['mgmt-cash'] ?? null; }, () => [f.values.wh, f.values.p]);
  const d = $derived(res?.data as MgmtCash | undefined);
  const usd = (n: number | null | undefined) => (n == null ? '-' : `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`);
  const num = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));
  const whName = $derived(f.values.wh ? destinationLabel(f.values.wh) : 'Combined');
</script>

<section class="mrep" aria-labelledby="ca-h">
  <header><h1 id="ca-h">Cash and closing</h1><p class="muted">{whName} · {res?.period?.label ?? ''}</p></header>
  <ReportFilters {f} />
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if d}
    {@const k = d.kpis}
    <div class="kpis">
      <div class="card kpi"><span class="lbl">Cash received</span><b class="val">{usd(k.received)}</b><span class="sub">payments dated in the period</span></div>
      <div class="card kpi"><span class="lbl">Still to collect</span><b class="val">{usd(k.toCollect)}</b><span class="sub">from this period's sales</span></div>
      <div class="card kpi"><span class="lbl">Transport bills paid</span><b class="val">{usd(k.transportPaid)}</b><span class="sub">approved or paid</span></div>
      <div class="card kpi"><span class="lbl">Warehouse expenses</span><b class="val">{usd(k.warehouseBills)}</b><span class="sub">dated in the period</span></div>
      <div class="card kpi"><span class="lbl">Net cash movement</span><b class="val" class:neg={k.net < 0}>{usd(k.net)}</b><span class="sub">received − bills</span></div>
      <div class="card kpi"><span class="lbl">Cash in hand</span><b class="val" class:neg={(d.cash.inHand ?? 0) < 0}>{d.cash.inHand === null ? 'Not set yet' : usd(d.cash.inHand)}</b><span class="sub">{d.cash.inHand === null ? 'set cash at start on Warehouse expenses' : 'at the end of the period'}</span></div>
    </div>

    <div class="g2">
      <div class="card">
        <h3 class="ct">Statement for this period</h3>
        <table class="stmt">
          <tbody>
            {#each d.statement as x (x.label)}
              <tr class={x.kind}><td>{x.label}</td><td class="num">{#if x.kind === 'missing'}<a class="chip" href="#/warehouse-expenses?view=cash">Not set yet</a>{:else}{usd(x.value)}{/if}</td></tr>
            {/each}
          </tbody>
        </table>
        {#if d.cash.atStart === null}<p class="small muted">Cash in hand shows once the directors or accounts set the cash at start on Warehouse expenses → Cash.</p>
        {:else if d.cash.withOpening < d.cash.companies}<p class="small muted">{d.cash.withOpening} of {d.cash.companies} companies have their cash at start set; cash in hand covers those.</p>{/if}
      </div>
      <div class="card">
        <h3 class="ct">Opening and closing</h3>
        <div class="oc">
          <div><span class="lbl">Stock (cases)</span><b>{num(d.stock.opening)} → {num(d.stock.closing)}</b><span class="sub">+{num(d.stock.received)} received · −{num(d.stock.sold)} sold · {d.stock.other >= 0 ? '+' : '−'}{num(Math.abs(d.stock.other))} other</span></div>
          <div><span class="lbl">Client balances</span><b>{usd(d.clients.closing)}</b><span class="sub">{usd(d.clients.before)} still unpaid from before · {usd(d.clients.period)} from this period</span></div>
          <div><span class="lbl">Transport bills</span><b>{d.transport.owed === null ? 'not in your view' : `${usd(d.transport.owed)} owed`}</b><span class="sub">{usd(d.transport.paid)} paid this period</span></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="ct">Month by month (cash received − bills = net movement)</h3>
      <GroupedBars label="Cash received, bills and net movement by month" categories={d.byMonth.map((x) => x.month)} series={[{ name: 'Received', values: d.byMonth.map((x) => x.received) }, { name: 'Bills', values: d.byMonth.map((x) => x.bills) }, { name: 'Net', values: d.byMonth.map((x) => x.net) }]} format={(n) => `$${compact(n)}`} gaps={false} height={280} />
    </div>

    <div class="card">
      <h3 class="ct">By warehouse</h3>
      <table class="table">
        <thead><tr><th>Warehouse</th><th class="num">Received</th><th class="num">Bills</th><th class="num">Net</th></tr></thead>
        <tbody>
          {#each d.byWarehouse as x (x.warehouseId)}<tr><td>{x.label}</td><td class="num">{usd(x.received)}</td><td class="num">{usd(x.bills)}</td><td class="num" class:neg={x.net < 0}>{usd(x.net)}</td></tr>
          {:else}<tr><td colspan="4" class="muted">Nothing in this period.</td></tr>{/each}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3 class="ct">Cash sent to the company account<span class="chip">{usd(d.cash.transfers)} this period</span></h3>
      {#if d.transfers.length}
        <table class="table">
          <thead><tr><th>Date</th><th>Warehouse</th><th>Bank slip</th><th>By</th><th class="num">USD</th></tr></thead>
          <tbody>{#each d.transfers as x (x.id)}<tr><td>{x.date}</td><td>{x.warehouse}</td><td>{x.reference}</td><td>{x.by}</td><td class="num">{usd(x.amountUsd)}</td></tr>{/each}</tbody>
        </table>
      {:else}<p class="muted">No cash sent to the company account in this period. Warehouses record it on Warehouse expenses → Cash.</p>{/if}
    </div>
    <p class="caption">{res?.definition}</p>
  {:else}
    <div class="kpis">{#each Array(5) as _}<div class="card kpi"><div class="skeleton" style="height:64px"></div></div>{/each}</div>
  {/if}
</section>

<style>
  .mrep { display: flex; flex-direction: column; gap: 14px; }
  header h1 { font-size: 24px; line-height: 30px; } header p { margin: 2px 0 0; }
  .kpis { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); }
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 16px; }
  .kpi .lbl, .oc .lbl { font-size: 13px; color: var(--text-muted); }
  .kpi .val { font: 800 25px/1.25 var(--ff-display); font-variant-numeric: tabular-nums; margin: 2px 0 3px; }
  .kpi .sub, .oc .sub { font-size: 12.5px; color: var(--text-muted); }
  .neg { color: var(--danger); }
  .g2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .ct { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; }
  .chip { display: inline-flex; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--surface-sunken); color: var(--text-muted); }
  .stmt { width: 100%; border-collapse: collapse; font-size: 14px; }
  .stmt td { padding: 8px 0; border-top: 1px solid var(--border); }
  .stmt tr:first-child td { border-top: 0; }
  .stmt td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .stmt tr.out td.num { color: var(--danger); }
  .stmt tr.total td { font-weight: 800; border-top: 2px solid var(--text); }
  .stmt tr.missing td:first-child { color: var(--text-muted); }
  .oc { display: flex; flex-direction: column; gap: 14px; }
  .oc > div { display: flex; flex-direction: column; gap: 2px; }
  .oc b { font: 700 18px/1.3 var(--ff-display); font-variant-numeric: tabular-nums; }
</style>
