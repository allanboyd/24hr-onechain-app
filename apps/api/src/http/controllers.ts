import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Inject } from '@nestjs/common';
import { Me, Public, Roles } from '../auth/decorators';
import { isGlobal, type Principal } from '../auth/principal';
import { AuthService, type LoginInput } from '../auth/auth.service';
import { once } from '../common/idempotency';
import { fail, forbidden } from '../common/errors';
import { config } from '../config/config';
import { db, schema } from '../db/client';
import { fxRates, loadEntities } from '../domain/companies';
import { invalidateEntities } from '../auth/entity-scope';
import { seedDemo } from '../db/seed';
import { PDF, type PdfPort } from '../integrations/ports';
import { FinanceService } from '../domain/finance.service';
import { LogisticsService, type AckInput, type ConfirmLoadingInput } from '../domain/logistics.service';
import { PeriodPlansService } from '../domain/period-plans.service';
import { PlanningService } from '../domain/planning.service';
import { PlatformService } from '../domain/platform.service';
import { RefService } from '../domain/ref.service';
import { StockService } from '../domain/stock.service';
import { SyncService, type SyncItem } from '../domain/sync.service';
import { ReportsService } from '../domain/reports.service';
import * as RP from '@btw/api/reports';
import type { CheckpointPass, DriverInput, Leg, ProviderInput, TruckInput, WarehouseInput, PeriodPlan, PoInput, PoUpdateInput, RouteStop, Sale, TripCost, TruckIssue } from '@btw/api/types';
import { defaultPvThresholds, featuresFor } from '@btw/api/rules';
import { seesPrices } from '@btw/api/access';
import { eq } from 'drizzle-orm';

