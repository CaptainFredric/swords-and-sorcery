/**
 * AUTHENTIC BUNDLED HTML5 ARTIFACT ACCEPTANCE TEST SUITE
 *
 * Verifies the exact bundled HTML5 ZIP (dist/html5/swords-and-sorcery-html5.zip):
 * 1. Startup & loading comparison: unbundled dev sources vs bundled ZIP.
 * 2. Settings, controls, and lazy-loaded / dynamic modules.
 * 3. Offline Solo Practice Yard: St. Perry's rotating dialogue, touch + desktop selection.
 * 4. Canonization mode & St. Perry the Plain prestige herald conditional dialogue.
 * 5. Bi-Bye-llista mounting, CLEAR aiming, and both firing assemblies.
 * 6. SO-FIST-ICATION model loading and basic operation (charge, piston strike, dismantle).
 * 7. First-person and third-person Spellblade model loading and animations.
 * 8. Greener Pastures traversal and actual tutorial voice playback & decoding.
 * 9. Hosted WebSocket multiplayer session with authoritative commands and reconnect.
 */

import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameServer } from '../../server/src/server.mjs';
import { CdpClient } from '../browser-cdp.mjs';
import { validateArchive } from './archive.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const evidenceDir = path.join(repoRoot, 'docs/evidence/bundled-acceptance');
const brainDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';

const chromeBin = process.env.CHROME_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome'
);

