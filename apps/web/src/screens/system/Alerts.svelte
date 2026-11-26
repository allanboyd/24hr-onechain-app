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
  import Truck from '@lucide/svelte/icons/truck';
  import FileText from '@lucide/svelte/icons/file-text';
  import Warehouse from '@lucide/svelte/icons/warehouse';
  import Wallet from '@lucide/svelte/icons/wallet';
  import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
  import Container from '@lucide/svelte/icons/container';
  import ChartPie from '@lucide/svelte/icons/chart-pie';
  import Bell from '@lucide/svelte/icons/bell';
  import PackageCheck from '@lucide/svelte/icons/package-check';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Check from '@lucide/svelte/icons/check';
  import LayoutList from '@lucide/svelte/icons/layout-list';
  import Table2 from '@lucide/svelte/icons/table-2';
  let { user }: { user: User; params?: unknown; section?: boolean } = $props();

  const seesExceptions = $derived(canSeeDash(user, 'alerts'));
  const q = queryFilters({ view: '', since: '', layout: '', area: '', unread: '', kind: '' });
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
  // V3-15: cards / activity by default; the table stays one click away (export, long searches)
  const table = $derived(q.values.layout === 'table');
  const AREA_ICON: Record<string, typeof Truck> = { Fleet: Truck, Purchasing: FileText, Loading: Container, Deliveries: PackageCheck, Fees: Wallet, Warehouse, Sales: ShoppingCart, Management: ChartPie, General: Bell };
  // inbox feed: area chips, unread only, grouped Today / Yesterday / This week / Older
  const feed = $derived(inRows.filter((n) => (!q.values.area || n.area === q.values.area) && (!q.values.unread || !n.read)).sort((a, b) => (a.at < b.at ? 1 : -1)));
  const areas = $derived([...new Set(inRows.map((n) => n.area))].sort());
  const dayStart = (d: number) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const bucket = (at: string) => { const t = Date.parse(at), today = dayStart(Date.now()); return t >= today ? 'Today' : t >= today - 864e5 ? 'Yesterday' : t >= today - 6 * 864e5 ? 'This week' : 'Older'; };
  const groups = $derived(['Today', 'Yesterday', 'This week', 'Older'].map((g) => ({ g, items: feed.filter((n) => bucket(n.at) === g) })).filter((x) => x.items.length));
  async function readOne(n: N) { await notifications.markRead(n.id); inbox = (inbox ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)); }
  // exceptions as cards by severity, with type chips
  const kinds = $derived([...new Set(exRows.map((a) => a.kind))].sort());
  const exShown = $derived(exRows.filter((a) => !q.values.kind || a.kind === q.values.kind));
  const bySev = $derived(SEV.map((s) => ({ s, items: exShown.filter((a) => a.severity === s) })).filter((x) => x.items.length));
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

