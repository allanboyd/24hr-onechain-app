// Turns any thrown value (mock Error, http client error, fetch TypeError) into something a person can act on.
export type ErrorKind = 'offline' | 'auth' | 'forbidden' | 'notfound' | 'rule' | 'server' | 'unknown';
export interface Described { kind: ErrorKind; title: string; message: string; status?: number }

function statusOf(e: any): number | undefined {
  const s = e?.status ?? e?.statusCode ?? e?.response?.status;
  return typeof s === 'number' ? s : undefined;
}

export function describe(e: unknown): Described {
  const err = e as any;
  const status = statusOf(err);
  const raw: string = (typeof err === 'string' ? err : err?.detail ?? err?.body?.detail ?? err?.message ?? '') || '';
  if (status === undefined && (err instanceof TypeError || /failed to fetch|networkerror|load failed|ECONNREFUSED/i.test(raw)))
    return { kind: 'offline', title: 'Can’t reach the server', message: 'Check your connection. If it persists, the API may be down.' };
  if (status === 401) return { kind: 'auth', status, title: 'Signed out', message: 'Your session has expired. Sign in again.' };
  if (status === 403) return { kind: 'forbidden', status, title: 'Not in your scope', message: raw || 'Your account isn’t allowed to see or change this. Ask an administrator to extend your access.' };
  if (status === 404) return { kind: 'notfound', status, title: 'Not found', message: raw || 'It may have been removed, or the link is wrong.' };
  if (status === 409 || status === 422 || status === 400) return { kind: 'rule', status, title: 'Can’t do that', message: raw || 'The server rejected this change.' };
  if (status && status >= 500) return { kind: 'server', status, title: 'Server error', message: 'Something failed on the server. Try again in a moment.' };
  return { kind: status ? 'rule' : 'unknown', status, title: 'Something went wrong', message: raw || 'Unexpected error.' };
}
