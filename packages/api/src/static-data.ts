// Static data (docs/12 A-05): companies, suppliers, goods, receiving companies — validation shared by the web forms,
// the mock and the API. Its own module so it stays out of the apps' entry chunks (only admin screens load it).
import type { ID } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Room for 2 more companies (5) and 3 more suppliers (7) — roles document §2; limits to confirm. */
export const MASTER_LIMITS = { entities: 5, suppliers: 7 };
export const CURRENCIES = ['USD', 'KES', 'UGX', 'TZS', 'RWF'] as const;
export const PRODUCT_CATEGORIES = ['spirits', 'beer', 'wine', 'rtd'] as const;
const CODE_RE = /^[A-Z][A-Z0-9]{1,5}$/;
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Problems with a company form. `others` = the other companies (unique code, name and PO prefix). */
export function validateEntity(e: Partial<import('./types').EntityInput>, others: { id: ID; code: string; name: string; poPrefix: string }[], id?: ID | null): string[] {
  const out: string[] = [];
  const code = txt(e.code).toUpperCase(), name = txt(e.name), prefix = txt(e.poPrefix || (code ? `${code}-PO` : '')).toUpperCase();
  if (!CODE_RE.test(code)) out.push('Code must be 2–6 capital letters or digits, starting with a letter (e.g. BTW)');
  else if (others.some((o) => o.id !== id && o.code.toUpperCase() === code)) out.push(`Code ${code} is already used`);
  if (!name) out.push('Enter the legal name');
  else if (name.length > 160) out.push('The name is too long');
  else if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === name.toLowerCase())) out.push(`${name} is already registered`);
  if (prefix && !/^[A-Z][A-Z0-9-]{1,11}$/.test(prefix)) out.push('PO prefix must be capital letters, digits or "-" (e.g. BTW-PO)');
  else if (prefix && others.some((o) => o.id !== id && o.poPrefix.toUpperCase() === prefix)) out.push(`PO prefix ${prefix} is already used`);
  if (e.email !== undefined && txt(e.email) && !EMAIL_RE.test(txt(e.email))) out.push('Email does not look right');
  if (e.reportingCurrency !== undefined && !(CURRENCIES as readonly string[]).includes(e.reportingCurrency)) out.push('Pick a reporting currency');
  for (const k of ['address', 'phones'] as const) if (e[k] !== undefined && !(Array.isArray(e[k]) && e[k]!.every((x) => typeof x === 'string'))) out.push(`${k} must be a list of text lines`);
  if (e.active !== undefined && typeof e.active !== 'boolean') out.push('active must be true or false');
  if (!id && others.length >= MASTER_LIMITS.entities) out.push(`There is room for ${MASTER_LIMITS.entities} companies — deactivate or edit one instead`);
  return out;
}
/** Problems with a supplier form (unique code and name; a new supplier needs its loading-point location). */
export function validateSupplier(s: Partial<import('./types').SupplierInput>, others: { id: ID; code: string; name: string }[], id?: ID | null): string[] {
  const out: string[] = [];
  const code = txt(s.code).toUpperCase(), name = txt(s.name);
  if (!CODE_RE.test(code)) out.push('Code must be 2–6 capital letters or digits, starting with a letter (e.g. KBL)');
  else if (others.some((o) => o.id !== id && o.code.toUpperCase() === code)) out.push(`Code ${code} is already used`);
  if (!name) out.push('Enter the supplier name');
  else if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === name.toLowerCase())) out.push(`${name} is already registered`);
  if (!txt(s.city)) out.push('Enter the city of the loading point');
  if (!txt(s.country)) out.push('Enter the country');
  if (txt(s.email) && !EMAIL_RE.test(txt(s.email))) out.push('Email does not look right');
  const hasLoc = s.lat !== undefined || s.lng !== undefined;
  if ((!id || hasLoc) && !(typeof s.lat === 'number' && s.lat >= -90 && s.lat <= 90 && typeof s.lng === 'number' && s.lng >= -180 && s.lng <= 180)) out.push('Set the loading point location (latitude and longitude)');
  if (s.active !== undefined && typeof s.active !== 'boolean') out.push('active must be true or false');
  if (!id && others.length >= MASTER_LIMITS.suppliers) out.push(`There is room for ${MASTER_LIMITS.suppliers} suppliers — deactivate or edit one instead`);
  return out;
}
/** Problems with a goods (product) form: unique SKU, known supplier, pack and case size. */
export function validateProduct(p: Partial<import('./types').ProductInput>, ctx: { products: { id: ID; sku: string }[]; supplierIds: ID[] }, id?: ID | null): string[] {
  const out: string[] = [];
  const sku = txt(p.sku).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(sku)) out.push('SKU must be letters, digits or "-" (e.g. KBL-42)');
  else if (ctx.products.some((o) => o.id !== id && o.sku.toUpperCase() === sku)) out.push(`SKU ${sku} is already used`);
  if (!txt(p.brand)) out.push('Enter the brand');
  if (!txt(p.pack)) out.push('Enter the pack (e.g. 24 x 330 ml cans)');
  if (!ctx.supplierIds.includes(p.supplierId as ID)) out.push('Pick the supplier');
  if (!(Number.isInteger(p.unitsPerCase) && (p.unitsPerCase as number) > 0 && (p.unitsPerCase as number) <= 200)) out.push('Units per case must be a whole number (1–200)');
  if (!(Number.isInteger(p.sizeMl) && (p.sizeMl as number) > 0 && (p.sizeMl as number) <= 20000)) out.push('Size must be a whole number of ml (1–20,000)');
  if (p.category !== undefined && p.category !== null && p.category !== '' && !(PRODUCT_CATEGORIES as readonly string[]).includes(p.category)) out.push('Category must be spirits, beer, wine or rtd');
  if (p.price !== undefined && p.price !== null && !(typeof p.price === 'number' && p.price >= 0 && p.price < 1e6)) out.push('Price must be a number ≥ 0');
  if (p.active !== undefined && typeof p.active !== 'boolean') out.push('active must be true or false');
  return out;
}
/** Problems with a receiving-company form (unique name, at least one country). */
export function validateReceivingCompany(r: Partial<import('./types').ReceivingCompanyInput>, others: { id: ID; name: string }[], id?: ID | null): string[] {
  const out: string[] = [];
  const name = txt(r.name);
  if (!name) out.push('Enter the company name');
  else if (others.some((o) => o.id !== id && o.name.trim().toLowerCase() === name.toLowerCase())) out.push(`${name} is already registered`);
  if (!(Array.isArray(r.countries) && r.countries.length && r.countries.every((c) => typeof c === 'string' && c.trim()))) out.push('Add at least one country');
  if (r.active !== undefined && typeof r.active !== 'boolean') out.push('active must be true or false');
  return out;
}
