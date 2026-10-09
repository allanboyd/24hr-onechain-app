import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { catchError, tap, throwError } from 'rxjs';
import { db, schema as t } from '../db/client';

/** UA-03: every create/edit/approve/reject/delete is logged with user, time, channel and outcome. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next.handle();
    const write = (status: number) => {
      const path = String(req.url).split('?')[0];
      if (path.includes('/auth/')) return; // never log credentials
      db.insert(t.auditLog).values({ userId: req.user?.id ?? null, channel: req.user?.channel ?? String(req.headers['x-channel'] ?? 'web'), method: req.method, path, status, detail: { idempotencyKey: req.headers['idempotency-key'] ?? null } }).catch(() => {});
    };
    return next.handle().pipe(
      tap(() => write(req.method === 'POST' ? 201 : 200)),
      catchError((e) => { write(typeof e?.getStatus === 'function' ? e.getStatus() : 500); return throwError(() => e); }),
    );
  }
}
