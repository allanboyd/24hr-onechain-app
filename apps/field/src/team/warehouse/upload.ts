// Receipt photos from the phone (docs/14 B-01): shrink, then files.upload (works in the browser PWA and the native shell).
import { files } from '@btw/api';

export async function uploadReceipt(file: File, max = 1280): Promise<{ id: string; url: string; name: string }> {
  let dataUrl = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(file); });
  if (file.type.startsWith('image/')) {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = dataUrl; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    dataUrl = c.toDataURL('image/jpeg', 0.75);
  }
  const f = await files.upload({ kind: 'photo', name: file.name, contentType: dataUrl.slice(5, dataUrl.indexOf(';')), dataBase64: dataUrl.replace(/^data:[^,]+,/, '') });
  return { id: f.id, url: f.url, name: file.name };
}
