// docs/12 (A-05, A-07, A-08) — the mock's admin-only operations: static data, user admin and the audit search.
// Lazily imported by mock-client.ts so they stay out of the apps' entry chunks (web budget).
import * as m from './db';
import * as seed from './seed';
import * as R from '../rules';
import * as SD from '../static-data';
import type { Currency, Driver, DriverInput, Provider, ProviderInput, RouteStop, SavedDriver, Shipment, TripCost, Truck, TruckInput, Warehouse, WarehouseInput, AuditFilter, AuditPage, Checkpoint, Entity, EntityInput, ID, PriceListItem, Product, ProductInput, ReceivingCompany, ReceivingCompanyInput, Role, Supplier, SupplierInput, User, UserAdmin, UserPair } from '../types';
import type { Subject } from '../access';

export interface Ctx {
  current: User | null; me: () => Subject; ensure: () => void; price: (productId: ID) => number;
  log: (method: string, path: string, x?: Parameters<typeof m.audit>[3]) => void;
  commit: <T>(v: T) => Promise<T>; wait: <T>(v: T) => Promise<T>; httpErr: (msg: string, code: number) => Error;
  allUsers: () => User[]; adminUsers: () => UserAdmin[]; mockUsers: UserAdmin[]; ALL_ENTITIES: ID[];
}
const canStatic = (c: Ctx) => { if (!c.current || !R.hasFeature(c.current.roles, 'master-data.static')) throw c.httpErr('Only Kabonge (static data) and the directors edit companies, suppliers, goods and receiving companies', 403); };
const canTransport = (c: Ctx) => { if (!c.current || !R.canEditTransport(c.current.roles)) throw c.httpErr('Only Kabonge (static data) and the directors manage transport providers, trucks and drivers', 403); };
const upsert = <T extends { id: ID }>(list: T[] | undefined, x: T) => [...(list ?? []).filter((y) => y.id !== x.id), x];
/** The changed fields only (audit before/after). */
export const pick = (o: object, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]]));

// ---- Static data (docs/12 A-05): companies, suppliers, goods, receiving companies — Kabonge and the directors ----
  /** Add (id null) or edit a company; `active: false` deactivates it (kept for history). Room for 5 companies. */
