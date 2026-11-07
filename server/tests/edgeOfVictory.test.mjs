import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { stepRoom, killPlayer } from '../../shared/sim/combat.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { edgeCollectSpells, edgeConstrainActor, edgeAlive } from '../../shared/sim/edgeOfVictory.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';

function makeMatch() {
  const room = new Room('EDGE1', { mode: GAME_MODES.EDGE_OF_VICTORY, worldId: 'ruined-keep' });
  room.addPlayer({ id: 'knight', token: 'secret', name: 'Knight' }, 0);
  room.provisionModeActors(0);
  room.startMatch(0);
  return room;
}

test('Edge creates four scattered competitors; state and pickups replicate', () => {
  const room = makeMatch();
  assert.equal(room.players.size, 4);
  assert.equal(room.edgeOfVictory.remaining.length, 4);
  assert.equal(room.policy.scored, false);
  const positions = [...room.players.values()].map((p) => p.position.x + '/' + p.position.z);
  assert.equal(new Set(positions).size, 4);
  const snapshot = serializeSnapshot(room, 0, 'knight');
  assert.equal(snapshot.edgeOfVictory.playersRemaining, 4);
  assert.equal(snapshot.edgeOfVictory.pickups.length, 4);
});

test('pickups are authoritative single-owner acquisitions in existing spell slot', () => {
  const room = makeMatch();
  const p = room.players.get('knight'), first = room.edgeOfVictory.pickups[0];
  p.position = { ...first.position };
  for (const actor of room.players.values()) if (actor !== p) actor.position = { x: 0, y: 0, z: -9 };
  edgeCollectSpells(room, 1);
  assert.equal(first.available, false);
  assert.equal(first.collectedBy, 'knight');
  assert.equal(p.spell, first.spell);
  assert.ok(p.preparedSpells.includes(first.spell));
  const count = room.events.filter((event) => event.type === 'edgeSpellCollected' && event.pickupId === first.id).length;
  edgeCollectSpells(room, 1.1);
  assert.equal(room.events.filter((event) => event.type === 'edgeSpellCollected' && event.pickupId === first.id).length, count);
});

test('outward refusal never deals damage; inward directions remain available', () => {
  const room = makeMatch(), knight = room.players.get('knight');
  room.edgeOfVictory.radius = 7;
  knight.position = { x: 12, y: 0, z: -1 };
  const before = knight.health;
  edgeConstrainActor(room, knight, { x: 6, y: 0, z: -1 }, 10);
  assert.ok(Math.hypot(knight.position.x, knight.position.z + 1) <= 7);
  assert.equal(knight.health, before);
});

test('one survivor wins immediately, regardless of ordinary FFA score', () => {
  const room = makeMatch();
  const victims = [...room.players.values()].filter((p) => p.id !== 'knight');
  for (let i = 0; i < victims.length; i++) {
    killPlayer(room, victims[i].id, 'knight', 'sword', i + 2);
  }
  assert.equal(edgeAlive(room).length, 1);
  assert.equal(room.state, 'FINISHED');
  assert.equal(room.winnerId, 'knight');
  assert.equal(room.finishReason, 'last-knight-standing');
  assert.equal(room.players.get(victims[0].id).alive, false);
  assert.deepEqual(room.edgeOfVictory.remaining, ['knight']);
});

test('eliminated players do not respawn when the server advances', () => {
  const room = makeMatch();
  const dead = [...room.players.values()].find((p) => p.id !== 'knight');
  killPlayer(room, dead.id, 'knight', 'sword', 1);
  stepRoom(room, 1 / 30, 30, room.world);
  assert.equal(dead.alive, false);
  assert.equal(dead.respawnAt, Infinity);
});

test('rematch resets eliminated list, radius, equipment and spawns', () => {
  const room = makeMatch();
  const dead = [...room.players.values()].find((p) => p.id !== 'knight');
  killPlayer(room, dead.id, 'knight', 'sword', 1);
  room.finish('knight', 3, 'test');
  assert.equal(room.requestRematch('knight', 4), false); // multiplayer requires two connected humans
  room.startMatch(8);
  assert.equal(room.edgeOfVictory.eliminated.length, 0);
  assert.equal(room.edgeOfVictory.radius, 18);
  assert.ok([...room.players.values()].every((p) => p.alive));
});

test('departing an active human counts as forfeit without indefinite waiting', () => {
  const room = new Room('EXIT1',{mode:GAME_MODES.EDGE_OF_VICTORY,worldId:'ruined-keep'});
  room.addPlayer({id:'one',token:'one',name:'One'},0);
  room.addPlayer({id:'two',token:'two',name:'Two'},0);
  room.startMatch(0);
  const bots=[...room.players.values()].filter(p=>p.actorKind==='bot');
  for (const bot of bots) killPlayer(room,bot.id,'one','sword',1);
  room.removePlayer('two',3);
  assert.equal(room.state,'FINISHED');
  assert.equal(room.winnerId,'one');
  assert.equal(room.edgeOfVictory.eliminated.some(e=>e.id==='two'&&e.reason==='forfeit'),true);
});

test('outward refusal respects dialogue cooldown and contracts silently when stationary', () => {
  const room=makeMatch(),p=room.players.get('knight');
  const center=room.edgeOfVictory.center;
  room.edgeOfVictory.radius=8;
  p.position={x:center.x+7.54,y:0,z:center.z};
  p.input={...p.input,forward:-1,right:0,yaw:Math.PI/2};
  edgeConstrainActor(room,p,p.position,5);
  edgeConstrainActor(room,p,p.position,6);
  const lines=room.events.filter(e=>e.type==='spellbladeLine'&&e.playerId===p.id);
  assert.ok(lines.length<=1);
  p.input={...p.input,forward:0,right:0};
  room.edgeOfVictory.radius=5;
  edgeConstrainActor(room,p,p.position,7);
  assert.equal(room.events.filter(e=>e.type==='spellbladeLine'&&e.playerId===p.id).length,lines.length);
});
