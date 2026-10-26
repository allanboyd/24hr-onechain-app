// Integration ports. Business modules depend ONLY on these interfaces (injected by token);
// apps/api/src/integrations/* provides a real adapter and a local stand-in for each, chosen from config.

export const SMS = Symbol('SMS');
export interface SmsPort {
  /** Send a text (alerts, OTP, driver instructions). Returns provider message id. */
  send(to: string, text: string): Promise<{ id: string; provider: 'africastalking' | 'fake' }>;
}

export const MAIL = Symbol('MAIL');
export interface MailPort {
  send(msg: { to: string | string[]; subject: string; text: string; html?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }): Promise<{ id: string }>;
}

export const PUSH = Symbol('PUSH');
export interface PushPort {
  /** Send to device tokens registered via POST /devices. */
  send(tokens: string[], msg: { title: string; body: string; data?: Record<string, string> }): Promise<{ sent: number; failed: string[] }>;
}

export const FILES = Symbol('FILES');
export interface FilesPort {
  /** `key` starts with the kind: 'photo/…', 'signature/…', 'document/…', 'pdf/…'. Photos/signatures must be images.
   *  Returns a content-addressed id and a signed URL (valid 24 h). */
  put(key: string, body: Buffer, contentType: string): Promise<{ id: string; url: string; size: number }>;
  get(id: string): Promise<{ body: Buffer; contentType: string } | null>;
  /** Fresh signed download URL for a stored id (default 24 h). */
  signedUrl?(id: string, ttlSec?: number): string;
}

export const PDF = Symbol('PDF');
export interface PdfPort {
  /** Render a named template with JSON data (shapes below). */
  render(template: 'po-letter', data: PoLetterData): Promise<Buffer>;
  render(template: 'acknowledgement', data: AckPdfData): Promise<Buffer>;
  render(template: 'po-letter' | 'acknowledgement', data: unknown): Promise<Buffer>;
}

/** The issuing company on a letterhead: code picks the brand kit (packages/ui/src/assets/brand/entities/<code>/);
 *  legal/contact fields come from the entities table (placeholders read "… — to confirm"). */
export interface PdfEntity {
  name: string; code: string; shortName?: string;
  address?: string; addressLines?: string[]; phone?: string; phones?: string[]; email?: string; website?: string;
  logo?: string /* data URL/file id; BTW logo used when omitted and code==='BTW' */;
  kraPin?: string | null; registrationNo?: string | null; registeredOffice?: string | null; tagline?: string; footerLine?: string;
}
/** Data for templates/po-letter.typ (§7.1/§7.2). Dates ISO (rendered DD Month YYYY, EAT). Images as data: URLs or stored file ids. */
export interface PoLetterData {
  entity: PdfEntity;
  date: string;
  ref: string; title: string; version?: number;
  addressedTo: { section?: string; name: string; city: string; country: string };
  instruction?: string;
  currency: string;
  lines: { truckNo: number; brand: string; pack: string; qty: number; price: number }[];
  preparedBy: { name: string; title?: string };
  approvedBy?: { name: string; title?: string; at: string; signature?: string /* data URL or file id */ };
  stamp?: string; // data URL or file id
  /** 'approved' (director stamp, default) or 'issued' (config approvals.purchase_orders = false, and every revision):
   *  the letter then says "ISSUED <date> by <name>" instead of an APPROVED stamp. */
  mode?: 'approved' | 'issued';
  /** 'issued' mode: the block label and stamp text, e.g. "Approved automatically" / "APPROVED AUTOMATICALLY 26 October 2026 · Kabonge". */
  issuedLabel?: string; stampText?: string;
  /** A revision (office update or loading): "Revision 1 of BTW-PO-2026-0002 — updated 26 Oct 2026" and what changed (one line per change). */
  revision?: { n: number; of: string; changes: string[]; kind?: 'updated' | 'revised at loading'; at?: string; reason?: string };
}

/** Data for templates/acknowledgement.typ (AK-03). */
export interface AckPdfData {
  shipmentRef: string; legSeq: number; legCount: number; truckReg: string; driverName?: string;
  from: string; to: string; warehouse: string; receivingCompany: string;
  receivedAt: string; receiverName: string; finalDestination: boolean;
  lines: { brand: string; pack: string; expected: number; received: number; damaged: number; remarks?: string }[];
  signature?: string; photos?: string[]; // data URLs or file ids
  /** The company that owns the goods (the shipment's company). */
  entity?: PdfEntity;
}

export const ROUTING = Symbol('ROUTING');
export interface RoutingPort {
  /** Driving duration/distance between points (seed for checkpoint planned hours). */
  route(points: { lat: number; lng: number }[]): Promise<{ distanceKm: number; hours: number; legs: { distanceKm: number; hours: number }[] }>;
}

/** Inbound driver SMS / USSD, parsed by the integrations module and handed to tracking. */
/** checkpointCode '' means: for 'arrived' → the leg's next checkpoint; for 'departed' → the checkpoint the truck is at.
 *  truckReg '' means: the driver's active truck (looked up by `from`). 'problem' carries `reason`
 *  ('breakdown' | 'border' | 'police' | 'other' or free text) and should open a truck issue (§17.5). */
export interface InboundCheckin { from: string; kind: 'arrived' | 'departed' | 'fixed' | 'offloading' | 'problem'; checkpointCode: string; truckReg: string; raw: string; reason?: string; channel?: 'sms' | 'ussd' }
export const INBOUND_HANDLER = Symbol('INBOUND_HANDLER');
export interface InboundHandler {
  /** Apply an SMS/USSD check-in for the driver's active leg; reply text is sent back to the driver. */
  handleCheckin(c: InboundCheckin): Promise<{ ok: boolean; reply: string }>;
  /** For USSD menus: the driver's active truck and next checkpoint, looked up by phone number. */
  driverStatus(phone: string): Promise<{ truckReg: string; nextCheckpoint: { code: string; name: string } | null; legId: string } | null>;
}

/** Routes the integrations module exposes without a user session (webhooks, signed file links, dev tools).
 *  api-core's global auth guard must skip handlers carrying this metadata key. */
export const IS_PUBLIC_KEY = 'isPublic';
