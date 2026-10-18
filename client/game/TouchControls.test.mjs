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
  const send = (type, x = 600, y = 300, { action = 'spell', pointerId = 1, target = controls.buttons[action], pointerType = 'touch', button = 0, ...rest } = {}) => {
    const event = new Event(type);
    for (const [key, value] of Object.entries({ pointerId, pointerType, button, clientX: x, clientY: y, target, ...rest })) Object.defineProperty(event, key, { value });
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

test('floating joystick plants in game-layer coordinates despite mobile viewport offset and scale', () => {
  const { controls, send } = setup({ alive: true, spell: 'fireball' });
  // This game layer is offset and displayed at half its CSS layout size.
  controls.layer.getBoundingClientRect = () => ({ left: 50, top: 30, width: 400, height: 300 });
  const finger = { target: controls.layer };
  send('pointerdown', 130, 255, finger); // game-layer point (160, 450), not (130, 255)
  assert.deepEqual({ x: controls.stick.x, y: controls.stick.y }, { x: 160, y: 450 });
  assert.equal(controls.stickBase.style.left, '160px');
  assert.equal(controls.stickBase.style.top, '450px');
  send('pointermove', 130, 225, finger);
  assert.ok(controls.movement().forward > 0.9, 'drag up moves forward in the corrected local frame');
  send('pointerup', 130, 225, finger);
  assert.equal(controls.stick, null);
  assert.equal(controls.stickBase.style.left, '');
  assert.equal(controls.stickBase.style.top, '');
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
  assert.equal(controls.stick, null, 'app focus loss clears captured movement');
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
