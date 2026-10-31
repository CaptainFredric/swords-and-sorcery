import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {createFightFlight,mountFightFlight,dismountFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {requestFlightDash,stepFlightRun,VALKYRIE_RUN} from '../../shared/sim/fightFlightRun.mjs';
import {rotorBladeContact} from '../../shared/sim/fightFlightRotor.mjs';

function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';
 room.world={floors:[{id:'f',y:0,center:[0,0,0],size:[100,1,100]}],ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}]};
 const p=room.addPlayer({id:'valkyrie',token:'valkyrie',name:'Pilot'},0);p.position={x:0,y:0,z:1};
 const m=createFightFlight({id:'test-rotor'});
 room.fightFlight=m;assert.equal(mountFightFlight(room,m,p,0),true);
 m.grounded=false;m.mode='AIRBORNE';m.y=8;m.position.y=8;p.position.y=8;
 m.rotorAngularVelocity=Math.PI*15;
 return {room,m,p};
}
test('Held Dash spends operator prowess over ~2.4s and actually accelerates forward, not a timer-only effect',()=>{
 const {room,m,p}=setup();p.prowess=100;p.ultimate='sunder';
 assert.deepEqual(applyRoomCommand(room,p,{type:'flightDash',down:true},1),{});
 let firstSpeed=0;for(let i=1;i<=20;i++){const now=1+i/30;stepFlightRun(room,m,1/30,now);stepFightFlight(room,m,1/30,now);}
 firstSpeed=-m.velocity.z;
 assert.ok(m.offensiveRun,'real offensive mode is entered');
 assert.ok(firstSpeed>9,'increases physical forward movement beyond normal flight speed');
 assert.ok(m.runPitch>.1,'physical rotor pitches ahead');
 assert.ok(p.prowess<75&&p.prowess>60,'spends PERSONAL Ultimate at intended rate');
 assert.equal(m.flightCharge<100,true);
 assert.equal(m.terminalDiveSpent,false);
 for(let i=21;i<=100;i++){let now=1+i/30;stepFlightRun(room,m,1/30,now);stepFightFlight(room,m,1/30,now);}
 assert.equal(p.prowess,0);assert.equal(m.offensiveRun,false);
 assert.equal(m.terminalDiveSpent,false);
});
test('Releasing Dash immediately ends offensive run, momentum decays naturally, energy stops draining',()=>{
 const {room,m,p}=setup();p.prowess=100;p.ultimate='sunder';
 assert.equal(requestFlightDash(room,m,p,true,1),true);
 for(let i=1;i<=15;i++){let now=1+i/30;stepFlightRun(room,m,1/30,now);stepFightFlight(room,m,1/30,now);}
 const spent=p.prowess,speed=Math.hypot(m.velocity.x,m.velocity.z);
 assert.equal(requestFlightDash(room,m,p,false,1.5),true);
 stepFlightRun(room,m,1/30,1.53);stepFightFlight(room,m,1/30,1.53);
 assert.equal(m.offensiveRun,false);assert.equal(p.prowess,spent);
 assert.ok(Math.hypot(m.velocity.x,m.velocity.z)>0,'release does not zero accumulated real momentum');
 assert.ok(Math.hypot(m.velocity.x,m.velocity.z)<=speed+.1);
});
test('Ready unspent Chivalry gets chord grace before run drains a meter',()=>{
 const {room,m,p}=setup();p.prowess=100;p.ultimate='chivalry';
 requestFlightDash(room,m,p,true,1);
 stepFlightRun(room,m,1/30,1.04);
 assert.equal(m.offensiveRun,false);assert.equal(p.prowess,100,'meter reserved during chord opportunity');
 stepFlightRun(room,m,1/30,1.2);
 assert.equal(m.offensiveRun,false,'human-scale chord input timing preserves an unspent ready Ultimate');
 stepFlightRun(room,m,1/30,1.34);
 assert.equal(m.offensiveRun,true);
 assert.ok(p.prowess<100);
 assert.equal(m.terminalDiveSpent,false,'Dash by itself never sacrifices apparatus');
});
test('Already ACTIVE Chivalry retains an ordinary midair dash without extra Ultimate expense',()=>{
 const {room,m,p}=setup();p.ultimate='chivalry';p.prowess=62;
 p.ultimateState={id:'chivalry',phase:'active',until:8};
 const pre=p.prowess;
 assert.equal(requestFlightDash(room,m,p,true,1),true);
 assert.ok(m.velocity.z<-3,'midair dash accelerates the physical machine');
 for(let i=1;i<=10;i++)stepFlightRun(room,m,1/30,1+i/30);
 assert.equal(m.offensiveRun,false);assert.equal(p.prowess,pre);
 assert.equal(m.terminalDiveSpent,false);
});
test('Unauthorized flight Dash and dismount cannot leave a latched attacking vehicle',()=>{
 const {room,m,p}=setup();p.prowess=100;
 const foreign=room.addPlayer({id:'stranger',token:'other',name:'Other'},0);
 assert.ok(applyRoomCommand(room,foreign,{type:'flightDash',down:true},1).rejected);
 assert.equal(m.offensiveRun,false);
 requestFlightDash(room,m,p,true,1);
 assert.equal(dismountFightFlight(room,m,p,{force:true,at:1.2}),true);
 stepFlightRun(room,m,1/30,1.3);
 assert.equal(m.offensiveRun,false);assert.equal(m.flightDashHeld,false);
});
test('Physically pitched rotor crossing shifts forward and down with the machine',()=>{
 const m=createFightFlight({heading:0});
 const victim={x:0,y:0.6,z:-1.2,height:1.8,radius:.4};
 const baseline=rotorBladeContact(m,victim,-Math.PI/2,0);
 const tilted={...m,z:m.z-.55,y:m.y-.1,runPitch:.34};
 const advanced=rotorBladeContact(tilted,victim,-Math.PI/2,0);
 assert.ok(advanced?.contact?.y<baseline?.contact?.y,'leading blade actually descends during offensive pitch');
 assert.equal(typeof VALKYRIE_RUN.drainPerSec,'number');
});
