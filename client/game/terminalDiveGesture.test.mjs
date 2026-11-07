import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildValkyrieRitualGeometry,createValkyrieRitual,advanceValkyrieRitual,
 ritualFraction,ritualDistanceFraction,ritualStartNear,pointInRitualStencil,
 VALKYRIE_RITUAL_POINTS,RITUAL_UNIT,RITUAL_TIMEOUT_MS,
} from './terminalDiveGesture.mjs';

const pt=([x,y])=>({x,y});
const centers={
 jump:{x:202,y:184},ultimate:{x:202,y:103},
 dash:{x:118,y:184},siegeSkill:{x:118,y:103},
};
const custom=buildValkyrieRitualGeometry(centers,{width:320,height:240});

test('Dagaz keeps the five actual buttons, then returns diagonally, rises and sweeps a single crossbar',()=>{
 assert.ok(custom);
 assert.deepEqual(custom.points.slice(0,5),[
  [202,184],[202,103],[118,184],[118,103],[202,184]]);
 assert.equal(custom.runeEndIndex,4);
 assert.equal(custom.stemEndIndex,6);
 assert.deepEqual(custom.points[5],[160,143.5],
  'the diagonal return ends midway between Charge and Jump');
 assert.deepEqual(custom.points[6],[160,79],
  'the stem rises above the upper Charge/Chivalry gap');
 assert.deepEqual(custom.points.slice(7),[[212,79],[160,79],[108,79]]);
 assert.equal(custom.points.length,10);
 assert.equal(custom.reversePoints.length,10);
 assert.deepEqual(custom.reversePoints.slice(7),[[108,79],[160,79],[212,79]]);
 assert.ok(!custom.guidePath.includes('Z'),'there is no closed polygon or halo');
 assert.ok(custom.guidePath.includes(' M'),'the crossbar is a single separate guide');
 assert.equal(custom.path.split(' L').length,custom.points.length);
});

test('mirrored or player-customized buttons move the rune, diagonal and single crossbar',()=>{
 const moved={jump:{x:45,y:180},ultimate:{x:45,y:100},
  dash:{x:110,y:180},siegeSkill:{x:110,y:100}};
 const geometry=buildValkyrieRitualGeometry(moved,{width:320,height:240});
 assert.deepEqual(geometry.points.slice(0,5),[
  [45,180],[45,100],[110,180],[110,100],[45,180]]);
 assert.deepEqual(geometry.points[5],[77.5,140]);
 assert.notDeepEqual(geometry.points.slice(5),custom.points.slice(5));
 assert.ok(geometry.points.every(p=>p[0]>=0&&p[0]<=320&&p[1]>=0&&p[1]<=240));
 assert.equal(buildValkyrieRitualGeometry({},{}),null);
});

function trace(route){
 let g=createValkyrieRitual(12,1,custom.points,custom.reversePoints);
 const points=route;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  for(const t of [.25,.5,.75,1]){
   g=advanceValkyrieRitual(g,{x:a[0]+(b[0]-a[0])*t,
     y:a[1]+(b[1]-a[1])*t},1+240*i+t*40);
   assert.ok(g,'intermediate point on path, stage '+i);
  }
  assert.equal(g.index,i,'reaches checkpoint '+i);
  assert.ok(ritualFraction(g)>=i/(points.length-1)-.001);
 }
 return g;
}
test('one pointer may sweep right first or left first, and completes once',()=>{
 const right=trace(custom.points);
 assert.equal(right.variant,'right-first');
 assert.equal(right.completed,true);
 assert.equal(ritualDistanceFraction(right),1);
 const left=trace(custom.reversePoints);
 assert.equal(left.variant,'left-first');
 assert.equal(left.completed,true);
 assert.equal(ritualDistanceFraction(left),1);
 assert.equal(advanceValkyrieRitual(right,pt(custom.points.at(-1)),5000),null);
});

test('wrong waypoints, diagonal skips, out-of-bounds and expired traces never complete',()=>{
 const g=createValkyrieRitual(9,0,custom.points,custom.reversePoints);
 assert.equal(ritualStartNear(pt(custom.points[0]),custom.points),true);
 assert.equal(ritualStartNear({x:15,y:20},custom.points),false);
 assert.equal(advanceValkyrieRitual(g,pt(custom.points[3]),100),null);
 const first=advanceValkyrieRitual(g,pt(custom.points[1]),100);
 assert.equal(first.index,1);
 assert.ok(advanceValkyrieRitual(first,pt(custom.points[2]),18000));
 assert.equal(advanceValkyrieRitual(first,{x:400,y:400},120),null);
 assert.equal(advanceValkyrieRitual(first,pt(custom.points[2]),RITUAL_TIMEOUT_MS+1000),null);
});

test('legacy stencil mapping and the reference start remain stable',()=>{
 const start=VALKYRIE_RITUAL_POINTS[0],rect={left:300,top:20,width:200,height:200};
 const raw={x:rect.left+start[0]/RITUAL_UNIT*rect.width,
  y:rect.top+start[1]/RITUAL_UNIT*rect.height};
 const normalized=pointInRitualStencil(raw,rect);
 assert.ok(Math.hypot(normalized.x-start[0],normalized.y-start[1])<1e-6);
 assert.equal(ritualStartNear(normalized),true);
 assert.equal(pointInRitualStencil({x:10,y:10},{left:0,top:0,width:0,height:100}),null);
});

test('trace glow follows real traveled distance, not waypoint count',()=>{
 const points=[[0,0],[0,120],[20,120],[20,140]];
 const initial=createValkyrieRitual(8,1,points);
 assert.equal(ritualDistanceFraction(initial),0);
 const halfway=advanceValkyrieRitual(initial,{x:0,y:60},100);
 assert.ok(halfway);
 assert.ok(Math.abs(ritualDistanceFraction(halfway)-.375)<.0001);
 assert.ok(Math.abs(ritualFraction(halfway)-1/6)<.0001);
 const first=advanceValkyrieRitual(halfway,{x:0,y:120},110);
 assert.equal(first.index,1);
 assert.ok(Math.abs(ritualDistanceFraction(first)-.75)<.0001);
});