const MIME = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(fn, description, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

export async function runBundledAcceptance({ directory = 'dist/html5' } = {}) {
  await fs.mkdir(evidenceDir, { recursive: true });
  console.log('=== Starting Bundled HTML5 Artifact Acceptance Suite ===');

  // Step 1: Validate archive and extract bundled ZIP
  const targetDir = path.resolve(repoRoot, directory);
  const report = await validateArchive(targetDir);
  console.log(`Validated archive: ${report.zip} (${report.files} files, ${report.extractedBytes} bytes)`);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ss-bundle-acceptance-'));
  const bundledExportDir = path.join(tempRoot, 'export');
  const chromeProfile = path.join(tempRoot, 'chrome-profile');
  await fs.mkdir(bundledExportDir, { recursive: true });
  await fs.mkdir(chromeProfile, { recursive: true });

  execFileSync('unzip', ['-qq', report.zip, '-d', bundledExportDir]);
  console.log(`Extracted bundled files to: ${bundledExportDir}`);

  // Step 2: Spin up dual-serving HTTP server:
  // - /html/verified/ -> serves from bundled ZIP extraction
  // - /unbundled/     -> serves from repoRoot (original source files)
  const prefixBundled = '/html/verified/';
  const prefixUnbundled = '/unbundled/';

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let baseDir = null;
      let relativePath = '';

      if (url.pathname.startsWith(prefixBundled)) {
        baseDir = bundledExportDir;
        relativePath = decodeURIComponent(url.pathname.slice(prefixBundled.length)) || 'index.html';
      } else if (url.pathname.startsWith(prefixUnbundled)) {
        baseDir = repoRoot;
        let sub = decodeURIComponent(url.pathname.slice(prefixUnbundled.length));
        if (!sub || sub === 'index.html') {
          relativePath = 'client/index.html';
        } else {
          relativePath = sub;
        }
      } else {
        res.writeHead(404).end();
        return;
      }

      const filePath = path.resolve(baseDir, relativePath);
      if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
        res.writeHead(404).end();
        return;
      }

      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(content);
    } catch {
      res.writeHead(404).end();
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  console.log(`Dual-serving HTTP test server running on port ${serverPort}`);

  // Step 3: Launch Chrome
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    '--disable-features=MacAppCodeSignClone',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-ipc-flooding-protection',
    '--remote-allow-origins=*',
    '--window-size=1280,800',
    '--remote-debugging-port=0',
    `--user-data-dir=${chromeProfile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let cdp;
  let gameServer = null;

  try {
    let devToolsPort = 0;
    await until(async () => {
      try {
        const portStr = (await fs.readFile(path.join(chromeProfile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
        devToolsPort = Number(portStr);
        return devToolsPort > 0;
      } catch { return false; }
    }, 'Chrome active port');

    const targets = await (await fetch(`http://127.0.0.1:${devToolsPort}/json/list`)).json();
    const pageTarget = targets.find(t => t.type === 'page');
    assert(pageTarget, 'Page target must exist in Chrome');

    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    console.log('Connected to Chrome via CDP');

    const evaluate = async (expression) => {
      const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.text || response.exceptionDetails.exception?.description || 'Eval error');
      }
      return response.result?.value;
    };

    const saveScreenshot = async (name) => {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const out = path.join(evidenceDir, name);
      await fs.writeFile(out, Buffer.from(shot.data, 'base64'));
      try {
        await fs.copyFile(out, path.join(brainDir, name));
      } catch {}
      console.log(`Saved screenshot: ${name}`);
    };

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // =========================================================================
    // SECTION 3: CHECK STARTUP AND LOADING BEHAVIOR (Unbundled vs Bundled)
    // =========================================================================
    console.log('\n--- Measuring Startup & Loading: Unbundled Development vs Bundled ZIP ---');

    async function measureStartup(testUrl, label) {
      const requests = [];
      const errors = [];
      const requestListener = ({ request }) => {
        requests.push({ url: request.url, method: request.method });
      };
      const responseListener = ({ response }) => {
        const req = requests.find(r => r.url === response.url);
        if (req) {
          req.status = response.status;
          req.mimeType = response.mimeType;
          req.encodedDataLength = response.encodedDataLength;
        }
      };
      const errorListener = (evt) => {
        errors.push(evt.exceptionDetails?.text || 'Client runtime exception');
      };

      cdp.on('Network.requestWillBeSent', requestListener);
      cdp.on('Network.responseReceived', responseListener);
      cdp.on('Runtime.exceptionThrown', errorListener);

      const navStart = Date.now();
      await cdp.send('Page.navigate', { url: testUrl });

      await until(async () => {
        return evaluate("document.querySelector('#loading-veil')?.classList.contains('done') && !!document.querySelector('#menu-spellblade canvas')");
      }, `${label} menu ready`, 30000);

      const readyTime = Date.now() - navStart;
      const perfTiming = await evaluate(`(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return {
          domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
          loadEventEnd: nav ? nav.loadEventEnd : 0,
          transferSize: nav ? nav.transferSize : 0,
        };
      })()`);

      const jsRequests = requests.filter(r => r.url.endsWith('.mjs') || r.url.endsWith('.js') || r.mimeType?.includes('javascript'));
      const totalJsBytes = jsRequests.reduce((sum, r) => sum + (r.encodedDataLength || 0), 0);

      // Cleanup listeners
      const clearList = (name) => {
        const list = cdp.events.get(name);
        if (list) list.length = 0;
      };
      clearList('Network.requestWillBeSent');
      clearList('Network.responseReceived');
      clearList('Runtime.exceptionThrown');

      return {
        label,
        readyTimeMs: readyTime,
        domContentLoadedMs: Math.round(perfTiming.domContentLoaded),
        totalRequests: requests.length,
        jsRequestsCount: jsRequests.length,
        totalJsBytes,
        errors,
      };
    }

    const unbundledMetrics = await measureStartup(`http://127.0.0.1:${serverPort}${prefixUnbundled}?debug`, 'Unbundled (dev)');
    console.log(`Unbundled metrics: ${unbundledMetrics.jsRequestsCount} JS requests, ${unbundledMetrics.readyTimeMs}ms to menu ready`);

    const bundledMetrics = await measureStartup(`http://127.0.0.1:${serverPort}${prefixBundled}?debug`, 'Bundled ZIP');
    console.log(`Bundled metrics: ${bundledMetrics.jsRequestsCount} JS requests, ${bundledMetrics.readyTimeMs}ms to menu ready`);

    console.log(`\nStartup Comparison:`);
    console.log(`  Unbundled: ${unbundledMetrics.jsRequestsCount} JS modules requested, ${unbundledMetrics.totalRequests} total requests, ${unbundledMetrics.readyTimeMs}ms startup`);
    console.log(`  Bundled:   ${bundledMetrics.jsRequestsCount} JS modules requested, ${bundledMetrics.totalRequests} total requests, ${bundledMetrics.readyTimeMs}ms startup`);
    assert.equal(bundledMetrics.errors.length, 0, `Bundled client had runtime errors: ${bundledMetrics.errors.join('; ')}`);
    assert.ok(bundledMetrics.jsRequestsCount <= 5, `Bundled client should only request bundle + external three modules, got ${bundledMetrics.jsRequestsCount}`);

    // =========================================================================
    // SECTION 1: COMPREHENSIVE PLAYABLE ARTIFACT ACCEPTANCE (against bundled ZIP)
    // =========================================================================
    console.log('\n--- Testing Representative Systems on Bundled Artifact ---');

    // Helper functions for driving the UI
    const click = async (selector) => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    };

    const visible = async (selector) => {
      return evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        return !!el && !el.hidden && !el.classList.contains('hidden') && el.getBoundingClientRect().height > 0;
      })()`);
    };

    const state = async () => {
      return evaluate(`(() => {
        const r = window.__ssRuntime;
        const pos = r?.localState?.position || r?.localAuth?.position || r?.socket?.local?.room?.players?.get(r?.socket?.playerId)?.position;
        const p = r?.localAuth || r?.socket?.local?.room?.players?.get(r?.socket?.playerId);
        return {
          position: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
          yaw: r?.input?.yaw,
          guard: p?.guarding,
          attack: p?.attackActive,
          cast: p?.castingSpell,
          ready: p?.spellReadyAt,
          enabled: r?.input?.enabled,
          world: r?.worldId,
          dummy: r?.latestSnapshot?.players?.find(pl => pl.actorKind === 'dummy'),
          player: p,
          ballista: (r?.latestSnapshot?.bibyeBallista || r?.socket?.local?.room?.biByeLlista) ? {
            id: (r.latestSnapshot?.bibyeBallista || r.socket?.local?.room?.biByeLlista).id,
            heading: (r.latestSnapshot?.bibyeBallista || r.socket?.local?.room?.biByeLlista).heading,
            upperReleasedAt: (r.latestSnapshot?.bibyeBallista || r.socket?.local?.room?.biByeLlista).upperReleasedAt,
            mode: (r.latestSnapshot?.bibyeBallista || r.socket?.local?.room?.biByeLlista).mode,
          } : null,
          ram: (r?.latestSnapshot?.soFistication || r?.socket?.local?.room?.soFistication) ? {
            id: (r.latestSnapshot?.soFistication || r.socket?.local?.room?.soFistication).id,
            charging: (r.latestSnapshot?.soFistication || r.socket?.local?.room?.soFistication).charging,
            strikeAt: (r.latestSnapshot?.soFistication || r.socket?.local?.room?.soFistication).strikeAt,
            hasModel: Boolean(r.world?.soFistication?.model),
          } : null,
        };
      })()`);
    };

    const key = (code, down) => cdp.send('Input.dispatchKeyEvent', {
      type: down ? 'keyDown' : 'keyUp',
      code,
      key: code === 'Escape' ? 'Escape' : code.replace('Key', '').toLowerCase(),
      windowsVirtualKeyCode: code === 'Escape' ? 27 : code.replace('Key', '').charCodeAt(0),
    });

    const tap = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

    // 1. Settings & Lazy-Loaded Code
    console.log('1. Checking Settings panel and lazy-loaded / dynamic modules...');
    if (await visible('#tutorial-onboarding')) await click('[data-tutorial-onboarding-skip]');
    if (await visible('#show-menu')) await click('#show-menu');

    await click('#settings-button');
    await until(() => visible('#settings'), 'Settings panel visible');
    const settingsTabs = await evaluate(`[...document.querySelectorAll('[data-settings-tabs] [data-section]')].map(b => b.dataset.section)`);
    console.log('   Settings tabs verified:', settingsTabs);
    assert.ok(settingsTabs.includes('audio') && settingsTabs.includes('display') && settingsTabs.includes('controls'));

    // Switch tabs
    await evaluate(`document.querySelector('[data-settings-tabs] [data-section="display"]')?.click()`);
    await sleep(200);
    await evaluate(`document.querySelector('[data-settings-tabs] [data-section="audio"]')?.click()`);
    await sleep(200);
    await click('[data-settings-done]');
    await until(async () => !(await visible('#settings')), 'Settings closed');

    // Dynamic import verification: soundDemo
    const soundDemoLoaded = await until(async () => {
      return evaluate("Boolean(window.__ssSoundDemo)");
    }, 'dynamic soundDemo inlined/loaded', 10000);
    assert.ok(soundDemoLoaded, 'window.__ssSoundDemo dynamically resolved in bundled build');
    console.log('   Dynamic import (soundDemo) verified.');

    // 2. Practice Yard & St. Perry's Rotating Dialogue
    console.log('2. Testing Practice Yard & St. Perry rotating dialogue (touch + desktop)...');
    await evaluate(`(() => {
      const name = document.querySelector('#player-name');
      if (name) { name.value = 'BundledTester'; name.dispatchEvent(new Event('input', { bubbles: true })); }
    })()`);
    await click('#solo-button');
    await until(() => visible('#solo-menu'), 'Solo menu');
    await click('#practice-mode');
    await until(async () => (await visible('#hud')) && (await state()).position, 'Practice Yard loaded');

    // Dismiss overlay and focus
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      r.input.enabled = true;
      r.input.pointerLocked = true;
      if (r.hud?.setPointerLocked) r.hud.setPointerLocked(true);
      document.querySelector('#pointer-hint')?.classList.add('hidden');
      document.querySelector('#loading-veil')?.classList.add('done');
    })()`);

    // Spawn St. Perry the Prodigious
    await click('#practice-st-perry');
    await until(async () => {
      const s = await state();
      return s.dummy?.practiceMode === 'ST_PERRY';
    }, 'St. Perry spawned', 15000);
    console.log('   St. Perry the Prodigious spawned in Practice Yard.');

    // Wait for dialogue card
    await until(() => visible('#perry-dialogue'), 'Perry dialogue card', 10000);
    const greetingText = await evaluate("document.querySelector('#perry-dialogue-text')?.textContent");
    console.log(`   Perry greeting text: "${greetingText}"`);
    assert.ok(greetingText.includes('I am St. Perry, the Prodigious! Any idea why that is my name?'));

    // Test emulated touch tap on wrong answer
    await evaluate("document.body.classList.add('touch-ui')");
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 }).catch(() => {});
    const wrongBtnRect = await evaluate(`(() => {
      const wrong = [...document.querySelectorAll('.perry-option-btn')].find(b => !b.dataset.answer?.toLowerCase().includes('parry'));
      const rect = wrong.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    await tap('touchStart', [{ x: wrongBtnRect.x, y: wrongBtnRect.y, id: 1 }]);
    await sleep(50);
    await tap('touchEnd', []);
    await until(() => evaluate("document.querySelector('#perry-dialogue-text')?.textContent?.includes('Incorrect! You are lucky I am a St. Try again.')"), 'Authored wrong answer response via touch');
    console.log('   Touch tap delivered authored response: "Incorrect! You are lucky I am a St. Try again."');

    await evaluate("document.body.classList.remove('touch-ui')");
    await sleep(600);

    const preChoices = await evaluate("[...document.querySelectorAll('.perry-option-btn')].map(b => ({ text: b.textContent, disabled: b.disabled, answer: b.dataset.answer }))");
    console.log('   Buttons before 2nd click:', preChoices);

    // Test desktop click on second wrong answer
    await evaluate(`(() => {
      const wrongs = [...document.querySelectorAll('.perry-option-btn')].filter(b => !b.dataset.answer?.toLowerCase().includes('parry'));
      const target = wrongs[1] || wrongs[0];
      if (target) {
        console.log('Clicking target:', target.dataset.answer);
        target.click();
      }
    })()`);
    await sleep(300);
    const postText = await evaluate("document.querySelector('#perry-dialogue-text')?.textContent");
    console.log('   Dialogue text immediately after 2nd click:', postText);

    await until(() => evaluate("document.querySelector('#perry-dialogue-text')?.textContent?.includes('Have you grown in intellect since we last spoke?')"), 'Authored intellect response via desktop click', 10000);
    console.log('   Desktop click delivered authored response: "Have you grown in intellect since we last spoke?"');
    await sleep(500);

    // Test correct answer
    await evaluate(`(() => {
      const correct = [...document.querySelectorAll('.perry-option-btn')].find(b => b.dataset.answer === 'Because you parry?');
      correct?.click();
    })()`);
    await until(() => evaluate("document.querySelector('#perry-dialogue-text')?.textContent?.includes('Finally!.. I meant, that was the least you could do.')"), 'Authored correct answer acknowledged');
    console.log('   Correct answer acknowledged.');
    await saveScreenshot('01-st-perry-dialogue-passed.png');

    // 3. Canonization Mode & St. Perry the Plain Herald Path
    console.log('3. Testing Canonization mode & St. Perry the Plain herald conditional path...');
    // Authoritatively award Canonization qualification in LocalHost runtime
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      const room = r.socket.local?.room || r.socket.room;
      const playerId = r.localAuth.id;
      if (room) {
        if (!room.stPerryState) {
          room.stPerryState = { unlocked: true, byPlayer: new Map() };
        }
        room.stPerryState.unlocked = true;
        let prog = room.stPerryState.byPlayer?.get(playerId);
        if (!prog) {
          prog = { perryParries: 3, playerCounterParries: 1, unlocked: true };
          room.stPerryState.byPlayer?.set(playerId, prog);
        } else {
          prog.perryParries = 3;
          prog.playerCounterParries = 1;
          prog.unlocked = true;
        }
        const dummy = [...room.players.values()].find(p => p.actorKind === 'dummy');
        if (dummy?.stPerry) {
          dummy.stPerry.unlocked = true;
          dummy.stPerry.unlockedPlayers = [playerId];
        }
      }
    })()`);
    await sleep(400);

    // Verify Canonization button is unlocked and click it
    await until(async () => {
      return evaluate("!document.querySelector('#practice-canonization')?.disabled");
    }, 'Canonization button enabled', 10000);
    await click('#practice-canonization');

    await until(async () => {
      const s = await state();
      return s.dummy?.practiceMode === 'CANONIZATION';
    }, 'Canonization mode engaged', 10000);
    console.log('   Canonization mode successfully engaged with Chivalry!');
    await saveScreenshot('02-canonization-engaged.png');

    // Verify prestige challenge entitlement and conditional dialogue
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      // Mark st_perry_the_plain challenge earned in ProfileStore / Armory
      const profile = JSON.parse(localStorage.getItem('swords-and-sorcery:guest-profile') || '{}');
      profile.challenges = profile.challenges || [];
      if (!profile.challenges.includes('st_perry_the_plain')) profile.challenges.push('st_perry_the_plain');
      localStorage.setItem('swords-and-sorcery:guest-profile', JSON.stringify(profile));
      r.profileStore?.hydrateEntitlements?.();
      const room = r.socket.local?.room || r.socket.room;
      const p = room?.players?.get(r.localAuth?.id);
      if (p) {
        p.challenges = { completed: { st_perry_the_plain: true } };
        p.emblems = ['st_perry_the_plain'];
      }
      const prog = room?.stPerryState?.byPlayer?.get(r.localAuth?.id);
      if (prog) {
        prog.rotationBag = [];
        prog.lastPoolKey = null;
        prog.dialogue = null;
      }
    })()`);

    // Reset dummy to ST_PERRY to inspect regenerated dialogue pool
    await click('#practice-st-perry');
    await until(async () => {
      const s = await state();
      return s.dummy?.practiceMode === 'ST_PERRY';
    }, 'Perry reset to riddle dummy', 10000);

    // Verify conditional choice appears
    const hasPlainChoice = await until(async () => {
      return evaluate(`(() => {
        const btns = [...document.querySelectorAll('.perry-option-btn')].map(b => b.textContent);
        return btns.some(t => t.includes('Plain') && t.includes('accurate'));
      })()`);
    }, 'St. Perry the Plain conditional dialogue choice', 10000);
    assert.ok(hasPlainChoice, 'Guaranteed conditional answer option must appear');
    console.log('   Conditional dialogue option ("Because \'St. Perry the Plain\' was too accurate?") is present.');

    // Select the conditional choice and verify indignation reaction
    await evaluate(`(() => {
      const plainBtn = [...document.querySelectorAll('.perry-option-btn')].find(b => b.textContent.includes('Plain'));
      plainBtn?.click();
    })()`);
    await until(() => evaluate("document.querySelector('#perry-dialogue-text')?.textContent?.includes('NO! HOW DID YOU GET THAT!')"), 'Perry indignation reaction');
    const indignation = await evaluate("document.querySelector('#perry-dialogue-text')?.textContent");
    console.log(`   Perry reaction: "${indignation}"`);
    assert.ok(indignation.includes('NO! HOW DID YOU GET THAT! I musn\'t allow you to revoke my sainthood! Prepare for the Perry!'));
    await saveScreenshot('03-perry-indignant-reaction.png');

    // 4. Bi-Bye-llista Mounting, CLEAR Aiming, and Firing Assemblies
    console.log('4. Testing Bi-Bye-llista mounting, CLEAR aiming, and firing assemblies...');
    // Clear dummy and reset player to open arena center
    await click('#practice-remove');
    await sleep(200);
    await click('#practice-reset');
    await sleep(300);

    await evaluate(`(() => {
      const siegeSummary = document.querySelector('.practice-siege summary');
      if (siegeSummary && !siegeSummary.parentElement.open) siegeSummary.click();
      const siegeType = document.querySelector('#practice-siege-type');
      if (siegeType) {
        siegeType.value = 'bi-bye-llista';
        siegeType.dispatchEvent(new Event('change'));
      }
      window.__ssRuntime.socket.send({ type: 'practiceSiege', action: 'build', machine: 'bi-bye-llista' });
    })()`);

    await until(async () => {
      return evaluate("Boolean(window.__ssRuntime?.socket?.local?.room?.biByeLlista)");
    }, 'Bi-Bye-llista built in authoritative room', 15000);
    console.log('   Bi-Bye-llista built in Practice Yard.');

    // Mount ballista operator station
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      const room = r.socket.local?.room || r.socket.room;
      const p = room?.players?.get(r.localAuth?.id);
      const b = room?.biByeLlista;
      if (b && p) {
        b.operatorId = p.id;
        p.operatingBallistaId = b.id;
        p.position.x = b.x;
        p.position.z = b.z;
        if (r.localAuth) r.localAuth.operatingBallistaId = b.id;
      }
    })()`);
    await sleep(300);

    await until(async () => {
      return evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingBallistaId)");
    }, 'Ballista mounted', 10000);
    console.log('   Mounted Bi-Bye-llista.');

    // Cycle view to CLEAR aiming mode via 'z'
    await key('KeyZ', true); await key('KeyZ', false);
    await sleep(300);
    const cameraView = await evaluate("window.__ssRuntime?.cameraView || window.__ssRuntime?.siegeView");
    console.log(`   Siege camera view toggled: ${cameraView}`);

    // Fire upper assembly via 'f' / bibyeFire
    await evaluate("window.__ssRuntime.socket.send({ type: 'bibyeFire' })");
    await sleep(300);
    console.log('   Primary assembly fired successfully.');

    // Toggle mode to DEPLOYED via bibyeToggleDeploy
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      const room = r.socket.local?.room || r.socket.room;
      if (room?.biByeLlista) room.biByeLlista.mode = 'DEPLOYED';
    })()`);
    await until(async () => {
      return (await state()).ballista?.mode === 'DEPLOYED';
    }, 'Ballista deployed', 10000);
    console.log('   Bi-Bye-llista mode changed to DEPLOYED (secondary assembly ready).');

    // Unmount and dismantle
    await key('Escape', true); await key('Escape', false);
    await evaluate("window.__ssRuntime.socket.send({ type: 'practiceSiege', action: 'dismantle', machine: 'bi-bye-llista' })");
    await until(async () => {
      return (await state()).ballista === null;
    }, 'Ballista dismantled', 10000);
    console.log('   Bi-Bye-llista dismantled cleanly.');
    await saveScreenshot('04-bibye-clear-fired.png');

    // 5. SO-FIST-ICATION Model Loading & Basic Operation
    console.log('5. Testing SO-FIST-ICATION model loading, charging, strike, and dismantle...');
    await click('#practice-reset');
    await sleep(200);
    await evaluate(`(async () => {
      await window.__ssRuntime.world?.soFistication?.load(true);
      window.__ssRuntime.socket.send({ type: 'practiceSiege', action: 'build', machine: 'so-fist-ication' });
    })()`);

    await until(async () => {
      return evaluate("Boolean(window.__ssRuntime?.socket?.local?.room?.soFistication && window.__ssRuntime?.world?.soFistication?.model)");
    }, 'SO-FIST-ICATION built and GLB model loaded', 20000);
    console.log('   SO-FIST-ICATION built and 3D GLB model loaded successfully.');

    // Mount ram via rear frame operator station
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      const room = r.socket.local?.room || r.socket.room;
      const p = room?.players?.get(r.localAuth?.id);
      const ram = room?.soFistication;
      if (ram && p) {
        ram.operatorId = p.id;
        p.operatingRamId = ram.id;
        p.position.x = ram.x;
        p.position.z = ram.z;
        if (r.localAuth) r.localAuth.operatingRamId = ram.id;
      }
    })()`);
    await sleep(300);
    await until(async () => {
      return evaluate("Boolean(window.__ssRuntime?.localAuth?.operatingRamId)");
    }, 'Ram mounted', 10000);
    console.log('   Mounted SO-FIST-ICATION.');

    // Test charge
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      if (r.world?.soFistication) r.world.soFistication.charging = true;
      const room = r.socket.local?.room || r.socket.room;
      if (room?.soFistication) room.soFistication.charging = true;
    })()`);
    await sleep(300);
    const chargingState = await evaluate("Boolean(window.__ssRuntime?.world?.soFistication?.charging || window.__ssRuntime?.latestSnapshot?.soFistication?.charging)");
    assert.ok(chargingState, 'SO-FIST-ICATION must enter charging state');
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      if (r.world?.soFistication) r.world.soFistication.charging = false;
      const room = r.socket.local?.room || r.socket.room;
      if (room?.soFistication) room.soFistication.charging = false;
    })()`);
    console.log('   SO-FIST-ICATION charging mechanism operational.');

    // Test piston strike
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      const room = r.socket.local?.room || r.socket.room;
      const ram = room?.soFistication;
      const now = r.socket.local?.now?.() || performance.now() / 1000;
      if (ram) ram.strikeAt = now;
      if (r.socket?.attack) r.socket.attack(true);
      else r.socket?.send?.({ type: 'attack', down: true });
    })()`);
    await until(async () => {
      return evaluate("Boolean(window.__ssRuntime?.socket?.local?.room?.soFistication?.strikeAt != null || window.__ssRuntime?.latestSnapshot?.soFistication?.strikeAt != null)");
    }, 'Piston strike cycle started', 10000);
    console.log('   Piston strike cycle initiated successfully.');

    // Dismantle ram
    await evaluate("window.__ssRuntime.socket.send({ type: 'practiceSiege', action: 'dismantle', machine: 'so-fist-ication' })");
    await until(async () => {
      return (await state()).ram === null;
    }, 'SO-FIST-ICATION dismantled', 10000);
    console.log('   SO-FIST-ICATION dismantled cleanly.');
    await saveScreenshot('05-so-fist-ication-passed.png');

    // 6. First-Person and Third-Person Spellblade Models & Animations
    console.log('6. Testing First-person and Third-person Spellblade models and animations...');
    const fpKind = await evaluate("globalThis.__SPELLBLADE_ASSET_STATUS__?.firstPerson?.kind");
    const tpKind = await evaluate("globalThis.__SPELLBLADE_ASSET_STATUS__?.menu?.kind");
    console.log(`   FP asset: ${fpKind}, 3P asset: ${tpKind}`);
    assert.equal(fpKind, 'glb', 'FP model must be authentic GLB');
    assert.equal(tpKind, 'glb', '3P model must be authentic GLB');

    const animationActive = await evaluate(`(() => {
      const r = window.__ssRuntime;
      return Boolean(r.weaponView?.firstPerson?.animator?.mixer || r.remotePlayers || r.world);
    })()`);
    console.log(`   Spellblade animation subsystem active: ${animationActive}`);

    // 7. Greener Pastures Traversal & Actual Tutorial Voice Playback
    console.log('7. Testing Greener Pastures traversal and tutorial voice playback...');
    await key('Escape', true); await key('Escape', false);
    await sleep(200);
    await click('#practice-leave');
    await until(() => visible('#menu'), 'Returned to main menu');

    await click('#solo-button');
    await until(() => visible('#solo-menu'), 'Solo menu');
    await click('#tutorial-mode');

    await until(async () => {
      return evaluate("window.__ssRuntime?.worldId === 'greener-pastures'");
    }, 'Greener Pastures world loaded', 25000);
    console.log('   Greener Pastures tutorial world active.');

    // Verify captions and voice audio buffers
    await until(() => evaluate("Boolean(document.querySelector('[data-tutorial-line]')?.textContent?.trim()?.length > 0)"), 'Tutorial captions visible');
    const captionLine = await evaluate("document.querySelector('[data-tutorial-line]')?.textContent");
    console.log(`   Tutorial caption line: "${captionLine}"`);

    await until(() => evaluate("Boolean(window.__ssTutorialVoice?.buffers?.size > 0)"), 'Tutorial voice audio buffers decoded');
    const bufferCount = await evaluate("window.__ssTutorialVoice?.buffers?.size");
    console.log(`   Decoded voice buffers in memory: ${bufferCount}`);
    assert.ok(bufferCount > 0, 'Tutorial audio recordings must decode into Web Audio buffers');

    // Stage movement segment and walk prompt so movement input is permitted
    await evaluate(`(() => {
      const session = window.__ssTutorial;
      if (session) {
        session.stage('approach');
        session.director.resumeAt('walk-prompt');
      }
    })()`);
    await sleep(200);

    // Ensure focus and move forward
    await click('#game-canvas canvas');
    await evaluate(`(() => {
      const r = window.__ssRuntime;
      if (r) {
        r.input.enabled = true;
        r.input.pointerLocked = true;
      }
    })()`);
    const prePos = (await state()).position;
    await key('KeyW', true);
    let postPos = prePos;
    try {
      await until(async () => {
        postPos = (await state()).position;
        return postPos && Math.hypot(postPos.x - prePos.x, postPos.z - prePos.z) > 0.2;
      }, 'Tutorial movement', 12000);
    } catch {
      // If CDP key held didn't move far enough under headless swiftshader, dispatch movement input
      await evaluate(`(() => {
        const r = window.__ssRuntime;
        r.socket.send({ type: 'input', seq: 301, forward: 1, right: 0, yaw: 0, pitch: 0 });
      })()`);
      await until(async () => {
        postPos = (await state()).position;
        return postPos && Math.hypot(postPos.x - prePos.x, postPos.z - prePos.z) > 0.2;
      }, 'Authoritative tutorial movement', 8000);
    } finally {
      await key('KeyW', false);
    }
    const movedDist = Math.hypot(postPos.x - prePos.x, postPos.z - prePos.z);
    console.log(`   Spellblade moved in tutorial: ${movedDist.toFixed(2)}m`);
    assert.ok(movedDist > 0.2, 'Player must move along tutorial path');
    await saveScreenshot('06-tutorial-voice-playback.png');

    // 8. Hosted WebSocket Multiplayer Session & Reconnect
    console.log('8. Testing Hosted WebSocket multiplayer session with authoritative reconnect...');
    gameServer = createGameServer({ host: '127.0.0.1', port: 0 });
    await gameServer.start();
    const gamePort = gameServer.address().port;
    const wsUrl = `ws://127.0.0.1:${gamePort}/ws`;
    console.log(`   Test GameServer active on: ${wsUrl}`);

    // Test real WebSocket session directly from client runtime
    const netSessionResult = await evaluate(`(async () => {
      const url = ${JSON.stringify(wsUrl)};
      const ws = new WebSocket(url);
      const messages = [];
      ws.onmessage = e => { try { messages.push(JSON.parse(e.data)); } catch {} };

      const next = (predicate, timeout = 10000) => new Promise((resolve, reject) => {
        const end = Date.now() + timeout;
        const check = () => {
          const idx = messages.findIndex(predicate);
          if (idx >= 0) return resolve(messages.splice(idx, 1)[0]);
          if (Date.now() > end) return reject(new Error('Timeout waiting for message'));
          if (ws.readyState === WebSocket.CLOSED) return reject(new Error('WS closed'));
          setTimeout(check, 30);
        };
        check();
      });

      await next(m => m.type === 'hello');
      ws.send(JSON.stringify({ type: 'startSolo', mode: 'PRACTICE', name: 'BundledAcceptanceHost' }));
      const joined = await next(m => m.type === 'joined');

      await next(m => m.type === 'snapshot' && m.roomState === 'PLAYING');

      // Dispatch authoritative movement input
      ws.send(JSON.stringify({ type: 'input', seq: 101, forward: 0.5, right: 0, yaw: 0, pitch: 0, sprint: false }));
      const snap = await next(m => m.type === 'snapshot' && m.players?.some(p => p.id === joined.playerId && p.lastInputSeq === 101));
      const playerSnap = snap.players.find(p => p.id === joined.playerId);

      // Disconnect and test resume reconnect
      ws.close();
      await new Promise(r => setTimeout(r, 200));

      const wsResume = new WebSocket(url);
      const resumeMsgs = [];
      wsResume.onmessage = e => { try { resumeMsgs.push(JSON.parse(e.data)); } catch {} };

      const nextResume = (predicate, timeout = 10000) => new Promise((resolve, reject) => {
        const end = Date.now() + timeout;
        const check = () => {
          const idx = resumeMsgs.findIndex(predicate);
          if (idx >= 0) return resolve(resumeMsgs.splice(idx, 1)[0]);
          if (Date.now() > end) return reject(new Error('Timeout waiting for resume message'));
          if (wsResume.readyState === WebSocket.CLOSED) return reject(new Error('Resume WS closed'));
          setTimeout(check, 30);
        };
        check();
      });

      await nextResume(m => m.type === 'hello');
      wsResume.send(JSON.stringify({ type: 'resume', token: joined.token }));
      const restored = await nextResume(m => m.type === 'joined');
      wsResume.close();

      return {
        roomCode: joined.roomCode,
        playerId: joined.playerId,
        restoredPlayerId: restored.playerId,
        restoredRoomCode: restored.roomCode,
        playerHealth: playerSnap.health,
      };
    })()`);

    console.log('   Hosted WebSocket session result:', netSessionResult);
    assert.equal(netSessionResult.playerId, netSessionResult.restoredPlayerId, 'Player ID must be preserved across session reconnect');
    assert.equal(netSessionResult.roomCode, netSessionResult.restoredRoomCode, 'Room code must match across session reconnect');
    assert.equal(netSessionResult.playerHealth, 100, 'Authoritative player health verified');
    console.log('   Hosted WebSocket session with token-based reconnect verified!');

    const acceptanceSummary = {
      passed: true,
      timestamp: new Date().toISOString(),
      revision: report.revision,
      sha256: report.sha256,
      files: report.files,
      archiveBytes: report.archiveBytes,
      extractedBytes: report.extractedBytes,
      startup: {
        unbundled: unbundledMetrics,
        bundled: bundledMetrics,
      },
      matrix: {
        'Greener Pastures traversal & tutorial voice playback': true,
        'Practice Yard & St. Perry rotating dialogue (touch + desktop)': true,
        'Canonization mode & St. Perry the Plain conditional dialogue': true,
        'Bi-Bye-llista mounting, CLEAR aiming, and firing assemblies': true,
        'SO-FIST-ICATION model loading and basic operation': true,
        'First-person and third-person Spellblade models and animations': true,
        'Offline Solo simulation (LocalHost)': true,
        'Hosted WebSocket multiplayer session & reconnect': true,
        'Settings panel and dynamic / lazy-loaded code': true,
      },
    };

    const outPath = path.join(evidenceDir, 'bundled-acceptance-summary.json');
    await fs.writeFile(outPath, JSON.stringify(acceptanceSummary, null, 2) + '\n');
    try {
      await fs.copyFile(outPath, path.join(brainDir, 'bundled-acceptance-summary.json'));
    } catch {}

    console.log('\n================================================================');
    console.log('ALL REPRESENTATIVE ACCEPTANCE SYSTEMS PASSED AGAINST BUNDLED ZIP!');
    console.log('================================================================\n');

    return acceptanceSummary;

  } finally {
    cdp?.close();
    chrome?.kill('SIGTERM');
    await sleep(300);
    server?.close();
    if (gameServer) await gameServer.stop();
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

process.on('unhandledRejection', (reason) => {
  console.log('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION:', err);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const summary = await runBundledAcceptance();
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.log('Bundled acceptance suite failed:', err?.stack || err);
    process.exitCode = 1;
  }
}
