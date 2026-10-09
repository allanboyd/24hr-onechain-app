<script lang="ts">
  // Users & devices: the people on the field app (giver / driver / receiver) and office staff; scopes (UA-02, §17.7);
  // PIN reset and remote sign-out of lost phones (MA-08).
  import { ref, type User } from '@btw/api';
  import { Badge, ago, say } from '@btw/ui';
  import { users, FIELD_ROLES, OFFICE_ROLES, isNotAvailable, type AdminUser, type Device, type UserInput } from '../lib/admin';
  import { watch, attempt } from '../lib/load.svelte';
  import { describe } from '../lib/errors';
  import ErrorState from '../components/ErrorState.svelte';
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Search from '@lucide/svelte/icons/search';
  let { user }: { user: User } = $props();

  const r = ref();
  let list = $state<AdminUser[] | null>(null);
  const w = watch(async () => { list = await users.list(); });
  let tab = $state<'all' | 'field' | 'office' | 'inactive'>('all');
  let q = $state('');
  const isFieldUser = (u: AdminUser) => u.roles.some((x) => ['loader', 'driver', 'receiver'].includes(x));
  const isField = (u: AdminUser) => u.roles.some((x) => ['loader', 'driver', 'receiver'].includes(x));
  const rows = $derived((list ?? []).filter((u) =>
    (tab === 'all' ? u.active : tab === 'field' ? u.active && isField(u) : tab === 'office' ? u.active && !isField(u) : !u.active) &&
    (!q || `${u.name} ${u.phone} ${u.roles.join(' ')}`.toLowerCase().includes(q.toLowerCase()))));
  const count = (t: typeof tab) => (list ?? []).filter((u) => (t === 'all' ? u.active : t === 'field' ? u.active && isField(u) : t === 'office' ? u.active && !isField(u) : !u.active)).length;
  const roleLabel = (x: string) => [...FIELD_ROLES, ...OFFICE_ROLES].find((y) => y.role === x)?.label.replace(' (giver)', '') ?? x;
  function scopeText(u: AdminUser) {
    const parts = [
      ...u.loadingPointIds.map((id) => r.suppliers.find((s) => s.id === id)?.code),
      ...u.warehouseIds.map((id) => r.warehouses.find((w) => w.id === id)?.name),
      ...(u.entityIds.length === r.entities.length ? ['All entities'] : u.entityIds.map((id) => r.entities.find((e) => e.id === id)?.code)),
    ].filter(Boolean);
    return parts.join(' · ') || '—';
  }

  // ---- editor ----
  let dlg = $state<HTMLDialogElement>();
  let editing = $state<AdminUser | null>(null);
  let form = $state<UserInput>({ name: '', phone: '', roles: [], entityIds: [], loadingPointIds: [], warehouseIds: [] });
  let formError = $state('');
  let busy = $state(false);
  let pinShown = $state('');
  let devs = $state<Device[] | null>(null);
  async function loadDevices(id: string) { devs = null; try { devs = await users.devices(id); } catch { devs = []; } }
  function open(u: AdminUser | null) {
    editing = u; formError = ''; pinShown = ''; devs = null;
    if (u) loadDevices(u.id);
    form = u ? { id: u.id, name: u.name, phone: u.phone, roles: [...u.roles], entityIds: [...u.entityIds], loadingPointIds: [...u.loadingPointIds], warehouseIds: [...u.warehouseIds] }
      : { name: '', phone: '+254', roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [] };
    dlg?.showModal();
  }
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  async function save(e: Event) {
    e.preventDefault(); busy = true;
    formError = await attempt(async () => { await users.save($state.snapshot(form) as UserInput); });
    busy = false;
    if (!formError) { dlg?.close(); say(editing ? 'User updated' : 'User created. Open them and set a PIN so they can use the field app.'); w.retry(); }
  }
  async function resetPin() {
    if (!editing) return;
    busy = true;
    try { const pin = await users.resetPin(editing.id); pinShown = `New PIN for ${editing.name}: ${pin}. Give it to them in person or by phone; their old PIN no longer works.`; }
    catch (err) { formError = describe(err).message; }
    busy = false;
  }
  async function setActive(active: boolean) {
    if (!editing) return;
    const msg = await attempt(() => users.setActive(editing!.id, active));
    if (msg) { formError = msg; return; }
    dlg?.close(); say(active ? 'User reactivated' : 'User deactivated and signed out of all devices'); w.retry();
  }
  async function revoke(deviceId: string) {
    if (!editing) return;
    const msg = await attempt(() => users.revokeDevice(deviceId));
    if (msg) { formError = msg; return; }
    say('Device signed out. Its offline data is wiped on next contact.'); loadDevices(editing.id);
  }
  const fieldPicked = $derived(form.roles.some((x) => ['loader', 'driver', 'receiver'].includes(x)));
