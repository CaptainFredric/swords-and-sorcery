// Restless Day's bot siege in the real game: launched through the menus in headless Chrome, the human left idle,
// the bots playing on the browser's own authoritative host. Every two seconds the drawn ladders are compared with the
// authoritative ladders (where each lies, stands deployed or rides on its carrier's shoulder) and each carrier's drawn
// rig with his authoritative body; a chase camera follows the siege's leading ladder for a short clip.
//
//   CHROME_BIN=... SS_URL=http://127.0.0.1:3017 node scripts/restless-day-siege-browser.mjs [seconds=150] [--out dir]

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpClient } from './browser-cdp.mjs';

const args = process.argv.slice(2);
const seconds = Number(args.find((a) => /^\d+$/.test(a)) ?? 150);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : 'output/restless-day-siege';
const base = (process.env.SS_URL ?? 'http://127.0.0.1:3017').replace(/\/$/, '');
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9700 + Math.floor(Math.random() * 200);
await mkdir(join(out, 'frames'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = await mkdtemp(join(tmpdir(), 'ss-siege-'));
const chrome = spawn(chromeBin, ['--headless=new', '--no-sandbox', '--use-angle=metal', '--enable-gpu', '--remote-allow-origins=*',
  '--window-size=1280,800', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let cdp;
const errors = [];
const until = async (fn, label, ms = 90000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(200); } throw new Error(`timed out: ${label} ${last?.message ?? ''}`); };
const evaluate = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 60000); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };

// what is drawn against what is so: ladders (the renderer's groups) and carriers (their rigs)
const COMPARE = `(()=>{const r=window.__ssRuntime,room=window.__ssLink?.local?.room,w=r?.world;if(!room?.restlessDay||!w?.ladders)return null;
  const s=room.restlessDay,now=r.socket.serverNow();const out={t:+(now-room.matchStartedAt).toFixed(1),phase:s.phase,ladders:[],carriers:[]};
  for(const l of s.ladders){const g=w.ladders.get(l.id);
    out.ladders.push({id:l.id,state:l.state,auth:[l.position.x,l.position.y,l.position.z].map(v=>+v.toFixed(2)),
      drawn:g?[g.position.x,g.position.y,g.position.z].map(v=>+v.toFixed(2)):null,visible:g?g.visible!==false:false});}
  for(const p of room.players.values()){if(!p.restlessCarrying||!p.alive)continue;
    const rig=p.id===r.playerId?r.remotePlayers?.self:r.remotePlayers?.rigs?.get(p.id);const at=rig?.root?.position;
    out.carriers.push({id:p.id,auth:[p.position.x,p.position.y,p.position.z].map(v=>+v.toFixed(2)),drawn:at?[at.x,at.y,at.z].map(v=>+v.toFixed(2)):null});}
  return out;})()`;

try {
  const page = await until(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page'), 'chrome');
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  cdp.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `${base}/?debug` });
  await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"), 'menu');
  await evaluate(`(()=>{const o=document.querySelector('[data-tutorial-onboarding-skip]');if(o&&o.offsetParent)o.click();document.querySelector('#player-name').value='Idle Witness';document.querySelector('#breakthrough-button').click();return true})()`);
  await until(() => evaluate("!document.querySelector('#breakthrough-menu').classList.contains('hidden')"), 'mettle menu');
  await evaluate("document.querySelector('[data-mettle-mode=RESTLESS_DAY]').click();true");
  await sleep(300);
  await evaluate("document.querySelector('#breakthrough-play-bots').click();true");
  await until(() => evaluate(`(()=>{const r=window.__ssRuntime,s=r?.latestSnapshot;return s?.roomState==='PLAYING'&&s?.mode==='RESTLESS_DAY'&&r.world?.constructor?.name==='RestlessDayRenderer'})()`), 'live Restless Day', 120000);
  // a chase camera on the leading ladder (its carrier, or where it stands), the HUD hidden for the clip
  await evaluate(`(()=>{const r=window.__ssRuntime,R=r.renderer,render=R.render.bind(R);let cam=null;
    R.render=(scene,camera)=>{const room=window.__ssLink?.local?.room;const s=room?.restlessDay;
      if(window.__chase&&camera===r.camera&&s){if(!(camera.layers.mask&1))return;
        const l=[...s.ladders].filter(x=>x.state!=='broken').sort((a,b)=>b.position.z-a.position.z)[0];
        const c=l&&(l.holderId?room.players.get(l.holderId)?.position:l.position);
        if(c){const want=[c.x+7,c.y+6.5,c.z-9];cam=cam?cam.map((v,i)=>v+(want[i]-v)*0.08):want;
          camera.position.set(...cam);camera.lookAt(c.x,c.y+1.5,c.z+2);camera.far=Math.max(camera.far,300);camera.updateProjectionMatrix();camera.updateMatrixWorld();}}
      render(scene,camera)};return true})()`);
  const samples = [];
  let frame = 0;
  const startedAt = Date.now();
  while (Date.now() - startedAt < seconds * 1000) {
    const sample = await evaluate(COMPARE);
    if (sample) samples.push(sample);
    // the first 40 s of the siege as a clip (one frame each 400 ms), and a frame every 10 s after
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed < 40 || Math.round(elapsed) % 10 === 0) {
      await evaluate(`window.__chase=true;if(!document.querySelector('#cap-clean')){const s=document.createElement('style');s.id='cap-clean';s.textContent='body *{visibility:hidden!important}canvas{visibility:visible!important}';document.head.append(s)}true`);
      const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 72 }, 60000);
      await writeFile(join(out, 'frames', `f${String(frame++).padStart(4, '0')}.jpg`), Buffer.from(r.data, 'base64'));
    }
    await sleep(elapsed < 40 ? 400 : 2000);
  }
  // agreement: deployed and lying ladders exactly where the authority has them; carried ones on their carrier
  const worst = { ladder: 0, carried: 0, carrier: 0, missing: 0 };
  for (const s of samples) {
    for (const l of s.ladders) {
      if (l.state === 'broken') continue;
      if (!l.drawn || !l.visible) { worst.missing++; continue; }
      const d = Math.hypot(l.drawn[0] - l.auth[0], l.drawn[1] - l.auth[1], l.drawn[2] - l.auth[2]);
      if (l.state === 'carrying') worst.carried = Math.max(worst.carried, d); else worst.ladder = Math.max(worst.ladder, d);
    }
    for (const c of s.carriers) if (c.drawn) worst.carrier = Math.max(worst.carrier, Math.hypot(c.drawn[0] - c.auth[0], c.drawn[2] - c.auth[2]));
  }
  const last = samples.at(-1);
  const result = { seconds, samples: samples.length, phases: [...new Set(samples.map((s) => s.phase))], worst, last, frames: frame, errors };
  await writeFile(join(out, 'result.json'), JSON.stringify({ ...result, samples }, null, 1));
  console.log(JSON.stringify(result));
  if (worst.missing || worst.ladder > 0.05 || worst.carried > 1.0 || worst.carrier > 1.5 || errors.length) process.exitCode = 1;
} catch (e) {
  console.error('[SIEGE BROWSER FAILED]', e.message);
  process.exitCode = 1;
} finally {
  cdp?.close(); chrome.kill('SIGTERM'); await sleep(400); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