export async function saveEntity(c: Ctx, id: ID | null, input: Partial<EntityInput>): Promise<Entity> {
    c.ensure(); canStatic(c);
    const cur = id ? seed.entities.find((e) => e.id === id) : null;
    if (id && !cur) throw c.httpErr('Company not found', 404);
    const v = { code: cur?.code, name: cur?.name, shortName: cur?.shortName, poPrefix: cur?.poPrefix, address: cur?.address, phones: cur?.phones, email: cur?.email, website: cur?.website, tagline: cur?.tagline, reportingCurrency: cur?.reportingCurrency, active: cur?.active ?? true, ...input } as Partial<EntityInput>;
    const errs = SD.validateEntity(v, seed.entities, id); if (errs.length) throw c.httpErr(errs.join('; '), errs.some((e) => /already/.test(e)) ? 409 : 422);
    const code = v.code!.trim().toUpperCase();
    const base = cur ?? { ...seed.entities[0], id: `e-${code.toLowerCase()}`, logoKey: code.toLowerCase(), colors: { primary: '#334155', accent: '#0EA5E9', ink: '#0F172A' }, letterhead: { header: '', footer: '' }, kraPin: 'to confirm', registrationNo: 'to confirm', registeredOffice: 'to confirm', footerLine: '' };
    const x: Entity = { ...base, code, name: v.name!.trim(), shortName: (v.shortName ?? '').trim() || code, poPrefix: (v.poPrefix || `${code}-PO`).trim().toUpperCase(), address: v.address ?? [], phones: v.phones ?? [], email: (v.email ?? '').trim(), website: v.website, tagline: (v.tagline ?? '').trim(), reportingCurrency: v.reportingCurrency ?? 'USD', active: v.active !== false };
    m.db.entityEdits = upsert(m.db.entityEdits, x); m.applyMasterEdits();
    if (!c.ALL_ENTITIES.includes(x.id)) c.ALL_ENTITIES.push(x.id);
    c.log(cur ? 'PATCH' : 'POST', `/masterdata/entities${cur ? `/${x.id}` : ''}`, { recordType: 'entity', recordId: x.id, summary: x.name, before: cur ? pick(cur, Object.keys(input)) : null, after: pick(x, Object.keys(input)) });
    return c.commit(x);
}
/** Add or edit a supplier (export section). A new supplier gets a loading-point checkpoint at lat/lng. Room for 7. */
export async function saveSupplier(c: Ctx, id: ID | null, input: Partial<SupplierInput>): Promise<Supplier> {
    c.ensure(); canStatic(c);
    const cur = id ? seed.suppliers.find((x) => x.id === id) : null;
    if (id && !cur) throw c.httpErr('Supplier not found', 404);
    const v = { code: cur?.code, name: cur?.name, city: cur?.city, country: cur?.country, email: cur?.email, active: cur?.active ?? true, ...input } as Partial<SupplierInput>;
    const errs = SD.validateSupplier(v, seed.suppliers, id); if (errs.length) throw c.httpErr(errs.join('; '), errs.some((e) => /already/.test(e)) ? 409 : 422);
    const code = v.code!.trim().toUpperCase();
    let checkpointId = cur?.checkpointId ?? '';
    if (v.lat !== undefined && v.lng !== undefined) {
      const cp = seed.checkpoints.find((c) => c.id === checkpointId);
      const ncp: Checkpoint = { ...(cp ?? { id: `cp-${code.toLowerCase()}`, kind: 'loading' as const, radiusM: 400 }), name: `${code} ${v.city!.trim()} (loading)`, country: R.countryCode(v.country!), lat: v.lat, lng: v.lng };
      checkpointId = ncp.id; m.db.checkpointEdits = upsert(m.db.checkpointEdits, ncp);
    }
    const x: Supplier = { id: cur?.id ?? `s-${code.toLowerCase()}`, code, name: v.name!.trim(), city: v.city!.trim(), country: v.country!.trim(), checkpointId, email: (v.email ?? '').trim(), active: v.active !== false };
    m.db.supplierEdits = upsert(m.db.supplierEdits, x); m.applyMasterEdits();
    c.log(cur ? 'PATCH' : 'POST', `/masterdata/suppliers${cur ? `/${x.id}` : ''}`, { recordType: 'supplier', recordId: x.id, summary: x.name, before: cur ? pick(cur, Object.keys(input)) : null, after: pick(x, Object.keys(input)) });
    return c.commit(x);
}
/** Add or edit goods: SKU, brand, pack, units per case, size, supplier, category; optional purchase price (USD). */
export async function saveProduct(c: Ctx, id: ID | null, input: Partial<ProductInput>): Promise<Product> {
    c.ensure(); canStatic(c);
    const cur = id ? seed.products.find((x) => x.id === id) : null;
    if (id && !cur) throw c.httpErr('Product not found', 404);
    const v = { sku: cur?.sku, brand: cur?.brand, pack: cur?.pack, unitsPerCase: cur?.unitsPerCase, sizeMl: cur?.sizeMl, supplierId: cur?.supplierId, category: cur?.category ?? null, active: cur?.active ?? true, ...input } as Partial<ProductInput>;
    const errs = SD.validateProduct(v, { products: seed.products, supplierIds: seed.suppliers.map((x) => x.id) }, id); if (errs.length) throw c.httpErr(errs.join('; '), errs.some((e) => /already/.test(e)) ? 409 : 422);
    const x: Product = { ...(cur ?? {}), id: cur?.id ?? m.uid('p'), sku: v.sku!.trim().toUpperCase(), brand: v.brand!.trim(), pack: v.pack!.trim(), unitsPerCase: v.unitsPerCase!, sizeMl: v.sizeMl!, supplierId: v.supplierId!, category: v.category || null, active: v.active !== false };
    m.db.productEdits = upsert(m.db.productEdits, x);
    if (typeof input.price === 'number') { const pl: PriceListItem = { productId: x.id, supplierId: x.supplierId, price: input.price, currency: 'USD', from: new Date().toISOString().slice(0, 10), note: null }; m.db.priceEdits = [...(m.db.priceEdits ?? []).filter((y) => y.productId !== x.id), pl]; }
    m.applyMasterEdits();
    c.log(cur ? 'PATCH' : 'POST', `/masterdata/products${cur ? `/${x.id}` : ''}`, { recordType: 'product', recordId: x.id, summary: `${x.brand} ${x.pack}`, before: cur ? pick({ ...cur, price: c.price(cur.id) }, Object.keys(input)) : null, after: pick({ ...x, price: input.price }, Object.keys(input)) });
    return c.commit(x);
}
/** Add or edit a receiving company (e.g. Asie Company, Yonas Company). */
export async function saveReceivingCompany(c: Ctx, id: ID | null, input: Partial<ReceivingCompanyInput>): Promise<ReceivingCompany> {
    c.ensure(); canStatic(c);
    const cur = id ? seed.receivingCompanies.find((x) => x.id === id) : null;
    if (id && !cur) throw c.httpErr('Receiving company not found', 404);
    const v = { name: cur?.name, countries: cur?.countries, active: cur?.active ?? true, ...input } as Partial<ReceivingCompanyInput>;
    const errs = SD.validateReceivingCompany(v, seed.receivingCompanies, id); if (errs.length) throw c.httpErr(errs.join('; '), errs.some((e) => /already/.test(e)) ? 409 : 422);
    const x: ReceivingCompany = { id: cur?.id ?? m.uid('rc'), name: v.name!.trim(), countries: v.countries!.map((c) => c.trim()), active: v.active !== false };
    m.db.receivingCompanyEdits = upsert(m.db.receivingCompanyEdits, x); m.applyMasterEdits();
    c.log(cur ? 'PATCH' : 'POST', `/masterdata/receiving-companies${cur ? `/${x.id}` : ''}`, { recordType: 'receiving-company', recordId: x.id, summary: x.name, before: cur ? pick(cur, Object.keys(input)) : null, after: pick(x, Object.keys(input)) });
    return c.commit(x);
}

