import { BadRequestException, type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';

/** Routes whose body is a JSON list. */
const LIST_BODIES = [/\/v1\/positions$/, /\/v1\/sync\/batch$/];

/**
 * Body hygiene before any handler runs: a missing body becomes {}, a JSON primitive (null, "x", 42) is a 400, and a
 * list is only accepted where the route expects one. Handlers can then read fields without crashing on junk input.
 */
@Injectable()
export class BodyShapeInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<{ method: string; url: string; body: unknown; headers: Record<string, string> }>();
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !/form-urlencoded/.test(req.headers['content-type'] ?? '')) {
      const url = req.url.split('?')[0];
      const listRoute = LIST_BODIES.some((r) => r.test(url));
      if (req.body === undefined || req.body === null || req.body === '') req.body = listRoute ? [] : {};
      else if (typeof req.body !== 'object') throw new BadRequestException('The request body must be a JSON object');
      else if (Array.isArray(req.body) && !listRoute) throw new BadRequestException('The request body must be a JSON object, not a list');
    }
    return next.handle();
  }
}
