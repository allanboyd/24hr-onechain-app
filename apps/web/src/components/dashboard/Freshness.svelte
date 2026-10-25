<script lang="ts" module>
  export type When = Date | string | number | null | undefined;
  /** "just now" · "5 min ago" · "3 h ago" · "2 d ago" */
  export function ago(at: When, now = Date.now()): string {
    if (at == null) return '';
    const m = Math.max(0, (now - +new Date(at)) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  }
  export const stamp = (at: When) => (at == null ? '' : new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
  /** Text for exports: "Updated 25 Oct 2026, 09:40 (5 min ago)". */
  export const freshnessText = (at: When, kind: 'updated' | 'synced' = 'updated', now = Date.now()) =>
    at == null ? (kind === 'synced' ? 'Not synced yet' : 'No update time') : `${kind === 'synced' ? 'Last synced' : 'Updated'} ${stamp(at)} (${ago(at, now)})`;
</script>
<script lang="ts">
  // Data-freshness label: "Updated 5 min ago" (server data) or "Last synced 2 h ago" (offline phones). Amber + icon once stale.
  import Clock from '@lucide/svelte/icons/clock';
  import ClockAlert from '@lucide/svelte/icons/clock-alert';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  let { at, kind = 'updated', staleAfter = 60 }: { at: When; kind?: 'updated' | 'synced'; /** minutes */ staleAfter?: number } = $props();
  let now = $state(Date.now());
  $effect(() => { const id = setInterval(() => (now = Date.now()), 30_000); return () => clearInterval(id); });
  const stale = $derived(at != null && now - +new Date(at) > staleAfter * 60000);
  const word = $derived(kind === 'synced' ? 'Last synced' : 'Updated');
</script>
<span class="fresh" class:stale class:none={at == null} title={at == null ? undefined : `${word} ${stamp(at)}`}>
  {#if at == null}<CircleDashed size={13} aria-hidden="true" />{kind === 'synced' ? 'Not synced yet' : 'No update time'}
  {:else if stale}<ClockAlert size={13} aria-hidden="true" />{word} {ago(at, now)} · may be out of date
  {:else}<Clock size={13} aria-hidden="true" />{word} {ago(at, now)}{/if}
</span>
<style>
  .fresh { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .stale { color: var(--warning); font-weight: 600; }
  .none { color: var(--text-subtle); }
</style>
