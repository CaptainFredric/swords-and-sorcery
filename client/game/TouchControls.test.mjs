import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchControls } from './TouchControls.mjs';
import { InputController } from './InputController.mjs';

// DOM event plumbing only. Gesture and controller code are the production implementations.
class Node extends EventTarget {
  constructor() {
    super(); this.children = []; this.dataset = {}; this.hidden = false; this.clientWidth = 800;
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
  const socket = Object.fromEntries(['cast', 'castPreparedSpell', 'selectPreparedSpell', 'guard', 'attack'].map((id) => [id, (...args) => calls.push([id, ...args])]));
  const input = new InputController(element, socket);
  input.enabled = true;
  const controls = new TouchControls(new Node(), input);
  controls.active = true;
  controls.update(local, 10);
  const send = (type, x = 600, y = 300) => {
    const event = new Event(type);
    for (const [key, value] of Object.entries({ pointerId: 1, clientX: x, clientY: y, target: controls.buttons.spell })) Object.defineProperty(event, key, { value });
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
