<script lang="ts">
  // Exceptions beneath the KPI row: delayed trucks / alerts with a severity icon + word, named owner, due time (overdue in red) and a drill link.
  import { SEVERITY, STATUS, type Severity } from './status';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Clock from '@lucide/svelte/icons/clock';
  import UserIcon from '@lucide/svelte/icons/user';
  export interface ExceptionItem { id: string; severity: Severity; title: string; detail?: string; owner?: string | null; due?: string | number | Date | null; status?: string; href?: string; onclick?: () => void }
  let { items, max = 6, now = Date.now(), emptyText = 'No exceptions right now', moreHref, label = 'Exceptions' }: {
    items: ExceptionItem[]; max?: number; /** injectable clock (tests, gallery) */ now?: number; emptyText?: string; moreHref?: string; label?: string;
  } = $props();
  const sorted = $derived([...items].sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || (+new Date(a.due ?? 8.64e15) - +new Date(b.due ?? 8.64e15))));
  function dueText(due: ExceptionItem['due']) {
    if (due == null) return { text: 'No due time', late: false };
    const ms = +new Date(due) - now, h = Math.abs(ms) / 3.6e6;
    const span = h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`;
    return ms < 0 ? { text: `Overdue ${span}`, late: true } : { text: `Due in ${span}`, late: false };
  }
</script>
<ul class="exc" aria-label={label}>
  {#each sorted.slice(0, max) as e (e.id)}
    {@const s = SEVERITY[e.severity]}
    {@const m = STATUS[s.status]}
    {@const d = dueText(e.due)}
    <li>
      <svelte:element this={e.href ? 'a' : e.onclick ? 'button' : 'div'} href={e.href} type={e.onclick && !e.href ? 'button' : undefined} role={e.href || e.onclick ? undefined : 'group'} onclick={e.onclick} class="item" class:pick={!!(e.href || e.onclick)}>
        <span class="sev" style:color={m.ink} style:background={m.bg}><s.icon size={16} aria-hidden="true" /><span>{s.label}</span></span>
        <span class="body">
          <span class="t">{e.title}</span>
          {#if e.detail}<span class="small muted">{e.detail}</span>{/if}
          <span class="meta caption">
            <span class:unowned={!e.owner}><UserIcon size={12} aria-hidden="true" />{e.owner ?? 'Owner not assigned'}</span>
            <span class:late={d.late}><Clock size={12} aria-hidden="true" />{d.text}</span>
            {#if e.status}<span>{e.status}</span>{/if}
          </span>
        </span>
        {#if e.href || e.onclick}<ChevronRight size={18} aria-hidden="true" class="chev" />{/if}
      </svelte:element>
    </li>
  {:else}<li class="empty">{emptyText}</li>{/each}
</ul>
{#if items.length > max && moreHref}<a class="btn btn-ghost btn-sm" href={moreHref}>All {items.length} exceptions</a>{/if}
<style>
  .exc { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .exc li + li { border-top: 1px solid var(--border); }
  .item { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-1); width: 100%; text-align: left; font: inherit; color: inherit; text-decoration: none; background: none; border: 0; min-height: 48px; }
  .pick { cursor: pointer; } .pick:hover { background: var(--primary-subtle); }
  .sev { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-sm); flex: none; min-width: 84px; }
  .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .t { font-weight: 600; }
  .meta { display: flex; flex-wrap: wrap; gap: 2px var(--space-3); }
  .meta span { display: inline-flex; align-items: center; gap: 4px; }
  .late { color: var(--danger); font-weight: 600; }
  .unowned { color: var(--warning); font-weight: 600; }
  .item :global(.chev) { color: var(--text-subtle); align-self: center; flex: none; }
  .empty { padding: var(--space-6) var(--space-4); }
</style>
