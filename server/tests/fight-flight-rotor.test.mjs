import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {rotorBladeContact,stepFightFlightRotor} from '../../shared/sim/fightFlightRotor.mjs';
import {fightFlightFirstHit,damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';
import {callSteel} from '../../shared/src/steel.mjs';
function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.world={solids:[],ramps:[],floors:[{center:[0,-.1,0],size:[50,.2,50],y:0}],spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
 room.state='PLAYING';
 const owner=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 const defender=room.addPlayer({id:'defender',token:'defender',name:'Defender'},0);
 owner.position={x:0,y:0,z:0};owner.spawnProtectionUntil=0;
 defender.position={x:1,y:1,z:0};defender.velocity={x:0,y:0,z:0};defender.spawnProtectionUntil=0;
 defender.health=100;defender.guarding=false;defender.guardStamina=100;
 const m=createFightFlight({x:0,y:0,z:0});m.id='rotor-test';m.operatorId=owner.id;
 owner.operatingFightFlightId=m.id;room.fightFlight=m;
 return {room,m,owner,defender};
}
const crossing=(room,m,now=10)=>{
 m.rotorAngleBefore=-Math.PI/2;m.lastRotorDelta=Math.PI;
 m.rotorAngle=Math.PI/2;m.rotorPositionBefore={x:m.x,y:m.y,z:m.z};
 m.rotorAngularVelocity=47.12388980384689;stepFightFlightRotor(room,m,1/30,now);
};
test('Rotating sword crosses a target between 30Hz endpoints; contact is not an aura',()=>{
 const {room,m,defender}=setup();
 const body={x:1,y:1,z:0,radius:.45,height:1.8};
 assert.equal(rotorBladeContact(m,body,-Math.PI/2,0),null);
 assert.equal(rotorBladeContact(m,body,Math.PI/2,0),null);
 crossing(room,m);
 assert.ok(defender.health<100,'mid-tick blade sweep must deal actual combat damage');
 assert.ok(room.events.some(e=>e.type==='fightFlightRotorContact'&&e.victimId===defender.id&&e.result==='hit'));
 assert.ok(m.rotorEnergy<100,'contact spends actual rotational energy');
});
test('Continuous contact deals once, a later genuine new crossing may hit again',()=>{
 const {room,m,defender}=setup();crossing(room,m,10);
 const first=room.events.filter(e=>e.type==='fightFlightRotorContact').length;
 // Approach the same victim from inside the still-open physical contact interval.
 m.rotorAngleBefore=-.08;m.lastRotorDelta=.08;m.rotorAngle=0;
 stepFightFlightRotor(room,m,1/30,10.1);
 assert.equal(room.events.filter(e=>e.type==='fightFlightRotorContact').length,first);
 // Leave the hit volume completely and re-enter it, no arbitrary time-based immunity.
 m.rotorAngleBefore=0;m.lastRotorDelta=.9;m.rotorAngle=.9;
 stepFightFlightRotor(room,m,1/30,10.2);
 m.rotorAngleBefore=.9;m.lastRotorDelta=-.9;m.rotorAngle=0;
 stepFightFlightRotor(room,m,1/30,10.3);
 assert.ok(room.events.filter(e=>e.type==='fightFlightRotorContact').length>first);
});
test('Real front torso Guard costs stamina and rotor energy but not HP',()=>{
 const {room,m,defender}=setup();
 defender.guarding=true;defender.yaw=Math.PI/2;defender.guardStartedAt=5;
 crossing(room,m);
 assert.equal(defender.health,100);
 assert.ok(defender.guardStamina<100);
 assert.ok(m.rotorEnergy<100);
 assert.ok(room.events.some(e=>e.type==='fightFlightRotorContact'&&e.result==='guard'));
});
test('Timed parry reduces rotor HP only after finite Steel mitigation; spends flight charge',()=>{
 const {room,m,defender}=setup();
 defender.guarding=true;defender.yaw=Math.PI/2;defender.guardStartedAt=9.93;
 m.componentSteel={rotor:callSteel(10)};
 const hp=m.rotorHP,charge=m.flightCharge;
 crossing(room,m);
 assert.equal(defender.health,100);
 assert.ok(m.rotorHP<hp,'proper parry damages rotor component, not total apparatus HP');
 assert.equal(hp-m.rotorHP,1,'8 base rotor damage reduced by finite active Steel to 1 HP');
 assert.ok(m.flightCharge<charge);
 assert.ok(room.events.some(e=>e.type==='fightFlightRotorParried'));
});
test('The authored left brace intercepts a genuine ray; destroying it exposes the side',()=>{
 const {room,m}=setup(),start=[-2,1.28,-.05],end=[0,1.28,-.05];
 const before=fightFlightFirstHit(m,start,end);
 assert.equal(before.componentId,'braceL');
 const result=damageFightFlight(room,m,200,null,'bibye-siege',10,{componentId:'braceL',point:{x:-.4,y:1.28,z:-.05}});
 assert.equal(result.destroyed,true);assert.equal(m.braceLHP,0);assert.equal(m.braceRHP,80);
 const after=fightFlightFirstHit(m,start,end);
 assert.notEqual(after?.componentId,'braceL','destroyed brace no longer shields the operator corridor');
});
test('Rotor destruction leaves machine intact and removes lift; main destruction ends operation',()=>{
 const {room,m,owner}=setup();
 assert.ok(damageFightFlight(room,m,200,null,'bibye-siege',10,{componentId:'rotor'}).destroyed);
 assert.equal(m.rotorHP,0);assert.equal(m.health,250);
 m.grounded=false;m.mode='FALLING';m.y=5;m.position={x:0,y:5,z:0};
 owner.position={x:0,y:5,z:0};
 for(let i=0;i<45;i++)stepFightFlight(room,m,1/30,10+i/30);
 assert.ok(m.grounded&&m.y<=.05,'physical fall lands on real terrain');
 assert.equal(owner.alive,true);
 const wreck=damageFightFlight(room,m,300,null,'bibye-siege',15,{componentId:'main'});
 assert.equal(wreck.destroyed,true);assert.equal(m.mode,'DESTROYED');
 assert.equal(m.operatorId,null);assert.equal(owner.operatingFightFlightId,null);
});
