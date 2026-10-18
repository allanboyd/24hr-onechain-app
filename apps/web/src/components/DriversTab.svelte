<script lang="ts">
  // Drivers (docs/10): name, phone (unique — it is how they sign in and get SMS), licence, provider, app or SMS.
  // A new driver with the app gets a field-app login with a PIN, shown once to pass on (like a PIN reset).
  import { lookup, masterdata, onChange, ref, type Driver, type DriverInput, type SavedDriver, type User } from '@btw/api';
  import { validateDriver } from '@btw/api/rules';
  import { Badge, say } from '@btw/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Power from '@lucide/svelte/icons/power';
  import Search from '@lucide/svelte/icons/search';
  import { can } from '../lib/features';
  import { describe } from '../lib/errors';
  let { user }: { user: User } = $props();

  let v = $state(0);
  $effect(() => onChange(() => v++));
  const r = $derived.by(() => { void v; return ref(); });
  const canEdit = $derived(can(user, 'master-data.transport'));
  let q = $state(''); let prov = $state(''); let showInactive = $state(false);
  const rows = $derived(r.drivers.filter((d) => (showInactive || d.active !== false) && (!prov || d.providerId === prov)
    && (!q.trim() || `${d.name} ${d.phone} ${d.localPhone ?? ''} ${d.licence}`.toLowerCase().includes(q.trim().toLowerCase()))));
  const trucksOf = (id: string) => r.trucks.filter((t) => t.defaultDriverId === id).map((t) => t.reg);
  const inactive = $derived(r.drivers.filter((d) => d.active === false).length);

  let dlg = $state<HTMLDialogElement>(); let pinDlg = $state<HTMLDialogElement>();
  let id = $state<string | null>(null);
  let f = $state<DriverInput & { appLogin: boolean }>({ providerId: '', name: '', phone: '', licence: '', hasApp: false, active: true, appLogin: true });
  let errs = $state<string[]>([]);
  let busy = $state(false);
  let created = $state<SavedDriver | null>(null);
  function open(d: Driver | null) {
    id = d?.id ?? null; errs = [];
    f = d ? { providerId: d.providerId, name: d.name, phone: d.phone, licence: d.licence, hasApp: d.hasApp, active: d.active !== false, appLogin: false }
      : { providerId: prov || r.providers.find((p) => p.active !== false)?.id || '', name: '', phone: '', licence: '', hasApp: true, active: true, appLogin: true };
    dlg?.showModal();
  }
  const hasLogin = (phone: string) => r.users.some((u) => u.phone.replace(/\s/g, '') === phone.replace(/\s/g, '') && u.roles.includes('driver'));
  async function save(e: Event) {
    e.preventDefault();
    const input = $state.snapshot(f);
    errs = validateDriver(input, { providers: r.providers, drivers: r.drivers }, id);
    if (errs.length) return;
    busy = true;
    try {
      const x = await masterdata.saveDriver(id, { ...input, appLogin: input.hasApp && input.appLogin });
      dlg?.close();
      if (x.login?.pin) { created = x; pinDlg?.showModal(); } else say(id ? `${x.name} saved` : `${x.name} added${x.login ? ' — linked to the existing field-app login' : ''}`);
    } catch (err) { errs = [describe(err).message]; } finally { busy = false; }
  }
  async function toggle(d: Driver) {
    const off = d.active !== false;
    if (off && !window.confirm(`Deactivate ${d.name}? They are no longer offered for trucks; trips are kept.`)) return;
    try { await masterdata.saveDriver(d.id, { active: !off }); say(`${d.name} ${off ? 'deactivated' : 'reactivated'}`); } catch (err) { say(describe(err).message); }
  }
</script>

