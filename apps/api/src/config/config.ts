// Typed environment. Read once at boot; integrations decide real vs local stand-in from these values.
import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env')) for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const Env = z.object({
  PORT: z.coerce.number().default(3101),
  DB_POOL: z.coerce.number().int().min(2).default(20),
  REF_TTL_MS: z.coerce.number().int().min(100).default(60_000),
  DATABASE_URL: z.string().default('postgres://btw:btw@localhost:55433/btw'),
  JWT_SECRET: z.string().default('dev-secret'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,capacitor://localhost,http://localhost'),
  FILES_DIR: z.string().default('./var/files'),
  SMTP_URL: z.string().default('smtp://localhost:11025'),
  MAIL_FROM: z.string().default('BTW Supply Chain <no-reply@btw.local>'),
  AT_USERNAME: z.string().default('sandbox'),
  AT_API_KEY: z.string().default(''),
  AT_SHORTCODE: z.string().default(''),
  FCM_SERVICE_ACCOUNT: z.string().default(''),
  OSRM_URL: z.string().default('https://router.project-osrm.org'),
  // ---- integrations (api-integrations agent) ----
  NODE_ENV: z.string().default('development'),
  PUBLIC_URL: z.string().default('http://localhost:3101'),     // absolute base for signed file links
  AT_SENDER_ID: z.string().default(''),                         // alphanumeric sender id (live only)
  WEBHOOK_SECRET: z.string().default(''),                       // when set, webhooks require ?key=<secret>
  FILES_DRIVER: z.enum(['local', 's3']).default('local'),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  S3_ENDPOINT: z.string().default(''),                          // e.g. https://<account>.r2.cloudflarestorage.com or MinIO
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  TRUCK_TIME_FACTOR: z.coerce.number().default(1.4),            // OSRM car duration × factor ≈ loaded truck
  PDF_FONT_DIRS: z.string().default('/usr/share/fonts/truetype'),
});
export const config = Env.parse(process.env);
export type Config = typeof config;
