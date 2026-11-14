// First-person Blustered integration in real Chrome and Castleward's running Practice client.
// Stage only the test status on the local authoritative actor: the existing server
// status tests prove Gale application; this check proves camera/arm presentation.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CdpClient } from './browser-cdp.mjs';
import { launchAcceptanceChrome } from './acceptance-chrome.mjs';

const url=(process.env.PUBLIC_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const bin=process.env.CHROME_BIN||(process.platform==='darwin'?
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium');
const profile=await mkdtemp(join(tmpdir(),'castleward-bluster-fp-'));
const output='output/playwright/first-person-bluster';
await mkdir(output,{recursive:true});
const chrome=launchAcceptanceChrome(bin,profile,join(output,'chrome.log'),{width:960,height:600});
let cdp,stage='Chrome startup';
const evidence={};

async function evaluate(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
async function poll(check,label,ms=35000){
  stage=label;
  const stop=Date.now()+ms;
  while(Date.now()<stop){
    const value=await check();
    if(value)return value;
    await sleep(75);
  }
  throw Error('Timed out: '+label);
}
async function click(selector){
  return evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
}
async function snap(name){
  const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));
}
const sample=`(() => {
  const rt=window.__ssRuntime;
  if(!rt?.localAuth||!rt.weapon?.group)return null;
  const wrapped=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  return {
    time:rt.socket.serverNow(),alive:rt.localAuth.alive,
    blustered:rt.localAuth.blustered??null,
    onFoot:!rt.localAuth.operatingFightFlightId&&!rt.localAuth.operatingRamId&&!rt.localAuth.operatingBallistaId,
    chase:rt.chase??0,hands:rt.weapon.group.visible,
    kind:rt.weapon.visualKind,
    cameraYaw:rt.camera.rotation.y,cameraPitch:rt.camera.rotation.x,
    inputYaw:rt.input.yaw,bodyYaw:rt.localAuth.yaw,
    bodyGap:wrapped(rt.localAuth.yaw,rt.input.yaw),
    armYaw:rt.weapon.group.rotation.y,
  };
})()`;

try {
  const target=await chrome.target();
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await poll(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),
    'game menu',45000);
  await click('[data-tutorial-onboarding-skip]');
  await click('#solo-button');
  await click('#practice-mode');
  await click('#solo-launch');
  await poll(()=>evaluate("Boolean(window.__ssRuntime?.localAuth?.alive && window.__ssRuntime?.socket?.playingLocally && window.__ssRuntime?.playing)"),
    'real local Practice',45000);
  await click('#practice-drawer-close');
  // The status is staged on the same authoritative local-host player that
  // produces snapshots. The renderer receives it by the normal wire path.
  await evaluate(`(() => {
    const rt=window.__ssRuntime, host=rt.socket.local.player;
    rt.onFootThirdPerson=false;
    rt.chase=0;
    rt.input.enabled=true;
    rt.input.yaw=host.yaw;
    rt.input.pitch=0;
    host.input.yaw=host.yaw;
    host.blustered={at:rt.socket.serverNow(),severity:1,sourceId:'chrome-fp-bluster'};
    host.staggerUntil=-Infinity;
    rt.input.turn(1.4,0);
  })()`);
  const lag=await poll(async()=>{
    const p=await evaluate(sample);
    return p?.blustered && p.hands && p.onFoot && p.chase<.08 &&
      p.armYaw<-.08 && p.bodyGap>.18 ? p : null;
  },'first-person arms visibly lag a free camera',12000);
  assert.ok(Math.abs(lag.cameraYaw-lag.inputYaw)<.22,
    'camera continues to aim where the player looked, not where the arms face');
  assert.ok(lag.armYaw>=-.581,'camera-child arms stay within the legible view cone');
  assert.ok(lag.bodyGap>.18,'actual body is still delayed by Blustered');
  evidence.lag=lag;
  await snap('arms-lag-behind-free-camera');

  const recovered=await poll(async()=>{
    const p=await evaluate(sample);
    return p?.hands && Math.abs(p.bodyGap)<.06 && Math.abs(p.armYaw)<.035 ? p : null;
  },'body and first-person arms finish catching up',12000);
  evidence.recovered=recovered;
  await snap('arms-return-to-camera');

  await evaluate(`(() => {
    const rt=window.__ssRuntime;
    rt.input.turn(0,.55);
  })()`);
  const vertical=await poll(async()=>{
    const p=await evaluate(sample);
    return p && p.cameraPitch>.37 ? p : null;
  },'vertical camera look stays unrestricted',6000);
  assert.ok(Math.abs(vertical.armYaw)<.035,'expired status leaves no arm offset');
  evidence.vertical=vertical;

  console.log('[FIRST-PERSON BLUSTER PASS]',JSON.stringify(evidence));
  await writeFile(join(output,'result.json'),JSON.stringify(evidence,null,2));
} catch(error) {
  console.error('[FIRST-PERSON BLUSTER FAIL]',stage,error.stack);
  evidence.failure={stage,message:String(error),last:await evaluate(sample).catch(()=>null)};
  await writeFile(join(output,'failure.json'),JSON.stringify(evidence,null,2));
  throw error;
} finally {
  cdp?.close();
  chrome.child.kill('SIGTERM');
  await sleep(400);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
