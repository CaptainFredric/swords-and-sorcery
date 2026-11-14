// Real-game world capture: launches each arena through the game's own menus in headless Chrome, lets the live match
// (bots and all) run, then records what the renderer costs (draw calls, triangles, frame times, memory) and screenshots
// fixed viewpoints. The viewpoints are a camera placed over the live scene (the match keeps running underneath); the
// player-eye shots move only the camera, never a body, so nothing about the match is staged.
//
//   CHROME_BIN=... SS_URL=http://127.0.0.1:3017 node scripts/world-capture-browser.mjs restless-day [--mobile] [--out dir]
//
// Writes <out>/<world>[-mobile]/NN-<view>.png and metrics.json.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpClient } from './browser-cdp.mjs';

const args = process.argv.slice(2);
const worldId = args.find((a) => !a.startsWith('--')) ?? 'castleward';
const mobile = args.includes('--mobile');
const outIndex = args.indexOf('--out');
const outRoot = outIndex >= 0 ? args[outIndex + 1] : 'output/world-capture';
const base = (process.env.SS_URL ?? 'http://127.0.0.1:3017').replace(/\/$/, '');
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 400);
const out = join(outRoot, `${worldId}${mobile ? '-mobile' : ''}`);
await mkdir(out, { recursive: true });

