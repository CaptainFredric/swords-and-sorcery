import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Room} from '../../shared/sim/Room.mjs';
import {createSoFistication,soFistEntry,mountSoFistication,
 primeSoFistSkill,stepSoFistication,fireSoFistication,damageSoFistication}
 from '../../shared/sim/soFistication.mjs';
import {assembleSoFistAsset,SO_FIST_V26} from '../../scripts/assemble-so-fist-v26.mjs';
import {soFistUpperPoint} from '../../shared/sim/soFistElevation.mjs';
import {soFistFrame,SO_FIST_SCALE} from '../../shared/sim/soFistGeometry.mjs';
import {boardHellpingHand,exitHellpingHand} from '../../shared/sim/soFistHellpingHand.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
function game(skill='hellpingHand'){
 const room=new Room('HELLPING_TEST',{mode:'PRACTICE'});room.state='PLAYING';
 room.world={solids:[],ramps:[],floors:[{id:'floor',center:[0,-.1,0],
   size:[150,.2,150],y:0}],spawnPoints:[{x:0,y:0,z:0}],abyssY:-35};
 const op=room.addPlayer({id:'operator',token:'operator',name:'Operator',
   siegeLoadout:{soFist:skill}},0);
 const b=room.soFistication=createSoFistication({x:0,y:0,z:0,heading:0});
 op.position=soFistEntry(b,room.world);op.spawnProtectionUntil=0;
 assert.equal(mountSoFistication(room,b,op,0),true);
 return {room,op,b};
}
const tick=(s,from,to)=>{
 for(let t=from+1/30;t<=to+1e-8;t+=1/30)
  stepSoFistication(s.room,s.b,1/30,t,s.room.world);
};
test('original Argon hand is byte-exact and contains 26 clips and all five joint chains',()=>{
 const file=readFileSync(assembleSoFistAsset('glb'));
 assert.equal(file.length,SO_FIST_V26.glb.bytes);
 assert.equal(createHash('sha256').update(file).digest('hex'),SO_FIST_V26.glb.sha256);
 assert.equal(file.toString('ascii',0,4),'glTF');
 const gltf=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString('utf8'));
 assert.equal(gltf.animations.length,26);
 for(const prefix of ['Index','Middle','Ring','Pinky','Thumb'])
  for(const n of [1,2,3])assert.ok(gltf.nodes.some(v=>v.name===prefix+'_'+n));
 for(const name of ['23_Finger_Flick_Single_Target_Strike',
   '24_Final_Long_Arm_Launch_Intact_Fist_Breakdown',
   '25_Final_Long_Arm_Launch_Damaged_Fist_Breakdown',
   '26_Final_Long_Arm_Absent_Fist_Collapse',
   'socket_enemy_capture_hold','socket_ally_compartment_seat'])
  assert.ok(gltf.animations.some(v=>v.name===name)||gltf.nodes.some(v=>v.name===name),name);
});
test('original editable Argon Blender file is restored without alteration',()=>{
 const file=readFileSync(assembleSoFistAsset('source'));
 assert.equal(file.length,SO_FIST_V26.source.bytes);
 assert.equal(createHash('sha256').update(file).digest('hex'),SO_FIST_V26.source.sha256);
 assert.equal(file.toString('ascii',0,7),'BLENDER');
});
test('HELLping Hand opens, takes one target and performs a lethal 4s crush after grasp closure',()=>{
 const s=game(),foe=s.room.addPlayer({id:'foe',token:'foe',name:'Foe'},0);
 foe.position={x:0,y:0,z:-.885*SO_FIST_SCALE};foe.spawnProtectionUntil=0;
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,0),null);
 assert.equal(s.b.hellping.phase,'open');
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,.12),null);
 assert.equal(s.b.hellping.phase,'grasp');
 assert.equal(s.b.hellping.targetId,foe.id);
 assert.equal(foe.hellpingCapturedBy,s.b.id);
 assert.equal(fireSoFistication(s.room,s.b,.2),false);
 tick(s,.12,5.2);
 assert.equal(foe.alive,false,'uninterrupted full capture completes the crush');
 assert.equal(s.b.hellping?.phase,'release');
 assert.equal(foe.hellpingCapturedBy,undefined);
 assert.ok(s.room.events.some(v=>v.type==='soFistHellping'&&v.action==='captured'));
});
test('destroyed armored fist interrupts crush without restoring component HP',()=>{
 const s=game(),foe=s.room.addPlayer({id:'foe',token:'foe',name:'Foe'},0);
 foe.position={x:0,y:0,z:-.885*SO_FIST_SCALE};foe.spawnProtectionUntil=0;
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,0),null);
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,.1),null);
 s.b.components.Fist.health=1;
 assert.equal(damageSoFistication(s.room,s.b,5000,'enemy','sword',.2,
   {componentId:'Fist'}),true);
 assert.equal(s.b.components.Fist.health,0);
 assert.equal(foe.hellpingCapturedBy,undefined);
 assert.equal(s.b.hellping.phase,'release');
});
test('allied compartment requires voluntary board and allows attack, exit and transport',()=>{
 const s=game(),ally=s.room.addPlayer({id:'ally',token:'ally',name:'Ally'},0);
 // Team assignments remain authoritative; no uninvited boarding.
 s.op.team='A';ally.team='A';s.b.team='A';
 ally.position={x:0,y:0,z:-.715*SO_FIST_SCALE};
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,0),null);
 assert.equal(s.b.hellping.phase,'open');
 assert.equal(boardHellpingHand(s.room,s.b,ally,.2),true);
 assert.equal(s.b.hellping.phase,'transport');
 assert.equal(ally.hellpingCarriedBy,s.b.id);
 assert.equal(fireSoFistication(s.room,s.b,.3),true);
 tick(s,.3,.4);
 assert.ok(Number.isFinite(ally.position.z));
 assert.equal(exitHellpingHand(s.room,s.b,ally,.5),true);
 assert.equal(ally.hellpingCarriedBy,undefined);
 assert.equal(s.b.hellping.phase,'open');
});
test('vault travels in a bounded arc, lands on supported terrain, and recovers',()=>{
 const s=game();
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,0),null);
 s.op.input={forward:1,right:0,sprint:false};
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,.2),null);
 assert.equal(s.b.hellping.phase,'vault');
 tick(s,.2,3.22);
 assert.ok(s.b.z<-2.0,'forward hand plant moved the ram');
 assert.ok(Math.abs(s.b.y)<.15,'landed on real floor');
 assert.equal(s.b.hellping.phase,'release');
});
test('Beat to the Punch still primes with a lost glove if the drive survives',()=>{
 const s=game('beatToThePunch');
 s.b.components.Fist.health=0;s.b.fistMounted=false;
 assert.equal(primeSoFistSkill(s.room,s.b,s.op,1),null);
 assert.equal(s.b.skill.phase,'primed');
 s.b.components.Drive.health=0;
 assert.match(primeSoFistSkill(s.room,s.b,s.op,2),/drive/i);
});
test('final death shot shares COM with attached fist, picks ballistic target and bypasses cooldown',()=>{
 const s=game('longArmToTheJaw');
 const foe=s.room.addPlayer({id:'foe',token:'foe',name:'Foe'},0);
 foe.position={x:0,y:0,z:-22};foe.spawnProtectionUntil=0;
 s.b.skill.readyAt=999;
 const muzzle=soFistUpperPoint(soFistFrame(s.b),s.b,
   [0,.380*SO_FIST_SCALE,.735*SO_FIST_SCALE]);
 assert.equal(damageSoFistication(s.room,s.b,20000,'enemy','ram',1,
   {componentId:'hull'}),true);
 assert.equal(s.b.finalJaw?.variant,'intact');
 assert.equal(s.b.finalJaw?.targetId,foe.id);
 stepSoFistication(s.room,s.b,1/30,1.45,s.room.world);
 assert.ok(s.b.detachedFist?.isFinal);
 for(const [n,k] of ['x','y','z'].entries())
  assert.ok(Math.abs(s.b.detachedFist.position[k]-muzzle[n])<.001,k);
});
