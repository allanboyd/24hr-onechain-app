// Installable PWA glue (kept tiny: it ships in the entry chunk). The worker itself is dist/sw.js (see vite.config.ts).
import './update.css';
// Never registered inside the Capacitor shell — the native app already has its files on the phone.
declare const __APP_BUILD__: string;
/** This build's id (git commit or BUILD_ID), e.g. for the profile screen (V3-6). */
export const appBuild = __APP_BUILD__;

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
    // A worker already controlling this page at start means the app was installed before: a later takeover is a NEW
    // version (the worker skips waiting), while this page still runs the old code → offer "Update" (docs/23 §6).
    (globalThis as { btwBuild?: string }).btwBuild = appBuild; // read by support / tests
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBanner(); });
    addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        // Phones keep the app open for days: look for a new version when it comes back to the front, and every 30 min.
        const check = () => reg.update().catch(() => { /* offline: try next time */ });
        addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
        setInterval(check, 30 * 60_000);
      }).catch(() => { /* not fatal: the app works online */ });
    });
  }
}

let bannerShown = false;
/** "A new version is ready · Update". Plain DOM in this (entry) module on purpose: after a deploy the old page can't
 *  load its own lazy chunks any more (their files were replaced), so the banner must not need one. */
export function showUpdateBanner() {
  if (bannerShown) return;
  bannerShown = true;
  const bar = document.createElement('div');
  bar.className = 'pwa-update';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.innerHTML = '<span class="grow">A new version is ready.</span>'
    + '<button type="button" class="btn btn-ghost btn-sm" data-later>Later</button>'
    + '<button type="button" class="btn btn-primary btn-sm" data-update>Update</button>';
  bar.querySelector('[data-later]')!.addEventListener('click', () => bar.remove());
  bar.querySelector('[data-update]')!.addEventListener('click', () => location.reload());
  document.body.append(bar);
}
/** First visit in a browser tab (not installed, not the native app, not dismissed before). */
export function shouldHint() {
  if (isNativeShell() || isStandalone()) return false;
  try { return !localStorage.getItem(HINT_KEY); } catch { return false; }
}
export function dismissHint() { try { localStorage.setItem(HINT_KEY, String(Date.now())); } catch { /* private mode */ } }
