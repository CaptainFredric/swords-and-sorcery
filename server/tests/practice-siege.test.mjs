import test from 'node:test';import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {createBiByeLlista,mountBiByeLlista,stepBiByeLlista,damageBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {resetPracticePlayer} from '../../shared/sim/practice.mjs';
const world={solids:[],ramps:[],floors:[{id:'ground',center:[0,-.1,0],size:[60,.2,60],y:0}],spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
function setup(mode='PRACTICE'){const room=new RoomManager().createSoloRoom(mode,0,'castleward'),p=room.addPlayer({id:'p',token:'p',name:'P'},0);room.world=structuredClone(world);room.state='PLAYING';p.position={x:0,y:0,z:0};p.yaw=0;return {room,p,command:(type,t=1)=>applyRoomCommand(room,p,{type,x:999,z:999},t)};}
function existing(s){s.room.biByeLlista=createBiByeLlista({id:'old',x:0,z:-6,baseYaw:0});return s.room.biByeLlista;}
test('Practice begins empty; build is validated once ahead of the player with fresh systems',()=>{
 const s=setup();assert.equal(s.room.biByeLlista,null);assert.deepEqual(s.command('practiceBuildBiBye'),{});const b=s.room.biByeLlista;
 assert.ok(b&&b.z<=-5&&b.z>=-7);assert.ok(Math.abs(b.x)<1);assert.equal(b.health,650);assert.equal(b.mainBoltLoaded,true);assert.equal(b.coupling,'INDEPENDENT');assert.equal(b.weaponFocus,'UPPER');assert.equal(b.speed,0);assert.ok(b.smallBoltReadyAt<=1);
 assert.ok(s.command('practiceBuildBiBye').rejected);assert.equal(s.room.biByeLlista,b);assert.equal(s.room.events.filter(e=>e.type==='bibyeConstructed').length,1);
});
test('invalid terrain, foreign player and multiplayer construction leave state untouched',()=>{
 const s=setup();s.room.biByeLlista=null;s.room.world.floors=[];assert.ok(s.command('practiceBuildBiBye').rejected);assert.equal(s.room.biByeLlista,null);
 s.room.world=structuredClone(world);assert.ok(applyRoomCommand(s.room,{...s.p},{type:'practiceBuildBiBye'},1).rejected);
 const duel=setup('BOT_DUEL');assert.ok(duel.command('practiceBuildBiBye').rejected);assert.equal(duel.room.biByeLlista,null);
});
test('rebuild replaces one instance atomically and preserves unrelated Practice activity',()=>{
 const s=setup(),old=existing(s);old.health=15;old.components.Wheel_FL.health=0;s.p.health=37;s.p.spell='frostfire';s.p.prowess=80;
 s.room.projectiles.set('ordinary',{id:'ordinary'});s.room.bibyeProjectiles.set('old-bolt',{ballistaId:old.id});
 assert.deepEqual(s.command('practiceRebuildBiBye',3),{});const b=s.room.biByeLlista;
 assert.notEqual(b.id,old.id);assert.equal(b.x,old.x);assert.equal(b.z,old.z);assert.equal(b.health,650);assert.equal(b.components.Wheel_FL.health,120);assert.equal(s.p.health,37);assert.equal(s.p.spell,'frostfire');assert.equal(s.p.prowess,80);assert.ok(s.room.projectiles.has('ordinary'));assert.equal(s.room.bibyeProjectiles.size,0);
});
test('dismantling after Shot I cancels administrative pending release and restores safe personal control',()=>{
 const s=setup(),old=existing(s);s.p.position={x:0,y:0,z:-4};mountBiByeLlista(old,s.p,1);Object.assign(old,{mode:'DEPLOYED',coupling:'FIRING',state:'FIRING',firedAt:1,firingOperatorId:s.p.id,upperReleasedAt:1.45,mainReleasedAt:null,mainBoltLoaded:true});
 s.room.bibyeProjectiles.set('old',{ballistaId:old.id});s.room.bibyeProjectiles.set('foreign',{ballistaId:'other'});
 assert.deepEqual(s.command('practiceDismantleBiBye',1.5),{});assert.equal(s.room.biByeLlista,null);assert.equal(s.p.operatingBallistaId,null);assert.equal(old.operatorId,null);assert.ok(s.p.position.z>-4);assert.ok(s.room.bibyeProjectiles.has('foreign'));assert.equal(s.room.bibyeProjectiles.has('old'),false);
 stepBiByeLlista(s.room,old,1/30,2);assert.equal(s.room.bibyeProjectiles.size,1,'retired object cannot generate a delayed heavy bolt');
 assert.ok(s.room.events.some(e=>e.type==='bibyeDismantled'&&e.ballistaId==='old'));
});
test('occupied vehicle administration rejects another human and rejects unsafe dismount atomically',()=>{
 const s=setup(),old=existing(s),other=s.room.addPlayer({id:'other',token:'o',name:'Other'},0);s.p.position={x:0,y:0,z:-4};mountBiByeLlista(old,s.p);
 assert.ok(applyRoomCommand(s.room,other,{type:'practiceDismantleBiBye'},1).rejected);assert.equal(old.operatorId,s.p.id);
 s.room.world.floors=[{id:'island',center:[0,-.1,-6],size:[4,.2,5],y:0}];const before=structuredClone(old),position={...s.p.position};
 assert.ok(s.command('practiceDismantleBiBye').rejected);assert.deepEqual(old,before);assert.deepEqual(s.p.position,position);
 assert.ok(s.command('practiceRebuildBiBye').rejected);assert.equal(s.room.biByeLlista,old);
});
test('blocked rebuild preserves the old wreck and no hidden colliders survive dismantling',()=>{
 const s=setup(),old=existing(s);damageBiByeLlista(s.room,old,650,'enemy','sword',1);s.room.world.floors=[];
 assert.ok(s.command('practiceRebuildBiBye').rejected);assert.equal(s.room.biByeLlista,old);assert.equal(old.mode,'DESTROYED');
 assert.deepEqual(s.command('practiceDismantleBiBye'),{});assert.equal(serializeSnapshot(s.room,2).bibyeBallista,null);
});
test('Reset Self leaves machine health, ammunition, location and reload clock alone',()=>{
 const s=setup(),b=existing(s);b.health=112;b.components.Stabilizer_FL.health=0;b.mainBoltLoaded=false;b.reloadEndsAt=22;b.smallBoltReadyAt=14;s.p.position={x:0,y:0,z:-4};mountBiByeLlista(b,s.p);
 assert.ok(resetPracticePlayer(s.room,s.p.id,3));assert.equal(s.room.biByeLlista,b);assert.equal(b.health,112);assert.equal(b.components.Stabilizer_FL.health,0);assert.equal(b.mainBoltLoaded,false);assert.equal(b.reloadEndsAt,22);assert.equal(b.smallBoltReadyAt,14);assert.equal(b.z,-6);assert.equal(b.operatorId,null);assert.equal(s.p.operatingBallistaId,null);assert.equal(s.p.health,100);assert.equal(s.p.position.z,0);
});
