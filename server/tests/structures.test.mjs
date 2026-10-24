import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';
import { mountSoFistication, soFistOperator, damageSoFistication } from '../../shared/sim/soFistication.mjs';
function setup() {
  const room = new RoomManager().createBreakthroughRoom(0, true, 'bastion-breach');
  const attacker = room.addPlayer({ id: 'a', token: 'a', name: 'Attacker', team: 'ATTACKERS' }, 0);
  const defender = room.addPlayer({ id: 'd', token: 'd', name: 'Defender', team: 'DEFENDERS' }, 0);
  room.startMatch(0);
  return { room, attacker, defender };
}
test('Breakthrough begins with authored healthy defenses and one attacker ram', () => {
  const {room} = setup();
  assert.ok(room.structures?.entities['assault-barricade']);
  assert.equal(room.soFistication?.team, 'ATTACKERS');
  assert.equal(room.biByeLlista, null);
  assert.ok(room.world.solids.some(s => s.id === 'gatehouse-honorable-gate-closed'));
  assert.deepEqual(serializeSnapshot(room, 0).structures, room.structures);
});
test('empty team ram refuses enemy operation and friendly sabotage, and rematch resets wreck', () => {
  const {room,attacker,defender} = setup();
  const b = room.soFistication;
  assert.ok(b);
  defender.position = soFistOperator(b, room.world);
  assert.equal(mountSoFistication(room, b, defender), false);
  assert.equal(damageSoFistication(room, b, 500, attacker.id, 'fireball', 1), false);
  assert.equal(damageSoFistication(room, b, 2000, defender.id, 'fireball', 1), true);
  assert.equal(b.health, 0);
  attacker.position = soFistOperator(b, room.world);
  assert.equal(mountSoFistication(room, b, attacker), false);
  room.startMatch(10);
  assert.equal(room.soFistication.health, 1400);
  assert.notEqual(room.soFistication.id, b.id);
});

test('three real authored piston cycles breach the barricade and preserve phase one gate', async () => {
  const { stepRoom } = await import('../../shared/sim/combat.mjs');
  const { fireSoFistication } = await import('../../shared/sim/soFistication.mjs');
  const { runClear } = await import('../../shared/sim/botNav.mjs');
  const {room,attacker,defender} = setup();
  const b = room.soFistication;
  b.z = -18;
  attacker.position = soFistOperator(b, room.world);
  defender.position = {x:12,y:0,z:5};
  assert.ok(mountSoFistication(room,b,attacker));
  const from = {x:0,y:0,z:-17}, to = {x:0,y:0,z:-11};
  assert.equal(runClear(room.world,from,to),false);
  for (let cycle = 0; cycle < 3; cycle++) {
    assert.ok(fireSoFistication(room,b,cycle * 4.1));
    for(let i=1;i<=240;i++) stepRoom(room,1/60,cycle*4.1+i/60);
    assert.equal(room.structures.entities['assault-barricade'].health, Math.max(0,600-240*(cycle+1)));
  }
  assert.equal(room.world.solids.some(s=>s.id==='cover-approach-breastwork'),false);
  assert.equal(runClear(room.world,from,to),true);
  assert.equal(room.objectiveState.index,0);
  assert.ok(room.world.solids.some(s=>s.id==='gatehouse-honorable-gate-closed'));
  assert.equal(room.events.filter(e=>e.type==='structureDamaged'&&e.destroyed).length,1);
  const late = room.addPlayer({id:'late',token:'late',name:'Late'},13);
  assert.ok(late);
  assert.equal(serializeSnapshot(room,13).structures.entities['assault-barricade'].health,0);
  b.operatorId=null;attacker.operatingRamId=null;attacker.position={x:0,y:0,z:-2};
  for(let i=1;i<=170;i++)stepRoom(room,.1,13+i*.1);
  assert.equal(room.objectiveState.index,1);
  assert.equal(room.world.solids.some(s=>s.id==='gatehouse-honorable-gate-closed'),false);
  assert.equal(room.world.solids.some(s=>s.id==='cover-approach-breastwork'),false,'capture preserves breach');
  room.startMatch(40);
  assert.equal(room.structures.entities['assault-barricade'].health,600);
  assert.ok(room.world.solids.some(s=>s.id==='cover-approach-breastwork'));
});

