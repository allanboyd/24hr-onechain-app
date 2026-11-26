// Sidebar open / closed on a desktop (design v3, V3-1b SB-6): full width or an icon rail, remembered on this device.
// Phones keep the slide-in drawer (App.svelte navOpen).
const KEY = 'btw-sidebar-collapsed';
const saved = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
export const sidebar = $state({ collapsed: saved });
export function toggleSidebar() {
  sidebar.collapsed = !sidebar.collapsed;
  try { localStorage.setItem(KEY, sidebar.collapsed ? '1' : '0'); } catch { /* private mode: this visit only */ }
}
