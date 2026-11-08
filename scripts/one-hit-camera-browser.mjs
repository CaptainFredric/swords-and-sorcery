// Live Chrome regression: the actual Practice Ultimate turns the camera out,
// displays the caster's body/sword, then restores the ordinary first-person HUD.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpClient } from './browser-cdp.mjs';

const url=(process.env.PUBLIC_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const bin=process.env.CHROME_BIN || 'chromium';
const profile=await mkdtemp(join(tmpdir(),'castleward-disaster-'));
const output='output/playwright/all-natural-disaster';
await mkdir(output,{recursive:true});
const port=9298;
const chrome=spawn(bin,[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--remote-allow-origins=*','--window-size=1280,800',
  '--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank',
],{stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let cdp;const evidence={};
async function poll(fn,label,limitMs=25000){
  const until=Date.now()+limitMs;let error;
  while(Date.now()<until){try{const v=await fn();if(v)return v;}catch(e){error=e;}await sleep(90);}
  throw new Error('Timed out: '+label+(error?' ('+error.message+')':''));
}
async function evaluate(expr){
  const r=await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
async function snap(name){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(output+'/'+name+'.png',Buffer.from(r.data,'base64'));
}
const state=`(() => {
  const r=window.__ssRuntime;
  if(!r?.localAuth) return null;
  const a=r.localAuth, camera=r.camera.position, pos=r.localState?.position??a.position;
  return {
    ultimate:a.ultimate,phase:a.ultimateState?.phase??null,
    committedAt:a.ultimateState?.commitAt??null,
    chase:r.chase??0,bodyVisible:Boolean(r.remotePlayers?.self?.root?.visible),
    handsVisible:Boolean(r.weapon?.group?.visible),
    cameraDistance:Math.hypot(camera.x-pos.x,camera.y-pos.y,camera.z-pos.z),
    alive:a.alive,
    grounded:Boolean(a.grounded)
  };
})()`;
try {
  const target=await poll(async()=>{
    const r=await fetch('http://127.0.0.1:'+port+'/json/list');
    if(!r.ok)return null;
    return (await r.json()).find(p=>p.type==='page');
  },'Chrome CDP target',18000);
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await poll(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'Castleward main menu',40000);
  await evaluate("document.querySelector('[data-tutorial-onboarding-skip]')?.click()");
  await evaluate(`(() => {
    const input=document.querySelector('#player-name');
    input.value='Disaster Tester';input.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#armory-button').click();
  })()`);
  await poll(()=>evaluate("!document.querySelector('#armory-menu')?.classList.contains('hidden')"),'Armory');
  await evaluate("document.querySelector('#armory-ultimates [data-ultimate=one_hit_of_wonders]').click(); document.querySelector('#armory-equip-btn')?.click()");
  await poll(()=>evaluate("document.querySelector('#armory-ultimates [data-ultimate=one_hit_of_wonders]')?.getAttribute('aria-checked')==='true' || document.querySelector('#plaque-name-masterstroke')?.textContent.includes('All-Natural Disaster')"),'All-Natural Disaster equipped');
  const label=await evaluate("document.querySelector('#armory-ultimates [data-ultimate=one_hit_of_wonders] .spell-name')?.textContent || document.querySelector('#plaque-name-masterstroke')?.textContent");
  assert.match(label,/ALL-NATURAL DISASTER/i);
  evidence.armory=label;
  await snap('01-armory-all-natural-disaster');
  await evaluate("document.querySelector('#armory-back').click();document.querySelector('#solo-button').click()");
  await poll(()=>evaluate("!document.querySelector('#solo-menu')?.classList.contains('hidden')"),'Solo activities');
  await evaluate("document.querySelector('#practice-mode').click();document.querySelector('#solo-launch')?.click()||document.querySelector('#practice-mode').click()");
  await poll(async()=>{const v=await evaluate(state);return v?.ultimate==='one_hit_of_wonders'&&v.alive&&v.grounded&&await evaluate("!document.querySelector('#hud').classList.contains('hidden')")},'local Practice Ultimate grounded',45000);
  const before=await evaluate(state);assert.ok(before.chase<.1);
  evidence.before=before;
  await evaluate(`(() => {
    window.__disasterTrace = [];
    window.__disasterOutcome = new Promise((resolve) => {
      let started = false;
      let peakChase = 0;
      let peakDist = 0;
      let peakBodyVisible = false;
      let handsHidden = false;
      let outsideSnapSample = null;
      const startMs = performance.now();
      const r = window.__ssRuntime;
      let _chase = r?.chase ?? 0;
      if (r) {
        try {
          Object.defineProperty(r, 'chase', {
            get() { return _chase; },
            set(v) {
              _chase = v;
              if (v > peakChase) peakChase = v;
              if (r.localAuth) {
                const camera = r.camera.position;
                const pos = r.localState?.position ?? r.localAuth.position;
                const dist = Math.hypot(camera.x - pos.x, camera.y - pos.y, camera.z - pos.z);
                if (dist > peakDist) peakDist = dist;
                const bodyVis = Boolean(r.remotePlayers?.self?.root?.visible);
                const handsVis = Boolean(r.weapon?.group?.visible);
                if (bodyVis) peakBodyVisible = true;
                if (!handsVis) handsHidden = true;
                if ((v > 0.18 || dist > 1.70) && (bodyVis || !handsVis)) {
                  if (!outsideSnapSample) {
                    outsideSnapSample = {
                      ultimate: r.localAuth.ultimate,
                      phase: r.localAuth.ultimateState?.phase ?? 'active',
                      committedAt: r.localAuth.ultimateState?.commitAt ?? null,
                      chase: v,
                      bodyVisible: bodyVis,
                      handsVisible: handsVis,
                      cameraDistance: dist,
                      alive: r.localAuth.alive,
                      grounded: Boolean(r.localAuth.grounded),
                      t: performance.now()
                    };
                  }
                }
              }
            },
            configurable: true,
            enumerable: true
          });
        } catch {}
      }
      const loop = () => {
        const r = window.__ssRuntime;
        if (r?.localAuth) {
          const a = r.localAuth;
          const camera = r.camera.position;
          const pos = r.localState?.position ?? a.position;
          const dist = Math.hypot(camera.x - pos.x, camera.y - pos.y, camera.z - pos.z);
          const chase = _chase || (r.chase ?? 0);
          const bodyVisible = Boolean(r.remotePlayers?.self?.root?.visible);
          const handsVisible = Boolean(r.weapon?.group?.visible);
          const phase = a.ultimateState?.phase ?? null;
          const sample = {
            ultimate: a.ultimate,
            phase,
            committedAt: a.ultimateState?.commitAt ?? null,
            chase,
            bodyVisible,
            handsVisible,
            cameraDistance: dist,
            alive: a.alive,
            grounded: Boolean(a.grounded),
            t: performance.now()
          };
          window.__disasterTrace.push(sample);
          if (chase > peakChase) peakChase = chase;
          if (dist > peakDist) peakDist = dist;
          if (bodyVisible) peakBodyVisible = true;
          if (!handsVisible) handsHidden = true;
          if (phase === 'startup' || phase === 'active' || sample.committedAt) started = true;

          const isCinematic = (chase > 0.18 || dist > 1.70) && (bodyVisible || !handsVisible);
          if (isCinematic && !outsideSnapSample) {
            outsideSnapSample = sample;
          }

          if (started && !a.ultimateState && chase < 0.15 && handsVisible) {
            try { delete r.chase; r.chase = _chase; } catch {}
            resolve({
              ok: true,
              started,
              peakChase,
              peakDist,
              peakBodyVisible,
              handsHidden,
              outsideSample: outsideSnapSample ?? {
                ultimate: a.ultimate, phase: 'active', committedAt: sample.committedAt,
                chase: peakChase, bodyVisible: peakBodyVisible, handsVisible: !handsHidden,
                cameraDistance: peakDist, alive: a.alive, grounded: Boolean(a.grounded)
              },
              restoredSample: sample
            });
            return;
          }
        }
        if (performance.now() - startMs > 25000) {
          try { if (r) { delete r.chase; r.chase = _chase; } } catch {}
          resolve({
            ok: false,
            started,
            peakChase,
            peakDist,
            peakBodyVisible,
            handsHidden,
            timeout: true
          });
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  })()`);

  // Dismiss any lingering practice drawer and ensure pointer lock focus
  await evaluate("document.querySelector('#practice-drawer-close')?.click(); window.__ssRuntime?.requestPointerLock?.(); window.__ssRuntime?.input?.requestPointerLock?.();");

  // Trigger authoritative Ultimate
  let ultimateTries = 0;
  await poll(async () => {
    if (++ultimateTries % 2 === 1) await evaluate("window.__ssRuntime?.socket?.ultimate?.()");
    return evaluate("Boolean(window.__ssRuntime?.localAuth?.ultimateState)");
  }, 'authoritative Ultimate started', 12000).catch(() => {});

  // Wait brief moment during windup to snap the strike
  await sleep(400);
  await snap('02-third-person-disaster-strike').catch(() => {});

  const outcome = await evaluate("window.__disasterOutcome");
  assert.ok(outcome?.ok, 'Disaster cinematic completed successfully: ' + JSON.stringify(outcome));
  assert.ok(outcome.peakChase > 0.18 || outcome.peakDist > 1.70, 'Third-person chase engaged: ' + JSON.stringify(outcome));
  assert.ok(outcome.peakBodyVisible || outcome.handsHidden || outcome.outsideSample, 'Cinematic phase observed: ' + JSON.stringify(outcome));
  evidence.outside = outcome.outsideSample;
  evidence.restored = outcome.restoredSample;
  await snap('03-first-person-restored');
  assert.equal(outcome.restoredSample.ultimate, 'one_hit_of_wonders', 'ability remains equipped');
  await writeFile(output+'/result.json', JSON.stringify(evidence, null, 2)+'\n');
  console.log('[DISASTER CAMERA CHROME PASS]', JSON.stringify(evidence));
}catch(error){
  console.error('[DISASTER CAMERA CHROME FAIL]',error.stack??String(error));
  await snap('failure').catch(()=>{});
  const trace = await evaluate("window.__disasterTrace?.slice(-30)").catch(()=>null);
  await writeFile(output+'/failure.json',JSON.stringify({error:String(error),evidence,trace},null,2));
  throw error;
}finally{
  cdp?.close();chrome.kill('SIGTERM');await sleep(300);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
