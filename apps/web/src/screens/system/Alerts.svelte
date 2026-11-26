<script lang="ts">
  // V3-13 Settings & alerts → Alerts. Two views:
  //  · Open exceptions: worked out from the records (the Alerts centre data, dashboards key `alerts`): type, severity,
  //    status, owner, area, date. For the people who see the Alerts centre (directors, the truck follow-up officer, the planner).
  //  · Inbox: the notifications sent to me (read / unread, Mark all read), with area (from the link) and date filters.
  import { dashboards, notifications, type Notification, type User } from '@btw/api';
  import { canSeeDash, type DashAlert } from '@btw/api/dashboards';
  import { ago, fmtDateTime, say } from '@btw/ui';
  import { DataTable, Tabs, queryFilters, type Column } from '../../components/page';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  let { user }: { user: User; params?: unknown; section?: boolean } = $props();

  const seesExceptions = $derived(canSeeDash(user, 'alerts'));
  const q = queryFilters({ view: '', since: '' });
  const view = $derived(seesExceptions && q.values.view !== 'inbox' ? 'exceptions' : 'inbox');

  // ---- data
  type Ex = DashAlert & { area: string };
  let ex = $state<Ex[] | null>(null);
  let inbox = $state<Notification[] | null>(null);
  const AREA_OF_KIND: Record<DashAlert['kind'], string> = {
    Delay: 'Fleet', 'No update': 'Fleet', 'Not acknowledged': 'Deliveries', 'Shortage / damage': 'Deliveries', 'Unpaid fee': 'Fees',
    'Agreed price missing': 'Fees', 'Order waiting': 'Loading', 'Low stock': 'Warehouse', 'No expenses': 'Warehouse',
  };
  const AREA_OF_LINK: [RegExp, string][] = [[/^#\/(pos|period-plans|plans)/, 'Purchasing'], [/^#\/trucks/, 'Loading'], [/^#\/shipments/, 'Fleet'],
    [/^#\/transport-costs/, 'Fees'], [/^#\/(stock|warehouse-expenses|re-exports)/, 'Warehouse'], [/^#\/sales/, 'Sales'], [/^#\/management/, 'Management']];
  const areaOfLink = (link?: string) => AREA_OF_LINK.find(([re]) => link && re.test(link))?.[1] ?? 'General';
  const w = watch(async () => {
    const [d, n] = await Promise.all([
      seesExceptions ? dashboards.get(['alerts'], {}).then((r) => (r.results['alerts']?.data as { items: DashAlert[] } | undefined)?.items ?? []) : Promise.resolve([] as DashAlert[]),
      notifications.list(),
    ]);
    ex = d.map((a) => ({ ...a, area: AREA_OF_KIND[a.kind] ?? 'General' }));
    inbox = n;
  });
  const unread = $derived((inbox ?? []).filter((n) => !n.read).length);

  // date filter (both views): today, last 7 days, last 30 days, all
  const SINCE: Record<string, number> = { today: 1, '7': 7, '30': 30 };
  const since = $derived(SINCE[q.values.since] ? Date.now() - SINCE[q.values.since] * 864e5 : 0);
  const inDate = (at: string | null | undefined) => !since || (!!at && Date.parse(at) >= since);

  // ---- open exceptions
  const SEV = ['critical', 'high', 'medium', 'low'] as const;
  const sevLabel = (s: string) => s[0].toUpperCase() + s.slice(1);
  let es = $state(''), ef = $state({});
  const exRows = $derived((ex ?? []).filter((a) => inDate(a.at)));
  const exCols: Column<Ex>[] = [
    { key: 'sev', label: 'Severity', sortValue: (a) => SEV.indexOf(a.severity), value: (a) => sevLabel(a.severity), cell: sevCell, filter: 'select', filterValue: (a) => a.severity, filterLabel: sevLabel, mobile: 'aside' },
    { key: 'title', label: 'Alert', sticky: true, mobile: 'title', value: (a) => a.title, cell: titleCell },
    { key: 'kind', label: 'Type', value: (a) => a.kind, filter: 'select', class: 'small' },
    { key: 'area', label: 'Area', value: (a) => a.area, filter: 'select', class: 'small', hideBelow: 900 },
    { key: 'status', label: 'Status', value: (a) => a.status || '-', filter: 'select', class: 'small', hideBelow: 900 },
    { key: 'owner', label: 'Who acts', value: (a) => a.owner ?? '-', filter: 'select', class: 'small', hideBelow: 1100 },
    { key: 'at', label: 'Since', sortValue: (a) => a.at ?? '', value: (a) => (a.at ? ago(a.at) : '-'), csv: (a) => a.at ?? '', class: 'small nowrap' },
  ];
  const counts = $derived(SEV.map((s) => ({ s, n: exRows.filter((a) => a.severity === s).length })));

  // ---- inbox
  let ns = $state(''), nf = $state({});
  type N = Notification & { area: string };
  const inRows = $derived<N[]>((inbox ?? []).filter((n) => inDate(n.at)).map((n) => ({ ...n, area: areaOfLink(n.link) })));
  const inCols: Column<N>[] = [
    { key: 'read', label: '', sortValue: (n) => (n.read ? 1 : 0), value: (n) => (n.read ? 'Read' : 'Unread'), cell: dotCell, filter: 'select', searchable: false },
    { key: 'title', label: 'Alert', sticky: true, mobile: 'title', value: (n) => n.title, cell: nTitleCell },
    { key: 'area', label: 'Area', value: (n) => n.area, filter: 'select', class: 'small', hideBelow: 900 },
    { key: 'at', label: 'When', sortValue: (n) => n.at, value: (n) => ago(n.at), csv: (n) => n.at, class: 'small nowrap', mobile: 'aside' },
  ];
  async function openN(n: N) { if (!n.read) { await notifications.markRead(n.id); n.read = true; inbox = [...(inbox ?? [])]; } if (n.link) location.hash = n.link.slice(1); }
  async function readAll() { await notifications.readAll(); inbox = (inbox ?? []).map((n) => ({ ...n, read: true })); say('All marked as read'); }
  const views = $derived([...(seesExceptions ? [{ key: 'exceptions' as const, label: 'Open exceptions', n: ex?.length ?? null }] : []), { key: 'inbox' as const, label: 'Inbox', n: unread || null }]);
</script>

<div class="page-head">
  <div><h1>Alerts</h1><p class="muted small">{seesExceptions ? 'What needs attention now, and what you were told.' : 'What you were told about your work.'}</p></div>
  {#if view === 'inbox'}<button class="btn btn-secondary" onclick={readAll} disabled={!unread}>Mark all read</button>{/if}
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
{#if views.length > 1}<Tabs label="Alerts" tabs={views} value={view} onselect={(k) => q.set('view', k === 'exceptions' ? '' : k)} />{/if}

{#snippet sinceSel()}
  <label class="since"><span class="caption">Date</span><select class="select" value={q.values.since} onchange={(e) => q.set('since', e.currentTarget.value)}>
    <option value="">Any time</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>
{/snippet}

{#if view === 'exceptions'}
  <div class="sevs" role="group" aria-label="Open exceptions by severity">
    {#each counts as c (c.s)}<span class="sev {c.s}"><i></i>{sevLabel(c.s)} <strong>{c.n}</strong></span>{/each}
  </div>
  <DataTable id="alerts-exceptions" label="Open exceptions" noun="alerts" rows={ex ? exRows : null} columns={exCols} rowKey={(a) => a.id} onrowclick={(a) => (location.hash = a.href.slice(1))}
    initialSort={{ key: 'sev', dir: 'asc' }} filename="open-exceptions" searchable searchPlaceholder="Truck, order, warehouse…" bind:search={es} bind:filters={ef} emptyTitle="Nothing needs attention">
    {#snippet toolbar()}{@render sinceSel()}{/snippet}
  </DataTable>
{:else}
  <DataTable id="alerts-inbox" label="Inbox" noun="alerts" rows={inbox ? inRows : null} columns={inCols} rowKey={(n) => n.id} onrowclick={openN} rowClass={(n) => (n.read ? '' : 'unread')}
    initialSort={{ key: 'at', dir: 'desc' }} filename="alerts-inbox" searchable searchPlaceholder="Alert, truck, order…" bind:search={ns} bind:filters={nf} emptyTitle="You're all caught up">
    {#snippet toolbar()}{@render sinceSel()}{/snippet}
  </DataTable>
{/if}

{#snippet sevCell(a: Ex)}<span class="sev {a.severity}"><i></i>{sevLabel(a.severity)}</span>{/snippet}
{#snippet titleCell(a: Ex)}<strong>{a.title}</strong><div class="caption">{a.detail}{#if a.due} · due {fmtDateTime(a.due)}{/if}</div>{/snippet}
{#snippet dotCell(n: N)}<span class="dot" class:on={!n.read} aria-label={n.read ? 'Read' : 'Unread'}></span>{/snippet}
{#snippet nTitleCell(n: N)}<strong>{n.title}</strong><div class="caption">{n.body}</div>{/snippet}

<style>
  .sevs { display: flex; flex-wrap: wrap; gap: 8px; margin: var(--space-3) 0; }
  .sev { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
  .sevs .sev { padding: 4px 10px; border-radius: 99px; background: var(--surface); border: 1px solid var(--border); }
  .sev i { width: 8px; height: 8px; border-radius: 50%; background: var(--text-subtle); }
  .sev.critical i { background: var(--danger); } .sev.high i { background: var(--accent); }
  .sev.medium i { background: var(--warning-solid, var(--warning)); } .sev.low i { background: var(--info, var(--text-subtle)); }
  .since { display: inline-flex; align-items: center; gap: 6px; } .since .select { width: auto; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: transparent; }
  .dot.on { background: var(--accent); }
  :global(tr.unread td) { background: var(--primary-subtle); }
</style>
