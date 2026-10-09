// Native services for the field app (contract: docs/04-build-plan.md §Contracts 5).
// On Android/iOS these use Capacitor plugins; in a browser every call has a fallback, so the same
// screens run in dev, in mockups and on a phone. Plugins load lazily so the web bundle stays small.
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';

export const isNative = Capacitor.isNativePlatform();

// ---------------------------------------------------------------- position
export async function getPosition(): Promise<{ lat: number; lng: number; accuracyM: number } | null> {
  try {
    if (isNative) {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && (await Geolocation.requestPermissions()).location !== 'granted') return null;
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy };
    }
    if (!('geolocation' in navigator)) return null;
    return await new Promise((res) => navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }), () => res(null), { timeout: 8000, enableHighAccuracy: true }));
  } catch { return null; }
}

// ---------------------------------------------------------------- tracking + client-side geofence
type TrackEvent = { type: 'ping' | 'enter' | 'exit'; checkpointId?: string; lat: number; lng: number; at: string };
type Cp = { id: string; lat: number; lng: number; radiusM: number };

const PING_EVERY_MS = 5 * 60_000;   // low-frequency pings (≈ ≤1 MB/day); enter/exit are sent immediately
const DISTANCE_FILTER_M = 100;
const EXIT_HYSTERESIS = 1.15;       // must be 15% outside the radius to count as "exit" (GPS jitter at borders)

let stopFn: (() => Promise<void>) | null = null;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Geofence state machine for the next 2–3 checkpoints only (stays far below OS geofence limits). */
function makeFence(checkpoints: Cp[], onEvent: (e: TrackEvent) => void) {
  const inside = new Map<string, boolean>();
  let lastPing = 0;
  return (lat: number, lng: number, time?: number | null) => {
    const at = new Date(time ?? Date.now()).toISOString();
    for (const cp of checkpoints.slice(0, 3)) {
      const d = metres({ lat, lng }, cp);
      const was = inside.get(cp.id) ?? false;
      if (!was && d <= cp.radiusM) { inside.set(cp.id, true); onEvent({ type: 'enter', checkpointId: cp.id, lat, lng, at }); }
      else if (was && d > cp.radiusM * EXIT_HYSTERESIS) { inside.set(cp.id, false); onEvent({ type: 'exit', checkpointId: cp.id, lat, lng, at }); }
    }
    if (Date.now() - lastPing >= PING_EVERY_MS) { lastPing = Date.now(); onEvent({ type: 'ping', lat, lng, at }); }
  };
}

export async function startTracking(
  opts: { legId: string; nextCheckpoints: { id: string; lat: number; lng: number; radiusM: number }[] },
  onEvent: (e: TrackEvent) => void,
): Promise<void> {
  await stopTracking();
  const fence = makeFence(opts.nextCheckpoints, onEvent);
  if (isNative) {
    const BG = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
    await ensureNotificationPermission();   // Android 13+: needed for the persistent "sharing location" notification
    const id = await BG.addWatcher(
      { backgroundTitle: 'BTW Field · trip in progress', backgroundMessage: 'Sharing your location so the office sees where the truck is.', requestPermissions: true, stale: false, distanceFilter: DISTANCE_FILTER_M },
      (loc?: Location, err?: { code?: string }) => {
        if (err) { if (err.code === 'NOT_AUTHORIZED') console.warn('[native] location permission denied'); return; }
        if (loc) fence(loc.latitude, loc.longitude, loc.time);
      },
    );
    stopFn = () => BG.removeWatcher({ id });
    return;
  }
  if (!('geolocation' in navigator)) return;
  const wid = navigator.geolocation.watchPosition((p) => fence(p.coords.latitude, p.coords.longitude, p.timestamp), () => {}, { enableHighAccuracy: true, maximumAge: 30_000 });
  stopFn = async () => navigator.geolocation.clearWatch(wid);
}

export async function stopTracking(): Promise<void> {
  const f = stopFn; stopFn = null;
  if (f) { try { await f(); } catch { /* already stopped */ } }
}

async function ensureNotificationPermission() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const s = await PushNotifications.checkPermissions();
    if (s.receive === 'prompt' || s.receive === 'prompt-with-rationale') await PushNotifications.requestPermissions();
  } catch { /* plugin unavailable: Android < 13 shows the notification anyway */ }
}

