<script lang="ts">
  // V3-6: search from the top bar (phones; the space freed by moving theme and sign-out): jump to a page, a truck, a
  // shipment or a client. Shipments and clients load the first time the sheet opens; pages and trucks are already here.
  import { clients, lookup, ref, shipments, type ClientRow, type Shipment, type User } from '@btw/api';
  import Sheet from './Sheet.svelte';
  import { navFor, canSeeManagement } from '../../routes';
  import Search from '@lucide/svelte/icons/search';
  import Truck from '@lucide/svelte/icons/truck';
  import Package from '@lucide/svelte/icons/package';
  import UserRound from '@lucide/svelte/icons/user-round';
  let { open = $bindable(false), user }: { open?: boolean; user: User } = $props();
  let q = $state('');
  let ships = $state<Shipment[] | null>(null), cls = $state<ClientRow[] | null>(null);
  $effect(() => { if (open && ships === null) { shipments.list().then((x) => (ships = x)).catch(() => (ships = [])); clients.list().then((x) => (cls = x)).catch(() => (cls = [])); } });
  $effect(() => { if (!open) q = ''; });
  const pages = $derived([...navFor(user, 'operations'), ...(canSeeManagement(user) ? navFor(user, 'management') : [])].flatMap((g) => g.items));
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const has = (s: string | undefined) => !!s && norm(s).includes(norm(q));
  type Hit = { href: string; label: string; sub: string; icon: any };
  const hits = $derived.by<{ group: string; items: Hit[] }[]>(() => {
    if (q.trim().length < 2) return [];
    const out: { group: string; items: Hit[] }[] = [];
    const pg = pages.filter((p) => has(p.label)).slice(0, 5).map((p) => ({ href: p.href, label: p.label, sub: 'Page', icon: p.icon }));
    const tr = ref().trucks.filter((t) => has(t.reg) || has(t.trailer)).slice(0, 5).map((t) => ({ href: `#/shipments?view=list&show=all&q=${encodeURIComponent(t.reg)}`, label: t.reg, sub: lookup.provider(t.providerId)?.name ?? 'Truck', icon: Truck }));
    const sh = (ships ?? []).filter((s) => has(s.ref) || has(lookup.poRef(s.poId))).slice(0, 5).map((s) => ({ href: `#/shipments/${s.id}`, label: s.ref, sub: `${s.status} · PO ${lookup.poRef(s.poId)}`, icon: Package }));
    const cl = (cls ?? []).filter((c) => has(c.name) || has(c.phone)).slice(0, 5).map((c) => ({ href: '#/sales?view=clients', label: c.name, sub: c.owed ? `Client · owes USD ${Math.round(c.owed).toLocaleString('en-US')}` : 'Client', icon: UserRound }));
    if (pg.length) out.push({ group: 'Pages', items: pg });
    if (tr.length) out.push({ group: 'Trucks', items: tr });
    if (sh.length) out.push({ group: 'Shipments', items: sh });
    if (cl.length) out.push({ group: 'Clients', items: cl });
    return out;
  });
  function go(e: MouseEvent) { if ((e.target as HTMLElement).closest('a')) open = false; }
</script>

<Sheet bind:open label="Search" full>
  <label class="box"><Search size={18} aria-hidden="true" /><input type="search" bind:value={q} placeholder="Page, truck, shipment or client" aria-label="Search" autocomplete="off" enterkeyhint="search" /></label>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="res" onclick={go}>
    {#each hits as g (g.group)}
      <h3>{g.group}</h3>
      <ul>{#each g.items as h, i (h.href + h.label + i)}{@const I = h.icon}<li><a href={h.href}><span class="ic"><I size={17} aria-hidden="true" /></span><span class="tx"><strong>{h.label}</strong><span class="caption">{h.sub}</span></span></a></li>{/each}</ul>
    {:else}
      <p class="caption hint">{q.trim().length < 2 ? 'Type at least two letters: a page (Stock), a truck (KBV 894T), a shipment (SHP-2026) or a client.' : ships === null ? 'Searching…' : 'Nothing found.'}</p>
    {/each}
  </div>
</Sheet>

<style>
  .box { position: sticky; top: 30px; z-index: 1; display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 46px; border-radius: 12px; background: var(--surface-sunken); color: var(--text-muted); }
  .box input { all: unset; flex: 1; font-size: 16px; color: var(--text); }
  h3 { margin: 16px 4px 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
  ul { list-style: none; margin: 0; padding: 0; }
  li a { display: flex; align-items: center; gap: 12px; padding: 10px 6px; border-radius: 10px; color: var(--text); text-decoration: none; }
  li a:active { background: var(--surface-sunken); }
  .ic { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--primary-subtle); color: var(--primary); flex: none; }
  .tx { display: flex; flex-direction: column; min-width: 0; }
  .hint { padding: 16px 6px; }
</style>
