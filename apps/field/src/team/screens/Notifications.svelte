<script lang="ts">
  // Notifications: newest first; tapping opens the matching team screen and marks it read.
  import { notifications, type Notification, type User } from '@btw/api';
  import { ago } from '@btw/ui';
  import Bell from '@lucide/svelte/icons/bell';
  import CompanyDot from '../../components/CompanyDot.svelte';
  import { Res, onRefresh } from '../load.svelte';
  import { go } from '../routes';
  import Skeleton from '../components/Skeleton.svelte';
  import Empty from '../components/Empty.svelte';
  import ErrorNote from '../components/ErrorNote.svelte';
  import type { View } from '../routes';
  let {}: { user: User; view: View; query: URLSearchParams } = $props();
  const r = new Res(async () => (await notifications.list()).sort((a, b) => b.at.localeCompare(a.at)));
  $effect(() => r.live());
  $effect(() => onRefresh(() => r.reload()));
  const unread = $derived((r.data ?? []).filter((n) => !n.read).length);
  async function open(n: Notification) {
    if (!n.read) notifications.markRead(n.id).catch(() => {});
    if (n.link) go(n.link.replace(/^#/, ''));
  }
  async function readAll() { await notifications.readAll(); await r.reload(); }
</script>

<ErrorNote error={r.error} onretry={() => r.reload()} />
{#if r.loading}
  <Skeleton rows={6} />
{:else if r.data?.length}
  <div class="t-row between"><span class="t-meta">{unread ? `${unread} unread` : 'All read'}</span>{#if unread}<button class="btn btn-ghost" onclick={readAll}>Mark all read</button>{/if}</div>
  <div class="t-list">
    {#each r.data.slice(0, 80) as n (n.id)}
      <button class="t-item" class:unread={!n.read} onclick={() => open(n)}>
        <span class="t-icon"><Bell size={20} /></span>
        <span class="t-main">
          <span class="t-line1">{#if n.entityId}<CompanyDot entityId={n.entityId} />{/if}<span class="t-ellipsis">{n.title}</span></span>
          <span class="t-meta clamp">{n.body}</span>
          <span class="t-meta">{ago(n.at)}</span>
        </span>
        {#if !n.read}<span class="t-dot" aria-label="Unread"></span>{/if}
      </button>
    {/each}
  </div>
{:else}
  <Empty title="No notifications" text="Approvals, delays and deliveries will show up here." />
{/if}

<style>
  .unread { border-color: color-mix(in srgb, var(--t-accent) 45%, transparent); }
  .unread .t-icon { background: color-mix(in srgb, var(--t-accent) 16%, transparent); }
  .t-dot { background: var(--t-accent); }
  .clamp { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
