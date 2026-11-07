<script lang="ts">
  // KPI scorecard row (Directors' home): each tile = figure, change vs the previous period (arrow + words), mini trend, optional status note.
  // Tap a tile → its drill-down (href or onclick). Missing figures read "No data yet", never 0.
  import TrendLine from './TrendLine.svelte';
  import { STATUS, type Status } from './status';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
  import MoveRight from '@lucide/svelte/icons/move-right';
  export interface KpiChange { value: number | null; /** pct = relative change (0.082 → 8.2 %), pp = percentage points, abs = same unit as the figure */ kind?: 'pct' | 'pp' | 'abs'; upIsGood?: boolean; label?: string }
  export interface Kpi {
    id?: string; label: string; value: number | null; format?: (n: number) => string; change?: KpiChange; trend?: (number | null)[];
    /** e.g. "3 delayed" with status 'bad' */ note?: string; status?: Status; href?: string; onclick?: () => void;
  }
  let { items, label = 'Key figures' }: { items: Kpi[]; label?: string } = $props();
  const fmtChange = (c: KpiChange, f: (n: number) => string) => {
    const v = Math.abs(c.value ?? 0);
    return c.kind === 'pp' ? `${v.toFixed(1)} pp` : c.kind === 'abs' ? f(v) : `${(v * 100).toFixed(1)}%`;
  };
  const dflt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
</script>
<div class="kpis" role="list" aria-label={label}>
  {#each items as k (k.id ?? k.label)}
    {@const f = k.format ?? dflt}
    {@const c = k.change}
    {@const dir = c?.value == null ? 0 : Math.sign(c.value)}
    {@const good = dir === 0 ? null : (dir > 0) === (c?.upIsGood ?? true)}
    {@const sm = k.status ? STATUS[k.status] : null}
    <div role="listitem" class="cell">
      <svelte:element this={k.href ? 'a' : k.onclick ? 'button' : 'div'} href={k.href} type={k.onclick && !k.href ? 'button' : undefined} role={k.href || k.onclick ? undefined : 'group'} onclick={k.onclick}
        class="card kpi-tile" class:pick={!!(k.href || k.onclick)} class:flag-danger={k.status === 'bad'} class:flag-warning={k.status === 'warn'} class:flag-success={k.status === 'good'}>
        <div class="overline">{k.label}</div>
        <div class="mid">
          {#if k.value == null}<div class="value none">No data yet</div>{:else}<div class="value">{f(k.value)}</div>{/if}
          {#if k.trend}<TrendLine values={k.trend} />{/if}
        </div>
        {#if c}
          <div class="chg">
            {#if c.value == null}<span class="muted">No previous period</span>
            {:else}
              <span class="d" class:good={good === true} class:bad={good === false}>
                {#if dir > 0}<ArrowUpRight size={15} aria-hidden="true" />{:else if dir < 0}<ArrowDownRight size={15} aria-hidden="true" />{:else}<MoveRight size={15} aria-hidden="true" />{/if}
                {dir > 0 ? '+' : dir < 0 ? '−' : ''}{fmtChange(c, f)}
              </span>
              <span class="muted">{c.label ?? 'vs previous period'}</span>
              {#if good != null}<span class="sr-only">({good ? 'better' : 'worse'})</span>{/if}
            {/if}
          </div>
        {/if}
        {#if k.note}<div class="note" style:color={sm?.ink}>{#if sm}<sm.icon size={14} aria-hidden="true" />{/if}{k.note}</div>{/if}
      </svelte:element>
    </div>
  {/each}
</div>
<style>
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--space-3); }
  .cell { display: flex; min-width: 0; }
  .kpi-tile { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; text-align: left; font: inherit; color: inherit; text-decoration: none; padding: var(--space-4); }
  .mid { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 2px var(--space-2); }
  .value { font: 700 28px/36px var(--ff-display); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .value.none { font: 600 var(--fs-body)/36px var(--ff-body); color: var(--text-muted); }
  .chg { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: var(--fs-body-sm); }
  .d { display: inline-flex; align-items: center; gap: 2px; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .d.good { color: var(--success); } .d.bad { color: var(--danger); }
  .note { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-body-sm); font-weight: 600; }
  .pick { cursor: pointer; } .pick:hover { border-color: var(--border-strong); }
  .pick:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 480px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .value { font-size: 22px; line-height: 30px; } }
</style>
