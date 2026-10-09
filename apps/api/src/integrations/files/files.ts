import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../../config/config';
import type { FilesPort } from '../ports';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/csv': 'csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };
const IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class FileRejected extends Error {}

/** Shared rules for every driver: type allow-list, images-only for photos/signatures, size cap. */
export function validate(key: string, body: Buffer, contentType: string, maxMb: number) {
  if (!EXT[contentType]) throw new FileRejected(`File type ${contentType} is not allowed`);
  const kind = key.split('/')[0];
  if ((kind === 'photo' || kind === 'signature') && !IMAGE.has(contentType)) throw new FileRejected(`${kind} must be an image (jpeg, png or webp)`);
  if (body.length > maxMb * 1024 * 1024) throw new FileRejected(`File is larger than ${maxMb} MB`);
  if (!body.length) throw new FileRejected('File is empty');
}
/** Content-addressed id: same bytes → same id (dedupes retried offline uploads). */
export const fileId = (body: Buffer, contentType: string) => `${createHash('sha256').update(body).digest('hex').slice(0, 40)}.${EXT[contentType]}`;
export const isFileId = (id: string) => /^[a-f0-9]{40}\.[a-z]{3,4}$/.test(id);

export class UrlSigner {
  constructor(private readonly cfg: Config) {}
  private mac(id: string, exp: number) { return createHmac('sha256', this.cfg.JWT_SECRET).update(`file:${id}:${exp}`).digest('base64url'); }
  sign(id: string, ttlSec = 86_400) { const exp = Math.floor(Date.now() / 1000) + ttlSec; return `${this.cfg.PUBLIC_URL}/v1/files/${id}?exp=${exp}&sig=${this.mac(id, exp)}`; }
  verify(id: string, exp: string | undefined, sig: string | undefined) {
    const e = Number(exp);
    if (!sig || !Number.isFinite(e) || e < Date.now() / 1000) return false;
    const a = Buffer.from(this.mac(id, e)), b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/** Local disk: FILES_DIR/<2-char shard>/<id> + <id>.json metadata. */
export class LocalFiles implements FilesPort {
  private readonly root: string;
  constructor(private readonly cfg: Config, private readonly signer: UrlSigner) { this.root = path.resolve(cfg.FILES_DIR); }
  private p(id: string) { return path.join(this.root, id.slice(0, 2), id); }
  async put(key: string, body: Buffer, contentType: string) {
    validate(key, body, contentType, this.cfg.MAX_UPLOAD_MB);
    const id = fileId(body, contentType);
    await mkdir(path.dirname(this.p(id)), { recursive: true });
    await writeFile(this.p(id), body);
    await writeFile(`${this.p(id)}.json`, JSON.stringify({ key, contentType, size: body.length, at: new Date().toISOString() }));
    return { id, url: this.signer.sign(id), size: body.length };
  }
  async get(id: string) {
    if (!isFileId(id)) return null;
    try {
      const meta = JSON.parse(await readFile(`${this.p(id)}.json`, 'utf8')) as { contentType: string };
      return { body: await readFile(this.p(id)), contentType: meta.contentType };
    } catch { return null; }
  }
  signedUrl(id: string, ttlSec?: number) { return this.signer.sign(id, ttlSec); }
}

/** S3-compatible object storage (AWS S3, Cloudflare R2, MinIO) with SigV4, path-style. Skeleton: PUT/GET only. */
export class S3Files implements FilesPort {
  constructor(private readonly cfg: Config, private readonly signer: UrlSigner) {}
  private async req(method: 'PUT' | 'GET', id: string, body?: Buffer, contentType?: string) {
    const { S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY } = this.cfg;
    const url = new URL(`${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${id}`);
    const now = new Date(); const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); const day = amz.slice(0, 8);
    const payloadHash = createHash('sha256').update(body ?? '').digest('hex');
    const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz, ...(contentType ? { 'content-type': contentType } : {}) };
    const names = Object.keys(headers).sort();
    const canonical = [method, url.pathname, '', ...names.map((h) => `${h}:${headers[h]}`), '', names.join(';'), payloadHash].join('\n');
    const scope = `${day}/${S3_REGION}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amz, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
    const h = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
    const key = h(h(h(h(`AWS4${S3_SECRET_KEY}`, day), S3_REGION), 's3'), 'aws4_request');
    const signature = createHmac('sha256', key).update(toSign).digest('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${S3_ACCESS_KEY}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
    delete headers.host;
    return fetch(url, { method, headers, body, signal: AbortSignal.timeout(20_000) });
  }
  async put(key: string, body: Buffer, contentType: string) {
    validate(key, body, contentType, this.cfg.MAX_UPLOAD_MB);
    const id = fileId(body, contentType);
    const res = await this.req('PUT', id, body, contentType);
    if (!res.ok) throw new Error(`S3 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { id, url: this.signer.sign(id), size: body.length };
  }
  async get(id: string) {
    if (!isFileId(id)) return null;
    const res = await this.req('GET', id);
    if (!res.ok) return null;
    return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }
  signedUrl(id: string, ttlSec?: number) { return this.signer.sign(id, ttlSec); }
}
