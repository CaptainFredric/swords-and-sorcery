import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {stepBiByeProjectiles} from '../../shared/sim/biByeLlista.mjs';
import {callSteel} from '../../shared/src/steel.mjs';
function scenario({yaw=Math.PI,guard=false,raised=0,x=0,y=.9,solid=false,ground=false,steel=false,radius=.05,stamina=100}={}){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 const owner=room.addPlayer({id:'owner',token:'o',name:'Operator'},0);
 const target=room.addServerActor({id:'target',name:'Target',actorKind:'dummy'},0);
 room.biByeLlista=null;room.world={solids:solid?[{id:'post',center:[x,y,.9],size:[.1,.2,.1]}]:[],floors:ground?[{center:[0,-.1,0],size:[100,.2,100],y:0}]:[],ramps:[]};owner.position={x:10,y:0,z:10};
 Object.assign(target,{position:{x:0,y:0,z:0},yaw,guarding:guard,guardStartedAt:raised,guardStamina:stamina,spawnProtectionUntil:0,history:[]});if(steel)target.steel=callSteel(0);
 room.bibyeProjectiles=new Map([['bolt',{id:'bolt',ballistaId:'fixture',subKind:'conditioning',ownerId:owner.id,bornAt:.95,position:{x,y,z:2},velocity:ground?{x:0,y:-20,z:-50}:{x:0,y:0,z:-48},radius,directDamage:18,blastRadius:2}]]);
 stepBiByeProjectiles(room,.05,1,room.world);return {room,target,contact:room.events.find(e=>e.type==='bibyeFrostContact')};
}
test('Shot I frontal block chips five health, drains actual Guard stamina and chills lightly',()=>{
 const {target,contact}=scenario({guard:true});assert.equal(target.health,95);assert.equal(target.guardStamina,78);assert.equal(target.chill.slow,.2);assert.equal(contact.outcome,'block');assert.equal(contact.damage,5);
});
test('Shot I uses its own 90 degree frontal arc, with full side and rear damage',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI+Math.PI/3]){const {target,contact}=scenario({guard:true,yaw});assert.equal(target.health,82);assert.equal(target.chill.slow,.4);assert.equal(contact.outcome,'hit');}
 assert.equal(scenario({guard:true,yaw:Math.PI+Math.PI/5}).target.health,95);
});
test('a timed direct physical Guard contact excludes only that defender from the frost blast',()=>{
 const {target,contact,room}=scenario({guard:true,raised:.9});assert.equal(target.health,100);assert.equal(target.guardStamina,100);assert.equal(target.chill,null);assert.equal(contact.outcome,'parry');assert.equal(contact.direct,true);assert.equal(room.events.filter(e=>e.type==='bibyeFrostBlast').length,1);
});
test('timing alone cannot parry a direct low bolt outside the frontal torso region',()=>{
 const {target,contact}=scenario({guard:true,raised:.9,y:.12});assert.equal(target.health,95);assert.equal(contact.outcome,'block');
});
test('an indirect frontal explosion can be blocked but never parried, and rear splash bypasses Guard',()=>{
 const a=scenario({guard:true,raised:.9,ground:true,x:.7,y:.6,yaw:Math.atan2(-.7,-.5)});assert.equal(a.contact.direct,false);assert.equal(a.contact.outcome,'block');assert.ok(a.target.health<100&&a.target.health>95);assert.ok(a.target.guardStamina<100&&a.target.guardStamina>78);
 const b=scenario({guard:true,raised:.9,ground:true,x:.7,y:.6,yaw:0});assert.equal(b.contact.outcome,'hit');assert.ok(b.target.health<a.target.health);
});
test('spent Guard breaks through the established action interruption window',()=>{
 const {target,contact,room}=scenario({guard:true,stamina:10});assert.equal(target.guardStamina,0);assert.equal(target.guarding,false);assert.equal(contact.outcome,'guardBreak');assert.ok(target.staggerUntil>=1.7);assert.equal(room.events.filter(e=>e.type==='guardBreak').length,1);
});
test('Steel still mitigates actual chip and unguarded damage, and protected players remain unaffected',()=>{
 assert.equal(scenario({steel:true}).target.health,88);const blocked=scenario({guard:true,steel:true});assert.ok(blocked.target.health>=95&&blocked.target.health<100);
 const {room,target}=scenario();target.health=100;target.chill=null;target.spawnProtectionUntil=5;room.events=[];room.bibyeProjectiles.set('b2',{id:'b2',ballistaId:'fixture',subKind:'conditioning',ownerId:'owner',bornAt:.95,position:{x:0,y:.9,z:2},velocity:{x:0,y:0,z:-48},radius:.05,directDamage:18,blastRadius:2});stepBiByeProjectiles(room,.05,1,room.world);assert.equal(target.health,100);assert.equal(target.chill,null);assert.ok(!room.events.some(e=>e.type==='bibyeFrostContact'));
});

test('a direct parry protects its defender while another exposed enemy receives the blast',()=>{
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.world={solids:[],floors:[],ramps:[]};room.biByeLlista=null;
 room.addPlayer({id:'owner',token:'o',name:'Operator'},0).position={x:8,y:0,z:8};
 for(const [id,x] of [['parrier',0],['nearby',1]]){const p=room.addServerActor({id,name:id,actorKind:'dummy'},0);Object.assign(p,{position:{x,y:0,z:0},yaw:Math.PI,spawnProtectionUntil:0,guarding:id==='parrier',guardStartedAt:.9,history:[]});}
 room.bibyeProjectiles=new Map([['bolt',{id:'bolt',ballistaId:'fixture',subKind:'conditioning',ownerId:'owner',bornAt:.95,position:{x:0,y:.9,z:2},velocity:{x:0,y:0,z:-48},radius:.05,directDamage:18,blastRadius:2}]]);stepBiByeProjectiles(room,.05,1,room.world);
 assert.equal(room.players.get('parrier').health,100);assert.ok(room.players.get('nearby').health<100);assert.equal(room.events.filter(e=>e.type==='bibyeFrostBlast').length,1);assert.equal(room.events.filter(e=>e.type==='bibyeFrostContact').length,2);
});

test('unguarded conditioning drains the shared Sprint/Guard resource rather than an unused stamina field',()=>{
 const {target}=scenario();assert.equal(target.guardStamina,78);assert.equal(target.lastGuardDrainAt,1);assert.equal(target.sprintStamina,undefined);
});
