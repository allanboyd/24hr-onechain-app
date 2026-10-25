// Category labels for narrow charts: wrap onto two lines at spaces (Plotly <br>) instead of truncating the distinguishing half.
export function wrapLabel(c: string, n = 16): string {
  if (c.length <= n) return c;
  const words = c.split(' ');
  let a = '';
  while (words.length && (a ? a.length + 1 : 0) + words[0].length <= n) a = a ? `${a} ${words.shift()}` : words.shift()!;
  if (!a) return `${c.slice(0, n - 1)}…`;
  const b = words.join(' ');
  return b ? `${a}<br>${b.length > n ? `${b.slice(0, n - 1)}…` : b}` : a;
}
