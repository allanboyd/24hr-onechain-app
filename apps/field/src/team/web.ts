// Deep links into the office web app for work that needs a big screen (new PO, new period plan, master data).
import { WEB_URL } from '../lib';
import { co, shortName } from './company.svelte';
export function webLink(path = '/') {
  const code = co.active ? shortName(co.active) : 'group';
  const coParam = code === 'Kivu' ? 'KVD' : code;
  const sep = path.includes('?') ? '&' : '?';
  return `${WEB_URL.replace(/\/?$/, '/')}#${path}${sep}co=${coParam}`;
}
