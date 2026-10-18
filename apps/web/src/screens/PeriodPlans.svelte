<script lang="ts">
  // Period plans (§8.3 PL-06..PL-12): what each company plans to buy over a month / quarter / half year / year.
  import { lookup, type User } from '@btw/api';
  import { Badge, fmtMoney, fmtNum, router } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import { untrack } from 'svelte';
  import RecordFor from '../components/RecordFor.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import PageTabs from '../components/PageTabs.svelte';
  import CompanyCell from '../components/CompanyCell.svelte';
  import CompanyMark from '../components/CompanyMark.svelte';
  import { companyLabel } from '../lib/companies';
  import { BarChart, ChartCard, StatTile, usd } from '../components/charts';
  import { watch } from '../lib/load.svelte';
  import { currentTab, qp, drill } from '../lib/tab';
  import { isGroup } from '../lib/company.svelte';
  import { canEditPeriodPlans, KIND_LABEL, monthsOf, onPlanningChange, periodLabel, periodPlans, planTotals, type PeriodPlan } from '../lib/planning';
  let { user }: { user: User } = $props();
  const tab = currentTab();
  const B = '/period-plans';
  let list = $state<PeriodPlan[] | null>(null);
  // Plans are suggestions (no approval): Active, or Replaced by a newer plan (kept for history, hidden by default).
  let showReplaced = $state(untrack(() => qp('status') === 'Replaced'));
  let status = $state(untrack(() => qp('status') === 'Replaced' ? 'Replaced' : ''));
  let q = $state('');
  const w = watch(async () => { list = await periodPlans.list({ all: showReplaced }); }, () => showReplaced);
  $effect(() => onPlanningChange(() => w.retry()));
  const STATUSES = ['Active', 'Replaced'] as const;
  const count = (s: string) => (list ?? []).filter((p) => !s || p.status === s).length;
  const rows = $derived((list ?? []).filter((p) => (!status || p.status === status) && (!q || `${p.ref} ${p.title}`.toLowerCase().includes(q.toLowerCase()))));
  const today = new Date().toISOString().slice(0, 10);
  const active = $derived((list ?? []).filter((p) => p.status === 'Active'));
  const inForce = $derived(active.filter((p) => p.from <= today && p.to >= today));
  const upcoming = $derived(active.filter((p) => p.from > today));
  // Planned value per month (active plans), spread by the monthly split or evenly.
  const byMonth = $derived.by(() => {
    const m = new Map<string, number>();
    for (const p of active) {
      const ms = monthsOf(p.from, p.to);
      for (const l of p.lines) for (const k of ms) m.set(k, (m.get(k) ?? 0) + (l.months?.[k] ?? l.cases / ms.length) * l.price);
    }
    return [...m.entries()].sort().slice(-12).map(([k, v]) => ({ k, v: Math.round(v) }));
  });
  const bySupplier = $derived.by(() => {
    const m = new Map<string, number>();
    for (const p of inForce) for (const l of p.lines) { const s = lookup.supplier(l.supplierId); const k = s ? `${s.code} ${s.city}` : l.supplierId; m.set(k, (m.get(k) ?? 0) + l.cases); }
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  });
  const canCreate = $derived(canEditPeriodPlans(user));
</script>

