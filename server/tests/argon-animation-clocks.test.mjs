import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight} from '../../shared/sim/fightFlight.mjs';
import {requestFlightDash,stepFlightRun} from '../../shared/sim/fightFlightRun.mjs';
import {damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';
import {createSoFistication} from '../../shared/sim/soFistication.mjs';
import {beginSiegeWreck,stepSiegeWreck} from '../../shared/sim/siegeWreck.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
function setup(){const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.state='PLAYING';room.world={floors:[{y:0,center:[0,0,0],size:[200,.2,200]}],solids:[],ramps:[]};const p=room.addPlayer({id:'p',token:'p',name:'Pilot'},0);p.position={x:0,y:0,z:1};p.ultimate='sunder';p.prowess=100;room.fightFlight=createFightFlight();assert.ok(mountFightFlight(room,room.fightFlight,p,0));return{room,p,m:room.fightFlight};}
test('replicated Dash clock survives resource cycles and records release',()=>{
 const {room,p,m}=setup();m.grounded=false;m.flightCharge=100;requestFlightDash(room,m,p,true,1);
 for(let i=1;i<400;i++)stepFlightRun(room,m,1/30,1+i/30);
 const start=m.runAnimationStartedAt;assert.equal(start,1+1/30);assert.ok(m.offensiveRun);
 // This unit isolates the presentation clock; locomotion supplies actual travel.
 m.runTravel=12;requestFlightDash(room,m,p,false,15);assert.equal(m.runAnimationEndedAt,15);assert.equal(m.runAnimationStartedAt,start);
 assert.equal(serializeSnapshot(room,15).fightFlight.runAnimationEndedAt,15);
});
test('broken brace timestamp latches and repair cannot revive it',()=>{
 const {room,m}=setup();damageFightFlight(room,m,10000,null,'sword',2,{componentId:'braceL'});
 assert.equal(m.braceLHP,0);assert.equal(m.componentFailedAt.braceL,2);
 damageFightFlight(room,m,10000,null,'sword',3,{componentId:'braceL'});assert.equal(m.componentFailedAt.braceL,2);
 assert.equal(serializeSnapshot(room,3).fightFlight.componentFailedAt.braceL,2);
});
test('actual support impact supplies a stable animation timestamp',()=>{
 const {room,m}=setup();Object.assign(m,{y:6,grounded:false,velocity:{x:0,y:0,z:0}});
 damageFightFlight(room,m,10000,null,'sword',2,{componentId:'main'});
 assert.equal(m.wreckImpactAt,null);
 for(let i=1;i<=45;i++)stepSiegeWreck(room,m,2+i/30);
 assert.ok(m.wreckImpactAt>2);assert.equal(m.wreckWasAirborne,true);const at=m.wreckImpactAt;
 stepSiegeWreck(room,m,4);assert.equal(m.wreckImpactAt,at);assert.equal(serializeSnapshot(room,4).fightFlight.wreckImpactAt,at);
});
test('ram selects directional breakdown and preserves prior fist destruction',()=>{
 const {room}=setup();const m=createSoFistication({heading:0});m.components.Fist.health=0;
 beginSiegeWreck(room,m,'so-fist-ication',4,{point:{x:-1,y:1,z:0}});assert.equal(m.wreckSide,-1);assert.equal(m.wreckFistMissing,true);assert.equal(m.wreckImpactAt,4);
});
test('airborne structural failure clears the live rider before the wreck acquires the rig',()=>{
 const {room,p,m}=setup();Object.assign(m,{y:6,grounded:false,mode:'AIRBORNE',velocity:{x:3,y:-2,z:-5}});
 p.position={x:0,y:6,z:0};
 damageFightFlight(room,m,10000,null,'sword',2,{componentId:'main'});
 assert.equal(m.operatorId,null);assert.equal(p.operatingFightFlightId,null);
 assert.ok(Math.hypot(p.position.x-m.x,p.position.z-m.z)>2,'rider must clear the physical wreck');
 assert.equal(p.grounded,false);assert.ok(p.position.y>=6,'no teleport to the arena floor');
 assert.ok(p.velocity.z< -3,'ejection retains physical momentum');
 assert.equal(p.ejectionFallExempt,false,'forced collapse retains ordinary fall damage');
 assert.equal(p.health,65,'normal collapse combat damage is preserved');
});
