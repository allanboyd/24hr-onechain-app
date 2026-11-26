// V3-13: the Settings & alerts workspace. One list of sections: the left menu, the address (#/system/<key>), who may
// open each one, and the older addresses that now land here. Only sections that work today (no placeholders).
import type { User } from '@btw/api';
import { canAny, type Feature } from '../../lib/features';
import Bell from '@lucide/svelte/icons/bell';
import BellRing from '@lucide/svelte/icons/bell-ring';
import ShieldCheck from '@lucide/svelte/icons/shield-check';
import UsersIcon from '@lucide/svelte/icons/users';
import ScrollText from '@lucide/svelte/icons/scroll-text';
import PlugZap from '@lucide/svelte/icons/plug-zap';

export type SectionKey = 'alerts' | 'notifications' | 'approvals' | 'users' | 'audit' | 'integrations';
export interface Section {
  key: SectionKey; label: string; group: 'Alerts' | 'Rules' | 'People & system'; icon: any;
  /** who opens it: a feature, or a rule on the person; none = every signed-in person */
  feature?: Feature | Feature[]; allow?: (u: User) => boolean;
  load: () => Promise<{ default: any }>;
}
const dirOrAdmin = (u: User) => u.roles.includes('director') || u.roles.includes('admin');
export const SECTIONS: Section[] = [
  { key: 'alerts', label: 'Alerts', group: 'Alerts', icon: Bell, load: () => import('../Notifications.svelte') },
  { key: 'notifications', label: 'My notifications', group: 'Alerts', icon: BellRing, load: () => import('./MyNotifications.svelte') },
  { key: 'approvals', label: 'Approvals', group: 'Rules', icon: ShieldCheck, allow: dirOrAdmin, load: () => import('./Approvals.svelte') },
  { key: 'users', label: 'Users & access', group: 'People & system', icon: UsersIcon, feature: 'users', load: () => import('../Users.svelte') },
  { key: 'audit', label: 'Audit log', group: 'People & system', icon: ScrollText, feature: 'audit', load: () => import('../Audit.svelte') },
  { key: 'integrations', label: 'Integrations', group: 'People & system', icon: PlugZap, feature: 'integrations', load: () => import('../Integrations.svelte') },
];
export const GROUPS = ['Alerts', 'Rules', 'People & system'] as const;
export const sectionsFor = (u: User | null) => (u ? SECTIONS.filter((s) => (!s.feature || canAny(u, s.feature)) && (!s.allow || s.allow(u))) : []);
/** older addresses that open a section of the workspace (links in notifications, dashboards and emails keep working) */
export const OLD_PATHS: Record<string, SectionKey> = { notifications: 'alerts', users: 'users', audit: 'audit', integrations: 'integrations' };
/** the section a path shows: #/system/<key>, an older address, or the first one this person may open */
export function sectionOf(path: string, u: User | null): Section | undefined {
  const mine = sectionsFor(u);
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const key = seg[0] === 'system' ? (seg[1] === 'settings' ? (mine.some((s) => s.key === 'approvals') ? 'approvals' : 'notifications') : seg[1]) : OLD_PATHS[seg[0]];
  return mine.find((s) => s.key === key) ?? (seg[0] === 'system' && !seg[1] ? mine[0] : undefined);
}
