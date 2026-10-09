// Web session on top of @btw/api: restore (validates the stored token and loads the reference cache),
// sign-in, sign-out, and expiry (the client reports a refresh it couldn't make via auth.onExpired).
import { tick } from 'svelte';
import { auth, configure, ready } from '@btw/api';
import type { User } from '@btw/api';
import { describe } from './errors';

configure({ channel: 'web' });
export const session = $state<{ user: User | null; notice: string; ready: boolean }>({ user: null, notice: '', ready: false });

auth.onExpired(() => expire());

export async function restore() {
  try { await ready(); session.user = auth.me(); }
  catch (e) { if (describe(e).kind !== 'auth') console.warn('session restore failed', e); }
  session.ready = true;
}

export async function signIn(username: string, password: string) {
  // The API matches `username` against username, id or phone; `phone` is only for the field app's PIN sign-in.
  const id = username.trim();
  const u = await auth.signIn({ username: /^\+?\d[\d\s]{6,}$/.test(id) ? id.replace(/\s/g, '') : id, password });
  if (!u) throw Object.assign(new Error('Wrong username or password.'), { status: 401 });
  session.notice = '';
  session.user = u;
  return u;
}

export async function signOut(notice = '') {
  // Unmount the screens first (tick) so nothing refetches while the token is being revoked.
  session.user = null;
  session.notice = notice;
  location.hash = '/';
  await tick();
  // The client awaits the revoke and mints a fresh device id on the next web sign-in, so no local cleanup is needed.
  await Promise.resolve(auth.logout()).catch(() => { /* offline: the server session expires on its own */ });
}

/** A request came back 401 and the token couldn't be refreshed. */
export function expire() {
  if (!session.user) return;
  signOut('Your session expired. Sign in again to continue.');
}
