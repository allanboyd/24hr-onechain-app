// Company brand for the field app (docs/06 §3): the shipment's company is shown on every trip, hand-over and receipt.
import { lookup } from '@btw/api';
const files = import.meta.glob('../../../packages/ui/src/assets/brand/entities/*/{mark-128,logo-480w}.png', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
const ID_CODE: Record<string, string> = { 'e-btw': 'BTW', 'e-nud': 'NUD', 'e-kivu': 'KVD' };
const FALL: Record<string, { name: string; short: string; primary: string; accent: string }> = {
  BTW: { name: 'BTW Global Distributors Ltd', short: 'BTW Global', primary: '#062953', accent: '#FE7514' },
  NUD: { name: 'Nihna Unique Distributors Ltd', short: 'Nihna Unique', primary: '#414142', accent: '#C4982B' },
  KVD: { name: 'Volcanic Distributors Limited', short: 'Kivu', primary: '#2E3092', accent: '#ED1C24' },
};
export function company(entityId?: string | null) {
  if (!entityId) return null;
  const e = lookup.entity(entityId) as ({ code: string; name: string; shortName?: string; colors?: { primary: string; accent: string } } | undefined);
  const code = (e?.code ?? ID_CODE[entityId] ?? 'BTW').toUpperCase();
  const f = FALL[code] ?? FALL.BTW;
  const dir = `/entities/${code.toLowerCase()}/`;
  const pick = (n: string) => Object.entries(files).find(([p]) => p.includes(dir) && p.endsWith(n))?.[1];
  return { id: entityId, code, name: e?.name ?? f.name, short: e?.shortName ?? f.short, primary: e?.colors?.primary ?? f.primary, accent: e?.colors?.accent ?? f.accent, mark: pick('mark-128.png'), logo: pick('logo-480w.png') };
}
