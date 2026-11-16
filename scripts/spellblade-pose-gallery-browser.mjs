// Tick-by-tick, many-angle stills of the Spellblade as Castleward really composes him: a real game server, a real Chrome
// (GPU), the Castleward inspection yard, the action started by real key presses, then the simulation frozen through the
// game link (so the held input stays held) and advanced one 30 Hz tick at a time. After each tick the knight is drawn
// by the game's own renderer from fixed cameras around him (front, his right, his left, behind, a close view of the
// sword arm) and through his own eyes (first person), and the skinned right arm is measured as drawn:
//   - the surface stretch of the Gauntlet.R and Breastplate triangles nearest the sword arm (skinned edge length over
//     bind length; a jagged, crumpled arm shows as edges squashed or stretched far past their bind length),
//   - the elbow angle, the wrist fold (forearm against the blade), the hand's distance from the sword's grip,
//   - the clip and clip time the animator holds.
//
//   node scripts/spellblade-pose-gallery-browser.mjs --scenario chain|guard|idle|walk|sprint|run-chain|riposte|whirl|sunder
//        [--glb candidate.glb] [--ticks 60] [--views front,right,left,rear,arm,fp] [--out dir] [--label name]
//
// --glb serves a candidate third-person GLB in place of the installed one (scripts/lib/spellbladeCandidate.mjs).
// Sheets need ImageMagick (magick).
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGameServer } from '../server/src/server.mjs';
import { CdpClient } from './browser-cdp.mjs';
import { candidateInfo, substituteSpellblade } from './lib/spellbladeCandidate.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const scenario = option('--scenario', 'chain');
const candidate = candidateInfo(option('--glb', null));
const ticks = Number(option('--ticks', scenario === 'idle' ? '8' : scenario === 'guard' ? '24' : '72'));
const views = option('--views', 'front,right,left,rear,arm,fp').split(',');
const label = option('--label', `${scenario}-${candidate ? candidate.sha256.slice(0, 8) : 'main'}`);
const out = option('--out', join('output', 'spellblade-pose-gallery', label));
const bin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1280, H = 720;
const technique = scenario === 'riposte' ? 'rigid_riposte' : scenario === 'whirl' ? 'whirl_wind' : null;

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'frames'), { recursive: true });
const game = createGameServer({ host: '127.0.0.1', port: 0 });
await game.start();
const url = `http://127.0.0.1:${game.address().port}`;
const pageErrors = [];
let stage = 'chrome', chrome = null, cdp = null, profile = null;
const poll = async (fn, what, ms = 90000) => {
  stage = what;
  const until = Date.now() + ms;
  while (Date.now() < until) { const v = await fn().catch(() => null); if (v) return v; await sleep(120); }
  throw new Error(`timed out: ${what}`);
};
const evaluate = async (expression, timeoutMs = 30000) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
};
const KEYS = { attack: ['f', 'KeyF', 70], guard: ['g', 'KeyG', 71], technique: ['x', 'KeyX', 88], ultimate: ['r', 'KeyR', 82],
  forward: ['w', 'KeyW', 87], sprint: ['Shift', 'ShiftLeft', 16] };
const key = (down, action) => { const [k, code, vk] = KEYS[action]; return cdp.send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };

try {
  profile = await mkdtemp(join(tmpdir(), 'castleward-gallery-'));
  chrome = spawn(bin, ['--headless=new', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--remote-allow-origins=*', `--window-size=${W},${H}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  let port = null;
  chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) port = Number(m[1]); });
  await poll(async () => port, 'chrome debugger port');
  const page = await poll(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'), 'page target');
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown', (e) => pageErrors.push(e.exceptionDetails?.exception?.description?.slice(0, 300) ?? e.exceptionDetails?.text));
  cdp.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') pageErrors.push(e.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)); });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const served = await substituteSpellblade(cdp, candidate);
  await cdp.send('Page.navigate', { url: `${url}/?debug` });
  await poll(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')", 5000), 'menu', 120000);
  await evaluate("document.querySelector('[data-tutorial-onboarding-skip]')?.click()");
  await evaluate(`(() => { const s = window.__ssSettings.settings; s.set('loadout.spell', 'fireball'); s.set('loadout.ultimate', 'sunder');
    if (${JSON.stringify(technique)}) s.set('loadout.technique', ${JSON.stringify(technique)}); })()`);
  await evaluate("window.__ssLink.startInspectionPractice('Pose Gallery','castleward'); window.__ssLink.arenaReady(true)");
  await poll(() => evaluate('Boolean(window.__ssLink?.playingLocally && window.__ssRuntime?.playing && window.__ssRuntime?.localAuth && window.__ssRuntime?.remotePlayers?.self?.visualInstance)', 5000), 'inspection yard and the knight', 120000);
  await sleep(1200);
  await evaluate("document.querySelector('#practice-drawer-close')?.click()");
  // turned down the longest stretch of level floor, so the run and the cameras have room
  await evaluate(`(async () => {
    const { surfaceHeightAt } = await import('/shared/src/collision.mjs');
    const rt = window.__ssRuntime, me = rt.localAuth, world = window.__ssLink.local.room.world;
    let best = { yaw: 0, run: -1 };
    for (let k = 0; k < 16; k += 1) {
      const yaw = k * Math.PI / 8; let run = 0;
      const h = (d) => surfaceHeightAt(me.position.x - Math.sin(yaw) * d, me.position.z - Math.cos(yaw) * d, me.position.y + 1, world);
      while (run < 40 && h(run + 1) !== null && Math.abs(h(run + 1) - me.position.y) < 0.3) run += 1;
      if (run > best.run) best = { yaw, run };
    }
    rt.input.yaw = best.yaw; rt.input.pitch = 0;
    rt.setInspectionUiMode('clean');
    // (the knight's own body is posed only while it is drawn: the split view draws it beside the first-person pane)
    rt.setInspectionSplit(true);
  })()`);
  const centre = { x: W * 0.25, y: H * 0.5 };
  await cdp.send('Page.bringToFront');
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...centre, button: 'left', clickCount: 1 });
  await poll(() => evaluate('window.__ssRuntime.input.enabled', 4000), 'input enabled');
  await sleep(2600); // (the click's own swing over)
  if (scenario === 'sunder') await evaluate('(() => { const rt = window.__ssRuntime; window.__ssLink.stageInspectionActor({ actorId: rt.localAuth.id, vitals: { refill: true }, ultimate: "sunder" }); })()');

  // the measuring and drawing, installed once in the page
  await evaluate(`(() => {
    const rt = window.__ssRuntime;
    const shell = () => rt.remotePlayers.self;
    const root = () => shell().root;
    const find = (name) => { let hit = null; root().traverse((o) => { if (!hit && o.name === name) hit = o; }); return hit; };
    const wp = (o) => { const v = o.getWorldPosition(new rt.camera.position.constructor()); return v; };
    const V = rt.camera.position.constructor;
    // the arm's surface: unique triangle edges of the meshes that skin to the right arm, with their bind lengths
    const arm = { meshes: [] };
    root().traverse((o) => {
      if (!o.isSkinnedMesh || !['GauntletR', 'Breastplate', 'PauldronR'].includes(o.name)) return;
      const g = o.geometry, pos = g.attributes.position, idx = g.index, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const bones = o.skeleton.bones.map((b) => b.name);
      const armBones = new Set(['upper_armR', 'forearmR', 'handR', 'elbowR', 'pauldronR', 'clavicleR'].map((n) => bones.indexOf(n)).filter((i) => i >= 0));
      const onArm = (v) => { let w = 0; for (let c = 0; c < 4; c += 1) if (armBones.has(si.getComponent(v, c))) w += sw.getComponent(v, c); return w > 0.5; };
      const seen = new Set(), edges = [];
      const tri = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < tri; t += 1) {
        const v = [0, 1, 2].map((k) => idx ? idx.getX(t * 3 + k) : t * 3 + k);
        if (!v.every(onArm)) continue;
        for (const [a, b] of [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]) {
          const keyAB = a < b ? a * 1e6 + b : b * 1e6 + a; if (seen.has(keyAB)) continue; seen.add(keyAB);
          const pa = new V().fromBufferAttribute(pos, a), pb = new V().fromBufferAttribute(pos, b);
          const rest = pa.distanceTo(pb); if (rest > 1e-5) edges.push([a, b, rest]);
        }
      }
      const verts = [...new Set(edges.flatMap(([a, b]) => [a, b]))];
      arm.meshes.push({ mesh: o, edges, verts });
    });
    window.__gallery = { arm, shots: [] };
    window.__galleryMeasure = () => {
      root().updateMatrixWorld(true);
      const ratios = [];
      for (const m of arm.meshes) {
        const cache = new Map();
        const at = (v) => { if (!cache.has(v)) cache.set(v, m.mesh.getVertexPosition(v, new V()).applyMatrix4(m.mesh.matrixWorld)); return cache.get(v); };
        for (const [a, b, rest] of m.edges) ratios.push({ r: at(a).distanceTo(at(b)) / rest, mesh: m.mesh.name });
      }
      ratios.sort((x, y) => x.r - y.r);
      const q = (p) => ratios.length ? +ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))].r.toFixed(3) : null;
      const bad = ratios.filter((x) => x.r < 0.7 || x.r > 1.4);
      const byMesh = {}; for (const x of bad) byMesh[x.mesh] = (byMesh[x.mesh] ?? 0) + 1;
      const u = find('upper_armR'), f = find('forearmR'), h = find('handR'), sock = find('socket_sword');
      const pu = wp(u), pf = wp(f), ph = wp(h);
      const a1 = pf.clone().sub(pu).normalize(), a2 = ph.clone().sub(pf).normalize();
      // the blade's direction: the sword socket's +Y in the world (the grip runs along it)
      const q4 = sock.getWorldQuaternion(new rt.camera.quaternion.constructor());
      const blade = new V(0, 1, 0).applyQuaternion(q4).normalize();
      const deg = (x) => +(Math.acos(Math.max(-1, Math.min(1, x))) * 180 / Math.PI).toFixed(1);
      const sh0 = shell; const animator = shell().visualInstance?.animator;
      if (window.__galleryDebug) return { debug: { shellKeys: Object.keys(sh0()), vi: Object.keys(sh0().visualInstance ?? {}), animator: animator ? Object.keys(animator).slice(0, 40) : null,
        attack: rt.localAuth?.attack ?? null, action: rt.localAuth?.action ?? null, held: rt.input.held?.('attack'), state: rt.localAuth ? Object.keys(rt.localAuth).filter((k) => /attack|swing|slash|combo|guard/i.test(k)) : null,
        frozen: rt.socket.inspectionFrozen, enabled: rt.input.enabled, stretchSample: arm.meshes.map((m) => m.mesh.name + ':' + m.mesh.skeleton?.bones.length) } };
      return {
        clip: animator?.activeClip ?? null, clipTime: animator?.activeAction ? +animator.activeAction.time.toFixed(3) : null,
        server: +rt.socket.serverNow().toFixed(3), tick: rt.latestSnapshot?.tick ?? null,
        elbowBend: deg(a1.dot(a2)), wristToBlade: deg(a2.dot(blade)),
        handToGrip: +ph.distanceTo(wp(sock)).toFixed(3),
        feet: ['footL', 'footR'].map((n) => { const p = wp(find(n)); return [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]; }),
        root: (() => { const p = root().position; return [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]; })(),
        stretch: { edges: ratios.length, p01: q(0.01), p50: q(0.5), p99: q(0.99), min: q(0), max: q(0.999999), bad: bad.length, byMesh },
      };
    };
    window.__galleryShoot = async (views) => {
      const sh = shell(), self = sh.root, me = rt.localAuth;
      self.updateMatrixWorld(true);
      const yaw = me.yaw ?? rt.input.yaw, f = new V(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new V(Math.cos(yaw), 0, -Math.sin(yaw)), up = new V(0, 1, 0);
      const base = self.getWorldPosition(new V());
      const chest = base.clone().add(new V(0, 1.15, 0));
      const hand = wp(find('handR')), shoulder = wp(find('upper_armR'));
      const elbow = wp(find('forearmR'));
      const armMid = hand.clone().add(elbow).multiplyScalar(0.5).lerp(shoulder, 0.2);
      const cam = new rt.camera.constructor(40, ${W} / ${H}, 0.05, 200);
      const placements = {
        front: [chest.clone().add(f.clone().multiplyScalar(3.4)).add(up.clone().multiplyScalar(0.25)), chest],
        right: [chest.clone().add(r.clone().multiplyScalar(3.4)).add(up.clone().multiplyScalar(0.25)), chest],
        left: [chest.clone().add(r.clone().multiplyScalar(-3.4)).add(up.clone().multiplyScalar(0.25)), chest],
        rear: [chest.clone().add(f.clone().multiplyScalar(-3.4)).add(up.clone().multiplyScalar(0.25)), chest],
        arm: [armMid.clone().add(f.clone().multiplyScalar(0.55)).add(r.clone().multiplyScalar(0.85)).add(up.clone().multiplyScalar(0.2)), armMid],
      };
      const shots = {};
      const fpParts = [rt.weapon?.group, rt.weapon?.palmLight].filter(Boolean);
      const wasSelf = self.visible, wasFp = fpParts.map((o) => o.visible);
      const canvas = rt.renderer.domElement;
      const encode = async (c) => { const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
        return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); }); };
      const small = new OffscreenCanvas(640, 360), g = small.getContext('2d');
      const grab = () => { g.drawImage(canvas, 0, 0, 640, 360); return encode(small); };
      // first person: the game's own actor pane (the split view's left half) as the game drew it this frame, its
      // first-person arms in their own pass; read in a frame callback queued after the game's own
      if (views.includes('fp')) {
        const fpc = new OffscreenCanvas(480, 540), fg = fpc.getContext('2d');
        await new Promise((res) => requestAnimationFrame(() => { fg.drawImage(canvas, 0, 0, canvas.width / 2, canvas.height, 0, 0, 480, 540); res(); }));
        shots.fp = await encode(fpc);
      }
      try {
        rt.renderer.setScissorTest(false);
        rt.renderer.setViewport(0, 0, canvas.clientWidth || ${W}, canvas.clientHeight || ${H});
        for (const v of views) {
          if (v === 'fp') continue;
          {
            const [eye, look] = placements[v];
            self.visible = true; fpParts.forEach((o) => { o.visible = false; });
            cam.position.copy(eye); cam.lookAt(look); cam.updateMatrixWorld(true);
            rt.renderer.render(rt.scene, cam);
          }
          shots[v] = await grab();
        }
      } finally { self.visible = wasSelf; fpParts.forEach((o, i) => { o.visible = wasFp[i]; }); }
      return shots;
    };
  })()`);

  // The yard's frame stepping replays the input the knight held when it froze (a frozen host takes no new input), so
  // the keys are pressed in real time and the yard frozen the moment the simulation has begun the action: the held
  // keys then go on driving every step, as they would at full speed.
  stage = 'press';
  const hold = { chain: ['attack'], 'run-chain': ['forward', 'sprint', 'attack'], walk: ['forward'], sprint: ['forward', 'sprint'], guard: ['guard'], idle: [], riposte: ['technique'],
    whirl: ['technique'], sunder: ['ultimate'] }[scenario];
  if (!hold) throw new Error(`unknown scenario ${scenario}`);
  const begun = { chain: 'me.attackActive', 'run-chain': 'me.attackActive', walk: 'Math.hypot(me.velocity.x, me.velocity.z) > 1', sprint: 'Math.hypot(me.velocity.x, me.velocity.z) > 5', guard: 'me.guarding', idle: 'true',
    riposte: 'me.swordTechnique', whirl: 'me.swordTechnique', sunder: 'me.ultimateState' }[scenario];
  if (scenario === 'run-chain') { await key(true, 'forward'); await key(true, 'sprint'); await sleep(1100); await key(true, 'attack'); }
  else for (const a of hold) await key(true, a);
  const pressedAt = await evaluate('window.__ssRuntime.socket.serverNow()');
  await poll(() => evaluate(`(() => { const me = window.__ssLink.local.room.players.get(window.__ssRuntime.playerId); return Boolean(${begun}); })()`, 2000), `${scenario} begun`, 8000);
  // (a tap is let go as soon as it has begun, and the release given two frames to reach the host before the freeze)
  if (scenario === 'riposte') { for (const a of hold) await key(false, a); await sleep(40); }
  // (Sunder: the brace is begun by the tap; its slams are the ordinary cuts while Attack is held, the first landing
  // firstSlamLead after the commit, so Attack is held from here on)
  if (scenario === 'sunder') { await key(false, 'ultimate'); await key(true, 'attack'); hold.push('attack'); await sleep(40); }
  await evaluate('window.__ssLink.setInspectionFrozen(true)');
  const frozenAt = await evaluate('window.__ssRuntime.socket.serverNow()');
  await sleep(150);
  if (process.env.GALLERY_DEBUG) await evaluate('window.__galleryDebug = true');
  const rows = [];
  const raf = () => evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  for (let t = 0; t <= ticks; t += 1) {
    stage = `tick ${t}`;
    if (t > 0) await evaluate('window.__ssLink.stepInspection()');
    await raf(); await sleep(30); await raf();
    const m = await evaluate('window.__galleryMeasure()');
    const shots = await evaluate(`window.__galleryShoot(${JSON.stringify(views)})`, 60000);
    for (const [v, data] of Object.entries(shots)) await writeFile(join(out, 'frames', `${v}-${String(t).padStart(3, '0')}.jpg`), Buffer.from(data, 'base64'));
    rows.push({ t, ...m });
    if (m.debug) { console.log(JSON.stringify(m.debug)); continue; }
    process.stdout.write(`\r${label} tick ${t}/${ticks} ${m.clip}@${m.clipTime} stretch p01 ${m.stretch.p01} p99 ${m.stretch.p99} bad ${m.stretch.bad}   `);
  }
  for (const a of hold) await key(false, a);
  console.log();
  const summary = { pressedAt, frozenAt, scenario, label, candidate: candidate ? { sha256: candidate.sha256, served: served.count } : null,
    installed: candidate ? null : 'client/assets/characters/spellblade/spellblade.glb', views, ticks, pageErrors, rows };
  await writeFile(join(out, 'gallery.json'), JSON.stringify(summary, null, 1));
  const worst = rows.reduce((w, r) => (r.stretch.bad > (w?.stretch.bad ?? -1) ? r : w), null);
  console.log('[POSE GALLERY]', JSON.stringify({ label, candidate: summary.candidate, ticks: rows.length, pageErrors: pageErrors.length,
    clips: [...new Set(rows.map((r) => r.clip))], worstStretchTick: worst ? { t: worst.t, clip: worst.clip, clipTime: worst.clipTime, ...worst.stretch } : null }));
  if (spawnSync('magick', ['-version']).status === 0) {
    for (const v of views) {
      const files = rows.map((r) => join(out, 'frames', `${v}-${String(r.t).padStart(3, '0')}.jpg`));
      const labelled = rows.map((r) => `t${r.t} ${r.clip ?? ''}@${r.clipTime ?? ''}`);
      const argv = ['montage', '-font', '/System/Library/Fonts/Helvetica.ttc', '-pointsize', '16', '-fill', '#eee'];
      files.forEach((f, i) => argv.push('-label', labelled[i], f));
      argv.push('-tile', '6x', '-geometry', '320x180+2+2', '-background', '#111', join(out, `${label}-${v}-sheet.jpg`));
      spawnSync('magick', argv, { stdio: 'inherit' });
    }
  }
} catch (error) {
  console.error('\n[POSE GALLERY FAIL]', stage, error.stack, pageErrors.slice(0, 5));
  process.exitCode = 1;
} finally {
  cdp?.close();
  chrome?.kill('SIGTERM');
  await sleep(200);
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
  await game.stop?.();
  process.exit(process.exitCode ?? 0);
}
