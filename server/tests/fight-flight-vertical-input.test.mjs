import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {createFightFlight,mountFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {stepFlightRun} from '../../shared/sim/fightFlightRun.mjs';
import {stepRoom,killPlayer} from '../../shared/sim/combat.mjs';

const DT=1/30;
function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');room.state='PLAYING';
 room.world={floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],ramps:[],solids:[],
   spawnPoints:[{x:0,y:0,z:1,yaw:0}],abyssY:-30};
 const p=room.addPlayer({id:'vertical-pilot',token:'v',name:'Pilot'},0);
 p.position={x:0,y:0,z:1};p.spawnProtectionUntil=0;
 const m=createFightFlight({id:'vertical-machine'});room.fightFlight=m;
 assert.equal(mountFightFlight(room,m,p,0),true);
 return {room,m,p};
}
function send(room,p,now,patch={}){
 const data={type:'input',seq:Math.round(now*1000),yaw:0,pitch:0,forward:0,right:0,jump:false,crouch:false,...patch};
 assert.deepEqual(applyRoomCommand(room,p,data,now),{});
}
function step(room,m,start,frames,patch=null){
 const p=room.players.get(m.operatorId);
 for(let i=1;i<=frames;i++){
   const now=start+i*DT;
   if(p&&patch)send(room,p,now,patch);
   stepFightFlight(room,m,DT,now);
 }
}
test('Explicit mobile Hop is one accepted command, a ballistic apex and real landing; it never starts the rotor',()=>{
 const {room,m,p}=setup();
 assert.deepEqual(applyRoomCommand(room,p,{type:'flightHop'},0),{});
 assert.ok(applyRoomCommand(room,p,{type:'flightHop'},0).rejected,'cannot buffer extra hops');
 let peak=0,ascending=false,falling=false;
 for(let i=1;i<=48;i++){stepFightFlight(room,m,DT,i*DT);
   peak=Math.max(peak,m.y);ascending ||=m.velocity.y>0;falling ||=m.velocity.y<-.1;
   assert.equal(m.rotorPowered,false,'Hop is not Rise');
 }
 assert.ok(ascending&&falling&&peak>.14&&peak<1,'physical hop reaches an apex and falls');
 assert.equal(m.grounded,true);assert.ok(Math.abs(m.y)<.02);
 assert.ok(applyRoomCommand(room,p,{type:'flightHop'},2).rejected===undefined,'another grounded press is legal');
});
test('Held explicit Rise climbs and release targets neutral velocity instead of persistent ascent',()=>{
 const {room,m,p}=setup();
 step(room,m,0,48,{flightRise:true});
 assert.equal(m.grounded,false);assert.ok(m.y>1.0);
 assert.ok(m.rotorPowered&&m.rotorRPM>0&&m.flightCharge<100);
 const charge=m.flightCharge;
 step(room,m,1.6,33,{flightRise:false,flightLower:false});
 assert.equal(m.verticalIntent,'HOVER');assert.ok(Math.abs(m.velocity.y)<.45);
 assert.ok(m.rotorLiftAuthority>.8&&m.rotorPowered);
 assert.ok(m.flightCharge<charge,'ordinary hover still has a physical energy cost');
});
test('Lower responds on its first packet, holding sustains descent and release damps it',()=>{
 const {room,m,p}=setup();
 step(room,m,0,68,{flightRise:true});
 step(room,m,68*DT,15,{flightRise:false});
 const oldY=m.y,oldVy=m.velocity.y,t=83*DT;
 send(room,p,t+DT,{flightLower:true});
 stepFightFlight(room,m,DT,t+DT);
 assert.equal(m.verticalIntent,'LOWER');assert.ok(m.velocity.y<oldVy-.02,'first tick applies downward acceleration');
 step(room,m,t+DT,12,{flightLower:true});
 assert.ok(m.y<oldY-.1,'held Lower translates down');
 step(room,m,t+13*DT,26,{flightLower:false});
 assert.equal(m.verticalIntent,'HOVER');
 assert.ok(Math.abs(m.velocity.y)<.5||m.grounded,'release re-stabilizes if still airborne');
});
test('Low rotor energy, destroyed rotor, or charge loss defeats otherwise perfect hover',()=>{
 const {room,m,p}=setup();step(room,m,0,56,{flightRise:true});
 m.rotorEnergy=0;m.rotorHP=0;
 const y=m.y;step(room,m,56*DT,24,{flightRise:false});
 assert.equal(m.rotorLiftAuthority,0);assert.ok(m.velocity.y<-.5&&m.y<y,'loss of lift must eventually reverse prior climb momentum');
 const other=setup();step(other.room,other.m,0,56,{flightRise:true});
 other.m.flightCharge=0;step(other.room,other.m,56*DT,22,{flightRise:false});
 assert.equal(other.m.rotorLiftAuthority,0);assert.ok(other.m.velocity.y<0,'gravity must reverse existing upward inertia when charge is exhausted');
});
test('Legacy Space short press hops while sustained held Space becomes Rise; no two-tap requirement',()=>{
 const first=setup();step(first.room,first.m,0,2,{jump:true});
 step(first.room,first.m,2*DT,4,{jump:false});
 assert.equal(first.m.rotorPowered,false);
 step(first.room,first.m,6*DT,35,{jump:false});
 assert.ok(first.m.grounded);
 const second=setup();step(second.room,second.m,0,45,{jump:true});
 assert.ok(second.m.rotorPowered&&second.m.y>1);
 step(second.room,second.m,1.5,25,{jump:false});
 assert.equal(second.m.verticalIntent,'HOVER');
 assert.ok(Math.abs(second.m.velocity.y)<.5);
});
test('Stale held Rise after lost focus expires on the authoritative server without client release',()=>{
 const {room,m,p}=setup();
 step(room,m,0,35,{flightRise:true});
 assert.ok(m.y>0&&p.flightInputAt>0);
 const prior=m.y;
 stepFightFlight(room,m,DT,2);
 assert.equal(m.verticalIntent,'HOVER','held Rise has timed out without new packets');
 assert.ok(m.velocity.y<3.7);
 assert.ok(prior>0);
});
test('Unauthorized Hop and airborne Hop are rejected, without resetting machine resources',()=>{
 const {room,m,p}=setup();
 const stranger=room.addPlayer({id:'stranger',token:'x',name:'Other'},0);
 assert.ok(applyRoomCommand(room,stranger,{type:'flightHop'},1).rejected);
 step(room,m,0,35,{flightRise:true});
 const before=[m.ammo,m.ammoDebt,m.flightCharge];
 assert.ok(applyRoomCommand(room,p,{type:'flightHop'},2).rejected);
 assert.deepEqual([m.ammo,m.ammoDebt,m.flightCharge],before);
});
test('Prowess-powered Dash accelerates a rotor-equipped machine and pitches forward without consuming dive',()=>{
 const {room,m,p}=setup();
 step(room,m,0,45,{flightRise:true});p.prowess=100;p.ultimate='sunder';
 assert.deepEqual(applyRoomCommand(room,p,{type:'flightDash',down:true},1.5),{});
 for(let i=1;i<=18;i++){const t=1.5+i*DT;stepFlightRun(room,m,DT,t);send(room,p,t,{flightRise:false});stepFightFlight(room,m,DT,t);}
 assert.ok(m.offensiveRun&&m.runPitch>.1&&Math.hypot(m.velocity.x,m.velocity.z)>8);
 assert.ok(p.prowess>0&&p.prowess<100);assert.equal(m.terminalDiveSpent,false);
 assert.deepEqual(applyRoomCommand(room,p,{type:'flightDash',down:false},2.11),{});
 stepFlightRun(room,m,DT,2.12);assert.equal(m.offensiveRun,false);
});
test('Aerial ejection falls and lands; remount preserves machine ammunition, debt, and Skill state',()=>{
 const {room,m,p}=setup();step(room,m,0,65,{flightRise:true});
 const spare=6;m.ammo=spare;m.ammoDebt=3;m.velocity={x:0,y:-1,z:0};
 assert.deepEqual(applyRoomCommand(room,p,{type:'flightEject',down:true},3),{});
 assert.deepEqual(applyRoomCommand(room,p,{type:'flightEject',down:false},3.1),{});
 assert.equal(p.grounded,false);assert.equal(p.ejectionFallExempt,true);
 assert.equal(m.operatorId,null);assert.equal(p.operatingFightFlightId,null);
 assert.equal(m.ammo,spare);assert.equal(m.ammoDebt,3,'ejection cannot erase machine debt');
 let fell=false;for(let i=1;i<=190;i++){stepRoom(room,DT,3.1+i*DT,room.world);
   if(p.velocity.y<-.5)fell=true;
   if(p.grounded)break;
 }
 assert.ok(fell,'operator actually falls under gravity');
 assert.equal(p.grounded,true);assert.equal(p.ejectionFallExempt,false);
 assert.ok(m.ammo>=spare&&m.ammo<=18&&m.ammoDebt>=0&&m.ammoDebt<=3,'production may pay debt, not reset inventory');
 for(let i=1;i<=110&&!m.grounded;i++)stepRoom(room,DT,10+i*DT,room.world);
 assert.ok(m.grounded,'unpiloted machine must land');
 p.position={x:m.x,y:m.y,z:m.z+1};
 assert.equal(mountFightFlight(room,m,p,15),true,'operator can remount after a genuine safe landing');
});
test('Death does not grant a second mounted life or leave ascent input controlling the machine',()=>{
 const {room,m,p}=setup();step(room,m,0,40,{flightRise:true});
 killPlayer(room,p.id,null,'test',2);
 stepFightFlight(room,m,DT,2+DT);
 assert.equal(m.operatorId,null);assert.equal(p.operatingFightFlightId,null);
 assert.equal(m.hopRequested,false);assert.equal(m.verticalIntent,'IDLE');
 assert.equal(p.flightInputAt,null);
 assert.equal(mountFightFlight(room,m,p,3),false);
});