<div class="bar">
  {#if !table && view === 'inbox'}
    <div class="chips" role="group" aria-label="Area">
      <button class:on={!q.values.area} onclick={() => q.set('area', '')}>All</button>
      {#each areas as a (a)}{@const I = AREA_ICON[a] ?? Bell}<button class:on={q.values.area === a} onclick={() => q.set('area', q.values.area === a ? '' : a)}><I size={14} aria-hidden="true" />{a}</button>{/each}
      <button class:on={!!q.values.unread} aria-pressed={!!q.values.unread} onclick={() => q.set('unread', q.values.unread ? '' : '1')}>Unread only</button>
    </div>
  {:else if !table}
    <div class="chips" role="group" aria-label="Type">
      <button class:on={!q.values.kind} onclick={() => q.set('kind', '')}>All types</button>
      {#each kinds as k (k)}<button class:on={q.values.kind === k} onclick={() => q.set('kind', q.values.kind === k ? '' : k)}>{k}</button>{/each}
    </div>
  {/if}
  <span class="grow"></span>
  {#if !table}{@render sinceSel()}{/if}
  <div class="lsw" role="group" aria-label="Layout">
    <button class:on={!table} aria-pressed={!table} onclick={() => q.set('layout', '')}><LayoutList size={15} aria-hidden="true" />{view === 'inbox' ? 'Activity' : 'Cards'}</button>
    <button class:on={table} aria-pressed={table} onclick={() => q.set('layout', 'table')}><Table2 size={15} aria-hidden="true" />Table</button>
  </div>
</div>

{#if view === 'exceptions' && !table}
  <div class="sevs" role="group" aria-label="Open exceptions by severity">
    {#each counts as c (c.s)}<span class="sev {c.s}"><i></i>{sevLabel(c.s)} <strong>{c.n}</strong></span>{/each}
  </div>
  {#each bySev as grp (grp.s)}
    <section class="sevgrp" aria-label="{sevLabel(grp.s)} alerts">
      <h3 class="gh"><span class="sev {grp.s}"><i></i>{sevLabel(grp.s)}</span><span class="caption">{grp.items.length}</span></h3>
      <div class="cards">
        {#each grp.items as a (a.id)}{@const I = AREA_ICON[a.area] ?? Bell}
          <article class="xc {a.severity}">
            <span class="ic"><I size={18} aria-hidden="true" /></span>
            <div class="body"><strong>{a.title}</strong><p>{a.detail}</p>
              <div class="meta"><span class="tag">{a.kind}</span><span>{a.area}</span>{#if a.owner}<span>· {a.owner} acts</span>{/if}{#if a.at}<span>· {ago(a.at)}</span>{/if}{#if a.due}<span>· due {fmtDateTime(a.due)}</span>{/if}</div></div>
            <a class="btn btn-secondary btn-sm" href={a.href}>Open <ArrowRight size={14} /></a>
          </article>
        {/each}
      </div>
    </section>
  {:else}{#if ex}<div class="card empty"><h3>Nothing needs attention</h3><p class="caption">No open exception{q.values.kind ? ` of type ${q.values.kind}` : ''} in this period.</p></div>{/if}{/each}
{:else if view === 'exceptions'}
  <div class="sevs" role="group" aria-label="Open exceptions by severity">
    {#each counts as c (c.s)}<span class="sev {c.s}"><i></i>{sevLabel(c.s)} <strong>{c.n}</strong></span>{/each}
  </div>
  <DataTable id="alerts-exceptions" label="Open exceptions" noun="alerts" rows={ex ? exRows : null} columns={exCols} rowKey={(a) => a.id} onrowclick={(a) => (location.hash = a.href.slice(1))}
    initialSort={{ key: 'sev', dir: 'asc' }} filename="open-exceptions" searchable searchPlaceholder="Truck, order, warehouse…" bind:search={es} bind:filters={ef} emptyTitle="Nothing needs attention">
    {#snippet toolbar()}{@render sinceSel()}{/snippet}
  </DataTable>
{:else if !table}
  {#each groups as grp (grp.g)}
    <section class="day" aria-label={grp.g}>
      <h3 class="gh">{grp.g}<span class="caption">{grp.items.length}</span></h3>
      <ol class="feed">
        {#each grp.items as n (n.id)}{@const I = AREA_ICON[n.area] ?? Bell}
          <li class:unread={!n.read}>
            <span class="ic {n.area.toLowerCase()}"><I size={17} aria-hidden="true" /></span>
            <div class="body">
              <div class="t">{#if !n.read}<span class="dot on" aria-label="Unread"></span>{/if}<strong>{n.title}</strong></div>
              <p>{n.body}</p>
              <div class="meta"><span>{n.area}</span><span>· {ago(n.at)}</span></div>
            </div>
            <div class="acts">
              {#if n.link}<button class="btn btn-secondary btn-sm" onclick={() => openN(n)}>Open</button>{/if}
              {#if !n.read}<button class="btn btn-ghost btn-sm" onclick={() => readOne(n)} aria-label="Mark {n.title} as read"><Check size={14} />Mark read</button>{/if}
            </div>
          </li>
        {/each}
      </ol>
    </section>
  {:else}{#if inbox}<div class="card empty"><h3>You're all caught up</h3><p class="caption">{q.values.unread || q.values.area ? 'Nothing matches these choices.' : 'New alerts about your work will show here.'}</p></div>{/if}{/each}
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
  .bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: var(--space-3) 0; }
  .grow { flex: 1; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button, .lsw button { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); border-radius: 99px; padding: 5px 11px; font: inherit; font-size: 13px; cursor: pointer; }
  .chips button.on { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary, #fff); }
  .lsw { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-sunken); }
  .lsw button { border: 0; background: none; border-radius: 8px; }
  .lsw button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / .08); }
  .gh { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); margin: var(--space-4) 0 var(--space-2); }
  .feed { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); overflow: hidden; }
  .feed li { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--border); }
  .feed li:first-child { border-top: 0; }
  .feed li.unread { background: color-mix(in srgb, var(--primary-subtle) 70%, transparent); }
  .ic { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--surface-sunken); color: var(--text-muted); }
  .ic.fleet, .ic.deliveries { color: var(--primary); } .ic.fees, .ic.money { color: var(--success); } .ic.warehouse, .ic.loading { color: var(--accent); } .ic.purchasing { color: var(--info, var(--primary)); }
  .body { flex: 1; min-width: 0; } .body p { margin: 2px 0 0; font-size: 13.5px; color: var(--text-muted); }
  .t { display: flex; align-items: center; gap: 6px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; font-size: 12px; color: var(--text-subtle); }
  .tag { padding: 1px 7px; border-radius: 99px; background: var(--surface-sunken); color: var(--text-muted); }
  .acts { display: flex; gap: 6px; flex: none; align-items: center; }
  .cards { display: grid; gap: 8px; }
  .xc { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
  .xc.critical { background: color-mix(in srgb, var(--danger) 7%, var(--surface)); border-color: color-mix(in srgb, var(--danger) 30%, var(--border)); }
  .xc.critical .ic { color: var(--danger); } .xc.high .ic { color: var(--accent); }
  .empty { padding: var(--space-6); text-align: center; }
  @media (max-width: 640px) { .feed li, .xc { flex-wrap: wrap; } .acts { width: 100%; justify-content: flex-end; } }
</style>
