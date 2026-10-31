import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista,dismountBiByeLlista,fireBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {createSoFistication,mountSoFistication,soFistEntry,fireSoFistication,stepSoFistication,damageSoFistication,dismountSoFistication} from '../../shared/sim/soFistication.mjs';
import {soFistPose} from '../../shared/sim/soFistGeometry.mjs';
import {integratedRamHazard,SIEGE_SKILLS} from '../../shared/sim/siegeSkills.mjs';

const ground={floors:[{y:0,center:[0,-.1,0],size:[100,.2,100]}],solids:[],ramps:[],abyssY:-20};
function setup(kind){
 const room=new Room('SKILL',{mode:'PRACTICE'});room.world=structuredClone(ground);room.state='PLAYING';
 room.siegeSkillRandom=()=>.999999; // deterministic: long threshold, no random unrelated discharge
 const p=room.addPlayer({id:'op',token:'op',name:'op'},0);p.spawnProtectionUntil=0;
 const b=kind==='ram'?room.soFistication=createSoFistication():room.biByeLlista=createBiByeLlista({x:0,z:0,baseYaw:0});
 p.position=kind==='ram'?soFistEntry(b,room.world):{x:0,y:0,z:0};
 assert.ok(kind==='ram'?mountSoFistication(room,b,p):mountBiByeLlista(b,p));return{room,p,b};
}
const skill=(s,at=1)=>applyRoomCommand(s.room,s.p,{type:'siegeSkill'},at);
const kinds=s=>[...s.room.bibyeProjectiles.values()].map(p=>p.subKind);

test('ballista: priming neither launches nor consumes Bolt II or cooldown; second press deliberately commits',()=>{
 const s=setup('bow');assert.equal(skill(s).rejected,undefined);
 stepBiByeLlista(s.room,s.b,1/30,1.05);
 assert.deepEqual(kinds(s),[]);assert.equal(s.b.skill.phase,'primed');
 assert.equal(s.b.skill.readyAt,0);assert.equal(s.b.mainBoltLoaded,true);
 assert.equal(skill(s,1.1).rejected,undefined);
 assert.equal(s.b.skill.phase,'releasing');assert.equal(s.b.skill.readyAt,25.1);
 stepBiByeLlista(s.room,s.b,1/30,1.14);
 assert.deepEqual(kinds(s),['siege']);assert.equal(s.b.mainBoltLoaded,false);
 assert.equal(s.b.smallBoltReadyAt,0);assert.equal(s.b.skill.phase,'idle');
 assert.equal(serializeSnapshot(s.room,1.14).bibyeBallista.skill.readyAt,25.1);
 assert.ok(skill(s,1.5).rejected);
});

test('ballista: independent Bolt I after Bolt II remains available',()=>{
 const s=setup('bow');skill(s);skill(s,1.1);stepBiByeLlista(s.room,s.b,1/30,1.14);
 assert.equal(fireBiByeLlista(s.room,s.b,1.2),true);
 stepBiByeLlista(s.room,s.b,1/30,1.41);
 assert.deepEqual(kinds(s),['siege','conditioning']);
});

test('ballista: Bolt I first triggers a real 0.2s preparation after projectile release',()=>{
 const s=setup('bow');skill(s);
 assert.equal(fireBiByeLlista(s.room,s.b,1.1),true);
 assert.deepEqual(kinds(s),[]);
 assert.ok(skill(s,1.29).rejected); // Shot I release has not happened yet
 stepBiByeLlista(s.room,s.b,1/30,1.3);
 assert.deepEqual(kinds(s),['conditioning']);assert.equal(s.b.upperReleasedAt,1.3);
 assert.ok(skill(s,1.49).rejected);assert.equal(s.b.skill.phase,'primed');
 assert.equal(skill(s,1.5).rejected,undefined);
 stepBiByeLlista(s.room,s.b,1/30,1.535);
 assert.deepEqual(kinds(s),['conditioning','siege']);
 assert.ok(s.b.mainReleasedAt-s.b.upperReleasedAt>=.2-1e-8);
 assert.ok(s.b.mainReleasedAt-s.b.upperReleasedAt<.25);
});