test('health changes retain cached navigation geometry; only selected failure opens it', async () => {
  const {damageStructure,structureWorld}=await import('../../shared/sim/structures.mjs');
  const {room,attacker,defender}=setup(),other=setup().room;
  const initial=room.world;
  assert.equal(damageStructure(room,'assault-barricade',30,defender.id,'sword',1),false);
  assert.equal(damageStructure(room,'gatehouse-honorable-gate-closed',9999,attacker.id,'sword',1),false);
  assert.ok(damageStructure(room,'assault-barricade',30,attacker.id,'sword',1));
  assert.equal(room.world,initial);
  assert.equal(room.structures.entities['assault-barricade'].health,586.5);
  assert.equal(other.structures.entities['assault-barricade'].health,600);
  assert.ok(damageStructure(room,'assault-barricade',9999,attacker.id,'sword',2));
  const breached=room.world;
  assert.equal(structureWorld(initial,room.structures),breached);
  assert.equal(structureWorld(breached,room.structures),breached);
  assert.equal(damageStructure(room,'assault-barricade',9999,attacker.id,'sword',2),false);
  assert.ok(breached.solids.some(s=>s.id==='wall-construction-hoarding'));
  assert.ok(breached.solids.some(s=>s.id==='gatehouse-honorable-gate-closed'));
});

test('ordinary sword and Fireball hit timber using normal contact and cast timing', async () => {
  const {beginAttack,endAttack,tryCastSpell,stepRoom}=await import('../../shared/sim/combat.mjs');
  const {room,attacker,defender}=setup();room.soFistication=null;
  attacker.position={x:0,y:0,z:-16.1};attacker.yaw=Math.PI;
  attacker.input={yaw:Math.PI,pitch:0,forward:0,right:0};attacker.spawnProtectionUntil=0;
  defender.position={x:12,y:0,z:5};
  assert.ok(beginAttack(room,attacker.id,1));endAttack(room,attacker.id,1.1);
  for(let i=1;i<=90;i++)stepRoom(room,1/60,1+i/60);
  const afterSword=room.structures.entities['assault-barricade'].health;
  assert.ok(afterSword<600&&afterSword>=580,`one ordinary contact: ${afterSword}`);
  assert.ok(tryCastSpell(room,attacker.id,{x:0,y:0,z:1},4));
  for(let i=1;i<=90;i++)stepRoom(room,1/60,4+i/60);
  assert.equal(room.structures.entities['assault-barricade'].health,Math.round((afterSword-10.8)*100)/100);
  assert.equal(room.events.filter(e=>e.type==='structureDamaged'&&e.source==='sword').length,1);
  assert.equal(room.events.filter(e=>e.type==='structureDamaged'&&e.source==='fireball').length,1);
});