type UserScopeInput = { entityIds?: ID[]; loadingPointIds?: ID[]; warehouseIds?: ID[]; pairs?: UserPair[]; routeIds?: ID[] };
/** Scope lists must name known companies, loading points, warehouses, routes and buyer–supplier pairs (same checks as the API). */
function checkScope(c: Ctx, input: UserScopeInput) {
  const known = { entityIds: seed.entities.map((e) => e.id), loadingPointIds: seed.suppliers.map((x) => x.id), warehouseIds: seed.warehouses.map((w) => w.id), routeIds: m.db.routes.map((r) => r.id) };
  for (const k of Object.keys(known) as (keyof typeof known)[]) { const v = input[k]; if (v !== undefined && !(Array.isArray(v) && v.every((x) => known[k].includes(x)))) throw c.httpErr(`${k}: unknown id`, 422); }
  if (input.pairs !== undefined && !(Array.isArray(input.pairs) && input.pairs.every((p) => p && known.entityIds.includes(p.entityId) && known.loadingPointIds.includes(p.supplierId)))) throw c.httpErr('pairs: each needs a known company and supplier', 422);
}
const canUsers = (c: Ctx) => { if (!c.current || !R.hasFeature(c.current.roles, 'users')) throw c.httpErr('Only the directors manage users', 403); };
export async function listUsers(c: Ctx) { c.ensure(); canUsers(c); const last = m.db.lastLogin ?? {}; return c.wait(c.adminUsers().map((u) => ({ ...u, lastLoginAt: last[u.id] ?? null }))); }
export async function createUser(c: Ctx, input: { name: string; phone: string; username?: string; email?: string; roles: Role[]; password?: string; pin?: string } & UserScopeInput) {
    c.ensure(); canUsers(c);
    if (!input.name?.trim() || !input.phone?.trim()) throw new Error('Name and phone are required');
    if (!input.roles?.length) throw new Error('Pick at least one valid role');
    checkScope(c, input);
    const u: UserAdmin = { id: m.uid('u'), name: input.name, phone: input.phone, username: input.username ?? input.name.split(' ')[0].toLowerCase(), email: input.email ?? null, roles: input.roles, entityIds: input.entityIds ?? [], ...R.entityAccess({ roles: input.roles, entityIds: input.entityIds ?? [] }, c.ALL_ENTITIES), loadingPointIds: input.loadingPointIds ?? [], warehouseIds: input.warehouseIds ?? [], pairs: input.pairs ?? [], routeIds: input.routeIds ?? [], active: true, hasPassword: !!input.password, hasPin: !!input.pin, driverId: null, features: R.featuresFor(input.roles) };
    c.mockUsers.push(u); (m.db.extraUsers ??= []).push(u);
    c.log('POST', '/users', { recordType: 'user', recordId: u.id, summary: u.name, after: { roles: u.roles, entityIds: u.entityIds, pairs: u.pairs } });
    return c.commit(u);
}
export async function updateUser(c: Ctx, id: ID, input: Partial<Pick<UserAdmin, 'name' | 'email' | 'roles' | 'entityIds' | 'loadingPointIds' | 'warehouseIds' | 'pairs' | 'routeIds' | 'active'>>) {
    c.ensure(); canUsers(c); checkScope(c, input);
    const u = c.adminUsers().find((x) => x.id === id); if (!u) throw c.httpErr('User not found', 404);
    const keys = Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined);
    const before = pick(u, keys);
    Object.assign(u, input, R.entityAccess({ roles: input.roles ?? u.roles, entityIds: input.entityIds ?? u.entityIds }, c.ALL_ENTITIES), { features: R.featuresFor(input.roles ?? u.roles) });
    const live = c.allUsers().find((x) => x.id === id); if (live && live !== u) Object.assign(live, input, { allowedEntityIds: u.allowedEntityIds, canGroup: u.canGroup, features: u.features });
    c.log('PATCH', `/users/${id}`, { recordType: 'user', recordId: id, summary: u.name, before, after: pick(u, keys) });
    return c.commit(u);
}
/** docs/12 A-07: the audit log — search by user, feature, date and text; newest first, paged (directors). */
export async function auditList(c: Ctx, f: AuditFilter = {}): Promise<AuditPage> {
    c.ensure(); if (!c.current || !R.hasFeature(c.current.roles, 'audit')) throw c.httpErr('The audit log is for the directors', 403);
    const q = (f.q ?? '').trim().toLowerCase();
    const from = f.from ? Date.parse(f.from) : -Infinity, to = f.to ? Date.parse(f.to.length === 10 ? `${f.to}T23:59:59.999Z` : f.to) : Infinity;
    const names = new Map(c.allUsers().map((u) => [u.id, u.name]));
    const rows = (m.db.audit ?? []).filter((r) => (!f.userId || r.userId === f.userId) && (!f.feature || r.feature === f.feature) && Date.parse(r.at) >= from && Date.parse(r.at) <= to
      && (!q || `${r.path} ${r.summary ?? ''} ${r.recordId ?? ''} ${names.get(r.userId ?? '') ?? ''}`.toLowerCase().includes(q))).sort((a, b) => b.at.localeCompare(a.at)); // newest first, like the server
    const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50)), page = Math.max(1, f.page ?? 1);
    const byDay = new Map<string, number>(); for (const r of rows) byDay.set(r.at.slice(0, 10), (byDay.get(r.at.slice(0, 10)) ?? 0) + 1);
    return c.wait({ rows: rows.slice((page - 1) * pageSize, page * pageSize).map((r) => ({ ...r, userName: names.get(r.userId ?? '') ?? (r.userId ? r.userId : 'system') })), total: rows.length, page, pageSize,
      byDay: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, n]) => ({ day, n })) });
  }