// ---------------------------------------------------------------- photos (compressed for MA-10)
const MAX_EDGE = 1600, QUALITY = 0.7;

async function compress(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('image')); img.src = dataUrl; });
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', QUALITY);
}

const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

export async function takePhoto(): Promise<{ name: string; dataUrl: string } | null> {
  try {
    if (isNative) {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const p = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.DataUrl, quality: Math.round(QUALITY * 100), width: MAX_EDGE, height: MAX_EDGE, correctOrientation: true, saveToGallery: false });
      return p.dataUrl ? { name: `photo-${stamp()}.jpg`, dataUrl: await compress(p.dataUrl) } : null;
    }
    // Browser: file picker (opens the camera on phones via `capture`).
    const file = await new Promise<File | null>((res) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.setAttribute('capture', 'environment');
      input.onchange = () => res(input.files?.[0] ?? null);
      input.addEventListener('cancel', () => res(null));
      input.click();
    });
    if (!file) return null;
    const raw = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    return { name: file.name.replace(/\.\w+$/, '') + '.jpg', dataUrl: await compress(raw) };
  } catch { return null; } // user cancelled or camera unavailable
}

// ---------------------------------------------------------------- push
/**
 * Push needs Firebase: put google-services.json in apps/field/android/app/ and build with VITE_PUSH=1.
 * Without it we skip registration (calling register() without Firebase crashes the Android app).
 */
export async function registerPush(onToken: (t: string) => void, onMessage: (m: { title: string; body: string; data?: Record<string, string> }) => void): Promise<void> {
  if (!isNative || import.meta.env.VITE_PUSH !== '1') return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PushNotifications.addListener('registration', (t) => onToken(t.value));
    await PushNotifications.addListener('pushNotificationReceived', (n) => onMessage({ title: n.title ?? '', body: n.body ?? '', data: n.data }));
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => onMessage({ title: a.notification.title ?? '', body: a.notification.body ?? '', data: a.notification.data }));
    await PushNotifications.register();
  } catch (e) { console.warn('[native] push unavailable', e); }
}

// ---------------------------------------------------------------- network
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const netListeners = new Set<(online: boolean) => void>();
const setOnline = (v: boolean) => { if (v !== online) { online = v; netListeners.forEach((f) => f(v)); } };
if (typeof window !== 'undefined') {
  addEventListener('online', () => setOnline(true));
  addEventListener('offline', () => setOnline(false));
  if (isNative) import('@capacitor/network').then(async ({ Network }) => {
    setOnline((await Network.getStatus()).connected);
    await Network.addListener('networkStatusChange', (s) => setOnline(s.connected));
  }).catch(() => {});
}
export const network = {
  online: () => online,
  onChange(cb: (online: boolean) => void) { netListeners.add(cb); return () => { netListeners.delete(cb); }; },
};

// ---------------------------------------------------------------- storage
/** App-private key/value storage (Android SharedPreferences / iOS UserDefaults; localStorage in a browser). */
export const secureStore = {
  async get(k: string) {
    if (isNative) { const { Preferences } = await import('@capacitor/preferences'); return (await Preferences.get({ key: k })).value; }
    try { return localStorage.getItem(k); } catch { return null; }
  },
  async set(k: string, v: string) {
    if (isNative) { const { Preferences } = await import('@capacitor/preferences'); await Preferences.set({ key: k, value: v }); return; }
    try { localStorage.setItem(k, v); } catch { /* private mode */ }
  },
  async remove(k: string) {
    if (isNative) { const { Preferences } = await import('@capacitor/preferences'); await Preferences.remove({ key: k }); return; }
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

// ---------------------------------------------------------------- haptics
export function haptic(kind: 'success' | 'warning' | 'tap') {
  if (isNative) {
    import('@capacitor/haptics').then(({ Haptics, ImpactStyle, NotificationType }) => {
      if (kind === 'tap') Haptics.impact({ style: ImpactStyle.Light });
      else Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning });
    }).catch(() => {});
    return;
  }
  try { navigator.vibrate?.(kind === 'warning' ? [30, 40, 30] : kind === 'success' ? [20, 30, 40] : 15); } catch { /* unsupported */ }
}