test('ballista: pre-fired Bolt I does not require reloading before priming',()=>{
 const s=setup('bow');assert.equal(fireBiByeLlista(s.room,s.b,.8),true);
 stepBiByeLlista(s.room,s.b,1/30,1.0);assert.deepEqual(kinds(s),['conditioning']);
 assert.equal(skill(s,1.1).rejected,undefined);assert.equal(skill(s,1.2).rejected,undefined);
 stepBiByeLlista(s.room,s.b,1/30,1.24);
 assert.deepEqual(kinds(s),['conditioning','siege']);
});

test('ballista: while primed both real bows turn toward moving camera in MOBILE mode',()=>{
 const s=setup('bow');skill(s);
 s.p.input={...s.p.input,yaw:.6,pitch:.2,forward:1,right:.2};
 stepBiByeLlista(s.room,s.b,1/30,1.04);
 assert.ok(s.b.mainYaw>.05);assert.ok(s.b.upperYaw>.05);
 assert.ok(s.b.mainPitch>0);assert.ok(s.b.upperPitch>0);
 assert.equal(s.b.mainBoltLoaded,true);assert.deepEqual(kinds(s),[]);
});

test('ballista: primitive coupled volley remains available only outside primed Skill',()=>{
 const s=setup('bow');s.b.mode='DEPLOYED';s.b.weaponFocus='MAIN';
 assert.equal(fireBiByeLlista(s.room,s.b,1),true);
 assert.equal(s.b.skill.phase,'idle');assert.equal(s.b.coupling,'ALIGNING');
 assert.deepEqual(kinds(s),[]);
});

test('ballista: invalid heavy release, operator interruptions and machine cooldown',()=>{
 for(const when of ['before','after']){
  const s=setup('bow');skill(s);
  const intruder=s.room.addPlayer({id:'guest',token:'guest',name:'guest'},0);
  assert.ok(applyRoomCommand(s.room,intruder,{type:'siegeSkill'},1.05).rejected);
  if(when==='after') {skill(s,1.1);assert.equal(s.b.skill.readyAt,25.1);}
  dismountBiByeLlista(s.b,s.p);
  // Before commitment: ordinary priming is refundable. After commitment,
  // the actual physical heavy string is still owed through the dismount.
  assert.equal(s.b.skill.phase,when==='before'?'idle':'releasing');
  assert.equal(s.b.skill.readyAt,when==='before'?0:25.1);
  assert.equal(kinds(s).length,0);
  if(when==='after'){
    stepBiByeLlista(s.room,s.b,1/30,1.16);
    assert.equal(s.b.skill.phase,'idle');
    assert.deepEqual(kinds(s),['siege']);
  }
 }
 const s=setup('bow');s.b.mainBoltLoaded=false;assert.ok(skill(s).rejected);
 s.b.mainBoltLoaded=true;s.p.alive=false;assert.ok(skill(s).rejected);
});

test('ram: linear elapsed-time hazard is not a fixed six-second expiry or frame chance',()=>{
 const {initialHazard,growthRate}=SIEGE_SKILLS.beatToThePunch;
 assert.ok(initialHazard>0&&growthRate>0);
 const value=integratedRamHazard(20);
 assert.ok(Math.abs(value-(initialHazard*20+.5*growthRate*400))<1e-12);
 assert.ok(integratedRamHazard(30)>3*integratedRamHazard(10));
 const s=setup('ram');skill(s);
 for(let i=1;i<=240;i++)stepSoFistication(s.room,s.b,1/30,1+i/30);
 assert.equal(s.b.skill.phase,'primed');assert.equal(s.b.skill.expiresAt,null);
 assert.ok(s.b.skill.integratedHazard>0);
 assert.equal(serializeSnapshot(s.room,9).soFistication.skill.failureThreshold,undefined);
});

test('ram: deterministic failure threshold gives comparable release at distinct tick rates',()=>{
 const failureTime=rate=>{
  const s=setup('ram');s.room.siegeSkillRandom=()=>.12;skill(s);
  for(let i=1;i<=rate*25;i++){
   const t=1+i/rate;stepSoFistication(s.room,s.b,1/rate,t);
   const event=s.room.events.find(e=>e.type==='siegeSkill'&&e.action==='triggered');
   if(event)return{time:t,reason:event.reason,stroke:s.b.skillStroke};
  }throw Error('No spontaneous release');
 };
 const a=failureTime(30),b=failureTime(120);
 assert.equal(a.reason,'instability');assert.equal(b.reason,'instability');
 assert.ok(a.stroke&&b.stroke);assert.ok(Math.abs(a.time-b.time)<.04);
});

