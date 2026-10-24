import test from 'node:test';
import assert from 'node:assert/strict';
import {CASTLEWARD} from '../../shared/worlds/castleward.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista,getBiByeMuzzlePosition,getBiByeMuzzleDirection} from '../../shared/sim/biByeLlista.mjs';
import {biByeHitVolumes,biByeConstrainAim,biByeFirstHit} from '../../shared/sim/biByeComponents.mjs';
function vehicle(x=13.8,z=-13,heading=Math.PI){
 const b=createBiByeLlista({x,z,baseYaw:heading}),p={id:'driver',alive:true,position:{x,y:0,z},input:{yaw:heading,pitch:0}};
 mountBiByeLlista(b,p);return {b,p,room:{world:CASTLEWARD,players:new Map([[p.id,p]]),events:[]}};
}
function drive(s,forward,n=120){s.p.input.forward=forward;for(let i=0;i<n;i++)stepBiByeLlista(s.room,s.b,1/30,i/30);}
test('carriage leaves the actual Tourney gate and reverses through it with occupied bow collision',()=>{
 const s=vehicle();drive(s,1);assert.ok(s.b.z>-3,`blocked at ${s.b.z}`);drive(s,-1,200);assert.ok(s.b.z<-12);
});
test('gateposts still stop an off centre carriage',()=>{
 const s=vehicle(10.3);drive(s,1);assert.ok(s.b.z<-8,'post remains solid');
});
test('intact and failed supports occupy a compact span during travel and deployment',()=>{
 for(const mode of ['MOBILE','DEPLOYED'])for(const failed of [false,true]){
  const {b}=vehicle(0,0,Math.PI);b.mode=mode;
  if(failed)for(const [id,c]of Object.entries(b.components))if(id.startsWith('Stabilizer')){c.health=0;c.failedAt=0;}
  const boxes=biByeHitVolumes(b,1).filter(v=>v.componentId.startsWith('Stabilizer'));
  const ends=boxes.flatMap(v=>{const radius=v.axes.reduce((n,axis,i)=>n+Math.abs(axis[0])*v.size[i]/2,0);return [v.center[0]-radius,v.center[0]+radius];});
  assert.ok(Math.max(...ends)-Math.min(...ends)<(failed?4.1:3.8),`${mode} support span is too wide`);
 }
});
test('upper bow depresses toward nearby ground while the main bow keeps its existing stop',()=>{
 const {b}=vehicle(0,0,0);
 for(const yaw of [0,Math.PI/2,Math.PI]){
  const aim=biByeConstrainAim(b,{yaw,pitch:-.35},true);assert.ok(aim.pitch<=-.299);
  const copy={...b,upperYaw:aim.yaw,upperPitch:aim.pitch},p=getBiByeMuzzlePosition(copy,'conditioning'),d=getBiByeMuzzleDirection(copy,'conditioning');
  assert.ok(d.y<-.29);assert.equal(biByeFirstHit(copy,Object.values(p),[p.x+d.x*5,p.y+d.y*5,p.z+d.z*5],0,.05,'upper'),null);
 }
 assert.ok(Math.abs(biByeConstrainAim(b,{yaw:0,pitch:-.35}).pitch+.15)<1e-7);
});

test('lower depression envelope clears its own occupied machine through a full turn and main elevation',()=>{
 for(const mainPitch of [-.15,0,.35])for(let i=0;i<72;i++){
  const {b}=vehicle(0,0,0);Object.assign(b,{mode:'DEPLOYED',mainPitch});const a=biByeConstrainAim(b,{yaw:i*Math.PI/36,pitch:-.7},true);Object.assign(b,{upperYaw:a.yaw,upperPitch:a.pitch});
  const p=getBiByeMuzzlePosition(b,'conditioning'),d=getBiByeMuzzleDirection(b,'conditioning');
  assert.equal(biByeFirstHit(b,Object.values(p),[p.x+d.x*4,p.y+d.y*4,p.z+d.z*4],0,.05,'upper'),null,`${mainPitch}/${i*5} degrees`);
 }
});
