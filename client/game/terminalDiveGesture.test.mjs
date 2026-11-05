import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createValkyrieRitual,advanceValkyrieRitual,ritualFraction,ritualStartNear,
  pointInRitualStencil,VALKYRIE_RITUAL_POINTS,RITUAL_UNIT,
} from './terminalDiveGesture.mjs';

const pt=([x,y])=>({x,y});
test('Dagaz+halo takes one continuous correctly ordered pointer trace',()=>{
 let g=createValkyrieRitual(12,1);
 for(let i=1;i<VALKYRIE_RITUAL_POINTS.length;i++){
   const a=VALKYRIE_RITUAL_POINTS[i-1],b=VALKYRIE_RITUAL_POINTS[i];
   for(const t of [.25,.5,.75,1]){
     g=advanceValkyrieRitual(g,{x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t},1+300*i+t*100);
     assert.ok(g,'intermediate point remains on path, stage '+i);
   }
   assert.equal(g.index,i,'must actually visit checkpoint '+i);
   assert.ok(ritualFraction(g)>=i/7-.001,'illumination grows');
 }
 assert.equal(g.completed,true);
 assert.equal(ritualFraction(g),1);
 assert.equal(advanceValkyrieRitual(g,pt(VALKYRIE_RITUAL_POINTS[7]),4000),null,'no repeat');
});
test('single random diagonal cannot skip the rune, wrong-way tracing cancels',()=>{
 const g=createValkyrieRitual(9,0);
 assert.equal(ritualStartNear(pt(VALKYRIE_RITUAL_POINTS[0])),true);
 assert.equal(ritualStartNear({x:20,y:20}),false);
 assert.equal(advanceValkyrieRitual(g,pt(VALKYRIE_RITUAL_POINTS[7]),100),null);
 const first=advanceValkyrieRitual(g,pt(VALKYRIE_RITUAL_POINTS[1]),100);
 assert.equal(first.index,1);
 assert.equal(advanceValkyrieRitual(first,{x:400,y:400},120),null);
 assert.equal(advanceValkyrieRitual(first,{x:110,y:20},7000),null,'timeout cancels');
});
test('editable stencil scaling/mirroring changes only coordinate mapping, not the path',()=>{
 const start=VALKYRIE_RITUAL_POINTS[0],a={left:300,top:20,width:200,height:200};
 const b={left:7,top:40,width:300,height:300};
 for(const r of [a,b]){
   const raw={x:r.left+start[0]/RITUAL_UNIT*r.width,y:r.top+start[1]/RITUAL_UNIT*r.height};
   const normalized=pointInRitualStencil(raw,r);
   assert.ok(Math.hypot(normalized.x-start[0],normalized.y-start[1])<1e-6);
   assert.equal(ritualStartNear(normalized),true);
 }
 assert.equal(pointInRitualStencil({x:10,y:10},{left:0,top:0,width:0,height:100}),null);
});
