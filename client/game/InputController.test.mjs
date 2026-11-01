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
  const socket = Object.fromEntries(['guard', 'attack', 'cast', 'castPreparedSpell', 'selectPreparedSpell', 'selectPreparedSlot', 'castPreparedSlot', 'castCurrentSpell'].map((action) => [action, (...args) => calls.push([action, ...args])]));
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

test('mounted view toggle uses its rebound key and produces one local presentation action', () => {
  const { input, down, up } = setup();
  const actions = [];
  assert.deepEqual(input.bindings.siegeView, ['KeyZ']);
  input.onAction = (action, pressed) => { if (pressed) actions.push(action); };
  input.configure({ bindings: { ...input.bindings, siegeView: ['KeyJ'] } });
  down('KeyJ'); up('KeyJ');
  assert.deepEqual(actions, ['siegeView']);
});

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


for (const [key, slot] of [['Digit1',1],['Digit2',2],['Digit3',3],['Numpad2',2]]) test(`Q plus ${key} selects slot ${slot} and casts once`, () => {
  const { input, calls, down, up, reveal, send } = setup();
  input.updatePreparedSpells({ ...chivalry, spell: 'gale' }, 10);
  down('KeyQ'); reveal(); down(key);
  assert.deepEqual(calls, [['castPreparedSlot', slot, input.lookDirection(), {yaw:input.yaw,pitch:input.pitch}]], 'slot order comes from the repertoire, not current spell');
  assert.equal(input.preparedGesture, null, 'valid choice closes immediately');
  send('keydown', { code:key, repeat:true }); up(key); up('KeyQ');
  assert.deepEqual(calls, [['castPreparedSlot', slot, input.lookDirection(), {yaw:input.yaw,pitch:input.pitch}]], 'release and autorepeat stay quiet');
  down('KeyQ'); up('KeyQ');
  assert.equal(calls.at(-1)[0], 'castCurrentSpell', 'a quick later tap uses server current identity');
});

test('quick Q plus a number works before the informational panel hold timer', () => {
  const { input, calls, down, up, reveal } = setup();
  input.updatePreparedSpells(chivalry, 10); down('KeyQ'); down('Digit3'); reveal(); up('Digit3'); up('KeyQ');
  assert.deepEqual(calls, [['castPreparedSlot', 3, input.lookDirection(), {yaw:input.yaw,pitch:input.pitch}]]);
});

test('numeric bindings retain ordinary actions outside selection and consumed releases never reach them', () => {
  const { input, calls, down, up, reveal, send } = setup();
  input.configure({bindings:{...input.bindings,attack:['Digit2'],forward:['Digit1']}});
  input.updatePreparedSpells(chivalry, 10);
  down('Digit2'); up('Digit2'); assert.deepEqual(calls, [['attack',true],['attack',false]]);
  calls.length=0; down('KeyQ'); reveal(); down('Digit2'); up('KeyQ');
  send('keydown',{code:'Digit2',repeat:true}); up('Digit2');
  assert.deepEqual(calls, [['castPreparedSlot',2,input.lookDirection(),{yaw:input.yaw,pitch:input.pitch}]], 'selection consumes the complete numeric press');
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
  assert.deepEqual(presentations, [{spell:'frostfire',prepared:true}]);
  down('KeyQ'); up('KeyQ');
  assert.deepEqual(presentations, [{spell:'frostfire',prepared:true},{spellOnly:true,spell:'frostfire'}]);
  assert.equal(input.prepared.current, 'fireball', 'only snapshots change authoritative current');
  assert.equal(calls.at(-1)[0], 'castCurrentSpell');
  input.updatePreparedSpells({...chivalry,spell:'frostfire',preparedSpellSelected:true},10.1);
  assert.equal(input.pendingPreparedSelection,null);
});

