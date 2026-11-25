import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
import {applyDamage} from '../../shared/sim/combat.mjs';
import {stepFlightBurnZones} from '../../shared/sim/fightFlightTerminal.mjs';

function battle(){
  const room=new Room('VALKYRIE-FIRE',{mode:'FFA',worldId:'castleward'});
  room.state='PLAYING';
  room.world={floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100]}],
    solids:[],ramps:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-30};
  const player=(id,team,x)=>{
    const p=room.addPlayer({id,token:id,name:id},0);
    p.team=team;p.spawnProtectionUntil=0;p.position={x,y:0,z:0};
    p.health=100;p.maxHealth=100;p.prowess=50;
    return p;
  };
  const pilot=player('pilot','ATTACKERS',0);
  const ally=player('ally','ATTACKERS',0);
  const enemy=player('enemy','DEFENDERS',1);
  room.flightBurnZones=[{id:'aircraft-burn',sourceId:pilot.id,
    team:pilot.team,point:{x:0,y:0,z:0},radius:5,
    tickDamage:4,startedAt:10,expiresAt:20,nextTickAt:10}];
  return {room,pilot,ally,enemy};
}

test('an ally in Valkyrie flames survives an otherwise lethal hit at exactly 1 HP',()=>{
  const {room,ally,enemy}=battle();
  ally.health=35;ally.prowess=23;
  assert.equal(applyDamage(room,enemy.id,ally.id,200,'sword',12),true);
  assert.equal(ally.health,1);
  assert.equal(ally.alive,true);
  assert.equal(ally.prowess,23+34*.14,
    'ally takes its actual damage and retains ordinary prowess accounting');
  assert.equal(room.events.filter(e=>e.type==='death'&&e.victimId===ally.id).length,0);
  assert.equal(applyDamage(room,enemy.id,ally.id,50,'sword',12.3),true);
  assert.equal(ally.health,1,'repeated lethal hits do not slip past the floor');
  assert.equal(ally.alive,true);
  // Protection is spatial, not an invulnerability state attached to the knight.
  ally.position.x=5.1;
  assert.equal(applyDamage(room,enemy.id,ally.id,3,'sword',12.5),true);
  assert.equal(ally.health,0);
  assert.equal(ally.alive,false);
});

test('ally protection ends immediately at expiry or behind blocking geometry',()=>{
  const expired=battle();
  expired.ally.health=9;
  applyDamage(expired.room,expired.enemy.id,expired.ally.id,9,'sword',20);
  assert.equal(expired.ally.alive,false,'the last tick is exclusive');
  const blocked=battle();
  blocked.ally.health=9;
  blocked.room.world.solids=[{id:'wall',center:[.5,1,0],size:[.3,2,3]}];
  blocked.ally.position={x:1,y:0,z:0};
  applyDamage(blocked.room,blocked.enemy.id,blocked.ally.id,9,'sword',12);
  assert.equal(blocked.ally.alive,false,
    'wall separation obeys the same line of fire as the harmful burn');
});

test('all HP damage to an enemy inside Valkyrie fire drains exactly that much Prowess',()=>{
  const {room,ally,enemy}=battle();
  enemy.prowess=75;
  ally.position={x:7,y:0,z:0};
  ally.prowess=2;
  applyDamage(room,ally.id,enemy.id,18,'sword',12);
  assert.equal(enemy.health,82);
  assert.equal(enemy.prowess,57,
    'no damage-received Prowess is awarded and then partially deducted');
  assert.equal(ally.prowess,2+18*.28,
    'an attacker retains normal Prowess for damage they dealt');
  const before={health:enemy.health,prowess:enemy.prowess};
  stepFlightBurnZones(room,12.2);
  const dealt=before.health-enemy.health;
  assert.ok(dealt>0,'the scheduled Valkyrie fire actually damages its enemy');
  assert.equal(enemy.prowess,before.prowess-dealt,
    'fire ticks use precisely the same HP-to-Prowess relationship');
  assert.equal(room.events.some(e=>e.type==='valkyrieProwessBurn'&&
    e.playerId===enemy.id),true);
  enemy.prowess=3;
  applyDamage(room,ally.id,enemy.id,17,'fireball',12.4);
  assert.equal(enemy.prowess,0,'loss bottoms out at zero, never negative');
  assert.equal(enemy.alive,true);
});

