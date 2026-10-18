// Light / dark: same 'btw-theme' key as the field menu ('' = follow the phone). Sets <html data-theme>.
const read = () => { try { return localStorage.getItem('btw-theme') ?? ''; } catch { return ''; } };
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
let choice = $state(read());
let sysDark = $state(media?.matches ?? false);
media?.addEventListener('change', (e) => (sysDark = e.matches));
export const theme = {
  get dark() { return choice ? choice === 'dark' : sysDark; },
  set(v: '' | 'light' | 'dark') {
    choice = v;
    if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('btw-theme', v); } catch { /* private mode */ }
  },
};
