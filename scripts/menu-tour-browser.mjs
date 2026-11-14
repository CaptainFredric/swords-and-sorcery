// The front door's tour in real Chrome: loads the menu, lets the round run (sped up), and checks every frame that
// nothing has gone wrong out there: the round stalls, a knight stands off the floor or inside something solid, the
// camera is inside a wall or loses the traveller behind one or off the open part of the screen, or the page throws.
// Then it takes stills of each stop (and, with SS_TOUR_SEQUENCE, a frame sequence of one fight) as it plays.
//
//   SS_URL=http://127.0.0.1:3017 node scripts/menu-tour-browser.mjs [--out dir] [--rounds 3] [--speed 3]
//     [--maps castleward,greener-pastures] [--stills] [--sequence galeLiftoff] [--mobile]
//
// Writes <out>/report.json (the issues, grouped, with the first few of each), stills <out>/<map>-r<round>-s<stop>.png
// and the sequence <out>/sequence/NNN.png.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpClient } from './browser-cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const out = option('out', 'output/menu-tour');
const rounds = Number(option('rounds', 3));
const speed = Number(option('speed', 3));
const maps = option('maps', '');
const stills = args.includes('--stills');
const sequence = option('sequence', '');
// --jump <fight id>: skip rounds until one stages it, and start just before it (with --sequence, to film it at once)
const jump = option('jump', '');
// --seq-speed: how fast the tour runs while the sequence is filmed (slower: more frames of it)
const seqSpeed = Number(option('seq-speed', 0.5));
// --leave: once filmed, leave the front door (the Armory) and come back, and report the player's knight before/after
const leave = args.includes('--leave');
const mobile = args.includes('--mobile');
const base = (process.env.SS_URL ?? 'http://127.0.0.1:3017').replace(/\/$/, '');
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 400);
await mkdir(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = await mkdtemp(join(tmpdir(), 'ss-menu-tour-'));
const size = mobile ? [844, 390] : [1280, 720];
const chrome = spawn(chromeBin, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=metal', '--enable-gpu',
  '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--remote-allow-origins=*', `--window-size=${size[0]},${size[1]}`,
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let cdp;
const errors = [];
async function until(fn, label, ms = 60000) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(200); }
  throw new Error(`timed out: ${label}${last ? ` (${last.message})` : ''}`);
}
async function evaluate(expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 120000);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, 60000);
  await writeFile(file, Buffer.from(r.data, 'base64'));
}

