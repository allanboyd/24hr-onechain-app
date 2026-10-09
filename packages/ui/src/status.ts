// Status → badge tone mapping, from docs/design-system/tokens.json "status".
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
const map: Record<string, Tone> = {
  Draft: 'neutral', Submitted: 'info', Approved: 'success', Returned: 'warning', Rejected: 'danger',
  Planned: 'neutral', Pending: 'neutral', Loaded: 'info', Dispatched: 'info', 'In transit': 'info', 'At border': 'warning',
  Arrived: 'success', Acknowledged: 'success', Delayed: 'danger', Cancelled: 'neutral',
  Paid: 'success', 'Part-paid': 'warning', Unpaid: 'danger', 'Pending approval': 'warning',
  Fast: 'success', Normal: 'info', Slow: 'warning', Stagnant: 'danger',
  Early: 'info', 'On time': 'success', Late: 'danger',
  Synced: 'success', Waiting: 'neutral', Assigned: 'info',
};
export const toneOf = (s: string): Tone => map[s] ?? 'neutral';
export const velocityGlyph: Record<string, string> = { Fast: '▲', Normal: '●', Slow: '▼', Stagnant: '■' };