/** docs/12 A-04: the agreed transport price of a loaded truck, recorded after loading (Testfie, directors). */
export async function setAgreedPrice(c: Ctx, sh: Shipment, input: { amount: number; currency?: Currency; docRef?: string; confirmUnusual?: boolean }) {
    const shipmentId = sh.id;
    if (!(Number(input?.amount) > 0)) throw c.httpErr('Enter the agreed transport price (above zero)', 422);
    // docs/17 F4: the currency is always explicit and the amount plausible for it
    const { check, note } = (await import('./sanity')).mockSane('transport', input.amount, input.currency, Date.now(), input.confirmUnusual);
    const currency = check.currency as Currency;
    const rate = R.fxFor(m.db.fxRates ?? seed.seedFxRates(), currency, Date.now());
    const cur = m.db.costs.find((c) => c.shipmentId === sh.id && c.kind === 'Transport');
    const before = cur ? { amount: cur.amount, currency: cur.currency } : null;
    if (cur && m.db.payments.some((p) => p.costId === cur.id)) throw c.httpErr('Payments were made against this price — record a correction as another cost instead', 409);
    const x: TripCost = { id: cur?.id ?? m.uid('cost'), entityId: sh.entityId, shipmentId: sh.id, legId: sh.legs[0]?.id, kind: 'Transport', amount: Number(input.amount), currency, docRef: input.docRef?.trim() || `Agreed after loading ${new Date().toISOString().slice(0, 10)}`, fxRate: rate, amountUsd: Math.round((Number(input.amount) / rate) * 100) / 100 };
    if (cur) Object.assign(cur, x); else m.db.costs.push(x);
    const ld = m.db.loadings.find((l) => (l.poId === sh.poId || m.db.pos.find((p) => p.id === l.poId)?.revisionOf === m.db.pos.find((p) => p.id === sh.poId)?.revisionOf) && l.truckNo === sh.truckNo && l.status === 'Loaded');
    if (ld && !sh.fromWarehouseId) { ld.agreedTransport = x.amount; ld.transportCurrency = currency; }
    c.log('POST', `/shipments/${shipmentId}/agreed-price`, { recordType: 'shipment', recordId: shipmentId, entityId: sh.entityId, summary: `${sh.ref}: agreed transport ${currency} ${x.amount}${note}`, before, after: { amount: x.amount, currency } });
    return c.commit(x);
  }

