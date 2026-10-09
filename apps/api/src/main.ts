import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { config } from './config/config';

// Single point: when the apps are built (`pnpm start`), this server also serves them on the same origin:
//   /        office web app      (apps/web/dist)
//   /app/    field app           (apps/field/dist, built with base './')
//   /brand/  logo variants sheet (docs/brand + packages/ui/src/assets/brand)
//   /v1      API, /health
const REPO = path.resolve(__dirname, '../../..');
const STATIC: { prefix: string; dir: string }[] = [
  // WEB_DIST / FIELD_DIST let a second instance (e.g. the e2e suite) serve its own builds without touching dist/.
  { prefix: '/app/', dir: process.env.FIELD_DIST ?? 'apps/field/dist' },
  { prefix: '/brand/', dir: 'docs/brand' },
  { prefix: '/packages/ui/src/assets/brand/', dir: 'packages/ui/src/assets/brand' },
  { prefix: '/', dir: process.env.WEB_DIST ?? 'apps/web/dist' },
];

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ bodyLimit: 15 * 1024 * 1024 }));
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableCors({ origin: config.CORS_ORIGINS.split(','), credentials: true });
  const served: string[] = [];
  if (process.env.SERVE_APPS !== '0') {
    let first = true;
    for (const s of STATIC) {
      const root = path.resolve(REPO, s.dir); // relative to the repo, or absolute
      if (!existsSync(root)) continue;
      app.useStaticAssets({ root, prefix: s.prefix, decorateReply: first, index: ['index.html'] });
      first = false; served.push(`${s.prefix} → ${s.dir}`);
    }
  }
  await app.listen(config.PORT, '0.0.0.0');
  console.log(`BTW API on http://localhost:${config.PORT}${served.length ? `\n  serving ${served.join(', ')}` : ''}`);
}
bootstrap();
