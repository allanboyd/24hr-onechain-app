<script lang="ts">
  // V3-14 Settings & alerts → My account → Profile. Each person manages their own account:
  //  · Details: name and email (theirs to change, audit logged); phone, roles and scope are shown, the admin changes them.
  //  · Sign-in and security: change their own password (web) or PIN (field app); the current one is asked; other sessions
  //    end and this one stays signed in. Signed-in phones, each with Sign out this phone.
  //  · Preferences on this device: theme, and the company the app opens in.
  import { lookup, profile, ref, type MyDevice, type MyProfile, type User } from '@btw/api';
  import { ago, say } from '@btw/ui';
  import ErrorState from '../../components/ErrorState.svelte';
  import { watch } from '../../lib/load.svelte';
  import { theme, type Theme } from '../../lib/theme.svelte';
  import { session } from '../../lib/session.svelte';
  import { company, GROUP, allowedIds, canGroup, setCompany } from '../../lib/company.svelte';
  import { companyLabel } from '../../lib/companies';
  import Smartphone from '@lucide/svelte/icons/smartphone';
  import Monitor from '@lucide/svelte/icons/monitor';
  let { user }: { user: User; params?: unknown; section?: boolean } = $props();

  let me = $state<MyProfile | null>(null);
  let devices = $state<MyDevice[]>([]);
  const w = watch(async () => { [me, devices] = await Promise.all([profile.get(), profile.devices().catch(() => [] as MyDevice[])]); reset(); });

  // ---- details
  let form = $state({ name: '', email: '' });
  const reset = () => { if (me) form = { name: me.name, email: me.email ?? '' }; };
  const dirty = $derived(!!me && (form.name.trim() !== me.name || form.email.trim() !== (me.email ?? '')));
  let dErr = $state(''), busy = $state('');
  async function saveDetails(e: Event) {
    e.preventDefault(); dErr = ''; busy = 'details';
    try {
      me = await profile.update({ name: form.name, email: form.email.trim() || null }); reset();
      // the top bar and the greeting show the new name at once
      if (session.user) session.user = { ...session.user, name: me.name };
      say('Your details are saved');
    }
    catch (err) { dErr = (err as Error).message; } finally { busy = ''; }
  }

  // what this person can see (read-only)
  const r = ref();
  const scope = $derived.by(() => {
    if (!me) return [] as { label: string; value: string }[];
    const all = me.entityIds.length === 0 || me.entityIds.length === r.entities.length;
    return [
      { label: 'Roles', value: me.roles.join(', ') || '-' },
      { label: 'Companies', value: all ? 'All companies' : me.entityIds.map((id) => companyLabel(id)).join(', ') },
      ...(me.warehouseIds.length ? [{ label: 'Warehouses', value: me.warehouseIds.map((id) => lookup.warehouse(id)?.name ?? id).join(', ') }] : []),
      ...(me.loadingPointIds.length ? [{ label: 'Loading points', value: me.loadingPointIds.map((id) => lookup.supplier(id)?.code ?? id).join(', ') }] : []),
      ...(me.pairs.length ? [{ label: 'Buyer and supplier pairs', value: me.pairs.map((p) => `${companyLabel(p.entityId)}–${lookup.supplier(p.supplierId)?.code ?? p.supplierId}`).join(', ') }] : []),
    ];
  });

  // ---- password / PIN
  let kind = $state<'password' | 'pin'>('password');
  let sf = $state({ current: '', next: '', again: '' });
  let sErr = $state('');
  const kinds = $derived(me ? [...(me.hasPassword ? ['password' as const] : []), ...(me.hasPin ? ['pin' as const] : [])] : []);
  $effect(() => { if (kinds.length && !kinds.includes(kind)) kind = kinds[0]; });
  async function changeSecret(e: Event) {
    e.preventDefault(); sErr = '';
    if (sf.next !== sf.again) { sErr = kind === 'pin' ? 'The two new PINs are not the same' : 'The two new passwords are not the same'; return; }
    busy = 'secret';
    try {
      await profile.changeSecret(kind === 'pin' ? { current: sf.current, pin: sf.next } : { current: sf.current, password: sf.next });
      sf = { current: '', next: '', again: '' };
      say(`${kind === 'pin' ? 'PIN' : 'Password'} changed. You stay signed in here; other devices must sign in again.`);
      devices = await profile.devices().catch(() => devices);
    } catch (err) { sErr = (err as Error).message; } finally { busy = ''; }
  }

  // ---- signed-in devices
  let outDlg = $state<HTMLDialogElement>();
  let leaving = $state<MyDevice | null>(null);
  function askOut(d: MyDevice) { leaving = d; outDlg?.showModal(); }
  async function signOut() {
    if (!leaving) return; busy = 'device';
    try { await profile.signOutDevice(leaving.id); devices = devices.filter((d) => d.id !== leaving!.id); say('That device is signed out'); outDlg?.close(); }
    catch (err) { say((err as Error).message); outDlg?.close(); } finally { busy = ''; }
  }

  // ---- preferences
  const themes: { v: Theme; label: string }[] = [{ v: '', label: 'Follow this device' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }];
  const companies = $derived([...(canGroup(user) ? [GROUP] : []), ...allowedIds(user)]);