// How each arena is reached through the menus, and the views worth keeping: [name, camera xyz, look-at xyz].
export const LAUNCH = {
  'castleward': { solo: 'bot-duel', arena: 'castleward' },
  'ruined-keep': { solo: 'bot-duel', arena: 'ruined-keep' },
  'edge-of-victory': { solo: 'edge-of-victory-mode', world: 'ruined-keep' },
  'court-of-merit': { solo: 'renown-trials-mode', renown: 'court-of-merit' },
  'bastion-breach': { mettle: 'BREAKTHROUGH', arena: 'bastion-breach' },
  'outerworks': { mettle: 'BREAKTHROUGH', arena: 'outerworks' },
  'blackbell-foundry': { mettle: 'BREAKTHROUGH', arena: 'blackbell-foundry' },
  'high-grounds': { mettle: 'HIGH_GROUNDS', arena: 'high-grounds' },
  'restless-day': { mettle: 'RESTLESS_DAY', arena: 'restless-day' },
};
const VIEWS = JSON.parse(process.env.SS_VIEWS ?? 'null') ?? {
  'restless-day': [
    ['overview', [44, 70, -120], [0, 0, -10]],
    ['muster', [0, 14, -112], [0, 0, -70]],
    ['approach-eye', [-6, 1.6, -45], [0, 3, -24]],
    ['outer-walk', [-12, 7.6, -23.6], [12, 6.5, -23.6]],
    ['courtyard', [-22, 9, -18], [6, 0, 10]],
    ['inner-court', [0, 9, 28], [0, 3, 56]],
    ['renowner-eye', [0, 1.6, 40], [0, 4, 56]],
  ],
  'court-of-merit': [
    ['overview', [30, 34, -36], [0, 0, 0]],
    ['tribunal-eye', [0, 1.6, -8], [0, 4, 16]],
    ['gallery', [-21, 3.4, -16], [0, 1, 6]],
    ['north-corner', [-14, 1.6, 6], [-14, 0.5, 16]],
  ],
  'ruined-keep': [
    ['overview', [22, 26, -22], [0, 0, 0]],
    ['ward-eye', [0, 1.6, -11], [0, 1, 4]],
    ['breach', [-4, 3, -8], [-12, 0, -6]],
  ],
  'edge-of-victory': [
    ['overview', [22, 26, -22], [0, 0, -1]],
    ['final-ring', [0, 9, -12], [0, 0, -1]],
    ['ward-eye', [0, 1.6, -11], [0, 1, 4]],
  ],
  'castleward': [['overview', [40, 40, -40], [0, 0, 0]], ['green-eye', [0, 1.6, -6], [0, 1.5, 10]]],
  'bastion-breach': [['overview', [40, 45, -50], [0, 0, 0]], ['gatehouse-rear', [10, 4, 20], [2, 0, 10]]],
  'blackbell-foundry': [['overview', [40, 45, -50], [0, 0, 0]], ['portal-rear', [10, 4, 20], [2, 0, 10]]],
  'outerworks': [['overview', [50, 55, -70], [0, 0, 0]], ['barbican', [-19, 3, 40], [-10, 0, 47]]],
  'high-grounds': [['overview', [80, 70, -140], [0, 0, 0]], ['crown', [0, 4, -18], [0, 0, 0]]],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = await mkdtemp(join(tmpdir(), 'ss-world-capture-'));
const size = mobile ? [844, 390] : [1280, 800];
// SS_PERF=1: frames are not held to the display's refresh, so frame times measure the work, not vsync
const perfFlags = process.env.SS_PERF ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [];
const chrome = spawn(chromeBin, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=metal', '--enable-gpu', ...perfFlags,
  '--ignore-gpu-blocklist', '--remote-allow-origins=*', `--window-size=${size[0]},${size[1]}`, `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let cdp;
const errors = [];
async function until(fn, label, ms = 60000) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(200); }
  throw new Error(`timed out: ${label}${last ? ` (${last.message})` : ''}`);
}
async function evaluate(expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 60000);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, 60000);
  await writeFile(join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
}

try {
  const page = await until(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page'), 'chrome');
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  cdp.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  if (mobile) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  // SS_CPU_THROTTLE=4: the page's main thread runs this many times slower (a phone's CPU, roughly)
  if (Number(process.env.SS_CPU_THROTTLE) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.SS_CPU_THROTTLE) });
  await cdp.send('Page.navigate', { url: `${base}/?debug` });
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'menu', 90000);
  await evaluate(`(()=>{const o=document.querySelector('[data-tutorial-onboarding-skip]');if(o&&o.offsetParent)o.click();
    const n=document.querySelector('#player-name');if(n)n.value='World Capture';return true})()`);
  const how = LAUNCH[worldId];
  if (how.mettle) {
    await evaluate("document.querySelector('#breakthrough-button').click()");
    await until(() => evaluate("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"), 'mettle menu');
    await evaluate(`document.querySelector('[data-mettle-mode=${how.mettle}]').click()`);
    await sleep(300);
    await evaluate(`(()=>{document.querySelector('#breakthrough-arena [data-arena="${how.arena}"]')?.click();
      document.querySelector('#breakthrough-size [data-size="3"]')?.click();
      document.querySelector('#breakthrough-team [data-team="ATTACKERS"]')?.click();
      document.querySelector('#breakthrough-play-bots').click();return true})()`);
  } else {
    await evaluate("document.querySelector('#solo-button').click()");
    await until(() => evaluate("!document.querySelector('#solo-menu')?.classList.contains('hidden')"), 'solo menu');
    await evaluate(`(()=>{document.querySelector('#${how.solo}')?.click();
      ${how.arena ? `document.querySelector('#solo-arena [data-arena="${how.arena}"]')?.click();` : ''}
      ${how.renown ? `document.querySelector('[data-renown-arena="${how.renown}"]')?.click();` : ''}
      document.querySelector('#solo-launch')?.click();return true})()`);
  }
  const expect = how.world ?? how.arena ?? how.renown;
  // a bot duel now waits in its lobby for the player to press Start Bot Duel
  if (how.solo === 'bot-duel') {
    await until(() => evaluate("(()=>{const b=document.querySelector('#copy-link');return Boolean(b&&!b.classList.contains('hidden')&&!b.disabled&&/START BOT DUEL/.test(b.textContent))})()"), 'bot duel lobby', 60000);
    // (it takes pointer lock, which needs a real input event on a page in front)
    await cdp.send('Page.bringToFront');
    const [bx, by] = await evaluate("(()=>{const r=document.querySelector('#copy-link').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: bx, y: by, button: 'left', clickCount: 1 });
  }
  await until(() => evaluate(`(()=>{const r=window.__ssRuntime,s=r?.latestSnapshot;return s?.roomState==='PLAYING'&&s?.worldId==='${expect}'})()`), 'live match', 120000);
  // an optional staged setup, named in the output (SS_SETUP: JS run in the page once the match is live, e.g. to wind
  // Edge of Victory's clock to a later ring); never used for the default before/after captures
  if (process.env.SS_SETUP) { await evaluate(process.env.SS_SETUP); await sleep(1500); }
  // SS_PROBE: an expression evaluated in the live match, its value printed (what is that on the horizon?)
  if (process.env.SS_PROBE) console.log('[probe]', JSON.stringify(await evaluate(process.env.SS_PROBE)));
  // the camera override and per-frame accounting (installed once; renders still come from the game's own loop)
  await evaluate(`(()=>{const r=window.__ssRuntime,R=r.renderer;R.info.autoReset=false;
    const render=R.render.bind(R);window.__cap={view:null,frames:0,calls:0,tris:0,dts:[],last:performance.now()};
    R.render=(scene,camera)=>{const v=window.__cap.follow?.()??window.__cap.view;if(v&&camera===r.camera&&!(camera.layers.mask&1))return;if(v&&camera===r.camera){camera.position.set(...v.from);camera.lookAt(...v.to);
      camera.far=Math.max(camera.far,400);camera.updateProjectionMatrix();camera.updateMatrixWorld();}render(scene,camera)};
    const tick=(t)=>{const c=window.__cap;c.dts.push(t-c.last);c.last=t;c.frames++;c.calls+=R.info.render.calls;c.tris+=R.info.render.triangles;R.info.reset();requestAnimationFrame(tick)};
    requestAnimationFrame(tick);return true})()`);
  await sleep(4000);
  const measure = async (ms) => {
    await evaluate("(()=>{const c=window.__cap;c.frames=0;c.calls=0;c.tris=0;c.dts=[];return true})()");
    await sleep(ms);
    return evaluate(`(()=>{const c=window.__cap,R=window.__ssRuntime.renderer,d=c.dts.slice(1).sort((a,b)=>a-b);
      const q=(p)=>d.length?+d[Math.min(d.length-1,Math.floor(d.length*p))].toFixed(1):null;
      return {frames:c.frames,fps:+(1000*c.frames/${ms}).toFixed(1),medianMs:q(.5),p95Ms:q(.95),
        drawCallsPerFrame:Math.round(c.calls/Math.max(1,c.frames)),trianglesPerFrame:Math.round(c.tris/Math.max(1,c.frames)),
        geometries:R.info.memory.geometries,textures:R.info.memory.textures,programs:R.info.programs?.length??null,
        shadowMapSize:window.__ssRuntime.scene?.children?.find?.(o=>o.isDirectionalLight)?.shadow?.mapSize?.x??null,
        heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,
        pixelRatio:R.getPixelRatio(),size:[R.domElement.width,R.domElement.height]}})()`);
  };
  const metrics = { worldId, mobile, url: base, at: new Date().toISOString(), staged: process.env.SS_SETUP ?? null,
    perf: Boolean(process.env.SS_PERF), cpuThrottle: Number(process.env.SS_CPU_THROTTLE) || 1, playerView: await measure(5000), views: {} };
  await shot('00-player');
  const views = VIEWS[worldId] ?? [['overview', [40, 40, -40], [0, 0, 0]]];
  for (const [i, [name, from, to]] of views.entries()) {
    await evaluate(`window.__cap.view={from:${JSON.stringify(from)},to:${JSON.stringify(to)}};
      if(!document.querySelector('#cap-clean')){const s=document.createElement('style');s.id='cap-clean';
        s.textContent='body *{visibility:hidden!important}canvas{visibility:visible!important}';document.head.append(s)}true`);
    await sleep(900);
    metrics.views[name] = await measure(1500);
    await shot(`${String(i + 1).padStart(2, '0')}-${name}`);
  }
  await evaluate("window.__cap.view=null;document.querySelector('#cap-clean')?.remove();true");
  // SS_FOLLOW: a page-side function body returning {from, to} each frame (a chase camera on the live match);
  // SS_FRAMES frames are saved SS_FRAME_MS apart into <out>/frames for a short gameplay clip
  if (process.env.SS_FOLLOW) {
    await mkdir(join(out, 'frames'), { recursive: true });
    await evaluate(`window.__cap.follow=new Function(${JSON.stringify(process.env.SS_FOLLOW)});
      if(!document.querySelector('#cap-clean')){const s=document.createElement('style');s.id='cap-clean';
        s.textContent='body *{visibility:hidden!important}canvas{visibility:visible!important}';document.head.append(s)}true`);
    const count = Number(process.env.SS_FRAMES ?? 60), gap = Number(process.env.SS_FRAME_MS ?? 160);
    for (let i = 0; i < count; i++) {
      const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 78 }, 60000);
      await writeFile(join(out, 'frames', `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(r.data, 'base64'));
      await sleep(gap);
    }
    await evaluate("window.__cap.follow=null;document.querySelector('#cap-clean')?.remove();true");
  }
  // where the triangles are: the world renderer's own meshes, largest first
  metrics.worldMeshes = await evaluate(`(()=>{const g=window.__ssRuntime.world?.group;const out=[];g?.traverse(o=>{if(!o.isMesh)return;
    const geo=o.geometry;const n=geo.index?geo.index.count/3:(geo.attributes.position?.count??0)/3;out.push([o.name||o.parent?.name||'?',Math.round(n*(o.isInstancedMesh?o.count:1)),o.castShadow])});
    out.sort((a,b)=>b[1]-a[1]);return {meshes:out.length,triangles:out.reduce((s,m)=>s+m[1],0),shadowCasters:out.filter(m=>m[2]).reduce((s,m)=>s+m[1],0),top:out.slice(0,12)}})()`);
  metrics.state = await evaluate(`(()=>{const r=window.__ssRuntime,s=r.latestSnapshot;return {players:s.players.length,alive:s.players.filter(p=>p.alive).length,
    renderer:r.world?.constructor?.name,mode:s.mode}})()`);
  metrics.errors = errors;
  await writeFile(join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify({ worldId, mobile, playerView: metrics.playerView, errors: errors.length }));
} catch (e) {
  console.error('[WORLD CAPTURE FAILED]', worldId, e.message);
  if (cdp) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  cdp?.close(); chrome.kill('SIGTERM'); await sleep(400); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