test('mitigated HP, outside hits and fire expiry never manufacture Prowess loss',()=>{
  const {room,ally,enemy}=battle();
  enemy.prowess=50;
  // Explicit min mitigation: a genuine Steel hit reduces raw 30 down to 19.
  enemy.steel={calledAt:10,fullUntil:15,struck:false};
  ally.position.x=7;
  const old=enemy.health;
  applyDamage(room,ally.id,enemy.id,30,'sword',12);
  const actual=old-enemy.health;
  assert.ok(actual>0&&actual<30);
  assert.equal(enemy.prowess,50-actual);
  enemy.position.x=7;
  const outside=enemy.prowess;
  applyDamage(room,ally.id,enemy.id,6,'sword',12.2);
  assert.ok(enemy.prowess>=outside,
    'outside the flame the ordinary dealt/taken rules apply');
  enemy.position.x=1;
  const after=enemy.prowess;
  applyDamage(room,ally.id,enemy.id,6,'sword',20);
  assert.ok(enemy.prowess>=after,'expired ground fire no longer drains');
});

test('the halo protects the sacrificed pilot’s team even after the pilot leaves the room',()=>{
  const {room,pilot,ally,enemy}=battle();
  room.players.delete(pilot.id);
  ally.health=12;
  applyDamage(room,enemy.id,ally.id,50,'sword',12);
  assert.equal(ally.health,1,'the team belongs to the fire, not its living owner');
  assert.equal(ally.alive,true);
});

test('snapshot auras use the exact combat exposure, expire, and distinguish overlapping teams',()=>{
  const {room,ally,enemy}=battle();
  const state=(p,now)=>serializeSnapshot(room,now,p.id).players.find(x=>x.id===p.id).valkyrieFlames;
  assert.deepEqual(state(ally,12),{alliedUntil:20,hostileUntil:0});
  assert.deepEqual(state(enemy,12),{alliedUntil:0,hostileUntil:20});
  room.flightBurnZones.push({...room.flightBurnZones[0],id:'other-burn',
    sourceId:enemy.id,team:enemy.team,expiresAt:22});
  assert.deepEqual(state(ally,12),{alliedUntil:20,hostileUntil:22});
  assert.deepEqual(state(ally,20),{alliedUntil:0,hostileUntil:22});
  assert.equal(state(ally,22),null);
  ally.position.y=2;
  assert.equal(state(ally,12),null,'a different floor has no aura');
  ally.position={x:1,y:0,z:0};
  room.world.solids=[{id:'wall',center:[.5,1,0],size:[.3,2,3]}];
  assert.equal(state(ally,12),null,'a wall blocks the visual just as it blocks damage');
  ally.position={x:0,y:0,z:0};ally.alive=false;
  assert.equal(state(ally,12),null,'no aura on a corpse');
});

test('returning pilot receives their own Valkyrie protection, even without a team',()=>{
  const {room,pilot,enemy}=battle();
  pilot.team=null;room.flightBurnZones[0].team=null;
  pilot.alive=false;
  const view=()=>serializeSnapshot(room,12,pilot.id).players.find(x=>x.id===pilot.id).valkyrieFlames;
  assert.equal(view(),null);
  // Model a new life of the same player identity outside, then entering.
  pilot.alive=true;pilot.health=100;pilot.spawnProtectionUntil=0;
  pilot.position={x:8,y:0,z:0};
  assert.equal(view(),null);
  pilot.position.x=0;
  assert.deepEqual(view(),{alliedUntil:20,hostileUntil:0});
  applyDamage(room,enemy.id,pilot.id,110,'sword',12);
  assert.equal(pilot.health,1);
  assert.equal(pilot.alive,true);
  assert.equal(room.events.filter(e=>e.type==='damage'&&e.victimId===pilot.id).at(-1).inDenial,true);
});

test('In Denial voice fact is restricted to actually prevented lethal damage',()=>{
  const {room,ally,enemy}=battle();
  const hit=(damage,now)=>{
    applyDamage(room,enemy.id,ally.id,damage,'sword',now);
    return room.events.filter(e=>e.type==='damage'&&e.victimId===ally.id).at(-1);
  };
  assert.equal(hit(10,12).inDenial,undefined,'ordinary damage is not a prevented death');
  assert.equal(hit(200,12.1).inDenial,true);
  assert.equal(hit(20,12.2).inDenial,true,'another lethal hit at one HP still reaches the voice hook');
  ally.position.x=6;
  assert.equal(hit(20,12.3).inDenial,undefined);
  assert.equal(ally.alive,false);
});
