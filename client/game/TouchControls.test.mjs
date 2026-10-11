import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchControls } from './TouchControls.mjs';
import { InputController } from './InputController.mjs';

// DOM event plumbing only. Gesture and controller code are the production implementations.
class Node extends EventTarget {
  constructor() {
    super(); this.children = []; this.dataset = {}; this.hidden = false; this.clientWidth = 800; this.clientHeight = 600;
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.style = { setProperty() {} }; this.nodes = new Map();
  }
  append(node) { this.children.push(node); }
  setAttribute() {}
  replaceWith() {}
  querySelector(selector) {
    if (!this.nodes.has(selector)) {
      const node = new Node();
      const action = selector.match(/data-action="(\w+)"/)?.[1];
      if (action) { node.dataset.action = action; node.closest = () => node; }
      this.nodes.set(selector, node);
    }
    return this.nodes.get(selector);
  }
}
function setup(local) {
  const doc = new EventTarget();
  doc.createElement = () => new Node();
  doc.querySelector = () => null;
  doc.createRange = () => ({ createContextualFragment: () => new Node() });
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  const element = new Node();
  const calls = [];
  const socket = Object.fromEntries(['cast', 'castPreparedSpell', 'selectPreparedSpell', 'guard', 'attack', 'dash'].map((id) => [id, (...args) => calls.push([id, ...args])]));
  const input = new InputController(element, socket);
  input.enabled = true;
  const controls = new TouchControls(new Node(), input);
  controls.active = true;
  controls.update(local, 10);
  const send = (type, x = 600, y = 300, { action = 'spell', pointerId = 1, target = controls.buttons[action] } = {}) => {
    const event = new Event(type);
    for (const [key, value] of Object.entries({ pointerId, clientX: x, clientY: y, target })) Object.defineProperty(event, key, { value });
    controls.layer.dispatchEvent(event);
  };
  return { input, controls, calls, send };
}
const local = { alive: true, spell: 'fireball', preparedSpells: ['fireball', 'frostfire', 'gale'],
  ultimateState: { id: 'chivalry', phase: 'active', until: 19 }, chivalryProjectileReadyAt: 0 };

test('mobile tap current and drag alternate send one atomic release intent per gesture', () => {
  const { controls, calls, send } = setup(local);
  send('pointerdown');
  assert.equal(calls.length, 0);
  assert.equal(controls.preparedFan.hidden, false);
  send('pointerup', 603, 303);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['castPreparedSpell', 'fireball']);
  send('pointerdown'); send('pointermove', 534, 244); send('pointerup', 534, 244);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].slice(0, 2), ['castPreparedSpell', 'frostfire']);
});

test('mobile drag out, pointer cancel, death, and expiry cancel without changing current', () => {
  for (const ending of ['outside', 'pointercancel', 'death', 'expiry']) {
    const { controls, calls, send } = setup(local);
    send('pointerdown');
    if (ending === 'outside') send('pointerup', 760, 460);
    if (ending === 'pointercancel') send('pointercancel', 534, 244);
    if (ending === 'death') { controls.update({ ...local, alive: false }, 10); send('pointerup', 534, 244); }
    if (ending === 'expiry') { controls.update(local, 19); send('pointerup', 534, 244); }
    assert.deepEqual(calls, [], ending);
    assert.equal(controls.preparedFan.hidden, true);
  }
});

test('mobile startup preselects on release and the ordinary spell button still casts on press', () => {
  const starting = setup({ ...local, ultimateState: { id: 'chivalry', phase: 'startup', commitAt: 10.65 } });
  starting.send('pointerdown'); starting.send('pointerup', 534, 244);
  assert.deepEqual(starting.calls, [['selectPreparedSpell', 'frostfire']]);
  const ordinary = setup({ alive: true, spell: 'fireball' });
  ordinary.send('pointerdown');
  assert.equal(ordinary.calls.length, 1);
  assert.equal(ordinary.calls[0][0], 'cast');
});

