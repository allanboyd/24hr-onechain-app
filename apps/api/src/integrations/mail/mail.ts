import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../../config/config';
import { devStore } from '../dev-store';
import type { MailPort } from '../ports';

/** SMTP (Mailpit locally on :11025; any provider's SMTP in production). */
export class SmtpMail implements MailPort {
  private readonly t: Transporter;
  constructor(private readonly cfg: Config) { this.t = nodemailer.createTransport(cfg.SMTP_URL); }
  async send(m: Parameters<MailPort['send']>[0]) {
    const to = Array.isArray(m.to) ? m.to : [m.to];
    const info = await this.t.sendMail({ from: this.cfg.MAIL_FROM, to, subject: m.subject, text: m.text, html: m.html, attachments: m.attachments });
    if (this.cfg.NODE_ENV !== 'production') devStore.addMail({ to, subject: m.subject, text: m.text, attachments: (m.attachments ?? []).map((a) => a.filename) });
    return { id: info.messageId };
  }
}

/** Used when SMTP_URL is empty: records the message only. */
export class LogMail implements MailPort {
  async send(m: Parameters<MailPort['send']>[0]) {
    const e = devStore.addMail({ to: Array.isArray(m.to) ? m.to : [m.to], subject: m.subject, text: m.text, attachments: (m.attachments ?? []).map((a) => a.filename) });
    return { id: e.id };
  }
}
