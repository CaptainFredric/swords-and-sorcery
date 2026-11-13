// Browser-native acceptance: Three.js comes from Castleward's import map.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {createGameServer} from '../server/src/server.mjs';
import {launchAcceptanceChrome} from './acceptance-chrome.mjs';
import {CdpClient} from './browser-cdp.mjs';

const out='output/playwright/windblade-coherence';
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'castleward-gale-coherence-'));
const game=createGameServer({host:'127.0.0.1',port:0});
let chrome,cdp;
async function evaluate(expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
  return r.result?.value;
}
async function poll(fn,what,timeout=35000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await fn().catch(()=>false))return;await sleep(120);}
  throw Error('Timed out: '+what);
}
try{
  await game.start();
  const url='http://127.0.0.1:'+game.address().port;
  chrome=launchAcceptanceChrome(process.env.CHROME_BIN??'chromium',profile,join(out,'chrome.log'),{width:1100,height:730});
  const target=await chrome.target();
  cdp=new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate',{url:url+'/?debug'});
  await poll(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),
    'Castleward browser modules loaded');
  const source=[
    '(async()=>{',
    "const THREE=await import('three');",
    "const {swordWave}=await import('/client/game/OneHitLiveEffects.mjs');",
    "const {DisasterElementEffects}=await import('/client/game/DisasterElementEffects.mjs');",
    'const variants=[{},{gale:1},{gale:2},{gale:2,lightning:2},{gale:2,fire:2,frost:2,steel:2}];',
    'const proofs=[];',
    'for(const tiers of variants){',
    'const wave=swordWave(tiers),body=wave.children[0],wake=body.children[0],edge=body.children[1];',
    "const xyz=wake.geometry.getAttribute('position'),rgba=wake.geometry.getAttribute('color');",
    'const front=18*8,back=front+7;',
    'const passes={',
    "exactlyOneWake:body.children.length===2&&wake.name==='Windblade continuous pressure wake'&&edge.name==='Windblade leading cut',",
    'rgba:rgba.itemSize===4,',
    'connected:xyz.count===37*8&&wake.geometry.index.count===36*7*6,',
    'noGap:[...Array(36)].every((_,i)=>{const a=(i+1)*8,b=i*8;return Math.hypot(xyz.getX(a)-xyz.getX(b),xyz.getY(a)-xyz.getY(b))<.2;}),',
    'fades:[...Array(37)].every((_,i)=>rgba.getW(i*8)>=rgba.getW(i*8+7)),',
    'growsBack:xyz.getZ(back)<xyz.getZ(front)-.9,',
    'transparent:!wake.material.depthWrite&&!edge.material.depthWrite,',
    '};',
    'if(tiers.gale===2){passes.lime=rgba.getY(front+5)>rgba.getX(front+5)*1.2;',
    'passes.whiteLeading=rgba.getX(front)>rgba.getX(front+5);passes.vanishes=rgba.getW(back)<.001;}',
    'proofs.push({tiers,passes});',
    'wave.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});',
    '}',
    'const scene=new THREE.Scene(),wave=swordWave({gale:2,lightning:2});',
    'scene.add(wave);wave.position.set(3,2,-4);',
    'const effects=new DisasterElementEffects(scene);effects.clock=1;',
    "effects.waveBody({id:'coherent-gale',tiers:{gale:2,lightning:2},direction:{x:0,y:0,z:1}},wave,.05);",
    'const parented=effects.bolts.length>=2&&effects.bolts.every(x=>x.mesh.parent===wave);',
    'const bolt=effects.bolts[0]?.mesh,position=new THREE.Vector3();',
    'const pre=bolt?.getWorldPosition(position.clone());',
    'wave.position.x+=4;wave.position.y+=1;wave.updateWorldMatrix(true,true);',
    'const post=bolt?.getWorldPosition(position.clone());',
    'const tracks=parented&&Math.abs(post.x-pre.x-4)<1e-5&&Math.abs(post.y-pre.y-1)<1e-5;',
    'effects.dispose();wave.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});',
    'return {proofs,parented,tracks};',
    '})()'
  ].join('\n');
  const evidence=await evaluate(source);
  assert.deepEqual(evidence.proofs.flatMap(x=>Object.entries(x.passes)
    .filter(([,value])=>!value).map(([key])=>JSON.stringify(x.tiers)+': '+key)),[]);
  assert.ok(evidence.parented&&evidence.tracks,'Lightning filaments travel with the wave');
  await writeFile(join(out,'result.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log('[WINDBLADE COHERENCE PASS]',JSON.stringify({variants:evidence.proofs.length,lightningAttached:evidence.parented}));
}catch(error){
  console.error('[WINDBLADE COHERENCE FAIL]',error.stack);
  process.exitCode=1;
}finally{
  cdp?.close();chrome?.child?.kill('SIGTERM');
  await game.stop().catch(()=>{});await sleep(350);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
