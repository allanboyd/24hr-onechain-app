import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Inject } from '@nestjs/common';
import { Me, Public, Roles } from '../auth/decorators';
import { isGlobal, type Principal } from '../auth/principal';
import { AuthService, type LoginInput } from '../auth/auth.service';
import { once } from '../common/idempotency';
import { fail, forbidden } from '../common/errors';
import { config } from '../config/config';
import { db } from '../db/client';
import { seedDemo } from '../db/seed';
import { PDF, type PdfPort } from '../integrations/ports';
import { FinanceService } from '../domain/finance.service';
import { LogisticsService, type AckInput, type ConfirmLoadingInput } from '../domain/logistics.service';
import { PlanningService } from '../domain/planning.service';
import { PlatformService } from '../domain/platform.service';
import { RefService } from '../domain/ref.service';
import { StockService } from '../domain/stock.service';
import { SyncService, type SyncItem } from '../domain/sync.service';
import type { CheckpointPass, Plan, RouteStop, Sale, TripCost, TruckIssue } from '@btw/api/types';

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
  @Get('me') me(@Me() p: Principal) { const { channel: _c, ...u } = p; return u; }
  @Post('devices') @HttpCode(200) device(@Me() p: Principal, @Body() b: { pushToken?: string; platform?: string; appVersion?: string }) { return this.platform.registerDevice(p, b ?? {}); }
  @Get('notifications') notifications(@Me() p: Principal) { return this.platform.notifications(p); }
  @Post('notifications/read') @HttpCode(200) read(@Me() p: Principal, @Body() b: { ids?: string[] }) { return this.platform.markRead(p, b?.ids); }
}

@Controller()
export class RefController {
  constructor(private ref: RefService, private platform: PlatformService) {}
  /** Reference bundle for both apps; supports If-None-Match. */
  @Get('ref') async bundle(@Headers('if-none-match') inm: string | undefined, @Res() res: FastifyReply) {
    const { bundle, etag } = await this.ref.get();
    if (inm === etag) return res.status(304).send();
    return res.header('ETag', etag).header('Cache-Control', 'private, max-age=0, must-revalidate').send(bundle);
  }
  @Get('masterdata/:kind') async kind(@Param('kind') kind: string) {
    const b = (await this.ref.get()).bundle as unknown as Record<string, unknown>;
    const key = kind.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return b[key] ?? fail(`Unknown master data kind ${kind}`, 404, 'not-found');
  }
  @Post('masterdata/trucks') addTruck(@Me() p: Principal, @Body() b: Parameters<PlatformService['addTruck']>[1]) { return this.platform.addTruck(p, b); }
  @Post('masterdata/drivers') addDriver(@Me() p: Principal, @Body() b: Parameters<PlatformService['addDriver']>[1]) { return this.platform.addDriver(p, b); }
  @Post('masterdata/providers') addProvider(@Me() p: Principal, @Body() b: Parameters<PlatformService['addProvider']>[1]) { return this.platform.addProvider(p, b); }
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
  @Get('plans') list(@Me() p: Principal) { return this.planning.list(p); }
  @Post('plans') create(@Me() p: Principal, @Body() b: { entityId: string; supplierId: string }) { return this.planning.create(p, b?.entityId, b?.supplierId); }
  @Get('plans/:id') get(@Me() p: Principal, @Param('id') id: string) { return this.planning.get(p, id); }
  @Put('plans/:id') save(@Me() p: Principal, @Param('id') id: string, @Body() b: Partial<Plan>) { return this.planning.save(p, id, b ?? {}); }
  @Post('plans/:id/submit') @HttpCode(200) submit(@Me() p: Principal, @Param('id') id: string) { return this.planning.submit(p, id); }
  @Post('plans/:id/decision') @HttpCode(200) decide(@Me() p: Principal, @Param('id') id: string, @Body() b: { action: 'approved' | 'returned' | 'rejected'; comment?: string; signature?: string }) { return this.planning.decide(p, id, b?.action, b?.comment, b?.signature); }
  @Post('plans/:id/amendments') amend(@Me() p: Principal, @Param('id') id: string, @Body() b: { reason: string }) { return this.planning.amend(p, id, b?.reason); }
  @Get('plans/:id/versions') versions(@Me() p: Principal, @Param('id') id: string) { return this.planning.versions(p, id); }
  @Get('pos') pos(@Me() p: Principal) { return this.planning.listPos(p); }
  @Get('pos/:id') po(@Me() p: Principal, @Param('id') id: string) { return this.planning.getPo(p, id); }
  @Post('pos/:id/sent') @HttpCode(200) sent(@Me() p: Principal, @Param('id') id: string) { return this.planning.markSent(p, id); }
  @Post('pos/:id/send') @HttpCode(200) send(@Me() p: Principal, @Param('id') id: string) { return this.planning.sendPo(p, id); }
  @Get('pos/:id/pdf') async pdf(@Me() p: Principal, @Param('id') id: string, @Res() res: FastifyReply) { const { po } = await this.planning.getPo(p, id); return sendPdf(res, po.ref, await this.planning.poPdf(p, id)); }
  @Get('pos/:id/letter') letter(@Me() p: Principal, @Param('id') id: string) { return this.planning.poLetterData(p, id); }
}

