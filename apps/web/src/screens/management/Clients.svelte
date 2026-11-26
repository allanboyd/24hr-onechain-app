<script lang="ts">
  // Management · Sales and clients on live data (V3-10 step 3): the Today view's sales and owed figures (mgmt-clients),
  // in the report's look. Per-client credit terms are not recorded yet (one 14-day rule for every client until they are).
  import { dashboards, type DashResult } from '@btw/api';
  import type { MgmtClients } from '@btw/api/dashboards';
  import { fmtDate } from '@btw/ui';
  import { DataTable, ts, type Column } from '../../components/page';
  import { Donut } from '../../components/charts';
  import GroupedBars from '../../components/charts/GroupedBars.svelte';
  import { compact } from '../../components/charts/scale';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import { destinationLabel } from '../../lib/planning';
  import ReportFilters, { reportFilters, apiFilter } from './ReportFilters.svelte';

  const f = reportFilters();
  let res = $state<DashResult | null>(null);
  const w = watch(async () => { res = (await dashboards.get(['mgmt-clients'], apiFilter(f))).results['mgmt-clients'] ?? null; }, () => [f.values.wh, f.values.p]);
  const d = $derived(res?.data as MgmtClients | undefined);
  const usd = (n: number | null | undefined) => (n == null ? '-' : `$${Math.round(n).toLocaleString('en-US')}`);
  const num = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('en-US'));
  const whName = $derived(f.values.wh ? destinationLabel(f.values.wh) : 'Combined');
  type R = MgmtClients['records'][number];
  const columns: Column<R>[] = [
    { key: 'ref', label: 'Sale No.', sticky: true, value: (r) => r.ref, class: 'mono small nowrap', mobile: 'title' },
    { key: 'at', label: 'Date', sortValue: (r) => ts(r.at), value: (r) => fmtDate(r.at), csv: (r) => r.at.slice(0, 10), class: 'small nowrap' },
    { key: 'customer', label: 'Client', value: (r) => r.customer, filter: 'select' },
    { key: 'wh', label: 'Warehouse', value: (r) => destinationLabel(r.warehouseId), filter: 'select', filterValue: (r) => r.warehouseId, filterLabel: (id) => destinationLabel(id), hideBelow: 900 },
    { key: 'kind', label: 'Type', value: (r) => r.kind, filter: 'select' },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (r) => r.amount, value: (r) => usd(r.amount), csv: (r) => r.amount, total: (l) => usd(l.reduce((a, r) => a + r.amount, 0)) },
    { key: 'paid', label: 'Paid', align: 'right', sortValue: (r) => r.paid, value: (r) => usd(r.paid), csv: (r) => r.paid, total: (l) => usd(l.reduce((a, r) => a + r.paid, 0)) },
    { key: 'balance', label: 'Balance', align: 'right', filter: 'range', sortValue: (r) => r.balance, value: (r) => usd(r.balance), csv: (r) => r.balance, total: (l) => usd(l.reduce((a, r) => a + r.balance, 0)) },
    { key: 'status', label: 'Payment', value: (r) => r.status, cell: statusCell, filter: 'select', mobile: 'aside' },
  ];
  let search = $state(''), filters = $state({});
</script>

