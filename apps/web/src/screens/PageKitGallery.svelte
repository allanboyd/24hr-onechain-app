<script lang="ts">
  // Dev gallery for the page kit (docs/17 Phase 1, step 4): a mock Shipments work page built only from the kit —
  // header, summary strip (tiles filter the list through the hash query), filter bar, table / phone cards and the detail
  // drawer — plus the Group-view company picker and the small helpers. Sample data only. Dev and demo builds only.
  import { say, Badge } from '@btw/ui';
  import type { User } from '@btw/api';
  import { showDemoHelpers } from '../lib/mode';
  import { company, GROUP } from '../lib/company.svelte';
  import { companyLabel } from '../lib/companies';
  import {
    PageHeader, SummaryStrip, FilterBar, ChipGroup, ActionInCompany, WorkPage, DetailDrawer, EmptyState, NeedsActionBadge, AnalysisLink,
    queryFilters, type SummaryTile,
  } from '../components/page';
  import SunMoon from '@lucide/svelte/icons/sun-moon';
  import MapIcon from '@lucide/svelte/icons/map';
  import SearchX from '@lucide/svelte/icons/search-x';
  let { user }: { user: User } = $props();

  function toggleTheme() {
    const html = document.documentElement;
    const dark = html.getAttribute('data-theme') === 'dark' || (!html.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    html.setAttribute('data-theme', dark ? 'light' : 'dark');
    try { localStorage.setItem('btw-theme', dark ? 'light' : 'dark'); } catch { /* private mode */ }
  }

  // ── sample shipments (illustrative) ──
  type Row = { id: string; ref: string; co: string; truck: string; driver: string; route: string; at: string; last: number; status: 'On the road' | 'Delayed' | 'At border' | 'Delivered'; border: boolean; noCheckin: boolean; eta: string; goods: string };
  const rows: Row[] = [
    { id: 's1', ref: 'SH-2026-0381', co: 'BTW', truck: 'KCX 412B', driver: 'Peter Otieno', route: 'Nairobi → Goma', at: 'At Malaba border', last: 31, status: 'Delayed', border: true, noCheckin: true, eta: '29 Oct 14:00', goods: 'Tusker Lager 24×330 ml · 1,600 cases' },
    { id: 's2', ref: 'SH-2026-0384', co: 'NUD', truck: 'KDA 220M', driver: 'Joseph Mwangi', route: 'Kampala → Kigali', at: 'Left Katuna', last: 9, status: 'Delayed', border: false, noCheckin: true, eta: '27 Oct 18:30', goods: 'Guinness 24×330 ml · 1,200 cases' },
    { id: 's3', ref: 'SH-2026-0386', co: 'KVD', truck: 'RAD 914C', driver: 'Eric Habimana', route: 'Kigali → Juba', at: 'At Nimule border', last: 3, status: 'At border', border: true, noCheckin: false, eta: '30 Oct 09:00', goods: 'Pilsner Lager 24×500 ml · 900 cases' },
    { id: 's4', ref: 'SH-2026-0387', co: 'BTW', truck: 'KCY 118T', driver: 'Samuel Kiprop', route: 'Mombasa → Kigali', at: 'Left Busia', last: 2, status: 'On the road', border: false, noCheckin: false, eta: '28 Oct 11:00', goods: 'White Cap 24×500 ml · 1,400 cases' },
    { id: 's5', ref: 'SH-2026-0388', co: 'NUD', truck: 'UBF 551K', driver: 'Moses Okello', route: 'Kampala → Goma', at: 'At Mpondwe', last: 14, status: 'Delayed', border: false, noCheckin: true, eta: '28 Oct 20:00', goods: 'Balozi 24×500 ml · 1,000 cases' },
    { id: 's6', ref: 'SH-2026-0390', co: 'BTW', truck: 'KDB 703P', driver: 'David Kamau', route: 'Nairobi → Goma', at: 'Left Eldoret', last: 1, status: 'On the road', border: false, noCheckin: false, eta: '31 Oct 16:00', goods: 'Tusker Lite 24×330 ml · 1,600 cases' },
    { id: 's7', ref: 'SH-2026-0391', co: 'KVD', truck: 'RAE 220A', driver: 'Jean Nshimiyimana', route: 'Kigali → Goma', at: 'Left Musanze', last: 11, status: 'Delayed', border: false, noCheckin: true, eta: '27 Oct 15:00', goods: 'Smirnoff Ice 24×300 ml · 700 cases' },
    { id: 's8', ref: 'SH-2026-0393', co: 'NUD', truck: 'KCZ 664F', driver: 'Daniel Ochieng', route: 'Mombasa → Kampala', at: 'Left Malaba', last: 4, status: 'Delayed', border: false, noCheckin: false, eta: '27 Oct 22:00', goods: 'Senator Keg 50 L · 120 kegs' },
    { id: 's9', ref: 'SH-2026-0376', co: 'BTW', truck: 'KCW 902H', driver: 'Paul Njoroge', route: 'Nairobi → Goma', at: 'Delivered at Goma', last: 26, status: 'Delivered', border: false, noCheckin: false, eta: '25 Oct 10:12', goods: 'Tusker Lager 24×330 ml · 1,600 cases' },
    { id: 's10', ref: 'SH-2026-0379', co: 'KVD', truck: 'RAC 431B', driver: 'Claude Mugisha', route: 'Kigali → Juba', at: 'Delivered at Juba', last: 40, status: 'Delivered', border: false, noCheckin: false, eta: '24 Oct 17:40', goods: 'Guinness 24×500 ml · 800 cases' },
  ];
  const routes = [...new Set(rows.map((r) => r.route))].sort();
  const active = (r: Row) => r.status !== 'Delivered';
  const TEST: Record<string, (r: Row) => boolean> = { road: active, delayed: (r) => r.status === 'Delayed', border: (r) => active(r) && r.border, nocheckin: (r) => active(r) && r.noCheckin };

  // list filters live in the hash query (#/dev/page-kit?show=delayed&route=…) — try reloading with a filter on
  const f = queryFilters({ show: '', route: '', company: '', q: '' });
  const tiles = $derived<SummaryTile[]>([
    { key: 'road', label: 'On the road', value: rows.filter(TEST.road).length, sub: 'of 10 this week', info: 'Trucks loaded and not yet signed for at the warehouse.' },
    { key: 'delayed', label: 'Delayed', value: rows.filter(TEST.delayed).length, status: 'bad', statusLabel: 'Needs action', sub: 'ETA moved', info: 'The ETA is later than planned by more than 6 hours.' },
    { key: 'border', label: 'At a border', value: rows.filter(TEST.border).length, status: 'warn', statusLabel: '1 over plan' },
    { key: 'nocheckin', label: 'No check-in', value: rows.filter(TEST.nocheckin).length, status: 'bad', statusLabel: 'Overdue', sub: 'call the driver' },
  ]);
  const list = $derived(rows.filter((r) => (!f.values.show || TEST[f.values.show]?.(r)) && (!f.values.route || r.route === f.values.route) && (!f.values.company || r.co === f.values.company)
    && (!f.values.q || `${r.ref} ${r.truck} ${r.driver}`.toLowerCase().includes(f.values.q.toLowerCase()))));
  let search = $state(f.values.q);
  $effect(() => { if (search !== f.values.q) f.set('q', search); });
  function clearAll() { f.clear(); search = ''; }

  let open = $state(false);
  let sel = $state<Row | null>(null);
  function show(r: Row) { sel = r; open = true; }
  const tone = (s: Row['status']) => (s === 'Delayed' ? 'bad' : s === 'At border' ? 'warn' : s === 'Delivered' ? 'good' : 'none');

  // second strip: money + no data
  const money: SummaryTile[] = [
    { key: 'open', label: 'Open balance', value: 12_430, format: (n) => `USD ${n.toLocaleString('en-US')}`, sub: '9 trips' },
    { key: 'd14', label: 'Over 14 days', value: 3_150, format: (n) => `USD ${n.toLocaleString('en-US')}`, status: 'warn', statusLabel: 'Follow up' },
    { key: 'd30', label: 'Over 30 days', value: 1_250, format: (n) => `USD ${n.toLocaleString('en-US')}`, status: 'bad', statusLabel: 'Overdue', sub: '1 trip' },
    { key: 'noprice', label: 'Price not recorded', value: null },
  ];
  let chip = $state('');
</script>

{#if !showDemoHelpers}
  <div class="empty card">The page kit gallery is only available in development and demo builds.</div>
{:else}
<div class="devbar">
  <span class="overline">Developer · page kit</span>
  <span class="caption">Sample data only. You are in <b>{company.active === GROUP ? 'Group view' : companyLabel(company.active)}</b>.</span>
  <button class="btn btn-secondary btn-sm" onclick={toggleTheme}><SunMoon size={16} />Light / dark</button>
</div>

<WorkPage>
  {#snippet header()}
    <PageHeader overline="Logistics" title="Shipments" description="Every truck from loading to signed delivery." analysis="fleet"
      info="Position comes from checkpoint check-ins: the driver app, SMS, geofence or the office. A truck with no check-in for longer than its plan shows under No check-in.">
      {#snippet secondary()}<a class="btn btn-secondary" href="#/shipments?view=map"><MapIcon size={16} aria-hidden="true" />Map view</a>{/snippet}
      {#snippet primary()}<ActionInCompany label="Record a shipment" what="shipment" feature="logistics" onclick={(id) => say(`Record a shipment for ${companyLabel(id)}`)} />{/snippet}
    </PageHeader>
  {/snippet}
  {#snippet strip()}<SummaryStrip {tiles} bind:value={f.values.show} param="show" label="Shipments summary" noun="shipments" total={rows.length} shown={list.length} />{/snippet}
  {#snippet filters()}
    <FilterBar bind:search placeholder="Shipment, truck or driver" active={(f.values.route ? 1 : 0) + (f.values.company ? 1 : 0) + (f.values.show ? 1 : 0)} onclear={clearAll}>
      <label class="field"><span>Route</span><select class="select" value={f.values.route} onchange={(e) => f.set('route', e.currentTarget.value)}><option value="">All routes</option>{#each routes as r}<option value={r}>{r}</option>{/each}</select></label>
      <label class="field"><span>Company</span><select class="select" value={f.values.company} onchange={(e) => f.set('company', e.currentTarget.value)}><option value="">All companies</option><option value="BTW">BTW</option><option value="NUD">NUD</option><option value="KVD">Kivu</option></select></label>
      {#snippet end()}<span class="caption">{list.length} of {rows.length} shipments</span>{/snippet}
    </FilterBar>
  {/snippet}

  <div class="card flush table-wrap wide-only">
    <table class="table">
      <thead><tr><th>Shipment</th><th>Truck</th><th>Route</th><th>Last check-in</th><th>Status</th><th>ETA</th></tr></thead>
      <tbody>
        {#each list as r (r.id)}
          <tr class="clickable" onclick={() => show(r)}>
            <td><button type="button" class="linkbtn mono" onclick={(e) => { e.stopPropagation(); show(r); }}>{r.ref}</button><div class="caption">{r.co}</div></td>
            <td><strong class="nowrap">{r.truck}</strong><div class="caption">{r.driver}</div></td>
            <td class="small">{r.route}</td>
            <td class="small">{r.at}<div class="caption">{r.last} h ago</div>{#if r.noCheckin && active(r)}<NeedsActionBadge n={1} one="check-in overdue" urgent />{/if}</td>
            <td><Badge status={r.status === 'At border' ? 'At border' : r.status}>{r.status}</Badge></td>
            <td class="small nowrap">{r.eta}</td>
          </tr>
        {:else}
          <tr><td colspan="6"><EmptyState title="No shipments match these filters" icon={SearchX} compact><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState></td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  <ul class="cards narrow-only">
    {#each list as r (r.id)}
      <li><button type="button" class="card rowcard" onclick={() => show(r)}>
        <span class="row between"><strong>{r.truck}</strong><Badge status={r.status}>{r.status}</Badge></span>
        <span class="small">{r.route}</span>
        <span class="caption"><span class="mono">{r.ref}</span> · {r.at} · {r.last} h ago</span>
        {#if r.noCheckin && active(r)}<NeedsActionBadge n={1} one="check-in overdue" urgent />{/if}
      </button></li>
    {:else}
      <li><EmptyState title="No shipments match these filters" icon={SearchX}><button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button></EmptyState></li>
    {/each}
  </ul>

  {#snippet drawer()}
    <DetailDrawer bind:open title={sel ? `${sel.truck} · ${sel.ref}` : ''} subtitle={sel ? `${sel.route} · ${sel.driver}` : ''}>
      {#snippet header()}{#if sel}<Badge status={sel.status}>{sel.status}</Badge>{#if sel.noCheckin && active(sel)}<NeedsActionBadge n={1} one="check-in overdue" urgent />{/if}{/if}{/snippet}
      {#if sel}
        <dl class="facts">
          <dt>Company</dt><dd>{sel.co === 'KVD' ? 'Kivu' : sel.co}</dd>
          <dt>Goods</dt><dd>{sel.goods}</dd>
          <dt>Where</dt><dd>{sel.at} · {sel.last} h ago</dd>
          <dt>ETA</dt><dd>{sel.eta} <span class="caption">({tone(sel.status) === 'bad' ? 'later than plan' : 'as planned'})</span></dd>
        </dl>
        <p class="caption">The full shipment page keeps the checkpoint timeline, documents and costs.</p>
      {/if}
      {#snippet footer()}<button class="btn btn-secondary" onclick={() => (open = false)}>Close</button><a class="btn btn-primary" href="#/shipments">Open shipment</a>{/snippet}
    </DetailDrawer>
  {/snippet}
</WorkPage>

<h2 class="sec">Group view — one action, "Which company?"</h2>
<section class="card demo">
  <p class="small muted">Replaces the "Choose a company to record …: BTW / NUD / Kivu" rows. In one company the button acts at once; in Group view it asks
    which company (only the ones you may record for), switches to it and carries on. People without the feature don't see it.</p>
  <div class="row wrapgap">
    <ActionInCompany label="Create purchase order" what="purchase order" feature="purchase-orders" href="#/pos/new" />
    <ActionInCompany label="Record a sale" what="sale" variant="secondary" feature="sales" onclick={(id) => say(`Record a sale for ${companyLabel(id)}`)} cue />
    <ActionInCompany label="Hidden: read-only" when={false} /><span class="caption">(a third button with <code>when=&#123;false&#125;</code> is not shown)</span>
  </div>
</section>

<h2 class="sec">Money strip with a "no data yet" tile · chips · helpers</h2>
<section class="card demo">
  <SummaryStrip tiles={money} sync={false} label="Transport fees summary" />
  <FilterBar active={chip ? 1 : 0} onclear={() => (chip = '')}>
    <ChipGroup label="Payment" bind:value={chip} options={[{ value: 'cash', label: 'Cash', n: 41 }, { value: 'credit', label: 'Credit', n: 12 }, { value: 'batch', label: 'Batch', n: 3 }]} />
  </FilterBar>
  <div class="row wrapgap"><NeedsActionBadge n={3} /><NeedsActionBadge n={1} urgent one="overdue" /><AnalysisLink group="purchasing" /><AnalysisLink group="fees" /></div>
</section>
{/if}

<style>
  .devbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); padding: var(--space-2) var(--space-3); margin-bottom: var(--space-5);
    border: 1px dashed var(--border-strong); border-radius: var(--radius-md); background: var(--surface-sunken); }
  .devbar .btn { margin-left: auto; }
  .sec { font-size: var(--fs-h4); line-height: var(--lh-h4); margin: var(--space-8) 0 var(--space-3); }
  .demo { display: flex; flex-direction: column; gap: var(--space-3); }
  .demo p { margin: 0; max-width: 72ch; }
  .wrapgap { flex-wrap: wrap; gap: var(--space-3); align-items: center; }
  .linkbtn { border: 0; background: none; padding: 0; color: var(--link); font: inherit; cursor: pointer; }
  .linkbtn:hover { text-decoration: underline; }
  .nowrap, .mono { white-space: nowrap; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-2) var(--space-4); margin: 0 0 var(--space-4); }
  .facts dt { color: var(--text-muted); font-size: var(--fs-label); font-weight: 600; }
  .facts dd { margin: 0; }
  .cards { list-style: none; margin: 0; padding: 0; flex-direction: column; gap: var(--space-2); }
  .rowcard { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-1); width: 100%; padding: var(--space-3) var(--space-4); text-align: left; font: inherit; color: inherit; cursor: pointer; }
  .narrow-only { display: none; }
  @media (max-width: 760px) { .wide-only { display: none; } .narrow-only { display: flex; } }
</style>
