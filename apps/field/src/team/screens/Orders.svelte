<script lang="ts">
  // Orders: issued purchase orders · drafts (and approvals when the config asks for them) · period plans (read-only).
  import { untrack } from 'svelte';
  import { periodPlans, plans, pos, type PeriodPlan, type Plan, type PurchaseOrder, type User } from '@btw/api';
  import { Badge, fmtShortDate } from '@btw/ui';
  import Search from '@lucide/svelte/icons/search';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';
  import Plus from '@lucide/svelte/icons/plus';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { can, canIssuePO } from '../access';
  import { co } from '../company.svelte';
  import { Res, onRefresh, settle } from '../load.svelte';
  import { orderCases, orderValue, orderedByLine, plannedCases, sumMap, supplierName, trucksOf } from '../plan';
  import { dayLabel, num, plural, usd } from '../fmt';
  import { webLink } from '../web';
  import Segmented from '../components/Segmented.svelte';
  import Meter from '../components/Meter.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let { user, query }: { user: User; view: View; query: URLSearchParams } = $props();

  const showPeriods = $derived(can(user, 'period-plans'));
  const r = new Res(async () => {
    const [p, o, pp] = await Promise.all([pos.list(), settle(plans.list(), [] as Plan[]), showPeriods ? settle(periodPlans.list(), [] as PeriodPlan[]) : ([] as PeriodPlan[])]);
    return { pos: p as PurchaseOrder[], plans: o, periods: pp };
  });
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));

  let seg = $state(untrack(() => (query.get('seg') === 'period' && showPeriods ? 'period' : query.get('seg') === 'drafts' ? 'drafts' : 'pos')));
  const segs = $derived([{ id: 'pos', label: 'Issued' }, { id: 'drafts', label: 'Drafts' }, ...(showPeriods ? [{ id: 'period', label: 'Period plans' }] : [])]);
  let q = $state('');
  const match = (...xs: (string | undefined)[]) => !q.trim() || xs.some((x) => x?.toLowerCase().includes(q.trim().toLowerCase()));
  const planOf = $derived(new Map((r.data?.plans ?? []).map((p) => [p.id, p])));
  const issued = $derived((r.data?.pos ?? []).filter((p) => match(p.ref, p.title, supplierName(p.supplierId))));
  const drafts = $derived((r.data?.plans ?? []).filter((p) => p.status !== 'Approved' && match(p.ref, p.title, supplierName(p.supplierId)))
    .sort((a, b) => (a.status === 'Submitted' ? -1 : 0) - (b.status === 'Submitted' ? -1 : 0) || b.date.localeCompare(a.date)));
  const periods = $derived((r.data?.periods ?? []).filter((p) => match(p.ref, p.title)));
</script>

<Segmented options={segs} bind:value={seg} label="Orders" />
<label class="t-search"><Search size={20} /><input type="search" placeholder="Search ref, title or supplier" bind:value={q} aria-label="Search orders" /></label>
<ErrorNote error={r.error} onretry={() => r.reload()} />

{#if r.loading}
  <Skeleton rows={6} />
{:else if seg === 'pos'}
  {#if issued.length}
    <div class="t-list">
      {#each issued as p (p.id)}
        {@const pl = planOf.get(p.planId)}
        <a class="t-item" href="#/orders/po/{p.id}">
          <span class="t-main">
            <span class="t-line1">{#if co.active === null}<CompanyDot entityId={p.entityId} />{/if}<span class="t-ellipsis">{p.ref}</span></span>
            <span class="t-meta t-ellipsis">{supplierName(p.supplierId)}{p.title ? ` · ${p.title}` : ''}</span>
            <span class="t-meta">{dayLabel(p.date)}{pl ? ` · ${plural(trucksOf(pl), 'truck')} · ${num(orderCases(pl))} cases` : ''}</span>
          </span>
          <span class="right">{#if pl}<span class="t-amount">{usd(orderValue(pl))}</span>{/if}{#if p.sentAt}<Badge tone="success">Sent</Badge>{:else}<Badge tone="warning">Not sent</Badge>{/if}</span>
        </a>
      {/each}
    </div>
  {:else}<Empty title="No purchase orders" text={q ? 'Nothing matches your search.' : 'Issued orders will show here.'} />{/if}
{:else if seg === 'drafts'}
  {#if drafts.length}
    <div class="t-list">
      {#each drafts as p (p.id)}
        <a class="t-item" href="#/orders/draft/{p.id}">
          <span class="t-main">
            <span class="t-line1">{#if co.active === null}<CompanyDot entityId={p.entityId} />{/if}<span class="t-ellipsis">{p.ref}</span></span>
            <span class="t-meta t-ellipsis">{supplierName(p.supplierId)}{p.title ? ` · ${p.title}` : ''}</span>
            <span class="t-meta">{`${dayLabel(p.date)} · ${num(orderCases(p))} cases`}</span>
          </span>
          <span class="right"><span class="t-amount">{usd(orderValue(p))}</span><Badge status={p.status} /></span>
        </a>
      {/each}
    </div>
  {:else}<Empty title="No drafts" text="Orders being prepared will show here." />{/if}
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
  <a class="t-fab" href={webLink(seg === 'period' ? '/period-plans/new' : '/plans/new')} target="_blank" rel="noopener"><Plus size={22} />{seg === 'period' ? 'New plan' : 'New PO'}</a>
{/if}

<style>
  .t-item.col { flex-direction: column; align-items: stretch; gap: 8px; }
  .top { align-items: flex-start; }
  .bar { display: block; }
  .right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
</style>
