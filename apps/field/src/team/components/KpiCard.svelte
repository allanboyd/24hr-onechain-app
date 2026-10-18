<script lang="ts" module>
  export interface Kpi { key: string; label: string; value: string; delta?: number | null; deltaText?: string; upIsGood?: boolean; hint?: string; spark?: (number | null)[]; bars?: number[]; tone?: 'danger' | 'warning' | 'success'; href?: string }
</script>
<script lang="ts">
  // One KPI: label, big value, change vs before (green when it moves the good way), tiny sparkline or bars.
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import TrendingDown from '@lucide/svelte/icons/trending-down';
  import Spark from './Spark.svelte';
  import MiniBars from './MiniBars.svelte';
  let { k }: { k: Kpi } = $props();
  const good = $derived(k.delta == null ? null : (k.delta >= 0) === (k.upIsGood ?? true));
</script>
<a class="kpi t-press" href={k.href ? `#${k.href}` : undefined} class:tone-d={k.tone === 'danger'} class:tone-w={k.tone === 'warning'}>
  <span class="lbl">{k.label}</span>
  <span class="val">{k.value}</span>
  {#if k.delta != null}
    <span class="delta" class:good class:bad={good === false}>
      {#if k.delta >= 0}<TrendingUp size={14} />{:else}<TrendingDown size={14} />{/if}
      {k.deltaText ?? `${k.delta >= 0 ? '+' : '−'}${Math.abs(Math.round(k.delta * 100))}%`}
    </span>
  {:else if k.hint}<span class="hint">{k.hint}</span>{/if}
  <span class="viz">
    {#if k.spark}<Spark values={k.spark} label="{k.label} trend" color={k.tone === 'danger' ? 'var(--danger)' : undefined} />
    {:else if k.bars}<MiniBars values={k.bars} label="{k.label} trend" />{/if}
  </span>
  {#if k.delta != null && k.hint}<span class="hint">{k.hint}</span>{/if}
</a>
<style>
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 14px 14px 12px; border-radius: var(--t-radius); background: var(--t-card); border: 1px solid var(--t-line); box-shadow: var(--t-shadow); color: var(--text); text-decoration: none; min-width: 0; transition: transform var(--motion-fast); position: relative; overflow: hidden; }
  .kpi::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--t-accent); opacity: .9; }
  .kpi.tone-d::before { background: var(--danger-solid); } .kpi.tone-w::before { background: var(--warning-solid); }
  .lbl { font: 600 13px/16px var(--ff-body); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .val { font: 800 26px/32px var(--ff-display); font-variant-numeric: tabular-nums; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tone-d .val { color: var(--danger); }
  .delta { display: inline-flex; align-items: center; gap: 4px; font: 700 13px var(--ff-body); color: var(--text-muted); }
  .delta.good { color: var(--success); } .delta.bad { color: var(--danger); }
  .hint { font-size: 13px; line-height: 17px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .viz { margin-top: 6px; min-height: 4px; }
</style>
