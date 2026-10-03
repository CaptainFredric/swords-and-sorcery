import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSocket } from './GameSocket.mjs';
import { GameLink } from './GameLink.mjs';
import { LocalHost } from './LocalHost.mjs';

test('socket sends one prepared cast intent containing identity and aim', () => {
  const messages = [];
  const socket = Object.create(GameSocket.prototype);
  socket.send = (message) => messages.push(message);
  socket.serverNow = () => 10;
  const direction = { x: 0, y: 0, z: -1 };
  socket.castPreparedSpell('frostfire', direction, { yaw: 0.3, pitch: 0.2, guard: true });
  socket.selectPreparedSpell('gale');
  socket.loadout('fireball', 'chivalry', ['fireball', 'gale', 'steel']);
  assert.deepEqual(messages, [
    { type: 'castPreparedSpell', spell: 'frostfire', direction, yaw: 0.3, pitch: 0.2, clientTime: 10 },
    { type: 'selectPreparedSpell', spell: 'gale' },
    { type: 'loadout', spell: 'fireball', ultimate: 'chivalry', preparedSpells: ['fireball', 'gale', 'steel'] },
  ]);
});

test('GameLink forwards prepared commands and the complete future loadout to each host', () => {
  const calls = [];
  const remote = { on: () => {}, loadout: (...args) => calls.push(['remoteLoadout', ...args]),
    castPreparedSpell: (...args) => calls.push(['remoteCast', ...args]), selectPreparedSpell: (id) => calls.push(['remoteSelect', id]) };
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: () => {} });
  const link = new GameLink({ remote, local });
  link.loadout('steel', 'chivalry', ['steel', 'frostfire', 'gale']);
  assert.deepEqual(local.preparedSpells, ['steel', 'frostfire', 'gale']);
  link.castPreparedSpell('gale', { x: 1, y: 0, z: 0 });
  link.selectPreparedSpell('frostfire');
  assert.deepEqual(calls.at(-2), ['remoteCast', 'gale', { x: 1, y: 0, z: 0 }]);
  assert.deepEqual(calls.at(-1), ['remoteSelect', 'frostfire']);
  local.startSolo('PRACTICE', 'Aden');
  assert.deepEqual(local.player.preparedSpells, ['steel', 'frostfire', 'gale']);
  assert.equal(local.player.startingSpell, 'steel');
  const carried = [...local.player.preparedSpells];
  local.room.state = 'PLAYING';
  local.player.spell = 'gale';
  link.loadout('fireball', 'sunder', ['fireball', 'gale', 'steel']);
  assert.equal(local.player.spell, 'gale');
  assert.deepEqual(local.player.preparedSpells, carried);
  assert.equal(local.player.startingSpell, 'fireball');
});
