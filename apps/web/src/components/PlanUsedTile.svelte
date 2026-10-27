<script lang="ts">
  // Dashboard tile: this quarter's plan used vs expected, flag counts, link to the full planned-vs-actual report.
  import { Badge, fmtNum } from '@btw/ui';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { Meter, pct } from './charts';
  import { companyLabel } from '../lib/companies';
  import { flagTone, periodFor, periodLabel, plannedVsActual, type PlannedVsActual, type PvFlag } from '../lib/planning';
  let { group = false }: { group?: boolean } = $props();
  const today = new Date().toISOString().slice(0, 10);
  const q = periodFor('quarter', today);
  let d = $state<PlannedVsActual | null>(null);
  let failed = $state(false);
  $effect(() => { plannedVsActual(q).then((x) => (d = x)).catch(() => (failed = true)); });
  const FLAGS: PvFlag[] = ['Behind plan', 'Over plan', 'Unplanned', 'On track'];
  const n = (f: PvFlag) => (d?.lines ?? []).filter((l) => l.flag === f).length;
</script>

<section class="card pv">
  <header class="row between"><div><h3>Planned vs actual</h3><p class="caption">{periodLabel({ ...q, periodKind: 'quarter' })} · purchase orders against the period plans</p></div><a class="small row" href="#/dashboards/purchasing">Open <ArrowRight size={14} /></a></header>
  {#if failed}<p class="small muted">Couldn't load the plan comparison.</p>
  {:else if !d}<div class="skeleton" style="height:64px"></div>
  {:else if !d.measures.planned && !d.measures.ordered}<p class="small muted">No period plan covers this quarter yet. <a href="#/period-plans/new">Create one</a>.</p>
  {:else}
    <Meter label="Ordered of planned" value={d.measures.ordered} max={Math.max(d.measures.planned, d.measures.ordered, 1)} target={d.measures.expectedToDate} format={(x) => fmtNum(x)} tone={d.measures.ordered < d.measures.expectedToDate * d.thresholds.behind ? 'warning' : d.measures.ordered > d.measures.planned * d.thresholds.over ? 'danger' : 'success'} note="{pct(d.measures.usedPct / 100)} of {fmtNum(d.measures.planned)} planned · right figure and tick = expected by today" />
    <div class="chips">{#each FLAGS as f}{#if n(f)}<a href="#/dashboards/purchasing"><Badge tone={flagTone(f)}>{n(f)} {f.toLowerCase()}</Badge></a>{/if}{/each}</div>
    {#if group && d.byEntity}
      <ul class="cos">{#each Object.entries(d.byEntity) as [id, m] (id)}<li><span>{companyLabel(id)}</span><span class="num">{pct(m.usedPct / 100)} used</span><span class="caption num">{fmtNum(m.ordered)} / {fmtNum(m.planned)}</span></li>{/each}</ul>
    {/if}
  {/if}
</section>

<style>
  .pv { display: flex; flex-direction: column; gap: var(--space-3); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .chips a { text-decoration: none; }
  .cos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .cos li { display: grid; grid-template-columns: 1fr auto auto; gap: var(--space-3); font-size: 13px; }
</style>
