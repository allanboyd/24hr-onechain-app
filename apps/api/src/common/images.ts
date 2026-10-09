/** Accept a signature/photo reference only if it is a stored file id or a complete PNG/JPEG data URL (≤ 2 MB). */
export function isUsableImage(src: unknown): boolean {
  if (typeof src !== 'string' || !src) return false;
  if (/^[a-f0-9]{40}\.[a-z0-9]{2,5}$/.test(src) || /^file-[\w-]+$/.test(src)) return true; // uploaded via /files
  const m = src.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return false;
  const b = Buffer.from(m[2], 'base64');
  if (b.length < 67 || b.length > 2 * 1024 * 1024) return false;
  if (m[1] === 'png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.includes(Buffer.from('IEND'));
  return b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
}
