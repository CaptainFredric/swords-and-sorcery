import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchControls } from './TouchControls.mjs';
import { InputController } from './InputController.mjs';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from '../tutorial/TutorialSession.mjs';

// DOM event plumbing only. Gesture and controller code are the production implementations.
class Node extends EventTarget {
  constructor() {
    super(); this.children = []; this.dataset = {}; this.hidden = false; this.clientWidth = 800; this.clientHeight = 600;
    const classes = new Set();
    this.classList = {
      add(...c) { c.forEach((x) => classes.add(x)); },
      remove(...c) { c.forEach((x) => classes.delete(x)); },
      toggle(c, force) {
        const on = force !== undefined ? Boolean(force) : !classes.has(c);
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains(c) { return classes.has(c); },
    };
    this.style = { setProperty() {} }; this.nodes = new Map();
  }
  append(node) { this.children.push(node); }
  setAttribute(k, v) { this.attributes ??= new Map(); this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes?.get(k) ?? null; }
  replaceWith() {}
  remove() {}
  querySelector(selector) {
    if (!this.nodes.has(selector)) {
      const node = new Node();
      const action = selector.match(/data-action="(\w+)"/)?.[1];
      if (action) {
        node.dataset.action = action;
        // Match actual DOM closest(): an ordinary button is not the flight rail.
        node.closest = selector => selector === '[data-action]' ? node : null;
      }
      this.nodes.set(selector, node);
    }
    return this.nodes.get(selector);
  }
}
function setup(local, { orientation } = {}) {
  const doc = new EventTarget();
  doc.createElement = () => new Node();
  doc.querySelector = () => null;
  doc.createRange = () => ({ createContextualFragment: () => new Node() });
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  if (orientation) window.matchMedia = () => orientation;
  const element = new Node();
  const calls = [];
  const socket = Object.fromEntries(['cast', 'castPreparedSpell', 'selectPreparedSpell', 'guard', 'attack', 'dash'].map((id) => [id, (...args) => calls.push([id, ...args])]));
  const input = new InputController(element, socket);
  input.enabled = true;
  const controls = new TouchControls(new Node(), input);
  controls.active = true;
  controls.update(local, 10);
  const send = (type, x = 600, y = 300, { action = 'spell', pointerId = 1, target = controls.buttons[action], pointerType = 'touch', button = 0, ...rest } = {}) => {
    const event = new Event(type);
    for (const [key, value] of Object.entries({ pointerId, pointerType, button, clientX: x, clientY: y, target, ...rest })) Object.defineProperty(event, key, { value });
    controls.layer.dispatchEvent(event);
  };
  return { input, controls, calls, send };
}
function flightRailTarget(controls) {
  controls.flightRail.offsetWidth = 44;
  controls.flightRail.offsetHeight = 140;
  controls.flightRail.getBoundingClientRect = () => ({ left: 100, top: 100, width: 44, height: 140 });
  return { closest: selector => selector === '.touch-flight-rail' ? controls.flightRail : null };
}
const local = { alive: true, spell: 'fireball', preparedSpells: ['fireball', 'frostfire', 'gale'],
  ultimateState: { id: 'chivalry', phase: 'active', until: 19 }, chivalryProjectileReadyAt: 0 };

test('siege controls appear only in real interaction range or while mounted and clear on death', () => {
  const p = { alive: true, spell: 'fireball', position: { x: 0, z: 3.1 } };
  const { controls, input, send } = setup(p);
  const b = { id: 'siege', position: { x: 0, z: 0 }, mode: 'MOBILE' };
  controls.update(p, 10, { snapshot: { bibyeBallista: b } });
  assert.equal(controls.buttons.interact.hidden, false);
  assert.equal(controls.buttons.deploy.hidden, true);
  controls.update({ ...p, operatingBallistaId: 'siege' }, 10, { snapshot: { bibyeBallista: b } });
  assert.equal(controls.buttons.siegeView.hidden, false);
  assert.equal(controls.buttons.deploy.hidden, false);
  const actions = [];
  input.onAction = (...args) => actions.push(args);
  send('pointerdown', 600, 300, { action: 'siegeView' });
  assert.deepEqual(actions, []);
  send('pointerup', 600, 300, { action: 'siegeView' });
  assert.deepEqual(actions, [['siegeView', true]]);
  controls.update({ ...p, alive: false }, 10, { snapshot: { bibyeBallista: b } });
  assert.equal(controls.buttons.interact.hidden, true);
  assert.equal(controls.buttons.siegeView.hidden, true);
});

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

test('one held full stick or Sprint latch earns tutorial stamina milestones while a long take is playing', () => {
  for (const style of ['full-stick','latched']) {
    let now=10;
    const host=new LocalHost({now:()=>now,every:()=>1,cancel:()=>{},later:()=>{}});
    host.startTutorial('You'); const session=new TutorialSession(host); session.start();
    session.stage('stamina'); session.director.resumeAt('sprint-prompt');
    const {input,controls,send}=setup(host.player);
    input.touch=controls; input.allowAction=(action,notify=true)=>session.allows(action,notify);
    const stick={target:controls.layer};
    send('pointerdown',100,400,stick);
    send('pointermove',100,style==='full-stick'?344:370,stick);
    if(style==='latched')send('pointerdown',50,180,{action:'sprint',pointerId:2});
    let recorded=null;
    for(let i=0;i<30*14;i++) {
      host.input(input.movement()); now+=1/30; host.tick(); controls.update(host.player,now);
      if(!recorded&&session.director.cue){recorded=session.director.cue;session.director.beginAudio(recorded);}
    }
    for(const fact of ['sprint-started','stamina-decreased','sprint-sustained','player-winded'])assert.ok(session.director.facts.has(fact),`${style}: ${fact}`);
    assert.equal(session.director.cue.id,recorded.id,'real take continues without forcing its end');
    if(style==='latched')assert.equal(controls.sprintLatched,true);
    send('pointerup',100,344,stick);
    assert.equal(input.movement().sprint,false);
    assert.equal(controls.sprintLatched,false);
    host.close();
  }
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

test('mouse pointerdown in TouchControls viewport attacks directly and requests pointer lock without creating touch stick', () => {
  const { input, controls, calls, send } = setup({ alive: true, spell: 'fireball' });
  let pointerLockRequested = false;
  input.requestPointerLock = () => { pointerLockRequested = true; };
  send('pointerdown', 200, 300, { pointerType: 'mouse', button: 0, target: controls.layer });
  assert.equal(pointerLockRequested, true);
  assert.equal(controls.stick, null, 'mouse click does not create a touch stick');
  assert.equal(controls.look, null, 'mouse click does not create a touch look tracker');
  assert.deepEqual(calls, [['attack', true]]);
  send('pointerup', 200, 300, { pointerType: 'mouse', button: 0, target: controls.layer });
  assert.deepEqual(calls, [['attack', true], ['attack', false]]);
});

test('mouse right-click in TouchControls viewport guards directly', () => {
  const { controls, calls, send } = setup({ alive: true, spell: 'fireball' });
  send('pointerdown', 500, 300, { pointerType: 'mouse', button: 2, target: controls.layer });
  assert.deepEqual(calls, [['guard', true]]);
  send('pointerup', 500, 300, { pointerType: 'mouse', button: 2, target: controls.layer });
  assert.deepEqual(calls, [['guard', true], ['guard', false]]);
});

test('mouse click on TouchControls button still activates the button', () => {
  const { controls, calls, send } = setup({ alive: true, spell: 'fireball' });
  send('pointerdown', 600, 300, { action: 'attack', pointerType: 'mouse', button: 0 });
  assert.deepEqual(calls, [['attack', true]]);
  send('pointerup', 600, 300, { action: 'attack', pointerType: 'mouse', button: 0 });
  assert.deepEqual(calls, [['attack', true], ['attack', false]]);
});

test('joystick stays anchored while fullscreen scale and viewport offsets affect touch geometry', () => {
  const { controls, send } = setup({ alive: true, spell: 'fireball' });
  // The game layer is offset and displayed at half its CSS layout size.
  controls.layer.getBoundingClientRect = () => ({ left: 50, top: 30, width: 400, height: 300 });
  const finger = { target: controls.layer };
  send('pointerdown', 130, 255, finger);
  assert.deepEqual({ x: controls.stick.x, y: controls.stick.y }, { x: 160, y: 450 });
  assert.equal(controls.stickBase.style.left, undefined, 'touch never overwrites the CSS ring anchor');
  assert.equal(controls.stickBase.style.top, undefined, 'touch never overwrites the CSS ring anchor');
  send('pointermove', 130, 225, finger);
  assert.ok(controls.movement().forward > 0.5, 'steering uses screen-space thumb movement');
  send('pointerup', 130, 225, finger);
  assert.equal(controls.stick, null);
  assert.equal(controls.stickBase.style.left, undefined);
  assert.equal(controls.stickBase.style.top, undefined);
});

test('left-side swipes still move even above the former 35% dead strip', () => {
  const { controls, send } = setup({ alive: true, spell: 'fireball' });
  const finger = { target: controls.layer };
  send('pointerdown', 125, 120, finger);
  assert.deepEqual({ x: controls.stick.x, y: controls.stick.y }, { x: 125, y: 120 });
  send('pointermove', 125, 70, finger);
  assert.ok(controls.movement().forward > 0.8, 'a swipe near the visible ring must steer');
  send('pointerup', 125, 70, finger);
  assert.equal(controls.movement().forward, 0);
  send('pointerdown', 125, 420, finger);
  send('pointermove', 125, 370, finger);
  assert.ok(controls.movement().forward > 0, 'lower-left movement remains unchanged');
  globalThis.window.dispatchEvent(new Event('blur'));
  assert.ok(controls.stick, 'transient browser blur while visible must not discard a held stick');
  assert.ok(controls.movement().forward > 0, 'movement survives a non-hidden Android system overlay');
  globalThis.document.hidden = true;
  globalThis.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(controls.stick, null, 'backgrounding the app releases the held stick');
  assert.equal(controls.movement().forward, 0);
});

test('touches on the displayed ring work directly and can recover a lost pointer release', () => {
  const { controls, send } = setup({ alive: true, spell: 'fireball' });
  const ring = { closest: (selector) => selector === '.touch-stick' ? controls.stickBase : null };
  send('pointerdown', 120, 112, { target: ring, pointerId: 15 });
  send('pointermove', 120, 62, { target: ring, pointerId: 15 });
  assert.ok(controls.movement().forward > 0.7);
  // No pointerup arrived for the first finger. A fresh touch on the visible
  // joystick must not remain inert because a stale pointer ID owns the stick.
  send('pointerdown', 118, 120, { target: ring, pointerId: 16 });
  assert.equal(controls.stick.id, 16);
  send('pointermove', 118, 68, { target: ring, pointerId: 16 });
  assert.ok(controls.movement().forward > 0.7);
  send('pointerup', 118, 68, { target: ring, pointerId: 16 });
  assert.equal(controls.stick, null);
  assert.equal(controls.movement().forward, 0);
});

test('a held joystick still updates and releases when browser sends events beyond its overlay', () => {
  const { controls, send } = setup({ alive: true, spell: 'fireball' });
  send('pointerdown', 118, 460, { target: controls.layer, pointerId: 26 });
  const outside = {};
  const windowPointer = (type, x, y) => {
    const event = new Event(type);
    for (const [key, value] of Object.entries({
      pointerId: 26, pointerType: 'touch', clientX: x, clientY: y, target: outside,
    })) Object.defineProperty(event, key, { value });
    globalThis.window.dispatchEvent(event);
  };
  windowPointer('pointermove', 118, 405);
  assert.ok(controls.movement().forward > 0.8, 'off-layer drag should still move');
  windowPointer('pointerup', 118, 405);
  assert.equal(controls.stick, null, 'off-layer release must not strand the joystick');
  assert.equal(controls.movement().forward, 0);
});

test('near-edge touch starts neutral and steers without moving the visual ring', () => {
  const { controls, send } = setup({ alive: true, spell: 'fireball' });
  const finger = { target: controls.layer };
  send('pointerdown', 10, 12, finger);
  assert.deepEqual({ x: controls.stick.x, y: controls.stick.y }, { x: 10, y: 12 },
    'record the actual touch, without snapping it to a 66px anchor');
  assert.equal(controls.stickBase.style.left, undefined);
  assert.equal(controls.stickBase.style.top, undefined);
  assert.equal(controls.movement().forward, 0);
  assert.equal(controls.movement().right, 0);
  send('pointermove', 10, 0, finger);
  assert.ok(controls.movement().forward > 0, 'movement follows the actual touch delta');
  send('pointerup', 10, 0, finger);
  assert.equal(controls.movement().forward, 0);
});

test('fullscreen layout temporarily reporting zero dimensions never teleports the joystick', () => {
  const { input, controls, send } = setup({ alive: true, spell: 'fireball' });
  input.touch = controls;
  // Reproduces the geometry the old clamp mishandled: x/y were forced to (66,66).
  controls.layer.clientWidth = 0;
  controls.layer.clientHeight = 0;
  controls.layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
  const ring = { closest: (selector) => selector === '.touch-stick' ? controls.stickBase : null };
  send('pointerdown', 118, 475, { target: ring, pointerId: 33 });
  assert.equal(controls.stickBase.style.left, undefined, 'ring left remains defined exclusively by CSS');
  assert.equal(controls.stickBase.style.top, undefined, 'ring top remains defined exclusively by CSS');
  assert.equal(input.movement().forward, 0, 'touching alone does not propel the player');
  send('pointermove', 118, 420, { target: ring, pointerId: 33 });
  assert.ok(input.movement().forward > 0.9, 'steering does not depend on valid layer dimensions');
  assert.equal(input.movement().right, 0);
  send('pointerup', 118, 420, { target: ring, pointerId: 33 });
  assert.equal(input.movement().forward, 0, 'release restores neutral movement');
  assert.equal(controls.stickBase.style.left, undefined);
  assert.equal(controls.stickBase.style.top, undefined);
});

test('a portrait transition cancels held look without applying the old finger displacement', () => {
  const orientation = new EventTarget();
  const { input, controls, send } = setup({ alive: true, spell: 'fireball' }, { orientation });
  send('pointerdown', 600, 300, { target: controls.layer });
  const yaw = input.yaw;
  orientation.dispatchEvent(new Event('change'));
  send('pointermove', 200, 400, { target: controls.layer });
  assert.equal(input.yaw, yaw);
  assert.equal(controls.look, null);
  controls.orientationQuery.removeEventListener('change', controls.onOrientationChange);
});

test('joystick survives a layer resize during the same drag without reversing or jumping', () => {
  const { controls, send } = setup({ alive: true, spell: 'fireball' });
  const finger = { target: controls.layer };
  send('pointerdown', 120, 460, finger);
  send('pointermove', 120, 430, finger);
  const before = controls.movement().forward;
  assert.ok(before > 0);
  controls.layer.clientWidth = 400;
  controls.layer.clientHeight = 0;
  controls.layer.getBoundingClientRect = () => ({ left: 10, top: 80, width: 400, height: 0 });
  send('pointermove', 120, 410, finger);
  assert.ok(controls.movement().forward > before, 'screen-space delta survives layout changes');
  assert.equal(controls.stickBase.style.top, undefined);
  send('pointercancel', 120, 410, finger);
  assert.equal(controls.movement().forward, 0);
});

test('opt-in mobile touch diagnostics report gesture state without intercepting controls', () => {
  const previousLocation = globalThis.location;
  globalThis.location = { search: '?touchDebug=1' };
  try {
    const { controls, send } = setup({ alive: true, spell: 'fireball' });
    assert.ok(controls.touchDebug, 'diagnostic readout is present only when requested');
    const finger = { target: controls.layer };
    send('pointerdown', 120, 430, finger);
    send('pointermove', 120, 380, finger);
    assert.ok(controls.movement().forward > 0.5);
    assert.match(controls.touchDebug.textContent, /held 1/);
    const raw = /raw F(-?\d+\.\d+)/.exec(controls.touchDebug.textContent);
    assert.ok(raw && Number(raw[1]) > 0.5, 'diagnostics show the actual nonzero movement strength');
    send('pointerup', 120, 380, finger);
    assert.equal(controls.movement().forward, 0);
    assert.match(controls.touchDebug.textContent, /held 0/);
  } finally {
    globalThis.location = previousLocation;
  }
});


test('View upward swipe zooms once without also toggling or turning; cancelled gestures do nothing',()=>{
 const p={alive:true,position:{x:0,z:0},operatingBallistaId:'siege'}, {controls,input,send}=setup(p), actions=[];
 controls.update(p,10,{snapshot:{bibyeBallista:{id:'siege',position:{x:0,z:0},mode:'MOBILE'}}});
 input.onAction=(...args)=>actions.push(args);const yaw=input.yaw,pitch=input.pitch;
 send('pointerdown',600,300,{action:'siegeView'});send('pointermove',602,250,{action:'siegeView'});
 assert.deepEqual(actions,[['siegeZoom',true]]);
 send('pointerup',602,250,{action:'siegeView'});assert.equal(actions.length,1);assert.equal(input.yaw,yaw);assert.equal(input.pitch,pitch);
 send('pointerdown',600,300,{action:'siegeView'});send('pointercancel',600,300,{action:'siegeView'});assert.equal(actions.length,1);
 send('pointerdown',600,300,{action:'siegeView'});controls.reset();send('pointerup',600,300,{action:'siegeView'});assert.equal(actions.length,1);
});

test('resizing the touch layer during a slow look cannot create an aim jump',()=>{
 const {input,controls,send}=setup({alive:true,spell:'fireball'});
 let rect={left:0,top:0,width:800,height:600};controls.layer.getBoundingClientRect=()=>rect;
 const pointer={target:controls.layer};send('pointerdown',600,300,pointer);send('pointermove',604,300,pointer);
 const before=input.yaw;rect={left:0,top:0,width:1000,height:650};send('pointermove',604,300,pointer);
 assert.equal(input.yaw,before);send('pointermove',600,300,pointer);assert.ok(Math.abs(input.yaw)<1e-9);
});

test('mounted ram Charge accepts independent stick and held button sources with hysteresis', () => {
  const p={alive:true,spell:'fireball',position:{x:0,y:0,z:3.1},operatingRamId:'ram'};
  const {controls,send}=setup(p),stick={target:controls.layer,pointerId:1},button={action:'sprint',pointerId:2};
  send('pointerdown',100,400,stick);send('pointermove',100,348,stick);
  assert.equal(controls.movement().sprint,true,'strong forward push charges alone');
  for(const y of [349,350,351,350,349]){send('pointermove',100,y,stick);assert.equal(controls.movement().sprint,true,'threshold noise retains charge');}
  send('pointerdown',50,180,button);send('pointermove',100,370,stick);
  assert.equal(controls.movement().sprint,true,'button holds charge after stick eases');
  send('pointermove',100,344,stick);send('pointerup',50,180,button);
  assert.equal(controls.movement().sprint,true,'stick holds charge after button release');
  send('pointermove',100,370,stick);assert.equal(controls.movement().sprint,false);
  send('pointerdown',50,180,button);send('pointerup',100,370,stick);
  assert.equal(controls.movement().sprint,true,'button charges without stick');
  send('pointercancel',50,180,button);assert.equal(controls.movement().sprint,false);
});

test('ram gestures clear across dismount, death and orientation; old pointers cannot restore Charge',()=>{
  for(const end of ['dismount','death','orientation']){
    const orientation=new EventTarget(),p={alive:true,spell:'fireball',position:{x:0,y:0,z:3.1},operatingRamId:'ram'};
    const {controls,send}=setup(p,{orientation}),stick={target:controls.layer};
    send('pointerdown',100,400,stick);send('pointermove',100,344,stick);
    send('pointerdown',50,180,{action:'sprint',pointerId:2});
    if(end==='orientation')orientation.dispatchEvent(new Event('change'));
    else controls.update({...p,alive:end!=='death',operatingRamId:null},10);
    send('pointermove',100,340,stick);
    assert.equal(controls.movement().sprint,false,end);
    assert.equal(controls.movement().forward,0,end);
  }
});

test('two held Charge pointers remain independent and ordinary on-foot Sprint keeps its threshold',()=>{
 const p={alive:true,spell:'fireball',position:{x:0,y:0,z:3.1},operatingRamId:'ram'};
 const {controls,send}=setup(p);
 send('pointerdown',50,180,{action:'sprint',pointerId:2});send('pointerdown',50,180,{action:'sprint',pointerId:3});
 send('pointercancel',50,180,{action:'sprint',pointerId:2});assert.equal(controls.movement().sprint,true);
 send('pointerup',50,180,{action:'sprint',pointerId:3});assert.equal(controls.movement().sprint,false);
 controls.update({...p,operatingRamId:null},10);const stick={target:controls.layer};
 send('pointerdown',100,400,stick);send('pointermove',100,347,stick);assert.equal(controls.movement().sprint,true);
 send('pointermove',100,350,stick);assert.equal(controls.movement().sprint,true,'on foot hysteresis holds near threshold');
 send('pointermove',100,354,stick);assert.equal(controls.movement().sprint,false,'easing below release threshold cancels sprint');
});

test('cancelled look or View fingers cancel precision view while ordinary finger release preserves it',()=>{
 const {controls,input,send}=setup({alive:true,spell:'fireball'});let cancelled=0;input.onAimCancelled=()=>cancelled++;
 const look={target:controls.layer};send('pointerdown',650,230,look);send('pointerup',660,230,look);assert.equal(cancelled,0);
 send('pointerdown',650,230,look);send('pointercancel',660,230,look);assert.equal(cancelled,1);
 send('lostpointercapture',660,230,look);assert.equal(cancelled,1);
 const prior=cancelled;send('pointerdown',650,230,{action:'attack',pointerId:3});send('pointercancel',660,230,{action:'attack',pointerId:3});assert.equal(cancelled,prior+1);assert.equal(input.attackHeld,false);
 controls.reset();assert.ok(cancelled>1);
});

test('Inspection flight uses held rise/descend, independent look, and clears interrupted gestures',()=>{
 const {controls,send,input,calls}=setup({alive:true,spell:'fireball'});
 controls.setInspectionFlight(true);
 send('pointerdown',650,300,{action:'crouch',pointerId:9});
 assert.equal(controls.movement().crouch,true);
 send('pointerdown',700,200,{action:'jump',pointerId:10});
 assert.equal(controls.movement().jump,true);
 send('pointercancel',650,300,{action:'crouch',pointerId:9});
 assert.equal(controls.movement().crouch,false);
 send('pointerup',700,200,{action:'jump',pointerId:10});
 assert.equal(controls.movement().jump,false,'flight rise has no jump pulse after release');
 controls.reset();assert.equal(controls.movement().crouch,false);
 controls.setInspectionFlight(false);
 send('pointerdown',650,300,{action:'crouch',pointerId:11});send('pointerup',650,300,{action:'crouch',pointerId:11});
 assert.equal(controls.movement().crouch,true,'ordinary crouch still toggles');
 assert.deepEqual(calls,[]);input.dispose();
});

test('mouse clicks on interface controls do not also attack while touch focus is active',()=>{
 const {input,calls}=setup({alive:true,spell:'fireball'});
 const event=new Event('mousedown');
 Object.defineProperties(event,{button:{value:0},target:{value:{closest:()=>({tagName:'BUTTON'})}}});
 document.dispatchEvent(event);assert.deepEqual(calls,[]);
 const canvas=new Event('mousedown');Object.defineProperties(canvas,{button:{value:0},target:{value:{closest:()=>null}}});
 document.dispatchEvent(canvas);assert.deepEqual(calls,[['attack',true]]);
 input.dispose();
});

test('Gale casts on press and shapes upward/downward during gather without leaking into look', () => {
  const {input,controls,calls,send}=setup({alive:true,spell:'gale',spellReadyAt:0});
  const modes=[];input.selectGaleMode=mode=>{modes.push(mode);return true;};
  let turns=0;input.turn=()=>turns++;
  send('pointerdown',600,300);
  assert.equal(controls.buttons.spell.querySelector('span').textContent, 'GALE');
  send('pointermove',602,262);
  assert.equal(controls.galeIndicator.classList.contains('active'), true);
  assert.equal(controls.galeBurstCapsule.classList.contains('selected'), true);
  assert.equal(controls.galeModeLabel.textContent, 'GALE · BURST');
  assert.equal(controls.buttons.spell.querySelector('span').textContent, 'GALE', 'button maintains compact label');

  send('pointermove',603,260);
  send('pointermove',600,300);
  assert.equal(controls.galeBurstCapsule.classList.contains('selected'), false);
  assert.equal(controls.galeSustainedCapsule.classList.contains('selected'), false);
  assert.equal(controls.galeModeLabel.textContent, 'GALE · BALANCED');

  send('pointermove',601,339);
  assert.equal(controls.galeSustainedCapsule.classList.contains('selected'), true);
  assert.equal(controls.galeModeLabel.textContent, 'GALE · SUSTAINED');

  send('pointerup',601,339);
  assert.equal(calls.filter(c=>c[0]==='cast').length,1);
  assert.deepEqual(modes,['burst','balanced','sustained']);
  assert.equal(turns,0);assert.equal(controls.galeGesture,null);
  assert.equal(controls.galeIndicator.classList.contains('active'), false);
});

test('cancelled Gale swipe clears ownership and a fresh tap keeps balanced casting',()=>{
  const {input,controls,calls,send}=setup({alive:true,spell:'gale',spellReadyAt:0});
  const modes=[];input.selectGaleMode=mode=>{modes.push(mode);return true;};
  send('pointerdown',600,300);send('pointercancel',600,300);
  assert.equal(controls.galeIndicator.classList.contains('active'), false);
  send('pointermove',600,240);assert.deepEqual(modes,[]);
  send('pointerdown',600,300,{pointerId:2});send('pointerup',600,300,{pointerId:2});
  assert.equal(calls.filter(c=>c[0]==='cast').length,2);
  assert.equal(controls.galeGesture,null);
});

test('Coreflagration equips with compact label CORE, coreflagration class, and casts on touch', () => {
  const {input,controls,calls,send}=setup({alive:true,spell:'coreflagration',spellReadyAt:0});
  assert.equal(controls.buttons.spell.dataset.spell, 'coreflagration');
  assert.equal(controls.buttons.spell.classList.contains('coreflagration'), true);
  assert.equal(controls.buttons.spell.querySelector('span').textContent, 'CORE');
  send('pointerdown',600,300);
  send('pointerup',600,300);
  assert.equal(calls.filter(c=>c[0]==='cast').length, 1);
});
test('touch siege Skill sends one authoritative command and leaves personal Ultimate alone',()=>{
 const {input,controls,calls,send}=setup({local:{alive:true,operatingRamId:'ram',position:{x:0,y:0,z:0}}});input.socket.send=m=>calls.push(m);
 controls.update({alive:true,operatingRamId:'ram',position:{x:0,y:0,z:0}},10,{snapshot:{soFistication:{id:'ram',skill:{id:'beatToThePunch',phase:'idle',readyAt:0}}}});
 assert.equal(controls.buttons.attack.dataset.icon,'ram');
 assert.equal(controls.buttons.siegeSkill.dataset.icon,'beatToThePunch');
 assert.equal(controls.buttons.siegeSkill.hidden,false);send('pointerdown',800,100,{action:'siegeSkill'});send('pointerup',800,100,{action:'siegeSkill'});
 assert.deepEqual(calls,[{type:'siegeSkill'}]);controls.reset();assert.equal(controls.held.size,0);
});

test('mobile Valkyrie requires intentional simultaneous holding of Dash and Ultimate; Ultimate alone never synthesizes Dash', () => {
  const flightPlayer = {
    alive: true,
    operatingFightFlightId: 'flight-1',
    ultimate: 'chivalry',
    prowess: 100,
    position: { x: 0, y: 0, z: 0 },
  };
  const flightMachine = {
    id: 'flight-1',
    health: 100,
    rotorHP: 100,
    grounded: false,
    terminalDive: null,
    terminalDiveSpent: false,
    flightCharge: 90,
    skill: { id: 'doNotStopMyAscension', phase: 'active', activeUntil: null },
  };
  const { input, controls, send } = setup(flightPlayer);
  input.mountedFlight = true;

  const flightEvents = [];
  input.flightDash = (down, source) => flightEvents.push(['dash', down, source]);
  input.flightUltimate = (down, source) => flightEvents.push(['ultimate', down, source]);

  // 1. Initial eligible state
  controls.update(flightPlayer, 10, { snapshot: { fightFlight: flightMachine } });
  assert.equal(controls.valkyrieEligible, true);
  flightMachine.skill.id='fireAwayImRightHere';
  controls.update(flightPlayer,10,{snapshot:{fightFlight:flightMachine}});
  assert.equal(controls.valkyrieEligible,false,'Fire Away no longer grants the terminal chord');
  flightMachine.skill.id='doNotStopMyAscension';
  controls.update(flightPlayer,10,{snapshot:{fightFlight:flightMachine}});
  assert.equal(controls.valkyrieEligible,true);

  // Press Ultimate touch button ALONE: MUST NOT synthesize Dash!
  send('pointerdown', 750, 400, { action: 'ultimate', pointerId: 42 });
  assert.deepEqual(flightEvents, [
    ['ultimate', true, 'touch:42'],
  ]);
  flightEvents.length = 0;

  // Press Dash touch button simultaneously with a second finger
  send('pointerdown', 650, 400, { action: 'dash', pointerId: 43 });
  assert.deepEqual(flightEvents, [
    ['dash', true, 'touch:43'],
  ]);
  flightEvents.length = 0;

  // 2. Release Dash before commitment: releases Dash while Ultimate stays held
  send('pointerup', 650, 400, { action: 'dash', pointerId: 43 });
  assert.deepEqual(flightEvents, [
    ['dash', false, 'touch:43'],
  ]);
  flightEvents.length = 0;

  // Release Ultimate
  send('pointerup', 750, 400, { action: 'ultimate', pointerId: 42 });
  assert.deepEqual(flightEvents, [
    ['ultimate', false, 'touch:42'],
  ]);
  flightEvents.length = 0;

  // 3. Pointer cancellation test
  send('pointerdown', 750, 400, { action: 'ultimate', pointerId: 44 });
  send('pointerdown', 650, 400, { action: 'dash', pointerId: 45 });
  flightEvents.length = 0;

  // Pointer cancel (e.g. system gesture / palm rejection)
  send('pointercancel', 750, 400, { action: 'ultimate', pointerId: 44 });
  assert.deepEqual(flightEvents, [
    ['ultimate', false, 'touch:44'],
  ]);
  flightEvents.length = 0;
  send('pointercancel', 650, 400, { action: 'dash', pointerId: 45 });
  assert.deepEqual(flightEvents, [
    ['dash', false, 'touch:45'],
  ]);
  flightEvents.length = 0;

  // 4. Pilot death while holding
  send('pointerdown', 750, 400, { action: 'ultimate', pointerId: 46 });
  send('pointerdown', 650, 400, { action: 'dash', pointerId: 47 });
  flightEvents.length = 0;

  flightPlayer.alive = false;
  controls.update(flightPlayer, 13, { snapshot: { fightFlight: flightMachine } });
  assert.ok(flightEvents.some(([act, down]) => act === 'dash' && down === false));
  assert.ok(flightEvents.some(([act, down]) => act === 'ultimate' && down === false));
  flightEvents.length = 0;

  // 5. Document hidden / focus loss test
  flightPlayer.alive = true;
  controls.update(flightPlayer, 14, { snapshot: { fightFlight: flightMachine } });
  send('pointerdown', 750, 400, { action: 'ultimate', pointerId: 48 });
  send('pointerdown', 650, 400, { action: 'dash', pointerId: 49 });
  flightEvents.length = 0;

  globalThis.document.hidden = true;
  globalThis.window.dispatchEvent(new Event('blur'));
  assert.ok(flightEvents.some(([act, down]) => act === 'dash' && down === false));
  assert.ok(flightEvents.some(([act, down]) => act === 'ultimate' && down === false));
  globalThis.document.hidden = false;
});

test('Fight-and-Flight discrete hop, continuous Rise and Lower, and multi-touch isolation', () => {
  const flightPlayer = {
    alive: true,
    operatingFightFlightId: 'flight-1',
    ultimate: 'sunder',
    prowess: 50,
    position: { x: 0, y: 0, z: 0 },
  };
  const flightMachine = {
    id: 'flight-1',
    health: 100,
    rotorHP: 100,
    grounded: true,
  };
  const { input, controls, send } = setup(flightPlayer);
  input.mountedFlight = true;
  let hopSent = 0;
  input.flightHop = () => { hopSent++; };

  controls.update(flightPlayer, 10, { snapshot: { fightFlight: flightMachine } });

  // 1. Tapping JUMP sends flightHop and does NOT latch jumpHeld
  send('pointerdown', 700, 400, { action: 'jump', pointerId: 10 });
  assert.equal(hopSent, 1);
  const mov1 = controls.movement();
  assert.equal(mov1.jump, false);
  send('pointerup', 700, 400, { action: 'jump', pointerId: 10 });

  // The spring-centered rail replaces both legacy Rise / Lower buttons.
  const rail = flightRailTarget(controls);
  send('pointerdown', 120, 120, { target: rail, pointerId: 11 });
  assert.equal(controls.movement().flightRise, true);
  assert.equal(controls.movement().flightLower, false);
  send('pointermove', 120, 170, { target: rail, pointerId: 11 });
  assert.equal(controls.movement().flightRise, false, 'center is neutral while held');
  send('pointermove', 120, 220, { target: rail, pointerId: 11 });
  assert.equal(controls.movement().flightLower, true);
  send('pointercancel', 120, 220, { target: rail, pointerId: 11 });
  assert.equal(controls.movement().flightLower, false, 'cancellation springs back to neutral');
  assert.equal(controls.flightRail.dataset.intent, 'neutral');

  // 4. Multi-touch on Sword/Attack: releasing one pointer does not cancel if another still holds
  const attacks = [];
  const origSetAttack = input.setAttack.bind(input);
  input.setAttack = (down, source) => { attacks.push([down, source]); origSetAttack(down, source); };
  send('pointerdown', 700, 500, { action: 'attack', pointerId: 21 });
  assert.deepEqual(attacks, [[true, 'touch:21']]);
  attacks.length = 0;

  send('pointerdown', 700, 500, { action: 'attack', pointerId: 22 });
  assert.deepEqual(attacks, [[true, 'touch:22']]);
  attacks.length = 0;

  // Release pointer 21: pointer 22 is still holding!
  send('pointerup', 700, 500, { action: 'attack', pointerId: 21 });
  assert.deepEqual(attacks, [[false, 'touch:21']]);
  // inputController still has touch:22 in attackSources, so attackHeld remains true!
  assert.equal(input.attackHeld, true);
  attacks.length = 0;

  // Release pointer 22: now all sources released
  send('pointerup', 700, 500, { action: 'attack', pointerId: 22 });
  assert.deepEqual(attacks, [[false, 'touch:22']]);
  assert.equal(input.attackHeld, false);
});

test('mobile MENU opens the arena pause through the runtime action, then releases focus',()=>{
  const {controls,input,send}=setup({alive:true,spell:'fireball'});
  const actions=[],focus=[];
  input.onAction=(...args)=>actions.push(args);
  input.releaseFocus=()=>focus.push('released');
  send('pointerdown',38,24,{action:'pause',pointerId:42});
  assert.deepEqual(actions,[],'do not pause on pointerdown');
  send('pointerup',38,24,{action:'pause',pointerId:42});
  assert.deepEqual(actions,[['pause',true]],'MENU invokes the exact arena pause action');
  assert.deepEqual(focus,['released']);
  controls.dispose();
});
test('cancelled MENU pointer cannot open pause and a subsequent tap still works',()=>{
  const {controls,input,send}=setup({alive:true,spell:'fireball'});
  let pauses=0;
  input.onAction=(action,down)=>{if(action==='pause'&&down)pauses++;};
  input.releaseFocus=()=>{};
  send('pointerdown',38,24,{action:'pause',pointerId:30});
  send('pointercancel',38,24,{action:'pause',pointerId:30});
  assert.equal(pauses,0);
  send('pointerdown',38,24,{action:'pause',pointerId:31});
  send('pointerup',38,24,{action:'pause',pointerId:31});
  assert.equal(pauses,1);
  controls.dispose();
});
test('mounted flight retains working independent climb, bolt, view, dash and pause controls',()=>{
  const p={alive:true,spell:'fireball',team:'ATTACKERS',position:{x:0,y:0,z:0},operatingFightFlightId:'machine'};
  const {controls,input,send}=setup(p);
  input.mountedFlight=true;input.touch=controls;
  const calls=[],actions=[];
  input.socket.send=m=>calls.push(m);
  input.onAction=(...args)=>actions.push(args);
  input.releaseFocus=()=>{};
  controls.update(p,10,{snapshot:{fightFlight:{id:'machine',health:250,rotorHP:100,grounded:false,ammo:14,skill:{phase:'idle',readyAt:0}}}});
  const rail=flightRailTarget(controls);
  send('pointerdown',120,120,{target:rail,pointerId:15});
  assert.equal(controls.movement().flightRise,true);
  assert.equal(input.movement().flightRise,true, 'Rise reaches the production InputController');
  send('pointerup',120,120,{target:rail,pointerId:15});
  assert.equal(input.movement().flightRise,false);
  send('pointerdown',600,300,{action:'siegeWeapon',pointerId:16});
  send('pointerup',600,300,{action:'siegeWeapon',pointerId:16});
  assert.ok(calls.some(x=>x.type==='fightFlightFire'&&x.down===true));
  assert.ok(calls.some(x=>x.type==='fightFlightFire'&&x.down===false));
  send('pointerdown',600,300,{action:'siegeView',pointerId:17});
  send('pointerup',600,300,{action:'siegeView',pointerId:17});
  assert.deepEqual(actions.filter(x=>x[0]==='siegeView'),[['siegeView',true]]);
  send('pointerdown',600,300,{action:'dash',pointerId:18});
  send('pointerup',600,300,{action:'dash',pointerId:18});
  assert.ok(calls.some(x=>x.type==='flightDash'&&x.down===true));
  assert.ok(calls.some(x=>x.type==='flightDash'&&x.down===false));
  send('pointerdown',38,24,{action:'pause',pointerId:19});
  send('pointerup',38,24,{action:'pause',pointerId:19});
  assert.ok(actions.some(x=>x[0]==='pause'));
  controls.dispose();
});

test('Bolt-to-Jump swipe adds one mounted Hop while the same finger keeps firing',()=>{
  const p={alive:true,spell:'fireball',position:{x:0,y:0,z:0},operatingFightFlightId:'flight'};
  const {controls,input,send}=setup(p);
  input.mountedFlight=true;input.touch=controls;
  const sent=[];input.socket.send=m=>sent.push(m);
  controls.update(p,10,{snapshot:{fightFlight:{id:'flight',health:250,rotorHP:100,grounded:false,ammo:18}}});
  // Physical element rectangle, not captured pointer target: the thumb slides
  // from the wide Bolt face into the Jump face directly above it.
  controls.buttons.jump.getBoundingClientRect=()=>({left:610,right:680,top:160,bottom:228});
  send('pointerdown',640,275,{action:'siegeWeapon',pointerId:75});
  assert.deepEqual(sent,[{type:'fightFlightFire',down:true}]);
  send('pointermove',645,245,{action:'siegeWeapon',pointerId:75});
  assert.equal(sent.some(x=>x.type==='flightHop'),false,'crossing empty gutter does not jump');
  send('pointermove',645,208,{action:'siegeWeapon',pointerId:75});
  send('pointermove',645,200,{action:'siegeWeapon',pointerId:75});
  assert.equal(sent.filter(x=>x.type==='flightHop').length,1,'crossing onto Jump triggers only one Hop');
  assert.equal(sent.some(x=>x.type==='fightFlightFire'&&x.down===false),false,
    'Bolt continues firing while thumb is on Jump');
  assert.equal(input.flightFireSources.size,1);
  assert.ok(controls.boltJumpTriggered.has(75));
  send('pointerup',645,200,{action:'siegeWeapon',pointerId:75});
  assert.deepEqual(sent.at(-1),{type:'fightFlightFire',down:false});
  assert.equal(controls.boltJumpTriggered.size,0);
  assert.equal(controls.buttons.jump.classList.contains('pressed'),false);
  controls.dispose();
});

test('Bolt swipe cancellation, a new pointer, and non-Bolt drags stay independent',()=>{
  const p={alive:true,spell:'fireball',position:{x:0,y:0,z:0},operatingFightFlightId:'flight'};
  const {controls,input,send}=setup(p);
  input.mountedFlight=true;input.touch=controls;
  const sent=[];input.socket.send=m=>sent.push(m);
  controls.update(p,10,{snapshot:{fightFlight:{id:'flight',health:250,rotorHP:100,grounded:false,ammo:18}}});
  controls.buttons.jump.getBoundingClientRect=()=>({left:610,right:680,top:160,bottom:228});
  send('pointerdown',640,280,{action:'attack',pointerId:20});
  send('pointermove',640,190,{action:'attack',pointerId:20});
  send('pointerup',640,190,{action:'attack',pointerId:20});
  assert.equal(sent.filter(x=>x.type==='flightHop').length,0,'Sword aim does not synthesize Hop');
  send('pointerdown',640,280,{action:'siegeWeapon',pointerId:21});
  send('pointermove',640,194,{action:'siegeWeapon',pointerId:21});
  send('pointercancel',640,194,{action:'siegeWeapon',pointerId:21});
  assert.equal(sent.filter(x=>x.type==='flightHop').length,1);
  assert.equal(input.flightFireSources.size,0,'pointercancel releases the repeater');
  send('pointerdown',640,280,{action:'siegeWeapon',pointerId:22});
  send('pointermove',640,194,{action:'siegeWeapon',pointerId:22});
  assert.equal(sent.filter(x=>x.type==='flightHop').length,2,'new finger can jump again');
  controls.reset();
  assert.equal(input.flightFireSources.size,0);
  assert.equal(controls.boltJumpTriggered.size,0);
  controls.dispose();
});

test('flight rail cannot retain input across mount loss, focus reset or another pointer', () => {
  const p = { alive: true, spell: 'fireball', position: {x:0,y:0,z:0}, operatingFightFlightId: 'flight' };
  const { input, controls, send } = setup(p);
  input.mountedFlight = true;
  input.touch = controls;
  controls.update(p, 10, { snapshot: { fightFlight: { id:'flight', health:250, rotorHP:100, grounded:true } } });
  const rail = flightRailTarget(controls);
  send('pointerdown',120,120,{target:rail,pointerId:51});
  send('pointerdown',120,220,{target:rail,pointerId:52});
  assert.equal(controls.movement().flightRise, true, 'second finger cannot seize flight rail');
  send('pointerup',120,220,{target:rail,pointerId:52});
  assert.equal(controls.movement().flightRise, true, 'unrelated lift cannot stop held rise');
  controls.reset();
  assert.equal(input.movement().flightRise, false);
  send('pointermove',120,120,{target:rail,pointerId:51});
  assert.equal(input.movement().flightRise,false,'old pointer cannot restore a cancelled climb');
  send('pointerdown',120,120,{target:rail,pointerId:53});
  controls.update({...p, operatingFightFlightId:null}, 10);
  input.mountedFlight = false;
  assert.equal(controls.movement().flightRise,false,'dismount clears flight gesture');
});


test('the existing joystick communicates charge approach without a second yellow sliding tab',()=>{
 const {controls,send}=setup({alive:true,spell:'fireball',position:{x:0,y:0,z:0}});
 const writes=[];
 controls.motionGuide.style.setProperty=(name,value)=>writes.push([name,value]);
 send('pointerdown',110,400,{target:controls.layer,pointerId:77});
 send('pointermove',110,350,{target:controls.layer,pointerId:77});
 assert.equal(controls.motionGuide.classList.contains('approaching'),true,
   'thumb near the rim indicates charge intent');
 assert.equal(controls.motionGuide.dataset.motion,'idle',
   'client thumb intent never claims authoritative Sprint');
 assert.equal(writes.some(([name])=>name==='--motion-push'),false,
   'the removed independent detent is never driven');
 send('pointermove',160,400,{target:controls.layer,pointerId:77});
 assert.equal(controls.motionGuide.classList.contains('approaching'),false,
   'sideways steering is not a forward push');
 send('pointerup',160,400,{target:controls.layer,pointerId:77});
 assert.equal(controls.motionGuide.classList.contains('approaching'),false);
 controls.dispose();
});

test('mounted Sheathe in Steel: visible only when legal, shows STEEL and WARD, hides on illegal spell or destroyed machine', () => {
  let castCalls = 0;
  let usePreparedCalls = [];
  const { controls, input, send } = setup({
    alive: true,
    spell: 'steel',
    spellReadyAt: 0,
    operatingFightFlightId: 'faf_1',
    position: { x: 0, y: 0, z: 0 },
  });
  input.cast = () => { castCalls++; };
  input.usePreparedSpell = (id) => { usePreparedCalls.push(id); };

  const snapshotAlive = {
    fightFlight: { id: 'faf_1', health: 250, mode: 'AIRBORNE', rotorHP: 100 },
  };

  // 1. Mounted with base steel: visible, STEEL label, ready
  controls.update({ alive: true, spell: 'steel', spellReadyAt: 0, operatingFightFlightId: 'faf_1' }, 10, { snapshot: snapshotAlive });
  assert.equal(controls.layer.classList.contains('mounted-steel-available'), true);
  assert.equal(controls.buttons.spell.hidden, false);
  assert.equal(controls.buttons.spell.querySelector('span').textContent, 'STEEL');
  assert.equal(controls.buttons.spell.classList.contains('fist'), false, 'Never shows FIST while mounted');
  assert.equal(controls.buttons.spell.classList.contains('cooling'), false);

  // Pressing spell invokes cast
  send('pointerdown', 10, 10, { target: controls.buttons.spell, pointerId: 80 });
  send('pointerup', 10, 10, { target: controls.buttons.spell, pointerId: 80 });
  assert.equal(castCalls, 1);

  // 2. Active ward: shows WARD and steel-ward-active pulse
  const snapshotWard = {
    fightFlight: { id: 'faf_1', health: 250, mode: 'AIRBORNE', rotorHP: 100, siegeSteel: { state: 'active', protectionUntil: 15 } },
  };
  controls.update({ alive: true, spell: 'steel', spellReadyAt: 20, operatingFightFlightId: 'faf_1' }, 10, { snapshot: snapshotWard });
  assert.equal(controls.buttons.spell.classList.contains('steel-ward-active'), true);
  assert.equal(controls.buttons.spell.querySelector('span').textContent, 'WARD');
  assert.equal(controls.buttons.spell.getAttribute('aria-disabled'), 'true');

  // 3. Cooling state: shows STEEL with cooldown timer
  controls.update({ alive: true, spell: 'steel', spellReadyAt: 14.5, operatingFightFlightId: 'faf_1' }, 10, { snapshot: snapshotAlive });
  assert.equal(controls.buttons.spell.classList.contains('cooling'), true);
  assert.equal(controls.buttons.spell.classList.contains('steel-ward-active'), false);
  assert.equal(controls.buttons.spell.querySelector('span').textContent, 'STEEL');
  assert.equal(controls.buttons.spell.querySelector('.touch-timer').textContent, '5');

  // 4. Machine destroyed: hides spell button
  const snapshotDestroyed = {
    fightFlight: { id: 'faf_1', health: 0, mode: 'DESTROYED', rotorHP: 0 },
  };
  controls.update({ alive: true, spell: 'steel', spellReadyAt: 0, operatingFightFlightId: 'faf_1' }, 10, { snapshot: snapshotDestroyed });
  assert.equal(controls.layer.classList.contains('mounted-steel-available'), false);
  assert.equal(controls.buttons.spell.hidden, true);

  // 5. Mounted with Fireball (illegal mounted spell): hidden
  controls.update({ alive: true, spell: 'fireball', spellReadyAt: 0, operatingFightFlightId: 'faf_1' }, 10, { snapshot: snapshotAlive });
  assert.equal(controls.layer.classList.contains('mounted-steel-available'), false);
  assert.equal(controls.buttons.spell.hidden, true);

  // 6. Chivalry prepared spells containing steel: exposed and casts steel on tap
  const chivalryState = {
    alive: true,
    spell: 'fireball',
    ultimate: 'chivalry',
    ultimateState: { id: 'chivalry', phase: 'active', until: 30 },
    preparedSpells: ['fireball', 'steel', 'gale'],
    operatingFightFlightId: 'faf_1',
  };
  controls.update(chivalryState, 10, { snapshot: snapshotAlive });
  assert.equal(controls.layer.classList.contains('mounted-steel-available'), true);
  assert.equal(controls.buttons.spell.hidden, false);
  assert.equal(controls.buttons.spell.querySelector('span').textContent, 'STEEL');

  send('pointerdown', 10, 10, { target: controls.buttons.spell, pointerId: 81 });
  send('pointerup', 10, 10, { target: controls.buttons.spell, pointerId: 81 });
  assert.deepEqual(usePreparedCalls, ['steel']);
});

test('Flight input safety: slider release, pointer cancellation, and lost pointer capture neutralize ascent immediately and call onInputsReleased', () => {
  const p = { alive: true, spell: 'steel', position: { x: 0, y: 0, z: 0 }, operatingFightFlightId: 'faf_safety' };
  const { input, controls, send } = setup(p);
  input.mountedFlight = true;
  input.touch = controls;
  let releasedCalls = 0;
  input.onInputsReleased = () => { releasedCalls++; };

  controls.update(p, 10, {
    snapshot: { fightFlight: { id: 'faf_safety', health: 250, rotorHP: 100, grounded: false, ammo: 18 } }
  });
  const rail = flightRailTarget(controls);

  // 1. Slider release: hold Rise, then pointerup
  send('pointerdown', 120, 120, { target: rail, pointerId: 101 });
  assert.equal(controls.movement().flightRise, true);
  assert.equal(controls.flightRail.dataset.intent, 'rise');

  send('pointerup', 120, 120, { target: rail, pointerId: 101 });
  assert.equal(controls.movement().flightRise, false, 'slider release immediately clears flightRise');
  assert.equal(controls.flightRail.dataset.intent, 'neutral');
  assert.equal(releasedCalls, 1, 'slider release invokes onInputsReleased');

  // 2. Pointer cancellation: hold Rise, then pointercancel
  send('pointerdown', 120, 120, { target: rail, pointerId: 102 });
  assert.equal(controls.movement().flightRise, true);
  assert.equal(controls.flightRail.dataset.intent, 'rise');

  send('pointercancel', 120, 120, { target: rail, pointerId: 102 });
  assert.equal(controls.movement().flightRise, false, 'pointercancel immediately clears flightRise');
  assert.equal(controls.flightRail.dataset.intent, 'neutral');
  assert.equal(releasedCalls, 2, 'pointer cancellation invokes onInputsReleased');

  // 3. Lost pointer capture: hold Rise, then lostpointercapture
  send('pointerdown', 120, 120, { target: rail, pointerId: 103 });
  assert.equal(controls.movement().flightRise, true);
  assert.equal(controls.flightRail.dataset.intent, 'rise');

  send('lostpointercapture', 120, 120, { target: rail, pointerId: 103 });
  assert.equal(controls.movement().flightRise, false, 'lostpointercapture immediately clears flightRise');
  assert.equal(controls.flightRail.dataset.intent, 'neutral');
  assert.equal(releasedCalls, 3, 'lost pointer capture invokes onInputsReleased');
});

test('Practice Tools cancels held vehicle gestures without an operate, reset or eject command',()=>{
 for(const field of ['operatingFightFlightId','operatingBallistaId','operatingRamId']){
  const p={alive:true,spell:'steel',position:{x:0,y:0,z:0},[field]:'machine'};
  const {controls,input,send}=setup(p);input.touch=controls;controls.buttons.practiceTools.hidden=false;
  input.mountedFlight=field==='operatingFightFlightId';input.mountedRam=field==='operatingRamId';
  const messages=[];input.socket.send=m=>messages.push(m);
  let opened=0;input.onAction=(action)=>{if(action==='practiceTools')opened++;};
  send('pointerdown',600,300,{action:'interact',pointerId:91});
  messages.length=0;
  send('pointerdown',30,78,{action:'practiceTools',pointerId:92});
  send('pointerup',30,78,{action:'practiceTools',pointerId:92});
  assert.equal(opened,1);assert.equal(p[field],'machine');
  assert.equal(messages.some(m=>m.type==='siegeOperate'||m.type.startsWith('practice')),false);
  assert.equal(messages.some(m=>m.type==='flightEject'&&!m.cancel),false,'held Eject cancels rather than releasing into ejection');
  send('pointerup',600,300,{action:'interact',pointerId:91});
  assert.equal(messages.some(m=>m.type==='flightEject'&&!m.cancel),false,'stale lift cannot eject from inside menu');
  controls.dispose();
 }
});

test('Flight Dash sends on touch-down, remains held off-button, and releases on lift',()=>{
 const p={alive:true,spell:'steel',prowess:100,position:{x:0,y:0,z:0},operatingFightFlightId:'f'};
 const {input,controls,send}=setup(p);
 input.mountedFlight=true;input.touch=controls;
 const sent=[];input.socket.send=packet=>sent.push(packet);
 controls.update(p,10,{snapshot:{fightFlight:{id:'f',health:250,rotorHP:100,grounded:false}}});
 send('pointerdown',710,205,{action:'dash',pointerId:71});
 assert.deepEqual(sent,[{type:'flightDash',down:true}],
   'a ready mounted Dash begins on the initial touch, without waiting for move/up');
 assert.equal(input.flightDashSources.has('touch:71'),true);
 send('pointermove',530,110,{target:controls.layer,pointerId:71});
 assert.deepEqual(sent,[{type:'flightDash',down:true}],
   'sliding the same holding finger away maintains Dash without a second request');
 assert.equal(input.flightDashSources.has('touch:71'),true);
 send('pointerup',530,110,{target:controls.layer,pointerId:71});
 assert.deepEqual(sent,[{type:'flightDash',down:true},{type:'flightDash',down:false}]);
 assert.equal(input.flightDashSources.size,0);
 controls.dispose();
});

test('sliding an existing finger onto Dash never activates it; a fresh tap does',()=>{
 for(const mounted of [false,true]){
  const p={alive:true,spell:'fireball',prowess:100,position:{x:0,y:0,z:0},
    ...(mounted?{operatingFightFlightId:'f'}:{})};
  const {input,controls,calls,send}=setup(p);
  input.touch=controls;
  const sent=[];
  if(mounted){
   input.mountedFlight=true;
   input.socket.send=packet=>sent.push(packet);
   controls.update(p,10,{snapshot:{fightFlight:{id:'f',health:250,rotorHP:100,grounded:false}}});
  }
  // A gesture started in the look region belongs to look even when its
  // physical path crosses the Dash button.
  send('pointerdown',525,250,{target:controls.layer,pointerId:80});
  send('pointermove',710,205,{target:controls.buttons.dash,pointerId:80});
  assert.equal(sent.length,0);
  assert.equal(calls.filter(([action])=>action==='dash').length,0);
  // Even a duplicate pointerdown with that already-owned ID must not steal
  // ownership (some embedded touch browsers can synthesize duplicate events).
  send('pointerdown',710,205,{action:'dash',pointerId:80});
  assert.equal(sent.length,0);
  assert.equal(calls.filter(([action])=>action==='dash').length,0);
  send('pointerup',710,205,{target:controls.layer,pointerId:80});
  send('pointerdown',710,205,{action:'dash',pointerId:81});
  if(mounted){
   assert.deepEqual(sent,[{type:'flightDash',down:true}]);
   send('pointercancel',750,210,{target:controls.layer,pointerId:81});
   assert.deepEqual(sent,[{type:'flightDash',down:true},{type:'flightDash',down:false}]);
  }else{
   assert.equal(calls.filter(([action])=>action==='dash').length,1,
     'ordinary Spellblade Dash also executes on press rather than release');
   send('pointerup',750,210,{target:controls.layer,pointerId:81});
   assert.equal(calls.filter(([action])=>action==='dash').length,1);
  }
  controls.dispose();
 }
});

test('held flight Dash aims off its button without releasing propulsion or another finger',()=>{
 const p={alive:true,spell:'steel',prowess:100,position:{x:0,y:0,z:0},operatingFightFlightId:'f'};
 const {input,controls,send}=setup(p);input.mountedFlight=true;input.touch=controls;
 const messages=[];input.socket.send=m=>messages.push(m);
 controls.update(p,10,{snapshot:{fightFlight:{id:'f',health:250,rotorHP:100,grounded:false}}});
 send('pointerdown',720,200,{action:'dash',pointerId:61});
 send('pointermove',560,120,{action:'dash',target:controls.layer,pointerId:61});
 assert.ok(input.yaw>0&&input.pitch>0,'the captured Dash finger can turn and look upward off button');
 assert.equal(input.flightDashSources.has('touch:61'),true);
 send('pointerdown',700,300,{action:'siegeWeapon',pointerId:62});
 send('pointercancel',560,120,{action:'dash',target:controls.layer,pointerId:61});
 assert.equal(input.flightDashSources.size,0);
 assert.equal(input.flightFireSources.has('touch:62'),true,'canceling Dash leaves a different held Bolt alone');
 const yaw=input.yaw;send('pointermove',450,80,{action:'dash',target:controls.layer,pointerId:61});
 assert.equal(input.yaw,yaw,'canceled pointer cannot keep steering');
 send('pointerup',700,300,{action:'siegeWeapon',pointerId:62});
 assert.equal(messages.filter(m=>m.type==='flightDash'&&m.down).length,1);
 assert.equal(messages.filter(m=>m.type==='flightDash'&&!m.down).length,1);
 controls.dispose();
});

test('Ram and Flight mounts work with no Ballista in the world',()=>{
 for(const [kind,property]of [['Ram','operatingRamId'],['Flight','operatingFightFlightId']]){
  const p={alive:true,spell:'fireball',position:{x:0,y:0,z:0},[property]:'mounted-machine'};
  const {controls}=setup(p);
  assert.doesNotThrow(()=>controls.update(p,10,{snapshot:{
    bibyeBallista:null,
    ...(kind==='Flight'?{fightFlight:{id:'mounted-machine',rotorHP:100,health:250,grounded:true}}:{})
  }}),kind+' needs no Ballista');
  assert.equal(controls.buttons.deploy.hidden,true,kind+' cannot show Ballista Deploy');
  controls.dispose();
 }
});

test('Bi-Bye-llista real pointer events keep the one Skill control and server-confirmed mode icons',()=>{
 const p={alive:true,spell:'fireball',operatingBallistaId:'siege',position:{x:0,y:0,z:0}};
 const {controls,input,send}=setup(p);
 const messages=[];input.socket.send=m=>messages.push(m);input.mountedBallista=true;
 const b={id:'siege',position:{x:0,z:0},health:500,mode:'MOBILE',weaponFocus:'UPPER',
  mainBoltLoaded:true,state:'LOADED',smallBoltReadyAt:0,coupling:'INDEPENDENT',
  skill:{id:'boltToTheOccasion',phase:'idle',readyAt:0}};
 const update=()=>controls.update(p,10,{snapshot:{bibyeBallista:b}});
 update();
 assert.equal(controls.layer.classList.contains('touch-ballista'),true);
 assert.equal(controls.buttons.attack.dataset.icon,'boltI');
 assert.equal(controls.buttons.deploy.dataset.icon,'boltII');
 assert.equal(controls.buttons.deploy.querySelector('span').textContent,'HEAVY');
 assert.equal(controls.buttons.siegeSkill.dataset.icon,'boltToTheOccasion');
 send('pointerdown',550,100,{action:'deploy',pointerId:81});
 send('pointerup',550,100,{action:'deploy',pointerId:81});
 assert.deepEqual(messages.pop(),{type:'bibyeToggleDeploy'});
 assert.equal(controls.buttons.deploy.querySelector('span').textContent,'HEAVY','a local tap cannot claim deployment');
 b.mode='DEPLOYING';update();
 assert.equal(controls.buttons.deploy.getAttribute('aria-disabled'),'true');
 const before=messages.length;
 send('pointerdown',550,100,{action:'deploy',pointerId:82});
 send('pointerup',550,100,{action:'deploy',pointerId:82});
 assert.equal(messages.length,before,'transitional input is not sent');
 b.mode='DEPLOYED';update();
 assert.equal(controls.buttons.attack.dataset.icon,'boltI');
 assert.equal(controls.buttons.siegeBoth.hidden,false,'UPPER exposes ordinary coupled volley');
 assert.equal(controls.buttons.siegeBoth.dataset.volley,'coupled');
 send('pointerdown',550,100,{action:'siegeBoth',pointerId:80});
 send('pointerup',550,100,{action:'siegeBoth',pointerId:80});
 assert.equal(messages.pop().type,'bibyeCoupledFire');
 b.weaponFocus='MAIN';update();
 assert.equal(controls.buttons.attack.dataset.icon,'boltBoth','MAIN changes the primary face, not its action');
 assert.equal(controls.buttons.attack.querySelector('span').textContent,'BOTH');
 assert.equal(controls.buttons.siegeBoth.hidden,true);
 b.weaponFocus='UPPER';update();
 assert.equal(controls.buttons.deploy.dataset.icon,'ballistaWheel');
 assert.equal(controls.buttons.deploy.querySelector('span').textContent,'MOBILE');
 assert.equal(controls.buttons.siegeWeapon.hidden,false);
 send('pointerdown',550,100,{action:'siegeWeapon',pointerId:83});
 send('pointerup',550,100,{action:'siegeWeapon',pointerId:83});
 assert.deepEqual(messages.pop(),{type:'bibyeWeaponFocus'});
 send('pointerdown',550,100,{action:'siegeSkill',pointerId:84});
 send('pointerup',550,100,{action:'siegeSkill',pointerId:84});
 assert.deepEqual(messages.pop(),{type:'siegeSkill'});
 assert.equal(controls.buttons.siegeSkill.dataset.icon,'boltToTheOccasion','tap alone does not prime UI');
 b.skill.phase='primed';update();
 assert.equal(controls.buttons.siegeSkill.dataset.icon,'boltII');
 assert.equal(controls.buttons.siegeBoth.dataset.icon,'boltBoth');
 assert.equal(controls.buttons.siegeBoth.hidden,false);
 send('pointerdown',550,100,{action:'siegeBoth',pointerId:85});
 send('pointerup',550,100,{action:'siegeBoth',pointerId:85});
 assert.deepEqual(messages.pop(),{type:'bibyeCombinedFire'});
 b.skill.boltIReleasedAt=10;update();
 assert.equal(controls.buttons.siegeBoth.hidden,true,'inter-shot preparation blocks BOTH');
 assert.equal(controls.buttons.siegeSkill.dataset.icon,'boltToTheOccasion');
 b.skill.id='coldHowTouching';b.skill.phase='idle';update();
 assert.equal(controls.buttons.siegeSkill.dataset.icon,'frostBolt');
 // Cold strengthens Bolt I, but it does not disable the independent ordinary
 // coupled mechanism. Keep the mobile carousel matched to the server command.
 assert.equal(controls.buttons.siegeBoth.hidden,false);
 assert.equal(controls.buttons.siegeBoth.dataset.volley,'coupled');
 send('pointerdown',550,100,{action:'siegeBoth',pointerId:86});
 send('pointerup',550,100,{action:'siegeBoth',pointerId:86});
 const coldCoupled=messages.pop();
 assert.equal(coldCoupled.type,'bibyeCoupledFire');
 assert.ok(Number.isFinite(coldCoupled.yaw)&&Number.isFinite(coldCoupled.pitch),
   'Cold preserves the actual coupled command aim, not just its action name');
});

test('ram Raise/Lower hold pitch; swiping outward changes ONLY that pointer to lift',()=>{
  const p={alive:true,spell:'fireball',position:{x:0,y:0,z:0},operatingRamId:'ram'};
  const {input,controls,send}=setup(p);input.mountedRam=true;input.touch=controls;
  controls.update(p,10,{snapshot:{soFistication:{id:'ram',health:1400,
    components:{Fist:{health:500}},skill:{id:'beatToThePunch',phase:'idle',readyAt:0}}}});
  send('pointerdown',650,240,{action:'jump',pointerId:110});
  let state=input.movement();
  assert.equal(state.ramPitchUp,true);
  assert.equal(state.ramRaise,false);
  assert.equal(state.jump,false,'Raise cannot become a personal Hop');
  send('pointermove',650,220,{target:controls.layer,pointerId:110});
  assert.equal(input.movement().ramPitchUp,true,'small drift keeps pitch');
  send('pointermove',650,165,{target:controls.layer,pointerId:110});
  state=input.movement();
  assert.equal(state.ramRaise,true,'outward swipe lifts upper assembly');
  assert.equal(state.ramPitchUp,false);
  send('pointermove',720,95,{target:controls.buttons.interact,pointerId:110});
  assert.equal(input.movement().ramRaise,true,'off-button holding keeps original pointer');
  send('pointerup',720,95,{target:controls.layer,pointerId:110});
  assert.equal(input.movement().ramRaise,false);
  assert.equal(input.movement().ramPitchUp,false);
  send('pointerdown',650,240,{action:'crouch',pointerId:111});
  assert.equal(input.movement().ramPitchDown,true);
  assert.equal(input.movement().crouch,false);
  send('pointermove',650,305,{target:controls.layer,pointerId:111});
  assert.equal(input.movement().ramLower,true);
  assert.equal(input.movement().ramPitchDown,false);
  send('pointercancel',650,305,{target:controls.layer,pointerId:111});
  assert.equal(input.movement().ramLower,false);
  controls.dispose();
});

test('ram simultaneous hydraulic fingers remain independent; reset releases both',()=>{
  const p={alive:true,spell:'fireball',position:{x:0,y:0,z:0},operatingRamId:'ram'};
  const {input,controls,send}=setup(p);input.mountedRam=true;input.touch=controls;
  send('pointerdown',620,200,{action:'jump',pointerId:120});
  send('pointerdown',630,340,{action:'crouch',pointerId:121});
  assert.equal(input.movement().ramPitchUp,true);
  assert.equal(input.movement().ramPitchDown,true);
  send('pointermove',620,155,{target:controls.layer,pointerId:120});
  assert.equal(input.movement().ramRaise,true);
  assert.equal(input.movement().ramPitchDown,true);
  send('pointerup',630,340,{target:controls.layer,pointerId:121});
  assert.equal(input.movement().ramPitchDown,false);
  assert.equal(input.movement().ramRaise,true);
  controls.reset();
  assert.equal(input.movement().ramRaise,false);
  assert.equal(input.movement().ramPitchUp,false);
  controls.dispose();
});

test('overlapping customized Leave never steals a Raise press or ejects the operator',()=>{
  const p={alive:true,spell:'fireball',position:{x:0,y:0,z:0},operatingRamId:'ram'};
  const {input,controls,send}=setup(p);input.mountedRam=true;input.touch=controls;
  const messages=[];input.socket.send=m=>messages.push(m);
  controls.buttons.jump.getBoundingClientRect=()=>({left:580,right:690,top:150,bottom:290});
  controls.buttons.crouch.getBoundingClientRect=()=>({left:580,right:690,top:310,bottom:430});
  // The topmost DOM element is the misplaced Leave button, but the finger
  // is physically inside Raise's customized rectangle.
  send('pointerdown',630,220,{action:'interact',pointerId:130});
  assert.equal(input.movement().ramPitchUp,true);
  assert.equal(input.movement().jump,false);
  send('pointermove',630,170,{action:'interact',pointerId:130,target:controls.layer});
  assert.equal(input.movement().ramRaise,true);
  send('pointerup',630,170,{action:'interact',pointerId:130,target:controls.layer});
  assert.equal(input.movement().ramRaise,false);
  assert.equal(messages.some(m=>m.type==='siegeOperate'),false,'Raise cannot dismount');
  controls.dispose();
});

test('ram sliding over Raise/Lower from a look gesture never acquires either hydraulic control',()=>{
 const p={alive:true,spell:'fireball',position:{x:0,y:0,z:0},operatingRamId:'ram'};
 const {controls,input,send}=setup(p);
 input.mountedRam=true;input.touch=controls;
 controls.update(p,10,{snapshot:{soFistication:{id:'ram',health:1400,
   components:{Fist:{health:500}},skill:{id:'beatToThePunch',phase:'idle',readyAt:0}}}});
 send('pointerdown',550,250,{target:controls.layer,pointerId:112});
 send('pointermove',650,175,{target:controls.buttons.jump,pointerId:112});
 assert.equal(input.movement().ramRaise,false);
 assert.equal(input.movement().ramPitchUp,false);
 assert.equal(input.movement().crouch,false);
 send('pointerup',650,175,{target:controls.layer,pointerId:112});
 controls.dispose();
});

test('one customized charge stick expands bidirectionally only for actual Beat authorization',()=>{
 const p={alive:true,spell:'fireball',position:{x:0,y:0,z:0},operatingRamId:'ram'};
 const {controls,input,send}=setup(p);input.mountedRam=true;input.touch=controls;
 const snapshot=available=>({soFistication:{id:'ram',health:1400,pressure:47,
   drivePressure:47,reverseChargeAvailable:available,charging:available,
   chargeDirection:available?-1:0,components:{Fist:{health:500}},
   skill:{id:'beatToThePunch',phase:available?'primed':'cooldown',readyAt:0}}});
 controls.update(p,10,{snapshot:snapshot(false)});
 assert.equal(controls.stickBase.classList.contains('reverse-charge-available'),false);
 controls.update(p,10,{snapshot:snapshot(true)});
 assert.equal(controls.stickBase.classList.contains('reverse-charge-available'),true);
 assert.equal(controls.stickShell.getAttribute('viewBox'),'0 0 112 212');
 send('pointerdown',120,400,{target:controls.layer,pointerId:137});
 send('pointermove',120,480,{target:controls.layer,pointerId:137});
 assert.ok(input.movement().forward<-.9,'the existing stick maps its lower channel to reverse');
 assert.equal(input.movement().sprint,true,'Skill unlocks actual backward charging input');
 controls.update(p,11,{snapshot:snapshot(false)});
 assert.equal(controls.stickBase.classList.contains('reverse-charge-available'),false);
 assert.equal(controls.stickShell.getAttribute('viewBox'),'0 0 112 162');
 assert.equal(input.movement().sprint,false,
   'expiration immediately withdraws reverse charge without a new finger event');
 assert.ok(input.movement().forward<0,'regular slow reverse remains available');
 send('pointerup',120,480,{target:controls.layer,pointerId:137});
 assert.equal(input.movement().forward,0);
 controls.dispose();
});

function valkyrieFlightFixture(){
 const p={alive:true,operatingFightFlightId:'flight-rune',ultimate:'chivalry',
   prowess:100,position:{x:0,y:4,z:0}};
 const m={id:'flight-rune',health:250,rotorHP:100,grounded:false,
   terminalDive:null,terminalDiveSpent:false,flightCharge:90,
   skill:{id:'doNotStopMyAscension',phase:'active',activeUntil:100}};
 const env=setup(p);
 env.input.mountedFlight=true;env.input.touch=env.controls;
 env.controls.layer.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
 const positions={
  jump:[718,420],ultimate:[718,340],dash:[636,420],siegeSkill:[636,340],
 };
 for(const [action,[x,y]]of Object.entries(positions))
  env.controls.buttons[action].getBoundingClientRect=()=>({
   left:x-28,top:y-28,width:56,height:56,right:x+28,bottom:y+28});
 const update=()=>env.controls.update(p,10,{snapshot:{fightFlight:m}});
 update();
 return {...env,p,m,positions,update};
}

test('Dagaz overlays ACTUAL Jump → Chivalry → Dash → Ascension buttons and a CLOSED halo',()=>{
 const e=valkyrieFlightFixture();
 assert.equal(e.controls.valkyrieEligible,true);
 assert.equal(e.controls.valkyrieStencil.hidden,false);
 assert.equal(e.controls.valkyrieStencil.classList.contains('ready'),true);
 const points=e.controls.valkyrieGeometry?.points;
 assert.deepEqual(points.slice(0,5),[
  [718,420],[718,340],[636,420],[636,340],[718,420]]);
 assert.equal(points.length,18,'five rune waypoints and a full halo loop');
 assert.ok(Math.hypot(points[5][0]-points.at(-1)[0],
   points[5][1]-points.at(-1)[1])<1e-5);
 assert.equal(e.controls.valkyrieStencil.querySelector('svg').getAttribute('viewBox'),'0 0 800 600');
 e.controls.dispose();
});

test('one REAL continuous Dagaz pointer draws all stages and sends exactly one terminal command',()=>{
 const e=valkyrieFlightFixture();
 const sent=[];e.input.socket.send=message=>sent.push(message);
 const points=e.controls.valkyrieGeometry.points;
 e.send('pointerdown',points[0][0],points[0][1],{action:'jump',pointerId:243});
 assert.ok(e.controls.ritual,'first touch is captured at the actual Jump button');
 assert.equal(e.controls.held.size,0,'rune does not also press an ordinary button');
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  for(const t of [.2,.4,.6,.8,1]){
   e.send('pointermove',a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,
     {target:e.controls.layer,pointerId:243});
  }
  assert.equal(e.controls.ritual?.index,i,'checkpoint '+i+' reached');
 }
 assert.equal(e.controls.ritual.completed,true);
 assert.equal(e.controls.valkyrieStencil.classList.contains('complete'),true);
 assert.deepEqual(sent,[{type:'flightTerminalRitual'}],
   'no underlying Jump, Dash, Ultimate or Skill action may fire during the rune');
 e.send('pointerup',points.at(-1)[0],points.at(-1)[1],{
   target:e.controls.layer,pointerId:243});
 assert.equal(e.controls.ritual,null);
 assert.deepEqual(sent,[{type:'flightTerminalRitual'}],'release does not duplicate activation');
 e.controls.dispose();
});

test('unequipped/uncosted rune stays faint and cannot steal ordinary Jump',()=>{
 const e=valkyrieFlightFixture();
 const sent=[];e.input.socket.send=message=>sent.push(message);
 e.m.skill.phase='idle';e.update();
 assert.equal(e.controls.valkyrieEligible,false);
 assert.equal(e.controls.valkyrieStencil.hidden,false,'equipped Ascension reveals faint guide');
 assert.equal(e.controls.valkyrieStencil.classList.contains('unready'),true);
 e.send('pointerdown',718,420,{action:'jump',pointerId:245});
 assert.ok(e.controls.ritual,'visible unready guide accepts a drawn trace');
 assert.deepEqual(sent,[],'even an unready preview does not send terminal commands');
 e.send('pointerup',718,420,{action:'jump',pointerId:245});
 assert.deepEqual(sent,[{type:'flightHop'}],'ordinary short Jump is preserved');
 e.m.skill.id='fireAwayImRightHere';e.update();
 assert.equal(e.controls.valkyrieStencil.hidden,true,'other Skills have no Valkyrie guide');
 e.controls.dispose();
});

test('button relocation reprojects Dagaz and aborts stale incomplete traces safely',()=>{
 const e=valkyrieFlightFixture(),sent=[];
 e.input.socket.send=m=>sent.push(m);
 e.send('pointerdown',718,420,{action:'jump',pointerId:251});
 assert.ok(e.controls.ritual);
 // The left-handed user moves only Jump in the Flight editor.
 e.controls.buttons.jump.getBoundingClientRect=()=>({
   left:44,top:366,width:56,height:56,right:100,bottom:422});
 e.controls.applyLayout(e.controls.layouts);
 assert.equal(e.controls.ritual,null,'moving the buttons must cancel a stale gesture');
 assert.deepEqual(e.controls.valkyrieGeometry.points[0],[72,394]);
 assert.deepEqual(e.controls.valkyrieGeometry.points[1],[718,340],
   'other controls keep their actual positions');
 e.send('pointerup',718,420,{target:e.controls.layer,pointerId:251});
 assert.equal(sent.some(m=>m.type==='flightTerminalRitual'),false);
 e.controls.dispose();
});

test('a brief actual Jump tap remains a Jump even while the eligible rune is visible',()=>{
 const e=valkyrieFlightFixture(),sent=[];
 e.input.socket.send=m=>sent.push(m);
 e.send('pointerdown',718,420,{action:'jump',pointerId:248});
 e.send('pointerup',718,420,{action:'jump',pointerId:248});
 assert.deepEqual(sent,[{type:'flightHop'}]);
 e.controls.dispose();
});

test('visible but unready Dagaz visibly tracks every part of a human swipe without spending Chivalry',()=>{
 const e=valkyrieFlightFixture(),sent=[];e.input.socket.send=m=>sent.push(m);
 e.m.skill.phase='idle';e.p.prowess=45;e.update();
 const points=e.controls.valkyrieGeometry.points;
 e.send('pointerdown',points[0][0],points[0][1],{action:'jump',pointerId:302});
 assert.ok(e.controls.ritual,'tracing must not require having already activated Ascension');
 let previous=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  // A real finger does not hit every waypoint with pixel-perfect accuracy.
  for(const t of [.2,.43,.72,1]){
   const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
   const offset=t===1?0:4;
   e.send('pointermove',a[0]+dx*t-dy/len*offset,
    a[1]+dy*t+dx/len*offset,{pointerId:302,target:e.controls.layer});
  }
  const progress=Number(e.controls.valkyrieInk.style.strokeDasharray.split(' ')[0]);
  assert.ok(progress>previous,'stroke must illuminate continuously at checkpoint '+i);
  assert.match(e.controls.valkyrieStatus.textContent,/TRACE|CHIVALRY|ASCENSION/);
  previous=progress;
 }
 assert.equal(e.controls.ritual.completed,true,'the complete gesture may be drawn as a preview');
 assert.equal(previous,1);
 assert.deepEqual(sent,[],'unready complete geometry cannot bypass the authoritative host');
 assert.match(e.controls.valkyrieStatus.textContent,/ACTIVATE ASCENSION/);
 e.send('pointerup',points.at(-1)[0],points.at(-1)[1],{pointerId:302,target:e.controls.layer});
 assert.equal(e.controls.ritual,null);
 assert.ok(Number(e.controls.valkyrieInk.style.strokeDasharray.split(' ')[0])>.99,
   'completion glow remains visible immediately after release');
 e.controls.dispose();
});

test('Dagaz retains progress after accidental off-path thumb movement and resumes in order',()=>{
 const e=valkyrieFlightFixture(),points=e.controls.valkyrieGeometry.points;
 const events=[];e.input.socket.send=m=>events.push(m);
 e.send('pointerdown',points[0][0],points[0][1],{action:'jump',pointerId:303});
 const a=points[0],b=points[1];
 e.send('pointermove',a[0]+(b[0]-a[0])*.5,a[1]+(b[1]-a[1])*.5,
   {pointerId:303,target:e.controls.layer});
 const before=e.controls.ritual.index+e.controls.ritual.segmentProgress;
 assert.ok(before>.1);
 e.send('pointermove',10,10,{pointerId:303,target:e.controls.layer});
 assert.ok(e.controls.ritual,'off-path sample must not permanently invalidate a trace');
 assert.ok(e.controls.ritual.index+e.controls.ritual.segmentProgress>=before);
 e.send('pointermove',b[0],b[1],{pointerId:303,target:e.controls.layer});
 assert.equal(e.controls.ritual.index,1,'pointer should recover on the intended next checkpoint');
 assert.equal(events.length,0);
 e.send('pointercancel',b[0],b[1],{pointerId:303,target:e.controls.layer});
 e.controls.dispose();
});