// ---- Warehouses, routes and transport onboarding (doc 08 §3, docs/10) -------------------------------------------
export async function saveWarehouse(c: Ctx, id: ID | null, input: Partial<WarehouseInput>): Promise<Warehouse> {
    c.ensure();
    if (!c.current || !c.current.roles.some((r) => r === 'admin' || r === 'director')) throw Object.assign(new Error('Only an admin or director manages warehouses'), { status: 403 });
    const cur = id ? seed.warehouses.find((w) => w.id === id) : null;
    if (id && !cur) throw Object.assign(new Error('Warehouse not found'), { status: 404 });
    const cp = cur ? seed.checkpoints.find((c) => c.id === cur.checkpointId) : null;
    const v = { name: cur?.name, country: cur?.country, town: cur?.town, receivingCompanyId: cur?.receivingCompanyId, lat: cp?.lat, lng: cp?.lng, radiusM: cp?.radiusM, active: cur?.active ?? true, ...input };
    const errs = R.validateWarehouse(v, seed.receivingCompanies.map((r) => r.id));
    if (errs.length) throw Object.assign(new Error(errs.join('; ')), { status: 422 });
    const name = v.name!.trim(), country = v.country!.trim(), town = v.town!.trim();
    const codes = R.checkpointCodes(`${name} ${town}`, 'warehouse');
    const ncp: Checkpoint = { ...(cp ?? { id: m.uid('cp-wh'), kind: 'warehouse' as const, code: codes[0], aliases: codes }), name, country: R.countryCode(country), lat: v.lat!, lng: v.lng!, radiusM: v.radiusM ?? 500 };
    const nw: Warehouse = { ...(cur ?? { id: m.uid('w'), checkpointId: ncp.id }), name, country, town, receivingCompanyId: v.receivingCompanyId!, active: v.active !== false };
    const up = <T extends { id: ID }>(list: T[] | undefined, x: T) => [...(list ?? []).filter((y) => y.id !== x.id), x];
    m.db.warehouseEdits = up(m.db.warehouseEdits, nw); m.db.checkpointEdits = up(m.db.checkpointEdits, ncp);
    m.applyMasterEdits();
    c.log(id ? 'PATCH' : 'POST', `/masterdata/warehouses${id ? `/${id}` : ''}`, { recordType: 'warehouse', recordId: nw.id, summary: nw.name, before: cur ? { ...cur } : null, after: nw });
    return c.commit(nw);
}
/** Doc 08 §3: a new route (checkpoints in order), e.g. ending at a new warehouse. */
export async function addRoute(c: Ctx, input: { name: string; code?: string; distanceKm?: number; stops: RouteStop[] }) {
    c.ensure(); canTransport(c);
    const errs = R.validateRoute(input, seed.checkpoints.map((c) => c.id));
    if (errs.length) throw Object.assign(new Error(errs.join('; ')), { status: 422 });
    const short = (id: ID) => (seed.checkpoints.find((c) => c.id === id)?.code ?? R.checkpointCodes(seed.checkpoints.find((c) => c.id === id)?.name ?? 'X', 'town')[0]).slice(0, 3);
    const r = { id: m.uid('r'), code: input.code?.trim() || `${short(input.stops[0].checkpointId)}-${short(input.stops.at(-1)!.checkpointId)}`, name: input.name.trim(), distanceKm: input.distanceKm ?? 0, stops: input.stops };
    m.db.routes.push(r); c.log('POST', '/masterdata/routes', { recordType: 'route', recordId: r.id, summary: r.name, after: r }); return c.commit(r);
}
export async function updateRouteStops(c: Ctx, routeId: ID, stops: RouteStop[]) {
    c.ensure(); canTransport(c); const r = m.db.routes.find((x) => x.id === routeId)!;
    if (stops.some((s, i) => i > 0 && s.plannedHours < stops[i - 1].plannedHours + stops[i - 1].plannedDwellHours)) throw new Error('Planned hours must increase along the route (including dwell)');
    r.stops = stops; return c.commit(r);
}
export async function saveProvider(c: Ctx, id: ID | null, input: Partial<ProviderInput>): Promise<Provider> {
    c.ensure(); canTransport(c);
    const cur = id ? m.db.providers.find((p) => p.id === id) : null;
    if (id && !cur) throw c.httpErr('Provider not found', 404);
    const v = { name: cur?.name, kind: cur?.kind ?? (cur && !cur.regular ? 'market' : 'company'), regular: cur?.regular, phone: cur?.phone, contactName: cur?.contactName, email: cur?.email, notes: cur?.notes, active: cur?.active ?? true, ...input } as Partial<ProviderInput>;
    const errs = R.validateProvider(v, m.db.providers, id); if (errs.length) throw c.httpErr(errs.join('; '), 422);
    const x: Provider = { id: cur?.id ?? m.uid('pr'), name: v.name!.trim(), kind: v.kind!, regular: v.regular ?? v.kind !== 'market', phone: v.phone ? R.normPhone(v.phone) : '', contactName: (v.contactName ?? '').trim(), email: (v.email ?? '').trim(), notes: (v.notes ?? '').trim(), active: v.active !== false };
    c.log(cur ? 'PATCH' : 'POST', `/masterdata/providers${cur ? `/${cur.id}` : ''}`, { recordType: 'provider', recordId: x.id, summary: x.name, before: cur ? { ...cur } : null, after: x });
    if (cur) Object.assign(cur, x); else m.db.providers.push(x);
    return c.commit(x);
}
/** Add or edit a truck: unique registration, capacity in cases, default driver; `active: false` takes it off queues. */
export async function saveTruck(c: Ctx, id: ID | null, input: Partial<TruckInput>): Promise<Truck> {
    c.ensure(); canTransport(c);
    const cur = id ? m.db.trucks.find((t) => t.id === id) : null;
    if (id && !cur) throw c.httpErr('Truck not found', 404);
    const v = { providerId: cur?.providerId, reg: cur?.reg, trailer: cur?.trailer ?? '', capacityCases: cur?.capacityCases, defaultDriverId: cur?.defaultDriverId ?? null, active: cur?.active ?? true, note: cur?.note ?? null, documents: cur?.documents ?? [], ...input } as Partial<TruckInput>;
    const errs = R.validateTruck(v, { providers: m.db.providers, trucks: m.db.trucks, drivers: m.db.drivers }, id); if (errs.length) throw c.httpErr(errs.join('; '), 422);
    if (cur && v.active === false && cur.active !== false && m.db.waiting.some((w) => w.truckId === cur.id && w.status === 'Waiting')) throw c.httpErr(`${cur.reg} is in a loading queue — remove it from the queue first`, 409);
    const x: Truck = { ...(cur ?? {}), id: cur?.id ?? m.uid('t'), providerId: v.providerId!, reg: R.normReg(v.reg), trailer: (v.trailer ?? '').trim().toUpperCase(), capacityCases: v.capacityCases!, active: v.active !== false, note: v.note ?? null, documents: (v.documents ?? []).map((d) => ({ id: d.id || m.uid('doc'), kind: d.kind ?? 'photo', name: d.name })) };
    if (v.defaultDriverId) x.defaultDriverId = v.defaultDriverId; else delete x.defaultDriverId;
    c.log(cur ? 'PATCH' : 'POST', `/masterdata/trucks${cur ? `/${cur.id}` : ''}`, { recordType: 'truck', recordId: x.id, summary: x.reg, before: cur ? { ...cur } : null, after: x });
    if (cur) Object.assign(cur, x); else m.db.trucks.push(x);
    return c.commit(x);
}
/** Add or edit a driver (unique phone). `appLogin: true` with `hasApp` gives the driver a field-app login (PIN). */
export async function saveDriver(c: Ctx, id: ID | null, input: Partial<DriverInput> & { appLogin?: boolean }): Promise<SavedDriver> {
    c.ensure(); canTransport(c);
    const cur = id ? m.db.drivers.find((d) => d.id === id) : null;
    if (id && !cur) throw c.httpErr('Driver not found', 404);
    const v = { providerId: cur?.providerId, name: cur?.name, phone: cur?.phone, licence: cur?.licence ?? '', hasApp: cur?.hasApp ?? false, active: cur?.active ?? true, ...input };
    const errs = R.validateDriver(v, { providers: m.db.providers, drivers: m.db.drivers }, id); if (errs.length) throw c.httpErr(errs.join('; '), 422);
    const phone = R.normPhone(v.phone);
    const x: Driver = { ...(cur ?? {}), id: cur?.id ?? m.uid('d'), providerId: v.providerId!, name: v.name!.trim(), phone, licence: (v.licence ?? '').trim(), hasApp: v.hasApp === true, active: v.active !== false };
    if (cur && cur.phone !== phone) { delete x.localPhone; delete x.phoneNote; }
    let login: SavedDriver['login'];
    if (input.appLogin && x.hasApp) {
      const owner = c.allUsers().find((u) => R.normPhone(u.phone) === phone);
      if (owner && !owner.roles.includes('driver')) throw c.httpErr('This phone number belongs to an office user — use another number for the driver', 409);
      if (owner) login = { userId: owner.id, username: owner.id.replace(/^u-/, '') };
      else {
        const u: User = { id: m.uid('u'), name: x.name, phone, roles: ['driver'], entityIds: [], loadingPointIds: [], warehouseIds: [], ...R.entityAccess({ roles: ['driver'], entityIds: [] }, c.ALL_ENTITIES), features: [] };
        (m.db.extraUsers ??= []).push(u);
        c.mockUsers.push({ ...u, username: u.id.replace(/^u-/, ''), email: null, active: true, hasPassword: false, hasPin: true, driverId: x.id });
        login = { userId: u.id, username: u.id.replace(/^u-/, ''), pin: '1234' }; // demo PIN (mock)
      }
    }
    c.log(cur ? 'PATCH' : 'POST', `/masterdata/drivers${cur ? `/${cur.id}` : ''}`, { recordType: 'driver', recordId: x.id, summary: x.name, before: cur ? { ...cur } : null, after: x });
    if (cur) Object.assign(cur, x); else m.db.drivers.push(x);
    return c.commit({ ...x, ...(login ? { login } : {}) });
}
