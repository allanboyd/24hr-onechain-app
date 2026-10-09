import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema as t, type Tx } from '../db/client';
import { applyPass, deriveShipmentStatus, dwell, etaOf, makePasses, overdue, undoPass, H } from '@btw/api/rules';
import type { AckLine, CheckpointPass, Leg, Loading, Role, TruckIssue } from '@btw/api/types';
import { fail, forbidden, notFound } from '../common/errors';
import { isUsableImage } from '../common/images';
import { iso, uid } from '../common/ids';
import { canOperate, canSeeEntity, canSeeLoadingPoint, has, isGlobal, OPS, type Principal } from '../auth/principal';
import type { AckPdfData, InboundCheckin, InboundHandler } from '../integrations/ports';
import { NotifyService } from './notify.service';
import { RefService } from './ref.service';
import { loadShipment, loadShipments, map, publicShipment, saveShipment, shipmentIdOfLeg, type ShipmentRow } from './store';

const OFFICE: Role[] = ['planner', 'operations', 'fleet', 'accounts'];
const ACTIVE = (l: Leg) => !['Acknowledged', 'Cancelled'].includes(l.status);

export interface ConfirmLoadingInput { truckId: string; driverId: string; loadedQty: Record<string, number>; agreedTransport: number; transportCurrency?: string; documents?: string[]; loadedAt?: string }
export interface AckInput { receiverName: string; lines: AckLine[]; signature?: string; photos?: string[]; at?: string }

@Injectable()
export class LogisticsService implements InboundHandler {
  constructor(private ref: RefService, private notify: NotifyService) {}

  // ---- scope helpers -------------------------------------------------------------
  private async warehouseCheckpoints(p: Principal) {
    const { bundle } = await this.ref.get();
    return bundle.warehouses.filter((w) => p.warehouseIds.includes(w.id)).map((w) => w.checkpointId);
  }
  private async loadingCheckpoints(p: Principal) {
    const { bundle } = await this.ref.get();
    return bundle.suppliers.filter((s) => p.loadingPointIds.includes(s.id)).map((s) => s.checkpointId);
  }
  private async canSeeShipment(p: Principal, sh: ShipmentRow) {
    if (isGlobal(p)) return true;
    if (has(p, ...OFFICE) && canSeeEntity(p, sh.entityId)) return true;
    if (has(p, 'loader') && p.loadingPointIds.includes(sh.loadingPointId)) return true;
    if (has(p, 'receiver', 'sales')) {
      if (p.warehouseIds.includes(sh.warehouseId)) return true;
      const cps = await this.warehouseCheckpoints(p);
      if (sh.legs.some((l) => cps.includes(l.toId) || cps.includes(l.fromId))) return true;
    }
    if (has(p, 'driver') && p.driverId && sh.legs.some((l) => l.driverId === p.driverId)) return true;
    return false;
  }
  private async derive(sh: ShipmentRow) {
    const { bundle } = await this.ref.get();
    const stops = (id: string) => bundle.routes.find((r) => r.id === id)?.stops ?? [];
    sh.status = deriveShipmentStatus(sh, bundle.warehouses.find((w) => w.id === sh.warehouseId)?.checkpointId, stops);
    return sh;
  }
  private async shipmentForLeg(tx: Tx, p: Principal | null, legId: string) {
    const sh = await loadShipment(tx, await shipmentIdOfLeg(tx, legId), true);
    if (p && !(await this.canSeeShipment(p, sh))) forbidden();
    return { sh, leg: sh.legs.find((l) => l.id === legId)! };
  }