test('a short hold opens the choice, and it stays open once Q is let go: a number then selects and attempts casting', () => {
  const { input, calls, down, up, reveal } = setup();
  input.updatePreparedSpells(chivalry, 10);
  down('KeyQ'); reveal(); up('KeyQ');
  assert.ok(input.preparedGesture?.shown, 'still open after Q is released');
  assert.deepEqual(calls, []);
  // gale is cooling (ready at 14): choosing it is still allowed, the host decides
  down('Digit3'); up('Digit3');
  assert.deepEqual(calls, [['castPreparedSlot', 3, input.lookDirection(), {yaw:input.yaw,pitch:input.pitch}]]);
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

test('numeric startup selection remains preselection, while an active unavailable choice still sends one cast attempt', () => {
  const { input, calls, down, up } = setup();
  input.updatePreparedSpells({...chivalry, ultimateState:{id:'chivalry',phase:'startup',commitAt:10.65}},10);
  down('KeyQ'); down('Digit2'); up('Digit2'); up('KeyQ');
  assert.deepEqual(calls,[['selectPreparedSlot',2]]);
  calls.length=0; input.updatePreparedSpells(chivalry,10);
  down('KeyQ'); down('Digit3'); up('Digit3'); up('KeyQ');
  assert.equal(calls.length,1); assert.equal(calls[0][0],'castPreparedSlot');
});

test('tutorial control gate blocks keyboard and touch predictions while retaining real movement and aim', () => {
  const {input,calls,down}=setup();
  const blocked=[];
  input.allowAction=action=>{blocked.push(action); return !['spell','attack','guard','dash','ultimate','gauntlet','jump','crouch'].includes(action);};
  let predicted=0;
  input.onAttackLocal=input.onGuardLocal=input.onCastLocal=input.onDashLocal=()=>predicted++;
  input.updatePreparedSpells(chivalry,10);
  down('Mouse0');down('Mouse2');down('KeyQ');down('Space');down('KeyC');
  input.setAttack(true);input.setGuard(true);input.usePreparedSpell('fireball');input.castCurrentSpell();
  input.dash();input.ultimate();input.gauntlet();down('KeyW');down('ShiftLeft');input.turn(.4,.1);
  assert.deepEqual(calls,[]);assert.equal(predicted,0);
  const move=input.movement(); assert.equal(move.forward,1);assert.equal(move.sprint,true);
  assert.equal(move.jump,false);assert.equal(move.crouch,false);assert.equal(move.guard,false);assert.equal(move.attack,false);
  assert.equal(move.yaw,.4);assert.ok(blocked.includes('spell'));
  input.allowAction=null; input.castCurrentSpell(); assert.equal(calls.at(-1)[0],'castCurrentSpell');
});

test('a denied desktop Sprint hold stays inactive after unlock until physical release and a fresh press', () => {
  const { input, down, up, send } = setup();
  let unlocked = false;
  const feedback = [];
  input.allowAction = (action, notify = true) => {
    if (action !== 'sprint' || unlocked) return true;
    if (notify) feedback.push(action);
    return false;
  };
  down('KeyW'); down('ShiftLeft');
  assert.equal(input.movement().forward, 1);
  assert.equal(input.movement().sprint, false);
  unlocked = true;
  send('keydown', { code: 'ShiftLeft', repeat: true });
  assert.equal(input.movement().sprint, false);
  assert.deepEqual(feedback, ['sprint']);
  up('ShiftLeft'); down('ShiftLeft');
  assert.equal(input.movement().sprint, true);
});

test('denied desktop Attack and Guard presses cannot activate through a later held repeat', () => {
  for (const [code, action] of [['Mouse0', 'attack'], ['KeyG', 'guard']]) {
    const { input, calls, down, up, send } = setup();
    let unlocked = false;
    input.allowAction = requested => requested !== action || unlocked;
    down(code);
    assert.equal(input.movement()[action], false);
    unlocked = true;
    if (code.startsWith('Mouse')) down(code);
    else send('keydown', { code, repeat: true });
    assert.equal(input.movement()[action], false);
    assert.deepEqual(calls, []);
    up(code); down(code);
    assert.equal(input.movement()[action], true);
    assert.deepEqual(calls, [[action, true]]);
  }
});

test('held action sources remember an unavailable request until that source releases', () => {
  for (const action of ['attack', 'guard']) {
    const { input, calls } = setup();
    let unlocked = false;
    input.allowAction = requested => requested !== action || unlocked;
    const request = held => action === 'attack' ? input.setAttack(held) : input.setGuard(held);
    request(true);
    unlocked = true;
    request(true);
    assert.deepEqual(calls, []);
    assert.equal(input.movement()[action], false);
    request(false); request(true);
    assert.deepEqual(calls, [[action, true]]);
  }
});

test('a sampled permission withdrawal still accepts a release and fresh press in the same input frame', () => {
  for (const [code, action] of [['ShiftLeft', 'sprint'], ['Mouse0', 'attack'], ['KeyG', 'guard']]) {
    const { input, down, up } = setup();
    let unlocked = true;
    input.allowAction = requested => requested !== action || unlocked;
    down(code); assert.equal(input.movement()[action], true);
    unlocked = false; assert.equal(input.movement()[action], false);
    unlocked = true; assert.equal(input.movement()[action], false);
    up(code); down(code);
    assert.equal(input.movement()[action], true);
  }
});

test('tutorial Look freezes direct rotation and drops the first desktop delta after unlock', () => {
  const { input, send } = setup();
  let unlocked = false;
  const feedback = [];
  input.allowAction = (action, notify = true) => {
    if (action !== 'look' || unlocked) return true;
    if (notify) feedback.push(action);
    return false;
  };
  input.turn(.4, .1);
  assert.equal(input.yaw, 0);
  assert.equal(input.pitch, 0);
  send('mousemove', { movementX: -100, movementY: -100 });
  unlocked = true;
  send('mousemove', { movementX: -500, movementY: -500 });
  assert.equal(input.yaw, 0);
  assert.equal(input.pitch, 0);
  send('mousemove', { movementX: -100, movementY: -100 });
  assert.ok(Math.abs(input.yaw - .235) < 1e-12);
  assert.ok(Math.abs(input.pitch - .21) < 1e-12);
  assert.deepEqual(feedback, []);
});

test('a sampled Look lock discards the unlock delta even before the first mouse event', () => {
  const { input, send } = setup();
  let unlocked = false;
  input.allowAction = action => action !== 'look' || unlocked;
  input.movement();
  unlocked = true;
  send('mousemove', { movementX: -100, movementY: -100 });
  assert.equal(input.yaw, 0);
  assert.equal(input.pitch, 0);
  send('mousemove', { movementX: -100, movementY: -100 });
  assert.ok(Math.abs(input.yaw - .235) < 1e-12);
});

test('removing the tutorial gate restores immediate ordinary mouse input', () => {
  const { input, send } = setup();
  input.allowAction = action => action !== 'look';
  send('mousemove', { movementX: -100, movementY: -100 });
  input.allowAction = null;
  send('mousemove', { movementX: -100, movementY: -100 });
  assert.ok(Math.abs(input.yaw - .235) < 1e-12);
});

test('direction key presses denied before Walk require release even when unlock precedes the next sample', () => {
  for (const [code, axis, value] of [['KeyW', 'forward', 1], ['KeyS', 'forward', -1], ['KeyA', 'right', -1], ['KeyD', 'right', 1]]) {
    const { input, down, up, send } = setup();
    let unlocked = false;
    const feedback = [];
    input.allowAction = (action, notify = true) => {
      if (action !== 'move' || unlocked) return true;
      if (notify) feedback.push(action);
      return false;
    };
    down(code);
    unlocked = true;
    send('keydown', { code, repeat: true });
    assert.equal(input.movement()[axis], 0, code);
    assert.deepEqual(feedback, ['move'], code);
    up(code); down(code);
    assert.equal(input.movement()[axis], value, code);
  }
});

test('a movement permission withdrawal blocks each held direction while a fresh direction remains usable', () => {
  const { input, down, up } = setup();
  let unlocked = true;
  input.allowAction = action => action !== 'move' || unlocked;
  down('KeyW'); down('KeyA');
  assert.equal(input.movement().forward, 1);
  unlocked = false;
  assert.equal(input.movement().forward, 0);
  assert.equal(input.movement().right, 0);
  unlocked = true;
  assert.equal(input.movement().forward, 0);
  down('KeyD');
  assert.equal(input.movement().right, 1);
  up('KeyW'); down('KeyW');
  assert.equal(input.movement().forward, 1);
});

test('tutorial input release keeps preheld movement blocked through an opening unlock', () => {
  const { input, down, up, send } = setup();
  input.allowAction = () => true;
  down('KeyW');
  input.releaseInputs();
  send('keydown', { code: 'KeyW', repeat: true });
  assert.equal(input.movement().forward, 0);
  up('KeyW'); down('KeyW');
  assert.equal(input.movement().forward, 1);
});

test('ordinary mouse and movement controls accept their first input without a tutorial gate', () => {
  const { input, down, send } = setup();
  send('mousemove', { movementX: -100, movementY: -100 });
  down('KeyW'); down('KeyD');
  const move = input.movement();
  assert.ok(Math.abs(move.yaw - .235) < 1e-12);
  assert.ok(Math.abs(move.pitch - .21) < 1e-12);
  assert.equal(move.forward, 1);
  assert.equal(move.right, 1);
});

test('an authored pursuit release resumes suspended movement while first WALK retains fresh input gating',()=>{
  const {input,down,up}=setup();let allowed=false;
  input.allowAction=()=>allowed;down('KeyW');down('ShiftLeft');
  assert.equal(input.movement().forward,0);allowed=true;
  assert.equal(input.movement().forward,0);
  input.resumeHeldMovement();
  assert.equal(input.movement().forward,1);assert.equal(input.movement().sprint,true);
  up('KeyW');up('ShiftLeft');assert.equal(input.movement().forward,0);
});

test('mouse attack and release work when touchFocus is active (hybrid iPad / touchscreen PC with mouse)', () => {
  const { input, calls, down, up, send } = setup();
  // Simulate touch device with pointer unlocked and touchFocus enabled
  globalThis.document.pointerLockElement = null;
  send('pointerlockchange');
  assert.equal(input.pointerLocked, false);
  assert.equal(input.enabled, false);

  input.touch = { setActive() {}, enterImmersive() {} };
  input.requestPointerLock();
  assert.equal(input.touchFocus, true);
  assert.equal(input.enabled, true);
  assert.equal(input.pointerLocked, false);

  down('Mouse0');
  assert.deepEqual(calls, [['attack', true]]);
  assert.equal(input.attackHeld, true);
  assert.equal(input.movement().attack, true);

  up('Mouse0');
  assert.deepEqual(calls, [['attack', true], ['attack', false]]);
  assert.equal(input.attackHeld, false);
  assert.equal(input.movement().attack, false);
});

test('default keyboard attack key KeyF attacks and holds alongside Mouse0', () => {
  const { input, calls, down, up } = setup();
  down('KeyF');
  assert.deepEqual(calls, [['attack', true]]);
  assert.equal(input.movement().attack, true);
  up('KeyF');
  assert.deepEqual(calls, [['attack', true], ['attack', false]]);
  assert.equal(input.movement().attack, false);
});

test('holding both Mouse0 and KeyF sustains attack until all sources release', () => {
  for (const [first, second] of [['Mouse0', 'KeyF'], ['KeyF', 'Mouse0']]) {
    const { input, calls, down, up } = setup();
    down(first);
    assert.deepEqual(calls, [['attack', true]]);
    down(second);
    assert.deepEqual(calls, [['attack', true]], 'second attack source does not re-trigger attack');
    up(first);
    assert.equal(input.attackHeld, true, 'attack remains sustained while second source is held');
    assert.deepEqual(calls, [['attack', true]]);
    up(second);
    assert.deepEqual(calls, [['attack', true], ['attack', false]]);
    assert.equal(input.attackHeld, false);
  }
});

test('pointer lock acquisition and release transition cleanly while touchFocus is active', () => {
  const { input, send } = setup();
  globalThis.document.pointerLockElement = null;
  send('pointerlockchange');
  input.touch = { setActive() {}, enterImmersive() {} };
  input.requestPointerLock();
  assert.equal(input.touchFocus, true);
  assert.equal(input.enabled, true);
  assert.equal(input.pointerLocked, false);

  // Pointer lock acquired while touchFocus active
  globalThis.document.pointerLockElement = input.element;
  send('pointerlockchange');
  assert.equal(input.pointerLocked, true);
  assert.equal(input.enabled, true);

  // Pointer lock released (e.g. user toggles back to touch)
  globalThis.document.pointerLockElement = null;
  send('pointerlockchange');
  assert.equal(input.pointerLocked, false);
  assert.equal(input.enabled, true, 'touchFocus keeps input enabled when pointer lock releases');

  input.releaseFocus();
  assert.equal(input.touchFocus, false);
  assert.equal(input.enabled, false);
});


test('mobile focus does not invoke native pointer lock or fullscreen and ignores non-hidden browser blur', () => {
  const { input, send, win } = setup();
  globalThis.document.pointerLockElement = null;
  send('pointerlockchange');
  let pointerLocks = 0;
  let immersiveCalls = 0;
  let resets = 0;
  input.element.requestPointerLock = () => { pointerLocks += 1; };
  input.touch = {
    setActive() {},
    enterImmersive() { immersiveCalls += 1; },
    reset() { resets += 1; },
    movement() { return { forward: .9, right: 0, jump: false, sprint: false, crouch: false }; },
  };
  input.requestPointerLock();
  assert.equal(input.touchFocus, true);
  assert.equal(input.enabled, true);
  assert.equal(pointerLocks, 0, 'touch focus must not activate mouse pointer lock');
  assert.equal(immersiveCalls, 0, 'entering touch focus must not request fullscreen');
  input.requestPointerLock({ mouse: true });
  assert.equal(pointerLocks, 1, 'hybrid mouse users can still explicitly request pointer lock');
  assert.ok(input.movement().forward > .8);
  send('blur', {}, win);
  assert.equal(resets, 0, 'temporary system overlay blur should not release touch input');
  assert.ok(input.movement().forward > .8, 'touch movement survives visible-window blur');
  globalThis.document.hidden = true;
  send('visibilitychange');
  assert.equal(input.touchFocus, false);
  assert.equal(input.enabled, false);
  assert.ok(resets > 0, 'backgrounding the page must clear touch input');
});

test('ram sensitivity preserves precise immediate aim and ordinary settings on exit',()=>{
 const {input}=setup();input.configure({ram: .6});input.mountedRam=true;input.turn(.1,.05);
 assert.ok(Math.abs(input.yaw-.06)<1e-9);assert.ok(Math.abs(input.pitch-.03)<1e-9);
 input.turn(-.1,-.05);assert.ok(Math.abs(input.yaw)<1e-9);
 input.mountedRam=false;input.turn(.1,.05);assert.equal(input.yaw,.1);assert.equal(input.pitch,.05);
});

test('Shift with the rebound mounted view key enters CLEAR once without toggling the base view',()=>{
 const {input,send,up}=setup(),actions=[];input.configure({bindings:{...input.bindings,siegeView:['KeyJ']}});input.onAction=(a,p)=>{if(p)actions.push(a);};
 send('keydown',{code:'KeyJ',shiftKey:true,repeat:false});send('keydown',{code:'KeyJ',shiftKey:true,repeat:true});up('KeyJ');assert.deepEqual(actions,['siegeZoom']);
});

test('precision angular gain applies to both input devices and clears with released inputs',()=>{
 const {input}=setup();input.aimGain=.55;input.turn(.2,.1);assert.ok(Math.abs(input.yaw-.11)<1e-9);assert.ok(Math.abs(input.pitch-.055)<1e-9);
 input.releaseInputs();assert.equal(input.aimGain,1);
});

test('blur and input release cancel precision presentation without changing aim',()=>{
 const {input,win}=setup();let cancelled=0;input.onAimCancelled=()=>cancelled++;
 input.yaw=.4;input.pitch=.2;input.aimGain=.55;win.dispatchEvent(new Event('blur'));
 assert.ok(cancelled>0);assert.equal(input.aimGain,1);assert.equal(input.yaw,.4);assert.equal(input.pitch,.2);
});
test('dedicated siege Skill respects rebinding, one press and disabled input',()=>{
 const {input,down,up,calls,send}=setup();input.socket.send=m=>calls.push(m);input.configure({bindings:{...input.bindings,siegeSkill:['KeyH']}});
 down('KeyH');send('keydown',{code:'KeyH',repeat:true});up('KeyH');assert.deepEqual(calls,[{type:'siegeSkill'}]);input.enabled=false;down('KeyH');assert.equal(calls.length,1);
});

test('mounted RMB requests Bolt II immediately, never primes or creates a mouse chord',()=>{
 const {input,calls,down,up,reveal}=setup();input.socket.send=m=>calls.push(m);
 input.mountedBallista=true;
 down('Mouse2');down('Mouse2');reveal();up('Mouse2');
 assert.deepEqual(calls.map(c=>c.type),['bibyeHeavyFire']);
 assert.ok(Number.isFinite(calls[0].yaw)&&Number.isFinite(calls[0].pitch));
 down('Mouse2');up('Mouse2');
 assert.deepEqual(calls.map(c=>c.type),['bibyeHeavyFire','bibyeHeavyFire']);
 assert.ok(calls.every(c=>Number.isFinite(c.yaw)&&Number.isFinite(c.pitch)));
});

test('U, then LMB and RMB are independent, including sequential presses on a one-button-at-a-time mouse',()=>{
 const {input,calls,down,up,reveal}=setup();input.socket.send=m=>calls.push(m);
 input.mountedBallista=true;
 down('KeyU');up('KeyU');
 down('Mouse0');up('Mouse0');
 down('Mouse2');up('Mouse2');reveal();
 assert.deepEqual(calls.filter(c=>c?.type).map(c=>c.type),['siegeSkill','bibyeHeavyFire']);
 assert.deepEqual(calls.filter(c=>Array.isArray(c)&&c[0]==='attack'),[['attack',true],['attack',false]]);
});

test('mounted mouse release, blur and operator switching never issue phantom heavy shots',()=>{
 const {input,calls,down,up,send,win}=setup();input.socket.send=m=>calls.push(m);
 input.mountedBallista=true;
 down('Mouse0');send('blur',{},win);up('Mouse0');
 input.mountedBallista=false;input.releaseInputs();
 assert.equal(calls.some(c=>c?.type==='bibyeHeavyFire'||c?.type==='bibyeCombinedFire'),false);
 down('Mouse2');up('Mouse2');
 assert.equal(input.guardHeld,false);
});

test('Flight repeater merges mouse/key/touch holds and releases on blur without an abandoned trigger',()=>{
  const {input,calls,down,up,send,win}=setup();
  input.socket.send=m=>calls.push(m);
  input.mountedFlight=true;
  down('Mouse0');down('Mouse0');
  down('KeyX');
  assert.deepEqual(calls,[{type:'fightFlightFire',down:true}]);
  up('Mouse0');assert.equal(calls.length,1,'holding key must sustain trigger');
  input.flightFire(true,'touch');
  up('KeyX');assert.equal(calls.length,1,'touch hold sustains trigger after key release');
  send('blur',{},win);
  assert.deepEqual(calls,[{type:'fightFlightFire',down:true},{type:'fightFlightFire',down:false}]);
  input.flightFire(false,'touch');assert.equal(calls.length,2,'late touch release does not duplicate');
  input.mountedFlight=false;
  down('Mouse0');up('Mouse0');
  assert.equal(calls.some(x=>x.type==='fightFlightFire'&&x.down===true&&calls.indexOf(x)>0),false);
  assert.equal(input.guardHeld,false);
});
test('Flight repeater uses LMB (Mouse0) and RMB (Mouse2) attacks with sword',()=>{
  const {input,calls,down,up}=setup();
  input.socket.send=m=>calls.push(m);
  input.socket.attack=down=>calls.push({type:'attack',down});
  input.mountedFlight=true;
  down('Mouse2');
  assert.deepEqual(calls,[{type:'attack',down:true}]);
  up('Mouse2');
  assert.deepEqual(calls,[{type:'attack',down:true},{type:'attack',down:false}]);
});
test('Flight repeater does not fire while ordinary Spellblade is unmounted and disabled',()=>{
 const {input,calls,down,up}=setup();input.socket.send=m=>calls.push(m);
 input.mountedFlight=false;down('KeyX');up('KeyX');
 assert.deepEqual(calls,[{type:'bibyeWeaponFocus'}]);
 input.mountedFlight=true;input.enabled=false;down('Mouse0');
 assert.equal(calls.length,1);
});


test('Flight T ejection is a single press-release pair and blur only cancels',()=>{
 const {input,calls,down,up,send,win}=setup();input.socket.send=m=>calls.push(m);
 input.mountedFlight=true;
 down('KeyT');down('KeyT');up('KeyT');
 assert.deepEqual(calls,[{type:'flightEject',down:true},{type:'flightEject',down:false}]);
 calls.length=0;down('KeyT');send('blur',{},win);up('KeyT');
 assert.deepEqual(calls,[{type:'flightEject',down:true},{type:'flightEject',down:false,cancel:true}]);
});

test('mounted touch flight Rise and Lower survive controller forwarding, then clear on unmount and focus loss', () => {
  const { input } = setup();
  let rise = true, lower = false;
  input.touch = { movement: () => ({ forward: 0, right: 0, jump: false, sprint: false, crouch: false, flightRise: rise, flightLower: lower }) };
  input.mountedFlight = true;
  assert.equal(input.movement().flightRise, true);
  assert.equal(input.movement().flightLower, false);
  rise = false; lower = true;
  assert.equal(input.movement().flightRise, false);
  assert.equal(input.movement().flightLower, true);
  lower = false;
  assert.equal(input.movement().flightLower, false, 'release stops descent without a stale packet');
  rise = true;
  input.mountedFlight = false;
  assert.equal(input.movement().flightRise, false, 'unmount invalidates flight intent');
  input.mountedFlight = true;
  input.enabled = false;
  assert.equal(input.movement().flightRise, false, 'loss of focus invalidates flight intent');
  input.enabled = true;
  input.allowAction = action => action !== 'move';
  assert.equal(input.movement().flightRise, false, 'input gate cannot be bypassed by touch rail');
  input.dispose();
});
