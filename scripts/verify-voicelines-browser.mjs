import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function waitFor(fn, label, attempts = 150) {
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
    }, 15000);
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

  // Ensure AudioContext is unlocked and decode sample takes for preview
  const prepStatus = await evalPage(`(async () => {
    const runtime = window.__ssRuntime;
    runtime.sound?.unlock?.();
    const bank = runtime.voice;
    if (bank.engine.ctx?.state === 'suspended') {
      try { await bank.engine.ctx.resume(); } catch {}
    }
    const manifest = await (await fetch('/client/assets/voice/manifest.json')).json();
    for (const id of ['haveYouNoShame', 'notOnMe', 'thenLetMeHaveIt']) {
      if (!bank.has(id)) {
        const takes = manifest.lines[id] ?? [];
        for (const take of takes) {
          const res = await fetch('/client/assets/voice/' + take.file + '.m4a');
          const buf = await bank.engine.ctx.decodeAudioData(await res.arrayBuffer());
          if (!bank.takes.has(id)) bank.takes.set(id, []);
          bank.takes.get(id).push(buf);
        }
      }
    }
    return {
      running: bank.engine.running,
      ctxState: bank.engine.ctx?.state,
      hasTakes: {
        haveYouNoShame: bank.takes.get('haveYouNoShame')?.length ?? 0,
        notOnMe: bank.takes.get('notOnMe')?.length ?? 0,
        thenLetMeHaveIt: bank.takes.get('thenLetMeHaveIt')?.length ?? 0,
      }
    };
  })()`);
  console.log('Audio engine prep status:', prepStatus);

  // Verify preview playback works for lines
  const previewTest = await evalPage(`(async () => {
    const bank = window.__ssRuntime.voice;
    const results = {};
    for (const id of ['haveYouNoShame', 'notOnMe', 'thenLetMeHaveIt']) {
      const played = bank.preview(id);
      results[id] = played;
    }
    return results;
  })()`);
  console.log('Preview playback verification:', previewTest);
  assert.equal(previewTest.haveYouNoShame, true);
  assert.equal(previewTest.notOnMe, true);
  assert.equal(previewTest.thenLetMeHaveIt, true);

  // Test the Shame Scene conversational step in the browser runtime
  const shameExchange = await evalPage(`(async () => {
    const runtime = window.__ssRuntime;
    const scenes = runtime.scenes;
    const spoken = [];
    
    // Wire up runtime hook observer
    const origSay = scenes.say;
    scenes.say = (line, speaker, options) => {
      spoken.push({ line, speaker, options });
      return { seconds: 1.2, delay: 0 };
    };

    const knights = [
      { id: 'knightA', alive: true, position: { x: 0, z: 0 } },
      { id: 'knightB', alive: true, position: { x: 5, z: 0 } }
    ];

    // Trigger shameDeclared
    scenes.shameDeclared('knightA', 'knightB', 10.0, 1.2);
    
    // Step forward past Knight A finish (10.0 + 1.2 + 0.35 = 11.55)
    scenes.step(11.6, knights, (id) => (id === 'knightA' ? { x: 0, z: 0 } : { x: 5, z: 0 }));

    // Step forward past Knight B finish (11.6 + 1.2 + 0.35 = 13.15)
    scenes.step(13.2, knights, (id) => (id === 'knightA' ? { x: 0, z: 0 } : { x: 5, z: 0 }));

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
  const { writeFile } = await import('node:fs/promises');
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
