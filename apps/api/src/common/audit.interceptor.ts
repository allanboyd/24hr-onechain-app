import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { catchError, tap, throwError } from 'rxjs';
import { db, schema as t } from '../db/client';
import { auditBody, auditPath, auditStore, type AuditNote } from './audit-context';

/** UA-03: every create/edit/approve/reject/delete is logged with user, time, channel and outcome — plus (docs/12 A-07)
 *  the feature area, the record changed and its values before / after when the service says (auditNote). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next.handle();
    // the request's note (opened by the onRequest hook in main.ts); services add to it with auditNote()
    let note = auditStore.getStore();
    if (!note) { note = {} as AuditNote; auditStore.enterWith(note); }
    const write = (status: number) => {
      const path = String(req.url).split('?')[0];
      if (path.includes('/auth/')) return; // never log credentials
      const p = auditPath(path); const n = note!;
      const after = n.after !== undefined ? n.after : status < 400 ? auditBody(req.body) : null;
      db.insert(t.auditLog).values({
        userId: req.user?.id ?? null, channel: req.user?.channel ?? String(req.headers['x-channel'] ?? 'web'), method: req.method, path, status,
        entityId: n.entityId ?? req.user?.activeEntityId ?? null, detail: { idempotencyKey: req.headers['idempotency-key'] ?? null },
        feature: p.feature, recordType: n.recordType ?? p.recordType, recordId: n.recordId ?? p.recordId, summary: n.summary ?? null,
        before: (n.before ?? null) as never, after: (after ?? null) as never,
      }).catch(() => {});
    };
    return next.handle().pipe(
      tap(() => write(req.method === 'POST' ? 201 : 200)),
      catchError((e) => { write(typeof e?.getStatus === 'function' ? e.getStatus() : 500); return throwError(() => e); }),
    );
  }
}
