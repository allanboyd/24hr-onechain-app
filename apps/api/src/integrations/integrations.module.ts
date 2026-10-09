// Real adapters + local stand-ins, chosen from config (see .env.example). Business modules inject the port tokens only.
import { Global, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { config } from '../config/config';
import { DevController, FilesController, WebhooksController } from './controllers';
import { LocalFiles, S3Files, UrlSigner } from './files/files';
import { InboundService } from './inbound/inbound.service';
import { LogMail, SmtpMail } from './mail/mail';
import { TypstPdf } from './pdf/pdf';
import { FILES, MAIL, PDF, PUSH, ROUTING, SMS, type FilesPort } from './ports';
import { FakePush, FcmPush } from './push/push';
import { OsrmRouting } from './routing/routing';
import { AfricasTalkingSms, FakeSms } from './sms/sms';
import { INTEGRATION_STATUS, integrationStatus } from './status';

const signer = new UrlSigner(config);

@Global()
@Module({
  controllers: [WebhooksController, FilesController, DevController],
  providers: [
    { provide: UrlSigner, useValue: signer },
    { provide: SMS, useFactory: () => (config.AT_API_KEY ? new AfricasTalkingSms(config) : new FakeSms()) },
    { provide: MAIL, useFactory: () => (config.SMTP_URL ? new SmtpMail(config) : new LogMail()) },
    { provide: PUSH, useFactory: () => (config.FCM_SERVICE_ACCOUNT ? new FcmPush(config) : new FakePush()) },
    { provide: FILES, useFactory: () => (config.FILES_DRIVER === 's3' ? new S3Files(config, signer) : new LocalFiles(config, signer)) },
    { provide: PDF, useFactory: (files: FilesPort) => new TypstPdf(config, files), inject: [FILES] },
    { provide: ROUTING, useFactory: () => new OsrmRouting(config) },
    { provide: INTEGRATION_STATUS, useFactory: () => integrationStatus(config) },
    InboundService,
  ],
  exports: [SMS, MAIL, PUSH, FILES, PDF, ROUTING, UrlSigner, INTEGRATION_STATUS],
})
export class IntegrationsModule implements OnModuleInit {
  onModuleInit() {
    const s = integrationStatus(config);
    new Logger('Integrations').log(Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(' · '));
  }
}
