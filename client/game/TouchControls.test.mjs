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
 send('pointermove',100,350,stick);assert.equal(controls.movement().sprint,false,'on foot behavior retains established threshold');
});

test('cancelled look or View fingers cancel precision view while ordinary finger release preserves it',()=>{
 const {controls,input,send}=setup({alive:true,spell:'fireball'});let cancelled=0;input.onAimCancelled=()=>cancelled++;
 const look={target:controls.layer};send('pointerdown',650,230,look);send('pointerup',660,230,look);assert.equal(cancelled,0);
 send('pointerdown',650,230,look);send('pointercancel',660,230,look);assert.equal(cancelled,1);
 send('lostpointercapture',660,230,look);assert.equal(cancelled,1);
 const prior=cancelled;send('pointerdown',650,230,{action:'attack',pointerId:3});send('pointercancel',660,230,{action:'attack',pointerId:3});assert.equal(cancelled,prior+1);assert.equal(input.attackHeld,false);
 controls.reset();assert.ok(cancelled>1);
});