</script>

<div class="page-head"><div><h1>Profile</h1><p class="muted small">Your details, how you sign in, and your preferences.</p></div></div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />

{#if me}
  <section class="card blk" aria-labelledby="pf-d">
    <header><h3 id="pf-d">Details</h3><p class="caption">Your name shows on records you make and on documents you sign.</p></header>
    <form class="grid" onsubmit={saveDetails}>
      <label class="field"><span>Name</span><input class="input" bind:value={form.name} autocomplete="name" required /></label>
      <label class="field"><span>Email</span><input class="input" type="email" bind:value={form.email} autocomplete="email" placeholder="For emails from the system" /></label>
      <label class="field"><span>Phone</span><input class="input mono" value={me.phone} disabled /><small class="caption">Your field-app sign-in: the admin changes it in Users & access.</small></label>
      {#if dErr}<p class="error full" role="alert">{dErr}</p>{/if}
      <div class="acts full"><span class="grow"></span><button type="button" class="btn btn-ghost btn-sm" disabled={!dirty} onclick={reset}>Cancel</button><button class="btn btn-primary btn-sm" disabled={!dirty || busy === 'details'}>Save</button></div>
    </form>
    <dl class="scope">
      {#each scope as x (x.label)}<div><dt>{x.label}</dt><dd>{x.value}</dd></div>{/each}
    </dl>
    <p class="caption">What you can see is set by the admin in Users & access.{me.lastLoginAt ? ` Last sign-in ${ago(me.lastLoginAt)}.` : ''}</p>
  </section>

  <section class="card blk" aria-labelledby="pf-s">
    <header><h3 id="pf-s">Sign-in and security</h3><p class="caption">Changing it signs you out on your other devices; you stay signed in here.</p></header>
    {#if kinds.length}
      {#if kinds.length > 1}
        <div class="seg" role="group" aria-label="What to change">{#each kinds as k (k)}<button type="button" class:on={kind === k} aria-pressed={kind === k} onclick={() => { kind = k; sErr = ''; }}>{k === 'pin' ? 'Field-app PIN' : 'Web password'}</button>{/each}</div>
      {/if}
      <form class="grid" onsubmit={changeSecret}>
        <label class="field"><span>Current {kind === 'pin' ? 'PIN' : 'password'}</span><input class="input" type="password" bind:value={sf.current} autocomplete="current-password" inputmode={kind === 'pin' ? 'numeric' : undefined} required /></label>
        <label class="field"><span>New {kind === 'pin' ? 'PIN (4 to 6 digits)' : 'password (at least 8 characters)'}</span><input class="input" type="password" bind:value={sf.next} autocomplete="new-password" inputmode={kind === 'pin' ? 'numeric' : undefined} required /></label>
        <label class="field"><span>New {kind === 'pin' ? 'PIN' : 'password'} again</span><input class="input" type="password" bind:value={sf.again} autocomplete="new-password" inputmode={kind === 'pin' ? 'numeric' : undefined} required /></label>
        {#if sErr}<p class="error full" role="alert">{sErr}</p>{/if}
        <div class="acts full"><span class="grow"></span><button class="btn btn-primary btn-sm" disabled={busy === 'secret' || !sf.current || !sf.next}>Change {kind === 'pin' ? 'PIN' : 'password'}</button></div>
      </form>
    {:else}<p class="caption">Your account has no password or PIN of its own; ask the admin in Users & access.</p>{/if}

    <h4 class="sub">Signed-in devices</h4>
    <ul class="devs">
      {#each devices as d (d.id)}
        <li>{#if d.platform === 'web'}<Monitor size={18} aria-hidden="true" />{:else}<Smartphone size={18} aria-hidden="true" />{/if}
          <span class="grow"><strong>{d.platform === 'web' ? 'Web browser' : d.platform === 'app' ? 'Field app' : d.platform}</strong>{#if d.current} <span class="badge-here">this device</span>{/if}
            <span class="caption">{d.appVersion ? `version ${d.appVersion} · ` : ''}last seen {ago(d.lastSeenAt)}</span></span>
          {#if !d.current}<button class="btn btn-ghost btn-sm" onclick={() => askOut(d)}>Sign out this device</button>{/if}</li>
      {:else}<li class="caption">No devices recorded yet.</li>{/each}
    </ul>
  </section>

  <section class="card blk" aria-labelledby="pf-p">
    <header><h3 id="pf-p">Preferences</h3><p class="caption">Kept on this device.</p></header>
    <div class="grid">
      <div class="field"><span>Theme</span>
        <div class="seg" role="radiogroup" aria-label="Theme">{#each themes as t (t.v)}<button type="button" role="radio" aria-checked={theme.value === t.v} class:on={theme.value === t.v} onclick={() => (theme.value = t.v)}>{t.label}</button>{/each}</div></div>
      {#if companies.length > 1}
        <label class="field"><span>Company to work in</span><select class="select" value={company.active} onchange={(e) => { setCompany(user, e.currentTarget.value); say('The app opens in this company next time too'); }}>
          {#each companies as id (id)}<option value={id}>{id === GROUP ? 'Group (all companies)' : companyLabel(id)}</option>{/each}</select>
          <small class="caption">The app opens in it next time too.</small></label>
      {/if}
    </div>
  </section>
{/if}

<dialog class="sheet" bind:this={outDlg} style="width:min(440px,calc(100vw - 32px))" aria-labelledby="pfo-h">
  <div class="body stack">
    <h3 id="pfo-h">Sign out that device?</h3>
    <p class="small">{leaving?.platform === 'web' ? 'That browser' : 'That phone'} has to sign in again with your {leaving?.platform === 'web' ? 'password' : 'PIN'}. Use this for a lost or shared phone.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" onclick={() => outDlg?.close()}>Cancel</button><button class="btn btn-primary" disabled={busy === 'device'} onclick={signOut}>Sign out</button></div>
  </div>
</dialog>

<style>
  .blk { padding: var(--space-4) var(--space-5); margin-bottom: var(--space-4); }
  .blk header h3 { margin: 0; font-size: 15px; } .blk header p { margin: 2px 0 var(--space-3); }
  .grid { display: grid; gap: var(--space-3) var(--space-4); grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); align-items: start; }
  .full { grid-column: 1 / -1; }
  .acts { display: flex; align-items: center; gap: 8px; }
  .grow { flex: 1; min-width: 0; }
  .scope { margin: var(--space-4) 0 var(--space-2); }
  .scope div { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); font-size: 14px; }
  .scope dt { color: var(--text-muted); } .scope dd { margin: 0; }
  @media (max-width: 640px) { .scope div { grid-template-columns: 1fr; gap: 2px; } }
  .seg { display: inline-flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--surface-sunken); margin-bottom: var(--space-3); flex-wrap: wrap; }
  .seg button { border: 0; background: none; padding: 6px 12px; border-radius: 8px; font: inherit; font-size: 13px; color: var(--text-muted); cursor: pointer; }
  .seg button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
  .sub { margin: var(--space-4) 0 var(--space-2); font-size: 13px; color: var(--text-muted); }
  .devs { list-style: none; margin: 0; padding: 0; }
  .devs li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
  .devs .grow { display: flex; flex-direction: column; }
  .badge-here { font-size: 11px; font-weight: 600; color: var(--success); }
</style>