type Idem = string | undefined;
const sendPdf = (res: FastifyReply, name: string, pdf: Buffer) => res.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="${name}.pdf"`).send(pdf);

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private platform: PlatformService) {}
  @Public() @Post('login') @HttpCode(200) login(@Body() b: LoginInput) { return this.auth.login(b ?? {}); }
  /** Demo sign-in pickers (not in production). */
  @Public() @Get('demo-users') demoUsers() {
    if (process.env.NODE_ENV === 'production') fail('Not available', 404, 'not-found');
    return this.platform.demoUsers();
  }
  @Public() @Post('refresh') @HttpCode(200) refresh(@Body() b: { refreshToken: string }) { return this.auth.refresh(b?.refreshToken); }
  @Post('logout') @HttpCode(204) async logout(@Me() p: Principal) { await this.auth.logout(p); }
  /** MA-08: remote sign-out of a lost device (admin/director, or the user's own device). */
  @Post('devices/:id/revoke') @HttpCode(204) async revoke(@Me() p: Principal, @Param('id') id: string) {
    const own = (await this.platform.devices(p, p.id)).some((d) => d.id === id);
    if (!own && !p.roles.some((r) => r === 'admin' || r === 'director')) forbidden();
    await this.auth.revokeDevice(id);
  }
}

@Controller()
export class MeController {
  constructor(private platform: PlatformService) {}
  @Get('me') me(@Me() p: Principal) { const { channel: _c, ...u } = p; return { ...u, features: featuresFor(p.roles) }; }
  @Post('devices') @HttpCode(200) device(@Me() p: Principal, @Body() b: { pushToken?: string; platform?: string; appVersion?: string }) { return this.platform.registerDevice(p, b ?? {}); }
  @Get('notifications') notifications(@Me() p: Principal) { return this.platform.notifications(p); }
  @Post('notifications/read') @HttpCode(200) read(@Me() p: Principal, @Body() b: { ids?: string[] }) { return this.platform.markRead(p, b?.ids); }
}

/** Companies (tenants) and director-approved exchange rates. */
@Controller()
export class CompaniesController {
  /** Company records the user may work in (legal/contact/brand fields); `GET /ref` has all three for lookups. */
  @Get('entities') async list(@Me() p: Principal) { return (await loadEntities()).filter((e) => p.allowedEntityIds.includes(e.id)); }
  @Get('settings/fx') fx() { return fxRates(); }
  /** PV-05: planned-vs-actual flag thresholds (behind = share of expected-to-date, over = share of plan). */
  @Get('settings/pv-thresholds') async pv() { const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, 'pvThresholds')); return (r?.value as typeof defaultPvThresholds) ?? defaultPvThresholds; }
  @Put('settings/pv-thresholds') async setPv(@Me() p: Principal, @Body() b: { behind?: number; over?: number }) {
    if (!p.roles.includes('director')) forbidden('Only directors change the planned-vs-actual thresholds');
    const behind = Number(b?.behind), over = Number(b?.over);
    if (!(behind > 0 && behind <= 1) || !(over >= 1 && over <= 2)) fail('Behind must be above 0 and at most 1; over between 1 and 2', 400, 'bad-request');
    const value = { behind, over };
    await db.insert(schema.settings).values({ key: 'pvThresholds', value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
    return value;
  }
  /** Directors approve a month's rate: units of currency per 1 USD (avg → P&L, closing → stock/balances). */
  @Put('settings/fx') async setFx(@Me() p: Principal, @Body() b: { currency?: string; month?: string; avg?: number; closing?: number }) {
    if (!p.roles.includes('director')) forbidden('Only directors approve exchange rates');
    const currency = typeof b?.currency === 'string' ? b.currency.toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(currency) || currency === 'USD' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b?.month)) || !(Number(b?.avg) > 0) || !(Number(b?.closing) > 0)) fail('Give a month (YYYY-MM), a currency other than USD and rates above zero', 400, 'bad-request');
    const row = { currency, month: String(b.month), avg: Number(b.avg), closing: Number(b.closing), byUserId: p.id, at: new Date().toISOString() };
    await db.insert(schema.fxRates).values(row).onConflictDoUpdate({ target: [schema.fxRates.currency, schema.fxRates.month], set: { avg: row.avg, closing: row.closing, byUserId: p.id, at: row.at } });
    return { currency, month: row.month, avg: row.avg, closing: row.closing };
  }
}

@Controller()
export class RefController {
  constructor(private ref: RefService, private platform: PlatformService) {}
  /** Reference bundle for both apps; supports If-None-Match. */
  /** docs/12 A-04: loaders, receivers and drivers get the bundle without the price list (own ETag). */
  @Get('ref') async bundle(@Me() p: Principal, @Headers('if-none-match') inm: string | undefined, @Res() res: FastifyReply) {
    const { bundle, etag: e0 } = await this.ref.get();
    const money = seesPrices(p);
    const etag = money ? e0 : e0.replace(/"$/, '-np"');
    if (inm === etag) return res.status(304).send();
    return res.header('ETag', etag).header('Cache-Control', 'private, max-age=0, must-revalidate').send(money ? bundle : { ...bundle, priceList: [] });
  }
  @Get('masterdata/:kind') async kind(@Me() p: Principal, @Param('kind') kind: string) {
    const b0 = (await this.ref.get()).bundle;
    const b = (seesPrices(p) ? b0 : { ...b0, priceList: [] }) as unknown as Record<string, unknown>;
    const key = kind.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return b[key] ?? fail(`Unknown master data kind ${kind}`, 404, 'not-found');
  }
  // Transport onboarding (docs/10): truck planners, fleet, planners, directors, admins
  @Post('masterdata/trucks') addTruck(@Me() p: Principal, @Body() b: Partial<TruckInput>) { return this.platform.saveTruck(p, null, b ?? {}); }
  @Patch('masterdata/trucks/:id') editTruck(@Me() p: Principal, @Param('id') id: string, @Body() b: Partial<TruckInput>) { return this.platform.saveTruck(p, id, b ?? {}); }
  @Post('masterdata/drivers') addDriver(@Me() p: Principal, @Body() b: Partial<DriverInput> & { appLogin?: boolean }) { return this.platform.saveDriver(p, null, b ?? {}); }
  @Patch('masterdata/drivers/:id') editDriver(@Me() p: Principal, @Param('id') id: string, @Body() b: Partial<DriverInput> & { appLogin?: boolean }) { return this.platform.saveDriver(p, id, b ?? {}); }
  @Post('masterdata/providers') addProvider(@Me() p: Principal, @Body() b: Partial<ProviderInput>) { return this.platform.saveProvider(p, null, { kind: (b as { regular?: boolean })?.regular === false ? 'market' : 'company', ...(b ?? {}) }); }
  @Patch('masterdata/providers/:id') editProvider(@Me() p: Principal, @Param('id') id: string, @Body() b: Partial<ProviderInput>) { return this.platform.saveProvider(p, id, b ?? {}); }
  @Post('masterdata/routes') addRoute(@Me() p: Principal, @Body() b: Parameters<PlatformService['addRoute']>[1]) { return this.platform.addRoute(p, b); }
  @Post('masterdata/warehouses') addWarehouse(@Me() p: Principal, @Body() b: WarehouseInput) { return this.platform.saveWarehouse(p, null, b); }
  @Patch('masterdata/warehouses/:id') editWarehouse(@Me() p: Principal, @Param('id') id: string, @Body() b: Partial<WarehouseInput>) { return this.platform.saveWarehouse(p, id, b as WarehouseInput); }
  // Static data (docs/12 A-05): companies, suppliers, goods, receiving companies — Kabonge and the directors
  @Post('masterdata/entities') addEntity(@Me() p: Principal, @Body() b: unknown) { return this.platform.saveEntity(p, null, b); }
  @Patch('masterdata/entities/:id') editEntity(@Me() p: Principal, @Param('id') id: string, @Body() b: unknown) { return this.platform.saveEntity(p, id, b); }
  @Post('masterdata/suppliers') addSupplier(@Me() p: Principal, @Body() b: unknown) { return this.platform.saveSupplier(p, null, b); }
  @Patch('masterdata/suppliers/:id') editSupplier(@Me() p: Principal, @Param('id') id: string, @Body() b: unknown) { return this.platform.saveSupplier(p, id, b); }
  @Post('masterdata/products') addProduct(@Me() p: Principal, @Body() b: unknown) { return this.platform.saveProduct(p, null, b); }
  @Patch('masterdata/products/:id') editProduct(@Me() p: Principal, @Param('id') id: string, @Body() b: unknown) { return this.platform.saveProduct(p, id, b); }
  @Post('masterdata/receiving-companies') addRc(@Me() p: Principal, @Body() b: unknown) { return this.platform.saveReceivingCompany(p, null, b); }
  @Patch('masterdata/receiving-companies/:id') editRc(@Me() p: Principal, @Param('id') id: string, @Body() b: unknown) { return this.platform.saveReceivingCompany(p, id, b); }
  /** docs/12 A-07: the audit log — ?userId&feature&from&to&q&page&pageSize (directors). */
  @Get('audit') audit(@Me() p: Principal, @Query() q: Record<string, unknown>) { return this.platform.audit(p, q ?? {}); }
  @Patch('masterdata/routes/:id') route(@Me() p: Principal, @Param('id') id: string, @Body() b: { stops: RouteStop[] }) { return this.platform.updateRouteStops(p, id, b?.stops ?? []); }
}

@Controller('users')
@Roles('admin', 'director')
export class UsersController {
  constructor(private platform: PlatformService) {}
  @Get() list(@Me() p: Principal) { return this.platform.users(p); }
  @Post() create(@Me() p: Principal, @Body() b: Parameters<PlatformService['createUser']>[1]) { return this.platform.createUser(p, b); }
  @Patch(':id') update(@Me() p: Principal, @Param('id') id: string, @Body() b: Parameters<PlatformService['updateUser']>[2]) { return this.platform.updateUser(p, id, b ?? {}); }
  @Post(':id/secret') @HttpCode(200) secret(@Me() p: Principal, @Param('id') id: string, @Body() b: { pin?: string; password?: string }) { return this.platform.setSecret(p, id, b ?? {}); }
  @Get(':id/devices') devices(@Me() p: Principal, @Param('id') id: string) { return this.platform.devices(p, id); }
}

@Controller()
export class PlanningController {
  constructor(private planning: PlanningService) {}
  /** Orders behind the POs (read-only). POs are created, updated and deleted under /pos (docs/09 §4) — no drafts. */
  @Get('plans') list(@Me() p: Principal) { return this.planning.list(p); }
  @Get('plans/:id') get(@Me() p: Principal, @Param('id') id: string) { return this.planning.get(p, id); }
  @Get('plans/:id/plan-context') planContext(@Me() p: Principal, @Param('id') id: string) { return this.planning.planContext(p, id); }
  /** Effective POs (latest revision) with their stage; `?all=1` also lists deleted ones. */
  @Get('pos') pos(@Me() p: Principal, @Query('all') all?: string) { return this.planning.listPos(p, all === '1' || all === 'true'); }
  @Post('pos') createPo(@Me() p: Principal, @Body() b: PoInput) { return this.planning.createPo(p, b); }
  @Get('pos/:id') po(@Me() p: Principal, @Param('id') id: string) { return this.planning.getPo(p, id); }
  /** Update = the next revision (reason required); never an overwrite. */
  @Put('pos/:id') updatePo(@Me() p: Principal, @Param('id') id: string, @Body() b: PoUpdateInput) { return this.planning.updatePo(p, id, b); }
  /** Soft delete with a reason, only while nothing has been loaded. */
  @Post('pos/:id/delete') @HttpCode(200) deletePo(@Me() p: Principal, @Param('id') id: string, @Body() b: { reason?: string }) { return this.planning.deletePo(p, id, b?.reason ?? ''); }
  /** Approvals on: a director approves (signature) or rejects (comment → deleted) a PO awaiting approval. */
  @Post('pos/:id/decision') @HttpCode(200) decide(@Me() p: Principal, @Param('id') id: string, @Body() b: { action: 'approved' | 'rejected'; comment?: string; signature?: string }) { return this.planning.decidePo(p, id, b?.action, b?.comment, b?.signature); }
  @Post('pos/:id/sent') @HttpCode(200) sent(@Me() p: Principal, @Param('id') id: string) { return this.planning.markSent(p, id); }
  @Post('pos/:id/send') @HttpCode(200) send(@Me() p: Principal, @Param('id') id: string) { return this.planning.sendPo(p, id); }
  @Get('pos/:id/pdf') async pdf(@Me() p: Principal, @Param('id') id: string, @Res() res: FastifyReply) { const { po } = await this.planning.getPo(p, id); return sendPdf(res, po.ref, await this.planning.poPdf(p, id)); }
  @Get('pos/:id/letter') letter(@Me() p: Principal, @Param('id') id: string) { return this.planning.poLetterData(p, id); }
}

/** Period plans (§8.3 PL-06…12): what each company plans to buy over a month / quarter / half / year / custom period. */
// Period plans are suggestions: no submit / decision / amendments (removed) — a save is final, with edit history.
@Controller('period-plans')
export class PeriodPlansController {
  constructor(private plans: PeriodPlansService) {}
  /** Active plans; `?all=1` also lists Replaced ones (kept for history). */
  @Get() list(@Me() p: Principal, @Query('all') all?: string) { return this.plans.list(p, all === '1' || all === 'true'); }
  @Post() create(@Me() p: Principal, @Body() b: Parameters<PeriodPlansService['create']>[1]) { return this.plans.create(p, b ?? {}); }
  @Post('overlaps') @HttpCode(200) overlaps(@Me() p: Principal, @Body() b: Partial<PeriodPlan>) { return this.plans.overlaps(p, b ?? {}); }
  @Get(':id') get(@Me() p: Principal, @Param('id') id: string) { return this.plans.get(p, id); }
  @Put(':id') save(@Me() p: Principal, @Param('id') id: string, @Body() b: Partial<PeriodPlan>) { return this.plans.save(p, id, b ?? {}); }
  @Post(':id/copy') copy(@Me() p: Principal, @Param('id') id: string, @Body() b: { from?: string; to?: string; title?: string; replace?: boolean }) { return this.plans.copy(p, id, b ?? {}); }
  @Get(':id/versions') versions(@Me() p: Principal, @Param('id') id: string) { return this.plans.versions(p, id); }
}

@Controller()
export class LoadingController {
  constructor(private logistics: LogisticsService) {}
  @Get('waiting') waiting(@Me() p: Principal, @Query('loadingPointId') lp?: string) { return this.logistics.waiting(p, lp); }
  @Post('loading-points/:id/waiting') add(@Me() p: Principal, @Param('id') lp: string, @Body() b: { truckId: string; driverId: string; entityId?: string }, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'waiting.add', () => this.logistics.addWaiting(p, lp, b?.truckId, b?.driverId, typeof b?.entityId === 'string' ? b.entityId : undefined)).then((r) => r.result); }
  @Post('loading-points/:id/market-trucks') market(@Me() p: Principal, @Param('id') lp: string, @Body() b: Parameters<LogisticsService['addMarketTruck']>[2]) { return this.logistics.addMarketTruck(p, lp, b); }
  /** `{ dir: -1 | 1 }` one place up/down, or `{ position }` (1 = next to load). */
  @Post('waiting/:id/move') @HttpCode(200) move(@Me() p: Principal, @Param('id') id: string, @Body() b: { dir?: -1 | 1; position?: number }) { return this.logistics.moveWaiting(p, id, b?.dir === -1 ? -1 : 1, b?.position === undefined ? undefined : Number(b.position)); }
  /** Optional reason (body `{ reason }` or `?reason=`) — shown to the loader, kept in the audit log. */
  @Delete('waiting/:id') remove(@Me() p: Principal, @Param('id') id: string, @Body() b: { reason?: string } | undefined, @Query('reason') qr?: string) { return this.logistics.removeWaiting(p, id, (b as { reason?: unknown } | undefined)?.reason ?? qr); }
  @Get('loadings') loadings(@Me() p: Principal, @Query('loadingPointId') lp?: string) { return this.logistics.loadings(p, lp); }
  @Post('loadings/:id/confirm') confirm(@Me() p: Principal, @Param('id') id: string, @Body() b: ConfirmLoadingInput, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'loading.confirm', () => this.logistics.confirmLoading(p, id, b)).then((r) => r.result); }
}

@Controller()
export class ShipmentsController {
  constructor(private logistics: LogisticsService, private finance: FinanceService, @Inject(PDF) private pdf: PdfPort) {}
  /** docs/12 A-04: the agreed transport price, recorded after loading (truck follow-up officer, directors). */
  @Post('shipments/:id/agreed-price') @HttpCode(200) agreed(@Me() p: Principal, @Param('id') id: string, @Body() b: { amount?: number; currency?: string; docRef?: string }) { return this.finance.setAgreedPrice(p, id, b ?? {}); }
  @Get('shipments') list(@Me() p: Principal) { return this.logistics.list(p); }
  @Get('shipments/:id') get(@Me() p: Principal, @Param('id') id: string) { return this.logistics.get(p, id); }
  @Get('shipments/:id/acks') acks(@Me() p: Principal, @Param('id') id: string) { return this.logistics.acks(p, id); }
  @Get('shipments/:id/journey') journey(@Me() p: Principal, @Param('id') id: string) { return this.logistics.journey(p, id); }
  @Post('shipments/:id/send-on') sendOn(@Me() p: Principal, @Param('id') id: string, @Body() b: { routeId: string; truckId: string; driverId: string; lines?: Leg['lines'] }, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'shipment.sendOn', () => this.logistics.sendOn(p, id, b)).then((r) => r.result); }
  @Post('shipments/:id/legs') addLeg(@Me() p: Principal, @Param('id') id: string, @Body() b: { routeId: string; truckId: string; driverId: string }) { return this.logistics.addLeg(p, id, b?.routeId, b?.truckId, b?.driverId); }
  @Post('legs/:id/passes') @HttpCode(200) pass(@Me() p: Principal, @Param('id') id: string, @Body() b: { checkpointId: string; kind: 'arrived' | 'departed'; source?: CheckpointPass['source']; at?: string }, @Headers('idempotency-key') k: Idem) {
    return once(k, p.id, 'leg.pass', () => this.logistics.pass(p, id, b?.checkpointId, b?.kind, b?.source ?? (p.channel === 'app' ? 'driver' : 'office'), b?.at ? Date.parse(b.at) : Date.now())).then((r) => r.result);
  }
  /** Audited correction of the latest check-in: the driver who made it within 10 min, or the office any time. */
  @Post('legs/:id/passes/:checkpointId/undo') @HttpCode(200) undo(@Me() p: Principal, @Param('id') id: string, @Param('checkpointId') cp: string, @Body() b: { kind: 'arrived' | 'departed' }, @Headers('idempotency-key') k: Idem) {
    return once(k, p.id, 'leg.pass.undo', () => this.logistics.undoPass(p, id, cp, b?.kind === 'departed' ? 'departed' : 'arrived')).then((r) => r.result);
  }
  @Post('legs/:id/dispatch') @HttpCode(200) dispatch(@Me() p: Principal, @Param('id') id: string, @Body() b: { source?: CheckpointPass['source'] }) { return this.logistics.dispatch(p, id, b?.source ?? 'office'); }
  @Post('legs/:id/issues') issue(@Me() p: Principal, @Param('id') id: string, @Body() b: Omit<TruckIssue, 'id'>, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'leg.issue', () => this.logistics.issue(p, id, b)).then((r) => r.result); }
  @Post('legs/:id/issues/:issueId/fix') @HttpCode(200) fix(@Me() p: Principal, @Param('id') id: string, @Param('issueId') issueId: string) { return this.logistics.fixIssue(p, id, issueId); }
  @Post('legs/:id/split') @HttpCode(200) split(@Me() p: Principal, @Param('id') id: string, @Body() b: { checkpointId: string }) { return this.logistics.splitAt(p, id, b?.checkpointId); }
  @Post('legs/:id/acknowledgement') ack(@Me() p: Principal, @Param('id') id: string, @Body() b: AckInput, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'leg.acknowledge', () => this.logistics.acknowledge(p, id, b)).then((r) => r.result); }
  @Get('acks/:id') getAck(@Me() p: Principal, @Param('id') id: string) { return this.logistics.ack(p, id); }
  @Get('acks/:id/pdf') async ackPdf(@Me() p: Principal, @Param('id') id: string, @Res() res: FastifyReply) { const d = await this.logistics.ackPdfData(p, id); return sendPdf(res, `${d.shipmentRef}-leg${d.legSeq}-ack`, await this.pdf.render('acknowledgement', d)); }
  @Post('positions') @HttpCode(202) positions(@Me() p: Principal, @Body() b: Parameters<LogisticsService['positions']>[1], @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'positions', () => this.logistics.positions(p, b)).then((r) => r.result); }
  // Field app working sets (offline cache per role)
  @Get('field/driver') driver(@Me() p: Principal) { return this.logistics.driverWork(p); }
  @Get('field/giver') giver(@Me() p: Principal) { return this.logistics.giverWork(p); }
  @Get('field/receiver') receiver(@Me() p: Principal) { return this.logistics.receiverWork(p); }
}

@Controller()
export class StockController {
  constructor(private stock: StockService) {}
  @Get('stock') rows(@Me() p: Principal) { return this.stock.stock(p); }
  @Get('stock/ledger') ledger(@Me() p: Principal, @Query('warehouseId') w: string, @Query('productId') pr: string) { return this.stock.ledger(p, w, pr); }
  @Get('sales') sales(@Me() p: Principal, @Query('warehouseId') w?: string) { return this.stock.sales(p, w); }
  @Post('sales') create(@Me() p: Principal, @Body() b: Omit<Sale, 'id' | 'ref' | 'status' | 'entityId'> & { entityId?: string; override?: boolean }, @Headers('idempotency-key') k: Idem) { const { override, ...input } = b ?? ({} as never); return once(k, p.id, 'sale.create', () => this.stock.createSale(p, input, !!override)).then((r) => r.result); }
  @Get('analytics/summary') summary(@Me() p: Principal) { return this.stock.summary(p); }
  @Get('analytics/velocity') velocity(@Me() p: Principal) { return this.stock.velocity(p); }
  @Get('analytics/flags') flags(@Me() p: Principal) { return this.stock.flags(p); }
  @Put('analytics/thresholds') thresholds(@Me() p: Principal, @Body() b: Parameters<StockService['setThresholds']>[1]) { return this.stock.setThresholds(p, b ?? {}); }
}

@Controller('finance')
export class FinanceController {
  constructor(private finance: FinanceService) {}
  @Get('trips') trips(@Me() p: Principal) { return this.finance.trips(p); }
  @Post('costs') cost(@Me() p: Principal, @Body() b: Omit<TripCost, 'id'>) { return this.finance.addCost(p, b); }
  @Post('payments') pay(@Me() p: Principal, @Body() b: Parameters<FinanceService['pay']>[1]) { return this.finance.pay(p, b); }
  @Post('payments/:id/approve') @HttpCode(200) approve(@Me() p: Principal, @Param('id') id: string) { return this.finance.approve(p, id); }
}

@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}
  @Post('batch') @HttpCode(200) batch(@Me() p: Principal, @Body() b: SyncItem[] | { items: SyncItem[] }) {
    const items = Array.isArray(b) ? b : (b as { items?: unknown })?.items;
    if (!Array.isArray(items)) fail('Send a list of outbox items', 400, 'bad-request');
    if ((items as SyncItem[]).length > 200) fail('At most 200 items per batch', 400, 'bad-request');
    return this.sync.batch(p, items as SyncItem[]);
  }
}

@Controller('dev')
export class DevResetController {
  constructor(private ref: RefService) {}
  /** Re-seed the demo dataset: directors/admins only, never in production (the dev server listens on the LAN). */
  @Post('reset') @HttpCode(200) async reset(@Me() p: Principal, @Req() req: FastifyRequest) {
    if (process.env.NODE_ENV === 'production') fail('Not available', 404, 'not-found');
    if (!isGlobal(p)) forbidden('Only a director or administrator can reset the demo data');
    void req; void config;
    const r = await seedDemo(db); this.ref.invalidate(); invalidateEntities(); return r;
  }
}

/** Reports & planning: every endpoint returns a pure function of the caller's data scope (see @btw/api/reports). */
type RQ = { from?: string; to?: string; warehouseId?: string; productId?: string; entityId?: string };
const filter = (q: RQ, report?: string): RP.ReportFilter & { report?: string } => {
  const ok = (x?: string) => (x && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString() : undefined);
  return { from: ok(q?.from), to: ok(q?.to), warehouseId: q?.warehouseId || undefined, productId: q?.productId || undefined, entityId: q?.entityId || undefined, report };
};
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}
  @Get('dashboard') async dashboard(@Me() p: Principal, @Query() q: RQ) { const f = filter(q, 'dashboard'); return RP.dashboardReport(await this.reports.data(p, f), { entityId: f.entityId }); }
  @Get('sales') async sales(@Me() p: Principal, @Query() q: RQ & { groupBy?: string }) {
    const g = ['day', 'week', 'month', 'quarter'].includes(q?.groupBy ?? '') ? (q.groupBy as RP.GroupBy) : undefined;
    return RP.salesReport(await this.reports.data(p, filter(q, 'sales')), { ...filter(q), groupBy: g });
  }
  @Get('quarterly') async quarterly(@Me() p: Principal, @Query() q: RQ & { quarter?: string }) {
    if (q?.quarter && !/^\d{4}-Q[1-4]$/.test(q.quarter)) fail('Quarter must look like 2026-Q3', 400, 'bad-request');
    return RP.quarterlyReport(await this.reports.data(p, filter(q, 'quarterly')), q?.quarter, filter(q));
  }
  @Get('logistics') async logistics(@Me() p: Principal, @Query() q: RQ) { return RP.logisticsReport(await this.reports.data(p, filter(q, 'logistics')), filter(q)); }
  @Get('inventory') async inventory(@Me() p: Principal, @Query() q: RQ) { return RP.inventoryReport(await this.reports.data(p, filter(q, 'inventory')), filter(q)); }
  @Get('planning') async planning(@Me() p: Principal, @Query() q: RQ & { horizonDays?: string }) {
    const h = Number(q?.horizonDays); return RP.planningReport(await this.reports.data(p, filter(q, 'planning')), { ...filter(q), horizonDays: Number.isFinite(h) && h > 0 ? Math.min(h, 365) : undefined });
  }
  @Get('finance') async finance(@Me() p: Principal, @Query() q: RQ) { return RP.financeReport(await this.reports.data(p, filter(q, 'finance')), filter(q)); }
  @Get('period-plan') async periodPlan(@Me() p: Principal, @Query() q: RQ) { return RP.periodPlan(await this.reports.data(p, filter(q, 'period-plan')), filter(q)); }
  /** Directors: the three companies side by side + consolidated total (Σ companies − intercompany), all in USD. */
  @Get('group') async group(@Me() p: Principal, @Query() q: RQ) { return RP.groupReport(await this.reports.data(p, { group: true }), filter(q)); }
  /** PV-01…07: planned vs actual ordered per plan line, flags, monthly running totals, plan used per brand. */
  @Get('planned-vs-actual') async plannedVsActual(@Me() p: Principal, @Query() q: RQ & { supplierId?: string }) {
    return RP.plannedVsActual(await this.reports.data(p, filter(q, 'planned-vs-actual')), { ...filter(q), supplierId: q?.supplierId || undefined });
  }
  @Get('capture-check') async captureCheck(@Me() p: Principal, @Query() q: RQ) { return RP.captureCheck(await this.reports.data(p, filter(q, 'capture-check')), filter(q)); }
}
