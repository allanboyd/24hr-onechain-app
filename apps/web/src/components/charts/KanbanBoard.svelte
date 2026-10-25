<script lang="ts">
  // Status board (live fleet): one column per status with its count, cards grouped inside by a key (e.g. route). Plain Svelte, no Plotly.
  // Columns scroll sideways on phones; every card states its status in words.
  import StatusBadge from './StatusBadge.svelte';
  import { STATUS, type Status } from './status';
  export interface KanbanColumn { key: string; label: string; status?: Status }
  export interface KanbanCard { id: string; column: string; title: string; group?: string; subtitle?: string; meta?: string; status?: Status; statusLabel?: string; stale?: boolean }
  let { columns, cards, groupLabel = 'Route', summary = true, oncard }: {
    columns: KanbanColumn[]; cards: KanbanCard[]; groupLabel?: string; /** status counts across the top */ summary?: boolean;
    oncard?: (card: KanbanCard) => void;
  } = $props();
  const inCol = (k: string) => cards.filter((c) => c.column === k);
  const grouped = (k: string) => {
    const m = new Map<string, KanbanCard[]>();
    for (const c of inCol(k)) (m.get(c.group ?? '') ?? m.set(c.group ?? '', []).get(c.group ?? '')!).push(c);
    return [...m.entries()];
  };
</script>
{#if summary}
  <ul class="kb-sum" aria-label="Count by status">
    {#each columns as col}{@const m = STATUS[col.status ?? 'none']}<li><m.icon size={14} aria-hidden="true" style="color:{m.ink}" /><span>{col.label}</span><b>{inCol(col.key).length}</b></li>{/each}
  </ul>
{/if}
<div class="kb" role="list" aria-label="Board by status">
  {#each columns as col}
    {@const list = inCol(col.key)}
    <section class="col" role="listitem" aria-label="{col.label}: {list.length}" style:--edge={STATUS[col.status ?? 'none'].fill}>
      <header><span>{col.label}</span><span class="count">{list.length}</span></header>
      {#each grouped(col.key) as [g, cs]}
        {#if g}<div class="grp caption" title="{groupLabel}: {g}">{g}</div>{/if}
        {#each cs as c (c.id)}
          <svelte:element this={oncard ? 'button' : 'div'} class="kc" class:stale={c.stale} type={oncard ? 'button' : undefined} role={oncard ? undefined : 'group'} onclick={oncard ? () => oncard(c) : undefined}>
            <div class="row between" style="gap:var(--space-2);flex-wrap:nowrap"><strong>{c.title}</strong>{#if c.status}<StatusBadge status={c.status} label={c.statusLabel} size={12} />{/if}</div>
            {#if c.subtitle}<div class="small muted">{c.subtitle}</div>{/if}
            {#if c.meta}<div class="caption">{c.meta}{#if c.stale} · not updated recently{/if}</div>{/if}
          </svelte:element>
        {/each}
      {:else}<p class="caption none">No trucks</p>{/each}
    </section>
  {/each}
</div>
<style>
  .kb-sum { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); font-size: var(--fs-body-sm); }
  .kb-sum li { display: inline-flex; align-items: center; gap: 6px; } .kb-sum b { font-variant-numeric: tabular-nums; }
  .kb { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(200px, 1fr); gap: var(--space-3); overflow-x: auto; padding-bottom: var(--space-2); scroll-snap-type: x proximity; }
  .col { background: var(--surface-sunken); border-radius: var(--radius-md); padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-2); border-top: 3px solid var(--edge); scroll-snap-align: start; min-width: 0; }
  .col header { display: flex; justify-content: space-between; align-items: center; font-weight: 600; padding: 2px 4px; }
  .count { font-variant-numeric: tabular-nums; background: var(--surface); border-radius: var(--radius-full); padding: 0 8px; font-size: var(--fs-caption); border: 1px solid var(--border); }
  .grp { padding: 4px 4px 0; text-transform: none; font-weight: 600; color: var(--text-muted); }
  .kc { display: flex; flex-direction: column; gap: 2px; text-align: left; font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); min-height: 44px; }
  button.kc { cursor: pointer; } button.kc:hover { border-color: var(--border-strong); }
  .kc.stale { opacity: 0.65; border-style: dashed; }
  .none { padding: 4px; }
  @media (max-width: 600px) { .kb { grid-auto-columns: 78%; } }
</style>
