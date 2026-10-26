<script lang="ts">
  // Loading points at a glance: queues and waiting time, trucks loaded per day, ordered vs loaded.
  import { loading, lookup, type Loading, type WaitingEntry } from '@btw/api';
  import { fmtNum } from '@btw/ui';
  import { BarChart, ChartCard, LineChart, StatTile, pct } from '../charts';
  import { drill } from '../../lib/tab';
  import { loadingTiles } from '../../lib/tiles';
  let { points }: { points: { id: string; code: string; city: string }[] } = $props();
  let waiting = $state<WaitingEntry[]>([]);
  let loads = $state<Loading[]>([]);
  let ready = $state(false);
  $effect(() => { Promise.all([loading.waiting(), loading.list()]).then(([w, l]) => { waiting = w; loads = l; ready = true; }).catch(() => (ready = true)); });
  const H = 36e5;
  const ids = $derived(new Set(points.map((p) => p.id)));
  const name = (id: string) => { const s = lookup.supplier(id); return s ? `${s.code} ${s.city}` : id; };
  const queue = $derived(waiting.filter((w) => w.status === 'Waiting' && ids.has(w.loadingPointId)));
  const mine = $derived(loads.filter((l) => ids.has(l.loadingPointId)));
  const waitH = (w: WaitingEntry) => (Date.now() - Date.parse(w.arrivedAt)) / H;
  const per = $derived(points.map((p) => { const q = queue.filter((w) => w.loadingPointId === p.id); return { id: p.id, name: name(p.id), n: q.length, avg: q.length ? Math.round(q.reduce((a, w) => a + waitH(w), 0) / q.length) : 0, pending: mine.filter((l) => l.loadingPointId === p.id && l.status === 'Pending').length }; }));
  const days = $derived(Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10)));
  const loadedPerDay = $derived(days.map((d) => mine.filter((l) => l.loadedAt?.slice(0, 10) === d).length));
  const done = $derived(mine.filter((l) => l.status === 'Loaded'));
  const ordered = (l: Loading) => l.lines.reduce((a, x) => a + x.orderedQty, 0);
  const loadedQ = (l: Loading) => l.lines.reduce((a, x) => a + x.loadedQty, 0);
  const variance = $derived(points.map((p) => { const ls = done.filter((l) => l.loadingPointId === p.id); return { name: name(p.id), id: p.id, ordered: ls.reduce((a, l) => a + ordered(l), 0), loaded: ls.reduce((a, l) => a + loadedQ(l), 0) }; }).filter((x) => x.ordered));
  const totOrd = $derived(variance.reduce((a, x) => a + x.ordered, 0));
  const totLd = $derived(variance.reduce((a, x) => a + x.loaded, 0));
  const last7 = $derived(loadedPerDay.slice(-7).reduce((a, n) => a + n, 0));
  const prev7 = $derived(loadedPerDay.slice(-14, -7).reduce((a, n) => a + n, 0));
  const toPoint = (c: string) => per.find((p) => p.name === c)?.id;
</script>

<div class="tiles">
  <StatTile label="Trucks waiting" value={ready ? String(queue.length) : '…'} hint="in the queue at {points.length} loading points" />
  <StatTile label="Longest wait" value={queue.length ? `${Math.round(Math.max(...queue.map(waitH)))} h` : '—'} hint="since the truck arrived" />
  <StatTile label="Trucks to load" value={String(loadingTiles(loads, ids).toLoad)} hint="on purchase orders awaiting loading" />
  <StatTile label="Loaded · 7 days" value={String(last7)} delta={prev7 ? last7 / prev7 - 1 : null} deltaLabel="vs the 7 days before" />
</div>

<div class="charts-grid">
  <ChartCard title="Queue by loading point" subtitle="trucks waiting now" rows={() => [['Loading point', 'Waiting', 'Average wait (h)', 'Lines to load'], ...per.map((p) => [p.name, p.n, p.avg, p.pending])]}>
    <BarChart label="Trucks waiting by loading point" horizontal categories={per.map((p) => p.name)} series={[{ name: 'Waiting', values: per.map((p) => p.n) }]} onselect={(c) => drill('/loading', { lp: toPoint(c) })} />
  </ChartCard>
  <ChartCard title="Average waiting time" subtitle="hours, trucks in the queue now" rows={() => [['Loading point', 'Average wait (h)'], ...per.map((p) => [p.name, p.avg])]}>
    <BarChart label="Average waiting time by loading point" horizontal categories={per.map((p) => p.name)} series={[{ name: 'Average wait', values: per.map((p) => p.avg), slot: 1 }]} format={(n) => `${n} h`} onselect={(c) => drill('/loading', { lp: toPoint(c) })} />
  </ChartCard>
  <ChartCard span={2} title="Trucks loaded per day" period="last 30 days" rows={() => [['Date', 'Trucks loaded'], ...days.map((d, i) => [d, loadedPerDay[i]])]}>
    <LineChart label="Trucks loaded per day" labels={days} series={[{ name: 'Trucks loaded', values: loadedPerDay, area: true }]} rangeslider={false} />
  </ChartCard>
  <ChartCard span={2} title="Ordered vs loaded" subtitle="cases on completed loadings · overall {totOrd ? pct(totLd / totOrd, 1) : '—'} of ordered" rows={() => [['Loading point', 'Ordered', 'Loaded', 'Variance', 'Variance %'], ...variance.map((x) => [x.name, x.ordered, x.loaded, x.loaded - x.ordered, x.ordered ? Math.round(((x.loaded - x.ordered) / x.ordered) * 1000) / 10 : 0])]}>
    {#if variance.length}<BarChart label="Ordered vs loaded cases by loading point" categories={variance.map((x) => x.name)} series={[{ name: 'Ordered', values: variance.map((x) => x.ordered), slot: 8 }, { name: 'Loaded', values: variance.map((x) => x.loaded) }]} onselect={(c) => drill('/loading', { lp: toPoint(c) })} />
    {:else}<p class="empty small">No completed loadings yet.</p>{/if}
  </ChartCard>
</div>
<p class="caption" style="margin-top:var(--space-2)">Total cases loaded: {fmtNum(totLd)} of {fmtNum(totOrd)} ordered.</p>
