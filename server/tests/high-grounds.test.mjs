import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { WORLD_IDS, getWorld } from '../../shared/worlds/registry.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { stepHighGrounds, availableHighGroundsSpawns } from '../../shared/sim/highGroundsMode.mjs';
import { HIGH_GROUNDS_MACHINES } from '../../shared/sim/highGroundsFoundry.mjs';
import { applyRoomCommand, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';

function setup() {
  const room = new RoomManager().createBreakthroughRoom(0, true, WORLD_IDS.HIGH_GROUNDS);
  const a = room.addPlayer({ id: 'azure', token: 'azure', name: 'Azure', team: TEAMS.ATTACKERS }, 0);
  const b = room.addPlayer({ id: 'crimson', token: 'crimson', name: 'Crimson', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);
  a.position = { x: 0, y: 0, z: -101 };
  b.position = { x: 0, y: 0, z: 101 };
  return { room, a, b };
}
function progress(room, seconds, start=1) {
  for (let i = 0; i < seconds * 30; i++) stepHighGrounds(room, 1/30, start + (i+1)/30);
}
test('The High Grounds is enormous, has 3 accessible heights, true abyss and uninterrupted wheeled central route', () => {
  const w = getWorld(WORLD_IDS.HIGH_GROUNDS);
  assert.equal(w.name, 'The High Grounds');
  assert.ok(w.bounds.maxX-w.bounds.minX >= 150);
  assert.ok(w.bounds.maxZ-w.bounds.minZ >= 230);
  assert.equal(w.objectives.length, 5);
  assert.equal(w.siegeFoundries.length, 2);
  assert.ok(w.floors.some(x => x.y === 12));
  assert.ok(w.floors.some(x => x.y === -9));
  assert.ok(w.abyssY <= -50);
  for (let z=-110; z<=110; z+=2) {
    assert.equal(surfaceHeightAt(0,z,2,w),0, `No road or siege support at z=${z}`);
  }
  assert.equal(surfaceHeightAt(0,0,2,w),0, 'The central road remains navigable beneath the high crossing');
  assert.equal(surfaceHeightAt(-38,-7,14,w),12);
  assert.equal(surfaceHeightAt(-16,0,-7,w),-9);
  assert.equal(surfaceHeightAt(75,0,20,w),null, 'Abyss remains open beyond suspended structures');
});
test('new room selects a distinct reciprocal territory mode, and both teams have combat spawns', () => {
  const {room, a,b} = setup();
  assert.equal(room.mode,'HIGH_GROUNDS');
  assert.equal(room.objectiveState,null);
  assert.equal(room.highGrounds.sites.length,5);
  assert.equal(room.highGrounds.sites.filter(s=>s.owner===a.team).length,2);
  assert.equal(room.highGrounds.sites.filter(s=>s.owner===b.team).length,2);
  assert.equal(serializeSnapshot(room,0).highGrounds.sites.length,5);
  assert.ok(room.initialSpawnFor(a,0).team===a.team);
  assert.ok(room.initialSpawnFor(b,0).team===b.team);
});
test('both sides can capture and recapture: contest freezes capture and territory income', () => {
  const {room,a,b} = setup();
  const center=room.highGrounds.sites.find(s=>s.id==='crown-span');
  a.position={...center.position};
  b.position={x:0,y:0,z:101};
  progress(room,5);
  assert.ok(center.progress>0 && center.progress<1);
  b.position={x:1,y:0,z:1};
  const before=center.progress,score=room.highGrounds.scores.ATTACKERS;
  progress(room,2,6);
  assert.equal(center.contested,true);
  assert.equal(center.progress,before);
  assert.ok(room.highGrounds.scores.ATTACKERS>score, 'Other held zones still score');
  b.position={x:0,y:0,z:101};
  progress(room,12,9);
  assert.equal(center.owner,TEAMS.ATTACKERS);
  a.position={x:0,y:0,z:-101};
  b.position={...center.position};
  progress(room,10,22);
  assert.equal(center.owner,null, 'Defenders first neutralize the formerly Azure zone');
  progress(room,16,34);
  assert.equal(center.owner,TEAMS.DEFENDERS,'Crimson captures the site independently');
});
test('airborne Fight-and-Flight does not capture a landing zone without committing to the deck', () => {
  const {room,a,b}=setup();
  const site=room.highGrounds.sites.find(s=>s.id==='crown-span');
  room.fightFlight={id:'flight',grounded:false};
  a.position={...site.position};a.operatingFightFlightId='flight';
  b.position={x:0,y:0,z:100};
  progress(room,2);
  assert.equal(site.owner,null);
  assert.equal(site.progress,0);
});
test('respawn forwards only while your forward zone is held and enemy-free', () => {
  const {room,a,b}=setup(), w=room.world;
  assert.ok(availableHighGroundsSpawns(room,a,w.spawnPoints).every(s=>s.forward));
  b.position={x:0,y:0,z:-69};
  assert.ok(availableHighGroundsSpawns(room,a,w.spawnPoints).every(s=>!s.forward));
  b.position={x:0,y:0,z:100};
  room.highGrounds.sites.find(s=>s.id==='azure-forward').owner=TEAMS.DEFENDERS;
  assert.ok(availableHighGroundsSpawns(room,a,w.spawnPoints).every(s=>!s.forward));
});
test('foundry only accepts a nearby living ally, valid machine choice, and produces a real lifecycle on cooldown', () => {
  const {room,a,b}=setup();
  const console=room.highGrounds.foundries.find(f=>f.team===a.team);
  a.position={x:console.x,y:console.y,z:console.z};
  b.position={x:console.x,y:console.y,z:console.z};
  assert.ok(applyRoomCommand(room,b,{type:'highGroundsBuild',machine:'fight-and-flight'},1).rejected);
  assert.ok(applyRoomCommand(room,a,{type:'highGroundsBuild',machine:'fictional'},1).rejected);
  const outcome=applyRoomCommand(room,a,{type:'highGroundsBuild',machine:'fight-and-flight'},1);
  assert.equal(outcome.rejected,undefined,outcome.rejected);
  assert.ok(room.fightFlight);
  assert.equal(room.fightFlight.team,TEAMS.ATTACKERS);
  assert.equal(room.fightFlight.lifecycleId,room.fightFlight.id);
  assert.equal(console.readyAt,121);
  assert.ok(applyRoomCommand(room,a,{type:'highGroundsBuild',machine:'bi-bye-llista'},2).rejected);
  assert.deepEqual(HIGH_GROUNDS_MACHINES,['bi-bye-llista','so-fist-ication','fight-and-flight']);
});
test('both team foundries actually construct every supported machine with authoritative snapshots', () => {
  const config = [
    ['bi-bye-llista', 'biByeLlista', 'bibyeConstructed'],
    ['so-fist-ication', 'soFistication', 'soFistConstructed'],
    ['fight-and-flight', 'fightFlight', 'fightFlightConstructed'],
  ];
  for (const [machine, field, event] of config) for (const side of [TEAMS.ATTACKERS, TEAMS.DEFENDERS]) {
    const {room, a, b} = setup();
    const operator = side === TEAMS.ATTACKERS ? a : b;
    const foundry = room.highGrounds.foundries.find(f => f.team === side);
    operator.position = {x:foundry.x, y:foundry.y, z:foundry.z};
    const outcome = applyRoomCommand(room, operator, {type:'highGroundsBuild',machine}, 1);
    assert.equal(outcome.rejected, undefined, machine + ' ' + side + ': ' + outcome.rejected);
    const built = room[field];
    assert.ok(built, machine + ' ' + side + ' must exist on authority');
    assert.equal(built.team, side);
    assert.equal(built.id, foundry.machineId);
    assert.equal(foundry.machine, machine);
    assert.ok(built.health > 0 && !built.retired);
    assert.ok(Math.hypot(built.x-foundry.spawnX,built.z-foundry.spawnZ)<1, 'built on designated pad');
    const snapshot = serializeSnapshot(room, 1.05);
    const snapField = machine === 'bi-bye-llista' ? 'bibyeBallista' : machine === 'so-fist-ication' ? 'soFistication' : 'fightFlight';
    assert.equal(snapshot[snapField]?.id, built.id, machine + ' must replicate to browser');
    assert.ok(room.events.some(e => e.type === event && e.machineId === built.id));
    assert.ok(room.events.some(e => e.type === 'highGroundsProduced' && e.machineId === built.id));
  }
});
test('territory match resolves by score on time, without Breakthrough overtime', () => {
  const {room}=setup();
  room.highGrounds.scores.ATTACKERS=200;
  room.highGrounds.scores.DEFENDERS=100;
  room.tick(721);
  assert.equal(room.state,'FINISHED');
  assert.equal(room.winnerTeam,TEAMS.ATTACKERS);
  assert.equal(room.finishReason,'territory-time');
});
