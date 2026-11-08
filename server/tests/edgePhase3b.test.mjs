import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeHandleMountedOperators } from '../../shared/sim/edgeSiegeDismount.mjs';
import { edgeSafeFootPoint, edgeConstrainActor, EDGE_CONFIG } from '../../shared/sim/edgeOfVictory.mjs';
import { edgeBotGoal } from '../../shared/sim/BotController.mjs';
import { edgeInside, edgeFootprintInside } from '../../shared/src/edgeBoundary.mjs';
import { createSoFistication, soFistOperator, stepSoFistication } from '../../shared/sim/soFistication.mjs';
import { soFistSolids } from '../../shared/sim/soFistGeometry.mjs';
import { createBiByeLlista, getBiByeSolids, getBiByeOperatorTransform, stepBiByeLlista } from '../../shared/sim/biByeLlista.mjs';
import { createFightFlight, fightFlightOperator, fightFlightEdgeVolumes, stepFightFlight } from '../../shared/sim/fightFlight.mjs';

function flatWorld() {
  return { floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],
    ramps:[],solids:[],navigation:{nodes:[]} };
}
function fixture(radius=9) {
  const pilot={id:'pilot',name:'Pilot',actorKind:'human',connected:true,
    alive:true,grounded:true,team:null,health:100,
    position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},
    input:{yaw:0,pitch:0,forward:0,right:0,jump:false,sprint:false},
    operatingRamId:null,operatingBallistaId:null,operatingFightFlightId:null,
    preparedSpells:['fireball','gale','frostfire']};
  const world=flatWorld();
  const room={mode:'EDGE_OF_VICTORY',state:'PLAYING',code:'EDGE3B',world,
    events:[],players:new Map([[pilot.id,pilot]]),
    biByeLlista:null,soFistication:null,fightFlight:null,
    edgeOfVictory:{center:{x:0,z:0},radius,phase:'CONTRACTING',
      startedAt:0,config:EDGE_CONFIG,pickups:[],remaining:['pilot'],eliminated:[]}};
  room.world.edgeBoundary={center:room.edgeOfVictory.center,radius};
  return {room,pilot};
}
const dismounts=room=>room.events.filter(e=>e.type==='edgeVoluntaryDismount');

test('the ram may be deliberately abandoned without destroying or retiring the carriage',()=>{
  const {room,pilot}=fixture(11);
  const ram=createSoFistication({id:'ram-3b',x:0,y:0,z:0,heading:0});
  room.soFistication=ram;
  ram.operatorId=pilot.id;
  pilot.operatingRamId=ram.id;
  pilot.position=soFistOperator(ram);
  ram.edgeBlocked=true;
  edgeHandleMountedOperators(room,4);
  assert.equal(ram.operatorId,null,'existing dismount releases the operator');
  assert.equal(pilot.operatingRamId,null);
  assert.notEqual(ram.retired,true);
  assert.equal(ram.health,1400);
  assert.equal(dismounts(room).length,1);
  assert.ok(edgeInside(pilot.position,room.edgeOfVictory.center,room.edgeOfVictory.radius,.45));
  assert.ok(Math.abs(pilot.position.y)<.1);
});

test('a mobile ballista relinquishes its operator without changing its deployment state',()=>{
  const {room,pilot}=fixture(10);
  const machine=createBiByeLlista({id:'ball-3b',x:0,y:0,z:0,baseYaw:0,heading:0});
  room.biByeLlista=machine;
  machine.operatorId=pilot.id;
  pilot.operatingBallistaId=machine.id;
  pilot.position=getBiByeOperatorTransform(machine).position;
  const originalMode=machine.mode;
  machine.edgeBlocked=true;
  edgeHandleMountedOperators(room,2);
  assert.equal(machine.operatorId,null);
  assert.equal(pilot.operatingBallistaId,null);
  assert.equal(machine.mode,originalMode);
  assert.equal(dismounts(room).length,1);
  assert.ok(edgeInside(pilot.position,room.edgeOfVictory.center,room.edgeOfVictory.radius,.45));
});

test('flight must find a real supported landing before the pilot can leave',()=>{
  const {room,pilot}=fixture(10);
  const m=createFightFlight({id:'flight-3b',x:0,y:4,z:0,heading:0});
  room.fightFlight=m;
  m.operatorId=pilot.id;
  pilot.operatingFightFlightId=m.id;
  m.grounded=false;m.mode='AIRBORNE';
  pilot.position=fightFlightOperator(m);
  m.edgeBlocked=true;
  edgeHandleMountedOperators(room,1);
  assert.equal(m.operatorId,pilot.id,'no airborne free ejection');
  assert.equal(pilot.operatingFightFlightId,m.id);
  assert.equal(m.edgeAutoLand,true);
  // Simulate a controlled physical landing with a valid floor after descent.
  m.y=0;m.grounded=true;m.mode='GROUNDED';pilot.position=fightFlightOperator(m);
  edgeHandleMountedOperators(room,2);
  assert.equal(m.operatorId,null);
  assert.equal(pilot.operatingFightFlightId,null);
  assert.equal(dismounts(room).length,1);
  assert.ok(edgeInside(pilot.position,room.edgeOfVictory.center,room.edgeOfVictory.radius,.45));
});

