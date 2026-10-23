import test from 'node:test';
import assert from 'node:assert/strict';
import { BiByeSound, biByeRecipe, biByeLoopSamples } from './BiByeSound.mjs';
function setup(){
 const heard=[],active=new Set();const engine={running:true,muted:false,ctx:{sampleRate:22050},buffer:channels=>({channels}),play(recipe,opts){const h={stop(){active.delete(h);},place(){}};active.add(h);heard.push({recipe,opts,h});return h;},playBuffer(buffer,opts){const h={stop(){active.delete(h);},place(){}};active.add(h);heard.push({buffer,opts,h});return h;}};
 return {engine,heard,active,audio:new BiByeSound(engine)};
}
const machine={id:'b',operatorId:'me',mode:'MOBILE',state:'LOADED',position:{x:0,y:0,z:0},speed:3,steer:0};
const opt={active:true,playerId:'me',listener:{x:0,y:1,z:3},yaw:0,now:1};
test('authoritative release events play distinct small and siege discharges exactly once',()=>{
 const {audio,heard}=setup();
 audio.update(machine,opt);
 const e={type:'bibyeFired',ballistaId:'b',shot:'I',at:1};audio.event(e,machine,1);audio.event(e,machine,1);
 audio.event({...e,shot:'II',at:1.2},machine,1.2);
 assert.equal(heard.filter(x=>x.recipe?.tag==='shotI').length,1);assert.equal(heard.filter(x=>x.recipe?.tag==='shotII').length,1);
});
test('movement owns one continuous effects loop and stops on stop, dismount, destruction, pause and exit',()=>{
 for(const change of [{...machine,speed:0},{...machine,operatorId:null},{...machine,mode:'DESTROYED'},null]){
  const {audio,active}=setup();audio.update(machine,opt);assert.ok(active.size>0);audio.update(change,opt);assert.equal(audio.loops.size,0);audio.dispose();assert.equal(active.size,0);
 }
 const {audio,active}=setup();audio.update(machine,opt);audio.update(machine,{...opt,active:false});assert.equal(active.size,0);
});
test('reload has a continuous ratchet loop, then an authoritative catch and no stale release after pause',()=>{
 const {audio,heard}=setup();audio.update({...machine,state:'RELOADING'},opt);assert.ok(audio.loops.has('winch'));
 audio.event({type:'bibyeReloadCompleted',at:2,ballistaId:'b'},machine,2);
 assert.ok(heard.some(x=>x.recipe?.tag==='catch'));
 audio.update(machine,{...opt,active:false});const n=heard.length;audio.event({type:'bibyeFired',shot:'II',at:3,ballistaId:'b'},machine,3);assert.equal(heard.length,n);
});
test('changing operator and rewinding room clock clear old sound handles',()=>{
 const {audio,active}=setup();audio.update(machine,opt);const handles=[...active];
 audio.update({...machine,operatorId:'other'},opt);assert.ok(handles.every(h=>!active.has(h)));
 audio.update(null,opt);assert.equal(active.size,0);
});
test('mechanical recipes remain bounded and differentiated with separate wood, metal and failure sounds',()=>{
 for(const name of ['shotI','shotII','deploy','retract','settle','catch','wood','metal','wheel','stabilizer','failure','wreck','creak','frost','siegeImpact']){
  const r=biByeRecipe(name,()=>.5);assert.ok(r.layers.length>0,name);assert.equal(r.tag,name);
  for(const layer of r.layers){assert.ok((layer.at??0)<1);if(layer.type!=='ring')assert.ok(layer.freq>20&&layer.freq<12000);}
 }
 assert.notDeepEqual(biByeRecipe('shotI',()=>.5),biByeRecipe('shotII',()=>.5));
 const a=biByeLoopSamples('roll',22050,2,()=>.6),b=biByeLoopSamples('winch',22050,2,()=>.6);
 assert.equal(a.length,44100);assert.ok(a.every(Number.isFinite));assert.ok(Math.max(...a.map(Math.abs))<1);assert.notDeepEqual(a,b);
});
test('coupling latch, delay trip and release sound once per authoritative transition',()=>{
 const {audio,heard}=setup();audio.update(machine,opt);
 for(const type of ['bibyeCouplingEngaged','bibyeHeavyDelayTripped','bibyeCouplingReleased'])for(let i=0;i<2;i++)audio.event({type,ballistaId:'b',at:1},machine,1);
 for(const kind of ['latch','delay','release'])assert.equal(heard.filter(x=>x.recipe?.tag===kind).length,1);
});
