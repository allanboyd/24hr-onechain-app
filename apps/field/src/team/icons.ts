// Section icons (lucide, tree-shaken per icon).
import House from '@lucide/svelte/icons/house';
import Truck from '@lucide/svelte/icons/truck';
import MapIcon from '@lucide/svelte/icons/map';
import FileText from '@lucide/svelte/icons/file-text';
import CalendarRange from '@lucide/svelte/icons/calendar-range';
import Boxes from '@lucide/svelte/icons/boxes';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import Wallet from '@lucide/svelte/icons/wallet';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
import Bell from '@lucide/svelte/icons/bell';
import LayoutGrid from '@lucide/svelte/icons/layout-grid';
import ListOrdered from '@lucide/svelte/icons/list-ordered';
import Container from '@lucide/svelte/icons/container';
import type { SectionId } from './access';

export const ICONS: Record<SectionId, typeof House> = {
  home: House, queue: ListOrdered, fleet: Container, trucks: Truck, tracking: MapIcon, orders: FileText, periods: CalendarRange, stock: Boxes, sales: ShoppingCart,
  money: Wallet, reports: ChartColumn, approvals: ClipboardCheck, notifications: Bell, more: LayoutGrid,
};
/** Tile colours for the home menu (fills only; icons sit on a tinted circle). */
export const TINT: Record<SectionId, string> = {
  home: '#062953', queue: '#B45309', fleet: '#0F766E', trucks: '#1D4FB8', tracking: '#0E7C86', orders: '#062953', periods: '#6D4BC2', stock: '#15703A', sales: '#C2410C',
  money: '#8A5300', reports: '#0F3A6E', approvals: '#B4231B', notifications: '#4A5A70', more: '#4A5A70',
};
