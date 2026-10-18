// The three sibling companies' brands (docs/06-multi-company-plan.md §5). Assets come from
// packages/ui/src/assets/brand/entities/<code>/ (agent B); until a file exists the UI falls back to a
// text wordmark in the company colours, so nothing breaks while assets land.
import { lookup, ref, type Entity } from '@btw/api';
import { brand as btw } from './brand';

// Only the files the UI uses; ?no-inline keeps small images as files (never base64 in the JS bundle).
const files = import.meta.glob('../../../../packages/ui/src/assets/brand/entities/*/{logo-480w,logo-on-dark-480w,mark-128,mark-on-dark-128,favicon-32,letterhead-header,letterhead-footer,letterhead-watermark}.png', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
const icos = import.meta.glob('../../../../packages/ui/src/assets/brand/entities/*/favicon.ico', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>;
Object.assign(files, icos);
const asset = (code: string, ...names: string[]) => {
  for (const n of names) { const hit = Object.entries(files).find(([p]) => p.endsWith(`/entities/${code}/${n}`)); if (hit) return hit[1]; }
  return undefined;
};

export interface BrandInfo {
  code: string; name: string; shortName: string;
  /** primary = dark brand colour; accent = signature colour (fills/borders only); ink / inkOnDark = accent for TEXT (≥4.5:1). */
  colors: { primary: string; accent: string; ink: string; inkOnDark?: string; onPrimary?: string };
  legal?: { kraPin: string | null; registrationNo: string | null; registeredOffice?: string | null; legalName?: string | null };
  tagline: string; footerLine: string; address: string[]; phones: string[]; email: string;
}
export interface CompanyBrand extends BrandInfo {
  id: string;
  /** Logo for light surfaces (sign-in, letters). */ logo?: string;
  /** Logo for the navy sidebar; undefined → show `logo` on a white tile. */ logoOnDark?: string;
  /** Square mark for chips, avatars, favicons. */ mark?: string;
  favicon?: string; favicon32?: string;
  /** Letterhead artwork traced from docs/inspiration (header band, footer band, optional watermark). */
  letterhead: { header?: string; footer?: string; watermark?: string };
}

/** Facts from the letterheads in docs/inspiration (used until brand.json / the entity record provide them). */
const FALLBACK: Record<string, BrandInfo> = {
  BTW: {
    code: 'BTW', name: 'BTW Global Distributors Ltd', shortName: 'BTW Global',
    colors: { primary: '#062953', accent: '#FE7514', ink: '#062953' },
    tagline: 'Your global supply partner', footerLine: 'People · Products · Partnerships · Progress',
    address: ['P.O Box 18051 - 00100 Nairobi, Kenya', 'Elgeyo Marakwet Road, Elgeyo Garden'], phones: ['+254 707 617 460', '+254 701 570 356'], email: 'info@btwglobal.co.ke',
  },
  NUD: {
    code: 'NUD', name: 'Nihna Unique Distributors Ltd', shortName: 'Nihna Unique',
    colors: { primary: '#414142', accent: '#C4982B', ink: '#91701F' },
    tagline: 'Distributors, Transporters & Manufacturers', footerLine: 'Distributors, Transporters & Manufacturers',
    address: ['P.O. Box 18051-00100 Nairobi, Kenya'], phones: ['+254 707 617 460', '+254 701 570 356'], email: 'info@NihnaUnique.co.ke',
  },
  KVD: {
    code: 'KVD', name: 'Volcanic Distributors Limited', shortName: 'Kivu',
    colors: { primary: '#2E3092', accent: '#ED1C24', ink: '#2E3092' },
    tagline: 'Manufacturers · Transporters · Distributors · Importers · Exporters', footerLine: 'Manufacturers • Transporters • Distributors • Importers • Exporters',
    address: ['P.O Box 18051 - 00100 Nairobi, Kenya', 'Elgeyo Marakwet Road, Elgeyo Garden'], phones: ['+254 707 617 460', '+254 701 570 356'], email: 'info@NihnaUnique.co.ke',
  },
};

/** Seed ids of the three companies — used before reference data is loaded (e.g. on the sign-in page). */
const ID_CODE: Record<string, string> = { 'e-btw': 'BTW', 'e-nud': 'NUD', 'e-kivu': 'KVD' };

type EntityPlus = Entity & Partial<BrandInfo> & { address?: string | string[]; kraPin?: string | null; registrationNo?: string | null; registeredOffice?: string | null; legalName?: string | null };

/** Brand for one company id (entity id). */
export function companyBrand(entityId: string | undefined | null): CompanyBrand {
  const e = (entityId ? lookup.entity(entityId) : undefined) as EntityPlus | undefined;
  const code = (e?.code ?? (entityId ? ID_CODE[entityId] : undefined) ?? 'BTW').toUpperCase();
  const dir = code.toLowerCase();
  const base = FALLBACK[code] ?? { ...FALLBACK.BTW, code, name: e?.name ?? code, shortName: e?.name ?? code };
  const addr = e?.address ? (Array.isArray(e.address) ? e.address : [e.address]) : undefined;
  const info: BrandInfo = {
    ...base,
    ...(e?.name ? { name: e.name } : {}), ...(e?.shortName ? { shortName: e.shortName } : {}),
    ...(e?.colors ? { colors: e.colors } : {}), ...(e?.tagline ? { tagline: e.tagline } : {}), ...(e?.footerLine ? { footerLine: e.footerLine } : {}),
    legal: { kraPin: e?.kraPin && !/confirm/i.test(e.kraPin) ? e.kraPin : null, registrationNo: e?.registrationNo && !/confirm/i.test(e.registrationNo) ? e.registrationNo : null, registeredOffice: e?.registeredOffice ?? null, legalName: e?.legalName ?? null },
    ...(addr && addr.length > 1 ? { address: addr } : {}), ...(e?.phones?.length ? { phones: e.phones } : {}), ...(e?.email ? { email: e.email } : {}),
  };
  const isBtw = code === 'BTW';
  return {
    ...info, id: e?.id ?? entityId ?? '',
    logo: asset(dir, 'logo-480w.png', 'logo.png') ?? (isBtw ? btw.logoFull : undefined),
    logoOnDark: asset(dir, 'logo-on-dark-480w.png', 'logo-reversed-480w.png') ?? (isBtw ? btw.logoOnDark ?? undefined : undefined),
    mark: asset(dir, 'mark-128.png', 'mark.png'),
    favicon: asset(dir, 'favicon.ico') ?? (isBtw ? btw.favicon : undefined),
    favicon32: asset(dir, 'favicon-32.png') ?? (isBtw ? btw.favicon32 : undefined),
    letterhead: { header: asset(dir, 'letterhead-header.png'), footer: asset(dir, 'letterhead-footer.png'), watermark: asset(dir, 'letterhead-watermark.png', 'watermark.png') },
  };
}

/** The group (all three companies) — neutral mark; the client may supply a group logo later. */
export const groupBrand = () => ({ mark: asset('group', 'mark-128.png'), markOnDark: asset('group', 'mark-on-dark-128.png'), logoOnDark: asset('group', 'logo-on-dark-480w.png'), logo: asset('group', 'logo-480w.png') });

/** All companies in display order (BTW, NUD, Kivu). */
export function allCompanies(): CompanyBrand[] {
  const order = ['BTW', 'NUD', 'KVD'];
  const list = ref().entities;
  if (!list.length) return Object.keys(ID_CODE).map((id) => companyBrand(id));
  return [...list].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code)).map((e) => companyBrand(e.id));
}

/** Short label used everywhere a company is named in running text: "NUD", "Kivu", "BTW". */
export const companyLabel = (entityId: string | undefined | null) => {
  if (!entityId) return 'Group';
  const b = companyBrand(entityId);
  return b.code === 'KVD' ? 'Kivu' : b.code;
};
