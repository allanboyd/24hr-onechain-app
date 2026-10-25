// Receipt / document photos from the web (docs/14 B-01): shrink large images in the browser, then files.upload.
import { files } from '@btw/api';

export async function uploadPhoto(file: File, max = 1400): Promise<{ id: string; url: string; name: string }> {
  let dataUrl = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(file); });
  let type = file.type || 'application/octet-stream';
  if (type.startsWith('image/') && file.size > 250_000) {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = dataUrl; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    dataUrl = c.toDataURL('image/jpeg', 0.8); type = 'image/jpeg';
  }
  const kind = type === 'application/pdf' ? 'pdf' : 'photo';
  const f = await files.upload({ kind, name: file.name, contentType: type, dataBase64: dataUrl.replace(/^data:[^,]+,/, '') });
  return { id: f.id, url: f.url, name: file.name };
}
