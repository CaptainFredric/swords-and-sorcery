import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {applyDamage,beginAttack,stepRoom} from '../../shared/sim/combat.mjs';
import {trackCircleChase} from '../../shared/sim/killfeedCaptureContext.mjs';

const world={
 floors:[{id:'ground',center:[0,-.1,0],size:[50,.2,50],y:0}],
 ramps:[],solids:[],
 spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2},{x:2,y:0,z:0,yaw:Math.PI/2}],
 abyssY:-9,
};
function battle(){
 const room=new Room('FEED');
 room.addPlayer({id:'a',token:'ta',name:'Attacker'},0);
 room.addPlayer({id:'b',token:'tb',name:'Victim'},0);
 room.state='PLAYING';
 const a=room.players.get('a'),b=room.players.get('b');
 Object.assign(a.position,{x:0,y:0,z:0});
 Object.assign(b.position,{x:2,y:0,z:0});
 a.yaw=-Math.PI/2;a.input.yaw=a.yaw;
 b.yaw=Math.PI/2;b.input.yaw=b.yaw;
 a.spawnProtectionUntil=0;b.spawnProtectionUntil=0;
 room.events.length=0;
 return {room,a,b};
}
const lastDeath=room=>room.events.filter(event=>event.type==='death').at(-1);
test('extreme overkill is the EXCESS after the killing blow, not its total damage',()=>{
 const s=battle();
 assert.equal(applyDamage(s.room,'a','b',190,'fireball',10),true);
 assert.equal(lastDeath(s.room).extremeOverkill,undefined,
   '190 against 100 HP leaves only 90 excess');
 const another=battle();another.b.health=50;
 applyDamage(another.room,'a','b',150,'fireball',10);
 assert.equal(lastDeath(another.room).extremeOverkill,true,
   '150 against 50 HP leaves 100 excess');
});
test('consecutive deaths are per victim and credited killer, reset on a new killer',()=>{
 const {room,b}=battle();
 const third=room.addPlayer({id:'c',token:'tc',name:'Other'},0);
 third.spawnProtectionUntil=0;
 for(let i=1;i<=3;i++){
   b.alive=true;b.health=100;b.spawnProtectionUntil=0;
   applyDamage(room,'a','b',110,'fireball',10+i);
   assert.equal(lastDeath(room).sameKillerDeaths,i);
 }
 b.alive=true;b.health=100;b.spawnProtectionUntil=0;
 applyDamage(room,'c','b',110,'fireball',20);
 assert.equal(lastDeath(room).sameKillerDeaths,1);
});
test('the pelt is only earned by multiple repeater impacts from the same burst',()=>{
 const {room,b}=battle();
 for(let i=0;i<2;i++)applyDamage(room,'a','b',5,'fight-flight-repeater',10+i*.1);
 applyDamage(room,'a','b',200,'fight-flight-repeater',10.3);
 assert.equal(lastDeath(room).pelted,true);
 const fresh=battle();
 applyDamage(fresh.room,'a','b',200,'fight-flight-repeater',10);
 assert.equal(lastDeath(fresh.room).pelted,undefined);
});
test('actual sword guard counterfactual respects facing and available stamina',()=>{
 for(const [description,facing,stamina,save] of [
   ['front, stamina',Math.PI/2,100,true],
   ['back to sword',-Math.PI/2,100,false],
   ['empty guard',Math.PI/2,0,false],
 ]){
   const {room,b}=battle();
   b.yaw=facing;b.input.yaw=facing;b.guardStamina=stamina;b.health=15;
   b.lastGuardDrainAt=10.4; // Prevent regen between setup and the actual sword contact.
   beginAttack(room,'a',10);
   stepRoom(room,.01,10.3,world);stepRoom(room,.01,10.4,world);
   const death=lastDeath(room);
   assert.ok(death,description+' was hit by a real sword');
   assert.equal(Boolean(death.guardWouldSave),save,description);
 }
});
test('interrupted melee death is marked as Shocking Conduct, not sword damage',()=>{
 const {room,a,b}=battle();
 b.health=10;b.electricalBacklash={at:10,initial:80,sourceId:'a'};
 beginAttack(room,'b',10);
 stepRoom(room,.01,10.3,world);stepRoom(room,.01,10.4,world);
 const death=lastDeath(room);
 assert.ok(death,'backlash should have killed the swinging knight');
 assert.equal(death.victimId,'b');
 assert.equal(death.killerId,a.id);
 assert.equal(death.source,'electrical_backlash');
 assert.equal(death.killContext,'shocking-conduct-interrupted');
 assert.equal(room.events.some(event=>event.type==='swordHit'&&event.playerId==='b'),false);
});

test('multi-attacker epitaph names only players who actually dealt HP damage',()=>{
 const {room,b}=battle();
 const c=room.addPlayer({id:'c',token:'tc',name:'Wingmate'},0);
 c.spawnProtectionUntil=0;
 applyDamage(room,'a','b',10,'sword',10);
 applyDamage(room,'c','b',100,'sword',10.4);
 const death=lastDeath(room);
 assert.deepEqual(death.damageContributors,['a','c']);
 const only=battle();
 applyDamage(only.room,'a','b',200,'sword',10);
 assert.equal(lastDeath(only.room).damageContributors,undefined);
});
test('leaving a live capture circle toward a low-health enemy can authorize the joke, returning cancels it',()=>{
 const {room,a,b}=battle();
 room.mode='HIGH_GROUNDS';
 a.team='ATTACKERS';b.team='DEFENDERS';
 const site={id:'outer-point',position:{x:0,y:0,z:0},radius:1.2};
 a.position={x:0,y:0,z:0};
 b.position={x:2.4,y:0,z:0};b.health=20;
 trackCircleChase(room,a,site,10);
 a.position={x:1.6,y:0,z:0};a.velocity={x:3,y:0,z:0};
 trackCircleChase(room,a,site,10.1);
 assert.equal(a.killfeedCircleChase?.enemyId,'b');
 applyDamage(room,'b','a',200,'sword',10.2);
 assert.equal(lastDeath(room).abandonedCaptureCircle,true);
 const returned=battle();
 returned.room.mode='HIGH_GROUNDS';
 returned.a.team='ATTACKERS';returned.b.team='DEFENDERS';
 returned.b.health=20;returned.b.position={x:2.4,y:0,z:0};
 trackCircleChase(returned.room,returned.a,site,10);
 returned.a.position={x:1.6,y:0,z:0};returned.a.velocity={x:3,y:0,z:0};
 trackCircleChase(returned.room,returned.a,site,10.1);
 returned.a.position={x:0,y:0,z:0};
 trackCircleChase(returned.room,returned.a,site,10.12);
 assert.equal(returned.a.killfeedCircleChase,null);
 applyDamage(returned.room,'b','a',200,'sword',10.2);
 assert.equal(lastDeath(returned.room).abandonedCaptureCircle,undefined);
});
