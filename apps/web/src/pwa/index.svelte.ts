// Installable office app (docs/23 §6). Registers dist/sw.js in production builds, keeps the browser's install prompt
// for the Install card, and says "A new version is ready" when a new build takes over while the page is open.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export const pwa = $state({ update: false, canInstall: false });
let prompt: InstallPrompt | null = null;
const INSTALL_KEY = 'btw-office-install-dismissed';

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export function installDismissed() { try { return !!localStorage.getItem(INSTALL_KEY); } catch { return true; } }
export function dismissInstall() { try { localStorage.setItem(INSTALL_KEY, String(Date.now())); } catch { /* private mode */ } pwa.canInstall = false; }
export async function install() {
  if (!prompt) return;
  await prompt.prompt();
  await prompt.userChoice;
  prompt = null;
  pwa.canInstall = false;
}

export function setupPwa() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e as InstallPrompt;
    pwa.canInstall = !isStandalone() && !installDismissed();
  });
  addEventListener('appinstalled', () => { prompt = null; pwa.canInstall = false; });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) pwa.update = true; });
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const check = () => reg.update().catch(() => { /* offline: next time */ });
      addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 30 * 60_000);
    }).catch(() => { /* not fatal: the app works without it */ });
  });
}
