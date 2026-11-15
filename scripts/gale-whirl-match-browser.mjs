// Gale-assisted Whirl in an ordinary online match, in real Chrome: not the Practice Yard (whose Prowess is pinned full).
// A real game server (in this process), two real Chromes joined to one private FFA room by its code, the match started by
// their ready checks. Between trials the server-side knight is placed and given its starting Prowess (the only thing the
// harness sets; the match's own rules do the rest), then the actor's browser holds X (the technique) and Space (Jump)
// through its real keyboard input, and optionally W (to drift off a ledge).
//
// Each trial reports, from the server (authoritative) and from the actor's page (what that player saw):
//   revolutions, Prowess before/after, the climb, how long airborne, where it landed, how it ended, any damage taken,
//   and the gap between the actor's predicted height and the server's (the rubber band, if prediction does not know
//   the lift).
//
//   node scripts/gale-whirl-match-browser.mjs [--out dir] [--only open-100,...] [--world id] [--ledge x,y,z,yaw]
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGameServer } from '../server/src/server.mjs';
import { CdpClient } from './browser-cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const out = option('--out', join('output', 'gale-whirl-match'));
const only = option('--only', null)?.split(',');
const worldId = option('--world', 'castleward');
const ledge = option('--ledge', null)?.split(',').map(Number);
const bin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// the trials: where the knight stands, which way he faces, the Prowess he starts with, the keys held and for how long
const OPEN = { x: 14, y: 0, z: 2 };          // the tourney ground: open sky
const UNDER_ARCH = { x: 0, y: 1.125, z: 15.8 }; // on the castle ramp, under the gate arch (its underside 4.6 m)
const BAILEY = { x: 5, y: 2.5, z: 18.2 };  // on the bailey, 1 m behind its front retaining wall (a 2.5 m drop to the approach), clear of the wall ramps
const TRIALS = [
  ...[0, 25, 50, 75, 100].map((prowess) => ({ id: `open-${prowess}`, at: OPEN, yaw: 0, prowess, hold: 3.6, keys: ['x', 'space'] })),
  { id: 'open-100-tap-jump', at: OPEN, yaw: 0, prowess: 100, hold: 3.6, keys: ['x'], jumpFor: 0.9 },
  { id: 'ceiling-100', at: UNDER_ARCH, yaw: 0, prowess: 100, hold: 3.6, keys: ['x', 'space'] },
  { id: 'ledge-100', at: ledge ? { x: ledge[0], y: ledge[1], z: ledge[2] } : BAILEY, yaw: ledge ? ledge[3] : 0, prowess: 100, hold: 3.6, keys: ['x', 'space', 'w'] },
  { id: 'ledge-0-no-jump', at: ledge ? { x: ledge[0], y: ledge[1], z: ledge[2] } : BAILEY, yaw: ledge ? ledge[3] : 0, prowess: 0, hold: 1.6, keys: ['x', 'w'] },
].filter((t) => !only || only.includes(t.id));

const KEYS = { x: { key: 'x', code: 'KeyX', vk: 88 }, space: { key: ' ', code: 'Space', vk: 32 }, w: { key: 'w', code: 'KeyW', vk: 87 } };

await mkdir(out, { recursive: true });
const game = createGameServer({ host: '127.0.0.1', port: 0 });
await game.start();
const url = `http://127.0.0.1:${game.address().port}`;
const poll = async (fn, what, ms = 90000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { const v = await fn().catch(() => null); if (v) return v; await sleep(120); }
  throw new Error(`timed out: ${what}`);
};
const pageErrors = [];

