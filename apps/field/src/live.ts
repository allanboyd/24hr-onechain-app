// Keeps a screen's working set fresh without a reload: on local changes (onChange), every 15 s while visible,
// and when the phone comes back online or to the foreground. Push (native) only makes this faster, not required.
import { onChange } from '@btw/api';

export function live(load: () => Promise<unknown> | unknown, everyMs = 15_000) {
  const run = () => { Promise.resolve().then(load).catch(() => { /* offline or signed out: keep what we have */ }); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine) run(); };
  const t = setInterval(tick, everyMs);
  addEventListener('online', run); addEventListener('focus', tick); document.addEventListener('visibilitychange', tick);
  const off = onChange(run);
  run();
  return () => { clearInterval(t); removeEventListener('online', run); removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); off(); };
}
