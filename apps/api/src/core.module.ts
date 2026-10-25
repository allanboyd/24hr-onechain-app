import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BodyShapeInterceptor } from './common/body-shape';
import { JwtModule } from '@nestjs/jwt';
import { config } from './config/config';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AuditInterceptor } from './common/audit.interceptor';
import { ProblemFilter } from './common/errors';
import { FinanceService } from './domain/finance.service';
import { LogisticsService } from './domain/logistics.service';
import { NotifyService } from './domain/notify.service';
import { PeriodPlansService } from './domain/period-plans.service';
import { PlanningService } from './domain/planning.service';
import { PlatformService } from './domain/platform.service';
import { RefService } from './domain/ref.service';
import { StockService } from './domain/stock.service';
import { SyncService } from './domain/sync.service';
import { ReportsService } from './domain/reports.service';
import { MoneyService } from './domain/money.service';
import { DashboardsService } from './domain/dashboards.service';
import { DashboardsController } from './http/dashboards.controller';
import { MoneyController, ReexportsController, WarehouseController } from './http/money.controllers';
import { INBOUND_HANDLER } from './integrations/ports';
import {
  AuthController, DevResetController, FinanceController, LoadingController, MeController, PlanningController, PeriodPlansController, RefController,
  ShipmentsController, StockController, SyncController, UsersController, ReportsController, CompaniesController,
} from './http/controllers';

/** Business modules (api-core). Global so the integrations module can inject INBOUND_HANDLER for SMS/USSD check-ins. */
@Global()
@Module({
  imports: [JwtModule.register({ secret: config.JWT_SECRET, global: true })],
  controllers: [AuthController, MeController, RefController, UsersController, PlanningController, PeriodPlansController, LoadingController, ShipmentsController, StockController, FinanceController, SyncController, DevResetController, ReportsController, CompaniesController, WarehouseController, ReexportsController, MoneyController, DashboardsController],
  providers: [
    RefService, NotifyService, AuthService, PlanningService, PeriodPlansService, LogisticsService, StockService, FinanceService, PlatformService, SyncService, ReportsService, MoneyService, DashboardsService,
    { provide: INBOUND_HANDLER, useExisting: LogisticsService },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: BodyShapeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
  exports: [INBOUND_HANDLER, RefService, NotifyService],
})
export class CoreModule {}
