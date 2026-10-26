<script lang="ts">
  // Orders: purchase orders with their stage (no drafts — a PO is issued when created, docs/09 §4) · period plans (read-only).
  import { untrack } from 'svelte';
  import { periodPlans, plans, pos, type PeriodPlan, type Plan, type PoStage, type PurchaseOrder, type User } from '@btw/api';
  import { Badge, fmtShortDate } from '@btw/ui';
  import Search from '@lucide/svelte/icons/search';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import Plus from '@lucide/svelte/icons/plus';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { can, canIssuePO, poApprovalRequired } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh, settle } from '../load.svelte';
  import { STAGE_TONE, orderedByLine, plannedCases, revLabel, stageOf, sumMap, supplierName } from '../plan';
  import { dayLabel, num, plural, usd } from '../fmt';
  import { webLink } from '../web';
  import Segmented from '../components/Segmented.svelte';
  import Chips from '../components/Chips.svelte';
  import Meter from '../components/Meter.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { user, query }: { user: User; view: View; query: URLSearchParams } = $props();

  const showPeriods = $derived(can(user, 'period-plans'));
  const r = new Res(async () => {
    // plans.list() only feeds the period-plan meters (ordered against each plan line)
    const [p, o, pp] = await Promise.all([pos.list(), showPeriods ? settle(plans.list(), [] as Plan[]) : ([] as Plan[]), showPeriods ? settle(periodPlans.list(), [] as PeriodPlan[]) : ([] as PeriodPlan[])]);
    return { pos: p as PurchaseOrder[], plans: o, periods: pp };
  });
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));

  let seg = $state(untrack(() => (query.get('seg') === 'period' && showPeriods ? 'period' : 'pos')));
  const segs = $derived([{ id: 'pos', label: 'Purchase orders' }, ...(showPeriods ? [{ id: 'period', label: 'Period plans' }] : [])]);
  const STAGES: PoStage[] = ['Awaiting approval', 'Created', 'Sent', 'Loading', 'On the road', 'Delivered'];
  let stage = $state<string>(untrack(() => query.get('stage') ?? 'all'));
  let q = $state('');
  const match = (...xs: (string | undefined)[]) => !q.trim() || xs.some((x) => x?.toLowerCase().includes(q.trim().toLowerCase()));
  const found = $derived((r.data?.pos ?? []).filter((p) => match(p.ref, p.baseRef, p.title, supplierName(p.supplierId))));
  const stageChips = $derived([{ id: 'all', label: 'All', count: found.length },
    ...STAGES.filter((s) => s !== 'Awaiting approval' || poApprovalRequired()).map((s) => ({ id: s, label: s, count: found.filter((p) => stageOf(p) === s).length }))]);
  const shown = $derived(stage === 'all' ? found : found.filter((p) => stageOf(p) === stage));
  const periods = $derived((r.data?.periods ?? []).filter((p) => match(p.ref, p.title)));
</script>

<Segmented options={segs} bind:value={seg} label="Orders" />
<label class="t-search"><Search size={20} /><input type="search" placeholder="Search ref, title or supplier" bind:value={q} aria-label="Search orders" /></label>
<ErrorNote error={r.error} onretry={() => r.reload()} />

{#if r.loading}
  <Skeleton rows={6} />
{:else if seg === 'pos'}
  <Chips options={stageChips} bind:value={stage} label="Stage" />
  {#if shown.length}
    <div class="t-list">
      {#each shown as p (p.id)}
        {@const st = stageOf(p)}
        <a class="t-item" href="#/orders/po/{p.id}">
          <span class="t-main">
            <span class="t-line1">{#if co.active === null}<CompanyDot entityId={p.entityId} />{/if}<span class="t-ellipsis">{p.baseRef ?? p.ref}</span>{#if p.revision}<span class="rev">{revLabel(p.revision)}</span>{/if}</span>
            <span class="t-meta t-ellipsis">{supplierName(p.supplierId)}{p.title ? ` · ${p.title}` : ''}</span>
            <span class="t-meta">{dayLabel(p.date)}{p.trucks ? ` · ${plural(p.trucks, 'truck')}` : ''}{p.cases != null ? ` · ${num(p.cases)} cases` : ''}</span>
          </span>
          <span class="right">{#if p.amount != null}<span class="t-amount">{usd(p.amount)}</span>{/if}<Badge tone={STAGE_TONE[st]}>{st}</Badge></span>
        </a>
      {/each}
    </div>
  {:else}<Empty title="No purchase orders" text={q || stage !== 'all' ? 'Nothing matches your search.' : 'Purchase orders will show here once created.'} />{/if}
{:else}
  {#if periods.length}
    <div class="t-list">
      {#each periods as p (p.id)}
        {@const planned = plannedCases(p)}
        {@const ordered = sumMap(orderedByLine(p, r.data?.plans ?? []))}
        <a class="t-item col" href="#/orders/period/{p.id}">
          <span class="t-row top">
            <span class="t-icon"><CalendarRange size={22} /></span>
            <span class="t-main">
              <span class="t-line1">{#if co.active === null}<CompanyDot entityId={p.entityId} />{/if}<span class="t-ellipsis">{p.title || p.ref}</span><Badge status={p.status} /></span>
              <span class="t-meta">{p.ref} · {fmtShortDate(p.from)} – {fmtShortDate(p.to)}</span>
            </span>
          </span>
          <span class="bar"><Meter value={ordered} max={planned} label="Ordered of planned" /></span>
          <span class="t-meta">{num(ordered)} of {num(planned)} cases ordered</span>
        </a>
      {/each}
    </div>
  {:else}<Empty title="No period plans" text="Plans for a month, quarter or year show here." />{/if}
{/if}

{#if canIssuePO(user) && co.active}
  <a class="t-fab" href={webLink(seg === 'period' ? '/period-plans/new' : '/pos/new')} target="_blank" rel="noopener"><Plus size={22} />{seg === 'period' ? 'New plan' : 'New PO'}</a>
{/if}

<style>
  .t-item.col { flex-direction: column; align-items: stretch; gap: 8px; }
  .top { align-items: flex-start; }
  .bar { display: block; }
  .rev { flex: none; font: 700 11px var(--ff-mono); padding: 2px 6px; border-radius: 6px; background: var(--surface-sunken); color: var(--text-muted); }
  .right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
</style>
