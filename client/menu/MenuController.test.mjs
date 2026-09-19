import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuController, shouldRouteSocketError } from './MenuController.mjs';

function harness() {
  const calls = [];
  const socket = {
    quickPlay: (name) => calls.push(['quickPlay', name]),
    createRoom: (name) => calls.push(['createRoom', name]),
    joinRoom: (code, name) => calls.push(['joinRoom', code, name]),
    startSolo: (mode, name) => calls.push(['startSolo', mode, name]),
  };
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  };
  return { calls, store, controller: new MenuController(socket, storage) };
}

test('Quick Play, Bot Duel and Practice are distinct authoritative actions', () => {
  const { controller, calls } = harness();

  assert.equal(controller.quickPlay('Aden').ok, true);
  assert.equal(controller.botDuel('Aden').ok, true);
  assert.equal(controller.practice('Aden').ok, true);

  assert.deepEqual(calls, [
    ['quickPlay', 'Aden'],
    ['startSolo', 'BOT_DUEL', 'Aden'],
    ['startSolo', 'PRACTICE', 'Aden'],
  ]);
});

test('menu actions normalize names once and persist the accepted identity', () => {
  const { controller, calls, store } = harness();

  const result = controller.createPrivate('   The Long Spellblade Name That Will Be Cut   ');

  assert.equal(result.ok, true);
  assert.equal(result.name.length, 18);
  assert.equal(result.name, 'The Long Spellblad');
  assert.deepEqual(calls, [['createRoom', 'The Long Spellblad']]);
  assert.equal(store.get('ss-player-name'), 'The Long Spellblad');
});

test('blank names and malformed room codes fail without touching the socket', () => {
  const { controller, calls } = harness();

  assert.deepEqual(controller.quickPlay('   '), { ok: false, error: 'Enter a Spellblade name.' });
  assert.deepEqual(controller.joinPrivate('abc', 'Aden'), { ok: false, error: 'Enter the five-character room code.' });
  assert.deepEqual(calls, []);
});

test('private join normalizes room codes before dispatch', () => {
  const { controller, calls } = harness();

  const result = controller.joinPrivate(' abcd2 ', 'Aden');

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['joinRoom', 'ABCD2', 'Aden']]);
});

test('socket errors during active play stay in the arena instead of routing to a stale menu', () => {
  assert.equal(shouldRouteSocketError('ABCDE', { roomState: 'PLAYING', mode: 'PRACTICE' }), false);
  assert.equal(shouldRouteSocketError('ABCDE', { roomState: 'PLAYING', mode: 'FFA' }), false);
  assert.equal(shouldRouteSocketError(null, null), true);
  assert.equal(shouldRouteSocketError(null, { roomState: 'WAITING' }), true);
});
