// What every export carries besides the table: the panel's title, metric definition, unit, period, filters and freshness.
export type Rows = (string | number)[][];
export interface ExportMeta {
  title: string; subtitle?: string; definition?: string; unit?: string; period?: string; filters?: string;
  /** "Updated 25 Oct 2026, 09:40" */ freshness?: string; owner?: string;
}
export function metaLines(m: ExportMeta, at = new Date()): string[] {
  return [
    m.subtitle,
    m.definition && `Definition: ${m.definition}`,
    m.unit && `Unit: ${m.unit}`,
    m.period && `Period: ${m.period}`,
    m.filters && `Filters: ${m.filters}`,
    m.freshness && `Data: ${m.freshness}`,
    m.owner && `Data owner: ${m.owner}`,
    `Exported: ${at.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
  ].filter((x): x is string => !!x);
}
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
