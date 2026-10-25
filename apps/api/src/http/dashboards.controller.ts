// docs/15 — P1 dashboards: GET /v1/dashboards?keys=a,b&entityId&supplierId&routeId&warehouseId&productId&from&to
// (no keys = the caller's home set) and GET /v1/dashboards/:key. Scoped by the caller (DashboardsService).
import { Controller, Get, Param, Query } from '@nestjs/common';
import { Me } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { DashboardsService } from '../domain/dashboards.service';
import { FILTER_KEYS, type DashFilter } from '@btw/api/dashboards';

function filter(q: Record<string, unknown> = {}): DashFilter {
  const f: DashFilter = {};
  for (const k of FILTER_KEYS) {
    const v = q[k];
    if (typeof v !== 'string' || !v || v.length > 64) continue;
    if ((k === 'from' || k === 'to') && Number.isNaN(Date.parse(v))) continue;
    f[k] = k === 'from' || k === 'to' ? new Date(v).toISOString() : v;
  }
  return f;
}

@Controller('dashboards')
export class DashboardsController {
  constructor(private dash: DashboardsService) {}
  @Get() list(@Me() p: Principal, @Query() q: Record<string, unknown>) {
    const keys = typeof q?.keys === 'string' && q.keys ? q.keys.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 40) : [];
    return this.dash.get(p, keys, filter(q));
  }
  @Get(':key') async one(@Me() p: Principal, @Param('key') key: string, @Query() q: Record<string, unknown>) {
    const r = await this.dash.get(p, [key], filter(q));
    return { ...r.results[key as keyof typeof r.results], options: r.options };
  }
}
