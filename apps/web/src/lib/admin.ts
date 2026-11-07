// Admin + server-only features for the web: users & devices (MA-08), integrations status, SMS tester, PO PDF/send.
import { API_MODE } from './mode';
// Built on @btw/api (`users`, `devices`, `pos`), which works in both mock and http mode. The dev endpoints
// (/v1/dev/*) exist only on non-production servers; the screens show a calm "not available" otherwise.
import { devices as apiDevices, pos, users as apiUsers, type Device, type ID, type Role, type UserAdmin, type UserPair } from '@btw/api';

export class NotAvailable extends Error { constructor(what: string) { super(`${what} isn’t available here.`); this.name = 'NotAvailable'; } }
export const isNotAvailable = (e: unknown) => e instanceof NotAvailable || (e as any)?.status === 404 || (e as any)?.status === 501;

export type AdminUser = UserAdmin;
export type { Device };
export type UserInput = { id?: ID; name: string; phone: string; roles: Role[]; entityIds: ID[]; loadingPointIds: ID[]; warehouseIds: ID[]; pairs: UserPair[]; routeIds: ID[] };
const rule = (message: string) => Object.assign(new Error(message), { status: 422 });

export const users = {
  list: () => apiUsers.list(),
  devices: (id: ID) => apiUsers.devices(id),
  async save(input: UserInput): Promise<AdminUser> {
    const phone = input.phone.replace(/\s/g, '');
    if (!input.name.trim()) throw rule('Name is required.');
    if (!/^\+\d{9,15}$/.test(phone)) throw rule('Phone must be in international format, e.g. +254712345678.');
    if (!input.roles.length) throw rule('Pick at least one role.');
    if (input.roles.includes('loader') && !input.loadingPointIds.length) throw rule('A loading-point user needs at least one loading point.');
    if (input.roles.includes('receiver') && !input.warehouseIds.length) throw rule('A receiver needs at least one warehouse.');
    const { id, ...rest } = input;
    if (input.pairs.some((p) => !input.entityIds.includes(p.entityId)) && !input.roles.includes('director')) throw rule('Every buyer–supplier pair must be for one of the user’s companies.');
    const scopes = { roles: rest.roles, entityIds: rest.entityIds, loadingPointIds: rest.loadingPointIds, warehouseIds: rest.warehouseIds, pairs: rest.pairs, routeIds: rest.routeIds };
    return id ? apiUsers.update(id, { name: rest.name.trim(), ...scopes }) : apiUsers.create({ name: rest.name.trim(), phone, ...scopes });
  },
  setActive: (id: ID, active: boolean) => apiUsers.update(id, { active }),
  /** Sets a new random 4-digit field-app PIN and returns it so the admin can pass it on. */
  async resetPin(id: ID): Promise<string> {
    const pin = String(1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000));
    await apiUsers.setSecret(id, { pin });
    return pin;
  },
  revokeDevice: (deviceId: ID) => apiDevices.revoke(deviceId),
};

export const FIELD_ROLES: { role: Role; label: string; hint: string }[] = [
  { role: 'loader', label: 'Loader', hint: 'Records loadings at a supplier loading point — quantities and documents, no prices' },
  { role: 'driver', label: 'Driver', hint: 'Updates trip status on the field app, also offline' },
  { role: 'receiver', label: 'Warehouse', hint: 'Acknowledges deliveries, records warehouse stock and expenses (Asie is the warehouse-manager demo)' },
  { role: 'reexport', label: 'Re-export planner', hint: 'Raises and loads onward orders from their own warehouse (e.g. Rwanda → Juba)' },
];
export const OFFICE_ROLES: { role: Role; label: string; hint?: string }[] = [
  { role: 'director', label: 'Director', hint: 'Full access, every company; payments and selling prices' },
  { role: 'planner', label: 'Purchase planner · static data', hint: 'Plans and POs for their buyer–supplier pairs; companies, suppliers, goods, transport data' },
  { role: 'truck_planner', label: 'Truck follow-up officer', hint: 'Follows every truck, truck expenses, agreed transport price; loads at the loading points on the profile' },
  { role: 'operations', label: 'Operations (unassigned)' }, { role: 'fleet', label: 'Fleet (unassigned)' },
  { role: 'accounts', label: 'Accounts (unassigned)' }, { role: 'sales', label: 'Sales (unassigned)' }, { role: 'admin', label: 'Administrator (unassigned)' },
];

// ---------------- integrations (dev endpoints, non-production servers only) ----------------
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3101/v1').replace(/\/$/, '');
async function dev<T>(path: string, init?: RequestInit): Promise<T> {
  if (API_MODE !== 'http') throw new NotAvailable('Demo mode has no server, so this');
  const res = await fetch(BASE + '/dev' + path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  if (res.status === 404 || res.status === 403) throw new NotAvailable('This tool');
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json() as Promise<T>;
}
export interface IntegrationStatus { name: string; mode: 'real' | 'stand-in'; detail: string; inspectUrl?: string }
const LABEL: Record<string, string> = { sms: 'SMS / USSD', mail: 'Email', push: 'Push', files: 'Files', pdf: 'PDF', routing: 'Routing', inboundHandler: 'Inbound check-ins' };
export const integrations = {
  async status(): Promise<IntegrationStatus[]> {
    const r = await dev<Record<string, string>>('/integrations');
    return Object.entries(r).map(([k, v]) => {
      const standIn = /^stand-?in/i.test(v);
      const inspectUrl = k === 'mail' && /localhost:11025/.test(v) ? 'http://localhost:18025' : undefined;
      return { name: LABEL[k] ?? k, mode: standIn ? 'stand-in' : 'real', detail: v.replace(/^stand-?in:\s*/i, ''), inspectUrl };
    });
  },
  /** Simulate a driver texting the shortcode (e.g. "ARR MALABA KBV894T"). */
  smsInbound: (from: string, text: string) => dev<{ reply?: string; ok?: boolean }>('/sms/inbound', { method: 'POST', body: JSON.stringify({ from, text }) }),
  async smsLog(): Promise<{ phone: string; text: string; at: string; direction: 'in' | 'out' }[]> { return (await dev<any[]>('/sms')).slice(0, 10); },
};

// ---------------- purchase orders ----------------
export const poServer = {
  /** True when the server renders the letter PDF and emails it (http mode). */
  available: API_MODE === 'http',
  async pdf(id: ID): Promise<Blob> {
    const b = await pos.pdf(id);
    if (!b) throw new NotAvailable('Server PDF');
    return b;
  },
  send: (id: ID) => pos.send(id),
};
