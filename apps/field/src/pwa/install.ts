// Install page (install.html, its own small entry): QR code of the app link for a PC screen, the Install button where the
// browser offers it, and the iPhone / Android steps. Same folder as the app, so the QR opens this app (docs/23 §6).
import '@btw/ui/base.css';
import './install.css';
import qrcode from 'qrcode-generator';
import { isIos, isStandalone } from './index';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const appUrl = new URL('./', location.href).href;
const phone = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const root = document.getElementById('install')!;

function qrSvg(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

root.innerHTML = `
  <section class="card inst">
    <img class="logo" src="./icons/icon-192.png" alt="" width="56" height="56" />
    <h1>Install the BTW Team app</h1>
    <p class="muted">Trucks, loading, receiving and stock on your phone. It works with a weak signal and updates itself.</p>
    ${isStandalone() ? `<p class="done" role="status">The app is already installed on this device.</p>` : ''}
    ${phone ? '' : `
      <figure class="qr"><div role="img" aria-label="QR code for ${esc(appUrl)}">${qrSvg(appUrl)}</div><figcaption>Scan with your phone camera, then follow the steps on the phone.</figcaption></figure>`}
    <div class="actions">
      <button type="button" class="btn btn-primary btn-lg" id="install-btn" hidden>Install the app</button>
      <a class="btn btn-secondary btn-lg" href="./">Open the app</a>
    </div>
    <div class="steps">
      <section ${isIos() ? 'class="mine"' : ''}>
        <h2>iPhone (Safari)</h2>
        <ol><li>Open this page in <b>Safari</b>.</li><li>Tap <b>Share</b> (the square with an arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
      </section>
      <section ${!isIos() && phone ? 'class="mine"' : ''}>
        <h2>Android (Chrome)</h2>
        <ol><li>Tap <b>Install the app</b> above, or the browser menu <b>⋮</b>.</li><li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li><li>Open <b>BTW Team</b> from your home screen.</li></ol>
      </section>
    </div>
    <p class="link small">App link: <a href="./">${esc(appUrl)}</a></p>
  </section>`;

let prompt: InstallPrompt | null = null;
const btn = document.getElementById('install-btn') as HTMLButtonElement;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e as InstallPrompt; btn.hidden = false; });
addEventListener('appinstalled', () => { btn.hidden = true; });
btn.addEventListener('click', async () => {
  if (!prompt) return;
  await prompt.prompt();
  await prompt.userChoice;
  prompt = null;
  btn.hidden = true;
});
