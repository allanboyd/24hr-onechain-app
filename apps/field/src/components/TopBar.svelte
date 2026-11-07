<script lang="ts">
  // Floating top controls over the map: menu + one status pill (sync / offline). Nothing else.
  import { watchSync, syncedLabel, type SyncView } from '../synced';
  import Menu from '@lucide/svelte/icons/menu';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  /** `onback`: inside BTW Team (Testfie's "Load at GBI Mombasa") the first button goes back instead of opening the menu. */
  let { onmenu, onback, title = '' }: { onmenu?: () => void; onback?: () => void; title?: string } = $props();
  // D-A4: the pill always says when this phone last synced, and how many changes wait to be sent.
  let s = $state<SyncView>({ online: true, pending: 0, syncing: false, lastSynced: null });
  $effect(() => watchSync((v) => (s = v)));
  const tone = $derived(!s.online ? 'danger' : s.pending ? 'warning' : 'success');
  const text = $derived(s.syncing ? 'Sending…' : s.pending ? `Waiting to send ${s.pending}` : s.online ? 'Online' : 'Offline');
  const when = $derived(syncedLabel(s.lastSynced));
</script>
<div class="top">
  {#if onback}<button class="fab" aria-label="Back to BTW Team" onclick={onback}><ArrowLeft size={24} /></button>
  {:else if onmenu}<button class="fab" aria-label="Menu" onclick={onmenu}><Menu size={24} /></button>{/if}
  {#if title}<span class="title">{title}</span>{/if}
  <button class="pill" onclick={onmenu} aria-label="Sync status: {text}. {when}"><span class="dot tone-{tone}" aria-hidden="true"></span><span class="txt"><span class="l1">{text}</span><span class="l2">{when}</span></span></button>
</div>
<style>
  .top { position: fixed; top: 0; left: 0; right: 0; z-index: 25; display: flex; align-items: center; gap: var(--space-2); padding: calc(env(safe-area-inset-top) + 12px) var(--space-4) 0; pointer-events: none; }
  .top > * { pointer-events: auto; }
  .fab { width: 48px; height: 48px; border-radius: 50%; border: 0; background: var(--surface); color: var(--text); box-shadow: var(--elevation-2); display: grid; place-items: center; cursor: pointer; }
  .title { flex: 1; font: 700 15px var(--ff-display); color: var(--text); background: var(--surface); box-shadow: var(--elevation-2); height: 40px; border-radius: 20px; display: inline-flex; align-items: center; padding: 0 14px; min-width: 0; max-width: max-content; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill { margin-left: auto; height: 44px; border-radius: 22px; border: 0; background: var(--surface); color: var(--text); box-shadow: var(--elevation-2); display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; font: 600 13px var(--ff-body); cursor: pointer; white-space: nowrap; }
  .txt { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.1; }
  .l1 { font: 700 13px var(--ff-body); } .l2 { font: 500 11px var(--ff-body); color: var(--text-muted); }
  .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; }
  .dot.tone-success { background: var(--success); } .dot.tone-warning { background: var(--warning-solid); } .dot.tone-danger { background: var(--danger); }
</style>