<div class="toolbar">
  <label class="t-search"><Search size={16} /><input class="input" type="search" bind:value={q} placeholder="Name, phone or licence" aria-label="Search drivers" /></label>
  <select class="select" bind:value={prov} aria-label="Provider"><option value="">All providers</option>{#each r.providers as p}<option value={p.id}>{p.name}</option>{/each}</select>
  {#if inactive}<label class="small chk"><input type="checkbox" bind:checked={showInactive} />Show deactivated ({inactive})</label>{/if}
  <span class="grow"></span>
  {#if canEdit}<button class="btn btn-primary" onclick={() => open(null)}><Plus size={16} />Add driver</button>{/if}
</div>

<div class="card flush table-wrap"><table class="table">
  <thead><tr><th>Name</th><th>Phone</th><th>Licence</th><th>Provider</th><th>Trucks</th><th>Tracking channel</th>{#if canEdit}<th><span class="sr-only">Actions</span></th>{/if}</tr></thead>
  <tbody>{#each rows as d (d.id)}
    <tr class:off={d.active === false}><td>{d.name}{#if d.active === false} <Badge tone="danger">off</Badge>{/if}</td><td class="small">{d.localPhone ?? d.phone}{#if d.phoneNote}<div class="caption tbc">{d.phoneNote}</div>{/if}</td><td class="mono small">{d.licence || '—'}</td><td>{lookup.provider(d.providerId)?.name}</td>
      <td class="small">{trucksOf(d.id).join(', ') || '—'}</td>
      <td>{#if d.hasApp}<Badge tone="success">Driver app</Badge>{#if !hasLogin(d.phone)}<div class="caption tbc">no login yet</div>{/if}{:else}<Badge tone="warning">SMS / office updates</Badge>{/if}</td>
      {#if canEdit}<td><div class="acts"><button class="btn btn-ghost btn-sm" onclick={() => open(d)} aria-label="Edit {d.name}"><Pencil size={14} /></button><button class="btn btn-ghost btn-sm" onclick={() => toggle(d)} aria-label="{d.active === false ? 'Reactivate' : 'Deactivate'} {d.name}" title={d.active === false ? 'Reactivate' : 'Deactivate'}><Power size={14} /></button></div></td>{/if}</tr>
  {:else}<tr><td colspan="7" class="empty">No driver matches.</td></tr>{/each}</tbody>
</table></div>

<dialog class="sheet" bind:this={dlg} aria-labelledby="dr-title">
  <form class="body stack" onsubmit={save}>
    <div><h3 id="dr-title">{id ? `Edit ${f.name}` : 'Add driver'}</h3><div class="caption">The phone number is how the driver signs in to the field app or sends SMS check-ins — one driver per number.</div></div>
    <div class="form-grid">
      <label class="field"><span>Provider</span><select class="select" bind:value={f.providerId}>{#each r.providers.filter((p) => p.active !== false || p.id === f.providerId) as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
      <label class="field"><span>Name</span><input class="input" bind:value={f.name} required /></label>
      <label class="field"><span>Phone</span><input class="input" type="tel" bind:value={f.phone} required placeholder="+254 7xx xxx xxx" /><span class="help">Local numbers (07…) are read as Kenyan (+254).</span></label>
      <label class="field"><span>Driving licence</span><input class="input" bind:value={f.licence} placeholder="DL-KE-…" /></label>
    </div>
    <label class="small chk"><input type="checkbox" bind:checked={f.hasApp} />Uses the BTW driver app (otherwise SMS check-ins and office updates)</label>
    {#if f.hasApp && !hasLogin(f.phone)}<label class="small chk indent"><input type="checkbox" bind:checked={f.appLogin} />Create the field-app login now (a PIN is shown once to pass on)</label>{/if}
    {#if id}<label class="small chk"><input type="checkbox" bind:checked={f.active} />Active</label>{/if}
    {#if errs.length}<ul class="errs" role="alert">{#each errs as x}<li>{x}</li>{/each}</ul>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" onclick={() => dlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>{id ? 'Save' : 'Add driver'}</button></div>
  </form>
</dialog>

<dialog class="sheet" bind:this={pinDlg} aria-labelledby="pin-title">
  {#if created?.login}
    <div class="body stack">
      <h3 id="pin-title">Field-app login created</h3>
      <p>{created.name} signs in to the BTW field app with</p>
      <div class="pin"><div><span class="caption">Phone</span><strong class="mono">{created.phone}</strong></div><div><span class="caption">PIN</span><strong class="mono">{created.login.pin}</strong></div></div>
      <p class="caption">Pass the PIN on now — it is not shown again. An administrator can set a new one in Users & devices.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" onclick={() => pinDlg?.close()}>Done</button></div>
    </div>
  {/if}
</dialog>

<style>
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin-bottom: var(--space-4); }
  .toolbar .grow { flex: 1; }
  .toolbar .select { width: auto; }
  .t-search { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--text-muted); }
  .t-search .input { width: min(280px, 60vw); }
  .chk { display: inline-flex; align-items: center; gap: var(--space-2); }
  .indent { margin-left: var(--space-5); }
  .acts { display: flex; gap: 2px; justify-content: flex-end; }
  tr.off { opacity: 0.6; }
  .tbc { color: var(--warning); }
  .errs { margin: 0; padding: var(--space-2) var(--space-3) var(--space-2) var(--space-6); background: var(--danger-subtle); color: var(--danger); border-radius: var(--radius-md); font-weight: 600; }
  .pin { display: flex; gap: var(--space-6); padding: var(--space-3) var(--space-4); background: var(--surface-sunken); border-radius: var(--radius-md); }
  .pin div { display: flex; flex-direction: column; }
  .pin strong { font-size: 22px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
