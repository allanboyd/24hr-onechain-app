// docs/14 (workstream B) screens in one lazy chunk: one dynamic import in routes.ts instead of six keeps the web entry small.
export { default as WarehouseStock } from './WarehouseStock.svelte';
export { default as WarehouseExpenses } from './WarehouseExpenses.svelte';
export { default as Reexports } from './Reexports.svelte';
export { default as TransportFees } from './TransportFees.svelte';
export { default as SellingPrices } from './SellingPrices.svelte';
export { default as Performance } from './Performance.svelte';