test('ram: real hull damage triggers a continuous physical outward stroke from any recovery position',()=>{
 for(const age of [.2,.88,1.8,3.5]){
  const s=setup('ram');fireSoFistication(s.room,s.b,0);
  assert.equal(skill(s,age).rejected,undefined);
  const before=soFistPose(s.b,age).offset;
  damageSoFistication(s.room,s.b,40,'enemy','sword',age,{componentId:'hull'});
  assert.ok(Math.abs(soFistPose(s.b,age).offset-before)<1e-8);
  assert.ok(s.b.skillStroke);const prep=s.b.skillStroke.prepare;
  assert.equal(soFistPose(s.b,age+prep/2).active,false);
  assert.ok(soFistPose(s.b,age+prep+.08).active);
  assert.equal(s.b.skill.phase,'idle');assert.equal(s.b.skill.readyAt,age+24);
 }
});

test('ram: invalid manual attack never cancels priming; legal attack does',()=>{
 const s=setup('ram');fireSoFistication(s.room,s.b,0);skill(s,1);
 assert.equal(fireSoFistication(s.room,s.b,1.1),false);
 assert.equal(s.b.skill.phase,'primed');
 assert.equal(fireSoFistication(s.room,s.b,4.1),true);
 assert.equal(s.b.skill.phase,'idle');assert.equal(s.b.skill.readyAt,28.1);
});

test('ram: reverse charging accrues real cooldown debt only after resolving',()=>{
 const s=setup('ram');skill(s);
 s.p.input={forward:-1,sprint:true};
 for(let i=1;i<=30;i++)stepSoFistication(s.room,s.b,1/30,1+i/30);
 assert.ok(s.b.speed<-2.5);assert.ok(s.b.pressure<100);
 assert.ok(s.b.skill.debt>1);assert.equal(s.b.skill.readyAt,0);
 const debt=s.b.skill.debt;
 s.p.input={};
 assert.equal(fireSoFistication(s.room,s.b,2.1),true);
 assert.ok(Math.abs(s.b.skill.readyAt-(2.1+24+debt))<1e-8);
});

test('ram: dismount or component loss preserves machine debt and cannot be reset by next operator',()=>{
 const s=setup('ram');skill(s);s.b.skill.debt=3;
 dismountSoFistication(s.room,s.b,s.p);
 assert.equal(s.b.skill.phase,'idle');assert.equal(s.b.skill.readyAt,28);
 s.p.position={x:20,y:0,z:20};
 const next=s.room.addPlayer({id:'next',token:'next',name:'next'},2);
 next.position=soFistEntry(s.b,s.room.world);assert.ok(mountSoFistication(s.room,s.b,next,2));
 assert.ok(applyRoomCommand(s.room,next,{type:'siegeSkill'},2).rejected);
 const d=setup('ram');skill(d);damageSoFistication(d.room,d.b,1000,'enemy','sword',1.1,{componentId:'Drive'});
 assert.equal(d.b.skill.phase,'idle');assert.equal(d.b.skillStroke,null);
 assert.ok(d.b.skill.readyAt>=25.1);
});

test('ram: genuine enemy reach and wall remain physical contacts',()=>{
 const s=setup('ram'),v=s.room.addPlayer({id:'victim',token:'victim',name:'victim'},0);
 v.position={x:0,y:0,z:-3.8};v.health=500;v.maxHealth=500;v.spawnProtectionUntil=0;
 skill(s);
 for(let i=1;i<=45;i++)stepSoFistication(s.room,s.b,1/30,1+i/30);
 assert.equal(s.room.events.filter(e=>e.type==='siegeSkill'&&e.action==='triggered'&&e.reason==='reach').length,1);
 assert.ok(v.health<500);
 const w=setup('ram');skill(w);damageSoFistication(w.room,w.b,40,'enemy','sword',1.1,{componentId:'hull'});
 w.room.world.solids=[{center:[0,1,-3],size:[4,3,.15]}];
 for(let i=1;i<=35;i++)stepSoFistication(w.room,w.b,1/30,1.1+i/30);
 assert.ok(w.b.strokeLimit!=null);
});

