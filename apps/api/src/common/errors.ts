import { ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';

/** Domain error → RFC 9457 problem. 422 = business rule, 409 = state conflict, 404, 403. */
export class DomainError extends HttpException {
  constructor(message: string, status = 422, code = 'rule') { super({ type: `https://btw.local/problems/${code}`, title: message, detail: message, code, status }, status); }
}
export const fail = (message: string, status = 422, code = 'rule'): never => { throw new DomainError(message, status, code); };
export const notFound = (what: string): never => fail(`${what} not found`, 404, 'not-found');
export const forbidden = (msg = 'Not allowed for your role or scope'): never => fail(msg, 403, 'forbidden');

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (err instanceof HttpException) {
      const status = err.getStatus(); const body = err.getResponse();
      const problem = typeof body === 'object' && body && 'title' in body ? body : { type: 'about:blank', title: typeof body === 'string' ? body : (body as { message?: string })?.message ?? err.message, detail: (body as { message?: unknown })?.message ?? err.message, status, code: status === 401 ? 'unauthorized' : status === 404 ? 'not-found' : 'http' };
      return res.status(status).header('content-type', 'application/problem+json').send(problem);
    }
    const msg = err instanceof Error ? err.message : String(err);
    // Database errors never reach the client verbatim (they contain SQL); unique violations are conflicts.
    const pg = (err as { cause?: { code?: string } })?.cause?.code ?? (err as { code?: string })?.code;
    if (pg === '23505') return res.status(409).header('content-type', 'application/problem+json').send({ type: 'about:blank', title: 'That record already exists', status: 409, code: 'duplicate' });
    const isDb = /^Failed query|ECONN|postgres|relation|column|syntax/i.test(msg) || (typeof pg === 'string' && /^[0-9A-Z]{5}$/.test(pg));
    // Rule violations thrown from shared rules (plain Error) are client errors, not crashes.
    const isRule = err instanceof Error && !isDb && !(err instanceof TypeError) && !(err instanceof ReferenceError) && !(err instanceof RangeError);
    if (!isRule) console.error(err);
    return res.status(isRule ? 422 : 500).header('content-type', 'application/problem+json').send({ type: 'about:blank', title: isRule ? msg : 'Internal error', detail: isRule ? msg : undefined, status: isRule ? 422 : 500, code: isRule ? 'rule' : 'internal' });
  }
}
