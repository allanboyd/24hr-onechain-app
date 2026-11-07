<script lang="ts">
  // Card frame of the directors' Today view: title + ⓘ definition on the left, period select / export on the right (one row,
  // like the reference), one quiet caption line (unit · period · freshness), the body, and an optional "View details" link.
  // Lighter than DashboardPanel on purpose: no View-data toggle or second metadata row — the deeper tabs keep those.
  import type { Snippet } from 'svelte';
  import ExportMenu from '../../../components/dashboard/ExportMenu.svelte';
  import Freshness from '../../../components/dashboard/Freshness.svelte';
  import type { Rows } from '../../../components/dashboard/export/meta';
  import { freshnessText } from '../../../components/dashboard/Freshness.svelte';
  import Info from '@lucide/svelte/icons/info';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  let { title, definition = '', caption = '', decision = '', updatedAt, rows, filename, drill, empty = false, emptyText = 'No data yet', actions, children, flush = false }: {
    title: string; definition?: string; caption?: string; decision?: string; updatedAt?: string | null;
    rows?: () => Rows; filename?: string; drill?: { label: string; href: string };
    empty?: boolean; emptyText?: string; actions?: Snippet; children: Snippet; /** body touches the card edges (tables) */ flush?: boolean;
  } = $props();
  const uid = `tc-${Math.random().toString(36).slice(2, 8)}`;
  let info = $state(false);
  let infoEl = $state<HTMLSpanElement>();
  let body = $state<HTMLDivElement>();
  $effect(() => {
    if (!info) return;
    const away = (e: Event) => { if (infoEl && !infoEl.contains(e.target as Node)) info = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') info = false; };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  });
  const name = $derived(filename ?? title.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, ''));
</script>

<section class="tc" aria-labelledby="{uid}-t">
  <header>
    <div class="ttl">
      <h3 id="{uid}-t">{title}</h3>
      {#if definition}
        <span class="info" bind:this={infoEl}>
          <button class="ibtn" aria-expanded={info} aria-controls="{uid}-d" aria-label="What {title} means" onclick={() => (info = !info)}><Info size={15} /></button>
          {#if info}<div class="pop" id="{uid}-d" role="note"><strong>{title}</strong><p>{definition}</p></div>{/if}
        </span>
      {/if}
    </div>
    <div class="tools">
      {@render actions?.()}
      {#if rows && !empty}<ExportMenu {name} meta={() => ({ title, subtitle: caption, definition, unit: '', period: caption, filters: '', owner: 'Directors', freshness: updatedAt === undefined ? '' : freshnessText(updatedAt) })} {rows} root={() => body} />{/if}
    </div>
  </header>
  {#if caption || updatedAt !== undefined}
    <p class="cap">{#if caption}<span>{caption}</span>{/if}{#if updatedAt !== undefined}<Freshness at={updatedAt} staleAfter={30 * 24 * 60} />{/if}</p>
  {/if}
  {#if decision}<p class="decision"><b>Decision</b> {decision}</p>{/if}
  <div class="body" class:flush bind:this={body}>
    {#if empty}<div class="nodata" role="status"><CircleDashed size={20} aria-hidden="true" /><span>{emptyText}</span></div>
    {:else}{@render children()}{/if}
  </div>
  {#if drill && !empty}<a class="drill" href={drill.href}>{drill.label}<ArrowRight size={15} aria-hidden="true" /></a>{/if}
</section>

<style>
  .tc { display: flex; flex-direction: column; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--elevation-1); padding: var(--space-5) var(--space-6); }
  header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); min-height: 32px; }
  .ttl { display: flex; align-items: center; gap: 2px; min-width: 0; flex: 1 0 auto; }
  h3 { font-size: 16px; line-height: 1.3; font-weight: 700; margin: 0; }
  .tools { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end; }
  .cap { display: flex; flex-wrap: wrap; gap: 2px var(--space-3); margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
  .decision { margin: 6px 0 0; font-size: 13px; color: var(--text); line-height: 1.4; }
  .decision b { margin-right: 6px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
  .body { margin-top: var(--space-4); min-width: 0; flex: 1; display: flex; flex-direction: column; }
  .body.flush { margin-left: calc(-1 * var(--space-6)); margin-right: calc(-1 * var(--space-6)); }
  .info { position: relative; display: inline-flex; }
  .ibtn { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--radius-full, 999px); border: 0; background: none; color: var(--text-subtle); cursor: pointer; }
  .ibtn:hover, .ibtn[aria-expanded='true'] { color: var(--text); background: var(--surface-sunken); }
  .pop { position: absolute; left: 0; top: calc(100% + 4px); z-index: 30; width: min(340px, 80vw); background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--elevation-2); padding: var(--space-3); font-size: 13px; font-weight: 400; }
  .pop p { margin: 4px 0 0; color: var(--text-muted); }
  .nodata { display: flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 140px; color: var(--text-muted); background: var(--surface-sunken); border-radius: var(--radius-md); font-size: 14px; }
  .drill { align-self: stretch; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: var(--space-4); padding: 9px var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border); color: var(--text); font-weight: 600; font-size: 13px; text-decoration: none; }
  .drill:hover { background: var(--surface-sunken); }
  @media (max-width: 600px) { .tc { padding: var(--space-4); } .body.flush { margin-left: calc(-1 * var(--space-4)); margin-right: calc(-1 * var(--space-4)); } }
</style>
