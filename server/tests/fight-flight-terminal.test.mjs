import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,stepFightFlight} from '../../shared/sim/fightFlight.mjs';
import {requestFlightDash,stepFlightRun} from '../../shared/sim/fightFlightRun.mjs';
import {setFlightUltimateHold,stepTerminalPreparation,advanceTerminalFlight,
  resolveTerminalFlight,stepFlightBurnZones,TERMINAL} from '../../shared/sim/fightFlightTerminal.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';
import {killPlayer} from '../../shared/sim/combat.mjs';
import {damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';

function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.world={solids:[],ramps:[],floors:[{id:'level',y:0,center:[0,-.1,0],size:[200,.2,200]}],
   spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-50};
 room.state='PLAYING';
 const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 p.alive=true;p.prowess=100;p.ultimate='chivalry';p.ultimateState=null;p.spawnProtectionUntil=0;
 const m=createFightFlight({x:0,y:8,z:0,heading:0,id:'valkyrie-original'});
 m.operatorId=p.id;m.grounded=false;m.mode='AIRBORNE';m.velocity={x:0,y:0,z:-4};
 p.operatingFightFlightId=m.id;p.position={x:0,y:8,z:0};p.input={yaw:0,pitch:0,jump:false,crouch:false,forward:0,right:0};
 room.fightFlight=m;
 const cmd=(type,down,t)=>applyRoomCommand(room,p,{type,down},t);
 return {room,p,m,cmd};
}
function commit(s){
 assert.deepEqual(s.cmd('flightDash',true,1),{});
 assert.deepEqual(s.cmd('flightUltimateHold',true,1.04),{});
 stepTerminalPreparation(s.room,s.m,1.04);
 assert.ok(s.m.terminalPrep);
 stepTerminalPreparation(s.room,s.m,2.08);
 assert.ok(s.m.terminalDive);
}
test('Dash and Ultimate chord takes a real one-second unspent-Chivalry commitment',()=>{
 const s=setup();
 s.cmd('flightDash',true,1);s.cmd('flightUltimateHold',true,1.04);
 stepTerminalPreparation(s.room,s.m,1.04);
 assert.equal(s.p.prowess,100);
 assert.equal(s.m.terminalDiveSpent,false);
 assert.equal(s.m.terminalPrep.phase,'holding');
 stepTerminalPreparation(s.room,s.m,2.02);
 assert.equal(s.m.terminalDive,null,'cannot consume the full meter before the hold reaches one second');
 stepTerminalPreparation(s.room,s.m,2.06);
 assert.equal(s.m.terminalDiveSpent,true);
 assert.equal(s.p.prowess,0);
 assert.equal(s.p.ultimateState,null,'terminal sacrifice is not ordinary active Chivalry');
 assert.equal(s.m.terminalDive.operatorId,s.p.id);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalCommitted').length,1);
 stepTerminalPreparation(s.room,s.m,2.9);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalCommitted').length,1);
});
test('Early release cancels preparation without spending any Ultimate or terminal opportunity',()=>{
 const s=setup();
 s.cmd('flightUltimateHold',true,1);s.cmd('flightDash',true,1.01);
 stepTerminalPreparation(s.room,s.m,1.04);
 assert.ok(s.m.terminalPrep);
 s.cmd('flightUltimateHold',false,1.4);
 stepTerminalPreparation(s.room,s.m,2.2);
 assert.equal(s.m.terminalPrep,null);
 assert.equal(s.m.terminalDive,null);
 assert.equal(s.m.terminalDiveSpent,false);
 assert.equal(s.p.prowess,100);
 assert.ok(s.room.events.some(e=>e.type==='fightFlightTerminalPrep'&&e.action==='cancelled'));
});
test('Ordinary held Dash alone spends prowess but never triggers irreversible terminal dive',()=>{
 const s=setup();s.cmd('flightDash',true,1);
 stepTerminalPreparation(s.room,s.m,1.34);stepFlightRun(s.room,s.m,1/30,1.34);
 assert.ok(s.p.prowess<100);
 assert.equal(s.m.terminalPrep,null);assert.equal(s.m.terminalDive,null);
 s.cmd('flightDash',false,1.38);
 assert.equal(s.m.offensiveRun,false);
});
test('Already active Chivalry cannot spend another Ultimate on a terminal chord',()=>{
 const s=setup();s.p.ultimateState={id:'chivalry',phase:'active',until:8};
 s.cmd('flightDash',true,1);s.cmd('flightUltimateHold',true,1.02);
 stepTerminalPreparation(s.room,s.m,1.02);stepTerminalPreparation(s.room,s.m,3);
 assert.equal(s.m.terminalDiveSpent,false);assert.equal(s.m.terminalDive,null);
});
test('Rider death mid-dive preserves a moving machine, finite bounded respawn, and delayed respawn start',()=>{
 const s=setup();commit(s);
 const deathTime=2.12;
 assert.equal(killPlayer(s.room,s.p.id,null,'sword',deathTime),true);
 assert.equal(s.p.alive,false);
 assert.ok(Number.isFinite(s.p.respawnAt),'deferred respawn has a finite failsafe deadline');
 assert.ok(s.p.respawnAt>=s.m.terminalDive.expiresAt);
 assert.equal(s.m.operatorId,null);
 const z=s.m.z;
 advanceTerminalFlight(s.room,s.m,1/30,2.18);
 stepFightFlight(s.room,s.m,1/30,2.18,s.room.world);
 assert.ok(s.m.z<z,'physical dive continues after pilot death');
 assert.equal(s.m.terminalDive.resolved,false);
 s.m.terminalDive.impactAt=2.25;
 assert.equal(resolveTerminalFlight(s.room,s.m,2.25),true);
 assert.equal(s.m.mode,'DESTROYED');
 assert.ok(s.p.respawnAt>2.25&&s.p.respawnAt<s.m.terminalDive.expiresAt+10);
 assert.equal(s.p.terminalRespawnDeferredFor,null);
 assert.equal(resolveTerminalFlight(s.room,s.m,2.26),false);
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,1);
});
test('Terminal epicenter outweighs edge damage, creates finite burning ground and never credits pilot suicide to prior knockback',()=>{
 const s=setup();commit(s);
 const close=s.room.addPlayer({id:'close',token:'close',name:'Close'},0);
 const edge=s.room.addPlayer({id:'edge',token:'edge',name:'Edge'},0);
 for(const p of [close,edge]){p.alive=true;p.spawnProtectionUntil=0;}
 close.position={x:1,y:0,z:0};edge.position={x:7,y:0,z:0};
 s.m.x=0;s.m.y=0;s.m.z=0;s.m.grounded=true;
 s.m.terminalDive.impactAt=2.15;
 s.p.lastAttackerId=edge.id;s.p.lastKnockbackAt=2.14;
 assert.equal(resolveTerminalFlight(s.room,s.m,2.15),true);
 assert.ok(close.health<edge.health,'damage must fall off outward, not a flat blast');
 assert.equal(edge.kills,0,'intentional terminal self-defeat is not a prior enemy knockback kill');
 assert.equal(s.m.health,0);assert.equal(s.m.terminalDiveSpent,true);
 assert.equal(s.room.flightBurnZones.length,1);
 const zones=s.room.flightBurnZones;assert.equal(zones[0].expiresAt-zones[0].startedAt,TERMINAL.fireDuration);
 const before=close.health;
 stepFlightBurnZones(s.room,2.75);
 assert.ok(close.health<before,'burning ground applies actual ongoing damage');
 stepFlightBurnZones(s.room,10);
 assert.equal(s.room.flightBurnZones.length,0);
});
test('Chord is owned by the actual pilot, and a spent lifecycle cannot be armed again',()=>{
 const s=setup(),foreign=s.room.addPlayer({id:'visitor',token:'visitor',name:'Visitor'},0);
 foreign.prowess=100;foreign.ultimate='chivalry';foreign.alive=true;
 assert.ok(applyRoomCommand(s.room,foreign,{type:'flightUltimateHold',down:true},1).rejected);
 commit(s);
 s.m.terminalDive=null;s.m.mode='AIRBORNE';s.m.grounded=false;s.p.prowess=100;
 s.cmd('flightDash',true,4);s.cmd('flightUltimateHold',true,4);
 stepTerminalPreparation(s.room,s.m,4.05);
 assert.equal(s.m.terminalPrep,null,'the same machine has already spent its one dive');
});


