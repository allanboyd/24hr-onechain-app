// Data loading for team screens: first load shows skeletons, later refreshes keep the old data on screen.
// `live()` reloads on local changes, every 30 s while visible and when the phone is back online.
import { live } from '../live';

export class Res<T> {
  data = $state<T | undefined>(undefined);
  error = $state('');
  loading = $state(true);
  refreshing = $state(false);
  private fn: () => Promise<T>;
  constructor(fn: () => Promise<T>) { this.fn = fn; }
  async reload() {
    if (this.data !== undefined) this.refreshing = true;
    try { this.data = await this.fn(); this.error = ''; }
    catch (e) { this.error = (e as Error).message || 'Could not load'; }
    finally { this.loading = false; this.refreshing = false; }
  }
  /** Call inside $effect: returns the cleanup. */
  live(everyMs = 30_000) { return live(() => this.reload(), everyMs); }
}

/** Pull-to-refresh / refresh button target: the screen on top registers what "refresh" means. */
let handler: (() => Promise<unknown>) | null = null;
export function onRefresh(fn: () => Promise<unknown>) { handler = fn; return () => { if (handler === fn) handler = null; }; }
export const refreshNow = () => (handler ? handler() : Promise.resolve());

/** Settled value or fallback — one failing (forbidden) call never blanks a whole screen. */
export const settle = async <T>(p: Promise<T> | null | undefined, fallback: T): Promise<T> => { try { return p ? await p : fallback; } catch { return fallback; } };
