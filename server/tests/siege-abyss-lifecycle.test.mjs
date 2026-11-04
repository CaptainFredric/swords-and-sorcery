import test from 'node:test';
import assert from 'node:assert/strict';
import {lostSiegeMachines,siegeAbyssLimit} from '../../shared/sim/siegeAbyss.mjs';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight,mountFightFlight} from '../../shared/sim/fightFlight.mjs';
import {killPlayer} from '../../shared/sim/combat.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
import {practiceFightFlight} from '../../shared/sim/practiceFightFlight.mjs';

const ground={id:'floor',center:[0,-.1,0],size:[70,.2,70],y:0};
function room(){
 const r=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 r.world={floors:[ground],ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-12};
 r.state='PLAYING';r.events=[];
 return r;
}
test('flight that actually passes beneath abyssY is destroyed, removed, rider defeated and Practice can build anew',()=>{
 const r=room(),p=r.addPlayer({id:'pilot',token:'p',name:'pilot'},0);
 p.position={x:0,y:0,z:0};p.spawnProtectionUntil=0;
 const m=createFightFlight({x:0,y:0,z:-5,heading:0,id:'fall-1'});
 r.fightFlight=m;
 assert.equal(mountFightFlight(r,m,p,0),true);
 m.y=-12.1;m.position={x:0,y:m.y,z:-5};p.position={x:0,y:m.y,z:-5};
 const result=lostSiegeMachines(r,3,killPlayer);
 assert.equal(result.length,1);
 assert.equal(result[0].machineId,'fall-1');
 assert.equal(r.fightFlight,null);
 assert.equal(p.alive,false,'pilot uses the normal authoritative abyss death/respawn');
 assert.equal(p.operatingFightFlightId,null);
 assert.equal(m.retired,true);
 assert.ok(r.events.some(e=>e.type==='siegeMachineAbyss'&&e.machineId==='fall-1'));
 assert.ok(r.events.some(e=>e.type==='fightFlightDestroyed'&&e.source==='abyss'));
 assert.equal(serializeSnapshot(r,3).fightFlight,null,'no ghost vehicle in replicated snapshot');
 assert.deepEqual(lostSiegeMachines(r,4,killPlayer),[],'no repeated removal or destruction event');
 // A separate living player in the same Practice match can immediately
 // construct a new machine without seeing the stale 'Rebuild' error.
 const fresh=r.addPlayer({id:'rebuild',token:'q',name:'Rebuilder'},3);
 fresh.position={x:0,y:0,z:0};
 assert.deepEqual(practiceFightFlight(r,fresh,'build',4),{});
 assert.notEqual(r.fightFlight.id,'fall-1');
});
test('alive aircraft over an abyss is not destroyed until it crosses the kill plane',()=>{
 const r=room(),m=createFightFlight({id:'hover',x:500,y:-11.9,z:500});
 r.fightFlight=m;
 assert.equal(siegeAbyssLimit(r.world),-12);
 assert.deepEqual(lostSiegeMachines(r,1,killPlayer),[]);
 assert.equal(r.fightFlight,m);
 m.y=-12;
 assert.deepEqual(lostSiegeMachines(r,2,killPlayer),[]);
 assert.equal(r.fightFlight,m);
});
test('each class cleans up independently and releases its construction slot and revision',()=>{
 const r=room();
 r.fightFlight={id:'f',y:8,mode:'AIRBORNE',health:250};
 r.soFistication={id:'r',x:0,y:-14,z:0,mode:'GROUNDED',health:140};
 r.biByeLlista={id:'b',x:1,y:-15,z:1,mode:'MOBILE',health:600};
 r.bibyeProjectiles.set('old-queued',{ballistaId:'b',pendingRelease:true});
 r.bibyeProjectiles.set('old-fired',{ballistaId:'b',pendingRelease:false});
 const revs=[r.soFistRevision,r.biByeRevision];
 const gone=lostSiegeMachines(r,2,killPlayer);
 assert.deepEqual(gone.map(x=>x.machineId),['r','b']);
 assert.equal(r.fightFlight.id,'f','unrelated aircraft survives');
 assert.equal(r.soFistication,null);
 assert.equal(r.biByeLlista,null);
 assert.equal(r.soFistRevision,revs[0]+1);
 assert.equal(r.biByeRevision,revs[1]+1);
 assert.equal(r.bibyeProjectiles.has('old-queued'),false);
 assert.equal(r.bibyeProjectiles.has('old-fired'),true,'already launched bolt has physical independent flight');
});
test('abyss removes expired machine from High Grounds foundry, but never bypasses cooldown',()=>{
 const r=room();
 r.highGrounds={foundries:[{id:'site',machineId:'f',machine:'fight-and-flight',readyAt:50}]};
 r.fightFlight={id:'f',x:0,y:-13,z:0,health:250};
 assert.equal(lostSiegeMachines(r,5,killPlayer).length,1);
 assert.deepEqual({id:r.highGrounds.foundries[0].machineId,machine:r.highGrounds.foundries[0].machine,ready:r.highGrounds.foundries[0].readyAt},{id:null,machine:null,ready:50});
});
test('terminal Dive lost to abyss does not detonate in midair or defer respawn',()=>{
 const r=room(),p=r.addPlayer({id:'pilot',token:'p',name:'pilot'},0);
 p.position={x:0,y:0,z:0};p.spawnProtectionUntil=0;
 const m=createFightFlight({x:0,y:0,z:0,id:'dive'});
 r.fightFlight=m;assert.equal(mountFightFlight(r,m,p,0),true);
 m.y=-30;m.position={x:0,y:-30,z:0};p.position={x:0,y:-30,z:0};
 m.terminalDive={operatorId:p.id,startedAt:1,expiresAt:6,resolved:false};
 lostSiegeMachines(r,2,killPlayer);
 assert.equal(m.terminalDive.resolved,true);
 assert.equal(p.alive,false);
 assert.ok(p.respawnAt<10,'ordinary abyss respawn is not delayed by unresolved terminal dive');
 assert.equal(r.events.some(e=>e.type==='fightFlightTerminalExplosion'),false);
});
