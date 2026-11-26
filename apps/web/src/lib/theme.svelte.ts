// V3-14: the colour theme, one place for the top-bar button and Profile → Preferences. '' = follow the device. Light by default (V3-16).
// Kept on this device (localStorage), as before.
export type Theme = 'light' | 'dark' | '';
// V3-16: light is the default. The choice now lives under a new key: an old '' was written for everyone on first load,
// so it can't tell a real "Device" choice from no choice. Only an explicit dark choice carries over.
const KEY = 'btw-theme-2';
const read = (): Theme => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === '') return v;
    return localStorage.getItem('btw-theme') === 'dark' ? 'dark' : 'light';
  } catch { return 'light'; }
};
export const theme = $state<{ value: Theme }>({ value: read() });
/** Apply to the page and keep it; call from an effect so changes from any screen take effect at once. */
export function applyTheme(v: Theme) {
  v ? document.documentElement.setAttribute('data-theme', v) : document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem(KEY, v); } catch { /* private mode: this visit only */ }
}
