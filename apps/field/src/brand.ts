// Brand assets come from packages/ui/src/assets/brand (mobile-platform agent); fall back to the supplied logo.
const files = import.meta.glob('../../../packages/ui/src/assets/brand/*.{svg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const pick = (...names: string[]) => { for (const n of names) { const k = Object.keys(files).find((f) => f.endsWith('/' + n)); if (k) return files[k]; } return null; };
/** Full-colour lockup for light backgrounds. */
export const logoLight = pick('btw-lockup.svg', 'btw-lockup.png', 'btw-logo.svg', 'btw-logo.png') ?? './logo.jpeg';
/** Reversed lockup for dark/navy backgrounds (null → put the light logo on a white tile). */
export const logoDark = pick('btw-lockup-reversed.svg', 'btw-lockup-reversed.png', 'btw-logo-reversed.svg', 'btw-logo-reversed.png');
