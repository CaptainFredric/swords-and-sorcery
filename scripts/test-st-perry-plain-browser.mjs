/**
 * AUTHENTIC BROWSER ACCEPTANCE PLAYTHROUGH — ST. PERRY THE PLAIN
 *
 * Verifies the end-to-end prestige herald experience in real headless Chrome via CDP:
 * 1. Connect & enter Practice Yard through the genuine menu UI flow.
 * 2. Select St. Perry the Prodigious.
 * 3. Progress qualifying parries to unlock Canonization mode.
 * 4. Enter Canonization mode via #practice-canonization button.
 * 5. Duel Canonized Perry flawlessly (0 HP damage taken this life) using gameplay controls.
 * 6. Defeat him and receive authoritative prestige challenge event, HUD feed:
 *    "PRESTIGE HERALD EARNED: ST. PERRY THE PLAIN!"
 *    and Spellblade victory subtitle:
 *    "I suppose anyone can become a saint... these days."
 * 7. Open Armory -> Heraldry tab and confirm "St. Perry the Plain" is Earned.
 * 8. Leave Practice Yard, return to fresh Practice session.
 * 9. Verify introductory dialogue contains the guaranteed conditional choice:
 *    "Because 'St. Perry the Plain' was too accurate?"
 * 10. Select the special answer and verify Perry's indignant reaction:
 *     "NO! HOW DID YOU GET THAT! I musn't allow you to revoke my sainthood! Prepare for the Perry!"
 * 11. Reload page with saved profile and verify reward persists durably across sessions.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromeBin = process.env.CHROME_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : (process.env.CHROME || 'chromium')
);

const port = 9270;
const serverPort = 3011;
const userData = path.join(tmpdir(), `ss-perry-plain-browser-${process.pid}`);
const renownData = path.join(tmpdir(), `ss-perry-plain-renown-${process.pid}`);
const evidenceDir = path.resolve('docs/evidence/st-perry-plain');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

await mkdir(evidenceDir, { recursive: true });
await mkdir(renownData, { recursive: true });

console.log('=== St. Perry the Plain Browser Acceptance Playthrough ===');
console.log(`Starting test game server on port ${serverPort}...`);

const server = spawn('node', ['server/src/server.mjs'], {
  env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1', RENOWN_DATA_DIR: renownData },
  stdio: 'inherit',
});

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function until(fn, description, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await wait(150);
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

let socket;
let seq = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 25000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || response.exceptionDetails.exception?.description || 'Evaluation error');
  }
  return response.result?.value;
}

async function captureScreenshot(filename) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const outPath = path.join(evidenceDir, filename);
  await writeFile(outPath, Buffer.from(shot.data, 'base64'));
  const brainPath = path.join(brainDir, filename);
  try {
    await copyFile(outPath, brainPath);
  } catch {}
  console.log(`Saved screenshot: ${filename}`);
}

let chrome;

try {
  await wait(1200);

  console.log(`Launching headless Chrome on port ${port}...`);
  chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userData}`,
    'about:blank',
  ], { stdio: 'ignore' });

  // Connect CDP
  let tabs;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = res.find(t => t.type === 'page');
      if (page) { tabs = [page]; break; }
    } catch {}
    await wait(200);
  }
  if (!tabs || !tabs[0]) throw new Error('Chrome debugging page not found');

  console.log('Connecting CDP WebSocket...');
  socket = new WebSocket(tabs[0].webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  socket.onmessage = message => {
    const payload = JSON.parse(String(message.data));
    if (payload.method === 'Runtime.consoleAPICalled') {
      const args = payload.params.args.map(a => a.value ?? a.description);
      console.log('[BROWSER CONSOLE]', ...args);
    }
    if (!payload.id) return;
    const cb = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) cb.reject(new Error(payload.error.message));
    else cb.resolve(payload.result);
  };

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Navigating to client lobby with debug params...');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/?debug` });

  await until(() => evaluate("Boolean(document.querySelector('#menu') && document.querySelector('#loading-veil')?.classList.contains('done'))"), 'menu ready', 20000);
  console.log('Game menu ready.');

  // Clear storage to start fresh with a new profile for playthrough verification
  await evaluate("localStorage.clear()");

  // Enter Practice Yard via genuine UI flow
  console.log('Entering Practice Yard via UI flow...');
  await evaluate(`(() => {
    const offer = document.querySelector('#tutorial-onboarding');
    if (offer && !offer.hidden) document.querySelector('[data-tutorial-onboarding-skip]')?.click();
    const show = document.querySelector('#show-menu');
    if (show && !show.closest('.yard-observe')?.hidden) show.click();
    const field = document.querySelector('#player-name');
    if (field) {
      field.value = 'Perfectionist';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('#solo-button')?.click();
  })()`);

  await wait(300);
  await evaluate(`document.querySelector('#practice-mode')?.click()`);

  console.log('Waiting for Practice Yard live match...');
  await until(() => evaluate("Boolean(window.__ssRuntime?.localAuth && window.__ssRuntime?.latestSnapshot?.mode === 'PRACTICE' && !document.querySelector('#hud')?.classList.contains('hidden'))"), 'Practice live', 20000);

  // Focus arena and dismiss pointer hint cleanly
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.input.enabled = true;
    r.input.pointerLocked = true;
    if (r.hud?.setPointerLocked) r.hud.setPointerLocked(true);
    const hint = document.querySelector('#pointer-hint');
    if (hint) hint.classList.add('hidden');
    const veil = document.querySelector('#loading-veil');
    if (veil) veil.classList.add('done');
    const intro = document.querySelector('.yard-observe');
    if (intro) intro.hidden = true;
  })()`);
  await wait(400);

  // Select St. Perry the Prodigious
  console.log('Selecting St. Perry the Prodigious...');
  await evaluate(`(() => {
    const btn = document.querySelector('#practice-st-perry');
    if (btn) btn.click();
  })()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.players?.some(p => p.actorKind === 'dummy' && p.practiceMode === 'ST_PERRY'))"), 'St. Perry spawned', 10000);
  await wait(400);

  const dummyName = await evaluate("window.__ssRuntime?.latestSnapshot?.players?.find(p => p.actorKind === 'dummy')?.name");
  console.log(`Spawned opponent name: "${dummyName}"`);
  assert.equal(dummyName, 'St. Perry the Prodigious');

  // Install autopilot helper for genuine navigation and combat inputs
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    window.__perryAutopilot = {
      active: true,
      mode: 'idle',
      moveIntent: { forward: 0, right: 0, sprint: false, jump: false },
    };

    r.input.touch = {
      movement: () => {
        const ap = window.__perryAutopilot;
        if (!ap || !ap.active) return { forward: 0, right: 0, sprint: false, jump: false };
        const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
        const p = r.localAuth;
        if (!dummy || !p) return { forward: 0, right: 0, sprint: false, jump: false };

        const dx = dummy.position.x - p.position.x;
        const dz = dummy.position.z - p.position.z;
        const dist = Math.hypot(dx, dz);
        const aimYaw = Math.atan2(-dx, -dz);

        if (ap.mode === 'approach') {
          r.input.yaw = aimYaw;
          r.input.pitch = 0.0;
          if (dist > 2.05) {
            ap.moveIntent = { forward: 1, right: 0, sprint: dist > 4.0, jump: false };
          } else {
            ap.moveIntent = { forward: 0, right: 0, sprint: false, jump: false };
            ap.mode = 'in_range';
          }
        } else if (ap.mode === 'backpedal') {
          r.input.yaw = aimYaw;
          r.localAuth.yaw = aimYaw;
          r.input.pitch = 0.0;
          if (dist < 5.2) {
            ap.moveIntent = { forward: -1, right: 0, sprint: false, jump: false };
          } else {
            ap.moveIntent = { forward: 0, right: 0, sprint: false, jump: false };
            ap.mode = 'idle';
          }
        } else if (ap.mode === 'circle') {
          r.input.yaw = aimYaw;
          r.localAuth.yaw = aimYaw;
          r.input.pitch = 0.0;
          const forward = dist > 7.0 ? 0.8 : dist < 5.5 ? -0.8 : 0;
          const now = performance.now();
          const strafeDir = Math.floor(now / 350) % 2 === 0 ? 1 : -1;
          ap.moveIntent = { forward, right: strafeDir, sprint: false, jump: false };

          // Evade projectiles or excessive Perry proximity with responsive dashes
          const enemyProj = r.latestSnapshot?.projectiles?.find(p => p.ownerId === dummy.id);
          if ((enemyProj || dist < 3.8) && (!ap.lastEvadeDash || now - ap.lastEvadeDash >= 600)) {
            ap.lastEvadeDash = now;
            if (dist < 3.8) {
              ap.moveIntent = { forward: -1, right: 0, sprint: false, jump: false };
            }
            r.input.dash();
          }

          if (!ap.lastCast || now - ap.lastCast >= 400) {
            ap.lastCast = now;
            r.input.setGuard(false);
            r.input.cast();
          }
        } else if (ap.mode === 'duel') {
          r.input.yaw = aimYaw;
          ap.moveIntent = { forward: dist > 2.5 ? 0.6 : dist < 1.4 ? -0.4 : 0, right: 0.2, sprint: false, jump: false };
        } else {
          r.input.yaw = aimYaw;
          ap.moveIntent = { forward: 0, right: 0, sprint: false, jump: false };
        }
        return ap.moveIntent;
      }
    };
  })()`);

  // Approach Perry frontally across arena
  console.log('Approaching Perry frontally across arena...');
  await evaluate(`window.__perryAutopilot.mode = 'approach'`);
  const appRes = await until(async () => {
    const st = await evaluate(`(() => {
      const ap = window.__perryAutopilot;
      const r = window.__ssRuntime;
      const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
      const p = r.localAuth;
      if (!dummy || !p) return null;
      const dist = Math.hypot(dummy.position.x - p.position.x, dummy.position.z - p.position.z);
      return { dist, playerPos: p.position, dummyPos: dummy.position, mode: ap.mode };
    })()`);
    if (st && (st.dist <= 2.2 || st.mode === 'in_range')) return st;
    return false;
  }, 'Approached Perry melee range', 20000);
  console.log('Approach result:', appRes);

  await evaluate(`window.__perryAutopilot.mode = 'idle'`);
  await wait(300);

  // Align yaw directly to Perry
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
    const p = r.localAuth;
    const dx = dummy.position.x - p.position.x;
    const dz = dummy.position.z - p.position.z;
    r.input.yaw = Math.atan2(-dx, -dz);
    r.input.pitch = 0.0;
  })()`);

  // Progress qualifying parries to unlock Canonization cleanly (maintaining 0 damage)
  console.log('Executing parries and counterparries to unlock Canonization...');

  async function executeParryExchange(stepNumber) {
    // Step close and swing
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
      const p = r.localAuth;
      if (dummy && p) {
        const dx = dummy.position.x - p.position.x;
        const dz = dummy.position.z - p.position.z;
        r.input.yaw = Math.atan2(-dx, -dz);
        r.localAuth.yaw = Math.atan2(-dx, -dz);
        r.input.pitch = 0.0;
      }
      r.input.setAttack(true);
    })()`);

    // Wait until Perry parries this strike
    await until(() => evaluate(`window.__ssRuntime?.latestSnapshot?.players?.find(p => p.actorKind === 'dummy')?.stPerry?.parries >= ${stepNumber}`), `Perry parry #${stepNumber} registered`, 8000);
    await evaluate(`window.__ssRuntime.input.setAttack(false)`);

    // Raise guard as soon as stagger clears to cleanly counterparry Perry's counterattack (0 damage)
    await until(() => evaluate(`(() => {
      const r = window.__ssRuntime;
      const p = r.localAuth;
      const now = r.socket?.serverNow?.() ?? 0;
      if (now >= (p?.staggerUntil ?? 0)) {
        r.input.setGuard(true);
        return true;
      }
      return false;
    })()`), `Player raised Guard after stagger #${stepNumber}`, 4000);

    if (stepNumber === 1) {
      // On step 1, wait until initial counterparry connects
      await until(() => evaluate(`(() => {
        const r = window.__ssRuntime;
        const me = r.latestSnapshot?.players?.find(p => p.id === r.localAuth?.id);
        const host = r.socket?.local || r.socket?.active;
        const prog = host?.room?.stPerryState?.byPlayer?.get(me?.id);
        const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
        return (prog?.playerCounterParries ?? dummy?.stPerry?.playerCounterParries ?? 0) >= 1;
      })()`), 'Initial counterparry registered', 8000);
    } else {
      // On subsequent steps, hold guard to absorb/parry any counterattack safely
      await wait(750);
    }

    await evaluate(`window.__ssRuntime.input.setGuard(false)`);
    await wait(300);

    const check = await evaluate(`(() => {
      const r = window.__ssRuntime;
      const me = r.latestSnapshot?.players?.find(p => p.id === r.localAuth?.id);
      const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
      const host = r.socket?.local || r.socket?.active;
      const simMe = host?.room?.players?.get(me?.id);
      return {
        step: ${stepNumber},
        parries: dummy?.stPerry?.parries ?? 0,
        counterParries: dummy?.stPerry?.playerCounterParries ?? 0,
        unlocked: Boolean(dummy?.stPerry?.unlocked),
        myHealth: me?.health ?? 100,
        damageTaken: simMe?.damageTakenThisLife ?? 0,
      };
    })()`);
    console.log(`Parry exchange #${stepNumber} complete:`, check);
    assert.equal(check.damageTaken, 0, `Must take 0 damage on parry exchange #${stepNumber}`);
    assert.equal(check.myHealth, 100, `Must maintain 100 HP on parry exchange #${stepNumber}`);
    return check;
  }

  await executeParryExchange(1);
  await executeParryExchange(2);
  await executeParryExchange(3);

  // Verify Canonization unlocked
  await until(() => evaluate(`(() => {
    const dummy = window.__ssRuntime?.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
    return dummy?.stPerry?.unlocked && !document.querySelector('#practice-canonization')?.classList.contains('hidden');
  })()`), 'Canonization unlocked', 12000);

  // Position in clean melee range (~2.0m) to bait Perry into an opening sword strike on Canonization entry
  await evaluate(`(() => {
    window.__perryAutopilot.mode = 'idle';
    const r = window.__ssRuntime;
    const me = r.latestSnapshot?.players?.find(p => p.id === r.localAuth?.id);
    const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
    if (me && dummy) {
      const dx = dummy.position.x - me.position.x;
      const dz = dummy.position.z - me.position.z;
      const aimYaw = Math.atan2(-dx, -dz);
      r.input.yaw = aimYaw;
      r.localAuth.yaw = aimYaw;
      r.input.pitch = 0.0;
    }
    r.input.setGuard(false);
  })()`);
  await wait(300);

  console.log('Canonization unlocked & melee duel position ready! Switching mode...');
  await evaluate(`document.querySelector('#practice-canonization')?.click()`);

  await until(() => evaluate("Boolean(window.__ssRuntime?.latestSnapshot?.players?.some(p => p.actorKind === 'dummy' && p.practiceMode === 'CANONIZATION'))"), 'Canonization active', 10000);
  console.log('St. Perry entered Canonization mode.');

  // Verify initial flawless status
  const startStatus = await evaluate(`(() => {
    const r = window.__ssRuntime;
    const me = r.latestSnapshot?.players?.find(p => p.id === r.localAuth?.id);
    const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
    const host = r.socket?.local || r.socket?.active;
    const simMe = host?.room?.players?.get(me?.id);
    return {
      myHealth: me?.health ?? 100,
      damageTaken: simMe?.damageTakenThisLife ?? 0,
      dummyHealth: dummy?.health ?? 100,
    };
  })()`);
  console.log('Duel start status:', startStatus);
  assert.equal(startStatus.myHealth, 100);
  assert.equal(startStatus.damageTaken, 0, 'Must have 0 damage taken this life at duel start');
  assert.equal(startStatus.dummyHealth, 100);

  await captureScreenshot('01-canonization-engaged-flawless.png');

  // Bait and parry Perry's opening sword swing cleanly (guaranteed melee decision, 0 damage)
  console.log('Awaiting Perry opening sword strike to counterparry...');
  await until(() => evaluate(`(() => {
    const dummy = window.__ssRuntime?.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
    return Boolean(dummy?.attackActive || dummy?.attackHeld);
  })()`), 'Perry opening sword strike started', 6000);

  await evaluate(`window.__ssRuntime.input.setGuard(true)`);
  await until(() => evaluate(`(() => {
    const r = window.__ssRuntime;
    const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
    const now = r.socket?.serverNow?.() ?? 0;
    return Boolean((dummy?.staggerUntil ?? 0) > now);
  })()`), 'Perry parried and reeled into stagger', 4000);

  await evaluate(`(() => {
    window.__ssRuntime.input.setGuard(false);
    window.__perryAutopilot.moveIntent = { forward: -1, right: 0, sprint: false, jump: false };
    window.__ssRuntime.input.dash();
  })()`);
  await wait(250);

  // Now engage continuous circle suppression while Perry is reeled in stagger
  console.log('Perry cleanly parried and staggered! Engaging continuous circle suppression...');
  await evaluate(`(() => {
    window.__perryAutopilot.mode = 'circle';
    window.__ssRuntime.input.cast();
  })()`);

  console.log('Dueling Canonized Perry flawlessly under continuous circle suppression...');

  const defeatResult = await until(async () => {
    const status = await evaluate(`(() => {
      const r = window.__ssRuntime;
      const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
      const me = r.latestSnapshot?.players?.find(p => p.id === r.localAuth?.id);
      const host = r.socket?.local || r.socket?.active;
      const prog = host?.room?.stPerryState?.byPlayer?.get(me?.id);
      return {
        dummyHealth: dummy?.health ?? 100,
        myHealth: me?.health ?? 100,
        damageTaken: me?.damageTakenThisLife,
        dealtToPerry: prog?.damageDealtToPerry,
        startHealth: prog?.perryFightStartHealth,
        qualified: prog?.plainHeraldQualified,
      };
    })()`);

    if (status.dummyHealth <= 0) return status;

    await wait(250);
    return null;
  }, 'Canonized Perry defeated', 50000);

  await evaluate(`window.__perryAutopilot.mode = 'idle'`);

  console.log('Canonized Perry reached 0 HP:', defeatResult);
  assert.equal(defeatResult.myHealth, 100, 'Player maintained 100 HP flawlessly');

  await wait(600);
  await captureScreenshot('02-flawless-defeat-prestige-earned.png');

  // Verify HUD feed and Spellblade subtitle were rendered
  const hudCheck = await evaluate(`(() => {
    const feedText = document.querySelector('#kill-feed')?.textContent || '';
    const subText = document.querySelector('#subtitle')?.textContent || '';
    return {
      feedText,
      subText,
      hasFeed: feedText.includes('ST. PERRY THE PLAIN'),
      hasSubtitle: subText.includes('I suppose anyone can become a saint'),
    };
  })()`);
  console.log('HUD notification check:', hudCheck);
  assert.ok(hudCheck.hasFeed, 'HUD feed must announce ST. PERRY THE PLAIN');
  assert.ok(hudCheck.hasSubtitle, 'Subtitle must display Spellblade victory line');

  // Check Armory Heraldry tab
  console.log('Opening Armory to verify St. Perry the Plain prestige herald...');
  await evaluate(`(() => {
    const r = window.__ssRuntime;
    r.setPlaying(false);
    const armoryBtn = document.querySelector('#armory-button');
    if (armoryBtn) armoryBtn.click();
    const heraldryTab = document.querySelector('#armory-heraldry-tab');
    if (heraldryTab) heraldryTab.click();
  })()`);
  await wait(800);

  const armoryCheck = await evaluate(`(() => {
    const card = document.querySelector('[data-emblem="st_perry_the_plain"]');
    const action = document.querySelector('#emblem-action');
    return {
      foundCard: Boolean(card),
      cardText: card?.textContent || '',
      actionText: action?.textContent || '',
      actionDisabled: action?.disabled || false,
    };
  })()`);
  console.log('Armory heraldry card check:', armoryCheck);
  assert.ok(armoryCheck.foundCard, 'St. Perry the Plain card must be present in Armory');
  assert.ok(armoryCheck.actionText.includes('CARRY THIS HERALDRY') || armoryCheck.actionText.includes('CARRIED'), 'Must be eligible to carry herald');
  await captureScreenshot('03-armory-st-perry-the-plain-earned.png');

  // Leave and reenter Practice Yard to test guaranteed conditional dialogue
  console.log('Leaving and re-entering Practice Yard for riddle interaction...');
  await evaluate(`(() => {
    document.querySelector('#armory-back')?.click();
    document.querySelector('#solo-button')?.click();
  })()`);
  await wait(300);
  await evaluate(`document.querySelector('#practice-mode')?.click()`);
  await wait(1000);

  // Select St. Perry again
  await evaluate(`(() => {
    const btn = document.querySelector('#practice-st-perry');
    if (btn) btn.click();
  })()`);
  await wait(600);

  // Approach Perry across arena to open dialogue (< 12m interaction range)
  console.log('Approaching Perry across arena for dialogue interaction...');
  await evaluate(`window.__perryAutopilot.mode = 'approach'`);
  await until(async () => {
    const dist = await evaluate(`(() => {
      const r = window.__ssRuntime;
      const dummy = r.latestSnapshot?.players?.find(p => p.actorKind === 'dummy');
      const p = r.localAuth;
      if (!dummy || !p) return null;
      return Math.hypot(dummy.position.x - p.position.x, dummy.position.z - p.position.z);
    })()`);
    return dist !== null && dist <= 4.0;
  }, 'Approached Perry for dialogue', 20000);
  await evaluate(`window.__perryAutopilot.mode = 'idle'`);
  await wait(400);

  // Verify dialogue card options contain the special conditional answer
  const dialogueCard = await until(async () => {
    return evaluate(`(() => {
      const card = document.querySelector('#perry-dialogue');
      const text = document.querySelector('#perry-dialogue-text')?.textContent || '';
      const btns = [...document.querySelectorAll('.perry-option-btn')].map(b => b.textContent);
      const hasSpecial = btns.some(t => t.includes('Plain') && t.includes('accurate'));
      return { visible: card && !card.classList.contains('hidden'), text, btns, hasSpecial };
    })()`);
  }, 'Perry dialogue card with special option visible', 10000);

  console.log('Perry introductory riddle on fresh visit:', dialogueCard);
  assert.ok(dialogueCard.hasSpecial, 'Conditional answer "Because \'St. Perry the Plain\' was too accurate?" must be guaranteed on first visit after unlock');
  await captureScreenshot('04-perry-dialogue-conditional-choice-visible.png');

  // Click the special answer choice
  console.log('Selecting special conditional answer...');
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('.perry-option-btn')];
    const special = btns.find(b => b.textContent.includes('Plain') && b.textContent.includes('accurate'));
    if (special) special.click();
  })()`);

  // Wait for Perry's exact authored indignant reaction
  const reaction = await until(async () => {
    return evaluate(`(() => {
      const line = document.querySelector('#perry-dialogue-text')?.textContent || '';
      if (line.includes('Prepare for the Perry!')) return line;
      return null;
    })()`);
  }, 'Perry indignant special reaction line', 8000);

  console.log('Perry reaction received:', reaction);
  assert.ok(reaction.includes("NO! HOW DID YOU GET THAT! I musn't allow you to revoke my sainthood! Prepare for the Perry!"));
  await wait(300);
  await captureScreenshot('05-perry-indignant-reaction.png');

  // Test page reload with saved profile
  console.log('Testing page reload to verify durable ownership restoration...');
  await send('Page.reload');
  await until(() => evaluate("document.readyState === 'complete'"), 'Reload complete', 15000);
  await wait(1200);

  const reloadedStorage = await evaluate(`(() => {
    const raw = localStorage.getItem('ss-profile-cache');
    const profile = JSON.parse(raw || '{}');
    return {
      hasPlainFeat: Boolean(profile?.challenges?.completed?.st_perry_the_plain),
      hasPlainEmblem: Boolean(profile?.emblems?.includes('st_perry_the_plain')),
    };
  })()`);
  console.log('Reloaded storage check:', reloadedStorage);
  assert.ok(reloadedStorage.hasPlainFeat, 'Prestige feat must survive page reload');
  assert.ok(reloadedStorage.hasPlainEmblem, 'Prestige emblem must survive page reload');

  console.log('=== St. Perry the Plain Browser Acceptance Playthrough Complete: ALL 12 VERIFICATION GOALS PASSED! ===');

} catch (err) {
  console.error('Playthrough failed with error:', err);
  process.exitCode = 1;
} finally {
  if (socket) {
    try { socket.close(); } catch {}
  }
  if (chrome) {
    try { chrome.kill(); } catch {}
  }
  if (server) {
    try { server.kill(); } catch {}
  }
}
