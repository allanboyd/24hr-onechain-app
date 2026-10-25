// D-A4: "Last synced <time>" for the offline-capable screens (driver, loader, receiver, team). The time of the last moment
// this phone and the server agreed: a screen's working set loaded while online (live.ts) or the outbox sent its queue
// (packages/api outbox `lastSync`). Kept in localStorage so it survives an app restart with no signal.
// Only lazy screen chunks import this module (never the entry bundle).
import { outbox, type OutboxState } from '@btw/api/outbox';

const KEY = 'btw-last-sync';
const subs = new Set<(at: string | null) => void>();
let at: string | null = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();

export const lastSynced = () => at;
export function markSynced(when = new Date().toISOString()) {
  if (at && Date.parse(when) <= Date.parse(at)) return;
  at = when;
  try { localStorage.setItem(KEY, when); } catch { /* private mode: keep it in memory */ }
  subs.forEach((f) => f(at));
}
/** A screen's data loaded: counts as synced only with real signal (not in the "work offline" test mode). */
export function markLoaded() { if ((typeof navigator === 'undefined' || navigator.onLine) && !outbox.forcedOffline) markSynced(); }
/** Sync state for a status pill: outbox state + last synced time. Returns the unsubscribe. */
export interface SyncView { online: boolean; syncing: boolean; pending: number; lastSynced: string | null }
export function watchSync(fn: (v: SyncView) => void): () => void {
  let s: OutboxState = { online: true, pending: [], syncing: false };
  const emit = () => fn({ online: s.online && !outbox.forcedOffline && (typeof navigator === 'undefined' || navigator.onLine), syncing: s.syncing, pending: s.pending.length, lastSynced: at });
  const off1 = outbox.subscribe((v) => { s = v; if (v.lastSync) markSynced(v.lastSync); emit(); });
  subs.add(emit);
  const tick = setInterval(emit, 30_000); // "2 min ago" keeps counting
  addEventListener('online', emit); addEventListener('offline', emit);
  return () => { off1(); subs.delete(emit); clearInterval(tick); removeEventListener('online', emit); removeEventListener('offline', emit); };
}
const TZ = 'Africa/Nairobi';
/** "just now", "4 min ago", "2 h ago", else "12 Oct 14:05". */
export function syncedLabel(iso: string | null): string {
  if (!iso) return 'Not synced yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'Synced just now';
  if (m < 60) return `Synced ${m} min ago`;
  if (m < 12 * 60) return `Synced ${Math.round(m / 60)} h ago`;
  return `Synced ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso))}`;
}
