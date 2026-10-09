import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, arrayOverlaps, eq, isNotNull, isNull, inArray } from 'drizzle-orm';
import { db, schema as t, type Tx } from '../db/client';
import { uid, iso } from '../common/ids';
import { MAIL, PUSH, SMS, type MailPort, type PushPort, type SmsPort } from '../integrations/ports';
import type { Role } from '@btw/api/types';

/** NT-01: in-app row for the roles, then best-effort delivery (push to their devices, email to office roles). */
@Injectable()
export class NotifyService {
  private log = new Logger('Notify');
  constructor(@Inject(PUSH) private push: PushPort, @Inject(MAIL) private mail: MailPort, @Inject(SMS) private sms: SmsPort) {}

  async notify(q: typeof db | Tx, title: string, body: string, link: string | undefined, forRoles: Role[], opts: { email?: boolean } = {}) {
    const id = uid('n');
    await q.insert(t.notifications).values({ id, at: iso(), title, body, link: link ?? null, forRoles });
    setImmediate(() => this.deliver(title, body, link, forRoles, opts.email ?? false).catch((e) => this.log.warn(`delivery failed: ${e?.message ?? e}`)));
    return id;
  }

  private async deliver(title: string, body: string, link: string | undefined, forRoles: Role[], email: boolean) {
    const roles = [...new Set<Role>([...forRoles, 'director'])];
    const users = await db.select().from(t.users).where(arrayOverlaps(t.users.roles, roles));
    if (!users.length) return;
    const devs = await db.select().from(t.devices).where(and(inArray(t.devices.userId, users.map((u) => u.id)), isNotNull(t.devices.pushToken), isNull(t.devices.revokedAt)));
    if (devs.length) {
      const res = await this.push.send(devs.map((d) => d.pushToken!), { title, body, data: link ? { link } : undefined });
      if (res.failed?.length) await db.update(t.devices).set({ pushToken: null }).where(inArray(t.devices.pushToken, res.failed)); // unregistered tokens
    }
    if (email) {
      const to = users.filter((u) => u.email && u.roles.some((r) => ['director', 'planner', 'operations', 'fleet', 'accounts'].includes(r))).map((u) => u.email!);
      if (to.length) await this.mail.send({ to, subject: title, text: `${body}${link ? `\n\nOpen: ${link}` : ''}` });
    }
  }

  /** In-app notification + push to a driver's phone(s) (hand-over done, trip assigned). Drivers without the app get SMS elsewhere. */
  async pushToDriver(driverId: string, title: string, body: string, link?: string) {
    try {
      const us = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.driverId, driverId));
      if (!us.length) return;
      for (const u of us) await db.insert(t.notifications).values({ id: uid('n'), at: iso(), title, body, link: link ?? null, forRoles: [], forUserId: u.id });
      const devs = await db.select().from(t.devices).where(and(inArray(t.devices.userId, us.map((u) => u.id)), isNotNull(t.devices.pushToken), isNull(t.devices.revokedAt)));
      if (!devs.length) return;
      const res = await this.push.send(devs.map((d) => d.pushToken!), { title, body, data: link ? { link } : undefined });
      if (res.failed?.length) await db.update(t.devices).set({ pushToken: null }).where(inArray(t.devices.pushToken, res.failed));
    } catch (e) { this.log.warn(`driver push failed: ${(e as Error).message}`); }
  }

  /** Direct SMS to a driver (e.g. reply to an SMS check-in, or "you are loaded, go"). */
  async smsTo(phone: string, text: string) { try { await this.sms.send(phone, text); } catch (e) { this.log.warn(`sms failed: ${(e as Error).message}`); } }
}
