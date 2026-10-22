// Run against a visible Playwright page. All gameplay uses keyboard, mouse, or
// touch events. Evaluation reads runtime state; it never changes simulation,
// input methods, renderer snapshots, targets, or hit results.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const state = page => page.evaluate(() => {
  const r = window.__ssRuntime;
  const b = r?.latestSnapshot?.bibyeBallista;
  return { player: r?.localAuth, ballista: b, yaw: r?.input.yaw, pitch: r?.input.pitch,
    enabled: r?.input.enabled, pointer: !!document.pointerLockElement,
    action: r?.world?.biByeLlista?.activeActionName,
    camera: r?.camera?.position.toArray(), cameraView: r?.siegeView,
    authored: r?.world?.biByeLlista?.authoredModel?.name,
    projectiles: r?.latestSnapshot?.bibyeProjectiles,
    players: r?.latestSnapshot?.players,
    hud: r?.hud?.ballistaPanel?.textContent,
    now: r?.socket.serverNow(), local: r?.socket.playingLocally };
});
export async function waitFor(page, check, label, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const s = await state(page);
    if (check(s)) return s;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label}: ${JSON.stringify(await state(page))}`);
}
export async function focus(page) {
  await page.bringToFront();
  if (!(await state(page)).pointer) await page.locator('#game-canvas canvas').click({ position: { x: 600, y: 320 } });
  await waitFor(page, s => s.enabled, 'arena input focus');
}
export async function aim(page, yaw, pitch = 0) {
  await page.mouse.move(600, 330);
  return aimFrom(page, yaw, pitch, 600, 330);
}
async function aimFrom(page, yaw, pitch, x, y) {
  const look = await page.evaluate(() => window.__ssRuntime.input.look);
  for (let i = 0; i < 16; i++) {
    const s = await state(page);
    const a = Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw));
    const p = pitch - s.pitch;
    if (Math.abs(a) < .003 && Math.abs(p) < .003) return;
    x += Math.max(-300, Math.min(300, -a / (.00235 * look.mouse)));
    y += Math.max(-200, Math.min(200, -p / (.0021 * look.mouse * (look.invertY ? -1 : 1))));
    await page.mouse.move(x, y);
    await page.waitForTimeout(35);
  }
  throw new Error('Mouse aim did not converge');
}
export async function walkTo(page, x, z) {
  const started = Date.now();
  try {
    for (;;) {
      const s = await state(page);
      const dx = x - s.player.position.x, dz = z - s.player.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < .4) return;
      if (Date.now() - started > 15000) throw new Error(`Route stalled toward ${x},${z}: ${JSON.stringify(s.player.position)}`);
      await aim(page, Math.atan2(-dx, -dz));
      await page.keyboard.down('w');
      if (distance > 2) await page.keyboard.down('Shift');
      await page.waitForTimeout(Math.min(300, distance < 1 ? 65 : 180));
      await page.keyboard.up('w');
      await page.keyboard.up('Shift');
    }
  } finally { await page.keyboard.up('w'); await page.keyboard.up('Shift'); }
}
export async function approach(page) {
  await focus(page);
  for (const [x,z] of [[0,-4.5],[13.8,-4.5],[13.8,-10],[9,-12.0]]) await walkTo(page,x,z);
  return state(page);
}
export async function capture(page, filename, folder = new URL('../output/playwright/bi-bye-v32', import.meta.url).pathname) {
  await mkdir(folder,{recursive:true});
  const cdp = await page.context().newCDPSession(page);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await cdp.detach();
  await writeFile(path.join(folder,filename), Buffer.from(shot.data, 'base64'));
  const s = await state(page);
  await writeFile(path.join(folder,filename.replace('.png','.json')),JSON.stringify(s,null,2));
  return s;
}
export async function startPractice(page, url = 'http://127.0.0.1:3228/?debug') {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#loading-veil')?.classList.contains('done'));
  const skip = page.locator('[data-tutorial-onboarding-skip]');
  if(await skip.isVisible()) await skip.click();
  await page.locator('#player-name').fill('Siege Integration');
  await page.locator('#solo-button').click();
  await page.locator('#practice-mode').click();
  await waitFor(page,s=>s.authored,'authored model loaded');
}
export async function mobileAndViews(page) {
  await page.keyboard.press('t');
  const start = await waitFor(page,s=>s.player.operatingBallistaId,'mounted');
  await page.waitForTimeout(700);
  await capture(page,'01-mobile-third.png');
  await page.keyboard.down('w'); await page.waitForTimeout(650); await page.keyboard.up('w');
  let s=await state(page);
  assert.ok(s.ballista.x > start.ballista.x + 1,'forward travel');
  await page.keyboard.down('s'); await page.waitForTimeout(700); await page.keyboard.up('s');
  await page.keyboard.down('w'); await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d'); await page.keyboard.up('w');
  s=await state(page);
  assert.ok(s.ballista.heading < start.ballista.heading - .1,'right steering');
  await page.keyboard.down('s'); await page.keyboard.down('d'); await page.waitForTimeout(800); await page.keyboard.up('d'); await page.keyboard.up('s');
  await page.keyboard.press('z'); await page.waitForTimeout(700);
  s=await capture(page,'02-mobile-sight.png');
  assert.equal(s.cameraView,'sight');
  await page.keyboard.press('f');
  await waitFor(page,s=>s.action==='09_BiBye_Mobile_Shot1_Fire','mobile fire animation');
  await page.waitForTimeout(260);
  s=await capture(page,'03-mobile-recoil.png');
  await waitFor(page,s=>s.ballista.smallBoltReady,'mobile recock');
  await page.keyboard.press('z'); await page.waitForTimeout(700);
  return state(page);
}

export async function runBiByeGameplay(page, url) {
  await startPractice(page, url);
  await approach(page);
  await mobileAndViews(page);
  await page.keyboard.press('b');
  await waitFor(page, s => s.ballista.mode === 'DEPLOYED', 'deployment');
  const heading = (await state(page)).ballista.heading;
  await page.keyboard.press('z');
  for (const [name, yaw, pitch] of [['left-down', heading - Math.PI/4, -.15], ['right-up', heading + Math.PI/4, .35]]) {
    await aim(page, yaw, pitch);
    await page.waitForTimeout(250);
    await capture(page, 'envelope-' + name + '.png');
  }
  await aim(page, heading, 0);
  await page.keyboard.press('f');
  await waitFor(page, s => s.ballista.state === 'SPENT', 'both releases');
  await capture(page, 'volley-recovery.png');
  await waitFor(page, s => s.ballista.state === 'RELOADING', 'mechanical reload');
  await waitFor(page, s => s.ballista.state === 'LOADED', 'ready after reload');
  await page.keyboard.press('b');
  await waitFor(page, s => s.ballista.mode === 'MOBILE', 'retraction');
  await page.keyboard.press('t');
  await waitFor(page, s => !s.player.operatingBallistaId, 'leave machine');
  await page.waitForTimeout(500);
  const before = (await state(page)).player.position;
  await page.keyboard.down('s'); await page.waitForTimeout(250); await page.keyboard.up('s');
  const after = (await state(page)).player.position;
  assert.ok(Math.hypot(after.x-before.x, after.z-before.z) > .25, 'normal movement restored');
  return { asset: (await state(page)).authored, host: url, local: (await state(page)).local, operator: (await state(page)).ballista.operatorId, inputLoop: 'passed' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const result = await runBiByeGameplay(page, process.env.BALLISTA_TEST_URL || 'http://127.0.0.1:3228/?debug');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
