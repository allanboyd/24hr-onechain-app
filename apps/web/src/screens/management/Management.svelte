<script lang="ts" module>
  /** Pages of the directors' report (docs/23 §3). Keys are the report's own page keys; the first 7 are its menu. */
  export const REPORT_PAGES = {
    overview: 'Overview',
    exec: 'Executive report',
    plans: 'Plans and orders',
    clients: 'Sales and clients',
    suppliers: 'Supplier balances',
    cash: 'Cash and closing',
    perf: 'Warehouse performance',
    fleet: 'Fleet and trucks',
    stock: 'Stock run-out',
    expenses: 'Expenses and bills',
  } as const;
  export type ReportPage = keyof typeof REPORT_PAGES;
</script>

<script lang="ts">
  // Management room: the directors' report used AS IS (apps/web/public/management/report.html is a byte-for-byte copy of
  // docs/design-v3/reference/management-room-report.html). Same-origin frame: our sidebar picks the page, the report's
  // own sidebar is hidden so there is one menu. It shows the sample data built into the file until it reads live data.
  import Info from '@lucide/svelte/icons/info';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Overview from './Overview.svelte';
  import Plans from './Plans.svelte';
  import Clients from './Clients.svelte';
  import Suppliers from './Suppliers.svelte';
  import Cash from './Cash.svelte';
  import Exec from './Exec.svelte';
  import Perf from './Perf.svelte';
  import Settings from './Settings.svelte';
  /** pages rebuilt in our code on live data (V3-10); the others still show the report as is */
  const LIVE: ReportPage[] = ['overview', 'exec', 'plans', 'clients', 'perf', 'suppliers', 'cash'];

  let { params = {} }: { params?: Record<string, string> } = $props();
  const page = $derived<ReportPage>(params.page && params.page in REPORT_PAGES ? (params.page as ReportPage) : 'overview');
  const src = `${import.meta.env.BASE_URL}management/report.html`;

  let frame = $state<HTMLIFrameElement>();
  let ready = $state(false);
  let failed = $state(false);

  const HIDE_OWN_MENU = `
    aside.side { display: none !important; }
    .app { grid-template-columns: minmax(0, 1fr) !important; }
    main { margin-inline: auto !important; }`;

  function onload() {
    const doc = frame?.contentDocument;
    if (!doc) { failed = true; return; }
    const style = doc.createElement('style');
    style.dataset.btw = 'management';
    style.textContent = HIDE_OWN_MENU;
    doc.head.append(style);
    ready = true;
    open(page);
  }

  /** Opens a report page through the report's own state + show(). The key is whitelisted (REPORT_PAGES) before use. */
  function open(key: ReportPage) {
    const win = frame?.contentWindow as (Window & { eval: (code: string) => unknown }) | null | undefined;
    if (!ready || !win || !(key in REPORT_PAGES)) return;
    try {
      win.eval(`S.pg = ${JSON.stringify(key)}; show(); scrollTo(0, 0);`);
    } catch {
      failed = true;
    }
  }

  $effect(() => { open(page); });
</script>

{#if params.page === 'settings'}
  <Settings />
{:else if LIVE.includes(page)}
  {#if page === 'plans'}<Plans />{:else if page === 'clients'}<Clients />{:else if page === 'perf'}<Perf />{:else if page === 'suppliers'}<Suppliers />{:else if page === 'cash'}<Cash />{:else if page === 'exec'}<Exec />{:else}<Overview />{/if}
{:else}
<div class="mgmt">
  <div class="note" role="note">
    <Info size={16} aria-hidden="true" />
    <span><b>Sample data.</b> This report shows the sample figures built into the directors' report. Live numbers are on Live dashboards.</span>
    <a class="go" href="#/">Live dashboards<ArrowRight size={14} aria-hidden="true" /></a>
  </div>
  {#if failed}
    <div class="card empty" role="alert"><h2>The report didn't open</h2><p class="small">Reload the page. If it keeps failing, open <a href={src} target="_blank" rel="noopener">the report on its own</a>.</p></div>
  {/if}
  <iframe bind:this={frame} {src} title="Management report: {REPORT_PAGES[page]}" onload={onload} class:hidden={failed}></iframe>
</div>
{/if}

<style>
  .mgmt { display: flex; flex-direction: column; gap: var(--space-3); }
  .note { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); background: var(--warning-subtle); color: var(--text); font-size: var(--fs-body-sm); }
  .note :global(svg) { color: var(--warning); flex: none; }
  .note .go { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
  iframe { width: 100%; height: calc(100dvh - 150px); min-height: 560px; border: 0; border-radius: var(--radius-lg); background: var(--bg); box-shadow: var(--elevation-1); }
  iframe.hidden { display: none; }
</style>