// The probe, installed in the page: wraps the round's update so every frame is checked as it is drawn.
const PROBE = String.raw`(async (speed) => {
  const { surfaceHeightAt, segmentAabbHit } = await import('/shared/src/collision.mjs');
  const { CASTLEWARD } = await import('/shared/worlds/castleward.mjs');
  const menu = window.__ssMenu;
  const tour = menu.tour;
  const THREE_V = menu.camera.position.constructor;
  const probe = window.__tourProbe = { issues: {}, samples: 0, frames: 0, rounds: new Set(), maps: new Set(), last: null, stillAt: null, speed };
  const note = (kind, detail) => {
    const entry = probe.issues[kind] ??= { count: 0, first: [] };
    entry.count += 1;
    if (entry.first.length < 6) entry.first.push(detail);
  };
  const solidAt = (world, x, z, y, radius = 0.28) => (world.solids ?? []).find((s) => {
    const [cx, cy, cz] = s.center; const [sx, sy, sz] = s.size;
    if (y + 1.6 <= cy - sy / 2 || y + 0.15 >= cy + sy / 2) return false;
    if (s.axes) return false;
    const dx = Math.max(0, Math.abs(x - cx) - sx / 2); const dz = Math.max(0, Math.abs(z - cz) - sz / 2);
    return Math.hypot(dx, dz) < radius;
  });
  const v = new THREE_V();
  // what it costs: building each world at the dark, and every long frame (with what the round was doing then)
  probe.builds = [];
  probe.longFrames = [];
  const show = menu.tourWorlds.show.bind(menu.tourWorlds);
  menu.tourWorlds.show = (id) => {
    const fresh = !menu.tourWorlds.worlds.has(id);
    const started = performance.now();
    const shown = show(id);
    if (fresh && shown) probe.builds.push({ id, ms: +(performance.now() - started).toFixed(1) });
    return shown;
  };
  let lastFrame = performance.now();
  const watch = (now) => {
    const gap = now - lastFrame;
    lastFrame = now;
    if (gap > 40 && menu.touring) probe.longFrames.push({ ms: +gap.toFixed(1), map: tour.map?.id, phase: tour.lastMoment?.phase, fade: +(tour.travelFade ?? 0).toFixed(2) });
    if (!probe.stopped) requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  const update = tour.update.bind(tour);
  tour.update = (dt) => {
    const view = update(dt * probe.speed);
    if (!view || !menu.touring) return view;
    try { check(dt); } catch (error) { note('probe-error', String(error?.message ?? error)); }
    return view;
  };
  const check = (dt) => {
    probe.frames += 1;
    const world = tour.world ?? CASTLEWARD;
    const map = tour.map?.id ?? 'castleward';
    probe.maps.add(map);
    probe.rounds.add(map + ':' + tour.round);
    const moment = tour.lastMoment;
    const where = { map, round: tour.round, time: +tour.time.toFixed(2), phase: moment?.phase, fight: moment?.fight != null ? tour.fights[moment.fight]?.id : null };
    // the knights on the ground: the traveller, and every rival standing out there
    const knights = [];
    const traveller = tour.traveller?.root ?? menu.characterRoot;
    if (traveller.visible !== false) knights.push(['traveller', traveller]);
    tour.rivals.forEach((r, i) => { if (r && r.holder.visible && !r.shattered && !r.resetPending) knights.push(['rival' + i, r.holder]); });
    for (const [who, object] of knights) {
      object.getWorldPosition(v);
      const { x, y, z } = v;
      if (y > 0.05 || (tour.flying && who === 'traveller')) continue;   // leaping, hovering, flying: in the air on purpose
      const floor = surfaceHeightAt(x, z, y + 0.3, world);
      if (floor === null || Math.abs(floor - y) > 0.12) note('off-floor', { who, x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), floor, ...where });
      const solid = solidAt(world, x, z, y);
      if (solid) note('inside-solid', { who, x: +x.toFixed(2), z: +z.toFixed(2), solid: solid.id ?? solid.kind ?? 'solid', ...where });
    }
    // the camera: never inside anything, and the traveller in sight and on the open part of the screen
    menu.camera.updateMatrixWorld();
    const eye = menu.camera.position.clone();
    const eyeSolid = solidAt(world, eye.x, eye.z, eye.y - 0.8, 0.15);
    if (eyeSolid) note('camera-in-solid', { eye: eye.toArray().map((n) => +n.toFixed(2)), solid: eyeSolid.id, ...where });
    if (traveller.visible !== false && !tour.flying && (tour.travelFade ?? 0) < 0.5) {
      traveller.getWorldPosition(v);
      const chest = v.clone(); chest.y += 1.2;
      const hit = (world.solids ?? []).find((s) => !s.axes && s.size[1] > 0.4 && s.center[1] + s.size[1] / 2 > 0.9 && segmentAabbHit(eye.toArray(), chest.toArray(), s));
      if (hit) note('sightline-blocked', { solid: hit.id ?? hit.kind, ...where });
      const ndc = chest.clone().project(menu.camera);
      const across = (ndc.x + 1) / 2;
      const clear = tour.clear ?? [0.4, 0.96];
      if (ndc.z > 1 || across < clear[0] - 0.06 || across > 1.01 || Math.abs(ndc.y) > 1.02) note('off-screen', { across: +across.toFixed(2), ndcY: +ndc.y.toFixed(2), clear, ...where });
    }
    // a stall: the round's clock stops, or he stands still on a run
    if (probe.last) {
      const p = traveller.getWorldPosition(new THREE_V());
      if (moment?.phase === 'run' && probe.last.phase === 'run' && p.distanceTo(probe.last.p) < 1e-4 && dt > 0) note('stalled-run', where);
      probe.last = { phase: moment?.phase, p, time: tour.time };
    } else probe.last = { phase: moment?.phase, p: traveller.getWorldPosition(new THREE_V()), time: tour.time };
    probe.samples += 1;
  };
  return true;
})`;