</script>

<div class="page-head">
  <div><div class="overline crumb">Admin</div><h1>Users & devices</h1></div>
  <button class="btn btn-primary" onclick={() => open(null)}><UserPlus size={16} />New user</button>
</div>

<div class="tabs" role="tablist" aria-label="User groups">
  {#each [['all', 'Active'], ['field', 'Field app'], ['office', 'Office'], ['inactive', 'Deactivated']] as [k, label]}
    <button role="tab" aria-selected={tab === k} onclick={() => (tab = k as typeof tab)}>{label} <span class="caption">{count(k as typeof tab)}</span></button>
  {/each}
</div>
<div class="filters">
  <label class="field"><span>Search</span><span class="search"><Search size={16} /><input class="input" type="search" bind:value={q} placeholder="Name, phone or role" /></span></label>
</div>

{#if w.error && !w.loaded}
  {#if isNotAvailable(w.error)}<div class="card empty"><h3>User management isn’t on this server yet</h3><p class="small">The API doesn’t expose /users. Ask the API team to deploy it.</p></div>
  {:else}<ErrorState error={w.error} onretry={w.retry} />{/if}
{:else}
  <ErrorState error={w.error} onretry={w.retry} compact />
  <div class="card flush table-wrap">
    <table class="table">
      <thead><tr><th>Name</th><th>Phone</th><th>Roles</th><th>Scope</th><th>Field sign-in</th><th>Status</th></tr></thead>
      <tbody>
        {#if !list}{#each Array(5) as _}<tr><td colspan="6"><div class="skeleton"></div></td></tr>{/each}{/if}
        {#each rows as u (u.id)}
          <tr class="clickable" onclick={() => open(u)}>
            <td><strong>{u.name}</strong>{#if u.id === user.id}<span class="caption"> · you</span>{/if}</td>
            <td class="mono small">{u.phone}</td>
            <td><div class="row" style="gap:4px">{#each u.roles as role}<Badge tone={['loader', 'driver', 'receiver'].includes(role) ? 'accent' : 'neutral'}>{roleLabel(role)}</Badge>{/each}</div></td>
            <td class="small">{scopeText(u)}</td>
            <td class="small">{#if isFieldUser(u)}{#if u.hasPin}<span class="row" style="gap:4px"><Smartphone size={14} />PIN set</span>{:else}<Badge tone="warning">No PIN yet</Badge>{/if}{:else}<span class="subtle">Web only</span>{/if}</td>
            <td>{#if u.active}<Badge tone="success">Active</Badge>{:else}<Badge tone="neutral">Deactivated</Badge>{/if}</td>
          </tr>
        {:else}{#if list}<tr><td colspan="6" class="empty">No users match.</td></tr>{/if}{/each}
      </tbody>
    </table>
  </div>
{/if}

<dialog class="sheet wide" bind:this={dlg} aria-label={editing ? 'Edit user' : 'New user'}>
  <form class="body stack" onsubmit={save}>
    <div class="row between"><h3>{editing ? editing.name : 'New user'}</h3>{#if editing && !editing.active}<Badge tone="danger">Deactivated</Badge>{/if}</div>
    <div class="form-grid">
      <label class="field"><span>Full name</span><input class="input" id="u-name" bind:value={form.name} required /></label>
      <label class="field"><span>Phone (sign-in for the field app)</span><input class="input mono" id="u-phone" bind:value={form.phone} inputmode="tel" placeholder="+254712345678" disabled={!!editing} />{#if editing}<span class="help">The phone is their sign-in; create a new user if it changes.</span>{/if}</label>
    </div>

    <fieldset><legend class="label">Field app role</legend>
      <div class="chips">{#each FIELD_ROLES as fr}<label class="chip" title={fr.hint}><input type="checkbox" checked={form.roles.includes(fr.role)} onchange={() => (form.roles = toggle(form.roles, fr.role) as typeof form.roles)} />{fr.label}</label>{/each}</div>
    </fieldset>
    <fieldset><legend class="label">Office roles (web app)</legend>
      <div class="chips">{#each OFFICE_ROLES as orole}<label class="chip"><input type="checkbox" checked={form.roles.includes(orole.role)} onchange={() => (form.roles = toggle(form.roles, orole.role) as typeof form.roles)} />{orole.label}</label>{/each}</div>
    </fieldset>

    <div class="scopes">
      <fieldset><legend class="label">Entities</legend>{#each r.entities as e}<label class="check"><input type="checkbox" checked={form.entityIds.includes(e.id)} onchange={() => (form.entityIds = toggle(form.entityIds, e.id))} />{e.code}<span class="caption">{e.name}</span></label>{/each}</fieldset>
      <fieldset><legend class="label">Loading points {#if form.roles.includes('loader')}<span class="accent-text">· required</span>{/if}</legend>{#each r.suppliers as s}<label class="check"><input type="checkbox" checked={form.loadingPointIds.includes(s.id)} onchange={() => (form.loadingPointIds = toggle(form.loadingPointIds, s.id))} />{s.code}<span class="caption">{s.city}</span></label>{/each}</fieldset>
      <fieldset><legend class="label">Warehouses {#if form.roles.includes('receiver')}<span class="accent-text">· required</span>{/if}</legend>{#each r.warehouses as wh}<label class="check"><input type="checkbox" checked={form.warehouseIds.includes(wh.id)} onchange={() => (form.warehouseIds = toggle(form.warehouseIds, wh.id))} />{wh.name}</label>{/each}</fieldset>
    </div>
    {#if fieldPicked && !editing}<p class="help">After saving, open the user and use “Set new PIN” so they can sign in to the field app with their phone number.</p>{/if}

    {#if editing}
      <section class="stack-sm">
        <div class="label">Devices</div>
        {#if devs === null}<div class="skeleton"></div>{/if}
        {#each devs ?? [] as d (d.id)}
          <div class="device row between">
            <span class="row"><Smartphone size={16} /><span><strong class="cap">{d.platform}</strong><span class="caption"> · app {d.appVersion ?? '—'} · seen {ago(d.lastSeenAt)}{d.hasPush ? ' · push on' : ''}</span></span></span>
            {#if d.revokedAt}<Badge tone="neutral">Signed out {ago(d.revokedAt)}</Badge>{:else}<button type="button" class="btn btn-secondary btn-sm" onclick={() => revoke(d.id)}>Sign out remotely</button>{/if}
          </div>
        {:else}{#if devs}<p class="small muted">No phone registered yet.</p>{/if}{/each}
      </section>
      {#if pinShown}<p class="notice small" role="status">{pinShown}</p>{/if}
    {/if}

    {#if formError}<p class="error" role="alert">{formError}</p>{/if}
    <div class="row between">
      <div class="row">
        {#if editing}
          <button type="button" class="btn btn-secondary" disabled={busy || !editing.active} onclick={resetPin}>Set new PIN</button>
          {#if editing.active}<button type="button" class="btn btn-ghost danger" disabled={busy || editing.id === user.id} onclick={() => setActive(false)}>Deactivate</button>
          {:else}<button type="button" class="btn btn-ghost" onclick={() => setActive(true)}>Reactivate</button>{/if}
        {/if}
      </div>
      <div class="row"><button type="button" class="btn btn-ghost" onclick={() => dlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy}>{editing ? 'Save changes' : 'Create user'}</button></div>
    </div>
  </form>
</dialog>

<style>
  .search { position: relative; display: flex; align-items: center; }
  .search :global(svg) { position: absolute; left: 10px; color: var(--text-subtle); }
  .search .input { padding-left: 32px; min-width: 260px; }
  :global(dialog.sheet.wide) { width: min(760px, calc(100vw - 32px)); }
  fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border-strong); border-radius: var(--radius-md); padding: 6px 10px; cursor: pointer; font-weight: 500; }
  .chip:has(input:checked) { border-color: var(--primary); background: var(--primary-subtle); }
  .scopes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
  @media (max-width: 640px) { .scopes { grid-template-columns: 1fr; } }
  .check { display: flex; align-items: baseline; gap: 6px; }
  .check .caption { margin-left: 2px; }
  .device { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); }
  .notice { background: var(--info-subtle); color: var(--info); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); margin: 0; }
  .danger { color: var(--danger); }
  .cap { text-transform: capitalize; }
</style>
