// Screen data loader: runs `load` now and after every data change, tracks loading/error, retries, handles expiry.
// Call from a component's <script> (it registers an $effect). `deps` re-runs it when they change.
import { untrack } from 'svelte';
import { onChange } from '@btw/api';
import { describe } from './errors';
import { expire } from './session.svelte';

export function watch(load: () => Promise<unknown>, deps?: () => unknown) {
  const st = $state<{ error: unknown; loading: boolean; loaded: boolean }>({ error: null, loading: true, loaded: false });
  let seq = 0;
  async function run() {
    const mine = ++seq;
    st.loading = true;
    try { await load(); if (mine === seq) { st.error = null; st.loaded = true; } }
    catch (e) { if (mine === seq) st.error = e; if (describe(e).kind === 'auth') expire(); }
    finally { if (mine === seq) st.loading = false; }
  }
  // Only `deps` are tracked; reads inside `load` must not re-trigger it.
  $effect(() => { deps?.(); untrack(run); return onChange(run); });
  return {
    get error() { return st.error; },
    get loading() { return st.loading; },
    /** True once a load succeeded at least once (keep showing data while a refresh fails). */
    get loaded() { return st.loaded; },
    retry: run,
  };
}

/** Run a mutation; returns the error message (for inline display) or '' on success. */
export async function attempt(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return ''; }
  catch (e) { const d = describe(e); if (d.kind === 'auth') expire(); return d.message; }
}
