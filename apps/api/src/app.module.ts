import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { HealthController } from './health/health.controller';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({ imports: [CoreModule, IntegrationsModule], controllers: [HealthController] })
export class AppModule {}