test('ballista: deployed MAIN ATTACK stays independent while Skill is primed',()=>{
 const s=setup('bow');s.b.mode='DEPLOYED';s.b.weaponFocus='MAIN';skill(s);
 assert.equal(fireBiByeLlista(s.room,s.b,1.1),true);
 assert.equal(s.b.coupling,'INDEPENDENT');
 assert.ok(s.b.mobileShotPendingAt>1.1);
 assert.equal(s.b.skill.phase,'primed');assert.equal(s.b.mainBoltLoaded,true);
});

test('ram: a long priming period cannot pay off its future cooldown',()=>{
 const s=setup('ram');skill(s);
 for(let i=1;i<=600;i++)stepSoFistication(s.room,s.b,1/30,1+i/30);
 assert.equal(s.b.skill.phase,'primed');assert.equal(s.b.skill.readyAt,0);
 assert.equal(fireSoFistication(s.room,s.b,21.1),true);
 assert.equal(s.b.skill.readyAt,45.1);
 assert.ok(skill(s,21.2).rejected);
});

test('ram: guarding the genuine reach strike still mitigates its one real contact',()=>{
 for(const guarded of [false,true]){
  const s=setup('ram'),v=s.room.addPlayer({id:'guardVictim',token:'v',name:'v'},0);
  v.position={x:0,y:0,z:-3.8};v.health=500;v.maxHealth=500;v.spawnProtectionUntil=0;
  v.guarding=guarded;v.guardHeld=guarded;v.yaw=Math.PI;v.guardStamina=100;
  skill(s);
  for(let i=1;i<=45;i++)stepSoFistication(s.room,s.b,1/30,1+i/30);
  const hits=s.room.events.filter(e=>e.type==='soFistImpact'&&e.victimId===v.id);
  assert.equal(hits.length,1);assert.ok(v.health<500);
  if(guarded){assert.ok(hits[0].guarded);assert.ok(v.health>420);}
 }
});

test('BOTH: atomic mobile Skill releases heavy first, then the genuine upper bolt exactly once',()=>{
 const s=setup('bow');assert.equal(skill(s).rejected,undefined);
 const command=applyRoomCommand(s.room,s.p,{type:'bibyeCombinedFire'},1.1);
 assert.equal(command.rejected,undefined);assert.equal(s.b.skill.readyAt,25.1);
 assert.deepEqual(kinds(s),[]);
 stepBiByeLlista(s.room,s.b,1/30,1.14);
 assert.deepEqual(kinds(s),['siege']);assert.equal(s.b.mainBoltLoaded,false);
 assert.ok(Math.abs(s.b.combinedUpperPendingAt-1.34)<1e-8);
 stepBiByeLlista(s.room,s.b,1/30,1.3);
 assert.deepEqual(kinds(s),['siege']);
 stepBiByeLlista(s.room,s.b,1/30,1.35);
 assert.deepEqual(kinds(s),['siege','conditioning']);
 const shots=s.room.events.filter(e=>e.type==='bibyeBoltSpawned').map(e=>({kind:e.projectile.subKind,at:e.at}));
 assert.equal(shots.length,2);assert.ok(Math.abs(shots[1].at-shots[0].at-.2)<1e-8);
 stepBiByeLlista(s.room,s.b,1/30,1.4);assert.equal(kinds(s).length,2);
 assert.ok(s.b.smallBoltReadyAt>1.35);assert.equal(s.b.combinedUpperPendingAt,null);
});

test('BOTH: unprimed, unavailable upper, or another operator cannot commit combined fire',()=>{
 const s=setup('bow');
 const both=at=>applyRoomCommand(s.room,s.p,{type:'bibyeCombinedFire'},at);
 assert.ok(both(1).rejected);assert.equal(s.b.skill.readyAt,0);
 skill(s,1.1);s.b.smallBoltReadyAt=3;
 assert.ok(both(1.2).rejected);assert.equal(s.b.skill.phase,'primed');
 s.b.smallBoltReadyAt=0;
 const stranger=s.room.addPlayer({id:'stranger',token:'stranger',name:'stranger'},0);
 assert.ok(applyRoomCommand(s.room,stranger,{type:'bibyeCombinedFire'},1.3).rejected);
 assert.equal(both(1.4).rejected,undefined);
 assert.ok(both(1.41).rejected);assert.equal(s.b.skill.readyAt,25.4);
});