<section class="mrep" aria-labelledby="cl-h">
  <header><h1 id="cl-h">Sales and clients</h1><p class="muted">{whName} · {res?.period?.label ?? ''}</p></header>
  <ReportFilters {f} />
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if d}
    {@const k = d.kpis}
    <div class="kpis">
      <div class="card kpi"><span class="lbl">Sales</span><b class="val">{usd(k.sales)}</b><span class="sub">in this period</span></div>
      <div class="card kpi"><span class="lbl">Purchases</span><b class="val">{num(k.purchases)}</b><span class="sub">sales recorded</span></div>
      <div class="card kpi"><span class="lbl">Clients</span><b class="val">{num(k.clients)}</b><span class="sub">who bought</span></div>
      <div class="card kpi"><span class="lbl">Owed by clients</span><b class="val">{usd(k.owed)}</b><span class="sub">all unpaid sales, now</span></div>
      <div class="card kpi"><span class="lbl">Overdue</span><b class="val">{usd(k.overdue)}</b><span class="sub">over {d.terms} days</span></div>
    </div>

    <div class="g2">
      <div class="card">
        <h3 class="ct">Clients from most to least frequent<span class="chip">Total {usd(k.sales)} · {num(k.purchases)} purchases</span></h3>
        {#if d.clients.length}
          {@const max = Math.max(...d.clients.map((x) => x.purchases))}
          <ol class="rank">
            {#each d.clients.slice(0, 12) as x (x.customer)}
              <li><span class="nm">{x.customer}</span><span class="bar"><i style:width="{(x.purchases / max) * 100}%"></i></span><span class="n">{x.purchases}</span><span class="v">{usd(x.total)}</span></li>
            {/each}
          </ol>
        {:else}<p class="muted">No sales in this period.</p>{/if}
      </div>
      <div class="card">
        <h3 class="ct">How clients pay<span class="chip">Total {usd(k.sales)}</span></h3>
        {#if d.pay.length}<Donut label="Sales by payment type" data={d.pay.map((x) => ({ label: x.kind, value: x.total }))} format={(n) => `$${compact(n)}`} center={usd(k.sales)} height={240} />
        {:else}<p class="muted">No sales in this period.</p>{/if}
      </div>
    </div>

    <div class="g2">
      <div class="card">
        <h3 class="ct">Client balances: within the credit time vs overdue<span class="chip">Total {usd(k.owed)}</span></h3>
        {#if d.balances.top.length}<GroupedBars label="Client balances within the credit time and overdue" categories={d.balances.top.slice(0, 8).map((x) => x.customer)} series={[{ name: `Within ${d.terms} days`, values: d.balances.top.slice(0, 8).map((x) => x.within) }, { name: 'Overdue', values: d.balances.top.slice(0, 8).map((x) => x.overdue) }]} format={(n) => `$${compact(n)}`} gaps={false} height={260} />
        {:else}<p class="muted">Nobody owes us.</p>{/if}
      </div>
      <div class="card">
        <h3 class="ct">Client credit terms<a class="small" href="#/sales?view=clients">Set on Sales → Clients</a></h3>
        <p class="muted small">Each client has its own credit days ({d.terms} unless set). A sale is overdue after the days it was made with.</p>
        {#if d.termsMix.length}
          <table class="table"><thead><tr><th>Credit days</th><th class="num">Clients owing</th><th class="num">Owed</th><th class="num">Overdue</th></tr></thead>
            <tbody>{#each d.termsMix as x (x.days)}<tr><td>{x.days === 0 ? 'Pay at once' : `${x.days} days`}</td><td class="num">{x.clients}</td><td class="num">{usd(x.owed)}</td><td class="num" class:bad={x.overdue > 0}>{usd(x.overdue)}</td></tr>{/each}</tbody>
          </table>
        {:else}<p class="muted">No client owes anything.</p>{/if}
      </div>
    </div>

    <div class="card">
      <h3 class="ct">Sales records with client names, amount paid and balance</h3>
      <DataTable id="mgmt-sales-records" label="Sales records" noun="sales" rows={d.records} {columns} rowKey={(r) => r.id} initialSort={{ key: 'at', dir: 'desc' }} filename="sales-records"
        searchable searchPlaceholder="Client, sale No., warehouse…" bind:search bind:filters maxHeight="480px" />
    </div>
    <p class="caption">{res?.definition}</p>
  {:else}
    <div class="kpis">{#each Array(5) as _}<div class="card kpi"><div class="skeleton" style="height:64px"></div></div>{/each}</div>
  {/if}
</section>

{#snippet statusCell(r: R)}<span class="chip {r.status === 'Paid' ? 'good' : r.status === 'Unpaid' ? 'bad' : 'warn'}">{r.status}</span>{/snippet}

<style>
  .mrep { display: flex; flex-direction: column; gap: 14px; }
  header h1 { font-size: 24px; line-height: 30px; } header p { margin: 2px 0 0; }
  .kpis { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); }
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 16px; }
  .kpi .lbl { font-size: 13px; color: var(--text-muted); }
  .kpi .val { font: 800 25px/1.25 var(--ff-display); font-variant-numeric: tabular-nums; margin: 2px 0 3px; }
  .kpi .sub { font-size: 12.5px; color: var(--text-muted); }
  .g2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .ct { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; }
  .chip { display: inline-flex; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--surface-sunken); color: var(--text-muted); }
  .chip.good { background: var(--success-subtle); color: var(--success); }
  .chip.bad { background: var(--danger-subtle); color: var(--danger); }
  .chip.warn { background: var(--warning-subtle); color: var(--warning); }
  .rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .rank li { display: grid; grid-template-columns: minmax(0, 1.4fr) 1fr 36px 90px; align-items: center; gap: 10px; font-size: 14px; }
  .rank .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rank .bar { height: 8px; border-radius: 8px; background: var(--surface-sunken); overflow: hidden; }
  .rank .bar i { display: block; height: 100%; border-radius: 8px; background: var(--primary); }
  .rank .n, .rank .v { text-align: right; font-variant-numeric: tabular-nums; }
  .rank .v { color: var(--text-muted); }
</style>
