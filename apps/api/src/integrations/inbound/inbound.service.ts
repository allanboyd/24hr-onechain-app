import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { devStore } from '../dev-store';
import { INBOUND_HANDLER, SMS, type InboundHandler, type SmsPort } from '../ports';
import { parseDriverSms, SMS_HELP } from './parser';
import { ussdMenu } from './ussd';

/** Turns inbound driver texts / USSD sessions into tracking check-ins (INBOUND_HANDLER, provided by api-core). */
@Injectable()
export class InboundService {
  private readonly log = new Logger('Inbound');
  constructor(@Inject(SMS) private readonly sms: SmsPort, @Optional() @Inject(INBOUND_HANDLER) private readonly handler: InboundHandler | null) {}

  async sms_(from: string, text: string, record = true): Promise<{ ok: boolean; reply: string }> {
    if (record) devStore.addSms({ direction: 'in', phone: from, text, channel: 'sms' });
    const parsed = parseDriverSms(text);
    let result: { ok: boolean; reply: string };
    if (!parsed.ok) result = { ok: false, reply: `Not understood (${parsed.error}). ${SMS_HELP}` };
    else if (!this.handler) result = { ok: false, reply: 'Service unavailable. Please call your fleet office.' };
    else {
      try { result = await this.handler.handleCheckin({ ...parsed.checkin, from, channel: 'sms' }); }
      catch (e) { this.log.error(`check-in failed for ${from}: ${(e as Error).message}`); result = { ok: false, reply: 'Could not record that. Please try again or call your fleet office.' }; }
    }
    try { await this.sms.send(from, result.reply); } catch (e) { this.log.warn(`reply SMS to ${from} failed: ${(e as Error).message}`); }
    return result;
  }

  async ussd(phone: string, text: string) {
    devStore.addSms({ direction: 'in', phone, text: `USSD "${text}"`, channel: 'ussd' });
    try { return await ussdMenu(this.handler ?? null, phone, text); }
    catch (e) { this.log.error(`USSD failed for ${phone}: ${(e as Error).message}`); return 'END Something went wrong. Please try again.'; }
  }
  get handlerReady() { return !!this.handler; }
}
