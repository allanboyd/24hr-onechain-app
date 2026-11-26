<script lang="ts">
  import SystemNav from '../components/SystemNav.svelte';
  // docs/12 A-07: the audit log for the directors — who did what and when, across the whole system. Search by user,
  // feature, date and text; record edits show their before → after values. Read only.
  import { audit, ref, type AuditEntry, type AuditPage, type User } from '@btw/api';
  import { fmtDateTime, fmtNum } from '@btw/ui';
  import { untrack } from 'svelte';
  import Search from '@lucide/svelte/icons/search';
  import { watch } from '../lib/load.svelte';
  import { qp } from '../lib/tab';
  import ErrorState from '../components/ErrorState.svelte';
  import { DataTable, type Column } from '../components/page';
  let { user }: { params?: any; user: User } = $props();

  const FEATURES: [string, string][] = [
    ['plans', 'Purchase orders (older entries)'], ['pos', 'Purchase orders'], ['period-plans', 'Period plans'], ['loadings', 'Loading'], ['loading-points', 'Loading queues (add)'],
    ['waiting', 'Loading queues'], ['shipments', 'Shipments'], ['legs', 'Trips & check-ins'], ['finance', 'Truck expenses & payments'], ['masterdata', 'Static & transport data'],
    ['users', 'Users & roles'], ['sales', 'Sales'], ['settings', 'Settings'], ['sync', 'Offline sync'], ['positions', 'GPS'],
  ];
  const featureLabel = (f: string) => FEATURES.find(([k]) => k === f)?.[1] ?? f;
  const users = ref().users;
  let userId = $state(''); let feature = $state(''); let from = $state(''); let to = $state('');
  let q = $state(untrack(() => qp('q')));
  let page = $state(1);
  const pageSize = 50;
  let data = $state<AuditPage | null>(null);
  const w = watch(async () => { data = await audit.list({ userId: userId || undefined, feature: feature || undefined, from: from || undefined, to: to || undefined, q: q.trim() || undefined, page, pageSize }); },
    () => [userId, feature, from, to, q, page]);
  const reset = () => { page = 1; };
  // V3-8 batch 2: the log is searched and paged on the server (it keeps growing); the table shows one page, a row opens
  // its before → after in a dialog
  let open = $state<AuditEntry | null>(null);
  let dlg = $state<HTMLDialogElement>();
  function show(a: AuditEntry) { open = a; dlg?.showModal(); }
  const columns: Column<AuditEntry>[] = [
    { key: 'at', label: 'When', sortValue: (a) => a.at, value: (a) => fmtDateTime(a.at), csv: (a) => a.at, class: 'small nowrap' },
    { key: 'who', label: 'Who', mobile: 'title', value: (a) => a.userName ?? a.userId ?? 'system', cell: whoCell },
    { key: 'feature', label: 'Feature', value: (a) => featureLabel(a.feature), class: 'small', hideBelow: 900 },
    { key: 'what', label: 'What', value: (a) => a.summary ?? `${verb(a.method)} · ${a.path}`, cell: whatCell, class: 'small' },
    { key: 'record', label: 'Record', value: (a) => a.recordType ?? '-', cell: recordCell, class: 'small', hideBelow: 1100 },
    { key: 'result', label: 'Result', align: 'right', sortValue: (a) => a.status, value: (a) => (a.status >= 400 ? `Refused ${a.status}` : 'OK'), cell: resultCell, mobile: 'aside' },
    { key: 'change', label: '', sortable: false, csv: false, cell: changeCell },
  ];
  const pages = $derived(data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1);

  // before → after: the keys that changed
  function diff(a: AuditEntry): { key: string; before: string; after: string }[] {
    const b = (a.before ?? {}) as Record<string, unknown>, c = (a.after ?? {}) as Record<string, unknown>;
    if (typeof b !== 'object' || typeof c !== 'object') return [{ key: 'value', before: JSON.stringify(a.before ?? null), after: JSON.stringify(a.after ?? null) }];
    const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(c ?? {})])];
    const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));
    return keys.filter((k) => JSON.stringify(b?.[k]) !== JSON.stringify(c?.[k])).map((k) => ({ key: k, before: show(b?.[k]), after: show(c?.[k]) }));
  }
  const hasChange = (a: AuditEntry) => a.before !== undefined && a.before !== null || a.after !== undefined && a.after !== null;
  const verb = (m: string) => ({ POST: 'Created / did', PUT: 'Saved', PATCH: 'Edited', DELETE: 'Removed', UNDO: 'Undid' } as Record<string, string>)[m] ?? m;
  // sparkline: actions per day
  const days = $derived(data?.byDay ?? []);
  const maxDay = $derived(Math.max(1, ...days.map((d) => d.n)));
  const spark = $derived(days.map((d, i) => `${(i / Math.max(1, days.length - 1)) * 300},${40 - (d.n / maxDay) * 36}`).join(' '));
</script>

