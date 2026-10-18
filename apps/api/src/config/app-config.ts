// Business settings from apps/api/config.toml (path: env CONFIG_FILE). Read once at startup; missing file or key → default.
// A deliberately tiny TOML reader: [sections], `key = value` with booleans, numbers and "strings", and # comments.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '@btw/api/types';
import { defaultConfig } from '@btw/api/rules';

export function parseToml(text: string): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = { '': {} };
  let section = '';
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/^\s+/, '');
    if (!line || line.startsWith('#')) return;
    const sec = line.match(/^\[([A-Za-z0-9_.-]+)\]\s*(#.*)?$/);
    if (sec) { section = sec[1]; out[section] ??= {}; return; }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    if (!kv) throw new Error(`config.toml line ${i + 1}: expected key = value`);
    let v = kv[2].trim(); let value: unknown;
    const str = v.match(/^"((?:[^"\\]|\\.)*)"\s*(#.*)?$/) ?? v.match(/^'([^']*)'\s*(#.*)?$/);
    if (str) value = str[1].replace(/\\(["\\])/g, '$1');
    else {
      v = v.replace(/\s*#.*$/, '');
      if (v === 'true' || v === 'false') value = v === 'true';
      else if (/^[+-]?\d+(\.\d+)?$/.test(v.replace(/_/g, ''))) value = Number(v.replace(/_/g, ''));
      else throw new Error(`config.toml line ${i + 1}: unsupported value ${v}`);
    }
    out[section][kv[1]] = value;
  });
  return out;
}

export function toAppConfig(t: Record<string, Record<string, unknown>>): AppConfig {
  const a = t.approvals ?? {}, l = t.loading ?? {}, d = defaultConfig;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const pct = Number(l.allowance_pct);
  return {
    approvals: { purchaseOrders: bool(a.purchase_orders, d.approvals.purchaseOrders) },
    loading: {
      allowancePct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : d.loading.allowancePct,
      allowAlternatives: bool(l.allow_alternatives, d.loading.allowAlternatives),
      revisionSuffix: typeof l.revision_suffix === 'string' && /^[A-Za-z0-9._-]{0,12}$/.test(l.revision_suffix) ? l.revision_suffix : d.loading.revisionSuffix,
    },
  };
}

export function loadAppConfig(file = process.env.CONFIG_FILE ?? path.resolve(__dirname, '../../config.toml')): AppConfig {
  if (!existsSync(file)) return structuredClone(defaultConfig);
  return toAppConfig(parseToml(readFileSync(file, 'utf8')));
}

/** The running server's business settings. */
export const appConfig: AppConfig = loadAppConfig();
