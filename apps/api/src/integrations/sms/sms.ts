import type { Config } from '../../config/config';
import { devStore } from '../dev-store';
import type { SmsPort } from '../ports';

/** Africa's Talking messaging API (sandbox when AT_USERNAME=sandbox). */
export class AfricasTalkingSms implements SmsPort {
  private readonly url: string;
  constructor(private readonly cfg: Config) {
    this.url = cfg.AT_USERNAME === 'sandbox' ? 'https://api.sandbox.africastalking.com/version1/messaging' : 'https://api.africastalking.com/version1/messaging';
  }
  async send(to: string, text: string) {
    const body = new URLSearchParams({ username: this.cfg.AT_USERNAME, to, message: text });
    const from = this.cfg.AT_SENDER_ID || this.cfg.AT_SHORTCODE;
    if (from) body.set('from', from);
    const res = await fetch(this.url, { method: 'POST', headers: { apiKey: this.cfg.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Africa's Talking ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { SMSMessageData?: { Recipients?: { messageId: string; status: string }[] } };
    const r = json.SMSMessageData?.Recipients?.[0];
    if (!r || !/success|sent|queued/i.test(r.status)) throw new Error(`Africa's Talking rejected SMS: ${r?.status ?? 'no recipient'}`);
    if (this.cfg.NODE_ENV !== 'production') devStore.addSms({ direction: 'out', phone: to, text });
    return { id: r.messageId, provider: 'africastalking' as const };
  }
}

/** Local stand-in: records outbound texts in the dev inbox (GET /v1/dev/sms). */
export class FakeSms implements SmsPort {
  async send(to: string, text: string) {
    const e = devStore.addSms({ direction: 'out', phone: to, text });
    return { id: e.id, provider: 'fake' as const };
  }
}
