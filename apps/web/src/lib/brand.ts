// Brand assets from packages/ui/src/assets/brand (see docs/brand/README.md). UI uses the light *-480w PNGs.
// Falls back to the original JPEG if the files are missing.
const files = import.meta.glob('../../../../packages/ui/src/assets/brand/{btw-*-480w.png,favicon.ico,favicon-32.png,favicon-180.png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const get = (name: string) => Object.entries(files).find(([p]) => p.endsWith('/' + name))?.[1];

export const brand = {
  /** Full lockup with tagline for light surfaces (sign-in, PO letterhead). */
  logoFull: get('btw-lockup-480w.png') ?? '/logo.jpeg',
  /** Compact horizontal lockup for light headers. */
  logoHorizontal: get('btw-horizontal-480w.png') ?? '/logo.jpeg',
  /** Lockup for the navy sidebar (derived reversed artwork); null → white tile fallback. */
  logoOnDark: (get('btw-lockup-no-tagline-reversed-480w.png') ?? null) as string | null,
  favicon: get('favicon.ico'),
  favicon32: get('favicon-32.png'),
  appleTouch: get('favicon-180.png'),
};

/** Point the tab icon at the brand favicons (index.html keeps a fallback). */
export function applyFavicons() {
  const set = (rel: string, href: string | undefined, attrs: Record<string, string> = {}) => {
    if (!href) return;
    const el = Object.assign(document.createElement('link'), { rel, href });
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.append(el);
  };
  document.head.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
  set('icon', brand.favicon, { sizes: 'any' });
  set('icon', brand.favicon32, { type: 'image/png', sizes: '32x32' });
  set('apple-touch-icon', brand.appleTouch, { sizes: '180x180' });
}