test('a held touch stick keeps ordinary movement and requires easing below the Sprint threshold after unlock', () => {
  const { input, controls, send } = setup({ alive: true, spell: 'fireball' });
  input.touch = controls;
  let unlocked = false;
  const feedback = [];
  input.allowAction = (action, notify = true) => {
    if (action !== 'sprint' || unlocked) return true;
    if (notify) feedback.push(action);
    return false;
  };
  const stick = { target: controls.layer };
  send('pointerdown', 100, 400, stick);
  send('pointermove', 100, 344, stick);
  assert.equal(input.movement().forward, 1);
  assert.equal(input.movement().sprint, false);
  unlocked = true;
  send('pointermove', 100, 340, stick);
  assert.equal(input.movement().sprint, false);
  assert.deepEqual(feedback, ['sprint']);
  send('pointermove', 100, 370, stick);
  assert.ok(input.movement().forward > 0);
  send('pointermove', 100, 344, stick);
  assert.equal(input.movement().sprint, true);
  send('pointerup', 100, 344, stick);
  assert.equal(input.movement().sprint, false);
});

test('an early touch Sprint button gives feedback and never latches until a fresh allowed press', () => {
  const { input, controls, send } = setup({ alive: true, spell: 'fireball' });
  input.touch = controls;
  let unlocked = false;
  const feedback = [];
  input.allowAction = (action, notify = true) => {
    if (action !== 'sprint' || unlocked) return true;
    if (notify) feedback.push(action);
    return false;
  };
  const button = { action: 'sprint', pointerId: 2 };
  send('pointerdown', 50, 180, button);
  assert.equal(controls.sprintLatched, false);
  unlocked = true;
  send('pointermove', 50, 180, button);
  assert.equal(controls.sprintLatched, false);
  assert.deepEqual(feedback, ['sprint']);
  send('pointerup', 50, 180, button);
  send('pointerdown', 50, 180, button);
  assert.equal(controls.sprintLatched, true);
});

test('early held touch Attack and Guard buttons require release and a fresh press', () => {
  for (const action of ['attack', 'guard']) {
    const { input, controls, calls, send } = setup({ alive: true, spell: 'fireball' });
    let unlocked = false;
    const feedback = [];
    input.allowAction = (requested, notify = true) => {
      if (requested !== action || unlocked) return true;
      if (notify) feedback.push(requested);
      return false;
    };
    const button = { action };
    send('pointerdown', 600, 300, button);
    unlocked = true;
    send('pointermove', 610, 300, button);
    assert.deepEqual(calls, []);
    assert.notEqual(input.yaw, 0, 'a denied combat button still permits aiming');
    assert.deepEqual(feedback, [action]);
    send('pointerup', 610, 300, button);
    send('pointerdown', 600, 300, button);
    assert.deepEqual(calls, [[action, true]]);
  }
});

test('ordinary touch stick Sprint and Sprint latch retain their immediate behavior without an action gate', () => {
  const { controls, send } = setup({ alive: true, spell: 'fireball' });
  const stick = { target: controls.layer };
  send('pointerdown', 100, 400, stick); send('pointermove', 100, 344, stick);
  assert.equal(controls.movement().sprint, true);
  send('pointerup', 100, 344, stick);
  send('pointerdown', 50, 180, { action: 'sprint', pointerId: 2 });
  assert.equal(controls.sprintLatched, true);
});

test('early touch Fireball and Dash requests stay quiet through unlock and succeed on a fresh press', () => {
  for (const [action, command] of [['spell', 'cast'], ['dash', 'dash']]) {
    const { input, calls, send } = setup({ alive: true, spell: 'fireball' });
    let unlocked = false;
    input.allowAction = requested => requested !== action || unlocked;
    const button = { action };
    send('pointerdown', 600, 300, button);
    unlocked = true;
    send('pointermove', 610, 300, button); send('pointerup', 610, 300, button);
    assert.deepEqual(calls, []);
    send('pointerdown', 600, 300, button);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], command);
  }
});

