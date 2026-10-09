import { Body, CanActivate, Controller, ForbiddenException, Get, Header, HttpCode, Inject, Injectable, NotFoundException, Param, PayloadTooLargeException, BadRequestException, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { config } from '../config/config';
import { devStore } from './dev-store';
import { FileRejected, UrlSigner } from './files/files';
import { InboundService } from './inbound/inbound.service';
import { parseDriverSms } from './inbound/parser';
import { FILES, PDF, ROUTING, type FilesPort, type PdfPort, type RoutingPort } from './ports';
import { Public } from './public';
import { INTEGRATION_STATUS, type IntegrationStatus } from './status';

@Injectable()
class WebhookSecretGuard implements CanActivate {
  canActivate(ctx: import('@nestjs/common').ExecutionContext) {
    // In production a webhook without a shared secret would let anyone on the internet post driver check-ins.
    if (!config.WEBHOOK_SECRET) { if (config.NODE_ENV === 'production') throw new ForbiddenException('Webhook secret not configured'); return true; }
    const q = ctx.switchToHttp().getRequest<{ query: Record<string, string> }>().query;
    if (q?.key !== config.WEBHOOK_SECRET) throw new ForbiddenException();
    return true;
  }
}
@Injectable()
class DevOnlyGuard implements CanActivate {
  canActivate() { if (config.NODE_ENV === 'production') throw new NotFoundException(); return true; }
}

/** Africa's Talking callbacks. Configure in the AT dashboard: SMS callback → /v1/webhooks/sms, USSD callback → /v1/webhooks/ussd (append ?key=WEBHOOK_SECRET when set). */
@Public()
@UseGuards(WebhookSecretGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly inbound: InboundService) {}
  @Post('sms') @HttpCode(200)
  async sms(@Body() b: { from?: string; text?: string }) {
    if (!b?.from || typeof b.text !== 'string') throw new BadRequestException('from and text are required');
    const r = await this.inbound.sms_(b.from, b.text);
    return { ok: r.ok };
  }
  @Post('ussd') @HttpCode(200) @Header('Content-Type', 'text/plain')
  async ussd(@Body() b: { sessionId?: string; phoneNumber?: string; text?: string }) {
    if (!b?.phoneNumber) return 'END Invalid request';
    return this.inbound.ussd(b.phoneNumber, b.text ?? '');
  }
}

@Controller('files')
export class FilesController {
  constructor(@Inject(FILES) private readonly files: FilesPort, private readonly signer: UrlSigner) {}
  /** Upload (session required — api-core's auth guard applies). Body: { kind: 'photo'|'signature'|'document'|'pdf', name?, contentType, dataBase64 }. */
  @Post()
  async upload(@Body() b: { kind?: string; name?: string; contentType?: string; dataBase64?: string }) {
    if (!b?.kind || !b.contentType || !b.dataBase64) throw new BadRequestException('kind, contentType and dataBase64 are required');
    const body = Buffer.from(b.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    try { return await this.files.put(`${b.kind}/${b.name ?? 'upload'}`, body, b.contentType); }
    catch (e) {
      if (e instanceof FileRejected) throw /larger/.test(e.message) ? new PayloadTooLargeException(e.message) : new BadRequestException(e.message);
      throw e;
    }
  }
  /** Download by signed link (exp + sig), as returned from upload / signedUrl(). */
  @Public() @Get(':id')
  async get(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: FastifyReply) {
    if (!this.signer.verify(id, exp, sig)) throw new ForbiddenException('Link expired or invalid');
    const f = await this.files.get(id);
    if (!f) throw new NotFoundException();
    return res.header('Content-Type', f.contentType).header('Cache-Control', 'private, max-age=86400').header('X-Content-Type-Options', 'nosniff').send(f.body);
  }
}

/** Local inspection tools for stand-ins. 404 in production. */
@Public()
@UseGuards(DevOnlyGuard)
@Controller('dev')
export class DevController {
  constructor(private readonly inbound: InboundService, @Inject(INTEGRATION_STATUS) private readonly status: IntegrationStatus, @Inject(PDF) private readonly pdf: PdfPort, @Inject(ROUTING) private readonly routing: RoutingPort) {}
  @Get('integrations') integrations() { return { ...this.status, inboundHandler: this.inbound.handlerReady ? 'tracking (api-core)' : 'not provided yet' }; }
  @Get('sms') sms(@Query('phone') phone?: string) { return devStore.sms.filter((s) => !phone || s.phone === phone).slice().reverse(); }
  /** Simulate a driver texting the shortcode. */
  @Post('sms/inbound') @HttpCode(200)
  async smsIn(@Body() b: { from: string; text: string }) { return { parsed: parseDriverSms(b.text ?? ''), ...(await this.inbound.sms_(b.from, b.text ?? '')) }; }
  /** Simulate one USSD step: text is the AT path, e.g. "" then "3" then "3*1". */
  @Post('ussd') @HttpCode(200)
  async ussd(@Body() b: { phone: string; text?: string }) { return { reply: await this.inbound.ussd(b.phone, b.text ?? '') }; }
  @Get('push') push() { return devStore.push.slice().reverse(); }
  @Get('mail') mail() { return devStore.mail.slice().reverse(); }
  @Post('pdf/:template')
  async pdfPreview(@Param('template') t: string, @Body() data: unknown, @Res() res: FastifyReply) {
    if (t !== 'po-letter' && t !== 'acknowledgement') throw new NotFoundException();
    return res.header('Content-Type', 'application/pdf').send(await this.pdf.render(t, data));
  }
  @Post('route') @HttpCode(200)
  route(@Body() b: { points: { lat: number; lng: number }[] }) { return this.routing.route(b.points ?? []); }
}
