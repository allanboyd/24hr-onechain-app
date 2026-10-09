// Parses driver SMS codes. Tolerant of case, extra spaces, punctuation and plate spacing:
//   ARR MALABA KDA123A · arr malaba kda 123a · ARRIVED GATUNA T 512 DFG · ARR KDA123A MALABA
//   DEP MALABA KDA123A · FIX KDA123A · OFF KDA123A · ISSUE KDA123A BREAKDOWN · ARR MALABA (plate from sender)
import type { InboundCheckin } from '../ports';

const VERBS: Record<string, InboundCheckin['kind']> = {
  ARR: 'arrived', ARRIVE: 'arrived', ARRIVED: 'arrived', IN: 'arrived', FIKA: 'arrived', NIMEFIKA: 'arrived',
  DEP: 'departed', DEPART: 'departed', DEPARTED: 'departed', LEFT: 'departed', LEAVE: 'departed', OUT: 'departed', TOKA: 'departed',
  FIX: 'fixed', FIXED: 'fixed', OK: 'fixed', MOVING: 'fixed',
  OFF: 'offloading', OFFLOAD: 'offloading', OFFLOADING: 'offloading',
  ISSUE: 'problem', PROB: 'problem', PRB: 'problem', PROBLEM: 'problem', HELP: 'problem',
};
const REASONS: Record<string, string> = {
  BREAKDOWN: 'breakdown', BREAK: 'breakdown', ENGINE: 'breakdown', TYRE: 'breakdown', TIRE: 'breakdown',
  BORDER: 'border', DOCS: 'border', DOCUMENTS: 'border', CUSTOMS: 'border', CLEARING: 'border',
  POLICE: 'police', WEIGHBRIDGE: 'police', WB: 'police',
  ACCIDENT: 'accident',
};

/** East African plates once spaces are removed: KDA123A, UBA789C, T512DFG, RAD310E, SSD410K, CGO1234AB… */
export const isPlate = (s: string) => /^[A-Z]{1,3}\d{2,4}[A-Z]{0,3}$/.test(s) && s.length >= 5 && s.length <= 9;
export const normalizePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export type ParseResult = { ok: true; checkin: Omit<InboundCheckin, 'from'> } | { ok: false; error: string };

/** Find a plate at the end (1–3 tokens) or at the start of `tokens`; returns [plate, rest]. */
function takePlate(tokens: string[]): [string, string[]] {
  for (let k = Math.min(3, tokens.length); k >= 1; k--) {
    const tail = tokens.slice(-k).join('');
    if (isPlate(tail) && tokens.length - k >= 0) return [tail, tokens.slice(0, -k)];
  }
  for (let k = Math.min(3, tokens.length); k >= 1; k--) {
    const head = tokens.slice(0, k).join('');
    if (isPlate(head)) return [head, tokens.slice(k)];
  }
  return ['', tokens];
}

export function parseDriverSms(raw: string): ParseResult {
  const tokens = raw.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ok: false, error: 'empty' };
  const kind = VERBS[tokens[0]];
  if (!kind) return { ok: false, error: `unknown code "${tokens[0]}"` };
  const rest = tokens.slice(1);
  const [plate, others] = takePlate(rest);
  if (kind === 'arrived' || kind === 'departed') {
    // A digits-only leftover can't be a checkpoint; plate parts like "123A" without letters prefix are rejected above.
    const checkpointCode = others.join(' ');
    return { ok: true, checkin: { kind, checkpointCode, truckReg: plate, raw } };
  }
  if (kind === 'problem') {
    const words = others.map((w) => REASONS[w] ?? w.toLowerCase());
    const known = words.find((w) => ['breakdown', 'border', 'police', 'accident'].includes(w));
    return { ok: true, checkin: { kind, checkpointCode: '', truckReg: plate, raw, reason: known ?? (words.join(' ') || 'other') } };
  }
  return { ok: true, checkin: { kind, checkpointCode: others.join(' '), truckReg: plate, raw } };
}

export const SMS_HELP = 'Codes: ARR <place> <plate> · DEP <place> <plate> · ISSUE <plate> BREAKDOWN|BORDER|POLICE · FIX <plate> · OFF <plate>';
