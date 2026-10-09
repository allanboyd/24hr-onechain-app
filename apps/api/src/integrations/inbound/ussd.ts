// Africa's Talking USSD menu (stateless: AT re-sends the whole path in `text`, e.g. "3*1").
import type { InboundCheckin, InboundHandler } from '../ports';

export type UssdReply = string; // must start with "CON " (continue) or "END " (finish)
const PROBLEMS = [['1', 'breakdown', 'Breakdown'], ['2', 'border', 'Border / documents'], ['3', 'police', 'Police / weighbridge'], ['4', 'other', 'Other']] as const;

export async function ussdMenu(handler: InboundHandler | null, phone: string, text: string): Promise<UssdReply> {
  if (!handler) return 'END Service unavailable. Please try again later or call your fleet office.';
  const path = (text ?? '').split('*').filter((x) => x !== '');
  const status = await handler.driverStatus(phone);
  if (!status) return 'END No active trip for this number. Call your fleet office.';
  const next = status.nextCheckpoint;
  const base = { from: phone, truckReg: status.truckReg, channel: 'ussd' as const };
  const run = async (c: Omit<InboundCheckin, 'from' | 'truckReg' | 'channel'>) => {
    const r = await handler.handleCheckin({ ...base, ...c });
    return `END ${r.reply}`;
  };
  if (path.length === 0) {
    return ['CON BTW ' + status.truckReg, next ? `1. I've arrived at ${next.name}` : '1. I\'ve arrived', '2. I\'m leaving here', '3. Report a problem'].join('\n');
  }
  switch (path[0]) {
    case '1': return run({ kind: 'arrived', checkpointCode: next?.code ?? '', raw: `USSD 1` });
    case '2': return run({ kind: 'departed', checkpointCode: '', raw: `USSD 2` });
    case '3': {
      if (path.length === 1) return ['CON What is the problem?', ...PROBLEMS.map(([k, , label]) => `${k}. ${label}`)].join('\n');
      const p = PROBLEMS.find(([k]) => k === path[1]);
      if (!p) return 'END Invalid choice.';
      return run({ kind: 'problem', checkpointCode: '', reason: p[1], raw: `USSD 3*${path[1]}` });
    }
    default: return 'END Invalid choice.';
  }
}
