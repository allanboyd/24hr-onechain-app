import type { Config } from '../config/config';

export const INTEGRATION_STATUS = Symbol('INTEGRATION_STATUS');
export type IntegrationStatus = Record<'sms' | 'mail' | 'push' | 'files' | 'pdf' | 'routing', string>;

/** Which adapter each port uses, from config. Shown at GET /v1/dev/integrations and logged at boot. */
export function integrationStatus(cfg: Config): IntegrationStatus {
  return {
    sms: cfg.AT_API_KEY ? `africastalking (${cfg.AT_USERNAME === 'sandbox' ? 'sandbox' : 'live'})` : 'stand-in: dev inbox (/v1/dev/sms)',
    mail: cfg.SMTP_URL ? `smtp (${cfg.SMTP_URL.replace(/\/\/[^@]*@/, '//***@')})` : 'stand-in: log (/v1/dev/mail)',
    push: cfg.FCM_SERVICE_ACCOUNT ? 'fcm (HTTP v1)' : 'stand-in: dev store (/v1/dev/push)',
    files: cfg.FILES_DRIVER === 's3' ? `s3 (${cfg.S3_ENDPOINT}/${cfg.S3_BUCKET})` : `local disk (${cfg.FILES_DIR})`,
    pdf: 'typst (in-process)',
    routing: `osrm (${cfg.OSRM_URL}) with straight-line fallback`,
  };
}
