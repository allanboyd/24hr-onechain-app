// V3-14: the colour theme, one place for the top-bar button and Profile → Preferences. '' = follow the device.
// Kept on this device (localStorage), as before.
export type Theme = 'light' | 'dark' | '';
const read = (): Theme => { try { return (localStorage.getItem('btw-theme') as Theme) ?? ''; } catch { return ''; } };
export const theme = $state<{ value: Theme }>({ value: read() });
/** Apply to the page and keep it; call from an effect so changes from any screen take effect at once. */
export function applyTheme(v: Theme) {
  v ? document.documentElement.setAttribute('data-theme', v) : document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('btw-theme', v); } catch { /* private mode: this visit only */ }
}
