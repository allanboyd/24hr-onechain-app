// In-memory record of what local stand-ins "sent", exposed under /v1/dev/* for manual testing and e2e tests.
export interface DevSms { id: string; direction: 'out' | 'in'; phone: string; text: string; at: string; channel?: 'sms' | 'ussd' }
export interface DevPush { id: string; tokens: string[]; title: string; body: string; data?: Record<string, string>; at: string }
export interface DevMail { id: string; to: string[]; subject: string; text: string; at: string; attachments: string[] }

const MAX = 500;
const cap = <T>(a: T[]) => { if (a.length > MAX) a.splice(0, a.length - MAX); };
let n = 0;
export const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(++n).toString(36)}`;

export const devStore = {
  sms: [] as DevSms[],
  push: [] as DevPush[],
  mail: [] as DevMail[],
  addSms(e: Omit<DevSms, 'id' | 'at'>) { const x = { ...e, id: nextId('sms'), at: new Date().toISOString() }; this.sms.push(x); cap(this.sms); return x; },
  addPush(e: Omit<DevPush, 'id' | 'at'>) { const x = { ...e, id: nextId('push'), at: new Date().toISOString() }; this.push.push(x); cap(this.push); return x; },
  addMail(e: Omit<DevMail, 'id' | 'at'>) { const x = { ...e, id: nextId('mail'), at: new Date().toISOString() }; this.mail.push(x); cap(this.mail); return x; },
};
