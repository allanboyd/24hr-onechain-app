<script lang="ts">
  // Dev gallery for the dashboard kit (workstream C step 1): every new chart in a DashboardPanel with realistic BTW sample data,
  // working export menus, and the loading / error / no-data / stale states. Dev and demo builds only (showDemoHelpers).
  import { say } from '@btw/ui';
  import { showDemoHelpers } from '../lib/mode';
  import { Heatmap } from '../components/charts';
  import {
    DashboardPanel, DashboardGrid, KpiScorecard, ExceptionList, Waterfall, StackedBarH, QuadrantScatter, Pareto, StageBars, GroupedBars, GapTable,
    AgeingBars, StockCoverBars, StockCoverBands, TriageMatrix, KanbanBoard, BoxPlot, StatusBadge, coverStatus, paretoRows, bandCounts, DEFAULT_BANDS,
    gapOf, gapText, STATUS, SEVERITY, type Kpi, type ExceptionItem, type KanbanCard, type CoverBand, type Severity,
  } from '../components/dashboard';
  import { compact } from '../components/charts/scale';
  import SunMoon from '@lucide/svelte/icons/sun-moon';

  const NOW = Date.now();
  const min = (m: number) => NOW - m * 60_000;
  const PERIOD = '1–25 Oct 2026';
  const usd = (n: number) => `USD ${compact(n)}`;
  const usd2 = (n: number) => `USD ${n.toFixed(2)}`;
  const cases = (n: number) => n.toLocaleString('en-US');
  const drill = (what: string) => say(`Drill-down → ${what}`);

  function toggleTheme() {
    const html = document.documentElement;
    const dark = html.getAttribute('data-theme') === 'dark' || (!html.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    html.setAttribute('data-theme', dark ? 'light' : 'dark');
    try { localStorage.setItem('btw-theme', dark ? 'light' : 'dark'); } catch { /* private mode */ }
  }

  // ── 1. KPI scorecard + exceptions ──
  const kpis: Kpi[] = [
    { label: 'Trucks in transit', value: 14, change: { value: 2, kind: 'abs', label: 'vs last week' }, trend: [9, 11, 10, 12, 13, 12, 14], note: '3 delayed', status: 'bad', onclick: () => drill('trucks in transit') },
    { label: 'Sales this month', value: 8_420_000, format: usd, change: { value: 0.082, label: 'vs prior month' }, trend: [6.1, 6.8, 7.2, 7.0, 7.8, 8.4], onclick: () => drill('sales') },
    { label: 'Gross margin', value: 27.4, format: (n) => `${n.toFixed(1)}%`, change: { value: -1.6, kind: 'pp', label: 'vs prior month' }, trend: [29.8, 29.1, 28.4, 29.0, 29.0, 27.4], onclick: () => drill('margin') },
    { label: 'Open alerts', value: 26, change: { value: 0.18, upIsGood: false, label: 'vs last week' }, trend: [18, 20, 19, 22, 22, 26], note: '8 high priority', status: 'warn', onclick: () => drill('alerts') },
    { label: 'Orders awaiting loading', value: 9, change: { value: -3, kind: 'abs', upIsGood: false, label: 'vs last week' }, trend: [12, 14, 11, 12, 9], onclick: () => drill('orders') },
    { label: 'Profit this month', value: null, change: { value: null }, note: 'Waiting for October sales from Yonas', status: 'none' },
  ];
  const exceptions: ExceptionItem[] = [
    { id: 'e1', severity: 'critical', title: 'KCX 412B stopped at Malaba for 31 h', detail: 'Nairobi → Goma · ETS Sabrina · Tusker Lager 24×330 ml', owner: 'Testfie', due: NOW - 6 * 3.6e6, status: 'Open', onclick: () => drill('truck KCX 412B') },
    { id: 'e2', severity: 'high', title: 'Shortage of 48 cases on PO-2026-0412', detail: 'Tusker Lager 24×330 ml · received at Goma', owner: 'Asie', due: NOW + 5 * 3.6e6, status: 'Awaiting review', onclick: () => drill('PO-2026-0412') },
    { id: 'e3', severity: 'high', title: 'Clearing fee USD 1,250 unpaid for over a month', detail: 'ETS Sabrina · ref CF-0931 · Katuna', owner: 'Daniel', due: NOW - 2 * 86_400_000, status: 'Unpaid', onclick: () => drill('fee CF-0931') },
    { id: 'e4', severity: 'medium', title: 'No update from KDA 220M for 9 h', detail: 'Kampala → Kigali · Joly · last at Katuna', owner: 'Testfie', due: NOW + 3 * 3.6e6, status: 'Open', onclick: () => drill('truck KDA 220M') },
    { id: 'e5', severity: 'medium', title: 'Re-export truck Kigali → Juba has no follow-up owner', detail: 'RAD 914C · Nimule border', owner: null, due: NOW + 26 * 3.6e6, status: 'Open' },
    { id: 'e6', severity: 'low', title: 'Juba warehouse: no expense entries this month', owner: 'Yonas', due: NOW + 6 * 86_400_000, status: 'Reminder sent' },
  ];
  const kpiRows = () => [['Measure', 'Value', 'Change', 'Change basis', 'Note'], ...kpis.map((k) => [k.label, k.value == null ? 'No data yet' : (k.format ?? String)(k.value), k.change?.value ?? '', k.change?.label ?? '', k.note ?? ''])];
  const excRows = () => [['Severity', 'Exception', 'Detail', 'Owner', 'Due', 'Status'], ...exceptions.map((e) => [SEVERITY[e.severity].label, e.title, e.detail ?? '', e.owner ?? 'Not assigned', e.due ? new Date(e.due).toLocaleString('en-GB') : '', e.status ?? ''])];

  // ── 2. Profit waterfall ──
  const wf = [
    { label: 'Sales', value: 8_420_000, kind: 'total' as const },
    { label: 'Goods cost', value: -4_910_000 },
    { label: 'Gross profit', kind: 'subtotal' as const },
    { label: 'Truck cost', value: -1_154_000 },
    { label: 'Warehouse expenses', value: -418_000 },
    { label: 'Other', value: -226_000 },
    { label: 'Profit', kind: 'total' as const },
  ];
  const wfRows = () => { let run = 0; return [['Step', 'Change (USD)', 'Running total (USD)'], ...wf.map((s) => { if (s.kind === 'total' || s.kind === 'subtotal') { run = s.value ?? run; return [s.label, '', run]; } run += s.value ?? 0; return [s.label, s.value ?? 0, run]; })]; };

  // ── 3. Landed cost per case ──
  const products = ['Tusker Lager 24×330 ml', 'Guinness 24×330 ml', 'Pilsner Lager 24×500 ml', 'White Cap 24×500 ml', 'Balozi 24×500 ml', 'Smirnoff Ice 24×300 ml'];
  const landed = { goods: [14.2, 18.6, 15.1, 15.8, 13.4, 21.9], truck: [3.1, 3.3, 3.9, 3.8, 3.7, 3.0], warehouse: [0.9, 1.0, 1.1, 1.1, 1.0, 0.8] };
  const landedRows = () => [['Product', 'Goods (USD/case)', 'Truck (USD/case)', 'Warehouse (USD/case)', 'Landed cost (USD/case)'], ...products.map((p, i) => [p, landed.goods[i], landed.truck[i], landed.warehouse[i], +(landed.goods[i] + landed.truck[i] + landed.warehouse[i]).toFixed(2)])];

  // ── 4. Fast & slow products ──
  const sku = [
    ['Tusker Lager 24×330 ml', 'Goma', 64, 12, 182_000], ['Guinness 24×330 ml', 'Goma', 41, 28, 96_000], ['Pilsner Lager 24×500 ml', 'Goma', 12, 71, 118_000],
    ['White Cap 24×500 ml', 'Kigali', 35, 33, 64_000], ['Balozi 24×500 ml', 'Kigali', 58, 9, 52_000], ['Smirnoff Ice 24×300 ml', 'Kigali', 8, 84, 74_000],
    ['Senator Keg 50 L', 'Juba', 22, 52, 41_000], ['Tusker Lite 24×330 ml', 'Juba', 18, 64, 39_000], ['Guinness 24×500 ml', 'Juba', 46, 21, 61_000],
    ['Tusker Malt 24×500 ml', 'Goma', 27, 38, 47_000], ['Bell Lager 24×500 ml', 'Kigali', 52, 18, 58_000],
  ] as const;
  const points = sku.map(([label, group, x, y, size]) => ({ label: `${label} · ${group}`, group, x, y, size }));
  const quadRows = () => [['Product', 'Warehouse', 'Sales speed (cases/day)', 'Days of stock', 'Stock value (USD)'], ...sku.map((s) => [s[0], s[1], s[2], s[3], s[4]])];

  // ── 5. Route × stop heatmap (existing kit) ──
  const hmRows = ['Nairobi → Goma', 'Kampala → Goma', 'Mombasa → Kigali', 'Kigali → Juba'];
  const hmCols = ['Malaba', 'Busia', 'Katuna', 'Rusumo', 'Nimule'];
  const hmVals: (number | null)[][] = [[2.4, null, 1.1, null, null], [null, 1.3, 1.8, null, null], [2.9, null, null, 1.6, null], [null, null, null, null, 3.4]];
  const hmTrips = [[18, 0, 18, 0, 0], [0, 7, 7, 0, 0], [9, 0, 0, 9, 0], [0, 0, 0, 0, 4]];
  const hmData = () => [['Route', 'Stop', 'Average days', 'Trips'], ...hmRows.flatMap((r, i) => hmCols.map((c, j) => (hmVals[i][j] == null ? null : [r, c, hmVals[i][j]!, hmTrips[i][j]])).filter((x): x is (string | number)[] => !!x))];

  // ── 6. PO pipeline ──
  let pair = $state('all');
  const pairs: Record<string, number> = { all: 1, 'BTW–KBL': 0.52, 'Nihna–UBL': 0.31, 'Kivu–SBL': 0.17 };
  const stages = $derived([
    { label: 'Planned', count: 42, value: 1_840_000 }, { label: 'Raised', count: 36, value: 1_610_000 }, { label: 'Loading', count: 24, value: 1_020_000 },
    { label: 'Dispatched', count: 21, value: 905_000 }, { label: 'Delivered', count: 17, value: 742_000 },
  ].map((s) => ({ ...s, count: Math.round(s.count * pairs[pair]), value: Math.round(s.value * pairs[pair]) })));
  const stageRows = () => [['Stage', 'Orders', 'Value (USD)', 'Drop from previous'], ...stages.map((s, i) => [s.label, s.count, s.value, i && stages[i - 1].count ? `${Math.round((1 - s.count / stages[i - 1].count) * 100)}%` : ''])];

  // ── 7. Ordered vs loaded vs delivered ──
  const poLines = ['PO-0412 Tusker', 'PO-0413 Guinness', 'PO-0415 Pilsner', 'PO-0418 White Cap', 'PO-0420 Balozi'];
  const qty = [
    { name: 'Ordered', values: [1200, 800, 1000, 600, 900] },
    { name: 'Loaded', values: [1200, 792, 1000, 560, 900] },
    { name: 'Delivered', values: [1152, 792, 1000, 548, 897] as (number | null)[] },
  ];
  const gapRows = () => [['PO line', 'Ordered (cases)', 'Loaded (cases)', 'Delivered (cases)', 'Loaded vs ordered', 'Delivered vs loaded'],
    ...poLines.map((p, i) => [p, qty[0].values[i] ?? '', qty[1].values[i] ?? '', qty[2].values[i] ?? '', gapText(gapOf(qty[0].values[i], qty[1].values[i])), gapText(gapOf(qty[1].values[i], qty[2].values[i])) ])];

  // ── 8. Delivery losses Pareto ──
  const causes = [
    { label: 'Broken bottles in transit', value: 182 }, { label: 'Short-loaded at KBL', value: 96 }, { label: 'Theft at border stop', value: 41 },
    { label: 'Crushed cartons (stacking)', value: 37 }, { label: 'Leaking kegs', value: 18 }, { label: 'Wet cartons', value: 11 },
    { label: 'Miscount at offloading', value: 7 }, { label: 'Expired on arrival', value: 4 },
  ];
  const paretoData = () => [['Cause', 'Cases lost', 'Share', 'Cumulative', 'Vital few'], ...paretoRows(causes).map((r) => [r.label, r.value, `${(r.share * 100).toFixed(1)}%`, `${(r.cum * 100).toFixed(1)}%`, r.vital ? 'Yes' : 'No'])];

  // ── 9. Stock cover ──
  const cover = [
    { label: 'Tusker Lager 24×330 ml', days: 8, min: 20, max: 60 }, { label: 'Guinness 24×330 ml', days: 16, min: 20, max: 60 },
    { label: 'Pilsner Lager 24×500 ml', days: 62, min: 20, max: 60 }, { label: 'White Cap 24×500 ml', days: 24, min: 20, max: 60 },
    { label: 'Balozi 24×500 ml', days: 5, min: 15, max: 45 }, { label: 'Smirnoff Ice 24×300 ml', days: 34, min: 14, max: 45 },
    { label: 'Senator Keg 50 L', days: null, min: 10, max: 30 },
  ];
  const coverRows = () => [['Product', 'Days of stock', 'Minimum (days)', 'Slow above (days)', 'State'], ...cover.map((c) => [c.label, c.days ?? 'No data yet', c.min, c.max, coverStatus(c).label])];
  // 131 SKUs (the client's catalogue size), deterministic sample
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const skuDays: (number | null)[] = Array.from({ length: 131 }, (_, i) => (i % 23 === 0 ? null : Math.round(Math.pow(rnd(), 1.6) * 95)));
  let band = $state<CoverBand | null>(null);
  const bandRows = () => { const c = bandCounts(skuDays); return [['Days of cover', 'Products', 'Share', 'State'], ...DEFAULT_BANDS.map((b, i) => [b.label, c.counts[i], c.total ? `${((c.counts[i] / c.total) * 100).toFixed(1)}%` : '', b.note ?? STATUS[b.status].label]), ['No data yet', c.missing, '', 'Not counted']]; };

  // ── 10. Ageing ──
  const providers = ['ETS Sabrina', 'Joly & Company', 'Company 3'];
  const fees = [{ name: '< 2 weeks', values: [8_400, 3_100, 900] }, { name: '2 weeks – 1 month', values: [5_250, 1_800, 0] }, { name: '> 1 month', values: [2_950, 600, 1_200] }];
  const feeRows = () => [['Provider', ...fees.map((f) => `${f.name} (USD)`), 'Total (USD)'], ...providers.map((p, i) => [p, ...fees.map((f) => f.values[i]), fees.reduce((a, f) => a + f.values[i], 0)])];
  const customers = ['Goma Beverages Ltd', 'Kivu Distributors', 'Lac Vert Bar', 'Juba Wholesale', 'Gisenyi Mini-mart'];
  const debt = [{ name: 'Within terms', values: [42_000, 18_500, 6_200, 22_000, 3_100] }, { name: '1–30 days overdue', values: [8_000, 12_400, 2_100, 0, 900] }, { name: '> 30 days overdue', values: [0, 9_800, 4_300, 1_500, 0] }];
  const debtRows = () => [['Customer', ...debt.map((f) => `${f.name} (USD)`), 'Total (USD)'], ...customers.map((p, i) => [p, ...debt.map((f) => f.values[i]), debt.reduce((a, f) => a + f.values[i], 0)])];

  // ── 11. Alerts triage ──
  const impacts = ['High', 'Medium', 'Low'], sevs = ['Low', 'Medium', 'High'];
  type Alert = ExceptionItem & { impact: string; sev: string };
  const alerts: Alert[] = [
    { id: 'a1', impact: 'High', sev: 'High', severity: 'critical', title: 'KCX 412B overdue at Malaba (31 h)', owner: 'Testfie', due: NOW - 6 * 3.6e6 },
    { id: 'a2', impact: 'High', sev: 'High', severity: 'critical', title: 'Damaged load 96 cases — Guinness 24×330 ml', owner: 'Asie', due: NOW + 2 * 3.6e6 },
    { id: 'a3', impact: 'High', sev: 'Medium', severity: 'high', title: 'Shortage awaiting review — PO-2026-0412', owner: 'Asie', due: NOW + 5 * 3.6e6 },
    { id: 'a4', impact: 'Medium', sev: 'High', severity: 'high', title: 'Clearing fee unpaid > 1 month — ETS Sabrina', owner: 'Daniel', due: NOW - 48 * 3.6e6 },
    { id: 'a5', impact: 'Medium', sev: 'Medium', severity: 'medium', title: 'No GPS update for 9 h — KDA 220M', owner: 'Testfie', due: NOW + 3 * 3.6e6 },
    { id: 'a6', impact: 'Medium', sev: 'Medium', severity: 'medium', title: 'Loading photos missing — PO-2026-0418', owner: 'Joel', due: NOW + 20 * 3.6e6 },
    { id: 'a7', impact: 'Low', sev: 'Medium', severity: 'medium', title: 'Delivery not acknowledged for 2 days — Juba', owner: 'Yonas', due: NOW + 30 * 3.6e6 },
    { id: 'a8', impact: 'Low', sev: 'Low', severity: 'low', title: 'Driver phone not synced for 26 h — Moses', owner: null, due: NOW + 70 * 3.6e6 },
  ];
  let cell = $state<{ row: string; col: string } | null>(null);
  const counts = impacts.map((r) => sevs.map((c) => alerts.filter((a) => a.impact === r && a.sev === c).length));
  const shownAlerts = $derived(cell ? alerts.filter((a) => a.impact === cell!.row && a.sev === cell!.col) : alerts);
  const alertRows = () => [['Alert', 'Impact', 'Severity', 'Owner', 'Due'], ...alerts.map((a) => [a.title, a.impact, a.sev, a.owner ?? 'Not assigned', new Date(a.due!).toLocaleString('en-GB')])];

  // ── 12. Live fleet board ──
  const cols = [
    { key: 'loaded', label: 'Loaded', status: 'none' as const }, { key: 'transit', label: 'In transit', status: 'good' as const }, { key: 'border', label: 'At border', status: 'warn' as const },
    { key: 'stopped', label: 'Stopped', status: 'bad' as const }, { key: 'arrived', label: 'Arrived', status: 'good' as const },
  ];
  const cards: KanbanCard[] = [
    { id: 't1', column: 'loaded', group: 'Nairobi → Goma', title: 'KDC 118K', subtitle: 'Peter Otieno · ETS Sabrina', meta: 'ETA 31 Oct', status: 'none', statusLabel: 'Not started' },
    { id: 't2', column: 'transit', group: 'Nairobi → Goma', title: 'KCY 902A', subtitle: 'John Mwangi · ETS Sabrina', meta: 'ETA 28 Oct · update 40 min ago', status: 'good', statusLabel: 'On time' },
    { id: 't3', column: 'transit', group: 'Kampala → Goma', title: 'UBF 331Q', subtitle: 'Moses K. · Joly', meta: 'ETA 27 Oct · update 2 h ago', status: 'good', statusLabel: 'On time' },
    { id: 't4', column: 'transit', group: 'Kigali → Juba', title: 'RAD 914C', subtitle: 'Re-export · owner not assigned', meta: 'ETA 30 Oct · update 11 h ago', status: 'warn', statusLabel: 'At risk', stale: true },
    { id: 't5', column: 'border', group: 'Nairobi → Goma', title: 'KDA 220M', subtitle: 'Samuel N. · Joly', meta: 'Katuna · 14 h waiting', status: 'warn', statusLabel: 'At risk' },
    { id: 't6', column: 'border', group: 'Mombasa → Kigali', title: 'KBZ 077T', subtitle: 'Ali H. · ETS Sabrina', meta: 'Rusumo · 6 h waiting', status: 'good', statusLabel: 'On time' },
    { id: 't7', column: 'stopped', group: 'Nairobi → Goma', title: 'KCX 412B', subtitle: 'David K. · ETS Sabrina', meta: 'Malaba · 31 h · breakdown', status: 'bad', statusLabel: 'Delayed' },
    { id: 't8', column: 'arrived', group: 'Nairobi → Goma', title: 'KCW 550D', subtitle: 'Paul M. · ETS Sabrina', meta: 'Goma · waiting acknowledgement', status: 'good', statusLabel: 'Arrived' },
    { id: 't9', column: 'arrived', group: 'Kigali → Juba', title: 'RAC 210B', subtitle: 'Re-export · Yonas', meta: 'Juba · acknowledged', status: 'good', statusLabel: 'Arrived' },
  ];
  const boardRows = () => [['Truck', 'Status', 'Route', 'Driver / provider', 'Detail', 'State'], ...cards.map((c) => [c.title, cols.find((x) => x.key === c.column)!.label, c.group ?? '', c.subtitle ?? '', c.meta ?? '', c.statusLabel ?? ''])];

  // ── 13. Hours to dispatch ──
  const disp = [
    { label: 'KBL Nairobi', values: [6, 8, 9, 11, 12, 12, 14, 15, 18, 20, 22, 26, 31, 44] },
    { label: 'UBL Kampala', values: [10, 12, 15, 17, 19, 22, 24, 29, 36] },
    { label: 'GBI Mombasa', values: [18, 22, 26, 30, 34, 41, 52] },
  ];
  const dispRows = () => [['Loading point', 'Trips', 'Hours from arrival to dispatch'], ...disp.flatMap((g) => g.values.map((v, i) => [g.label, i + 1, v]))];

  const sevOrder: Severity[] = ['critical', 'high', 'medium', 'low'];
</script>

{#if !showDemoHelpers}
  <div class="empty card">The chart gallery is only available in development and demo builds.</div>
{:else}
<div class="page-head">
  <div><div class="overline crumb">Developer</div><h1>Dashboard kit — chart gallery</h1></div>
  <div class="row" style="gap:var(--space-2)">
    <p class="caption" style="max-width:60ch">Sample data only (illustrative, not business results). Every panel has a definition (info button), unit, period, freshness, <b>View data</b> and <b>Export</b> (CSV · Excel · PDF). Click marks to drill down.</p>
    <button class="btn btn-secondary btn-sm" onclick={toggleTheme}><SunMoon size={16} />Light / dark</button>
  </div>
</div>

<section class="legend-strip card" aria-label="Status colours">
  <span class="overline">Status colours (C-04)</span>
  <StatusBadge status="good" label="On track / paid" /><StatusBadge status="warn" label="At risk / part paid" /><StatusBadge status="bad" label="Delayed / short / unpaid" /><StatusBadge status="none" label="No data / not started" />
  <span class="caption">Always icon + words, never colour alone.</span>
</section>

<h2 class="sec">1 · Executive overview — KPI scorecard + exceptions</h2>
<DashboardGrid cols={1}>
  <DashboardPanel title="Executive overview" subtitle="Directors' home · tap a tile to open its list" definition="Each figure is separate (no combined chart). Change compares with the previous period named on the tile; the line shows the last 6 periods." unit="USD" period={PERIOD} updatedAt={min(5)} rows={kpiRows} filename="executive-overview" owner="Daniel (Director)">
    <KpiScorecard items={kpis} />
  </DashboardPanel>
  <DashboardPanel title="Delayed trucks and high-priority alerts" subtitle="sorted by severity, then due time" definition="Open exceptions from the alerts centre with a named owner and due time. Overdue items show in red." period="Open now" updatedAt={min(2)} rows={excRows} filename="exceptions" drill={{ label: 'Open the alerts centre', onclick: () => drill('alerts centre') }}>
    <ExceptionList items={exceptions} now={NOW} />
  </DashboardPanel>
</DashboardGrid>

<h2 class="sec">2–4 · Profit, landed cost and product speed</h2>
<DashboardGrid>
  <DashboardPanel title="Profit bridge" subtitle="how sales become profit" definition="Sales less goods cost (gross profit), then truck cost, warehouse expenses and other expenses. Steps are signed; bars float from the running total." unit="USD" period={PERIOD} updatedAt={min(12)} rows={wfRows} filename="profit-waterfall" drill={{ label: 'Open the performance report', onclick: () => drill('performance report') }}>
    <Waterfall label="Profit bridge from sales to profit, USD" steps={wf} format={usd} onselect={(s) => drill(s)} />
  </DashboardPanel>
  <DashboardPanel title="Landed cost per case" subtitle="goods + truck + warehouse, share of each" definition="Landed cost per case = goods cost + truck cost + warehouse expenses, divided by cases received in the period." unit="USD per case" period={PERIOD} updatedAt={min(12)} rows={landedRows} filename="landed-cost">
    <StackedBarH label="Landed cost per case by product, USD" categories={products} parts={[{ name: 'Goods', values: landed.goods }, { name: 'Truck', values: landed.truck }, { name: 'Warehouse', values: landed.warehouse }]} format={usd2} onselect={(c, p) => drill(`${c} · ${p}`)} />
  </DashboardPanel>
  <DashboardPanel span={2} title="Fast and slow products" subtitle="sales speed against days of stock · bubble = stock value" definition="Sales speed = cases sold per day over the last 30 days. Days of stock = cases on hand ÷ sales speed. Thresholds are set per product category." unit="cases/day · days" period="Last 30 days to 25 Oct 2026" updatedAt={min(40)} rows={quadRows} filename="fast-slow-products">
    <QuadrantScatter label="Products by sales speed and days of stock" {points} groups={['Goma', 'Kigali', 'Juba']} xLabel="Sales speed (cases/day)" yLabel="Days of stock" xThreshold={30} yThreshold={45}
      quadrants={{ topLeft: { label: 'Slow & overstocked', status: 'bad' }, topRight: { label: 'Fast, well stocked', status: 'good' }, bottomLeft: { label: 'Slow, little stock', status: 'none' }, bottomRight: { label: 'Fast & running low', status: 'warn' } }}
      formatX={(n) => `${n}/day`} formatY={(n) => `${n} d`} sizeLabel="Stock value USD" onselect={(p) => drill(p.label)} />
  </DashboardPanel>
</DashboardGrid>

<h2 class="sec">5–7 · Borders, purchase pipeline and reconciliation</h2>
<DashboardGrid>
  <DashboardPanel title="Average days at each stop" subtitle="route × border · trips in the data table" definition="Average days between arriving at and leaving each stop, per route. Cells with fewer than 5 trips should not be read as a stable pattern." unit="days" period="Jul–Oct 2026" updatedAt={min(55)} rows={hmData} filename="route-stop-heatmap">
    <Heatmap label="Average days at each stop by route" rows={hmRows} cols={hmCols} values={hmVals} text={hmVals.map((r, i) => r.map((v, j) => (v == null ? '' : `${v.toFixed(1)} d · ${hmTrips[i][j]} trips`)))} />
  </DashboardPanel>
  <DashboardPanel title="Purchase order pipeline" subtitle="orders and value at each stage" definition="Orders by their current stage. Value = order value at purchase price. Drop = share fewer than the previous stage." unit="orders · USD" period={PERIOD} updatedAt={min(8)} rows={stageRows} filename="po-pipeline" filterText={pair === 'all' ? 'All buyer–supplier pairs' : pair}>
    {#snippet filters()}
      <label class="small">Buyer–supplier <select class="select" style="height:32px" bind:value={pair}>{#each Object.keys(pairs) as p}<option value={p}>{p === 'all' ? 'All pairs' : p}</option>{/each}</select></label>
    {/snippet}
    <StageBars label="Purchase orders by stage" {stages} formatValue={usd} countLabel="orders" onselect={(s) => drill(`${s.count} ${s.label.toLowerCase()} orders`)} />
  </DashboardPanel>
  <DashboardPanel span={2} title="Ordered vs loaded vs delivered" subtitle="per PO line, with the gap at each step" definition="Cases ordered on the PO, loaded at the supplier (after any loading revision) and received at the warehouse. Gaps within 0.5 % count as matching." unit="cases" period={PERIOD} updatedAt={min(8)} rows={gapRows} filename="ordered-loaded-delivered">
    <GroupedBars label="Cases ordered, loaded and delivered per PO line" categories={poLines} series={qty} format={cases} unit="cases" onselect={(c) => drill(c)} />
    <GapTable categories={poLines} series={qty} itemLabel="PO line" unit="cases" onselect={(c) => drill(c)} />
  </DashboardPanel>
</DashboardGrid>

<h2 class="sec">8–9 · Delivery losses and stock cover</h2>
<DashboardGrid>
  <DashboardPanel title="Delivery losses by cause" subtitle="cases short or damaged, ranked" definition="Cases recorded short or damaged at acknowledgement, by the cause the receiver chose. Line = cumulative share; the dashed line marks 80 %." unit="cases" period={PERIOD} updatedAt={min(20)} rows={paretoData} filename="delivery-losses-pareto">
    <Pareto label="Delivery losses by cause with cumulative share" items={causes} valueLabel="Cases lost" onselect={(c) => drill(c)} />
  </DashboardPanel>
  <DashboardPanel title="Stock cover against minimum" subtitle="Goma warehouse" definition="Days of stock = cases on hand ÷ average daily sales (30 days). Minimum and slow-moving limits are set per product." unit="days" period="As of 25 Oct 2026" updatedAt={min(25)} rows={coverRows} filename="stock-cover">
    <StockCoverBars label="Days of stock cover against minimum by product" items={cover} onselect={(c) => drill(c.label)} />
  </DashboardPanel>
  <DashboardPanel span={2} title="Stock cover distribution" subtitle="all 131 products · click a band to list its products" definition="Products grouped by days of stock cover. Products without sales history are listed separately — no data, not zero." unit="products" period="As of 25 Oct 2026" updatedAt={min(25)} rows={bandRows} filename="stock-cover-bands" filterText={band ? `Band ${band.label}` : ''}>
    <StockCoverBands days={skuDays} selected={band?.label ?? null} onselect={(b) => { band = b; if (b) drill(`products with ${b.label}`); }} />
  </DashboardPanel>
</DashboardGrid>

<h2 class="sec">10–11 · Ageing balances</h2>
<DashboardGrid>
  <DashboardPanel title="Unpaid transport fees by age" subtitle="by provider" definition="Fees recorded against a truck or leg and not yet paid in full, by days since the fee was raised." unit="USD" period="Open on 25 Oct 2026" updatedAt={min(3)} rows={feeRows} filename="unpaid-fees-ageing" drill={{ label: 'Open fee payments', onclick: () => drill('fee payments') }}>
    <AgeingBars label="Unpaid fees by provider and age band, USD" entities={providers} bands={fees} format={usd} onselect={(e, b) => drill(`${e} · ${b}`)} />
  </DashboardPanel>
  <DashboardPanel title="Customer balances" subtitle="credit exposure by ageing band" definition="Credit sales not yet paid. Overdue = past the customer's payment terms (14 days unless set)." unit="USD" period="Open on 25 Oct 2026" updatedAt={min(3)} rows={debtRows} filename="customer-ageing">
    <AgeingBars label="Customer balances by ageing band, USD" entities={customers} bands={debt} tones={['good', 'warn', 'bad']} format={usd} onselect={(e, b) => drill(`${e} · ${b}`)} />
  </DashboardPanel>
</DashboardGrid>

<h2 class="sec">12 · Alerts centre — triage matrix + list</h2>
<DashboardGrid>
  <DashboardPanel title="Alert triage" subtitle="severity × business impact · click a cell to filter the list" definition="Severity = how bad the event is; impact = money or customers affected. The matrix supplements the list — every alert keeps an owner, due time and status." period="Open now" updatedAt={min(1)} rows={alertRows} filename="alert-triage" filterText={cell ? `${cell.row} impact · ${cell.col} severity` : ''}>
    <TriageMatrix rows={impacts} cols={sevs} {counts} selected={cell} onselect={(c) => (cell = c)} />
  </DashboardPanel>
  <DashboardPanel title={cell ? `Alerts · ${cell.row} impact, ${cell.col} severity` : 'All open alerts'} subtitle="{shownAlerts.length} of {alerts.length}" period="Open now" updatedAt={min(1)} rows={alertRows} filename="alerts" exports={['csv', 'xlsx']}>
    {#snippet actions()}{#if cell}<button class="btn btn-ghost btn-sm" onclick={() => (cell = null)}>Clear filter</button>{/if}{/snippet}
    <ExceptionList items={shownAlerts} now={NOW} max={8} label="Open alerts" />
  </DashboardPanel>
</DashboardGrid>

<h2 class="sec">Live fleet board and loading speed</h2>
<DashboardGrid>
  <DashboardPanel span={2} title="Live fleet" subtitle="every truck by status, grouped by route" definition="Status from the latest driver or Testfie update. Faded cards have not updated within 8 hours." period="Now" updatedAt={min(70)} freshness="synced" rows={boardRows} filename="live-fleet">
    <KanbanBoard columns={cols} {cards} oncard={(c) => drill(`truck ${c.title}`)} />
  </DashboardPanel>
  <DashboardPanel title="Hours from arrival to dispatch" subtitle="by loading point" definition="Hours from the truck checking in at the loading point to its dispatch. Target 24 h." unit="hours" period={PERIOD} updatedAt={min(15)} rows={dispRows} filename="hours-to-dispatch">
    <BoxPlot label="Hours from arrival to dispatch by loading point" groups={disp} unit="hours" target={24} onselect={(g) => drill(g)} />
  </DashboardPanel>
  <DashboardPanel title="Severity scale" subtitle="used by exception lists and alerts">
    <ul class="sev-list">{#each sevOrder as s}{@const m = SEVERITY[s]}{@const st = STATUS[m.status]}<li><span class="sev" style:color={st.ink} style:background={st.bg}><m.icon size={16} aria-hidden="true" />{m.label}</span><span class="caption">{st.label} colour · icon + word</span></li>{/each}</ul>
  </DashboardPanel>
</DashboardGrid>

<h2 class="sec">Panel states</h2>
<DashboardGrid cols={3}>
  <DashboardPanel title="Loading" subtitle="skeleton while data loads" period={PERIOD} loading>
    <p>never shown</p>
  </DashboardPanel>
  <DashboardPanel title="Error" subtitle="with retry" error={new Error('The server could not be reached.')} onretry={() => say('Retry')}>
    <p>never shown</p>
  </DashboardPanel>
  <DashboardPanel title="Warehouse expenses — Juba" subtitle="no records, not zero" unit="USD" period={PERIOD} updatedAt={min(400)} freshness="synced" rows={() => [['Category', 'USD']]} emptyHint="Yonas has not recorded expenses for October yet.">
    <p>never shown</p>
  </DashboardPanel>
</DashboardGrid>
{/if}

<style>
  .sec { font-size: var(--fs-h3); margin: var(--space-8) 0 0; }
  .legend-strip { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-3) var(--space-4); }
  .sev-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .sev-list li { display: flex; align-items: center; gap: var(--space-3); }
  .sev { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-sm); min-width: 90px; }
</style>
