import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {stepRoom} from '../../shared/sim/combat.mjs';
import {createSoFistication,mountSoFistication,soFistEntry,stepSoFistication,fireSoFistication} from '../../shared/sim/soFistication.mjs';
import {createBiByeLlista,stepBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {primeSoFistSkill} from '../../shared/sim/soFistication.mjs';
import {applyBallistaImpact,ramReboundSpeed,siegeRock,recordSiegeImpact,SIEGE_IMPACT} from '../../shared/sim/siegeImpact.mjs';
const ground={floors:[{y:0,center:[0,-.1,0],size:[100,.2,100]}],solids:[],ramps:[],abyssY:-20};
function room(){
 const r=new Room('RAMHIT',{mode:'PRACTICE'});r.world=structuredClone(ground);r.state='PLAYING';
 r.siegeSkillRandom=()=>.999999;return r;
}
test('carriage collision transfers only bounded momentum and visually settles',()=>{
 assert.equal(ramReboundSpeed(2),0);
 assert.ok(ramReboundSpeed(12)<-1&&ramReboundSpeed(12)>=-SIEGE_IMPACT.ramReboundMax);
 assert.ok(ramReboundSpeed(-12)>1);
 const r=room(),b=createSoFistication();
 assert.equal(recordSiegeImpact(r,b,1,{speed:2,normal:{x:0,z:1}}),false);
 assert.equal(recordSiegeImpact(r,b,2,{speed:10,normal:{x:0,z:1}}),true);
 assert.equal(recordSiegeImpact(r,b,2.05,{speed:10,normal:{x:0,z:1}}),false);
 assert.ok(Math.abs(siegeRock(b,2.1).pitch)>0.001);
 assert.equal(siegeRock(b,4).pitch,0);
});
test('actual mobile ballista translates from external momentum without operator input',()=>{
 const r=room(),b=r.biByeLlista=createBiByeLlista({x:0,z:0,baseYaw:0});
 b.terrainInitialized=true;b.y=0;b.operatorId=null;
 applyBallistaImpact(r,b,1,{normal:{x:0,z:-1},speed:12});
 assert.ok(b.externalVelocity.z<0);
 const start=b.z;
 for(let i=1;i<=12;i++)stepBiByeLlista(r,b,1/30,1+i/30);
 assert.ok(b.z<start-.06,'unoccupied ballista must actually travel on the map');
 assert.ok(Math.hypot(...b.wheelRolls)>0,'real wheel roll accompanies displacement');
 assert.ok(Math.hypot(b.externalVelocity.x,b.externalVelocity.z)<3.4);
});
test('a deployed ballista absorbs shock but does not magically drive away',()=>{
 const r=room(),b=r.biByeLlista=createBiByeLlista({x:0,z:0,baseYaw:0});
 b.mode='DEPLOYED';b.operatorId=null;
 applyBallistaImpact(r,b,1,{normal:{x:0,z:-1},speed:12});
 assert.equal(b.externalVelocity?.z??0,0);
 const p=siegeRock(b,1.1);
 assert.ok(Math.abs(p.pitch)>0);
});
test('reverse pressure charge accelerates while consuming actual reserve and retaining cooldown debt',()=>{
 const r=room(),b=r.soFistication=createSoFistication();
 const p=r.addPlayer({id:'operator',token:'operator',name:'operator'},0);
 p.position=soFistEntry(b,r.world);assert.ok(mountSoFistication(r,b,p));
 assert.equal((primeSoFistSkill(r,b,p,1)),null);
 p.input={...p.input,forward:-1,sprint:true};
 for(let i=1;i<=30;i++)stepSoFistication(r,b,1/30,1+i/30);
 assert.ok(b.speed<-3.5);assert.ok(b.pressure<100);
 assert.ok(b.skill.debt>1);assert.equal(b.skill.phase,'primed');
});

test('lethal piston impact launches the defeated Spellblade in world space without duplicate kills',()=>{
 const r=room(),b=r.soFistication=createSoFistication(),p=r.addPlayer({id:'driver',token:'driver',name:'driver'},0);
 p.position=soFistEntry(b,r.world);assert.ok(mountSoFistication(r,b,p));
 const victim=r.addPlayer({id:'victim',token:'victim',name:'victim'},0);
 victim.position={x:0,y:0,z:-3.8};victim.health=25;victim.maxHealth=100;victim.spawnProtectionUntil=0;
 assert.equal(fireSoFistication(r,b,0),true);
 for(let i=1;i<=35&&victim.alive;i++)stepSoFistication(r,b,1/30,i/30);
 assert.equal(victim.alive,false);assert.ok(victim.deathFlight);
 const deadAt={...victim.position},respawn=victim.respawnAt;
 for(let i=1;i<=13;i++)stepRoom(r,1/30,1.18+i/30,r.world);
 assert.ok(Math.hypot(victim.position.x-deadAt.x,victim.position.z-deadAt.z)>.3);
 assert.ok(victim.position.y>=deadAt.y);
 assert.equal(victim.respawnAt,respawn);
 assert.equal(r.events.filter(e=>e.type==='death'&&e.victimId===victim.id).length,1);
});