test('touch stick release clears a denied Sprint source for the next gesture', () => {
  const { input, controls, send } = setup({ alive: true, spell: 'fireball' });
  let unlocked = false;
  input.allowAction = action => action !== 'sprint' || unlocked;
  const stick = { target: controls.layer };
  send('pointerdown', 100, 400, stick); send('pointermove', 100, 344, stick);
  assert.equal(controls.movement().sprint, false);
  unlocked = true;
  send('pointerup', 100, 344, stick);
  send('pointerdown', 100, 400, stick); send('pointermove', 100, 344, stick);
  assert.equal(controls.movement().sprint, true);
});

test('a touch look finger placed before Look requires lifting even when unlock precedes its first drag', () => {
  for (const action of [null, 'attack', 'guard']) {
    const { input, controls, send } = setup({ alive: true, spell: 'fireball' });
    let unlocked = false;
    input.allowAction = requested => requested !== 'look' || unlocked;
    const finger = action ? { action } : { target: controls.layer };
    send('pointerdown', 600, 300, finger);
    unlocked = true;
    send('pointermove', 620, 310, finger);
    assert.equal(input.yaw, 0, action ?? 'look area');
    assert.equal(input.pitch, 0, action ?? 'look area');
    send('pointerup', 620, 310, finger);
    send('pointerdown', 600, 300, finger);
    send('pointermove', 620, 310, finger);
    assert.ok(input.yaw < 0, action ?? 'look area');
    assert.ok(input.pitch < 0, action ?? 'look area');
  }
});

test('a touch look permission withdrawal requires a new finger after unlock', () => {
  const { input, controls, send } = setup({ alive: true, spell: 'fireball' });
  let unlocked = true;
  input.allowAction = action => action !== 'look' || unlocked;
  const finger = { target: controls.layer };
  send('pointerdown', 600, 300, finger);
  send('pointermove', 620, 300, finger);
  const yaw = input.yaw;
  unlocked = false;
  send('pointermove', 640, 300, finger);
  unlocked = true;
  send('pointermove', 660, 300, finger);
  assert.equal(input.yaw, yaw);
  send('pointercancel', 660, 300, finger);
  send('pointerdown', 600, 300, finger);
  send('pointermove', 620, 300, finger);
  assert.ok(input.yaw < yaw);
});

test('a touch stick planted before Walk requires lifting even when unlock precedes its first movement sample', () => {
  const { input, controls, send } = setup({ alive: true, spell: 'fireball' });
  input.touch = controls;
  let unlocked = false;
  input.allowAction = action => action !== 'move' || unlocked;
  const finger = { target: controls.layer };
  send('pointerdown', 100, 400, finger);
  unlocked = true;
  send('pointermove', 100, 344, finger);
  assert.equal(input.movement().forward, 0);
  assert.equal(input.movement().right, 0);
  assert.equal(input.movement().sprint, false);
  send('pointermove', 100, 400, finger);
  send('pointermove', 156, 400, finger);
  assert.equal(controls.movement().right, 0);
  send('pointerup', 156, 400, finger);
  send('pointerdown', 100, 400, finger);
  send('pointermove', 100, 344, finger);
  assert.equal(input.movement().forward, 1);
  assert.equal(input.movement().sprint, true);
});

test('touch movement permission withdrawal blocks a held stick until release', () => {
  const { input, controls, send } = setup({ alive: true, spell: 'fireball' });
  let unlocked = true;
  input.allowAction = action => action !== 'move' || unlocked;
  const finger = { target: controls.layer };
  send('pointerdown', 100, 400, finger);
  send('pointermove', 100, 344, finger);
  assert.equal(controls.movement().forward, 1);
  unlocked = false;
  assert.equal(controls.movement().forward, 0);
  unlocked = true;
  assert.equal(controls.movement().forward, 0);
  send('pointerup', 100, 344, finger);
  send('pointerdown', 100, 400, finger);
  send('pointermove', 100, 344, finger);
  assert.equal(controls.movement().forward, 1);
});

test('the touch Menu remains available while opening Look and Walk are locked', () => {
  const { input, send } = setup({ alive: true, spell: 'fireball' });
  input.allowAction = action => !['look', 'move'].includes(action);
  let releases = 0;
  input.releaseFocus = () => releases++;
  const button = { action: 'pause' };
  send('pointerdown', 600, 300, button);
  send('pointerup', 600, 300, button);
  assert.equal(releases, 1);
});
