// Offline outbox for the field app (MA-06, S-3). Every write gets an idempotency key on the device,
// is queued when offline, and is replayed in order when the connection returns — through `sync.batch`,
// which in http mode is POST /sync/batch (the server applies each key once) and in mock mode runs locally.
// Native build: same API; the platform layer may persist the queue in SQLite and flush on resume.
import { sync } from './index';
import type { OutboxItem } from './types';

const KEY = 'btw-outbox-v1';
export const OUTBOX_OPS = ['leg.pass', 'leg.pass.undo', 'leg.issue', 'leg.issue.fix', 'issue.fix', 'leg.acknowledge', 'leg.dispatch', 'loading.confirm', 'waiting.add', 'sale.create', 'positions'] as const;
export type OutboxOp = (typeof OUTBOX_OPS)[number];

const ls = () => (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } }).localStorage;
let forcedOffline = false;
const listeners = new Set<(s: OutboxState) => void>();
export interface OutboxState { online: boolean; pending: OutboxItem[]; syncing: boolean; lastSync?: string }
let state: OutboxState = { online: true, pending: read(), syncing: false };

function read(): OutboxItem[] { try { return JSON.parse(ls()?.getItem(KEY) ?? '[]'); } catch { return []; } }
function write() { try { ls()?.setItem(KEY, JSON.stringify(state.pending)); } catch { /* ignore */ } }
function set(p: Partial<OutboxState>) { state = { ...state, ...p }; listeners.forEach((f) => f(state)); }
const isOnline = () => !forcedOffline && (typeof navigator === 'undefined' || navigator.onLine);
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const outbox = {
  subscribe(fn: (s: OutboxState) => void) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
  /** Run now if online, otherwise queue. Resolves `queued: true` when stored for later; throws when the server rejects it. */
  async send(op: OutboxOp, payload: unknown): Promise<{ queued: boolean; result?: unknown }> {
    const item: OutboxItem = { idempotencyKey: uuid(), op, payload, createdAt: new Date().toISOString(), tries: 0 };
    if (isOnline() && !state.pending.length) {
      try {
        const [r] = await sync.batch([{ idempotencyKey: item.idempotencyKey, op, payload }]);
        if (r?.status === 'rejected') throw new Error(r.error?.title ?? 'Rejected');
        set({ lastSync: new Date().toISOString() });
        return { queued: false, result: r?.result };
      } catch (e) { if (!(e instanceof TypeError)) throw e; /* network error → queue */ }
    }
    state.pending = [...state.pending, item]; write(); set({ pending: state.pending });
    return { queued: true };
  },
  async flush() {
    if (!isOnline() || state.syncing || !state.pending.length) return;
    set({ syncing: true });
    try {
      const results = await sync.batch(state.pending.map(({ idempotencyKey, op, payload }) => ({ idempotencyKey, op, payload })));
      const byKey = new Map(results.map((r) => [r.idempotencyKey, r]));
      const left = state.pending.filter((it) => byKey.get(it.idempotencyKey)?.status === 'rejected')
        .map((it) => ({ ...it, tries: it.tries + 1, error: byKey.get(it.idempotencyKey)?.error?.title ?? 'Rejected' }));
      state.pending = left; write();
      set({ syncing: false, pending: left, lastSync: new Date().toISOString() });
    } catch (e) {
      set({ syncing: false, online: !(e instanceof TypeError) && isOnline() }); // still offline: keep everything queued
    }
  },
  setForcedOffline(v: boolean) { forcedOffline = v; set({ online: isOnline() }); if (!v) outbox.flush(); },
  get forcedOffline() { return forcedOffline; },
  discard(key: string) { state.pending = state.pending.filter((p) => p.idempotencyKey !== key); write(); set({ pending: state.pending }); },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { set({ online: isOnline() }); outbox.flush(); });
  window.addEventListener('offline', () => set({ online: false }));
}