  // ---- Waiting list (§17.4) ------------------------------------------------------
  async waiting(p: Principal, loadingPointId?: string) {
    const rows = (await db.select().from(t.waitingEntries).orderBy(asc(t.waitingEntries.position))).map(map.waiting);
    return rows.filter((w) => (!loadingPointId || w.loadingPointId === loadingPointId) && canSeeLoadingPoint(p, w.loadingPointId));
  }
  private assertLp(p: Principal, lp: string) { if (!canSeeLoadingPoint(p, lp)) forbidden('Not your loading point'); }
  /** Changing a loading queue: loading-point staff of that point, fleet/operations/planner, or directors/admin. */
  private assertLpWrite(p: Principal, lp: string) {
    this.assertLp(p, lp);
    if (!isGlobal(p) && !has(p, 'loader', ...OPS)) forbidden('Only loading-point and fleet staff change the waiting list');
  }
  private assertOperator(p: Principal | null) { if (p && !canOperate(p)) forbidden('Your role can view trips but not change them'); }
  private async renumber(tx: Tx, lp: string) {
    const q = (await tx.select().from(t.waitingEntries).where(and(eq(t.waitingEntries.loadingPointId, lp), eq(t.waitingEntries.status, 'Waiting')))).sort((a, b) => a.position - b.position);
    for (const [k, w] of q.entries()) if (w.position !== k + 1) await tx.update(t.waitingEntries).set({ position: k + 1 }).where(eq(t.waitingEntries.id, w.id));
  }
  async addWaiting(p: Principal, loadingPointId: string, truckId: string, driverId: string) {
    this.assertLpWrite(p, loadingPointId);
    const { bundle } = await this.ref.get();
    if (!bundle.suppliers.some((x) => x.id === loadingPointId)) notFound('Loading point');
    if (!bundle.trucks.some((x) => x.id === truckId)) notFound('Truck');
    if (!bundle.drivers.some((x) => x.id === driverId)) notFound('Driver');
    return db.transaction(async (tx) => {
      const [dup] = await tx.select().from(t.waitingEntries).where(and(eq(t.waitingEntries.truckId, truckId), eq(t.waitingEntries.status, 'Waiting')));
      if (dup) fail(`${await this.ref.truckReg(truckId)} is already in a waiting list`, 409, 'duplicate');
      const n = (await tx.select().from(t.waitingEntries).where(and(eq(t.waitingEntries.loadingPointId, loadingPointId), eq(t.waitingEntries.status, 'Waiting')))).length;
      const e = { id: uid('wl'), loadingPointId, truckId, driverId, arrivedAt: iso(), position: n + 1, status: 'Waiting' as const };
      await tx.insert(t.waitingEntries).values(e);
      return e;
    });
  }
  async moveWaiting(p: Principal, entryId: string, dir: -1 | 1) {
    return db.transaction(async (tx) => {
      const [e] = await tx.select().from(t.waitingEntries).where(eq(t.waitingEntries.id, entryId));
      if (!e) return notFound('Waiting entry');
      this.assertLpWrite(p, e.loadingPointId);
      const q = (await tx.select().from(t.waitingEntries).where(and(eq(t.waitingEntries.loadingPointId, e.loadingPointId), eq(t.waitingEntries.status, 'Waiting')))).sort((a, b) => a.position - b.position);
      const i = q.findIndex((x) => x.id === entryId); const j = i + dir;
      if (j >= 0 && j < q.length) {
        [q[i], q[j]] = [q[j], q[i]];
        for (const [k, w] of q.entries()) await tx.update(t.waitingEntries).set({ position: k + 1 }).where(eq(t.waitingEntries.id, w.id));
      }
      return map.waiting((await tx.select().from(t.waitingEntries).where(eq(t.waitingEntries.id, entryId)))[0]);
    });
  }
  async removeWaiting(p: Principal, entryId: string) {
    return db.transaction(async (tx) => {
      const [e] = await tx.select().from(t.waitingEntries).where(eq(t.waitingEntries.id, entryId));
      if (!e) return notFound('Waiting entry');
      this.assertLpWrite(p, e.loadingPointId);
      await tx.delete(t.waitingEntries).where(eq(t.waitingEntries.id, entryId));
      await this.renumber(tx, e.loadingPointId);
      return true;
    });
  }
  /** Non-regular (market) truck registered on the spot: company, truck, trailer, driver (§17.4). */
  async addMarketTruck(p: Principal, loadingPointId: string, input: { company: string; reg: string; trailer: string; capacityCases: number; driverName: string; driverPhone: string }) {
    this.assertLpWrite(p, loadingPointId);
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    if (!text(input?.reg) || !text(input?.driverName)) fail('Truck registration and driver name are required');
    if (input.capacityCases !== undefined && !(Number.isInteger(input.capacityCases) && input.capacityCases > 0)) fail('Capacity must be a whole number of cases');
    input = { ...input, company: text(input.company), trailer: text(input.trailer), driverName: text(input.driverName), driverPhone: text(input.driverPhone) };
    const reg = text(input.reg).toUpperCase().replace(/\s+/g, ' ');
    const res = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(t.trucks).where(eq(t.trucks.reg, reg));
      if (existing) fail(`${reg} is already registered — pick it from the list`, 409, 'duplicate');
      const company = input.company?.trim() || 'Market truck';
      let [provider] = await tx.select().from(t.providers).where(sql`lower(${t.providers.name}) = ${company.toLowerCase()}`);
      if (!provider) { provider = { id: uid('pr'), name: company, regular: false, phone: '' }; await tx.insert(t.providers).values(provider); }
      const driver = { id: uid('d'), name: input.driverName.trim(), phone: input.driverPhone?.trim() ?? '', licence: '', providerId: provider.id, hasApp: false };
      await tx.insert(t.drivers).values(driver);
      const truck = { id: uid('t'), providerId: provider.id, reg, trailer: (input.trailer ?? '').trim().toUpperCase(), capacityCases: input.capacityCases || 2000, defaultDriverId: driver.id };
      await tx.insert(t.trucks).values(truck);
      const n = (await tx.select().from(t.waitingEntries).where(and(eq(t.waitingEntries.loadingPointId, loadingPointId), eq(t.waitingEntries.status, 'Waiting')))).length;
      const entry = { id: uid('wl'), loadingPointId, truckId: truck.id, driverId: driver.id, arrivedAt: iso(), position: n + 1, status: 'Waiting' as const };
      await tx.insert(t.waitingEntries).values(entry);
      return { truck, driver, entry };
    });
    this.ref.invalidate();
    return res;
  }

  // ---- Loading (LD-*) -------------------------------------------------------------
  async loadings(p: Principal, loadingPointId?: string) {
    const rows = (await db.select().from(t.loadings)).map(map.loading);
    return rows.filter((l) => (!loadingPointId || l.loadingPointId === loadingPointId) && canSeeLoadingPoint(p, l.loadingPointId));
  }

  /** LD-01..04 + §17.5: record the loading → shipment with its first leg, agreed transport cost, queue entry closed. */
  async confirmLoading(p: Principal, id: string, input: ConfirmLoadingInput) {
    if (!isGlobal(p) && !has(p, 'loader', ...OPS)) forbidden('Only loading-point staff record loadings');
    const { bundle } = await this.ref.get();
    const truck = bundle.trucks.find((x) => x.id === input.truckId) ?? notFound('Truck');
    if (!input.driverId) fail('Pick the driver');
    if (!(Number(input.agreedTransport) > 0)) fail('Enter the agreed transport price (§17.5)');
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(t.loadings).where(eq(t.loadings.id, id)).for('update');
      if (!row) return notFound('Loading');
      const ld = map.loading(row);
      this.assertLp(p, ld.loadingPointId);
      if (ld.status === 'Loaded') fail('This truck is already loaded', 409, 'state');
      ld.lines.forEach((l) => (l.loadedQty = Math.max(0, Math.round(input.loadedQty?.[l.planLineId] ?? l.loadedQty))));
      const total = ld.lines.reduce((a, l) => a + l.loadedQty, 0);
      if (total > truck.capacityCases) fail(`Over truck capacity: ${total} > ${truck.capacityCases} cases (§7.3 #3)`);
      if (total <= 0) fail('Loaded quantity must be above zero');
      const at = input.loadedAt ? Date.parse(input.loadedAt) : Date.now();
      ld.truckId = input.truckId; ld.driverId = input.driverId; ld.agreedTransport = Number(input.agreedTransport); ld.loadedAt = iso(at); ld.status = 'Loaded';
      ld.transportCurrency = (input.transportCurrency ?? 'USD') as Loading['transportCurrency'];
      ld.documents = (input.documents ?? []).map((n) => ({ id: n.startsWith('file-') ? n : uid('doc'), kind: 'delivery-note' as const, name: n }));
      await tx.update(t.loadings).set({ truckId: ld.truckId, driverId: ld.driverId, agreedTransport: ld.agreedTransport, transportCurrency: ld.transportCurrency, loadedAt: ld.loadedAt, status: 'Loaded', lines: ld.lines, documents: ld.documents }).where(eq(t.loadings.id, id));

      const [po] = await tx.select().from(t.pos).where(eq(t.pos.id, ld.poId));
      const [plan] = await tx.select().from(t.plans).where(eq(t.plans.id, po.planId));
      const pl = plan.lines.find((l) => l.id === ld.lines[0].planLineId)!;
      const routeStops = bundle.routes.find((r) => r.id === pl.routeId)!.stops;
      const wh = bundle.warehouses.find((w) => w.receivingCompanyId === pl.deliveredToId && routeStops.at(-1)!.checkpointId === w.checkpointId) ?? bundle.warehouses.find((w) => w.receivingCompanyId === pl.deliveredToId)!;
      const refs = (await tx.select({ ref: t.shipments.ref }).from(t.shipments)).map((r) => +r.ref.split('-').at(-1)!);
      const year = new Date(at).getFullYear();
      const sh: ShipmentRow = { id: uid('shp'), ref: `SHP-${year}-${String(Math.max(40, ...refs) + 1).padStart(4, '0')}`, poId: po.id, truckNo: ld.truckNo, receivingCompanyId: pl.deliveredToId, warehouseId: wh.id, legs: [], status: 'Loaded', entityId: po.entityId, loadingPointId: po.supplierId };
      await tx.insert(t.shipments).values({ id: sh.id, ref: sh.ref, poId: sh.poId, truckNo: sh.truckNo, receivingCompanyId: sh.receivingCompanyId, warehouseId: sh.warehouseId, status: 'Loaded', entityId: sh.entityId, loadingPointId: sh.loadingPointId });
      const leg = this.newLeg(sh, pl.routeId, routeStops, input.truckId, input.driverId, at + 2 * H, ld.lines.map((l) => ({ productId: l.productId, loadedQty: l.loadedQty })));
      leg.status = 'Loaded';
      await this.derive(sh);
      await saveShipment(tx, sh);
      await tx.insert(t.tripCosts).values({ id: uid('cost'), shipmentId: sh.id, legId: leg.id, kind: 'Transport', amount: ld.agreedTransport, currency: ld.transportCurrency, docRef: `Agreed at loading ${ld.loadedAt.slice(0, 10)}` });
      await tx.update(t.waitingEntries).set({ status: 'Loaded' }).where(and(eq(t.waitingEntries.truckId, input.truckId), inArray(t.waitingEntries.status, ['Waiting', 'Assigned'])));
      await this.notify.notify(tx, 'Truck loaded', `${truck.reg} · ${total.toLocaleString('en-US')} cases · ${sh.ref}`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'director']);
      return sh;
    });
    const driver = bundle.drivers.find((d) => d.id === input.driverId);
    const dest = bundle.checkpoints.find((c) => c.id === result.legs[0].toId);
    void this.notify.pushToDriver(input.driverId, 'Loaded — trip assigned', `${truck.reg} · ${result.ref} to ${dest?.name ?? ''}. Slide “I’m leaving” when you depart.`, `#/trip/${result.legs[0].id}`);
    if (driver?.phone && !driver.hasApp) {
      const first = bundle.checkpoints.find((c) => c.id === result.legs[0].passes[1]?.checkpointId);
      await this.notify.smsTo(driver.phone, `BTW: ${truck.reg} loaded for ${result.ref}. At each checkpoint SMS: ARR ${first?.code ?? 'PLACE'} ${truck.reg.replace(/\s/g, '')} (DEP when leaving).`);
    }
    return publicShipment(result);
  }

  private newLeg(sh: ShipmentRow, routeId: string, stops: { checkpointId: string; plannedHours: number; plannedDwellHours: number }[], truckId: string, driverId: string, departAt: number, lines?: Leg['lines'], prevAckLines?: AckLine[]): Leg {
    const prev = sh.legs.at(-1);
    const leg: Leg = {
      id: uid('leg'), seq: sh.legs.length + 1, routeId, fromId: stops[0].checkpointId, toId: stops.at(-1)!.checkpointId, truckId, driverId, status: 'Planned',
      plannedArrival: iso(departAt + stops.at(-1)!.plannedHours * H), passes: makePasses(stops, departAt), issues: [],
      // DS-02/03: the next leg carries forward the good quantity actually received on the previous leg
      lines: lines ?? (prevAckLines ? prevAckLines.map((l) => ({ productId: l.productId, loadedQty: l.received - l.damaged })) : prev!.lines),
    };
    sh.legs.push(leg);
    return leg;
  }

  // ---- Shipments & legs (DS-*, TR-*) ----------------------------------------------
  private async poRefs() { return new Map((await db.select({ id: t.pos.id, ref: t.pos.ref }).from(t.pos)).map((x) => [x.id, x.ref])); }
  async list(p: Principal) {
    const all = await loadShipments(db);
    const refs = await this.poRefs();
    const out = [];
    for (const sh of all.reverse()) if (await this.canSeeShipment(p, sh)) out.push({ ...publicShipment(await this.derive(sh)), poRef: refs.get(sh.poId) ?? '' });
    return out;
  }
  async get(p: Principal, id: string) {
    const sh = await loadShipment(db, id);
    if (!(await this.canSeeShipment(p, sh))) forbidden();
    return { ...publicShipment(await this.derive(sh)), poRef: (await this.poRefs()).get(sh.poId) ?? '' };
  }

  async pass(p: Principal | null, legId: string, checkpointId: string, kind: 'arrived' | 'departed', source: CheckpointPass['source'] = 'driver', at = Date.now()) {
    return db.transaction(async (tx) => {
      const { sh, leg } = await this.shipmentForLeg(tx, p, legId);
      this.assertOperator(p);
      if (p && has(p, 'driver') && !isGlobal(p) && !has(p, ...OPS) && leg.driverId !== p.driverId) forbidden('Not your trip');
      if (kind !== 'arrived' && kind !== 'departed') fail('kind must be "arrived" or "departed"', 400, 'bad-request');
      // Offline check-ins carry the phone's time; allow small clock skew, never the future (it would fake punctuality).
      if (!Number.isFinite(at)) fail('Invalid check-in time', 400, 'bad-request');
      if (at > Date.now() + 10 * 60_000) fail("Check-in time is in the future — check the phone's clock");
      if (!ACTIVE(leg)) fail(`This leg is already ${leg.status.toLowerCase()}`, 409, 'state');
      const cp = await this.ref.checkpoint(checkpointId) ?? notFound('Checkpoint');
      const ev = applyPass(leg, checkpointId, kind, source, cp.kind, at);
      await this.derive(sh);
      await saveShipment(tx, sh);
      const reg = await this.ref.truckReg(leg.truckId);
      if (ev === 'dispatched') {
        await this.notify.notify(tx, 'Truck dispatched', `${reg} left ${cp.name}`, `#/shipments/${sh.id}`, ['operations', 'fleet']);
        if (source !== 'driver') { const next = leg.passes[1] ? await this.ref.checkpoint(leg.passes[1].checkpointId) : undefined; void this.notify.pushToDriver(leg.driverId, 'Handed over — you are on the road', `${reg} left ${cp.name}. Next: ${next?.name ?? 'destination'}.`, `#/trip/${leg.id}`); }
      }
      else if (ev === 'arrived') await this.notify.notify(tx, 'Truck arrived', `${reg} at ${cp.name} — awaiting acknowledgement`, `#/shipments/${sh.id}`, ['receiver', 'operations', 'director']);
      else if (ev === 'border') await this.notify.notify(tx, 'Truck at border', `${reg} reached ${cp.name}`, `#/shipments/${sh.id}`, ['fleet', 'operations']);
      return leg;
    });
  }
  /** Audited correction of the latest check-in (the driver's local 5-s undo window had already synced). */
  async undoPass(p: Principal, legId: string, checkpointId: string, kind: 'arrived' | 'departed') {
    return db.transaction(async (tx) => {
      const { sh, leg } = await this.shipmentForLeg(tx, p, legId);
      const office = isGlobal(p) || has(p, ...OPS);
      if (!office && leg.driverId !== p.driverId) forbidden('Not your trip');
      const { bundle } = await this.ref.get();
      const before = leg.passes.find((x) => x.checkpointId === checkpointId);
      const at = kind === 'arrived' ? before?.arrivedAt : before?.departedAt;
      // Drivers may undo their own check-in within 10 minutes; the office can correct any time.
      if (!office && kind === 'arrived' && before?.source && before.source !== 'driver') forbidden('Only check-ins you made yourself can be undone from the app');
      if (!office && at && Date.now() - Date.parse(at) > 10 * 60_000) fail('Too late to undo from the app — call the fleet office to correct it');
      undoPass(leg, checkpointId, kind, (id) => bundle.checkpoints.find((c) => c.id === id)?.kind ?? 'town');
      await this.derive(sh); await saveShipment(tx, sh);
      await tx.insert(t.auditLog).values({ userId: p.id, channel: p.channel, method: 'UNDO', path: `/legs/${legId}/passes`, status: 200, detail: { checkpointId, kind, was: at ?? null } });
      await this.notify.notify(tx, 'Check-in corrected', `${await this.ref.truckReg(leg.truckId)}: ${kind} at ${bundle.checkpoints.find((c) => c.id === checkpointId)?.name} undone by ${p.name}`, `#/shipments/${sh.id}`, ['fleet', 'operations']);
      return leg;
    });
  }

  async dispatch(p: Principal, legId: string, source: CheckpointPass['source'] = 'office') {
    const { leg } = await db.transaction((tx) => this.shipmentForLeg(tx, p, legId));
    if (!['Planned', 'Loaded'].includes(leg.status)) fail('This leg has already left', 409, 'state');
    return this.pass(p, legId, leg.passes[0].checkpointId, 'departed', source);
  }

  async issue(p: Principal | null, legId: string, issue: Omit<TruckIssue, 'id'>) {
    return db.transaction(async (tx) => {
      const { sh, leg } = await this.shipmentForLeg(tx, p, legId);
      this.assertOperator(p);
      if (p && has(p, 'driver') && !isGlobal(p) && !has(p, ...OPS) && leg.driverId !== p.driverId) forbidden('Not your trip');
      if (typeof issue?.reason !== 'string' || !issue.reason.trim()) fail('Say what the problem is');
      leg.issues.push({ id: uid('iss'), at: issue.at ?? iso(), checkpointId: issue.checkpointId, place: issue.place ?? '', reason: issue.reason, newDueDate: issue.newDueDate, fixedAt: issue.fixedAt });
      await this.derive(sh); await saveShipment(tx, sh);
      await this.notify.notify(tx, 'Truck issue reported', `${await this.ref.truckReg(leg.truckId)}: ${issue.reason} at ${issue.place}`, `#/shipments/${sh.id}`, ['fleet', 'operations', 'director']);
      return leg;
    });
  }
  async fixIssue(p: Principal | null, legId: string, issueId: string) {
    return db.transaction(async (tx) => {
      const { sh, leg } = await this.shipmentForLeg(tx, p, legId);
      this.assertOperator(p);
      if (p && has(p, 'driver') && !isGlobal(p) && !has(p, ...OPS) && leg.driverId !== p.driverId) forbidden('Not your trip');
      const i = leg.issues.find((x) => x.id === issueId) ?? notFound('Issue');
      i.fixedAt = iso();
      await this.derive(sh); await saveShipment(tx, sh);
      return leg;
    });
  }

  /** AK-01..05: receiver confirms; stock posts only at the final warehouse (an intermediate point is a transfer, Q-P1). */
  async acknowledge(p: Principal, legId: string, input: AckInput) {
    const res = await db.transaction(async (tx) => {
      const { sh, leg } = await this.shipmentForLeg(tx, p, legId);
      const cps = await this.warehouseCheckpoints(p);
      if (!isGlobal(p) && !has(p, 'operations', 'fleet', 'planner') && !(has(p, 'receiver') && cps.includes(leg.toId))) forbidden('This truck is not coming to your warehouse');
      if (leg.status === 'Acknowledged') fail('Already acknowledged', 409, 'state');
      if (typeof input?.receiverName !== 'string' || !input.receiverName.trim()) fail('Enter the name of the person signing');
      if (!Array.isArray(input.lines) || !input.lines.length) fail('Count at least one line');
      const onTruck = new Map(leg.lines.map((l) => [l.productId, l.loadedQty]));
      for (const l of input.lines) {
        if (!onTruck.has(l.productId)) fail(`${l.productId} is not on this truck`);
        if (![l.received, l.damaged].every((n) => Number.isInteger(n) && n >= 0) || l.damaged > l.received) fail('Received and damaged must be whole numbers ≥ 0, and damaged cannot exceed received');
        l.expected = onTruck.get(l.productId)!; // expected comes from the loading record, not the client
      }
      if (input.signature !== undefined && input.signature !== null && input.signature !== '' && !isUsableImage(input.signature)) fail('The signature image could not be read — sign again');
      const at = input.at ? Date.parse(input.at) : Date.now();
      const wh = await this.ref.warehouseByCheckpoint(leg.toId);
      const hasDiscrepancy = input.lines.some((l) => l.received !== l.expected || l.damaged > 0);
      const ack = { id: uid('ack'), legId, shipmentId: sh.id, warehouseId: wh?.id ?? sh.warehouseId, receiverName: input.receiverName.trim(), at: iso(at), lines: input.lines, signature: input.signature ?? null, photos: (input.photos ?? []).map((n) => ({ id: n.startsWith('file-') ? n : uid('doc'), kind: 'photo' as const, name: n })), hasDiscrepancy, byUserId: p.id };
      await tx.insert(t.acks).values(ack);
      leg.ackId = ack.id; leg.status = 'Acknowledged';
      const last = leg.passes.at(-1)!;
      if (!last.arrivedAt) { last.arrivedAt = iso(at); last.source = 'office'; }
      const isFinal = ack.warehouseId === sh.warehouseId;
      if (isFinal) for (const l of input.lines) {
        await tx.insert(t.stockMoves).values({ warehouseId: ack.warehouseId, productId: l.productId, kind: 'received', qty: l.received, at: ack.at, ref: sh.ref });
        if (l.damaged) await tx.insert(t.stockMoves).values({ warehouseId: ack.warehouseId, productId: l.productId, kind: 'damaged', qty: l.damaged, at: ack.at, ref: sh.ref });
      }
      await this.derive(sh); await saveShipment(tx, sh);
      if (hasDiscrepancy) await this.notify.notify(tx, 'Delivery discrepancy', `${sh.ref} leg ${leg.seq}: ${input.lines.map((l) => `${l.expected - l.received + l.damaged} cases short/damaged`).join(', ')}`, `#/shipments/${sh.id}`, ['director', 'operations', 'accounts'], { email: true });
      else await this.notify.notify(tx, 'Delivery acknowledged', `${sh.ref} leg ${leg.seq} received in full at ${wh?.name ?? ''}`, `#/shipments/${sh.id}`, ['operations', 'fleet']);
      return { ...ack, signature: ack.signature ?? undefined, isFinal };
    });
    return res;
  }

  /** DS-02: next leg from the point where the previous leg was acknowledged. */
  async addLeg(p: Principal, shipmentId: string, routeId: string, truckId: string, driverId: string) {
    if (!isGlobal(p) && !has(p, ...OPS, 'receiver', 'loader')) forbidden();
    return db.transaction(async (tx) => {
      const sh = await loadShipment(tx, shipmentId, true);
      if (!(await this.canSeeShipment(p, sh))) forbidden();
      const prev = sh.legs.at(-1)!;
      if (prev.status !== 'Acknowledged') fail('Acknowledge the current leg before planning the next one', 409, 'state');
      const stops = await this.ref.stopsOf(routeId);
      if (!stops.length) notFound('Route');
      if (stops[0].checkpointId !== prev.toId) fail('The next leg must start where the goods were received');
      const [ack] = prev.ackId ? await tx.select().from(t.acks).where(eq(t.acks.id, prev.ackId)) : [];
      const leg = this.newLeg(sh, routeId, stops, truckId, driverId, Date.now() + 2 * H, undefined, ack?.lines);
      await this.derive(sh); await saveShipment(tx, sh);
      await this.notify.notify(tx, 'Transfer leg planned', `${sh.ref}: ${await this.ref.truckReg(truckId)} from ${(await this.ref.checkpoint(leg.fromId))?.name}`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'loader', 'receiver']);
      return leg;
    });
  }

  async splitAt(p: Principal, legId: string, checkpointId: string) {
    if (!isGlobal(p) && !has(p, ...OPS)) forbidden();
    return db.transaction(async (tx) => {
      const { sh, leg } = await this.shipmentForLeg(tx, p, legId);
      const k = leg.passes.findIndex((x) => x.checkpointId === checkpointId);
      if (k <= 0 || k >= leg.passes.length - 1) fail('Pick a point between origin and destination');
      if (leg.passes[k].arrivedAt) fail('The truck has already reached that point');
      leg.passes = leg.passes.slice(0, k + 1); leg.toId = checkpointId; leg.plannedArrival = leg.passes[k].plannedAt;
      await this.derive(sh); await saveShipment(tx, sh);
      await this.notify.notify(tx, 'Transfer point set', `${sh.ref}: unload at ${(await this.ref.checkpoint(checkpointId))?.name}, then reload for the next leg`, `#/shipments/${sh.id}`, ['operations', 'fleet', 'receiver']);
      return leg;
    });
  }

  async acks(p: Principal, shipmentId: string) {
    await this.get(p, shipmentId);
    return (await db.select().from(t.acks).where(eq(t.acks.shipmentId, shipmentId))).map(map.ack);
  }
  async ack(p: Principal, id: string) {
    const [a] = await db.select().from(t.acks).where(eq(t.acks.id, id));
    if (!a) return notFound('Acknowledgement');
    await this.get(p, a.shipmentId);
    return map.ack(a);
  }

  /** Data for the 'acknowledgement' PDF template (AK-03). */
  async ackPdfData(p: Principal, id: string): Promise<AckPdfData> {
    const a = await this.ack(p, id);
    const sh = await loadShipment(db, a.shipmentId);
    const leg = sh.legs.find((l) => l.id === a.legId)!;
    const { bundle } = await this.ref.get();
    const product = (pid: string) => bundle.products.find((x) => x.id === pid);
    const wh = bundle.warehouses.find((w) => w.id === a.warehouseId);
    return {
      shipmentRef: sh.ref, legSeq: leg.seq, legCount: sh.legs.length, truckReg: bundle.trucks.find((x) => x.id === leg.truckId)?.reg ?? '', driverName: bundle.drivers.find((d) => d.id === leg.driverId)?.name,
      from: bundle.checkpoints.find((c) => c.id === leg.fromId)?.name ?? '', to: bundle.checkpoints.find((c) => c.id === leg.toId)?.name ?? '',
      warehouse: wh?.name ?? '', receivingCompany: bundle.receivingCompanies.find((r) => r.id === sh.receivingCompanyId)?.name ?? '',
      receivedAt: a.at, receiverName: a.receiverName, finalDestination: a.warehouseId === sh.warehouseId,
      lines: a.lines.map((l) => ({ brand: product(l.productId)?.brand ?? l.productId, pack: product(l.productId)?.pack ?? '', expected: l.expected, received: l.received, damaged: l.damaged, remarks: l.remarks })),
      signature: a.signature?.startsWith('data:') || /^[a-f0-9]{40}\./.test(a.signature ?? '') ? a.signature : undefined,
      photos: a.photos.map((x) => x.id).filter((x) => /^[a-f0-9]{40}\./.test(x)),
    };
  }

  // ---- Positions → geofence (TR-01, TR-05, TR-06) -----------------------------------
  async positions(p: Principal, items: { legId?: string; truckId?: string; lat: number; lng: number; at?: string; accuracyM?: number; speedKmh?: number; source?: string }[]) {
    if (!Array.isArray(items)) fail('Send a list of positions', 400, 'bad-request');
    this.assertOperator(p);
    if (items.length > 500) fail('At most 500 positions per request', 400, 'bad-request');
    for (const it of items) if (!it || !Number.isFinite(it.lat) || !Number.isFinite(it.lng) || Math.abs(it.lat) > 90 || Math.abs(it.lng) > 180) fail('Each position needs a valid lat (−90…90) and lng (−180…180)', 400, 'bad-request');
    const events: { legId: string; checkpointId: string; kind: 'arrived' | 'departed' }[] = [];
    for (const it of items) {
      const legId = it.legId ?? (await this.activeLegForTruck(it.truckId ?? ''))?.id;
      if (!legId) continue;
      const at = it.at ? Date.parse(it.at) : Date.now();
      const point = sql`ST_SetSRID(ST_MakePoint(${it.lng}, ${it.lat}), 4326)::geography`;
      const evs = await db.transaction(async (tx) => {
        const { sh, leg } = await this.shipmentForLeg(tx, p, legId);
        if (has(p, 'driver') && !has(p, ...OPS) && !isGlobal(p) && leg.driverId !== p.driverId) forbidden('Not your trip');
        await tx.insert(t.positions).values({ legId, truckId: leg.truckId, lat: it.lat, lng: it.lng, geog: point as unknown as string, at: iso(at), source: it.source ?? 'app', accuracyM: it.accuracyM ?? null, speedKmh: it.speedKmh ?? null });
        if (!leg.lastPing || Date.parse(leg.lastPing.at) <= at) leg.lastPing = { lat: it.lat, lng: it.lng, at: iso(at) };
        const out: typeof events = [];
        if (ACTIVE(leg) && leg.status !== 'Planned' && leg.status !== 'Loaded') {
          const lastIdx = leg.passes.reduce((a, x, i) => (x.arrivedAt ? i : a), -1);
          const here = lastIdx >= 0 && !leg.passes[lastIdx].departedAt && lastIdx < leg.passes.length - 1 ? leg.passes[lastIdx] : null;
          const candidates = leg.passes.slice(lastIdx + 1, lastIdx + 4).map((x) => x.checkpointId);
          const ids = [...candidates, ...(here ? [here.checkpointId] : [])];
          const inside = ids.length ? (await tx.execute<{ id: string }>(sql`SELECT id FROM checkpoints WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND ST_DWithin(geog, ${point}, radius_m)`)).map((r) => r.id) : [];
          if (here && !inside.includes(here.checkpointId)) {
            const [far] = await tx.execute<{ far: boolean }>(sql`SELECT NOT ST_DWithin(geog, ${point}, radius_m * 1.5) AS far FROM checkpoints WHERE id = ${here.checkpointId}`);
            if (far?.far) { applyPass(leg, here.checkpointId, 'departed', 'geofence', (await this.ref.checkpoint(here.checkpointId))!.kind, at); out.push({ legId, checkpointId: here.checkpointId, kind: 'departed' }); }
          }
          const enter = candidates.find((c) => inside.includes(c));
          if (enter) { applyPass(leg, enter, 'arrived', 'geofence', (await this.ref.checkpoint(enter))!.kind, at); out.push({ legId, checkpointId: enter, kind: 'arrived' }); }
        }
        await this.derive(sh); await saveShipment(tx, sh);
        for (const e of out) if (e.kind === 'arrived' && e.checkpointId === leg.toId) await this.notify.notify(tx, 'Truck arrived', `${await this.ref.truckReg(leg.truckId)} at ${(await this.ref.checkpoint(e.checkpointId))?.name} — awaiting acknowledgement`, `#/shipments/${sh.id}`, ['receiver', 'operations', 'director']);
        return out;
      });
      events.push(...evs);
    }
    return { accepted: items?.length ?? 0, events };
  }

  private async activeLegForTruck(truckId: string) {
    const rows = (await db.select().from(t.legs).where(eq(t.legs.truckId, truckId))).map(map.leg).filter(ACTIVE);
    return rows.sort((a, b) => b.seq - a.seq)[0];
  }

  // ---- SMS / USSD (InboundHandler port) ---------------------------------------------------
  private async legForSms(truckReg: string, phone: string) {
    const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();
    const { bundle } = await this.ref.get();
    const truck = truckReg ? bundle.trucks.find((x) => norm(x.reg) === norm(truckReg)) : undefined;
    const driver = bundle.drivers.find((d) => d.phone.replace(/\s/g, '') === phone.replace(/\s/g, ''));
    let leg: Leg | undefined;
    if (truck) leg = await this.activeLegForTruck(truck.id);
    else if (driver) leg = (await db.select().from(t.legs).where(eq(t.legs.driverId, driver.id))).map(map.leg).filter(ACTIVE).sort((a, b) => b.seq - a.seq)[0];
    return { leg, truck: truck ?? (leg ? bundle.trucks.find((x) => x.id === leg!.truckId) : undefined), driver };
  }
  /** SMS/USSD sender must be the leg's driver, or a fleet/office user — a plate number alone proves nothing. */
  private async senderMayReport(phone: string, leg: Leg) {
    const norm = (x: string) => x.replace(/[^\d+]/g, '');
    const { bundle } = await this.ref.get();
    if (norm(bundle.drivers.find((d) => d.id === leg.driverId)?.phone ?? '') === norm(phone)) return true;
    const [u] = await db.select().from(t.users).where(eq(t.users.phone, norm(phone)));
    return !!u && u.active && (u.roles as Role[]).some((r) => ['director', 'admin', ...OPS].includes(r));
  }
  async handleCheckin(c: InboundCheckin) {
    const { leg, truck } = await this.legForSms(c.truckReg, c.from);
    if (!leg) return { ok: false, reply: `BTW: no active trip found for ${c.truckReg || c.from}. Call the fleet office.` };
    if (!(await this.senderMayReport(c.from, leg))) return { ok: false, reply: `BTW: this number is not registered as the driver of ${truck?.reg ?? c.truckReg}. Call the fleet office.` };
    const { bundle } = await this.ref.get();
    const onLeg = leg.passes.map((x) => bundle.checkpoints.find((k) => k.id === x.checkpointId)!);
    const lastIdx = leg.passes.reduce((a, x, k) => (x.arrivedAt ? k : a), -1);
    const hereCp = lastIdx >= 0 && !leg.passes[lastIdx].departedAt ? onLeg[lastIdx] : undefined;
    const nextCp = onLeg[lastIdx + 1];
    const reg = truck?.reg ?? '';
    if (c.kind === 'fixed') {
      const open = leg.issues.filter((i) => !i.fixedAt);
      for (const i of open) await this.fixIssue(null, leg.id, i.id);
      return { ok: true, reply: `BTW: ${reg} marked moving again (${open.length} issue(s) closed).` };
    }
    if (c.kind === 'offloading' || c.kind === 'problem') {
      const reasons: Record<string, string> = { breakdown: 'Breakdown', border: 'Border / documents', police: 'Police / weighbridge stop', other: 'Other problem' };
      const reason = c.kind === 'offloading' ? 'Waiting to offload' : reasons[(c.reason ?? '').toLowerCase()] ?? (c.reason?.trim() || 'Problem reported by SMS');
      const at = c.kind === 'offloading' ? onLeg.at(-1) : hereCp ?? onLeg[Math.max(0, lastIdx)];
      await this.issue(null, leg.id, { at: iso(), place: at?.name ?? '', checkpointId: at?.id, reason });
      return { ok: true, reply: `BTW: noted for ${reg} — ${reason}. The fleet office will follow up.` };
    }
    const code = c.checkpointCode.trim().toUpperCase();
    const cp = code ? onLeg.find((k) => k.code === code || k.aliases.includes(code)) : c.kind === 'arrived' ? nextCp : hereCp;
    if (!cp) return { ok: false, reply: code ? `BTW: ${code} is not on this trip. Checkpoints: ${onLeg.map((k) => k.code).join(', ')}` : `BTW: nothing to ${c.kind === 'arrived' ? 'arrive at' : 'leave'} right now. Send ARR <PLACE> ${reg.replace(/\s/g, '')}.` };
    try {
      await this.pass(null, leg.id, cp.id, c.kind, 'sms');
      return { ok: true, reply: `BTW: ${reg} ${c.kind === 'arrived' ? 'arrived at' : 'left'} ${cp.name}. Thank you.` };
    } catch (e) { return { ok: false, reply: `BTW: could not record — ${(e as Error).message}` }; }
  }
  async driverStatus(phone: string) {
    const { leg, truck } = await this.legForSms('', phone);
    if (!leg) return null;
    const { bundle } = await this.ref.get();
    const i = leg.passes.reduce((a, x, k) => (x.arrivedAt ? k : a), -1);
    // "Next" is always the checkpoint after the last arrival (USSD option 1 = arrive there; option 2 = leave the current one).
    const nx = leg.passes[i + 1];
    const cp = nx ? bundle.checkpoints.find((k) => k.id === nx.checkpointId) : null;
    return { truckReg: truck?.reg ?? '', legId: leg.id, nextCheckpoint: cp ? { code: cp.code, name: cp.name } : null };
  }

  // ---- Field app working sets (driver / giver / receiver) -----------------------------
  private async legView(sh: ShipmentRow, leg: Leg) {
    const { bundle } = await this.ref.get();
    const stops = bundle.routes.find((r) => r.id === leg.routeId)?.stops ?? [];
    return {
      shipment: publicShipment(sh), leg,
      route: bundle.routes.find((r) => r.id === leg.routeId),
      checkpoints: leg.passes.map((x) => bundle.checkpoints.find((c) => c.id === x.checkpointId)!),
      truck: bundle.trucks.find((x) => x.id === leg.truckId), driver: bundle.drivers.find((d) => d.id === leg.driverId),
      eta: etaOf(leg, stops), dwell: dwell(leg, stops), overdue: overdue(leg, stops, bundle.settings.noCheckinGraceHours),
    };
  }
  async driverWork(p: Principal) {
    if (!p.driverId) return { driver: null, trips: [] };
    const all = await loadShipments(db);
    const trips = [];
    for (const sh of all) { await this.derive(sh); for (const leg of sh.legs) if (leg.driverId === p.driverId && ACTIVE(leg)) trips.push(await this.legView(sh, leg)); }
    const { bundle } = await this.ref.get();
    return { driver: bundle.drivers.find((d) => d.id === p.driverId) ?? null, trips: trips.sort((a, b) => (a.leg.status === 'Planned' ? 1 : 0) - (b.leg.status === 'Planned' ? 1 : 0)) };
  }
  async giverWork(p: Principal) {
    const { bundle } = await this.ref.get();
    const lps = bundle.suppliers.filter((s) => p.loadingPointIds.includes(s.id) || isGlobal(p));
    const lpCps = lps.map((s) => s.checkpointId).concat(await this.warehouseCheckpoints(p));
    const waiting = await this.waiting(p);
    const pending = (await this.loadings(p)).filter((l) => l.status === 'Pending');
    const pos = new Map((await db.select().from(t.pos)).map((x) => [x.id, x]));
    const all = await loadShipments(db);
    const handover = [];
    for (const sh of all) { await this.derive(sh); for (const leg of sh.legs) if (['Planned', 'Loaded'].includes(leg.status) && lpCps.includes(leg.fromId)) handover.push(await this.legView(sh, leg)); }
    return {
      loadingPoints: lps, waiting: waiting.filter((w) => w.status === 'Waiting'),
      toLoad: pending.map((l) => ({ ...l, poRef: pos.get(l.poId)?.ref ?? '', poTitle: pos.get(l.poId)?.title ?? '' })),
      handover,
    };
  }
  async receiverWork(p: Principal) {
    const cps = await this.warehouseCheckpoints(p);
    const all = await loadShipments(db);
    const incoming = [];
    for (const sh of all) { await this.derive(sh); for (const leg of sh.legs) if (cps.includes(leg.toId) && ACTIVE(leg) && leg.status !== 'Planned') incoming.push(await this.legView(sh, leg)); }
    const rank = (s: string) => (s === 'Arrived' ? 0 : 1);
    return { warehouses: (await this.ref.get()).bundle.warehouses.filter((w) => p.warehouseIds.includes(w.id)), incoming: incoming.sort((a, b) => rank(a.leg.status) - rank(b.leg.status) || Date.parse(a.eta.eta) - Date.parse(b.eta.eta)) };
  }
}
