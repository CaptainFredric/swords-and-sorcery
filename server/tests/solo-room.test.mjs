import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';

function sequenceRandom(seed = 0.1) {
  let value = seed;
  return () => {
    value = (value + 0.173) % 1;
    return value;
  };
}

test('Bot Duel waits for arena readiness, cancels countdown on focus loss, then stays live once playing', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.1) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.armAutoStart(0);

  assert.equal(room.humanCount(), 1);
  assert.equal(room.connectedCount(), 1);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'bot').length, 1);
  assert.equal(room.state, 'WAITING');

  room.tick(10);
  assert.equal(room.state, 'WAITING');

  assert.equal(room.setArenaReady('human', true, 10), true);
  assert.equal(room.state, 'COUNTDOWN');
  assert.equal(room.players.get('human').arenaReady, true);

  assert.equal(room.setArenaReady('human', false, 11), true);
  assert.equal(room.state, 'WAITING');
  assert.equal(room.countdownEndsAt, null);
  assert.equal(room.players.get('human').arenaReady, false);

  assert.equal(room.setArenaReady('human', true, 12), true);
  assert.equal(room.state, 'COUNTDOWN');
  room.tick(15.1);
  assert.equal(room.state, 'PLAYING');

  assert.equal(room.setArenaReady('human', false, 15.2), false);
  assert.equal(room.state, 'PLAYING');
});

test('Bot Duel disconnect during countdown withdraws readiness and returns to waiting', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.15) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.armAutoStart(0);
  room.setArenaReady('human', true, 0);

  assert.equal(room.state, 'COUNTDOWN');
  room.disconnectPlayer('human', 1);
  assert.equal(room.state, 'WAITING');
  assert.equal(room.countdownEndsAt, null);
  assert.equal(room.players.get('human').arenaReady, false);

  const restored = room.reconnectPlayer('token', 2);
  assert.equal(restored?.id, 'human');
  assert.equal(restored?.arenaReady, false);
  assert.equal(room.state, 'WAITING');
});

test('Practice starts for one human and does not time out', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.2) });
  const room = manager.createSoloRoom('PRACTICE', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.armAutoStart(0);

  assert.equal(room.state, 'PLAYING');
  room.tick(9999);
  assert.equal(room.state, 'PLAYING');
});

test('solo reconnect preserves authoritative mode and world identity', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.25) });
  const room = manager.createSoloRoom('PRACTICE', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.armAutoStart(0);
  room.disconnectPlayer('human', 1);

  const restored = room.reconnectPlayer('token', 2);
  assert.equal(restored?.id, 'human');
  assert.equal(room.mode, 'PRACTICE');
  assert.equal(room.worldId, 'castleward');
  assert.equal(room.state, 'PLAYING');
});

test('Quick Play never selects a solo room', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.3) });
  const solo = manager.createSoloRoom('BOT_DUEL', 0);
  const quick = manager.quickPlay(0);
  assert.notEqual(quick.code, solo.code);
  assert.equal(quick.mode, 'FFA');
});

test('server actors do not keep an abandoned solo room alive forever', () => {
  const manager = new RoomManager({ random: sequenceRandom(0.4) });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  room.disconnectPlayer('human', 1);
  room.tick(16.1);

  assert.equal([...room.players.values()].some((p) => p.actorKind === 'human'), false);
  assert.equal(room.isCleanupEligible(75), false);
  assert.equal(room.isCleanupEligible(76.2), true);
});


test('Shared Practice is a real private Practice room, never matchmaking FFA or solo LocalHost',()=>{
 const manager=new RoomManager({random:sequenceRandom(.17)});
 const shared=manager.createSharedPracticeRoom(0,'castleward');
 assert.equal(shared.mode,'PRACTICE');assert.equal(shared.isPrivate,true);
 assert.equal(shared.sharedPractice,true);
 const privateFFA=manager.createPrivateRoom(0);
 assert.equal(privateFFA.mode,'FFA');assert.equal(privateFFA.sharedPractice,false);
 const joiner=shared.addPlayer({id:'player-1',token:'t1',name:'First'},0);
 shared.sharedPracticeHostId=joiner.id;
 shared.addPlayer({id:'player-2',token:'t2',name:'Second'},0);
 shared.armAutoStart(0);
 assert.equal(shared.state,'PLAYING');
 const quick=manager.quickPlay(1);
 assert.notEqual(quick.code,shared.code);
 shared.disconnectPlayer('player-1',2);
 assert.equal(shared.sharedPracticeHostId,'player-2');
});


test('Shared Practice host ownership transfers on permanent leave and survives solo reconnect',()=>{
 const manager=new RoomManager({random:sequenceRandom(.67)});
 const room=manager.createSharedPracticeRoom(0);
 room.addPlayer({id:'a',token:'a',name:'Host'},0);
 room.addPlayer({id:'b',token:'b',name:'Guest'},0);
 assert.equal(room.sharedPracticeHostId,'a');
 room.removePlayer('a',1);
 assert.equal(room.sharedPracticeHostId,'b');
 room.disconnectPlayer('b',2);
 assert.equal(room.sharedPracticeHostId,null);
 assert.equal(room.reconnectPlayer('b',3)?.id,'b');
 assert.equal(room.sharedPracticeHostId,'b');
 room.removePlayer('b',4);
 assert.equal(room.sharedPracticeHostId,null);
 room.addPlayer({id:'c',token:'c',name:'Rejoined'},5);
 assert.equal(room.sharedPracticeHostId,'c');
});
