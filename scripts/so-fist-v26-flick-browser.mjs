// Real Chrome acceptance for the original Argon v26 moving finger, not just gameplay damage.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const port=9267,base=(process.env.SIEGE_BROWSER_URL??'http://127.0.0.1:3001').replace(/\/$/,'');
const profile=await mkdtemp(join(tmpdir(),'castleward-flick-'));
const out='output/playwright/so-fist-v26-flick';
await mkdir(out,{recursive:true});
const chrome=spawn(process.env.CHROME_BIN??'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--remote-allow-origins=*','--remote-debugging-port='+port,'--window-size=1280,800',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map();
async function until(f,tag,count=90){
 for(let i=0;i<count;i++){try{const v=await f();if(v)return v;}catch(e){if(i===count-1)throw e;}await wait(160);}
 throw Error('Timed out: '+tag);
}
async function send(method,params={}){
 const id=++seq;
 const promise=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);
  pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}});
 });
 ws.send(JSON.stringify({id,method,params}));return promise;
}
async function evaluate(expression){
 const x=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(x.exceptionDetails)throw Error(x.exceptionDetails.exception?.description??x.exceptionDetails.text);
 return x.result?.value;
}
let report;
try{
 const tab=await until(async()=>{
  const response=await fetch('http://127.0.0.1:'+port+'/json/list');
  return (await response.json()).find(t=>t.type==='page');
 },'Chrome CDP',170);
 ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{
  const m=JSON.parse(String(e.data)),task=pending.get(m.id);
  if(!task)return;pending.delete(m.id);
  if(m.error)task.reject(Error(m.error.message));else task.resolve(m.result);
 };
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:base+'/?debug'});
 await until(()=>evaluate("document.querySelector('#loading-veil')?.classList.contains('done')"),'Castleward menu',150);
 report=await evaluate(`(async()=>{
  const THREE=await import('three');
  const {SoFisticationRenderer}=await import('/client/worlds/SoFisticationRenderer.mjs');
  const {createSoFistication,soFistEntry,mountSoFistication}=await import('/shared/sim/soFistication.mjs');
  const {Room}=await import('/shared/sim/Room.mjs');
  const {applyRoomCommand,serializeSnapshot}=await import('/shared/sim/wire.mjs');
  const scene=new THREE.Scene(),ram=new SoFisticationRenderer(scene);
  const loaded=await ram.load();
  const s={loaded,installed:Boolean(ram.v26HandInstalled),
    clips:[...ram.availableClips??[]].filter(c=>c.startsWith('23_')),
    details:[],problems:[]};
  if(!loaded||!ram.animation)return s;
  const clip=ram.animation.clips.get('23_Finger_Flick_Single_Target_Strike');
  s.trackCount=clip?.tracks.length??0;
  s.trackNames=clip?.tracks.map(t=>t.name)??[];
  const hand=ram.nodes.get('Armored_Fist'),i1=ram.nodes.get('Index_1'),i2=ram.nodes.get('Index_2'),i3=ram.nodes.get('Index_3');
  s.hierarchy={hand:hand?.name,handParent:hand?.parent?.name,index1:i1?.parent?.name,index2:i2?.parent?.name,index3:i3?.parent?.name,
    indexMeshes:[i1,i2,i3].map(node=>{let vertices=0;node?.traverse(o=>{if(o.isMesh)vertices+=o.geometry?.attributes?.position?.count??0;});return vertices;})};
  const room=new Room('FLICK_VISUAL',{mode:'PRACTICE'});room.state='PLAYING';
  room.world={solids:[],ramps:[],floors:[{id:'floor',center:[0,-.1,0],size:[120,.2,120],y:0}],spawnPoints:[{x:0,y:0,z:0}],abyssY:-30};
  const p=room.addPlayer({id:'visual-operator',token:'visual-operator',name:'Visual Operator'},0);
  room.soFistication=createSoFistication({id:'visual-proof',x:0,y:0,z:0,heading:0});
  p.position=soFistEntry(room.soFistication,room.world);p.spawnProtectionUntil=0;
  s.mounted=mountSoFistication(room,room.soFistication,p,9.9);
  s.command=applyRoomCommand(room,p,{type:'ramFlick'},10);
  const b=serializeSnapshot(room,10,p.id).soFistication;
  s.replicatedFlickAt=b?.flickAt;
  for(const age of [.1,.4,.65,.7,.75,.8,.85,1.2,2.4,3.4]){
   const now=10+age;ram.update(now,b);ram.group.updateMatrixWorld(true);
   const indexTip=i3?.localToWorld(new THREE.Vector3(-.0138,.0214,-.1366));
   s.details.push({age,pose:[i1?.quaternion.toArray(),i2?.quaternion.toArray(),i3?.quaternion.toArray()],
     tip:indexTip?.toArray(),fistVisible:hand?.visible});
  }
  ram.dispose();
  return s;
 })()`);
 console.log('[ARGON FLICK RENDER]',JSON.stringify(report));
 await writeFile(out+'/result.json',JSON.stringify(report,null,2));
 assert.equal(report.mounted,true,'The operator actually mounted the machine');
 assert.deepEqual(report.command,{},'Real ramFlick wire command was accepted');
 assert.equal(report.replicatedFlickAt,10,'Flick timestamp survived serialization into the network snapshot');
 assert.equal(report.loaded,true,'Real production ram asset must load in Chrome');
 assert.equal(report.installed,true,'Original 26-clip GLB must graft onto the hydraulic machine');
 assert.equal(report.hierarchy.index1,'Armored_Fist');
 assert.equal(report.hierarchy.index2,'Index_1');
 assert.equal(report.hierarchy.index3,'Index_2');
 assert.ok(report.hierarchy.indexMeshes.every(n=>n>50),'All three articulated index groups must contain actual visible mesh vertices');
 for(const name of ['Index_1.quaternion','Index_2.quaternion','Index_3.quaternion'])
  assert.ok(report.trackNames.includes(name),'Argon Flick track missing from runtime: '+name);
 const [before,peak]=[report.details.find(d=>d.age===.4),report.details.find(d=>d.age===.75)];
 const quaternionAngle=(a,b)=>{
  const dot=Math.min(1,Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0)));
  return 2*Math.acos(dot);
 };
 const angles=[0,1,2].map(i=>quaternionAngle(before.pose[i],peak.pose[i]));
 const distance=Math.hypot(...before.tip.map((v,i)=>v-peak.tip[i]));
 console.log('[ARGON FLICK VISIBLE DELTA]',JSON.stringify({angles,distance,loaded:report.loaded}));
 assert.ok(angles[0]>.08&&angles[1]>.08&&angles[2]>.08,'All three index joints visibly flex');
 assert.ok(distance>.25,'The physical fingertip must travel through space, not merely change a hidden animation flag');
 assert.ok(report.details.every(d=>d.fistVisible),'Finger must be visible throughout the cycle');
 console.log('[ARGON FLICK BROWSER ACCEPTED]');
}catch(error){
 console.error('[ARGON FLICK BROWSER FAILED]',error.stack??String(error));
 await writeFile(out+'/error.json',JSON.stringify({error:String(error),report},null,2));
 throw error;
}finally{
 ws?.close();chrome.kill('SIGTERM');await wait(250);await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