async function browser(name, metrics) {
  const profile = await mkdtemp(join(tmpdir(), `castleward-gale-${name}-`));
  const chrome = spawn(bin, ['--headless=new', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
    '--remote-allow-origins=*', `--window-size=${metrics.width},${metrics.height}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  let port = null;
  chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); });
  await poll(async () => port, `${name}: chrome debugger port`);
  const page = await poll(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'), `${name}: page target`);
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.on('Page.javascriptDialogOpening', () => { cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
  cdp.on('Runtime.exceptionThrown', (e) => pageErrors.push(`${name}: ${e.exceptionDetails?.exception?.description?.slice(0, 300) ?? e.exceptionDetails?.text}`));
  cdp.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') pageErrors.push(`${name}: ${e.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)}`); });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: metrics.width, height: metrics.height, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression, timeoutMs = 30000) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  await cdp.send('Page.navigate', { url: `${url}/?debug` });
  await poll(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')", 5000), `${name}: menu`, 120000);
  await evaluate("document.querySelector('[data-tutorial-onboarding-skip]')?.click()");
  return { name, cdp, evaluate, async close() { cdp.close(); chrome.kill('SIGTERM'); await sleep(200); await rm(profile, { recursive: true, force: true }).catch(() => {}); } };
}

const browsers = [];
const results = [];
try {
  const actor = await browser('actor', { width: 1280, height: 720 });
  browsers.push(actor);
  await actor.evaluate(`(() => { const s = window.__ssSettings.settings; s.set('loadout.spell', 'gale'); try { s.set('loadout.technique', 'whirl_wind'); } catch {} })()`);
  await poll(() => actor.evaluate("window.__ssLink.status === 'online' || window.__ssLink.remote?.connected", 4000), 'actor online', 30000).catch(() => null);
  await actor.evaluate(`window.__ssLink.createRoom('Actor', { worldId: ${JSON.stringify(worldId)} })`);
  const code = await poll(() => actor.evaluate('window.__ssLink.roomCode', 4000), 'room created');
  const viewer = await browser('viewer', { width: 1280, height: 720 });
  browsers.push(viewer);
  await viewer.evaluate(`window.__ssLink.joinRoom(${JSON.stringify(code)}, 'Viewer')`);
  await poll(() => viewer.evaluate(`window.__ssLink.roomCode === ${JSON.stringify(code)}`, 4000), 'viewer joined');
  for (const b of browsers) await b.evaluate('window.__ssLink.ready(true); window.__ssLink.arenaReady(true)');
  const room = await poll(async () => game.roomManager.findByCode(code), 'server room');
  await poll(async () => room.state === 'PLAYING' || room.state === 'ACTIVE' || room.state === 'IN_PROGRESS' || (room.state !== 'WAITING' && room.state !== 'COUNTDOWN'), `match started (state ${room.state})`, 60000);
  for (const b of browsers) await poll(() => b.evaluate('Boolean(window.__ssRuntime?.playing && window.__ssRuntime?.localAuth)', 5000), `${b.name}: playing`, 60000);
  const a = [...room.players.values()].find((p) => p.name === 'Actor');
  const v = [...room.players.values()].find((p) => p.name === 'Viewer');
  const matchFacts = { code, world: room.worldId, mode: room.mode, state: room.state, practice: room.mode === 'PRACTICE', actorSpell: a.spell, actorTechnique: a.technique };
  console.log('[MATCH]', JSON.stringify(matchFacts));
  // the viewer, out of the way and harmless
  Object.assign(v.position, { x: 30, y: 0, z: -14 });
  for (const b of browsers) {
    await b.cdp.send('Page.bringToFront');
    const centre = await b.evaluate("(() => { const r = window.__ssRuntime.renderer.domElement.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
    for (const type of ['mousePressed', 'mouseReleased']) await b.cdp.send('Input.dispatchMouseEvent', { type, ...centre, button: 'left', clickCount: 1 });
    await sleep(900);
    await poll(() => b.evaluate('window.__ssRuntime.input.enabled', 4000), `${b.name}: input enabled`).catch(() => null);
  }
  await actor.cdp.send('Page.bringToFront');
  await sleep(1500);
  // the actor's page: what its player sees of its own height, each frame (predicted and authoritative)
  await actor.evaluate(`(() => { const rt = window.__ssRuntime; const rec = window.__gale = { on: false, rows: [] };
    const tick = () => { requestAnimationFrame(tick); if (!rec.on) return; const me = rt.latestSnapshot?.players.find((p) => p.id === rt.playerId);
      rec.rows.push({ wall: performance.now(), shown: rt.localState?.position?.y ?? null, snapshot: me?.position?.y ?? null, error: rt.predictionError ?? null,
        technique: me?.swordTechnique?.phase ?? null, revolutions: me?.swordTechnique?.revolutions ?? null }); };
    requestAnimationFrame(tick); })()`);

  const key = (k, down) => actor.cdp.send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: KEYS[k].key, code: KEYS[k].code, windowsVirtualKeyCode: KEYS[k].vk, ...(down && k === 'space' ? { text: ' ' } : {}) });
  for (const trial of TRIALS) {
    // place the knight and give him the trial's Prowess (server side: everything after this is the match's own rules)
    const place = () => {
      a.position = { ...trial.at }; a.velocity = { x: 0, y: 0, z: 0 }; a.impulse = { x: 0, z: 0 }; a.grounded = true; a.yaw = trial.yaw;
      a.swordTechnique = null; a.swordTechniqueExit = null; a.swordTechniqueReadyAt = 0; a.staggerUntil = 0; a.dashReadyAt = 0;
      a.health = a.maxHealth ?? 100; a.prowess = trial.prowess; a.spell = 'gale'; a.technique = 'whirl_wind';
    };
    place();
    await actor.evaluate(`(() => { const rt = window.__ssRuntime; rt.input.yaw = ${trial.yaw}; rt.input.pitch = 0; })()`);
    await sleep(1200);
    place();
    await sleep(400);
    const before = { prowess: a.prowess, y: a.position.y, health: a.health, readyAt: a.swordTechniqueReadyAt };
    const server = [];
    const t0 = game.now();
    const sampler = setInterval(() => server.push({ t: +(game.now() - t0).toFixed(3), x: +a.position.x.toFixed(3), y: +a.position.y.toFixed(3), vy: +(a.velocity?.y ?? 0).toFixed(2), grounded: a.grounded,
      phase: a.swordTechnique?.phase ?? null, revolutions: a.swordTechnique?.revolutions ?? null, prowess: a.prowess, health: a.health, galeLift: a.swordTechnique?.galeLift ?? null, z: +a.position.z.toFixed(3) }), 1000 / 60);
    await actor.evaluate('window.__gale.rows = []; window.__gale.on = true');
    for (const k of trial.keys) await key(k, true);
    if (trial.jumpFor) { await sleep(trial.jumpFor * 1000); await key('space', true); await sleep(trial.jumpFor * 1000); await key('space', false); await sleep((trial.hold - 2 * trial.jumpFor) * 1000); }
    else await sleep(trial.hold * 1000);
    for (const k of trial.keys) await key(k, false);
    await poll(async () => a.grounded && !a.swordTechnique && game.now() - t0 > trial.hold + 0.3, `${trial.id}: landed`, 12000).catch(() => null);
    await sleep(600);
    clearInterval(sampler);
    const page = await actor.evaluate('(() => { window.__gale.on = false; return window.__gale.rows; })()');
    const active = server.filter((s) => s.phase);
    const air = server.filter((s) => !s.grounded);
    const peak = server.reduce((m, s) => (s.y > m.y ? s : m), server[0]);
    const maxRev = Math.max(0, ...server.map((s) => s.revolutions ?? 0));
    const landed = server.at(-1);
    const shownGap = Math.max(0, ...page.filter((r) => r.shown != null && r.snapshot != null).map((r) => Math.abs(r.shown - r.snapshot)));
    const result = {
      trial: trial.id, keys: trial.keys.join('+'), prowessBefore: before.prowess, prowessAfter: landed.prowess, spent: before.prowess - landed.prowess,
      revolutions: maxRev, techniqueSec: +(active.length / 60).toFixed(2), climb: +(peak.y - before.y).toFixed(2), peakY: peak.y,
      airborneSec: +(air.length / 60).toFixed(2), landedY: landed.y, landedGrounded: landed.grounded, endedAt: landed.phase ?? 'ended',
      healthLost: before.health - landed.health, cooldownReadyIn: +(a.swordTechniqueReadyAt - game.now()).toFixed(2),
      maxPredictedVsSnapshotGapM: +shownGap.toFixed(2), pageFrames: page.length,
      ceilingContact: trial.id.startsWith('ceiling') ? Math.max(...server.map((s) => s.y)) : undefined,
    };
    results.push(result);
    console.log('[TRIAL]', JSON.stringify(result));
    await writeFile(join(out, `${trial.id}.json`), JSON.stringify({ trial, before, result, server, page }, null, 1));
    await sleep(800);
  }
  await writeFile(join(out, 'summary.json'), JSON.stringify({ match: matchFacts, results, pageErrors }, null, 1));
  console.log('[SUMMARY]', JSON.stringify({ trials: results.length, pageErrors }));
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await game.stop?.().catch?.(() => {});
  process.exit(0);
}