<SystemNav {user} current="audit" />
<div class="page-head">
  <div><div class="overline crumb">System settings & logs</div><h1>Audit log</h1><p class="muted small">Every change is recorded: who, when, from which channel, and the values before and after a record edit. Directors only.</p></div>
  {#if days.length > 1}
    <figure class="spark" aria-label="Actions per day">
      <svg viewBox="-2 -2 304 44" preserveAspectRatio="none" role="img" aria-label="{fmtNum(data?.total ?? 0)} actions from {days[0].day} to {days.at(-1)!.day}"><polyline points={spark} /></svg>
      <figcaption class="caption">Actions per day · {days[0].day} – {days.at(-1)!.day} · peak {maxDay}</figcaption>
    </figure>
  {/if}
</div>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<DataTable id="audit" label="Audit log" noun="actions" rows={data ? data.rows : null} {columns} rowKey={(a) => a.id} onrowclick={show} initialSort={{ key: 'at', dir: 'desc' }} pageSize={pageSize} filename="audit-log"
  caption={data ? `${fmtNum(data.total)} action${data.total === 1 ? '' : 's'}${data.total > pageSize ? ` · page ${data.page} of ${pages}` : ''}` : 'Loading…'} emptyTitle="No actions match these filters">
  {#snippet toolbar()}
    <label class="field tb"><span class="caption">Search</span><span class="search"><Search size={16} /><input class="input" type="search" bind:value={q} oninput={reset} placeholder="Record, path or summary" /></span></label>
    <label class="field tb"><span class="caption">User</span><select class="select" bind:value={userId} onchange={reset}><option value="">Everyone</option>{#each users as u (u.id)}<option value={u.id}>{u.name}</option>{/each}</select></label>
    <label class="field tb"><span class="caption">Feature</span><select class="select" bind:value={feature} onchange={reset}><option value="">All features</option>{#each FEATURES as [k, label]}<option value={k}>{label}</option>{/each}</select></label>
    <label class="field tb"><span class="caption">From</span><input class="input" type="date" bind:value={from} onchange={reset} /></label>
    <label class="field tb"><span class="caption">To</span><input class="input" type="date" bind:value={to} onchange={reset} /></label>
  {/snippet}
</DataTable>

{#snippet whoCell(a: AuditEntry)}<strong>{a.userName ?? a.userId ?? 'system'}</strong><div class="caption">{a.channel}</div>{/snippet}
{#snippet whatCell(a: AuditEntry)}{a.summary ?? `${verb(a.method)} · ${a.path}`}<div class="caption mono">{a.method} {a.path}</div>{/snippet}
{#snippet recordCell(a: AuditEntry)}{#if a.recordType}{a.recordType}{#if a.recordId}<div class="mono caption">{a.recordId}</div>{/if}{:else}-{/if}{/snippet}
{#snippet resultCell(a: AuditEntry)}<span class="status" class:bad={a.status >= 400}>{a.status >= 400 ? `Refused ${a.status}` : 'OK'}</span>{/snippet}
{#snippet changeCell(a: AuditEntry)}{#if hasChange(a)}<button class="btn btn-ghost btn-sm nowrap" onclick={(e) => { e.stopPropagation(); show(a); }}>Before → after</button>{/if}{/snippet}

<dialog class="sheet" bind:this={dlg} style="width:min(720px,calc(100vw - 32px))" aria-labelledby="au-h">
  {#if open}
    <div class="body stack">
      <h3 id="au-h">{open.summary ?? `${verb(open.method)} · ${open.path}`}</h3>
      <p class="caption">{open.userName ?? open.userId ?? 'system'} · {open.channel} · {fmtDateTime(open.at)} · <span class="mono">{open.method} {open.path}</span>{#if open.recordType} · {open.recordType} <span class="mono">{open.recordId ?? ''}</span>{/if}</p>
      {#if hasChange(open)}
        <table class="diff"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
          <tbody>{#each diff(open) as d}<tr><td class="mono small">{d.key}</td><td class="small old">{d.before}</td><td class="small new">{d.after}</td></tr>{:else}<tr><td colspan="3" class="caption">No field changed.</td></tr>{/each}</tbody>
        </table>
      {:else}<p class="caption">This action has no record values to compare.</p>{/if}
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => dlg?.close()}>Close</button></div>
    </div>
  {/if}
</dialog>
{#if pages > 1}
  <div class="row pager"><button class="btn btn-secondary btn-sm" disabled={page <= 1} onclick={() => (page -= 1)}>Previous</button><span class="caption">Page {page} of {pages}</span><button class="btn btn-secondary btn-sm" disabled={page >= pages} onclick={() => (page += 1)}>Next</button></div>
{/if}

<style>
  .search { position: relative; display: flex; align-items: center; }
  .search :global(svg) { position: absolute; left: 10px; color: var(--text-subtle); }
  .search .input { padding-left: 32px; min-width: 220px; }
  .spark { margin: 0; width: 300px; max-width: 100%; }
  .spark svg { width: 100%; height: 44px; display: block; }
  .spark polyline { fill: none; stroke: var(--primary); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .nowrap { white-space: nowrap; }
  .status { font-weight: 600; color: var(--success); }
  .status.bad { color: var(--danger); }
  .tb { gap: 2px; }
  .diff { border-collapse: collapse; width: 100%; }
  .diff th, .diff td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
  .old { color: var(--danger); text-decoration: line-through; }
  .new { color: var(--success); }
  .pager { justify-content: center; gap: var(--space-3); margin-top: var(--space-3); }
</style>
