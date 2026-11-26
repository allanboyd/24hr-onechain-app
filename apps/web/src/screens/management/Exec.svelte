<script lang="ts">
  // Management · Executive report on live data (V3-10 step 3e): sentences written by fixed rules from the other Management
  // figures (mgmt-exec), in the report's look: good news, decisions for the directors, warehouses and combined.
  import { dashboards, type DashResult } from '@btw/api';
  import type { MgmtExec } from '@btw/api/dashboards';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import { destinationLabel } from '../../lib/planning';
  import ReportFilters, { reportFilters, apiFilter } from './ReportFilters.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  const f = reportFilters();
  let res = $state<DashResult | null>(null);
  const w = watch(async () => { res = (await dashboards.get(['mgmt-exec'], apiFilter(f))).results['mgmt-exec'] ?? null; }, () => [f.values.wh, f.values.p]);
  const d = $derived(res?.data as MgmtExec | undefined);
  const usd = (n: number | null | undefined, dp = 0) => (n == null ? '-' : `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
  const pct = (n: number | null | undefined) => (n == null ? '-' : `${(n * 100).toFixed(1)}%`);
  const whName = $derived(f.values.wh ? destinationLabel(f.values.wh) : 'Combined');
</script>

<section class="mrep" aria-labelledby="ex-h">
  <header><h1 id="ex-h">Executive report</h1><p class="muted">{whName} · {res?.period?.label ?? ''} · compared with {res?.data ? (d?.prev.label ?? '') : ''}</p></header>
  <ReportFilters {f} />
  <ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
  {#if d}
    <div class="g2">
      <div class="card">
        <h3 class="ct">Good news<span class="chip good">{d.good.length}</span></h3>
        <ul class="items">
          {#each d.good as x (x.key)}<li class="good"><i aria-hidden="true"></i><span class="grow">{x.text}</span>{#if x.href}<a href={x.href} aria-label="Open the details"><ArrowRight size={16} /></a>{/if}</li>
          {:else}<li class="muted">Nothing stands out this period.</li>{/each}
        </ul>
      </div>
      <div class="card">
        <h3 class="ct">Decisions for the Directors<span class="chip {d.decisions.length ? 'bad' : 'good'}">{d.decisions.length}</span></h3>
        <ul class="items">
          {#each d.decisions as x (x.key)}<li class={x.tone}><i aria-hidden="true"></i><span class="grow">{x.text}</span>{#if x.href}<a href={x.href} aria-label="Open the details"><ArrowRight size={16} /></a>{/if}</li>
          {:else}<li class="muted">No decision needed this period.</li>{/each}
        </ul>
      </div>
    </div>

    <div class="card">
      <h3 class="ct">Warehouses and combined</h3>
      <table class="table">
        <thead><tr><th>Warehouse</th><th class="num">Revenue</th><th class="num">Profit</th><th class="num">Margin</th><th class="num">Cases sold</th><th class="num">Profit per case</th></tr></thead>
        <tbody>
          {#each d.table as x (x.key)}
            <tr class:combined={x.combined}><td>{x.label}</td><td class="num">{usd(x.revenue)}</td><td class="num">{usd(x.profit)}</td>
              <td class="num"><span class="chip {x.margin !== null && x.margin < d.targetMargin ? 'bad' : 'good'}">{pct(x.margin)}</span></td>
              <td class="num">{Math.round(x.cases).toLocaleString('en-US')}</td><td class="num">{usd(x.profitPerCase, 2)}</td></tr>
          {:else}<tr><td colspan="6" class="muted">No sales in this period.</td></tr>{/each}
        </tbody>
      </table>
    </div>
    <p class="caption">{res?.definition}</p>
  {:else}
    <div class="g2">{#each Array(2) as _}<div class="card"><div class="skeleton" style="height:180px"></div></div>{/each}</div>
  {/if}
</section>

<style>
  .mrep { display: flex; flex-direction: column; gap: 14px; }
  header h1 { font-size: 24px; line-height: 30px; } header p { margin: 2px 0 0; }
  .g2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .ct { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; }
  .chip { display: inline-flex; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--surface-sunken); color: var(--text-muted); }
  .chip.good { background: var(--success-subtle); color: var(--success); }
  .chip.bad { background: var(--danger-subtle); color: var(--danger); }
  .items { list-style: none; margin: 0; padding: 0; }
  .items li { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); font-size: 14.5px; line-height: 1.45; }
  .items li:first-child { border-top: 0; }
  .items i { width: 4px; align-self: stretch; border-radius: 4px; flex: none; background: var(--text-subtle); }
  .items .good i { background: var(--success); }
  .items .warn i { background: var(--warning-solid); }
  .items .bad i { background: var(--danger); }
  .items a { flex: none; color: var(--link); }
  tr.combined td { font-weight: 700; background: var(--surface-sunken); }
</style>