test('Dash released first still cancels the chord; Ultimate release cannot accidentally activate Chivalry',()=>{
 const s=setup();s.cmd('flightDash',true,1);s.cmd('flightUltimateHold',true,1.04);
 stepTerminalPreparation(s.room,s.m,1.04);
 assert.ok(s.m.terminalPrep);
 s.cmd('flightDash',false,1.2);
 stepTerminalPreparation(s.room,s.m,1.23);
 assert.equal(s.m.terminalPrep,null);
 s.cmd('flightUltimateHold',false,1.26);
 assert.equal(s.p.prowess,100);
 assert.equal(s.p.ultimateState,null);
 assert.equal(s.m.terminalDiveSpent,false);
});
test('Holding Ultimate alone and releasing without Dash still performs regular Chivalry, not sacrifice',()=>{
 const s=setup();
 s.cmd('flightUltimateHold',true,1);
 stepTerminalPreparation(s.room,s.m,2.2);
 assert.equal(s.m.terminalPrep,null);
 s.cmd('flightUltimateHold',false,2.25);
 assert.equal(s.m.terminalDiveSpent,false);
 assert.ok(s.p.ultimateState,'an ordinary deliberate Ultimate should not be lost');
});

test('An externally shattered main chassis during commitment resolves exactly one terminal explosion',()=>{
 const s=setup();commit(s);
 s.m.health=4;
 const damage=damageFightFlight(s.room,s.m,12,null,'test-siege-impact',2.11,{componentId:'main',point:{x:s.m.x,y:s.m.y,z:s.m.z}});
 assert.equal(damage.destroyed,true);
 assert.ok(s.m.terminalDive.impactAt!=null);
 assert.notEqual(s.m.mode,'DESTROYED','the terminal outcome still owns detonation and rider resolution');
 advanceTerminalFlight(s.room,s.m,1/30,2.14);
 assert.equal(s.m.health,0,'fatal chassis damage may not be healed to one point');
 assert.equal(resolveTerminalFlight(s.room,s.m,2.14),true);
 assert.equal(s.m.mode,'DESTROYED');
 assert.equal(s.room.events.filter(e=>e.type==='fightFlightTerminalExplosion').length,1);
 assert.equal(resolveTerminalFlight(s.room,s.m,2.15),false);
});
test('Chivalry chord can begin after a human-scale Dash-then-Ultimate stagger without partial meter theft',()=>{
 const s=setup();
 s.cmd('flightDash',true,1);stepFlightRun(s.room,s.m,1/30,1.22);
 assert.equal(s.p.prowess,100);
 s.cmd('flightUltimateHold',true,1.24);
 stepTerminalPreparation(s.room,s.m,1.26);
 assert.ok(s.m.terminalPrep);
 stepFlightRun(s.room,s.m,1/30,1.28);
 assert.equal(s.p.prowess,100);
 stepTerminalPreparation(s.room,s.m,2.27);
 assert.equal(s.m.terminalDiveSpent,true);
});
