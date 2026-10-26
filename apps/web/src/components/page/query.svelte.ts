// Page kit (docs/17 §3, §5 step 4): list filters kept in the hash query (#/shipments?show=delayed&route=r1), like
// lib/tab.ts `drill`, so a filtered list can be bookmarked and shared and Home cards can deep-link into it.
//
// Difference from `drill`: toggling a filter ON the page uses history.replaceState, which does NOT fire `hashchange`.
// App.svelte keys the screen on the full router path, so a normal hash change would remount the screen, refetch and
// scroll to the top on every click. Read with `readQuery` (location.hash), not `router.query` (it stays at the path the
// screen was opened with).

/** Current hash query (live, unlike router.query after a replaceState). */
export const hashQuery = () => new URLSearchParams(location.hash.split('?')[1] ?? '');
export const readQuery = (k: string) => hashQuery().get(k) ?? '';

/** Set / clear query keys in place (no remount, no scroll). Empty / null / undefined removes the key. */
export function writeQuery(updates: Record<string, string | number | null | undefined>) {
  const [path] = (location.hash.slice(1) || '/').split('?');
  const q = hashQuery();
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === null || v === '') q.delete(k);
    else q.set(k, String(v));
  }
  const s = q.toString();
  history.replaceState(history.state, '', `#${path}${s ? `?${s}` : ''}`);
}

/** Query keys the shell already uses: co (company), tab (old Overview/List tabs), do (ActionInCompany intent). */
export const RESERVED_KEYS = ['co', 'tab', 'do'];

/**
 * Reactive list filters backed by the hash query. `defaults` names the keys and their "no filter" values.
 *   const f = queryFilters({ show: '', route: '', q: '' });
 *   f.values.show · f.set('show', 'delayed') · f.toggle('show', 'delayed') · f.clear() · f.count
 */
export function queryFilters<K extends string>(defaults: Record<K, string>) {
  const keys = Object.keys(defaults) as K[];
  if (import.meta.env.DEV) for (const k of keys) if (RESERVED_KEYS.includes(k)) console.warn(`queryFilters: "${k}" is reserved by the shell; use another key`);
  const values = $state(Object.fromEntries(keys.map((k) => [k, readQuery(k) || defaults[k]])) as Record<K, string>);
  const sync = (k: K) => writeQuery({ [k]: values[k] === defaults[k] ? null : values[k] });
  return {
    values,
    get count() { return keys.filter((k) => values[k] !== defaults[k]).length; },
    set(k: K, v: string) { values[k] = v; sync(k); },
    toggle(k: K, v: string) { values[k] = values[k] === v ? defaults[k] : v; sync(k); },
    clear(only?: K[]) { for (const k of only ?? keys) { values[k] = defaults[k]; } writeQuery(Object.fromEntries((only ?? keys).map((k) => [k, null]))); },
  };
}
export type QueryFilters<K extends string> = ReturnType<typeof queryFilters<K>>;

/**
 * One-shot intent left in the query by ActionInCompany after a company switch (e.g. `do=new-po`): returns true once and
 * removes it, so a screen can open its "create" dialog after the remount.
 */
export function takeIntent(name: string): boolean {
  if (readQuery('do') !== name) return false;
  writeQuery({ do: null });
  return true;
}
