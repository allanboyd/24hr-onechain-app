<script lang="ts">
  // Top app bar: menu (or back on a detail screen) · title · company chip · notifications bell.
  import Menu from '@lucide/svelte/icons/menu';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Bell from '@lucide/svelte/icons/bell';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { activeBrand, co, groupMark, shortName } from '../company.svelte';
  import { watchSync, syncedLabel, type SyncView } from '../../synced';
  let { title, back = false, unread = 0, canSwitch = false, onmenu, onback, oncompany, onbell }:
    { title: string; back?: boolean; unread?: number; canSwitch?: boolean; onmenu: () => void; onback: () => void; oncompany: () => void; onbell: () => void } = $props();
  let scrolled = $state(false);
  $effect(() => { const f = () => (scrolled = scrollY > 4); f(); addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f); });
  const b = $derived((co.active, activeBrand()));
  // V3-6: the sync state at a glance (green: up to date · amber: waiting to send · red: offline)
  let sync = $state<SyncView>({ online: true, pending: 0, syncing: false, lastSynced: null });
  $effect(() => watchSync((v) => (sync = v)));
  const syncText = $derived(!sync.online ? `Offline, ${syncedLabel(sync.lastSynced).replace('Synced', 'last synced')}` : sync.pending ? `Waiting to send ${sync.pending}` : syncedLabel(sync.lastSynced));
</script>

<header class="bar" class:scrolled>
  {#if back}
    <button class="ib" aria-label="Back" onclick={onback}><ArrowLeft size={24} /></button>
  {:else}
    <button class="ib" aria-label="Open menu" onclick={onmenu}><Menu size={24} /></button>
  {/if}
  <h1 class="title">{title}<span class="sync" class:off={!sync.online} class:wait={sync.online && sync.pending > 0} title={syncText} role="status" aria-label={syncText}><i></i>{!sync.online ? 'Offline' : sync.pending ? `${sync.pending} to send` : ''}</span></h1>
  <button class="co" onclick={oncompany} disabled={!canSwitch} aria-label="Company: {b?.name ?? 'Group · all companies'}{canSwitch ? '. Switch company' : ''}">
    {#if b?.mark}<img src={b.mark} alt="" />{:else if !b && groupMark}<img src={groupMark} alt="" />{:else}<span class="mono">{b?.code ?? 'G'}</span>{/if}
    <span>{shortName(co.active)}</span>
    {#if canSwitch}<ChevronDown size={16} />{/if}
  </button>
  <button class="ib bell" aria-label="Notifications{unread ? `, ${unread} unread` : ''}" onclick={onbell}>
    <Bell size={22} />
    {#if unread}<span class="count">{unread > 9 ? '9+' : unread}</span>{/if}
  </button>
</header>

<style>
  .bar { position: fixed; z-index: 30; top: 0; left: 0; right: 0; height: calc(var(--t-bar) + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 6px 0 6px; display: flex; align-items: center; gap: 4px;
    background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: saturate(1.6) blur(14px); -webkit-backdrop-filter: saturate(1.6) blur(14px); border-bottom: 1px solid transparent; transition: border-color var(--motion-base), box-shadow var(--motion-base); }
  .bar.scrolled { border-bottom-color: var(--t-line); box-shadow: 0 6px 18px -14px rgb(6 41 83 / .4); }
  .ib { width: 48px; height: 48px; border: 0; border-radius: 50%; background: transparent; color: var(--text); display: grid; place-items: center; cursor: pointer; flex: none; position: relative; }
  .ib:active { background: var(--surface-sunken); }
  .title { flex: 1; min-width: 0; margin: 0; font: 700 19px/24px var(--ff-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 2px; }
  .co { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 10px 0 4px; border-radius: 999px; border: 1px solid var(--t-line); background: var(--surface); color: var(--text); font: 700 13px var(--ff-body); cursor: pointer; box-shadow: inset 3px 0 0 var(--t-accent); }
  .co:disabled { cursor: default; opacity: 1; }
  .title { display: flex; align-items: center; gap: 8px; }
  .sync { display: inline-flex; align-items: center; gap: 4px; font: 600 11.5px/1 var(--ff-body); color: var(--success); flex: none; }
  .sync i { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 20%, transparent); }
  .sync.wait { color: var(--warning); } .sync.wait i { background: var(--warning-solid, var(--warning)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 20%, transparent); }
  .sync.off { color: var(--danger); } .sync.off i { background: var(--danger); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent); }
  .co img, .co .mono { width: 28px; height: 28px; border-radius: 50%; background: #fff; object-fit: contain; padding: 2px; }
  .co .mono { display: grid; place-items: center; background: var(--t-brand); color: #fff; font: 800 10px var(--ff-display); padding: 0; }
  .count { position: absolute; top: 6px; right: 5px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--danger-solid); color: var(--text-on-danger); font: 700 11px/18px var(--ff-body); text-align: center; box-shadow: 0 0 0 2px var(--bg); }
</style>
