import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
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

test('Area of Denial keeps a slain ally alive at zero HP until departure, with one original kill',()=>{
  const {room,pilot,ally,enemy}=battle();
  ally.health=35;ally.prowess=23;
  assert.equal(applyDamage(room,enemy.id,ally.id,200,'sword',12),true);
  assert.equal(ally.health,0);
  assert.equal(ally.alive,true);
  assert.ok(ally.inDenial);
  assert.equal(ally.prowess,23+35*.14);
  assert.equal(room.events.filter(e=>e.type==='death'&&e.victimId===ally.id).length,0);
  const meter=enemy.prowess;
  assert.equal(applyDamage(room,enemy.id,ally.id,50,'sword',12.3,{x:2,y:0,z:0}),true);
  assert.equal(ally.health,0);
  assert.equal(ally.alive,true);
  assert.equal(enemy.prowess,meter,'no Prowess for hitting an already slain knight');
  assert.ok(ally.impulse.x>0,'displacement still works');
  // Still a valid combatant; can deal ordinary damage.
  assert.equal(applyDamage(room,ally.id,enemy.id,3,'sword',12.4),true);
  ally.position.x=5.1;
  stepFlightBurnZones(room,12.5);
  assert.equal(ally.health,0);
  assert.equal(ally.alive,false);
  assert.equal(ally.inDenial,null);
  stepFlightBurnZones(room,13);
  const deaths=room.events.filter(e=>e.type==='death'&&e.victimId===ally.id);
  assert.equal(deaths.length,1);
  assert.equal(deaths[0].killerId,enemy.id);
  assert.equal(deaths[0].source,'sword');
});

test('denial cannot heal and expires even if a different enemy hits the slain knight',()=>{
  const {room,ally,enemy}=battle();
  ally.health=10;
  applyDamage(room,enemy.id,ally.id,10,'fireball',12);
  const other=room.addPlayer({id:'other',token:'other',name:'other'},0);
  other.team='DEFENDERS';
  applyDamage(room,other.id,ally.id,30,'sword',13);
  assert.equal(ally.health,0);
  assert.equal(ally.inDenial.attackerId,enemy.id);
  stepFlightBurnZones(room,20);
  assert.equal(ally.alive,false);
  const death=room.events.find(e=>e.type==='death'&&e.victimId===ally.id);
  assert.equal(death.killerId,enemy.id);
  assert.equal(death.source,'fireball');
});

test('overlapping allied Areas of Denial preserve the same borrowed life',()=>{
  const {room,ally,enemy}=battle();
  const first=room.flightBurnZones[0];
  room.flightBurnZones.push({...first,id:'second-burn',startedAt:11,expiresAt:22});
  ally.health=1;
  applyDamage(room,enemy.id,ally.id,1,'sword',12);
  stepFlightBurnZones(room,20);
  assert.equal(ally.alive,true);
  assert.equal(ally.health,0);
  stepFlightBurnZones(room,22);
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
  assert.equal(ally.health,0,'the team belongs to the fire, not its living owner');
  assert.ok(ally.inDenial);
  assert.equal(ally.alive,true);
});
