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
  const socket = Object.fromEntries(['guard', 'attack', 'cast', 'castPreparedSpell', 'selectPreparedSpell', 'selectPreparedSlot', 'castCurrentSpell'].map((action) => [action, (...args) => calls.push([action, ...args])]));
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

test('prepared tap casts the authoritative current spell without resending a stale identity', () => {
  const { input, calls, down, up } = setup();
  input.updatePreparedSpells(chivalry, 10);
  down('KeyQ');
  assert.equal(calls.length, 0);
  up('KeyQ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'castCurrentSpell');
  assert.deepEqual(calls[0][2], { yaw: 0, pitch: 0 });
});

test('holding Q leaves the mouse free to aim and release without a choice does not cast', () => {
  const { input, calls, down, up, reveal, send } = setup();
  input.updatePreparedSpells(chivalry, 10);
  down('KeyQ'); reveal(); send('mousemove', { movementX: -600, movementY: 100 }); up('KeyQ');
  assert.equal(input.pointerLocked, true);
  assert.ok(input.yaw > 1);
  assert.deepEqual(calls, []);
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
    assert.equal(timers[0].milliseconds, 200);
    timers[0].callback();
    input.finishPreparedGesture();
    assert.equal(calls.length, 0, 'a held selector release never casts');
    input.cancelPreparedGesture();
    assert.deepEqual(timers.at(-1), { cancelled: 42 });
    input.updatePreparedSpells({ alive: false }, 10);
  } finally {
    globalThis.setTimeout = priorSet;
    globalThis.clearTimeout = priorClear;
  }
});


for (const [key, slot] of [['Digit1',1],['Digit2',2],['Digit3',3],['Numpad2',2]]) test(`Q plus ${key} selects slot ${slot} once without casting`, () => {
  const { input, calls, down, up, reveal, send } = setup();
  input.updatePreparedSpells({ ...chivalry, spell: 'gale' }, 10);
  down('KeyQ'); reveal(); down(key);
  assert.deepEqual(calls, [['selectPreparedSlot', slot]], 'slot order comes from the repertoire, not current spell');
  assert.equal(input.preparedGesture, null, 'valid choice closes immediately');
  send('keydown', { code:key, repeat:true }); up(key); up('KeyQ');
  assert.deepEqual(calls, [['selectPreparedSlot', slot]], 'release and autorepeat stay quiet');
  down('KeyQ'); up('KeyQ');
  assert.equal(calls.at(-1)[0], 'castCurrentSpell', 'a quick later tap uses server current identity');
});

test('quick Q plus a number works before the informational panel hold timer', () => {
  const { input, calls, down, up, reveal } = setup();
  input.updatePreparedSpells(chivalry, 10); down('KeyQ'); down('Digit3'); reveal(); up('Digit3'); up('KeyQ');
  assert.deepEqual(calls, [['selectPreparedSlot', 3]]);
});

test('numeric bindings retain ordinary actions outside selection and consumed releases never reach them', () => {
  const { input, calls, down, up, reveal, send } = setup();
  input.configure({bindings:{...input.bindings,attack:['Digit2'],forward:['Digit1']}});
  input.updatePreparedSpells(chivalry, 10);
  down('Digit2'); up('Digit2'); assert.deepEqual(calls, [['attack',true],['attack',false]]);
  calls.length=0; down('KeyQ'); reveal(); down('Digit2'); up('KeyQ');
  send('keydown',{code:'Digit2',repeat:true}); up('Digit2');
  assert.deepEqual(calls, [['selectPreparedSlot',2]], 'selection consumes the complete numeric press');
  calls.length=0; down('KeyQ'); down('Digit1'); assert.equal(input.movement().forward,0);
  up('Digit1'); up('KeyQ'); down('Digit1'); assert.equal(input.movement().forward,1); up('Digit1');
});

test('numbers without Q and numeric autorepeat before a fresh press never select', () => {
  const { input, calls, down, up, send, reveal } = setup();
  input.updatePreparedSpells(chivalry,10); down('Digit1'); down('KeyQ'); reveal();
  send('keydown',{code:'Digit1',repeat:true}); up('KeyQ'); up('Digit1');
  assert.deepEqual(calls,[]);
});

test('selected prepared identity remains a spell input after expiry and returns to normal on a new match', () => {
  const { input, calls, down, up } = setup();
  input.updatePreparedSpells({...chivalry,ultimateState:null,spell:'gale',preparedSpellSelected:true},20);
  down('KeyQ'); up('KeyQ'); assert.equal(calls[0][0],'castCurrentSpell');
  input.updatePreparedSpells({...chivalry,ultimateState:null,preparedSpellSelected:false},30);
  down('KeyQ'); up('KeyQ'); assert.equal(calls.at(-1)[0],'cast');
});

test('a quick next Q tap predicts the chosen spell without overwriting authoritative identity', () => {
  const { input, calls, down, up } = setup(); const presentations = [];
  input.onCastLocal = metadata => presentations.push(metadata);
  input.updatePreparedSpells(chivalry, 10);
  down('KeyQ'); down('Digit2'); up('Digit2'); up('KeyQ');
  assert.deepEqual(presentations, []);
  down('KeyQ'); up('KeyQ');
  assert.deepEqual(presentations, [{spellOnly:true,spell:'frostfire'}]);
  assert.equal(input.prepared.current, 'fireball', 'only snapshots change authoritative current');
  assert.equal(calls.at(-1)[0], 'castCurrentSpell');
  input.updatePreparedSpells({...chivalry,spell:'frostfire',preparedSpellSelected:true},10.1);
  assert.equal(input.pendingPreparedSelection,null);
});

test('a short hold opens the choice, and it stays open once Q is let go: a number then selects, never casting', () => {
  const { input, calls, down, up, reveal } = setup();
  input.updatePreparedSpells(chivalry, 10);
  down('KeyQ'); reveal(); up('KeyQ');
  assert.ok(input.preparedGesture?.shown, 'still open after Q is released');
  assert.deepEqual(calls, []);
  // gale is cooling (ready at 14): choosing it is still allowed, the host decides
  down('Digit3'); up('Digit3');
  assert.deepEqual(calls, [['selectPreparedSlot', 3]]);
  assert.equal(input.preparedGesture, null, 'choosing closes it');
  down('KeyQ'); up('KeyQ');
  assert.equal(calls.at(-1)[0], 'castCurrentSpell', 'a tap after it casts');
});

test('Q again or Escape puts an open choice away without casting', () => {
  for (const close of ['KeyQ', 'Escape']) {
    const { input, calls, down, up, reveal } = setup();
    input.updatePreparedSpells(chivalry, 10);
    down('KeyQ'); reveal(); up('KeyQ');
    down(close); up(close);
    assert.equal(input.preparedGesture, null, close);
    assert.deepEqual(calls, [], close);
    down('Digit1'); up('Digit1');
    assert.deepEqual(calls, [], `${close}: a number after it is no choice`);
  }
});

test('a controller put away takes its listeners off the page: keys and buttons reach it no more', () => {
  const { input, calls, down, up, send, win } = setup();
  down('Mouse0'); up('Mouse0');
  assert.deepEqual(calls, [['attack', true], ['attack', false]]);
  input.dispose();
  calls.length = 0;
  down('Mouse0'); up('Mouse0'); down('KeyG'); send('blur', {}, win);
  assert.deepEqual(calls, [], 'nothing after it was put away');
  assert.equal(input.enabled, false);
});
