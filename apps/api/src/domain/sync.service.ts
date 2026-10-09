import { Injectable } from '@nestjs/common';
import type { Principal } from '../auth/principal';
import { once } from '../common/idempotency';
import { LogisticsService } from './logistics.service';
import { StockService } from './stock.service';

export interface SyncItem { idempotencyKey: string; op: string; payload: any; createdAt?: string }

/** MA-06: replay the field outbox in order. Each item is applied once per idempotency key. */
@Injectable()
export class SyncService {
  constructor(private logistics: LogisticsService, private stock: StockService) {}

  private run(p: Principal, op: string, x: any): Promise<unknown> {
    const at = x?.at ? Date.parse(x.at) : undefined;
    switch (op) {
      case 'leg.pass': return this.logistics.pass(p, x.legId, x.checkpointId, x.kind, x.source ?? 'driver', at ?? Date.now());
      case 'leg.pass.undo': return this.logistics.undoPass(p, x.legId, x.checkpointId, x.kind);
      case 'leg.issue': return this.logistics.issue(p, x.legId, x.issue);
      case 'leg.issue.fix': case 'issue.fix': return this.logistics.fixIssue(p, x.legId, x.issueId);
      case 'leg.acknowledge': return this.logistics.acknowledge(p, x.legId, x.input);
      case 'leg.dispatch': return this.logistics.dispatch(p, x.legId, x.source ?? 'office');
      case 'loading.confirm': return this.logistics.confirmLoading(p, x.id, x.input);
      case 'waiting.add': return this.logistics.addWaiting(p, x.loadingPointId, x.truckId, x.driverId);
      case 'sale.create': return this.stock.createSale(p, x.input, !!x.override);
      case 'positions': return this.logistics.positions(p, x.items ?? x);
      default: throw Object.assign(new Error(`Unknown operation ${op}`), { getStatus: () => 400 });
    }
  }

  async batch(p: Principal, items: SyncItem[]) {
    const out: { idempotencyKey: string; status: 'applied' | 'duplicate' | 'rejected'; result?: unknown; error?: { title: string; status: number } }[] = [];
    for (const it of items ?? []) {
      if (!it?.idempotencyKey || !it.op) { out.push({ idempotencyKey: it?.idempotencyKey ?? '', status: 'rejected', error: { title: 'idempotencyKey and op are required', status: 400 } }); continue; }
      try {
        const r = await once(it.idempotencyKey, p.id, it.op, () => this.run(p, it.op, it.payload));
        out.push({ idempotencyKey: it.idempotencyKey, status: r.status, result: r.result });
      } catch (e) {
        const status = typeof (e as { getStatus?: () => number }).getStatus === 'function' ? (e as { getStatus: () => number }).getStatus() : 422;
        if (status >= 500) throw e;
        out.push({ idempotencyKey: it.idempotencyKey, status: 'rejected', error: { title: (e as Error).message, status } });
      }
    }
    return out;
  }
}
