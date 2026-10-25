<script lang="ts">
  // Admin & alerts — docs/15: alerts centre (triage matrix + prioritised list + count tiles), users and logins, audit log
  // (activity sparkline + latest changes, from GET /audit; the full search stays on #/audit).
  import { audit, type AuditPage, type DashKey, type DashResult } from '@btw/api';
  import { DashboardPanel, TriageMatrix, ExceptionList, TrendLine, StatusBadge } from '../../../components/dashboard';
  import { frame, dayTime } from '../fmt.svelte';
  import { ROLE_LABEL } from '../../../lib/roles';
  let { key, r, link, span }: { key: DashKey; r?: DashResult; link?: string; span?: 1 | 2 | 'full' } = $props();
  const d = $derived((r?.data ?? {}) as any);
  const fr = $derived(frame(r));
  const drill = $derived(link ? { label: 'Open the full screen', href: link } : undefined);

  let cell = $state<{ row: string; col: string } | null>(null);
  let kind = $state('');
  const shown = $derived((d.items ?? []).filter((a: any) => (!cell || (a.impact === cell.row && a.sevCol === cell.col)) && (!kind || a.kind === kind)));
  const alertRows = () => [['Severity', 'Impact', 'Kind', 'Alert', 'Detail', 'Owner', 'Due', 'Status'], ...(d.items ?? []).map((a: any) => [a.severity, a.impact, a.kind, a.title, a.detail, a.owner ?? 'Not assigned', a.due ?? '', a.status])];

  let page = $state<AuditPage | null>(null);
  let auditErr = $state<unknown>(null);
  $effect(() => { if (key === 'audit-log') audit.list({ pageSize: 6 }).then((p) => (page = p)).catch((e) => (auditErr = e)); });
</script>

{#if key === 'alerts'}
  <DashboardPanel span={span ?? 'full'} title="Alerts centre" subtitle="severity × business impact · click a cell or a kind to filter the list · {shown.length} of {(d.items ?? []).length}" {...fr} rows={alertRows} filename="alerts" filterText={[cell ? `${cell.row} impact · ${cell.col} severity` : '', kind].filter(Boolean).join(' · ')} drill={{ label: 'Open notifications', href: '#/notifications' }}>
    {#snippet actions()}{#if cell || kind}<button class="btn btn-ghost btn-sm" onclick={() => { cell = null; kind = ''; }}>Clear filter</button>{/if}{/snippet}
    <div class="kinds">{#each d.kinds ?? [] as k}<button class="kchip" class:on={kind === k.kind} aria-pressed={kind === k.kind} onclick={() => (kind = kind === k.kind ? '' : k.kind)}><b>{k.n}</b> {k.kind}</button>{/each}</div>
    <div class="split">
      <TriageMatrix rows={d.impacts ?? []} cols={d.sevs ?? []} counts={d.counts ?? []} selected={cell} onselect={(c) => (cell = c)} />
      <ExceptionList items={shown} max={8} label="Open alerts" emptyText="No alerts match this filter" />
    </div>
  </DashboardPanel>
{:else if key === 'users-logins'}
  <DashboardPanel span={span ?? 1} title="Users and logins" subtitle="last sign-in · inactive flagged" {...fr} rows={() => [['Name', 'Roles', 'Active', 'Last sign-in', 'Inactive 30 days'], ...(d.rows ?? []).map((u: any) => [u.name, u.roles.join(' · '), u.active ? 'Yes' : 'No', u.lastLoginAt ?? 'Never', u.inactive ? 'Yes' : ''])]} filename="users-logins" {drill}>
    <div class="tiles4">{#each [['Users', d.counts?.total], ['Active', d.counts?.active], ['Inactive 30 days', d.counts?.inactive], ['Deactivated', d.counts?.deactivated]] as [l, n]}<div><b>{n ?? '—'}</b><span class="caption">{l}</span></div>{/each}</div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Name</th><th class="hide-sm">Roles</th><th>Last sign-in</th></tr></thead>
      <tbody>{#each (d.rows ?? []).slice(0, 14) as u}<tr><td><b>{u.name}</b></td><td class="hide-sm">{#each u.roles as ro}<span class="badge tone-neutral rchip">{ROLE_LABEL[ro as keyof typeof ROLE_LABEL] ?? ro}</span>{/each}</td>
        <td>{#if !u.active}<StatusBadge status="none" label="Deactivated" />{:else if u.inactive}<StatusBadge status="warn" label={u.lastLoginAt ? dayTime(u.lastLoginAt) : 'Never signed in'} />{:else}<span class="small">{dayTime(u.lastLoginAt)}</span>{/if}</td></tr>{/each}</tbody>
    </table></div>
  </DashboardPanel>
{:else if key === 'audit-log'}
  <DashboardPanel span={span ?? 1} title="Audit log" subtitle="activity by day · latest changes" definition="Every change made in the system: who, when, what, with before / after values. Search it in the audit log." unit="actions" period="Recent" loading={!page && !auditErr} error={auditErr} rows={() => [['Time', 'User', 'Feature', 'Summary'], ...(page?.rows ?? []).map((x) => [x.at, x.userName ?? x.userId ?? '', x.feature, x.summary ?? x.path])]} filename="audit-latest" drill={{ label: 'Search the audit log', href: '#/audit' }} updatedAt={page?.rows[0]?.at ?? null} staleAfter={7 * 24 * 60}>
    {#if page}
      <div class="spark"><TrendLine values={page.byDay.map((x) => x.n)} width={260} height={40} label="Actions per day" /><span class="caption">{page.total} actions · {page.byDay.length} days</span></div>
      <ul class="audit">{#each page.rows as x}<li><span class="caption">{dayTime(x.at)}</span><span class="small"><b>{x.userName ?? x.userId ?? 'system'}</b> · {x.summary ?? `${x.method} ${x.path}`}</span></li>{/each}</ul>
    {/if}
  </DashboardPanel>
{/if}

<style>
  .kinds { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
  .kchip { border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); border-radius: var(--radius-md); padding: 3px 8px; font: 500 12px var(--ff-body); cursor: pointer; }
  .kchip.on { background: var(--primary); color: var(--text-on-primary); border-color: var(--primary); }
  .split { display: grid; grid-template-columns: minmax(280px, 2fr) 3fr; gap: var(--space-4); align-items: start; }
  @media (max-width: 900px) { .split { grid-template-columns: minmax(0, 1fr); } }
  .tiles4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3); }
  .tiles4 div { display: flex; flex-direction: column; }
  .tiles4 b { font: 700 22px/1.1 var(--ff-display); }
  .rchip { margin: 0 4px 2px 0; }
  .spark { display: flex; align-items: center; gap: var(--space-3); }
  .audit { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
  .audit li { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: var(--space-2); padding: 6px 0; border-top: 1px solid var(--border); }
  @media (max-width: 600px) { .hide-sm { display: none; } .tiles4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
