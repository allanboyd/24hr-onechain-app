<script lang="ts">
  // "By company" breakdown for any report/overview page in Group scope (renders nothing in a company scope,
  // so single-company pages never show other companies' numbers). Each metric is fetched per company with
  // the shared report functions; clicking a company switches into it (drill-down).
  import CompanyMark from '../CompanyMark.svelte';
  import { BarChart, ChartCard } from '../charts';
  import { session } from '../../lib/session.svelte';
  import { company, GROUP, allowedIds, setCompany } from '../../lib/company.svelte';
  import { allCompanies } from '../../lib/companies';
  import { FX_NOTE } from '../../lib/group';

  export interface SplitMetric { label: string; get: (entityId: string | undefined) => Promise<number | null>; format: (v: number) => string; money?: boolean }
  let { title = 'By company', subtitle = '', metrics }: { title?: string; subtitle?: string; metrics: SplitMetric[] } = $props();

  const user = $derived(session.user);
  const show = company.active === GROUP; // the shell remounts screens on a company switch
  const cos = $derived(user ? allCompanies().filter((c) => allowedIds(user).includes(c.id)) : []);
  let rows = $state<{ id: string; name: string; vals: (number | null)[] }[] | null>(null);
  let total = $state<(number | null)[]>([]);
  let error = $state('');

  $effect(() => {
    if (!show || !user) return;
    const list = cos;
    Promise.all([Promise.all(metrics.map((m) => m.get(undefined))), ...list.map((c) => Promise.all(metrics.map((m) => m.get(c.id))))])
      .then(([t, ...each]) => { total = t; rows = list.map((c, i) => ({ id: c.id, name: c.shortName, vals: each[i] })); })
      .catch((e) => { error = (e as Error).message; });
  });
  const anyMoney = $derived(metrics.some((m) => m.money));
</script>

{#if show}
  <ChartCard span={2} {title} subtitle={`${subtitle ? subtitle + ' · ' : ''}group total and each company${anyMoney ? ' · ' + FX_NOTE : ''} · click a company to work in it`} filename="by-company"
    rows={() => [['Company', ...metrics.map((m) => m.label)], ...(rows ?? []).map((r) => [r.name, ...r.vals.map((v) => v ?? '')]), ['Group', ...total.map((v) => v ?? '')]]}>
    {#if error}<p class="error small">{error}</p>
    {:else if !rows}<div class="skeleton" style="height:120px"></div>
    {:else}
      <div class="split">
        <BarChart label="{metrics[0].label} by company" categories={rows.map((r) => r.name)} format={metrics[0].format} horizontal height={60 + rows.length * 40}
          series={[{ name: metrics[0].label, values: rows.map((r) => r.vals[0] ?? 0) }]}
          onselect={(name) => { const r = rows!.find((x) => x.name === name); if (r && user) setCompany(user, r.id); }} />
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Company</th>{#each metrics as m}<th class="num">{m.label}</th>{/each}</tr></thead>
          <tbody>
            {#each rows as r (r.id)}
              <tr class="clickable" onclick={() => user && setCompany(user, r.id)}><td><span class="co"><CompanyMark entityId={r.id} size={18} />{r.name}</span></td>
                {#each metrics as m, i}<td class="num">{r.vals[i] == null ? '—' : m.format(r.vals[i]!)}</td>{/each}</tr>
            {/each}
            <tr class="grand"><td>Group</td>{#each metrics as m, i}<td class="num">{total[i] == null ? '—' : m.format(total[i]!)}</td>{/each}</tr>
          </tbody>
        </table></div>
      </div>
    {/if}
  </ChartCard>
{/if}

<style>
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: var(--space-4); align-items: start; }
  .co { display: inline-flex; align-items: center; gap: var(--space-2); white-space: nowrap; }
  @media (max-width: 900px) { .split { grid-template-columns: minmax(0, 1fr); } }
</style>