try {
  const page = await until(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page'), 'chrome');
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  cdp.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
  cdp.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') errors.push(`console.error: ${e.args?.map((a) => a.value ?? a.description).join(' ')}`); });
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  if (mobile) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  const query = maps ? `&tourMaps=${encodeURIComponent(maps)}` : '';
  const started = Date.now();
  await cdp.send('Page.navigate', { url: `${base}/?debug${query}` });
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'menu', 90000);
  const loaded = Date.now() - started;
  await evaluate(`(()=>{const o=document.querySelector('[data-tutorial-onboarding-skip]');if(o&&o.offsetParent)o.click();return true})()`);
  await until(() => evaluate('Boolean(window.__ssMenu?.touring)'), 'the tour starting', 60000);
  const touring = Date.now() - started;
  await evaluate(`${PROBE}(${speed})`);
  // what the player's own knight and loadout are, before anything happens out there (checked again after: --leave)
  const KNIGHT = `(()=>{const m=__ssMenu,i=m.assetInstance;const meshes=[];i?.root.traverse(o=>{if(o.isMesh)meshes.push([o.name,o.visible,(Array.isArray(o.material)?o.material:[o.material]).map(x=>x?.uuid).join('+')])});
    return {cloth:m.cloth??null,emblem:m.emblem??null,rootVisible:m.characterRoot.visible,parentIsStage:m.characterRoot.parent===m.stage,
      storage:Object.fromEntries(Object.keys(localStorage).filter(k=>!/session|room|herald-seen/i.test(k)).sort().map(k=>[k,localStorage.getItem(k)])),meshes:meshes.filter(x=>x[1]).map(x=>x[0]).join(',')}})()`;
  const knightBefore = await evaluate(KNIGHT);
  if (jump) {
    const at = await evaluate(`(async()=>{const t=__ssMenu.tour;for(let i=0;i<14&&!t.fights.some(f=>f.id==='${jump}');i+=1){t.time=t.schedule.duration-0.001;await new Promise(r=>setTimeout(r,150));}
      const k=t.fights.findIndex(f=>f.id==='${jump}');if(k<0)return null;const ph=t.schedule.phases.find(p=>p.kind==='fight'&&p.fight===k);t.lastMoment=null;t.time=Math.max(0,ph.start-2.5);return {round:t.round,stop:k,map:t.map?.id};})()`);
    console.error('jumped to', JSON.stringify(at));
    if (sequence) await evaluate(`__tourProbe.speed = ${seqSpeed}`);
  }
  // let it run: `rounds` rounds on each map (counted by the probe)
  const want = rounds * (maps ? maps.split(',').length : 1);
  const timeLimit = Date.now() + Math.max(120000, want * 75000 / speed);
  let lastClock = -1; let stuckFor = 0;
  const seqDir = join(out, 'sequence');
  let seqIndex = 0;
  let sequenceDone = false;
  const taken = new Set();
  while (Date.now() < timeLimit) {
    const state = await evaluate(`(()=>{const t=__ssMenu.tour,m=t.lastMoment;return {rounds:__tourProbe.rounds.size,time:t.time,round:t.round,map:t.map?.id??'castleward',phase:m?.phase,fight:m?.fight,fightId:m?.fight!=null?t.fights[m.fight]?.id:null,fightTime:m?.fight!=null?m.fightTimes[m.fight]:null,frames:__tourProbe.frames}})()`);
    if (sequence ? sequenceDone : state.rounds > want) break;
    stuckFor = state.frames === lastClock ? stuckFor + 1 : 0;
    lastClock = state.frames;
    if (stuckFor > 25) { errors.push(`menu loop stalled at ${JSON.stringify(state)}`); break; }
    if (stills && state.phase === 'fight') {
      const key = `${state.map}-r${state.round}-s${state.fight}`;
      const fight = await evaluate(`__ssMenu.tour.fights[${state.fight}].duration`);
      if (!taken.has(key) && state.fightTime > fight * 0.45) {
        taken.add(key);
        await shot(join(out, `${key}-${state.fightId}.png`));
      }
    }
    if (sequence && state.fightId === sequence && state.fightTime > -1) {
      await mkdir(seqDir, { recursive: true });
      await shot(join(seqDir, `${String(seqIndex++).padStart(3, '0')}-t${state.fightTime.toFixed(2)}.png`));
      const duration = await evaluate(`__ssMenu.tour.fights[${state.fight}].duration`);
      if (state.fightTime > duration + 0.4) { sequenceDone = true; break; }
    }
    await sleep(sequence && state.fightId === sequence ? 40 : 250);
  }
  let knightAfter = null;
  let knightBack = null;
  if (leave) {
    // the round handed over (or not), the player leaves the front door: his own knight, as he was
    knightAfter = await evaluate(`(()=>({traveller:__ssMenu.tour.cast?.traveller,handovers:__ssMenu.tour.cast?.handovers}))()`);
    await evaluate("document.querySelector('#armory-button, [data-screen=\"armory\"], .armory-tab')?.click(); true");
    await sleep(2500);
    knightAfter.inArmory = await evaluate(KNIGHT);
    await shot(join(out, 'left-to-armory.png'));
    await evaluate("document.querySelector('#armory-back').click(); true");
    await sleep(4000);
    knightBack = await evaluate(KNIGHT);
    knightBack.round = await evaluate(`(()=>({touring:__ssMenu.touring,traveller:__ssMenu.tour.cast?.traveller,map:__ssMenu.tour.map?.id,world:__ssMenu.tourWorlds?.activeId}))()`);
    await shot(join(out, 'back-on-front-door.png'));
  }
  const report = await evaluate(`(()=>{const p=__tourProbe;return {frames:p.frames,samples:p.samples,rounds:[...p.rounds],maps:[...p.maps],issues:p.issues,builds:p.builds,longFrames:p.longFrames.slice(0,40),longFrameCount:p.longFrames.length}})()`);
  const perf = await evaluate(`(()=>{const r=__ssMenu.renderer.info;return {calls:r.render.calls,triangles:r.render.triangles,geometries:r.memory.geometries,textures:r.memory.textures,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null}})()`);
  // frame times at real speed, over three seconds
  await evaluate('__tourProbe.speed = 1');
  const frameTimes = await evaluate(`new Promise((done)=>{const times=[];let last=performance.now();const tick=(now)=>{times.push(now-last);last=now;if(times.length<180)requestAnimationFrame(tick);else{times.sort((a,b)=>a-b);done({median:+times[90].toFixed(1),p95:+times[171].toFixed(1),worst:+times[179].toFixed(1)});}};requestAnimationFrame(tick);})`);
  const counted = {};
  for (const e of errors) counted[e.split('\n')[0]] = (counted[e.split('\n')[0]] ?? 0) + 1;
  const result = { loadedMs: loaded, touringMs: touring, ...report, perf, frameTimes, errors: counted, knightBefore, knightAfter, knightBack };
  await writeFile(join(out, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, issues: Object.fromEntries(Object.entries(result.issues).map(([k, v]) => [k, v.count])) }, null, 2));
} finally {
  cdp?.close();
  chrome.kill('SIGTERM');
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