@Controller()
export class LoadingController {
  constructor(private logistics: LogisticsService) {}
  @Get('waiting') waiting(@Me() p: Principal, @Query('loadingPointId') lp?: string) { return this.logistics.waiting(p, lp); }
  @Post('loading-points/:id/waiting') add(@Me() p: Principal, @Param('id') lp: string, @Body() b: { truckId: string; driverId: string }, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'waiting.add', () => this.logistics.addWaiting(p, lp, b?.truckId, b?.driverId)).then((r) => r.result); }
  @Post('loading-points/:id/market-trucks') market(@Me() p: Principal, @Param('id') lp: string, @Body() b: Parameters<LogisticsService['addMarketTruck']>[2]) { return this.logistics.addMarketTruck(p, lp, b); }
  @Post('waiting/:id/move') @HttpCode(200) move(@Me() p: Principal, @Param('id') id: string, @Body() b: { dir: -1 | 1 }) { return this.logistics.moveWaiting(p, id, b?.dir === -1 ? -1 : 1); }
  @Delete('waiting/:id') remove(@Me() p: Principal, @Param('id') id: string) { return this.logistics.removeWaiting(p, id); }
  @Get('loadings') loadings(@Me() p: Principal, @Query('loadingPointId') lp?: string) { return this.logistics.loadings(p, lp); }
  @Post('loadings/:id/confirm') confirm(@Me() p: Principal, @Param('id') id: string, @Body() b: ConfirmLoadingInput, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'loading.confirm', () => this.logistics.confirmLoading(p, id, b)).then((r) => r.result); }
}

@Controller()
export class ShipmentsController {
  constructor(private logistics: LogisticsService, @Inject(PDF) private pdf: PdfPort) {}
  @Get('shipments') list(@Me() p: Principal) { return this.logistics.list(p); }
  @Get('shipments/:id') get(@Me() p: Principal, @Param('id') id: string) { return this.logistics.get(p, id); }
  @Get('shipments/:id/acks') acks(@Me() p: Principal, @Param('id') id: string) { return this.logistics.acks(p, id); }
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
  @Post('sales') create(@Me() p: Principal, @Body() b: Omit<Sale, 'id' | 'ref' | 'status'> & { override?: boolean }, @Headers('idempotency-key') k: Idem) { const { override, ...input } = b ?? ({} as never); return once(k, p.id, 'sale.create', () => this.stock.createSale(p, input, !!override)).then((r) => r.result); }
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
    const r = await seedDemo(db); this.ref.invalidate(); return r;
  }
}
