<script lang="ts">
  // docs/12 A-07: the audit log for the directors — who did what and when, across the whole system. Search by user,
  // feature, date and text; record edits show their before → after values. Read only.
  import { audit, ref, type AuditEntry, type AuditPage, type User } from '@btw/api';
  import { fmtDateTime, fmtNum } from '@btw/ui';
  import { untrack } from 'svelte';
  import Search from '@lucide/svelte/icons/search';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { watch } from '../lib/load.svelte';
  import { qp } from '../lib/tab';
  import ErrorState from '../components/ErrorState.svelte';
  let { user: _user }: { params?: any; user: User } = $props();

  const FEATURES: [string, string][] = [
    ['plans', 'Purchase orders (drafts)'], ['pos', 'Purchase orders'], ['period-plans', 'Period plans'], ['loadings', 'Loading'], ['loading-points', 'Loading queues (add)'],
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
  let open = $state<string | null>(null);
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

<div class="page-head">
  <div><div class="overline crumb">Admin</div><h1>Audit log</h1><p class="muted small">Every change is recorded: who, when, from which channel, and the values before and after a record edit. Directors only.</p></div>
  {#if days.length > 1}
    <figure class="spark" aria-label="Actions per day">
      <svg viewBox="-2 -2 304 44" preserveAspectRatio="none" role="img" aria-label="{fmtNum(data?.total ?? 0)} actions from {days[0].day} to {days.at(-1)!.day}"><polyline points={spark} /></svg>
      <figcaption class="caption">Actions per day · {days[0].day} – {days.at(-1)!.day} · peak {maxDay}</figcaption>
    </figure>
  {/if}
</div>

<div class="filters">
  <label class="field"><span>User</span><select class="select" bind:value={userId} onchange={reset}><option value="">Everyone</option>{#each users as u (u.id)}<option value={u.id}>{u.name}</option>{/each}</select></label>
  <label class="field"><span>Feature</span><select class="select" bind:value={feature} onchange={reset}><option value="">All features</option>{#each FEATURES as [k, label]}<option value={k}>{label}</option>{/each}</select></label>
  <label class="field"><span>From</span><input class="input" type="date" bind:value={from} onchange={reset} /></label>
  <label class="field"><span>To</span><input class="input" type="date" bind:value={to} onchange={reset} /></label>
  <label class="field"><span>Search</span><span class="search"><Search size={16} /><input class="input" type="search" bind:value={q} oninput={reset} placeholder="Record, path or summary" /></span></label>
</div>

<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<p class="caption">{data ? `${fmtNum(data.total)} action${data.total === 1 ? '' : 's'}` : 'Loading…'}{data && data.total > pageSize ? ` · page ${data.page} of ${pages}` : ''}</p>
<div class="card flush table-wrap">
  <table class="table">
    <thead><tr><th>When</th><th>Who</th><th>Feature</th><th>What</th><th>Record</th><th class="num">Result</th><th><span class="sr-only">Details</span></th></tr></thead>
    <tbody>
      {#if !data}{#each Array(6) as _}<tr><td colspan="7"><div class="skeleton"></div></td></tr>{/each}{/if}
      {#each data?.rows ?? [] as a (a.id)}
        <tr>
          <td class="small nowrap">{fmtDateTime(a.at)}</td>
          <td><strong>{a.userName ?? a.userId ?? 'system'}</strong><div class="caption">{a.channel}</div></td>
          <td class="small">{featureLabel(a.feature)}</td>
          <td class="small">{a.summary ?? `${verb(a.method)} · ${a.path}`}<div class="caption mono">{a.method} {a.path}</div></td>
          <td class="small">{#if a.recordType}{a.recordType}{#if a.recordId}<div class="mono caption">{a.recordId}</div>{/if}{:else}—{/if}</td>
          <td class="num"><span class="status" class:bad={a.status >= 400}>{a.status >= 400 ? `Refused ${a.status}` : 'OK'}</span></td>
          <td>{#if hasChange(a)}<button class="btn btn-ghost btn-sm" aria-expanded={open === a.id} onclick={() => (open = open === a.id ? null : a.id)}>Before → after <ChevronDown size={14} /></button>{/if}</td>
        </tr>
        {#if open === a.id}
          <tr class="detail"><td colspan="7">
            <table class="diff"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
              <tbody>{#each diff(a) as d}<tr><td class="mono small">{d.key}</td><td class="small old">{d.before}</td><td class="small new">{d.after}</td></tr>{:else}<tr><td colspan="3" class="caption">No field changed.</td></tr>{/each}</tbody>
            </table>
          </td></tr>
        {/if}
      {:else}{#if data}<tr><td colspan="7" class="empty">No actions match these filters.</td></tr>{/if}{/each}
    </tbody>
  </table>
</div>
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
  .detail td { background: var(--surface-sunken); }
  .diff { border-collapse: collapse; width: 100%; }
  .diff th, .diff td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
  .old { color: var(--danger); text-decoration: line-through; }
  .new { color: var(--success); }
  .pager { justify-content: center; gap: var(--space-3); margin-top: var(--space-3); }
</style>
