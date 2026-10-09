<script lang="ts">
  import { watch } from '../lib/load.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import { notifications, type Notification, type User } from '@btw/api';
  import { ago, fmtDateTime, say } from '@btw/ui';
  let { user }: { params?: any; user: User } = $props();
  let list = $state<Notification[] | null>(null);
  async function load() { list = await notifications.list(); }
  const w = watch(load);
  async function readAll() { await notifications.readAll(); say('All marked as read'); }
  const unread = $derived((list ?? []).filter((n) => !n.read).length);
  let only = $state(false);
  const shown = $derived((list ?? []).filter((n) => !only || !n.read));
</script>

<div class="page-head">
  <div><div class="overline crumb">Admin</div><h1>Notifications</h1></div>
  <button class="btn btn-secondary" onclick={readAll} disabled={!unread}>Mark all read</button>
</div>
<ErrorState error={w.error} onretry={w.retry} compact={w.loaded} />
<p class="muted small">In-app and email on web; push and SMS/WhatsApp on the field app where configured (NT-01). Shown for: {user.roles.join(', ')}.</p>

<div class="tabs" role="tablist"><button role="tab" aria-selected={!only} onclick={() => (only = false)}>All <span class="caption">{list?.length ?? 0}</span></button><button role="tab" aria-selected={only} onclick={() => (only = true)}>Unread <span class="caption">{unread}</span></button></div>

<div class="card flush">
  <ul class="list">
    {#if !list}<li><div class="skeleton" style="width:100%"></div></li>{/if}
    {#each shown as n (n.id)}
      <li class:unread={!n.read}>
        <span class="dot" aria-label={n.read ? 'Read' : 'Unread'}></span>
        <div class="grow">
          {#if n.link}<a href={n.link} onclick={() => notifications.markRead(n.id)}><strong>{n.title}</strong></a>{:else}<strong>{n.title}</strong>{/if}
          <div class="small muted">{n.body}</div>
        </div>
        <span class="caption" title={fmtDateTime(n.at)}>{ago(n.at)}</span>
      </li>
    {:else}{#if list}<li class="empty">You're all caught up</li>{/if}{/each}
  </ul>
</div>

<style>
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); }
  .list li:last-child { border-bottom: 0; }
  .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 7px; background: transparent; flex: none; }
  .unread { background: var(--primary-subtle); }
  .unread .dot { background: var(--accent); }
</style>
