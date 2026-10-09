<script lang="ts">
  // Floating top controls over the map: menu + one status pill (sync / offline). Nothing else.
  import { outbox, type OutboxState } from '@btw/api/outbox';
  import Menu from '@lucide/svelte/icons/menu';
  let { onmenu, title = '' }: { onmenu: () => void; title?: string } = $props();
  let s = $state<OutboxState>({ online: true, pending: [], syncing: false });
  $effect(() => outbox.subscribe((v) => (s = v)));
  const tone = $derived(!s.online ? 'danger' : s.pending.length ? 'warning' : 'success');
  const text = $derived(!s.online ? `Offline${s.pending.length ? ` · ${s.pending.length} saved` : ''}` : s.syncing ? 'Sending…' : s.pending.length ? `${s.pending.length} to send` : 'Online');
</script>
<div class="top">
  <button class="fab" aria-label="Menu" onclick={onmenu}><Menu size={24} /></button>
  {#if title}<span class="title">{title}</span>{/if}
  <button class="pill" onclick={onmenu} aria-label="Sync status: {text}"><span class="dot tone-{tone}"></span>{text}</button>
</div>
<style>
  .top { position: fixed; top: 0; left: 0; right: 0; z-index: 25; display: flex; align-items: center; gap: var(--space-2); padding: calc(env(safe-area-inset-top) + 12px) var(--space-4) 0; pointer-events: none; }
  .top > * { pointer-events: auto; }
  .fab { width: 48px; height: 48px; border-radius: 50%; border: 0; background: var(--surface); color: var(--text); box-shadow: var(--elevation-2); display: grid; place-items: center; cursor: pointer; }
  .title { flex: 1; font: 700 15px var(--ff-display); color: var(--text); background: var(--surface); box-shadow: var(--elevation-2); height: 40px; border-radius: 20px; display: inline-flex; align-items: center; padding: 0 14px; min-width: 0; max-width: max-content; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill { margin-left: auto; height: 40px; border-radius: 20px; border: 0; background: var(--surface); color: var(--text); box-shadow: var(--elevation-2); display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; font: 600 13px var(--ff-body); cursor: pointer; white-space: nowrap; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot.tone-success { background: var(--success); } .dot.tone-warning { background: var(--warning-solid); } .dot.tone-danger { background: var(--danger); }
</style>
