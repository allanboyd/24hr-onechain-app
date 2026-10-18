// Installable PWA glue (kept tiny: it ships in the entry chunk). The worker itself is dist/sw.js (see vite.config.ts).
// Never registered inside the Capacitor shell — the native app already has its files on the phone.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export const isNativeShell = () => !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Chrome/Edge/Android "install" event, kept so the hint can show a real Install button. */
export let installPrompt: InstallPrompt | null = null;
const HINT_KEY = 'btw-install-hint';

export function setupPwa() {
  if (isNativeShell()) return;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e as InstallPrompt; });
  addEventListener('appinstalled', () => { installPrompt = null; dismissHint(); });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* not fatal: the app works online */ }); });
  }
}
/** First visit in a browser tab (not installed, not the native app, not dismissed before). */
export function shouldHint() {
  if (isNativeShell() || isStandalone()) return false;
  try { return !localStorage.getItem(HINT_KEY); } catch { return false; }
}
export function dismissHint() { try { localStorage.setItem(HINT_KEY, String(Date.now())); } catch { /* private mode */ } }
