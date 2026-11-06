import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildValkyrieRitualGeometry,createValkyrieRitual,advanceValkyrieRitual,
  ritualFraction,ritualDistanceFraction,ritualStartNear,pointInRitualStencil,
  VALKYRIE_RITUAL_POINTS,RITUAL_UNIT,RITUAL_HALO_STEPS,
} from './terminalDiveGesture.mjs';

const pt=([x,y])=>({x,y});
const centers={
 jump:{x:202,y:184}, ultimate:{x:202,y:103},
 dash:{x:118,y:184}, siegeSkill:{x:118,y:103},
};
const custom=buildValkyrieRitualGeometry(centers,{width:320,height:240});

test('Dagaz is EXACT Jump → Chivalry → Dash → Ascend → Jump at real button centers',()=>{
 assert.ok(custom);
 assert.deepEqual(custom.points.slice(0,5),[
  [202,184],[202,103],[118,184],[118,103],[202,184]]);
 assert.equal(custom.runeEndIndex,4);
 assert.equal(custom.haloStartIndex,5);
 assert.equal(custom.haloEndIndex,5+RITUAL_HALO_STEPS);
 assert.equal(custom.points.length,18,'a full halo loop follows five rune waypoints');
 assert.ok(Math.hypot(
  custom.points[5][0]-custom.points.at(-1)[0],
  custom.points[5][1]-custom.points.at(-1)[1])<.00001,
 'the halo returns exactly to its starting checkpoint, not an incomplete arc');
 assert.equal(custom.path.split(' L').length,custom.points.length);
});

test('all rune checkpoints and the complete halo follow mirrored or player-moved controls',()=>{
 const moved={jump:{x:45,y:180},ultimate:{x:45,y:100},
   dash:{x:110,y:180},siegeSkill:{x:110,y:100}};
 const geometry=buildValkyrieRitualGeometry(moved,{width:320,height:240});
 assert.deepEqual(geometry.points.slice(0,5),[
   [45,180],[45,100],[110,180],[110,100],[45,180]]);
 assert.notDeepEqual(geometry.points.slice(0,5),custom.points.slice(0,5));
 assert.ok(geometry.points.every(p=>p[0]>=0&&p[0]<=320&&p[1]>=0&&p[1]<=240),
   'halo remains within the active phone game frame');
 assert.equal(buildValkyrieRitualGeometry({},{}),null,'missing buttons cannot fabricate an input geometry');
});

test('one continuous correctly ordered pointer completes Dagaz plus CLOSED halo',()=>{
 let g=createValkyrieRitual(12,1,custom.points);
 for(let i=1;i<custom.points.length;i++){
  const a=custom.points[i-1],b=custom.points[i];
  for(const t of [.25,.5,.75,1]){
   g=advanceValkyrieRitual(g,{x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t},1+240*i+t*40);
   assert.ok(g,'intermediate point remains on path, stage '+i);
  }
  assert.equal(g.index,i,'must reach every checkpoint '+i);
  assert.ok(ritualFraction(g)>=i/(custom.points.length-1)-.001,'illumination grows');
 }
 assert.equal(g.completed,true);
 assert.equal(ritualFraction(g),1);
 assert.equal(advanceValkyrieRitual(g,pt(custom.points.at(-1)),6000),null,'no repeat');
});

test('wrong-way, jumping across the X, and late traces never activate',()=>{
 const g=createValkyrieRitual(9,0,custom.points);
 assert.equal(ritualStartNear(pt(custom.points[0]),custom.points),true);
 assert.equal(ritualStartNear({x:15,y:20},custom.points),false);
 assert.equal(advanceValkyrieRitual(g,pt(custom.points[3]),100),null,
  'skipping to Ascend does not silently complete intermediate steps');
 const first=advanceValkyrieRitual(g,pt(custom.points[1]),100);
 assert.equal(first.index,1);
 assert.equal(advanceValkyrieRitual(first,{x:400,y:400},120),null);
 assert.equal(advanceValkyrieRitual(first,pt(custom.points[2]),13000),null,'time-out cancels');
});

test('legacy stencil mapping and default fixture remain stable for old replay adapters',()=>{
 const start=VALKYRIE_RITUAL_POINTS[0],rect={left:300,top:20,width:200,height:200};
 const raw={x:rect.left+start[0]/RITUAL_UNIT*rect.width,
   y:rect.top+start[1]/RITUAL_UNIT*rect.height};
 const normalized=pointInRitualStencil(raw,rect);
 assert.ok(Math.hypot(normalized.x-start[0],normalized.y-start[1])<1e-6);
 assert.equal(ritualStartNear(normalized),true);
 assert.equal(pointInRitualStencil({x:10,y:10},{left:0,top:0,width:0,height:100}),null);
});

test('trace illumination is proportional to actual painted length, not equally sized checkpoints',()=>{
 const points=[[0,0],[0,120],[20,120],[20,140]];
 const initial=createValkyrieRitual(8,1,points);
 assert.equal(ritualDistanceFraction(initial),0);
 const halfway=advanceValkyrieRitual(initial,{x:0,y:60},100);
 assert.ok(halfway);
 assert.ok(Math.abs(ritualDistanceFraction(halfway)-.375)<.0001,
   'half the 120 px stroke paints 60 of the 160 physical pixels');
 assert.ok(Math.abs(ritualFraction(halfway)-1/6)<.0001,
   'the old waypoint-index fraction would underreport the long stroke');
 const first=advanceValkyrieRitual(halfway,{x:0,y:120},110);
 assert.equal(first.index,1);
 assert.ok(Math.abs(ritualDistanceFraction(first)-.75)<.0001);
});
