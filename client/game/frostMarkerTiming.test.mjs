import test from 'node:test';import assert from 'node:assert/strict';import {HUD} from '../ui/HUD.mjs';

test('frost hit confirmation retains its full lifetime after the impact frame is drawn',()=>{
 const previous={requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 const frames=new Map(),timers=new Map(),classes=new Set();let id=0;
 Object.assign(globalThis,{requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:n=>frames.delete(n),setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:n=>timers.delete(n)});
 try{
  const hud=Object.create(HUD.prototype);hud.crosshair={classList:{add:k=>classes.add(k),remove:(...ks)=>ks.forEach(k=>classes.delete(k))}};
  hud.hit('block',{afterPaint:true});assert.equal(hud.hitKind,'block');assert.equal(timers.size,0,'a busy impact render cannot consume the marker timer');assert.equal(frames.size,1);
  const [frame,draw]=frames.entries().next().value;frames.delete(frame);draw();assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,200);assert.ok(classes.has('block'));
  hud.clearHit();assert.equal(timers.size,0);assert.equal(classes.size,0);
  hud.hit('parry',{afterPaint:true});hud.clearHit();assert.equal(frames.size,0,'leaving cancels the pending confirmation');
 }finally{Object.assign(globalThis,previous);}
});