<div class="page-head">
  <div><div class="overline crumb">Procurement</div><h1>Period plans</h1><p class="muted small">What each company plans to buy over a month, quarter, half year or year. Plans are suggestions: saved directly, never overlapping, and shown on purchase orders for information.</p></div>
  {#if canCreate}<RecordFor what="a period plan"><a class="btn btn-primary" href="#/period-plans/new"><Plus size={16} />New period plan</a></RecordFor>{/if}
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<PageTabs base={B} current={tab} listLabel="Plan list" />

{#if tab === 'overview'}
  {#if !list}<div class="tiles">{#each Array(4) as _}<div class="card"><div class="skeleton" style="height:56px"></div></div>{/each}</div>
  {:else}
    <div class="tiles">
      <StatTile label="Plans in force today" value={String(inForce.length)} hint={usd(inForce.reduce((a, p) => a + planTotals(p).value, 0))} onclick={() => drill(B, {})} />
      <StatTile label="Upcoming periods" value={String(upcoming.length)} hint="plans starting later" onclick={() => drill(B, {})} />
      <StatTile label="Cases planned in force" value={fmtNum(inForce.reduce((a, p) => a + planTotals(p).cases, 0))} hint="active plans covering today" />
    </div>
    <div class="charts-grid">
      <ChartCard title="Planned purchases by month" subtitle="active plans, USD" rows={() => [['Month', 'Planned (USD)'], ...byMonth.map((x) => [x.k, x.v])]}>
        {#if byMonth.length}<BarChart label="Planned purchases by month" categories={byMonth.map((x) => x.k)} series={[{ name: 'Planned', values: byMonth.map((x) => x.v) }]} format={usd} />
        {:else}<p class="empty small">No period plans yet.</p>{/if}
      </ChartCard>
      <ChartCard title="Cases planned by supplier" subtitle="plans in force today" rows={() => [['Supplier', 'Cases'], ...bySupplier.map((x) => [x.label, x.value])]}>
        {#if bySupplier.length}<BarChart label="Cases planned by supplier" horizontal categories={bySupplier.map((x) => x.label)} series={[{ name: 'Cases', values: bySupplier.map((x) => x.value) }]} />
        {:else}<p class="empty small">No plan covers today.</p>{/if}
      </ChartCard>
    </div>
    <section class="card flush" style="margin-top:var(--space-4)">
      <header><h3>In force today</h3><a class="small" href="#/reports?r=pv">Planned vs actual →</a></header>
      <ul class="rows">
        {#each inForce as p (p.id)}
          <li><a href="#/period-plans/{p.id}" class="grow"><strong class="mono">{p.ref}</strong> · {p.title}</a>{#if isGroup()}<span class="small row" style="gap:6px"><CompanyMark entityId={p.entityId} size={18} />{companyLabel(p.entityId)}</span>{/if}<span class="small">{periodLabel(p)}</span><span class="num small">{fmtMoney(planTotals(p).value, 'USD')}</span></li>
        {:else}<li class="empty small">No plan covers today. {#if canCreate}Create one to compare purchase orders with it.{/if}</li>{/each}
      </ul>
    </section>
  {/if}
{:else}
  {#if showReplaced}
    <div class="tabs" role="tablist" aria-label="Plan status">
      <button role="tab" aria-selected={status === ''} onclick={() => (status = '')}>All <span class="caption">{count('')}</span></button>
      {#each STATUSES as s}<button role="tab" aria-selected={status === s} onclick={() => (status = s)}>{s} <span class="caption">{count(s)}</span></button>{/each}
    </div>
  {/if}
  <div class="filters"><label class="field"><span>Search</span><input class="input" type="search" bind:value={q} placeholder="Reference or title" /></label>
    <label class="row small toggle"><input type="checkbox" bind:checked={showReplaced} onchange={() => { if (!showReplaced) status = ''; }} />Show replaced plans</label></div>
  <div class="card flush table-wrap">
    <table class="table">
      <thead><tr><th>Reference</th><th>Title</th><CompanyCell head /><th>Period</th><th>Kind</th><th class="num">Lines</th><th class="num">Cases</th><th class="num">Value (USD)</th><th>Status</th></tr></thead>
      <tbody>
        {#if !list}{#each Array(3) as _}<tr><td colspan="9"><div class="skeleton"></div></td></tr>{/each}{/if}
        {#each rows as p (p.id)}
          <tr class="clickable" onclick={() => router.go(`/period-plans/${p.id}`)}>
            <td class="mono"><a href="#/period-plans/{p.id}">{p.ref}</a></td>
            <td>{p.title || '—'}</td>
            <CompanyCell entityId={p.entityId} />
            <td>{periodLabel(p)}</td>
            <td class="small">{KIND_LABEL[p.periodKind]}</td>
            <td class="num">{p.lines.length}</td>
            <td class="num">{fmtNum(planTotals(p).cases)}</td>
            <td class="num">{fmtNum(planTotals(p).value, 2)}</td>
            <td><Badge tone={p.status === 'Active' ? 'success' : 'neutral'}>{p.status}</Badge>{#if p.version > 1}<span class="caption"> v{p.version}</span>{/if}</td>
          </tr>
        {:else}{#if list}<tr><td colspan="9" class="empty">No period plans match. {#if status || q}<button class="btn btn-ghost btn-sm" onclick={() => { status = ''; q = ''; }}>Clear filters</button>{/if}</td></tr>{/if}{/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .rows { list-style: none; margin: 0; padding: 0; }
  .rows li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-5); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .rows li:last-child { border-bottom: 0; }
  .toggle { gap: var(--space-2); align-self: flex-end; padding-bottom: var(--space-2); }
</style>
