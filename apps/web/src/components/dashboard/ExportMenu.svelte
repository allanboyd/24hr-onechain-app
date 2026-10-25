<script lang="ts">
  // Panel export menu: CSV (in the entry, tiny), Excel and PDF (lazy chunks, loaded on first use). PDF adds the panel's charts as images.
  import { say } from '@btw/ui';
  import { downloadCsv } from '../charts/scale';
  import type { ExportMeta, Rows } from './export/meta';
  import Download from '@lucide/svelte/icons/download';
  import FileText from '@lucide/svelte/icons/file-text';
  import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
  import FileDown from '@lucide/svelte/icons/file-down';
  import Loader from '@lucide/svelte/icons/loader-circle';
  let { name, meta, rows, root, formats = ['csv', 'xlsx', 'pdf'] }: {
    name: string; meta: () => ExportMeta; rows: () => Rows; /** element holding the charts (for PDF images) */ root?: () => Element | undefined;
    formats?: ('csv' | 'xlsx' | 'pdf')[];
  } = $props();
  let open = $state(false);
  let busy = $state<string | null>(null);
  let el = $state<HTMLDivElement>();
  const file = () => `${name}-${new Date().toISOString().slice(0, 10)}`;
  $effect(() => {
    if (!open) return;
    const away = (e: Event) => { if (el && !el.contains(e.target as Node)) open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false; };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  });
  async function run(fmt: 'csv' | 'xlsx' | 'pdf') {
    open = false; busy = fmt;
    try {
      if (fmt === 'csv') downloadCsv(file(), rows());
      else if (fmt === 'xlsx') (await import('./export/xlsx')).downloadXlsx(file(), meta(), rows());
      else {
        const [{ downloadPdf }, { chartImages }] = await Promise.all([import('./export/pdf'), import('../charts/snapshot')]);
        const r = root?.();
        const images = r ? await chartImages(r).catch(() => []) : [];
        downloadPdf(file(), meta(), rows(), images);
      }
      say(`${fmt === 'xlsx' ? 'Excel' : fmt.toUpperCase()} downloaded`);
    } catch (e) {
      say(`Export failed: ${(e as Error)?.message ?? e}`);
    } finally { busy = null; }
  }
  const items = $derived([
    { k: 'csv' as const, label: 'CSV', hint: 'data only', icon: FileText },
    { k: 'xlsx' as const, label: 'Excel (.xlsx)', hint: 'table + header', icon: FileSpreadsheet },
    { k: 'pdf' as const, label: 'PDF', hint: 'chart + table', icon: FileDown },
  ].filter((i) => formats.includes(i.k)));
</script>
<div class="xm" bind:this={el}>
  <button class="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)} disabled={!!busy} title="Export" aria-label="Export">
    {#if busy}<Loader size={16} class="spin" />{:else}<Download size={16} />{/if}<span class="lbl">Export</span>
  </button>
  {#if open}
    <div class="pop" role="menu">
      {#each items as it}<button role="menuitem" onclick={() => run(it.k)}><it.icon size={16} aria-hidden="true" /><span>{it.label}</span><span class="caption">{it.hint}</span></button>{/each}
    </div>
  {/if}
</div>
<style>
  .xm { position: relative; }
  .pop { position: absolute; right: 0; top: calc(100% + 4px); z-index: 30; min-width: 220px; background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--elevation-2); padding: var(--space-1); display: flex; flex-direction: column; }
  .pop button { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: var(--space-2); background: none; border: 0; text-align: left; padding: var(--space-2) var(--space-3); min-height: 40px; border-radius: var(--radius-sm); font: inherit; color: var(--text); cursor: pointer; }
  .pop button:hover, .pop button:focus-visible { background: var(--primary-subtle); }
  .xm :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 600px) { .lbl { display: none; } }
</style>
