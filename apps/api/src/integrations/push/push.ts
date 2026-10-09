import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Config } from '../../config/config';
import { devStore } from '../dev-store';
import type { PushPort } from '../ports';

interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Firebase Cloud Messaging HTTP v1. OAuth token minted from the service account with node:crypto (RS256). */
export class FcmPush implements PushPort {
  private readonly sa: ServiceAccount;
  private token: { value: string; exp: number } | null = null;
  constructor(cfg: Config) {
    const raw = cfg.FCM_SERVICE_ACCOUNT.trim().startsWith('{') ? cfg.FCM_SERVICE_ACCOUNT : readFileSync(cfg.FCM_SERVICE_ACCOUNT, 'utf8');
    this.sa = JSON.parse(raw);
  }
  private async accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.exp - 60 > now) return this.token.value;
    const aud = this.sa.token_uri ?? 'https://oauth2.googleapis.com/token';
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud, iat: now, exp: now + 3600 }))}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(this.sa.private_key);
    const res = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`FCM auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, exp: now + j.expires_in };
    return j.access_token;
  }
  async send(tokens: string[], msg: { title: string; body: string; data?: Record<string, string> }) {
    if (!tokens.length) return { sent: 0, failed: [] };
    const bearer = await this.accessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`;
    const failed: string[] = [];
    await Promise.all(tokens.map(async (token) => {
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { token, notification: { title: msg.title, body: msg.body }, data: msg.data, android: { priority: 'high' } } }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
      if (!res || !res.ok) failed.push(token); // 404 UNREGISTERED / 400 INVALID_ARGUMENT → caller should drop the token
    }));
    return { sent: tokens.length - failed.length, failed };
  }
}

/** Local stand-in: records pushes (GET /v1/dev/push). */
export class FakePush implements PushPort {
  async send(tokens: string[], msg: { title: string; body: string; data?: Record<string, string> }) {
    devStore.addPush({ tokens, ...msg });
    return { sent: tokens.length, failed: [] };
  }
}