test('heavy siege bolts stop at first solid; simultaneous hits fail a defense exactly once', async () => {
  const {stepBiByeProjectiles}=await import('../../shared/sim/biByeLlista.mjs');
  const {room,attacker}=setup();room.soFistication=null;room.bibyeProjectiles=new Map();
  const bolt=id=>({id,ballistaId:'test',ownerId:attacker.id,subKind:'siege',bornAt:0,position:{x:0,y:1,z:-16},velocity:{x:0,y:0,z:55},directDamage:85,piercedVictimIds:[],radius:.1});
  room.bibyeProjectiles.set('one',bolt('one'));stepBiByeProjectiles(room,.1,.1);
  assert.equal(room.structures.entities['assault-barricade'].health,447);
  room.world={...room.world,solids:[...room.world.solids,{id:'permanent-shielding-wall',center:[0,1,-15.5],size:[8,2,.3],material:'stone'}]};
  room.bibyeProjectiles.set('blocked',bolt('blocked'));stepBiByeProjectiles(room,.1,.2);
  assert.equal(room.structures.entities['assault-barricade'].health,447);
  room.world={...room.world,solids:room.world.solids.filter(s=>s.id!=='permanent-shielding-wall')};
  room.structures.entities['assault-barricade'].health=10;
  room.bibyeProjectiles.set('two',bolt('two'));room.bibyeProjectiles.set('three',bolt('three'));stepBiByeProjectiles(room,.1,.3);
  assert.equal(room.structures.entities['assault-barricade'].health,0);
  assert.equal(room.events.filter(e=>e.type==='structureDamaged'&&e.destroyed).length,1);
  assert.ok(room.bibyeProjectiles.has('three'),'later projectile crosses the newly opened space');
});

test('a frontal pressure charge and following piston share one maximum structure impact', async () => {
  const {stepRoom}=await import('../../shared/sim/combat.mjs');
  const {fireSoFistication}=await import('../../shared/sim/soFistication.mjs');
  const {room,attacker,defender}=setup(),b=room.soFistication;
  attacker.position=soFistOperator(b,room.world);defender.position={x:12,y:0,z:5};
  assert.ok(mountSoFistication(room,b,attacker));attacker.input={forward:1,right:0,sprint:true,yaw:Math.PI,pitch:0};
  for(let i=1;i<=180;i++)stepRoom(room,1/60,i/60);
  const charged=room.structures.entities['assault-barricade'].health;
  assert.ok(charged<600&&charged>=420,`${charged}`);
  attacker.input={forward:0,right:0,yaw:Math.PI,pitch:0};
  assert.ok(fireSoFistication(room,b,3.1));
  for(let i=1;i<=240;i++)stepRoom(room,1/60,3.1+i/60);
  assert.equal(room.structures.entities['assault-barricade'].health,360);
  assert.ok(fireSoFistication(room,b,7.2));
  for(let i=1;i<=240;i++)stepRoom(room,1/60,7.2+i/60);
  assert.equal(room.structures.entities['assault-barricade'].health,120);
});

test('a nearer permanent wall absorbs a piston without damaging the timber behind', async () => {
  const {stepRoom}=await import('../../shared/sim/combat.mjs');
  const {fireSoFistication}=await import('../../shared/sim/soFistication.mjs');
  const {room,attacker,defender}=setup(),b=room.soFistication;b.z=-18;
  room.world={...room.world,solids:[...room.world.solids,{id:'stone-shield',center:[0,1,-15.3],size:[8,2,.25],material:'stone'}]};
  // Use another map id only to keep this deliberately added test wall in the supplied world.
  room.worldId='structural-fixture';
  attacker.position=soFistOperator(b,room.world);defender.position={x:12,y:0,z:5};assert.ok(mountSoFistication(room,b,attacker));
  fireSoFistication(room,b,0);for(let i=1;i<=240;i++)stepRoom(room,1/60,i/60);
  assert.equal(room.structures.entities['assault-barricade'].health,600);
});

test('disconnect releases the emplacement immediately and reconnect preserves the same machine', () => {
  const {room,attacker}=setup(),b=room.soFistication;
  attacker.position=soFistOperator(b,room.world);assert.ok(mountSoFistication(room,b,attacker));
  room.disconnectPlayer(attacker.id,1);
  assert.equal(b.operatorId,null);
  assert.equal(attacker.operatingRamId,null);
  assert.equal(room.reconnectPlayer(attacker.token,2),attacker);
  assert.equal(room.soFistication,b);
  attacker.position=soFistOperator(b,room.world);assert.ok(mountSoFistication(room,b,attacker,2));
  room.removePlayer(attacker.id,3);
  assert.equal(b.operatorId,null);
});
