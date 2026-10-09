// D — Driver app (MA-02, MA-06, MA-08, TR-01/04, §17.5). Map-first, one sheet, one slide action.
import { open, finish } from '../snap.mjs';
import { shot, slide, wait, as } from './field-helpers.mjs';
const out = process.argv[2];

// Sign in: phone → PIN
let s = await open({ app: 'field', user: '', outDir: out });
await shot(s, 'D01-field-login-phone', 'Sign in · phone number', 'Bolt-style two-step sign-in: phone number first; demo accounts listed (PIN 1234). Native build adds biometric unlock (MA-08).');
await s.page.getByRole('button', { name: /Peter Otieno/ }).click(); await wait(s);
for (const d of ['1', '2', '3']) await s.page.getByRole('button', { name: d, exact: true }).click();
await shot(s, 'D02-field-login-pin', 'Sign in · 4-digit PIN', 'Big PIN pad, one-handed. Wrong PIN shakes and clears; the role decides which single screen opens next.');
await s.page.getByRole('button', { name: '4', exact: true }).click(); await wait(s, 2500);
await shot(s, 'D03-field-driver-home', 'Driver · trip on the map', 'Full-screen map of the route with checkpoints (green = passed, orange = next) and the truck; one sheet with the next checkpoint, ETA badge and ONE slide action (TR-04, MA-02).');

// Slide → 5 s undo window → recorded
await slide(s);
await shot(s, 'D04-field-driver-undo', 'Driver · just slid: 5-second undo', 'A check-in waits 5 s with a big Undo, so a mis-slide in a moving cab is never recorded.', { keepToast: true });
await wait(s, 6000);
await shot(s, 'D05-field-driver-at-checkpoint', 'Driver · at the checkpoint', 'Arrival recorded; the same slide now says "I\'m leaving …". Stop timer shows how long the truck has been here vs the usual stop.');

// Problem in two taps
await s.page.getByRole('button', { name: /^Problem/ }).click(); await wait(s);
await s.page.getByRole('button', { name: 'Breakdown' }).click();
await s.page.getByLabel(/Anything to add/).fill('Waiting for a mechanic from Mbarara');
await shot(s, 'D06-field-driver-problem', 'Driver · report a problem', 'Four big reasons, optional note and new arrival time; sent to fleet follow-up and directors (§17.5, TR-05).');
await s.page.getByRole('button', { name: 'Tell the office' }).click(); await wait(s, 800);
await shot(s, 'D07-field-driver-issue-open', 'Driver · problem open', 'While a problem is open the main action becomes "Fixed — moving again"; the office sees the issue and the ETA uses the new arrival time.');
await s.page.getByRole('button', { name: /Fixed — moving again/ }).click(); await wait(s, 800);

// Offline: the slide still works; the pill shows what is waiting
await s.page.getByRole('button', { name: 'Menu' }).click(); await wait(s);
await s.page.locator('label', { hasText: 'Work offline' }).locator('input').check(); await wait(s);
await s.page.getByRole('button', { name: 'Close' }).last().click(); await wait(s);
await slide(s); await wait(s, 6000);
await shot(s, 'D08-field-driver-offline', 'Driver · offline, saved on the phone', 'No signal: the check-in is stored on the phone (idempotency key) and shown immediately; the top pill says "Offline · 1 saved" (MA-06).');
await s.page.getByRole('button', { name: 'Menu' }).click(); await wait(s);
await shot(s, 'D09-field-driver-menu', 'Menu · waiting to send, SMS fallback', 'Everything that is not the main task: profile, items waiting to send (send now / remove), SMS fallback code for no-data areas, language, theme, sign out.');
await finish(s);

// Border wait (second driver) + dark mode
s = await open({ app: 'field', user: 'u-drv2', outDir: out });
await wait(s, 2000);
await shot(s, 'D10-field-driver-border-wait', 'Driver · waiting at a border', 'UBA 789C at Elegu/Nimule: border-wait timer against the usual dwell (red when well over), open problem from the seed, ETA late.');
await finish(s);
s = await open({ app: 'field', user: 'u-drv1', outDir: out, theme: 'dark' });
await wait(s, 2000);
await shot(s, 'D11-field-driver-dark', 'Driver · dark mode', 'Same screen at night: dimmed map tiles, orange primary, high-contrast sheet.');
await finish(s);

// Office roles are sent to the web app
s = await open({ app: 'field', user: 'u-dir', outDir: out });
await shot(s, 'D12-field-web-only', 'Office roles → web app', 'Directors, planners and accounts are not in the phone app; they get a link to the web app (works on phones too).');
await finish(s);
