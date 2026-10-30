import test from 'node:test';import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista,dismountBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {createSoFistication,mountSoFistication,soFistEntry,fireSoFistication,stepSoFistication,damageSoFistication,dismountSoFistication} from '../../shared/sim/soFistication.mjs';
import {soFistPose,soFistStriker} from '../../shared/sim/soFistGeometry.mjs';
const ground={floors:[{y:0,center:[0,-.1,0],size:[100,.2,100]}],solids:[],ramps:[],abyssY:-20};
function setup(kind){const room=new Room('SKILL',{mode:'PRACTICE'});room.world=structuredClone(ground);room.state='PLAYING';const p=room.addPlayer({id:'op',token:'op',name:'op'},0);p.spawnProtectionUntil=0;const b=kind==='ram'?room.soFistication=createSoFistication():room.biByeLlista=createBiByeLlista({x:0,z:0,baseYaw:0});p.position=kind==='ram'?soFistEntry(b,room.world):{x:0,y:0,z:0};assert.ok(kind==='ram'?mountSoFistication(room,b,p):mountBiByeLlista(b,p));return{room,p,b};}
const activate=s=>applyRoomCommand(s.room,s.p,{type:'siegeSkill'},1);
test('independent heavy skill consumes only Bolt II, preserves reload and machine clock across handoff',()=>{
 const s=setup('bow');assert.equal(activate(s).rejected,undefined);stepBiByeLlista(s.room,s.b,1/30,1.3);const shots=[...s.room.bibyeProjectiles.values()];assert.deepEqual(shots.map(p=>p.subKind),['siege']);assert.equal(s.b.mainBoltLoaded,false);assert.equal(s.b.smallBoltReadyAt,0);assert.equal(s.b.skill.readyAt,25);
 const reload=s.b.reloadEndsAt;dismountBiByeLlista(s.b,s.p);s.p.position={x:0,y:0,z:0};mountBiByeLlista(s.b,s.p,2);assert.ok(applyRoomCommand(s.room,s.p,{type:'siegeSkill'},2).rejected);assert.equal(s.b.reloadEndsAt,reload);
 assert.equal(serializeSnapshot(s.room,2).bibyeBallista.skill.readyAt,25);
});
test('skill rejects unauthorized, dead, empty and busy requests without spending',()=>{
 const s=setup('bow'),intruder=s.room.addPlayer({id:'other',token:'other',name:'other'},0);
 assert.ok(applyRoomCommand(s.room,intruder,{type:'siegeSkill'},1).rejected);s.b.mainBoltLoaded=false;assert.ok(activate(s).rejected);assert.equal(s.b.skill.readyAt,0);
 s.b.mainBoltLoaded=true;s.p.alive=false;assert.ok(activate(s).rejected);s.p.alive=true;s.b.coupling='FIRING';assert.ok(activate(s).rejected);
});
for(const age of [.2,.88,1.8,3.5])test(`ram special retracts continuously from cycle age ${age} and cancels without refund`,()=>{
 const s=setup('ram');fireSoFistication(s.room,s.b,0);const t=age;assert.equal(applyRoomCommand(s.room,s.p,{type:'siegeSkill'},t).rejected,undefined);
 const before=soFistPose(s.b,t).offset;damageSoFistication(s.room,s.b,40,'enemy','sword',t,{componentId:'hull'});
 assert.ok(Math.abs(soFistPose(s.b,t).offset-before)<1e-8);assert.ok(s.b.skillStroke);const prep=s.b.skillStroke.prepare;
 assert.equal(soFistPose(s.b,t+prep/2).active,false);assert.ok(soFistPose(s.b,t+prep+.08).active);assert.ok(soFistPose(s.b,t+prep+.08).velocity>0);
 assert.equal(s.b.skill.phase,'idle');assert.equal(s.b.strikeAt,t);assert.equal(fireSoFistication(s.room,s.b,t+.5),false);
});
test('fist damage cannot bait; manual attack and dismount cancel priming, cooldown remains',()=>{
 const s=setup('ram');activate(s);damageSoFistication(s.room,s.b,100,'enemy','sword',1.1,{componentId:'Fist'});assert.equal(s.b.skill.phase,'primed');
 fireSoFistication(s.room,s.b,1.2);assert.equal(s.b.skill.phase,'idle');assert.equal(s.b.skill.readyAt,25);
 s.b.skill.readyAt=0;applyRoomCommand(s.room,s.p,{type:'siegeSkill'},2);dismountSoFistication(s.room,s.b,s.p);assert.equal(s.b.skill.phase,'idle');assert.equal(s.b.skill.readyAt,26);
});
test('reverse charge spends pressure and adds persistent cooldown debt; expiry ends priming',()=>{
 const s=setup('ram');activate(s);s.p.input={forward:-1,sprint:true};for(let i=1;i<=30;i++)stepSoFistication(s.room,s.b,1/30,1+i/30);
 assert.ok(s.b.speed<-2.5);assert.ok(s.b.pressure<100);assert.ok(s.b.skill.readyAt>26);assert.ok(s.b.skill.debt>1);s.p.input={};stepSoFistication(s.room,s.b,1/30,8);assert.equal(s.b.skill.phase,'idle');
});
test('real hostile reach triggers one outward stroke, Guard mitigates it, and walls arrest it',()=>{
 for(const guarded of [false,true]){
  const s=setup('ram'),v=s.room.addPlayer({id:'victim',token:'v',name:'v'},0);v.position={x:0,y:0,z:-3.8};v.health=500;v.maxHealth=500;v.spawnProtectionUntil=0;v.guarding=guarded;v.guardHeld=guarded;v.yaw=Math.PI;v.guardStamina=100;
  activate(s);for(let i=0;i<45;i++)stepSoFistication(s.room,s.b,1/30,1+i/30);
  const hits=s.room.events.filter(e=>e.type==='soFistImpact'&&e.victimId===v.id);assert.equal(hits.length,1);assert.ok(v.health<500);if(guarded){assert.ok(hits[0].guarded);assert.ok(v.health>420);}
 }
 const s=setup('ram');activate(s);damageSoFistication(s.room,s.b,40,'enemy','sword',1,{componentId:'hull'});s.room.world.solids=[{center:[0,1,-3],size:[4,3,.15]}];
 for(let i=1;i<35;i++)stepSoFistication(s.room,s.b,1/30,1+i/30);
 assert.ok(s.b.strokeLimit!=null);assert.ok(soFistPose(s.b,1.8).offset<=s.b.strokeLimit+1e-7);
});
test('operator loss before independent heavy release cancels, but neither refunds skill nor consumes ammunition',()=>{
 for(const reason of ['death','dismount','disconnect']){
  const s=setup('bow');activate(s);if(reason==='dismount')dismountBiByeLlista(s.b,s.p);if(reason==='death')s.p.alive=false;if(reason==='disconnect')s.p.connected=false;
  stepBiByeLlista(s.room,s.b,1/30,1.3);assert.equal(s.room.bibyeProjectiles?.size??0,0);assert.ok(s.b.mainBoltLoaded);assert.equal(s.b.skill.readyAt,25);assert.equal(s.b.skill.phase,'idle');
 }
});
test('ram cooldown belongs to the instance after a different operator boards',()=>{
 const s=setup('ram');activate(s);dismountSoFistication(s.room,s.b,s.p);s.p.position={x:20,y:0,z:20};
 const next=s.room.addPlayer({id:'next',token:'next',name:'next'},2);next.position=soFistEntry(s.b,s.room.world);assert.ok(mountSoFistication(s.room,s.b,next,2));
 assert.ok(applyRoomCommand(s.room,next,{type:'siegeSkill'},2).rejected);assert.equal(s.b.skill.readyAt,25);
});
test('a second genuine stroke can hit the same victim without overlap farming',()=>{
 const s=setup('ram'),v=s.room.addPlayer({id:'victim2',token:'v2',name:'v2'},0);v.position={x:0,y:0,z:-3.8};v.health=500;v.maxHealth=500;v.spawnProtectionUntil=0;
 fireSoFistication(s.room,s.b,0);for(let i=1;i<=30;i++)stepSoFistication(s.room,s.b,1/30,i/30);
 const first=v.health;assert.ok(first<500);assert.equal(applyRoomCommand(s.room,s.p,{type:'siegeSkill'},1.1).rejected,undefined);
 for(let i=1;i<=75;i++)stepSoFistication(s.room,s.b,1/30,1.1+i/30);
 assert.ok(v.health<first);assert.equal(s.room.events.filter(e=>e.type==='soFistImpact'&&e.victimId===v.id).length,2);
});
test('destroying the primed drive cancels immediately before another damage event can bait release',()=>{
 const s=setup('ram');activate(s);damageSoFistication(s.room,s.b,1000,'enemy','sword',1.1,{componentId:'Drive'});damageSoFistication(s.room,s.b,40,'enemy','sword',1.1,{componentId:'hull'});
 assert.equal(s.b.skill.phase,'idle');assert.equal(s.b.skillStroke,null);assert.equal(s.b.skill.readyAt,25);
});
test('stagger and inactive multiplayer match reject without spending',()=>{
 const s=setup('ram');s.p.staggerUntil=2;assert.ok(activate(s).rejected);assert.equal(s.b.skill.readyAt,0);s.p.staggerUntil=0;s.room.mode='FFA';s.room.state='LOBBY';assert.ok(activate(s).rejected);assert.equal(s.b.skill.readyAt,0);
});
test('independent heavy accepts a spent upper bolt and smoothly releases a pretracked clutch',()=>{
 for(const tracked of [false,true]){
  const s=setup('bow');s.b.smallBoltReadyAt=10;
  if(tracked){s.b.smallBoltReadyAt=0;s.b.mode='DEPLOYED';s.b.weaponFocus='MAIN';s.b.trackingSince=0;}
  assert.equal(activate(s).rejected,undefined);if(tracked){assert.equal(s.b.coupling,'RELEASING');stepBiByeLlista(s.room,s.b,1/30,1.3);assert.equal(s.room.bibyeProjectiles?.size??0,0);}
  for(let i=1;i<=35;i++)stepBiByeLlista(s.room,s.b,1/30,1+i/30);
  assert.deepEqual([...s.room.bibyeProjectiles.values()].map(p=>p.subKind),['siege']);assert.equal(s.b.smallBoltReadyAt,tracked?0:10);
 }
});
