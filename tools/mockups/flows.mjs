// The mockup flows: one script per area. Key = screenshot prefix and gallery section.
export const FLOWS = [
  { key: 'A', file: 'a-procurement.mjs', app: 'web', title: 'Shell, dashboard, plans & purchase orders', blurb: 'Planner and director: plan → approval with signature → PO letter.' },
  { key: 'B', file: 'b-logistics.mjs', app: 'web', title: 'Loading, shipments & tracking', blurb: 'Waiting list per loading point, loading, multi-leg shipments, checkpoint tracking map.' },
  { key: 'C', file: 'c-stock-finance.mjs', app: 'web', title: 'Stock, sales, finance & analytics', blurb: 'Inventory (§7.5), sales, trip costs and landing cost, sales velocity, master data.' },
  { key: 'D', file: 'd-driver.mjs', app: 'mobile', title: 'Driver app', blurb: 'Map-first, one action: slide to check in at the next checkpoint, undo, report a problem, offline queue.' },
  { key: 'E', file: 'e-giver-receiver.mjs', app: 'mobile', title: 'Loading point & receiver', blurb: 'Hand the truck over at the loading point; receive and sign at Asie/Zonas; send a transfer leg on.' },
  { key: 'F', file: 'f-brand.mjs', app: 'web', title: 'Brand & logo variants', blurb: 'Logo variations for designs, app icons and splash screens. Derived colourways need client approval.' },
];