test('committed Flight to the Valkyrie does not grant a free dismount',()=>{
  const {room,pilot}=fixture(10);
  const m=createFightFlight({id:'valkyrie-3b',x:0,y:4,z:0});
  room.fightFlight=m;
  m.operatorId=pilot.id;
  pilot.operatingFightFlightId=m.id;
  pilot.position=fightFlightOperator(m);
  m.grounded=false;m.mode='TERMINAL';
  m.terminalDive={operatorId:pilot.id,startedAt:0,simulatedSec:1,resolved:false};
  m.edgeBlocked=true;
  edgeHandleMountedOperators(room,1);
  assert.equal(m.operatorId,pilot.id);
  assert.equal(m.terminalDive.resolved,false);
  assert.equal(dismounts(room).length,0);
});

test('occupying the legal centre does not forcibly eject healthy machine operators',()=>{
  const {room,pilot}=fixture(18);
  const ram=createSoFistication({id:'hold-ram',x:0,y:0,z:0});
  room.soFistication=ram;ram.operatorId=pilot.id;
  pilot.operatingRamId=ram.id;pilot.position=soFistOperator(ram);
  assert.ok(edgeFootprintInside(soFistSolids(ram),room.edgeOfVictory.center,18));
  edgeHandleMountedOperators(room,1);
  assert.equal(ram.operatorId,pilot.id);
  assert.equal(dismounts(room).length,0);
});

test('stationary correction is bounded and never deals boundary damage',()=>{
  const {room,pilot}=fixture(7);
  pilot.position={x:8.2,y:0,z:0};
  const health=pilot.health;
  for(let i=0;i<12;i++){
    const old={...pilot.position};
    edgeConstrainActor(room,pilot,old,i/30,room.world);
    assert.ok(Math.hypot(pilot.position.x-old.x,pilot.position.z-old.z)<.4);
    assert.equal(pilot.health,health);
  }
  assert.ok(edgeInside(pilot.position,room.edgeOfVictory.center,7,.45));
});

test('obstacles and cliff edges invalidate unsafe inward corrective steps',()=>{
  const {room,pilot}=fixture(6);
  pilot.position={x:8.2,y:0,z:0};
  room.world.solids=[{id:'inside-wall',center:[8.02,.9,0],size:[.14,1.8,10]}];
  const blocked=edgeSafeFootPoint(room,pilot,pilot.position,room.world,{stepLimit:.38});
  assert.equal(blocked,null,'a nearby collision prevents phasing across the wall');
  room.world.solids=[];
  room.world.floors=[{id:'cliff',center:[9,-.1,0],size:[2,.2,2],y:0}];
  const cliff=edgeSafeFootPoint(room,pilot,pilot.position,room.world,{stepLimit:.38});
  assert.equal(cliff,null,'inward relocation cannot invent support beyond cliff edge');
});

test('an Edge rival seeks the next useful spell or steps inward, never outward',()=>{
  const {room,pilot}=fixture(9);
  const bot={...pilot,id:'bot',actorKind:'bot',name:'Rival',position:{x:7.6,y:0,z:0}};
  const distant={...pilot,id:'enemy',position:{x:-7,y:0,z:0}};
  room.players=new Map([[bot.id,bot],[distant.id,distant]]);
  const inward=edgeBotGoal(room,bot);
  assert.equal(inward?.purpose,'inward');
  assert.ok(Math.hypot(inward.x,inward.z)<Math.hypot(bot.position.x,bot.position.z));
  bot.position={x:0,y:0,z:0};
  room.edgeOfVictory.pickups=[{id:'spell',kind:'spell',spell:'steel',
    position:{x:3,y:0,z:0},available:true}];
  const wanted=edgeBotGoal(room,bot);
  assert.equal(wanted?.purpose,'pickup');
  assert.equal(wanted.x,3);
});


test('a knight overtaken on the east gallery steps off toward a real lower floor',()=>{
  const {room,pilot}=fixture(6);
  room.world.floors=[
    {id:'ward',center:[0,-.1,0],size:[40,.2,40],y:0},
    {id:'gallery',center:[10.6,2.45,0],size:[1.6,.3,10],y:2.6}
  ];
  pilot.position={x:10.55,y:2.6,z:0};
  pilot.grounded=true;
  let wentAirborne=false;
  for(let i=0;i<8;i++){
    edgeConstrainActor(room,pilot,{...pilot.position},1+i/30,room.world);
    if(!pilot.grounded){wentAirborne=true;break;}
  }
  assert.equal(wentAirborne,true,'elevated fighters are allowed to leave the gallery on foot');
  assert.ok(pilot.position.y>2.5,'gravity, not teleportation, must lower the knight');
  assert.ok(pilot.position.x<9.8,'the new position crosses to a genuinely lower support surface');
  assert.equal(pilot.health,100);
});
