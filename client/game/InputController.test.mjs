import test from 'node:test';
import assert from 'node:assert/strict';
import { InputController } from './InputController.mjs';

function setup({ useHostTimers = false } = {}) {
  const doc = new EventTarget();
  const win = new EventTarget();
  const element = new EventTarget();
  globalThis.document = doc;
  globalThis.window = win;
  doc.pointerLockElement = element;
  const calls = [];
  const socket = Object.fromEntries(['guard', 'attack', 'cast', 'castPreparedSpell', 'selectPreparedSpell'].map((action) => [action, (...args) => calls.push([action, ...args])]));
  let timer;
  const input = new InputController(element, socket, useHostTimers ? undefined : { setTimer: (fn) => { timer = fn; return 1; }, clearTimer: () => { timer = null; } });
  doc.dispatchEvent(new Event('pointerlockchange'));
  const send = (name, values = {}, target = doc) => {
    const event = new Event(name);
    for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
  };
  const down = (code) => code.startsWith('Mouse') ? send('mousedown', { button: Number(code.slice(5)) }) : send('keydown', { code, repeat: false });
  const up = (code) => code.startsWith('Mouse') ? send('mouseup', { button: Number(code.slice(5)) }) : send('keyup', { code });
  return { input, calls, send, down, up, win, reveal: () => timer?.() };
}
const chivalry = { alive: true, spell: 'fireball', preparedSpells: ['fireball', 'frostfire', 'gale'],
  ultimateState: { id: 'chivalry', phase: 'active', until: 20 }, spellReadyById: { gale: 14 }, chivalryProjectileReadyAt: 0 };

test('default guard holds across either physical binding release without restarting guard', () => {
  for (const sources of [['Mouse2', 'KeyG'], ['KeyG', 'Mouse2']]) {
    const { input, calls, down, up } = setup();
    down(sources[0]); down(sources[1]); up(sources[0]);
    assert.equal(input.movement().guard, true);
    assert.deepEqual(calls, [['guard', true]]);
    up(sources[1]);
    assert.deepEqual(calls, [['guard', true], ['guard', false]]);
  }
});

test('ordinary spell press keeps its existing immediate command', () => {
  const { input, calls, down } = setup();
  input.updatePreparedSpells({ alive: true, spell: 'fireball' }, 10);
  down('KeyQ');
  assert.equal(calls[0][0], 'cast');
});

test('prepared tap sends one atomic current spell command with aim', () => {
  const { input, calls, down, up } = setup();
  input.updatePreparedSpells(chivalry, 10);
  down('KeyQ');
  assert.equal(calls.length, 0);
  up('KeyQ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'castPreparedSpell');
  assert.equal(calls[0][1], 'fireball');
  assert.deepEqual(calls[0][3], { yaw: 0, pitch: 0 });
});

test('hold and drag releases one atomic alternate command while preserving aim and pointer lock', () => {
  const { input, calls, down, up, reveal, send } = setup();
  input.updatePreparedSpells(chivalry, 10);
  down('KeyQ'); reveal(); send('mousemove', { movementX: -60, movementY: 0 }); up('KeyQ');
  assert.equal(input.pointerLocked, true);
  assert.equal(input.yaw, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['castPreparedSpell', 'frostfire']);
});

test('startup preselects while a cooling active gesture remains one atomic select and attempt', () => {
  const { input, calls } = setup();
  input.updatePreparedSpells({ ...chivalry, ultimateState: { id: 'chivalry', phase: 'startup', commitAt: 10.65 } }, 10);
  input.usePreparedSpell('frostfire');
  input.updatePreparedSpells(chivalry, 10);
  input.usePreparedSpell('gale');
  assert.equal(calls[0][0], 'selectPreparedSpell');
  assert.equal(calls[0][1], 'frostfire');
  assert.equal(calls[1][0], 'castPreparedSpell');
  assert.equal(calls[1][1], 'gale');
  assert.equal(calls.length, 2);
});

test('Escape, blur, death, and expiry cancel a pending prepared gesture without casting', () => {
  for (const cancellation of ['escape', 'blur', 'death', 'expiry']) {
    const { input, calls, down, up, send, win } = setup();
    input.updatePreparedSpells(chivalry, 10);
    down('KeyQ');
    if (cancellation === 'escape') down('Escape');
    if (cancellation === 'blur') send('blur', {}, win);
    if (cancellation === 'death') input.updatePreparedSpells({ ...chivalry, alive: false }, 10);
    if (cancellation === 'expiry') input.updatePreparedSpells(chivalry, 20);
    up('KeyQ');
    assert.deepEqual(calls, [], cancellation);
  }
});

test('desktop guard and touch guard form one logical hold and blur releases it once', () => {
  const { input, calls, down, up, send, win } = setup();
  down('KeyG'); input.setGuard(true); up('KeyG');
  assert.equal(input.guardHeld, true);
  assert.deepEqual(calls, [['guard', true]]);
  send('blur', {}, win);
  input.setGuard(false);
  assert.deepEqual(calls, [['guard', true], ['guard', false]]);
  down('Mouse2'); up('Mouse2');
  assert.deepEqual(calls.slice(2), [['guard', true], ['guard', false]]);
});

test('prepared gesture timers retain the browser host receiver', () => {
  const priorSet = globalThis.setTimeout;
  const priorClear = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = function (callback, milliseconds) {
    assert.equal(this, globalThis, 'browser timer requires its host as receiver');
    timers.push({ callback, milliseconds });
    return 42;
  };
  globalThis.clearTimeout = function (timer) {
    assert.equal(this, globalThis, 'browser timer cancellation requires its host as receiver');
    timers.push({ cancelled: timer });
  };
  try {
    const { input, calls } = setup({ useHostTimers: true });
    input.updatePreparedSpells(chivalry, 10);
    input.beginPreparedGesture();
    assert.equal(timers[0].milliseconds, 140);
    timers[0].callback();
    input.finishPreparedGesture();
    assert.deepEqual(timers.at(-1), { cancelled: 42 });
    assert.equal(calls[0][0], 'castPreparedSpell');
    input.updatePreparedSpells({ alive: false }, 10);
  } finally {
    globalThis.setTimeout = priorSet;
    globalThis.clearTimeout = priorClear;
  }
});
