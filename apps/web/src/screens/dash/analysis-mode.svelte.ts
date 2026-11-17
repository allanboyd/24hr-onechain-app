// Advanced analysis (control room report). Off: the working cards. On: the longer reports from the
// control room — profit bridge notes, stock run-out, and the full analysis under each tab.
const KEY = 'btw-advanced-analysis';

export const analysisMode = $state({ on: false });

export function initAnalysisMode() {
  try { analysisMode.on = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
}

export function setAdvanced(on: boolean) {
  analysisMode.on = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
}
