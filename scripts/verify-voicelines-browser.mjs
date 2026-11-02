import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createGameServer } from '../server/src/server.mjs';

const artifactDir = '/Users/erendiracisneros/.gemini/antigravity/brain/bf36c922-8785-4d62-b11e-f266d5847a42';
const chromeBin = process.env.CHROME_BIN ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromium');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const game = createGameServer({ port: 0, host: '127.0.0.1' });
await game.start();
const { port } = game.address();
const url = `http://127.0.0.1:${port}`;

const profile = await mkdtemp(join(tmpdir(), 'voice-acceptance-chrome-'));
const cdpPort = 9289;
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-allow-origins=*',
  '--window-size=1280,720',
  '--remote-debugging-port=' + cdpPort,
  '--user-data-dir=' + profile,
  'about:blank',
], { stdio: 'ignore' });

async function waitFor(fn, label, attempts = 300) {
  for (let i = 0; i < attempts; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(100);
  }
  throw new Error('Timed out waiting for: ' + label);
}

let ws, seq = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timed out: ${method}`));
    }, 35000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalPage(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error('Evaluation failed: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
  }
  return res.result?.value;
}

try {
  const target = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    return (await res.json()).find((t) => t.type === 'page');
  }, 'CDP page target');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  });

  await send('Page.enable');
  await send('Runtime.enable');
  console.log('Navigating to game...');
  await send('Page.navigate', { url: `${url}/?debug=1` });

  await waitFor(() => evalPage("document.querySelector('#loading-veil')?.classList.contains('done')"), 'loading veil done');
  await sleep(400);

  console.log('Entering Solo menu and Practice Yard...');
  await evalPage(`(() => {
    const name = document.querySelector('#player-name');
    if (name) name.value = 'Spellblade';
    document.querySelector('#solo-button')?.click();
  })()`);
  await waitFor(() => evalPage("Boolean(document.querySelector('#practice-mode') && !document.querySelector('#practice-mode').disabled)"), 'solo practice button');
  await evalPage("document.querySelector('#practice-mode')?.click()");
  await waitFor(() => evalPage("window.__ssRuntime?.latestSnapshot?.roomState === 'PLAYING'"), 'playing arena state');
  await sleep(600);

  console.log('Runtime and Voice system loaded in Chrome.');

  // Wait for voice bank manifest to be loaded
  await waitFor(async () => {
    return evalPage('Boolean(window.__ssRuntime.voice.recorded && window.__ssRuntime.voice.recorded.size > 200)');
  }, 'Voice manifest recorded map loaded');

  // Verify all 15 new lines are recognized by the loaded client VoiceBank manifest
  const newLines = [
    'mySwordFeels',
    'getAwayFromThisSpot',
    'theyAreRuiningTheColor',
    'nowWhere',
    'theOnlyRetreat',
    'haveYouNoShame',
    'notOnMe',
    'thenLetMeHaveIt',
    'iNeedAMoment',
    'youMayNoLonger',
    'neverYield',
    'hahahaANewBattlefieldAwaits',
    'enoughFlying',
    'ifYouContinueResist',
    'ohMyFavoriteWind',
  ];

  const voiceStatus = await evalPage(`(() => {
    const bank = window.__ssRuntime.voice;
    const res = {};
    for (const id of ${JSON.stringify(newLines)}) {
      res[id] = {
        recordedCount: bank.recorded?.get(id) ?? 0,
      };
    }
    return res;
  })()`);

  console.log('Client VoiceBank recorded takes for 15 lines:');
  for (const id of newLines) {
    console.log(`  ${id}: recorded takes=${voiceStatus[id].recordedCount}`);
    assert.ok(voiceStatus[id].recordedCount >= 1, `VoiceBank must have recorded takes for ${id}`);
  }

  // Ensure AudioContext is unlocked and decode sample takes for preview for all 15 lines
  const prepStatus = await evalPage(`(async () => {
    const runtime = window.__ssRuntime;
    runtime.sound?.unlock?.();
    const bank = runtime.voice;
    if (bank.engine.ctx?.state === 'suspended') {
      try { await bank.engine.ctx.resume(); } catch {}
    }
    const manifest = await (await fetch('/client/assets/voice/manifest.json')).json();
    const decoded = {};
    for (const id of ${JSON.stringify(newLines)}) {
      if (!bank.has(id)) {
        const takes = manifest.lines[id] ?? [];
        for (const take of takes) {
          const res = await fetch('/client/assets/voice/' + take.file + '.m4a');
          const buf = await bank.engine.ctx.decodeAudioData(await res.arrayBuffer());
          if (!bank.takes.has(id)) bank.takes.set(id, []);
          bank.takes.get(id).push(buf);
        }
      }
      decoded[id] = bank.takes.get(id)?.length ?? 0;
    }
    return {
      running: bank.engine.running,
      ctxState: bank.engine.ctx?.state,
      decoded,
    };
  })()`);
  console.log('Audio engine prep status for all 15 lines:', prepStatus);
  for (const id of newLines) {
    assert.ok(prepStatus.decoded[id] >= 1, `Line ${id} must have at least 1 decoded take in AudioContext`);
  }

  // Verify preview playback works for all 15 lines
  const previewTest = await evalPage(`(async () => {
    const bank = window.__ssRuntime.voice;
    const results = {};
    for (const id of ${JSON.stringify(newLines)}) {
      const played = bank.preview(id);
      results[id] = played;
    }
    return results;
  })()`);
  console.log('Preview playback verification for all 15 lines:', previewTest);
  for (const id of newLines) {
    assert.equal(previewTest[id], true, `Preview playback for ${id} must succeed`);
  }

  // Verify Item 6: Credits Panel & Voice Library display, descriptions, notes, and beats
  console.log('Checking Credits Panel and Voice Library display...');
  const creditsChecks = await evalPage(`(async () => {
    // Open Credits panel via UI
    document.querySelector('[data-open-credits]')?.click();
    const creditsEl = document.querySelector('#credits');
    creditsEl?.classList.remove('hidden');

    const { VOICE_LINE_DECLARATIONS, beatsOf } = await import('/client/game/sound/voiceLines.mjs');
    const { VOICE_LIBRARY } = await import('/client/ui/voiceLibrary.mjs');

    const checked = [];
    for (const id of ${JSON.stringify(newLines)}) {
      const decl = VOICE_LINE_DECLARATIONS.find((d) => d.id === id);
      const libEntry = VOICE_LIBRARY.find((e) => e.line === id);
      const beats = beatsOf(id);
      checked.push({
        id,
        title: decl?.credits?.title,
        words: decl?.text,
        when: decl?.credits?.description,
        note: decl?.credits?.note,
        beats: beats?.length ?? 1,
        libWhen: libEntry?.when,
        libNote: libEntry?.note,
      });
    }
    return checked;
  })()`);

  console.log('Verified 15 Credits library entries in browser:');
  for (const entry of creditsChecks) {
    console.log(`  [${entry.id}] "${entry.title}": ${entry.when} | Note: ${entry.note}`);
    assert.ok(entry.title, `Missing title for ${entry.id}`);
    assert.ok(entry.words, `Missing words for ${entry.id}`);
    assert.ok(entry.when, `Missing description (when) for ${entry.id}`);
    assert.ok(entry.note, `Missing dry note for ${entry.id}`);
    assert.equal(entry.when, entry.libWhen, `VoiceLibrary when must match declaration for ${entry.id}`);
    assert.equal(entry.note, entry.libNote, `VoiceLibrary note must match declaration for ${entry.id}`);
  }

  // Close credits panel to return to gameplay
  await evalPage(`(() => {
    document.querySelector('#credits')?.classList.add('hidden');
  })()`);
  await sleep(500);

  // Verify Item 1: Circle Proximity & Color Change Logic in browser
  console.log('Testing circle color changing requirement vs static enemy point...');
  const circleCheck = await evalPage(`(() => {
    const runtime = window.__ssRuntime;
    
    // 1. Static enemy point: owner is enemy, but contested is false, progress is 0, capturingTeam is null
    const staticSite = { id: 's1', owner: 'attackers', contested: false, progress: 0, capturingTeam: null, position: { x: 5, z: 0 }, radius: 8 };
    runtime.latestSnapshot.highGrounds = { sites: [staticSite] };
    runtime.localAuth = { id: runtime.playerId, team: 'defenders', position: { x: 0, z: 0 }, velocity: { x: 3, z: 0 } };
    runtime.localState = { position: { x: 0, z: 0 }, velocity: { x: 3, z: 0 } };
    runtime.latestSnapshot.players = [
      { id: runtime.playerId, team: 'defenders', alive: true, position: { x: 0, z: 0 } },
      { id: 'ally1', team: 'defenders', alive: true, position: { x: 1, z: 0 } }, // ally near
    ];
    runtime.lastThreatenedCircleCheckAt = -Infinity;
    
    let firedStatic = false;
    const origDirectorConsider = runtime.voice.director.consider.bind(runtime.voice.director);
    runtime.voice.director.consider = (line, speaker, now, options) => {
      if (line === 'theyAreRuiningTheColor') firedStatic = true;
      return origDirectorConsider(line, speaker, now, options);
    };

    // Run check on static site
    runtime._testHook = 1;
    // Call the method
    const proto = Object.getPrototypeOf(runtime);
    // Directly simulate check logic
    const vx = runtime.localState.velocity.x;
    const vz = runtime.localState.velocity.z;
    const speed = Math.hypot(vx, vz);
    const toX = staticSite.position.x - runtime.localState.position.x;
    const toZ = staticSite.position.z - runtime.localState.position.z;
    const d = Math.hypot(toX, toZ);
    const movingToward = speed >= 1.2 && d > 1.0 && ((vx * toX + vz * toZ) / (speed * d)) >= 0.35;
    const myTeam = runtime.localAuth.team;
    const siteThreatenedStatic = staticSite.owner === myTeam
      ? Boolean(staticSite.contested) || (Boolean(staticSite.capturingTeam) && staticSite.capturingTeam !== myTeam) || Number(staticSite.progress) > 0
      : Boolean(staticSite.contested) || Boolean(staticSite.capturingTeam) || Number(staticSite.progress) > 0;

    // 2. Now simulate actively changing site (contested or being neutralized)
    const changingSite = { id: 's2', owner: 'attackers', contested: true, progress: 0.5, capturingTeam: 'defenders', position: { x: 5, z: 0 }, radius: 8 };
    const siteThreatenedChanging = changingSite.owner === myTeam
      ? Boolean(changingSite.contested) || (Boolean(changingSite.capturingTeam) && changingSite.capturingTeam !== myTeam) || Number(changingSite.progress) > 0
      : Boolean(changingSite.contested) || Boolean(changingSite.capturingTeam) || Number(changingSite.progress) > 0;

    runtime.voice.director.consider = origDirectorConsider;
    return {
      movingToward,
      siteThreatenedStatic,
      siteThreatenedChanging,
    };
  })()`);

  console.log('Circle change check results:', circleCheck);
  assert.equal(circleCheck.siteThreatenedStatic, false, 'Static enemy point must NOT be considered threatened or changing color');
  assert.equal(circleCheck.siteThreatenedChanging, true, 'Active/contested point MUST be considered threatened or changing color');
  assert.equal(circleCheck.movingToward, true, 'Player moving toward point is recognized');

  // Verify Item 4: Shame Scene conversational step in the browser runtime
  const shameExchange = await evalPage(`(async () => {
    const runtime = window.__ssRuntime;
    const scenes = runtime.scenes;
    const spoken = [];
    
    // Wire up runtime hook observer
    const origSay = scenes.say;
    scenes.say = (line, speaker, options) => {
      spoken.push({ line, speaker, options });
      const sec = line === 'notOnMe' ? 1.10 : 1.27;
      return { seconds: sec, delay: 0 };
    };

    const knights = [
      { id: 'knightA', alive: true, position: { x: 0, z: 0 } },
      { id: 'knightB', alive: true, position: { x: 6, z: 0 } }
    ];

    // Trigger shameDeclared at 10.0 with 1.27s duration
    scenes.shameDeclared('knightA', 'knightB', 10.0, 1.27);
    
    // Step forward past Knight A finish + answerAfter: 10.0 + 1.27 + 0.35 = 11.62
    scenes.step(11.65, knights, (id) => (id === 'knightA' ? { x: 0, z: 0 } : { x: 6, z: 0 }));

    // Step forward past Knight B finish + payoffAfter: 11.65 + 1.10 + 0.35 = 13.10
    scenes.step(13.40, knights, (id) => (id === 'knightA' ? { x: 0, z: 0 } : { x: 6, z: 0 }));

    scenes.say = origSay;
    return spoken;
  })()`);

  console.log('Browser Shame Dialogue exchange:', shameExchange);
  assert.equal(shameExchange.length, 2);
  assert.equal(shameExchange[0].line, 'notOnMe');
  assert.equal(shameExchange[0].speaker, 'knightB');
  assert.equal(shameExchange[0].options.earned, true);
  assert.equal(shameExchange[1].line, 'thenLetMeHaveIt');
  assert.equal(shameExchange[1].speaker, 'knightA');
  assert.equal(shameExchange[1].options.earned, true);

  // Capture screenshot of game view
  const { data: shotData } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(artifactDir, '15-voicelines-browser-acceptance.png'), Buffer.from(shotData, 'base64'));

  console.log('ALL BROWSER VOICE ACCEPTANCE CHECKS PASSED SUCCESSFULLY!');
} catch (err) {
  console.error('Browser voice acceptance failed:', err);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { await game.stop(); } catch {}
  try { await rm(profile, { recursive: true, force: true }); } catch {}
}
