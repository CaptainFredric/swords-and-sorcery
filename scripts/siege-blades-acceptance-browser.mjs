import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_MODULE || '/Users/erendiracisneros/plugins/live-web-observer/node_modules/playwright';
const { chromium } = require(playwrightPath);

const OUT_DIR = resolve('output/playwright/siege-blades');

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });

  page.on('pageerror', err => console.error('Browser page error:', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('Browser console error:', msg.text());
  });

  console.log('1. Loading Castleward client at http://127.0.0.1:3001/?debug ...');
  await page.goto('http://127.0.0.1:3001/?debug', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#loading-veil')?.classList.contains('done'));

  console.log('2. Starting Siege Blades Solo Match (5 rounds) via Menu buttons...');
  await page.locator('#player-name').fill('Champion Aden');
  await page.locator('#siege-blades-button').click();
  await page.waitForSelector('#breakthrough-play-bots', { state: 'visible' });
  // Select MATCH format to reveal match rounds
  const matchChip = page.locator('[data-siege-format="MATCH"]');
  if (await matchChip.isVisible()) {
    await matchChip.click();
  }
  const round5Chip = page.locator('#siege-rounds [data-siege-rounds="5"]');
  await round5Chip.click();
  await page.locator('#breakthrough-play-bots').click();

  console.log('3. Waiting for Round 1 Siege Machine Selection dialog...');
  await page.waitForSelector('.sb-machine-picker:not([hidden])', { timeout: 10000 });

  // Verify elements in selection overlay
  const cards = await page.$$('.sb-draft-card');
  assert.equal(cards.length, 3, 'Must render exactly 3 machine cards');

  const names = await page.$$eval('.sb-draft-card strong', els => els.map(e => e.textContent.trim()));
  assert.deepEqual(names, ['SO-FIST-ICATION', 'BI-BYE-LLISTA', 'FIGHT-AND-FLIGHT']);

  const roundNum = await page.$eval('[data-sb-draft-round]', el => el.textContent.trim());
  assert.equal(roundNum, '1', 'Must be Round 1');

  // Verify images loaded
  const imgSources = await page.$$eval('.sb-draft-img', imgs => imgs.map(i => i.getAttribute('src')));
  assert.ok(imgSources.every(src => src && src.includes('/client/assets/props/siege-cards/')), 'Cards must point to rendered 3D preview images');

  console.log('Saving desktop selection screenshot...');
  const desktopDraftShot = await page.screenshot({ fullPage: false });
  await writeFile(resolve(OUT_DIR, '01-draft-desktop.png'), desktopDraftShot);

  console.log('4. Testing keyboard selection (pressing "3" for Fight-and-Flight)...');
  await page.keyboard.press('3');
  await page.waitForTimeout(200);

  const selectedPick = await page.$eval('.sb-draft-card.selected', el => el.dataset.siegePick);
  assert.equal(selectedPick, 'fight-and-flight', 'Card 3 (Fight-and-Flight) must be selected');

  const statusText = await page.$eval('[data-sb-draft-status]', el => el.textContent.trim());
  assert.ok(statusText.includes('FIGHT-AND-FLIGHT'), 'Status text must confirm selection');

  const selectedShot = await page.screenshot({ fullPage: false });
  await writeFile(resolve(OUT_DIR, '02-draft-selected.png'), selectedShot);

  console.log('5. Testing Mobile Landscape resolution (844x390)...');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);

  // Check no overflow and cards are all in view
  const mobileCardsVisible = await page.$$eval('.sb-draft-card', els => {
    return els.map(e => {
      const rect = e.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= 390;
    });
  });
  assert.ok(mobileCardsVisible.every(Boolean), 'All 3 cards must be visible and fit in 390px height');

  const mobileShot = await page.screenshot({ fullPage: false });
  await writeFile(resolve(OUT_DIR, '03-draft-mobile-landscape.png'), mobileShot);

  // Restore desktop resolution
  await page.setViewportSize({ width: 1280, height: 800 });

  console.log('6. Waiting for selection timer to expire and deployment to occur...');
  // First ensure selection countdown is active
  await page.waitForFunction(() => {
    const s = window.__ssRuntime?.latestSnapshot?.siegeBlades;
    return Number.isFinite(s?.selectionEndsAt);
  });
  // Then wait for countdown to finish and fleet to deploy
  await page.waitForFunction(() => {
    const s = window.__ssRuntime?.latestSnapshot;
    return s?.mode === 'SIEGE_BLADES' &&
      s.siegeBlades &&
      !Number.isFinite(s.siegeBlades.selectionEndsAt) &&
      Array.isArray(s.machines) &&
      s.machines.length >= 2;
  }, { timeout: 15000 });

  await page.waitForTimeout(600);

  console.log('7. Verifying deployed machine and rendering...');
  const machineState = await page.evaluate(() => {
    const r = window.__ssRuntime;
    const s = r.latestSnapshot;
    const localId = r.localAuth?.id;
    const myMachine = (s.machines || []).find(m => m.operatorId === localId);
    const enemyMachine = (s.machines || []).find(m => m.operatorId !== localId);

    // Check renderer class
    const myRenderer = r.fleetRenderer?.getRenderer(myMachine?.id);
    const enemyRenderer = r.fleetRenderer?.getRenderer(enemyMachine?.id);

    return {
      myMachineId: myMachine?.id,
      myKind: myMachine?.class || myMachine?.kind,
      enemyKind: enemyMachine?.class || enemyMachine?.kind,
      myRendererClass: myRenderer?.constructor?.name,
      enemyRendererClass: enemyRenderer?.constructor?.name,
      bannerText: document.querySelector('[data-sb-banner]')?.textContent,
      roundNumber: s.siegeBlades?.roundNumber,
      matchRounds: s.siegeBlades?.matchRounds,
      azureScore: s.siegeBlades?.scores?.ATTACKERS,
      crimsonScore: s.siegeBlades?.scores?.DEFENDERS,
    };
  });

  console.log('Deployment state:', machineState);
  assert.equal(machineState.myKind, 'fight-and-flight', 'Player machine must be Fight-and-Flight');
  assert.equal(machineState.myRendererClass, 'FightFlightRenderer', 'Player renderer must be FightFlightRenderer');
  assert.notEqual(machineState.enemyRendererClass, null, 'Enemy renderer must be instantiated');
  assert.equal(machineState.matchRounds, 5, 'Must be a 5-round match');

  const deployedShot = await page.screenshot({ fullPage: false });
  await writeFile(resolve(OUT_DIR, '04-combat-deployed.png'), deployedShot);

  console.log('8. Testing Ram Impact & Physics...');
  const impactResult = await page.evaluate(async () => {
    const r = window.__ssRuntime;
    const room = r.socket?.local?.room;
    if (!room) return { ok: false, error: 'no local room' };

    // Find the enemy machine and apply a test collision
    const machines = room.getMachines();
    const flight = machines.find(m => m.class === 'fight-and-flight' || m.kind === 'flight');
    const { applyMachineImpact } = await import('/shared/sim/siegeImpact.mjs');

    const beforeImpulse = { ...(flight.externalSiegeImpulse ?? { x: 0, y: 0, z: 0 }) };
    const applied = applyMachineImpact(room, flight, room.nowSec ?? 10, {
      normal: { x: 0, y: 0.3, z: 1 },
      speed: 10,
    });
    const afterImpulse = { ...(flight.externalSiegeImpulse ?? { x: 0, y: 0, z: 0 }) };
    if (typeof room.tick === 'function') {
      room.tick((room.nowSec ?? 10) + 1 / 30);
    }
    const afterV = { ...flight.velocity };

    return {
      applied,
      beforeImpulse,
      afterImpulse,
      impulseApplied: Math.hypot(afterImpulse.x, afterImpulse.z) > 0,
      afterV,
    };
  });
  console.log('Ram impact physics test:', impactResult);
  assert.ok(impactResult.applied, 'applyMachineImpact must succeed');
  assert.ok(impactResult.impulseApplied, 'Machine must react physically to collision impulse');

  console.log('9. Completing Round 1 and verifying Round 2 transition...');
  // Force elimination of enemy to trigger round end
  await page.evaluate(() => {
    const room = window.__ssRuntime.socket?.local?.room;
    if (!room) return;
    const enemy = [...room.players.values()].find(p => p.team !== 'ATTACKERS');
    const enemyMachine = room.getMachineForPlayer(enemy.id);
    if (enemyMachine) {
      enemyMachine.health = 0;
      enemyMachine.mode = 'DESTROYED';
      enemy.alive = false;
    }
  });

  // Wait for round win announcement
  await page.waitForFunction(() => {
    const banner = document.querySelector('[data-sb-banner]');
    return banner && banner.textContent.includes('ROUND WON BY AZURE');
  }, { timeout: 5000 });

  const victoryShot = await page.screenshot({ fullPage: false });
  await writeFile(resolve(OUT_DIR, '05-round1-victory-banner.png'), victoryShot);

  console.log('Waiting for Round 2 selection to open (with 6s timer and retained selection)...');
  await page.waitForFunction(() => {
    const s = window.__ssRuntime?.latestSnapshot;
    return s?.siegeBlades?.roundNumber === 2 && Number.isFinite(s.siegeBlades?.selectionEndsAt);
  }, { timeout: 8000 });

  await page.waitForTimeout(300);

  const round2State = await page.evaluate(() => {
    const picker = document.querySelector('.sb-machine-picker');
    const roundEl = picker.querySelector('[data-sb-draft-round]');
    const secondsEl = picker.querySelector('[data-sb-draft-seconds]');
    const selected = picker.querySelector('.sb-draft-card.selected');
    const s = window.__ssRuntime?.latestSnapshot?.siegeBlades;

    return {
      round: roundEl?.textContent?.trim(),
      seconds: Number(secondsEl?.textContent?.trim()),
      selectedPick: selected?.dataset?.siegePick,
      azureScore: s?.scores?.ATTACKERS,
      crimsonScore: s?.scores?.DEFENDERS,
    };
  });

  console.log('Round 2 selection state:', round2State);
  assert.equal(round2State.round, '2', 'Must be Round 2');
  assert.ok(round2State.seconds <= 6, `Round 2 timer must be <= 6 seconds (actual: ${round2State.seconds})`);
  assert.equal(round2State.azureScore, 1, 'Azure score must be 1');
  assert.equal(round2State.crimsonScore, 0, 'Crimson score must be 0');
  assert.equal(round2State.selectedPick, 'fight-and-flight', 'Previous selection must be retained as default for round 2');

  const round2Shot = await page.screenshot({ fullPage: false });
  await writeFile(resolve(OUT_DIR, '06-round2-draft-retained.png'), round2Shot);

  await browser.close();
  console.log('All browser acceptance tests passed successfully!');
}

main().catch(err => {
  console.error('Browser acceptance failed:', err);
  process.exit(1);
});
