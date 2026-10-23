// Run with playwright-cli run-code --filename. Uses ordinary keyboard, mouse or touch.
// Evaluations only observe gameplay state; the test never edits simulation or hit results.
async page => {
const state = page => page.evaluate(() => {
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
async function waitFor(page, check, label, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const s = await state(page);
    if (check(s)) return s;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label}: ${JSON.stringify(await state(page))}`);
}
async function focus(page) {
  await page.bringToFront();
  if (!(await state(page)).pointer) await page.locator('#game-canvas canvas').click({ position: { x: 600, y: 320 } });
  await waitFor(page, s => s.enabled, 'arena input focus');
}
async function aim(page, yaw, pitch = 0) {
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
async function walkTo(page, x, z) {
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
async function approach(page) {
  await focus(page);
  for (const [x,z] of [[0,-4.5],[13.8,-4.5],[13.8,-10],[9,-11.5]]) await walkTo(page,x,z);
  return state(page);
}

await page.reload();
await page.waitForFunction(()=>document.querySelector('#loading-veil')?.classList.contains('done'));
const skip=page.locator('[data-tutorial-onboarding-skip]');if(await skip.isVisible())await skip.click();
await page.locator('#player-name').fill('Independent Weapons');await page.locator('#solo-button').click();await page.locator('#practice-mode').click();
await waitFor(page,s=>s.authored,'asset');await approach(page);await page.keyboard.press('t');
await waitFor(page,s=>s.player.operatingBallistaId,'mount');
const baseline=await state(page),backward=baseline.ballista.heading+Math.PI;
await aim(page,backward,.08);await waitFor(page,s=>Math.abs(Math.atan2(Math.sin(s.ballista.upperYaw-backward),Math.cos(s.ballista.upperYaw-backward)))<.02,'backwards upper aim');
await page.keyboard.press('f');await waitFor(page,s=>s.ballista.upperReleasedAt!=null,'independent release');
await page.screenshot({path:'output/playwright/bibye-independent/backward-upper.png'});
await page.keyboard.down('s');await page.keyboard.down('d');await page.waitForTimeout(600);await page.keyboard.up('d');await page.keyboard.up('s');
const reversed=await state(page);
await page.keyboard.press('b');await waitFor(page,s=>s.ballista.mode==='DEPLOYED','deploy');
await waitFor(page,s=>s.ballista.smallBoltReady,'recock');
await page.keyboard.press('f');await waitFor(page,s=>s.ballista.coupling==='ALIGNING','align');
await page.screenshot({path:'output/playwright/bibye-independent/aligning.png'});
await page.keyboard.press('x');await waitFor(page,s=>s.ballista.weaponFocus==='UPPER'&&s.ballista.coupling==='INDEPENDENT','cancel');
const cancelled=await state(page);
await page.keyboard.press('x');await waitFor(page,s=>s.ballista.weaponFocus==='MAIN','main focus');
await page.keyboard.press('f');await waitFor(page,s=>s.ballista.coupling==='FIRING','coupled commit');
const committed=await state(page);
await page.waitForTimeout(750);const discharged=await state(page);
await page.screenshot({path:'output/playwright/bibye-independent/coupled-release.png'});
await page.keyboard.press('x');await waitFor(page,s=>s.ballista.weaponFocus==='UPPER','independent focus');
await waitFor(page,s=>s.ballista.smallBoltReady,'upper recock during heavy reload');
await page.keyboard.press('f');await page.waitForTimeout(300);const concurrent=await state(page);
await page.screenshot({path:'output/playwright/bibye-independent/upper-during-reload.png'});
await page.keyboard.press('z');await page.waitForTimeout(400);await page.screenshot({path:'output/playwright/bibye-independent/upper-sight.png'});
await page.keyboard.press('z');
await waitFor(page,s=>s.ballista.mainBoltLoaded,'heavy reload ready');const complete=await state(page);
return {baseline,reversed,cancelled,committed,discharged,concurrent,complete};

}