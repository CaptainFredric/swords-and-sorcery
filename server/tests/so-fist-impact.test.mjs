import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {stepRoom} from '../../shared/sim/combat.mjs';
import {createSoFistication,mountSoFistication,soFistEntry,stepSoFistication,fireSoFistication} from '../../shared/sim/soFistication.mjs';
import {createBiByeLlista,stepBiByeLlista,toggleBiByeDeploy} from '../../shared/sim/biByeLlista.mjs';
import {primeSoFistSkill} from '../../shared/sim/soFistication.mjs';
import {applyBallistaImpact,ramReboundSpeed,siegeRock,recordSiegeImpact,SIEGE_IMPACT} from '../../shared/sim/siegeImpact.mjs';
const ground={floors:[{y:0,center:[0,-.1,0],size:[100,.2,100]}],solids:[],ramps:[],abyssY:-20};
function room(){
 const r=new Room('RAMHIT',{mode:'PRACTICE'});r.world=structuredClone(ground);r.state='PLAYING';
 r.siegeSkillRandom=()=>.999999;return r;
}
test('stationary piston strike against masonry translates the carriage backwards',()=>{
 const r=room(),b=r.soFistication=createSoFistication(),p=r.addPlayer({id:'ram-driver',token:'ram-driver',name:'driver'},0);
 p.position=soFistEntry(b,r.world);assert.ok(mountSoFistication(r,b,p));
 r.world.solids=[{id:'stone',center:[0,1,-2.9],size:[8,2,.1],material:'stone'}];
 const start=b.z;assert.ok(fireSoFistication(r,b,0));
 for(let i=1;i<=60;i++)stepSoFistication(r,b,1/30,i/30);
 assert.ok(r.events.some(e=>e.type==='siegeImpact'&&e.kind==='piston-wall'),'piston made actual stone contact');
 assert.ok(b.z>start+.2,'physical backward displacement, not camera rocking');
 assert.ok(Math.abs(b.wheelRolls[0])>.25,'real wheel travel during recoil');
});
test('stationary fist strike moves both the enemy and its own carriage',()=>{
 const r=room(),b=r.soFistication=createSoFistication(),p=r.addPlayer({id:'ram-driver2',token:'ram-driver2',name:'driver'},0);
 p.position=soFistEntry(b,r.world);assert.ok(mountSoFistication(r,b,p));
 const v=r.addPlayer({id:'ram-victim2',token:'ram-victim2',name:'victim'},0);
 v.position={x:0,y:0,z:-3.3};v.health=300;v.spawnProtectionUntil=0;
 const start=b.z;assert.ok(fireSoFistication(r,b,0));
 for(let i=1;i<=65;i++)stepRoom(r,1/30,i/30,r.world);
 assert.ok(r.events.some(e=>e.type==='soFistImpact'&&e.piston),'genuine piston hit');
 assert.ok(b.z>start+.2,'ram physically recoils after hitting enemy');
 assert.ok(v.position.z<-4,'struck enemy actually launches forwards');
});
test('an actual stationary piston hit translates a live mobile ballista, not only its visual rig',()=>{
 const r=room(),ram=r.soFistication=createSoFistication(),driver=r.addPlayer({id:'impact-driver',token:'impact-driver',name:'driver'},0);
 driver.position=soFistEntry(ram,r.world);assert.ok(mountSoFistication(r,ram,driver));
 const ballista=r.biByeLlista=createBiByeLlista({x:0,z:-5.5,baseYaw:0});
 const start=ballista.z;
 assert.ok(fireSoFistication(r,ram,0));
 for(let i=1;i<=100;i++)stepRoom(r,1/30,i/30,r.world);
 assert.ok(r.events.some(e=>e.type==='bibyeDamaged'&&e.source==='so-fist'),'fist must contact machine component');
 assert.ok(ballista.z<start-.06,'impacted machine must translate across the world');
 assert.equal(r.events.some(e=>e.type==='bibyeOutriggersUprooted'),false,
   'a ballista already in MOBILE has no planted outriggers to uproot');
 assert.equal(ballista.mode,'MOBILE','ram strikes must never deploy mobile outriggers');
 assert.ok(ram.z>.2,'hitting the machine must also recoil the attacker');
});
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
test('a heavy hit UPROOTS deployed outriggers, forcibly retracts to mobile, and delivers real knockback',()=>{
 const r=room(),b=r.biByeLlista=createBiByeLlista({x:0,z:0,baseYaw:0});
 b.mode='DEPLOYED';b.terrainInitialized=true;b.y=0;
 const z=b.z;
 assert.equal(applyBallistaImpact(r,b,1,{normal:{x:0,z:-1},speed:12}),true);
 assert.equal(b.mode,'RETRACTING','impact must eject supports from the ground, not deploy them');
 assert.equal(b.retractFrom,1,'a fully planted foot begins a full physical removal animation');
 assert.ok(b.dislodgedImpulse.z<0,'ballista inherits queued physical impulse');
 assert.equal(b.externalVelocity.z,0,'feet have not left the ground yet');
 const uproot=r.events.filter(e=>e.type==='bibyeOutriggersUprooted');
 assert.equal(uproot.length,1,'server creates exactly one authoritative outrigger dislodgement');
 for(let i=1;i<=26;i++)stepBiByeLlista(r,b,1/30,1+i/30);
 assert.equal(b.mode,'MOBILE','impact ends in MOBILE mode after legs clear the ground');
 assert.ok(b.z<z-.025,'real ballista chassis is shoved backwards after unbracing');
 assert.ok(b.wheelRolls.some(v=>Math.abs(v)>0),'wheels actually roll with the impact');
 assert.equal(b.dislodgedImpulse,null,'queued impulse applied only once');
 assert.equal(toggleBiByeDeploy(b,2,r.world),false,'uprooted supports cannot instantly redeploy');
 assert.equal(toggleBiByeDeploy(b,3.3,r.world),true,'player may choose Heavy again after recovery');
 assert.equal(b.mode,'DEPLOYING','redeployment is voluntary rather than automatic');
});
test('mobile impacts preserve ordinary shove without planting anything or creating uproot events',()=>{
 const r=room(),b=createBiByeLlista({x:0,z:0,baseYaw:0});
 applyBallistaImpact(r,b,1,{normal:{x:0,z:-1},speed:16});
 assert.equal(b.mode,'MOBILE');
 assert.equal(b.dislodgedImpulse,null);
 assert.equal(b.outriggersDislodgedUntil,-Infinity);
 assert.ok(b.externalVelocity.z<0);
 assert.equal(r.events.some(e=>e.type==='bibyeOutriggersUprooted'),false);
});
test('light contact rocks deployed outriggers without unplanting them or creating free movement',()=>{
 const r=room(),b=r.biByeLlista=createBiByeLlista({x:0,z:0,baseYaw:0});
 b.mode='DEPLOYED';b.operatorId=null;
 applyBallistaImpact(r,b,1,{normal:{x:0,z:-1},speed:7});
 assert.equal(b.mode,'DEPLOYED');
 assert.equal(b.externalVelocity?.z??0,0);
 assert.equal(b.dislodgedImpulse,null);
 assert.equal(r.events.some(e=>e.type==='bibyeOutriggersUprooted'),false);
 const p=siegeRock(b,1.1);
 assert.ok(Math.abs(p.pitch)>0);
});
test('a second impact during involuntary outrigger release cannot restart ejection',()=>{
 const r=room(),b=createBiByeLlista({x:0,z:0,baseYaw:0});
 b.mode='DEPLOYED';
 applyBallistaImpact(r,b,1,{normal:{x:0,z:-1},speed:12});
 const until=b.modeTransitionEndsAt;
 applyBallistaImpact(r,b,1.12,{normal:{x:0,z:-1},speed:17});
 assert.equal(b.mode,'RETRACTING');
 assert.equal(b.modeTransitionEndsAt,until);
 assert.equal(r.events.filter(e=>e.type==='bibyeOutriggersUprooted').length,1);
});
test('a genuine live piston against a DEPLOYED ballista triggers involuntary unbracing',()=>{
 const r=room(),ram=r.soFistication=createSoFistication(),driver=r.addPlayer({id:'heavy-driver',token:'heavy-driver',name:'Driver'},0);
 driver.position=soFistEntry(ram,r.world);
 assert.ok(mountSoFistication(r,ram,driver));
 const b=r.biByeLlista=createBiByeLlista({x:0,z:-5.5,baseYaw:0});
 b.mode='DEPLOYED';b.weaponFocus='MAIN';
 assert.ok(fireSoFistication(r,ram,0));
 for(let i=1;i<=100;i++)stepRoom(r,1/30,i/30,r.world);
 assert.ok(r.events.some(e=>e.type==='bibyeDamaged'&&e.source==='so-fist'),
   'actual piston struck the real heavy-machine component');
 assert.ok(r.events.some(e=>e.type==='bibyeOutriggersUprooted'),
   'piston must dislodge the planted supports through the gameplay hit path');
 assert.equal(b.mode,'MOBILE');
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