test('BOTH: committed upper follow-through persists after operator dismount, never clones ammunition',()=>{
 const s=setup('bow');skill(s);applyRoomCommand(s.room,s.p,{type:'bibyeCombinedFire'},1.1);
 stepBiByeLlista(s.room,s.b,1/30,1.14);
 dismountBiByeLlista(s.b,s.p);
 stepBiByeLlista(s.room,s.b,1/30,1.35);
 assert.deepEqual(kinds(s),['siege','conditioning']);
 assert.equal(s.b.skill.readyAt,25.1);
});

test('BOTH: normal mobile movement and independent shot paths are preserved',()=>{
 const s=setup('bow');skill(s);
 s.p.input={...s.p.input,forward:1,right:.5,yaw:.2,pitch:.15};
 applyRoomCommand(s.room,s.p,{type:'bibyeCombinedFire'},1.1);
 for(let i=0;i<10;i++)stepBiByeLlista(s.room,s.b,1/30,1.1+i/30);
 assert.ok(Math.hypot(s.b.x,s.b.z)>0.02);
 assert.deepEqual(kinds(s),['siege','conditioning']);
});


test('RMB cannot prime Skill or fire Bolt II without a legitimate U activation',()=>{
 const s=setup('bow');const fire=at=>applyRoomCommand(s.room,s.p,{type:'bibyeHeavyFire'},at);
 assert.ok(fire(.9).rejected);assert.equal(s.b.skill.phase,'idle');
 assert.equal(skill(s,1).rejected,undefined);
 assert.equal(fire(1.02).rejected,undefined);assert.equal(s.b.skill.phase,'releasing');
 stepBiByeLlista(s.room,s.b,1/30,1.07);
 assert.deepEqual(kinds(s),['siege']);assert.equal(s.b.skill.readyAt,25.02);
 assert.equal(s.b.mainBoltLoaded,false);assert.ok(fire(1.08).rejected);
});

test('Skill ignores stale Bolt I release but enforces .2s from the current activation physical release',()=>{
 const a=setup('bow');fireBiByeLlista(a.room,a.b,.5);stepBiByeLlista(a.room,a.b,1/30,.71);
 assert.equal(skill(a,1).rejected,undefined);
 assert.equal(applyRoomCommand(a.room,a.p,{type:'bibyeHeavyFire'},1.01).rejected,undefined);
 const b=setup('bow');skill(b,1);
 fireBiByeLlista(b.room,b.b,1.05);
 assert.ok(applyRoomCommand(b.room,b.p,{type:'bibyeHeavyFire'},1.06).rejected);
 stepBiByeLlista(b.room,b.b,1/30,1.25);
 assert.ok(applyRoomCommand(b.room,b.p,{type:'bibyeHeavyFire'},1.44).rejected);
 assert.equal(applyRoomCommand(b.room,b.p,{type:'bibyeHeavyFire'},1.45).rejected,undefined);
});

test('RMB captures latest camera direction, but waits for mechanical rotation before actual release',()=>{
 const s=setup('bow');skill(s,1);
 s.p.input={...s.p.input,yaw:.7,pitch:.2};
 assert.equal(applyRoomCommand(s.room,s.p,{type:'bibyeHeavyFire'},1.01).rejected,undefined);
 assert.ok(s.b.heavySkill.aim.yaw>.6);
 stepBiByeLlista(s.room,s.b,1/30,1.043);
 assert.deepEqual(kinds(s),[]);
 for(let i=1;i<=30;i++)stepBiByeLlista(s.room,s.b,1/30,1.043+i/30);
 assert.deepEqual(kinds(s),['siege']);
});


test('Atomic RMB captures command-time aim rather than stale periodic movement input',()=>{
 const s=setup('bow');skill(s,1);
 s.p.input={...s.p.input,yaw:0,pitch:0,siegeTarget:{x:0,y:1,z:-30}};
 const clicked=applyRoomCommand(s.room,s.p,{type:'bibyeHeavyFire',yaw:.28,pitch:.1},1.01);
 assert.equal(clicked.rejected,undefined);
 assert.ok(Math.abs(s.b.heavySkill.aim.yaw-.28)<.02,'heavy bow must not use old yaw');
 assert.ok(Math.abs(s.b.heavySkill.aim.pitch-.1)<.02,'heavy bow must not use old pitch');
});
