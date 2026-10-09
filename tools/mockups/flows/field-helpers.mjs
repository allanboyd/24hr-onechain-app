// Helpers shared by the field-app flows (D, E).
import { shot as rawShot } from '../snap.mjs';
export const wait = (s, ms = 500) => s.page.waitForTimeout(ms);
/** Wait for toasts to clear, then take a viewport shot (map + sheet layout is fixed-position). */
export async function shot(s, name, title, notes, { keepToast = false } = {}) {
  await s.page.mouse.move(1, 1);
  if (!keepToast) await s.page.waitForSelector('.toast', { state: 'detached', timeout: 5000 }).catch(() => {});
  await wait(s, 300);
  await rawShot(s, name, title, notes, { fullPage: false });
}
/** Drag the slide-to-confirm knob all the way (inside `scope`, default the page). */
export async function slide(s, scope = s.page) {
  const knob = scope.locator('.knob').last();
  await knob.scrollIntoViewIfNeeded();
  const kb = await knob.boundingBox();
  const tb = await knob.locator('xpath=..').boundingBox();
  await s.page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await s.page.mouse.down();
  await s.page.mouse.move(tb.x + tb.width - 10, kb.y + kb.height / 2, { steps: 12 });
  await s.page.mouse.up();
  await wait(s, 400);
}
export async function sign(s) {
  const c = s.page.locator('canvas').first();
  await c.scrollIntoViewIfNeeded(); await wait(s, 300);
  const b = await c.boundingBox();
  await s.page.mouse.move(b.x + 30, b.y + b.height * 0.6); await s.page.mouse.down();
  for (let i = 0; i <= 24; i++) await s.page.mouse.move(b.x + 30 + i * 11, b.y + b.height * (0.6 - 0.3 * Math.sin(i / 3)), { steps: 2 });
  await s.page.mouse.up(); await wait(s, 200);
}
/** Switch the signed-in demo user in the same browser session (keeps the mock data). */
export async function as(s, user) { await s.page.evaluate((u) => localStorage.setItem('btw-user', u), user); await s.page.reload(); await wait(s, 1200); s.user = user; }
