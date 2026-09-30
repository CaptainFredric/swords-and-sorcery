import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_PERSON_OFF_ARM, FIRST_PERSON_SWORD_ARM, elbowAngleFor, normalize, rotateVector, solveArm, solveSwordArm } from './swordArmIK.mjs';
import { CHAIN, COMBO, COMBO_CONTACTS, COMBO_END, REST_ARM, RECOVERY, SLAM, blendPoses, comboPose, counterRotations, offHandOnGrip, recoveryPose, slamPose } from './fpSlash.mjs';
import { MELEE_CONTACT, SWORD_CHAIN } from '../../shared/src/combat.mjs';

// a toy arm with the first-person rig's proportions: each bone a pivot and an orientation (three axes), turning a
// bone carries everything after it in the chain
function toyArm(side = 'R') {
  const bones = side === 'R' ? {
    'upper_arm.R': { pivot: [0.44, -0.49, -0.08] },
    'forearm.R': { pivot: [0.424, -0.4, -0.364] },
    'hand.R': { pivot: [0.395, -0.308, -0.648] },
    socket_sword: { pivot: [0.366, -0.248, -0.715] },
  } : {
    'upper_arm.L': { pivot: [-0.44, -0.49, -0.08] },
    'forearm.L': { pivot: [-0.424, -0.435, -0.373] },
    'hand.L': { pivot: [-0.399, -0.38, -0.667] },
  };
  const order = Object.keys(bones);
  for (const name of order) bones[name].axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const after = (name) => order.slice(order.indexOf(name));
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  return {
    bones,
    api: {
      position: (name) => [...bones[name].pivot],
      direction: (name, axis) => normalize(bones[name].axes.reduce((sum, basis, i) => add(sum, basis.map((v) => v * axis[i])), [0, 0, 0])),
      rotate: (name, axis, angle) => {
        const pivot = bones[name].pivot;
        for (const bone of after(name)) {
          bones[bone].pivot = add(pivot, rotateVector(sub(bones[bone].pivot, pivot), axis, angle));
          bones[bone].axes = bones[bone].axes.map((basis) => rotateVector(basis, axis, angle));
        }
      },
      shift: (name, offset) => { for (const bone of after(name)) bones[bone].pivot = add(bones[bone].pivot, offset); },
    },
  };
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const degrees = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) * 180 / Math.PI;
const [C1, C2, C3] = COMBO_CONTACTS;
const FRAME = 1 / 60;

// where the sword is, as the game's camera sees it (78 degrees tall, the arms' root a little below the eye): the
// middle of the blade (its strong) and its tip, projected (-1..1 across a 16:9 view, and up it)
const TAN = Math.tan((78 / 2) * Math.PI / 180);
function seen(arm, aspect = 16 / 9) {
  const b = normalize(arm.blade);
  const grip = add(arm.wrist, scale(b, 0.076));
  const at = (p) => [p[0] / -p[2] / (TAN * aspect), (p[1] - 0.045) / -p[2] / TAN];
  const mid = add(grip, scale(b, 0.42));
  const tip = add(grip, scale(b, 0.78));
  return { mid, tip, midOnScreen: at(mid), tipOnScreen: at(tip), guardOnScreen: at(add(grip, scale(b, 0.07))) };
}
const size = (arm) => { const s = seen(arm); return Math.hypot((s.tipOnScreen[0] - s.guardOnScreen[0]) * 16 / 9, s.tipOnScreen[1] - s.guardOnScreen[1]); };

// every frame of a stream of poses
function frames(poseAt, from, to) {
  const list = [];
  for (let t = from; t <= to + 1e-9; t += FRAME) {
    const pose = poseAt(t);
    if (pose) list.push({ t, pose });
  }
  return list;
}

// the hand's turn from one frame to the next: how far the blade swung, and how far it rolled about itself
function turning(a, b) {
  const blade = degrees(a.arm.blade, b.arm.blade);
  const axis = normalize(b.arm.blade);
  const before = normalize(sub(a.arm.edge, scale(axis, dot(a.arm.edge, axis))));
  return { blade, roll: degrees(before, b.arm.edge) };
}

function smoothly(list, what) {
  for (let i = 1; i < list.length; i += 1) {
    const { blade, roll } = turning(list[i - 1].pose, list[i].pose);
    assert.ok(roll < 12, `${what}: the hand rolls ${roll.toFixed(1)} degrees in one frame at ${list[i].t.toFixed(3)} s`);
    assert.ok(blade < 22, `${what}: the blade swings ${blade.toFixed(1)} degrees in one frame at ${list[i].t.toFixed(3)} s`);
    // (a cut moves the hand fast, 3 m/s or so: a jump is much more than that)
    assert.ok(distance(list[i - 1].pose.arm.wrist, list[i].pose.arm.wrist) < 0.08, `${what}: the hand jumps at ${list[i].t.toFixed(3)} s`);
  }
}

test('the elbow bends to the reach asked of it, and a straight arm is as far as it goes', () => {
  assert.ok(Math.abs(elbowAngleFor(0.3, 0.3, 0.3) - Math.PI / 3) < 1e-9, 'equal sides: 60 degrees');
  assert.ok(Math.abs(elbowAngleFor(0.3, 0.3, 5) - Math.PI) < 0.05, 'out of reach: straight');
  assert.ok(elbowAngleFor(0.3, 0.3, 0) > 0, 'never folds flat');
  const turned = rotateVector([1, 0, 0], [0, 0, 1], Math.PI / 2);
  assert.ok(distance(turned, [0, 1, 0]) < 1e-9);
});

test('the sword arm puts the wrist where it is asked, points the blade, and lies its edge exactly as asked', () => {
  for (let t = 0; t <= COMBO_END; t += 0.04) {
    const { arm: target } = comboPose(t);
    const arm = toyArm();
    solveSwordArm(arm.api, target, 1);
    assert.ok(distance(arm.api.position('hand.R'), target.wrist) < 0.012, `the wrist at ${t.toFixed(2)} s`);
    const blade = arm.api.direction('socket_sword', FIRST_PERSON_SWORD_ARM.aim);
    assert.ok(dot(blade, normalize(target.blade)) > 0.999, `the blade at ${t.toFixed(2)} s`);
    // exactly this edge, not whichever of the two lay nearer (that is what could flip the hand between two frames)
    const edge = arm.api.direction('socket_sword', FIRST_PERSON_SWORD_ARM.roll);
    const want = normalize(target.edge.map((v, i) => v - blade[i] * dot(target.edge, blade)));
    assert.ok(dot(edge, want) > 0.99, `the edge at ${t.toFixed(2)} s`);
  }
});

test('weight 0 leaves the arm as the clip posed it', () => {
  const arm = toyArm();
  const before = arm.api.position('hand.R');
  solveSwordArm(arm.api, comboPose(C1).arm, 0);
  assert.deepEqual(arm.api.position('hand.R'), before);
});

test('the hand never turns over between two frames: through the chain, every way home, and a chain taking over', () => {
  smoothly(frames(comboPose, 0, COMBO_END), 'the chain');
  // let go after the first strike, after the second, broken off mid-cut, and after the heavy one
  for (const from of [...SWORD_CHAIN.starts.slice(1), C1 - 0.03, C2 + 0.02, SWORD_CHAIN.starts[2] + 0.1, C3 + SWORD_CHAIN.restart]) {
    for (const quick of [false, true]) {
      const home = frames((t) => (t < from ? comboPose(t) : recoveryPose(from, t - from, { quick })), from - 0.1, from + RECOVERY.seconds + 0.1);
      smoothly(home, `home from ${from.toFixed(2)} s${quick ? ' (broken off)' : ''}`);
    }
  }
  // a new chain pressed while the arms are still coming home takes over from wherever they are
  const from = SWORD_CHAIN.starts[1];
  const pressed = 0.15;
  const handover = frames((t) => {
    if (t < pressed) return recoveryPose(from, t);
    const home = recoveryPose(from, t) ?? comboPose(0);
    return blendPoses(home, comboPose(t - pressed), (t - pressed) / 0.18);
  }, 0, 0.5);
  smoothly(handover, 'a chain taking over');
});

test('the chain begins and ends at rest, the hand turned as the rig holds it (the loop closes)', () => {
  for (const pose of [comboPose(0), comboPose(COMBO_END)]) {
    assert.ok(distance(pose.arm.wrist, REST_ARM.wrist) < 1e-6);
    assert.ok(dot(normalize(pose.arm.blade), normalize(REST_ARM.blade)) > 0.999);
    assert.ok(dot(pose.arm.edge, normalize(REST_ARM.edge)) > 0.99, 'the same edge out, not the other one');
  }
  assert.ok(COMBO.every((key, i) => i === 0 || key.t > COMBO[i - 1].t), 'keys in order');
  assert.equal(comboPose(NaN), null);
});

test('each strike\'s blade crosses the middle of the view at its contact, moving fast through it', () => {
  const list = frames(comboPose, 0, COMBO_END);
  const speedAt = (i) => distance(seen(list[i].pose.arm).mid, seen(list[i - 1].pose.arm).mid) / FRAME;
  for (const [strike, contact] of COMBO_CONTACTS.entries()) {
    // the first two sweep across (the middle is the view's centre line), the third comes down it
    const axis = strike < 2 ? 0 : 1;
    let crossed = null;
    for (let i = 1; i < list.length; i += 1) {
      if (Math.abs(list[i].t - contact) > 0.2) continue;
      const a = seen(list[i - 1].pose.arm).midOnScreen[axis];
      const b = seen(list[i].pose.arm).midOnScreen[axis];
      if ((a > 0) !== (b > 0)) { crossed = list[i - 1].t + FRAME * (a / (a - b)); break; }
    }
    // (the chop's arms bring the blade down through body height a moment before its contact)
    const lead = strike < 2 ? 0 : 0.02;
    assert.ok(crossed !== null && Math.abs(crossed - (contact - lead)) < 0.03, `strike ${strike + 1} crosses the middle at ${crossed?.toFixed(3)} (contact ${contact})`);
    // and it is at its fastest round the contact, not in its windup or its follow-through
    let fastest = { t: 0, speed: 0 };
    for (let i = 1; i < list.length; i += 1) {
      if (Math.abs(list[i].t - contact) > 0.3) continue;
      const speed = speedAt(i);
      if (speed > fastest.speed) fastest = { t: list[i].t, speed };
    }
    assert.ok(Math.abs(fastest.t - contact) < 0.05, `strike ${strike + 1} is fastest at ${fastest.t.toFixed(3)}`);
    // which way it goes: the forehand right to left, the backhand left to right, the third straight down
    const before = seen(comboPose(contact - 0.05).arm).midOnScreen;
    const after = seen(comboPose(contact + 0.05).arm).midOnScreen;
    if (strike === 0) assert.ok(after[0] < before[0] - 0.2, 'the forehand sweeps right to left');
    if (strike === 1) assert.ok(after[0] > before[0] + 0.2, 'the backhand sweeps left to right');
    if (strike === 2) assert.ok(after[1] < before[1] - 0.4 && Math.abs(after[1] - before[1]) > 4 * Math.abs(after[0] - before[0]), 'the third comes down, not across');
  }
});

test('the third strike is the heavy one: raised and held a beat, then faster through its contact than either quick cut', () => {
  const speed = (t) => distance(seen(comboPose(t).arm).mid, seen(comboPose(t - FRAME).arm).mid) / FRAME;
  const peak = (contact) => { let most = 0; for (let t = contact - 0.12; t < contact + 0.12; t += FRAME) most = Math.max(most, speed(t)); return most; };
  assert.ok(peak(C3) > 1.1 * peak(C1) && peak(C3) > 1.1 * peak(C2), 'the heavy strike drives through hardest');
  let loaded = Infinity;
  for (let t = C3 - 0.25; t < C3 - 0.08; t += FRAME) loaded = Math.min(loaded, speed(t));
  assert.ok(loaded < 0.5, 'a loaded moment before it');
  assert.ok(comboPose(C3 - 0.2).arm.blade[1] > 0.8, 'raised high');
});

test('the sword stays at a steady distance: never a slab across the eye, and the windup stays in view', () => {
  const rest = size(REST_ARM);
  const streams = [
    ['the chain', frames(comboPose, 0, COMBO_END)],
    ...[SWORD_CHAIN.starts[1], SWORD_CHAIN.starts[2]].map((from) => [`home from ${from}`, frames((t) => recoveryPose(from, t), 0, RECOVERY.seconds)]),
  ];
  for (const [what, list] of streams) {
    for (const { t, pose } of list) {
      assert.ok(-seen(pose.arm).tip[2] > 0.6, `${what}: the point comes within ${(-seen(pose.arm).tip[2]).toFixed(2)} m of the eye at ${t.toFixed(2)} s`);
      assert.ok(size(pose.arm) < 1.6 * rest, `${what}: the blade looms at ${t.toFixed(2)} s`);
    }
  }
  // the forehand's cock keeps the whole blade on even a 4:3 screen, and so does the heavy strike's raised sword
  for (const [from, to] of [[0, C1 - MELEE_CONTACT.window.early], [C3 - 0.3, C3 - 0.1]]) {
    for (const { t, pose } of frames(comboPose, from, to)) {
      const [x, y] = seen(pose.arm, 4 / 3).tipOnScreen;
      assert.ok(Math.abs(x) < 1 && Math.abs(y) < 1, `the point off the screen at ${t.toFixed(2)} s`);
    }
  }
});

test('for the heavy strike the magic hand takes the lower grip, clear below the sword hand, and lets go early', () => {
  for (let t = C3 - 0.25; t <= C3 + 0.02; t += 0.03) {
    const pose = comboPose(t);
    assert.ok(pose.offHand && pose.offHand.weight > 0.99, `both hands at ${t.toFixed(2)} s`);
    const sword = toyArm();
    solveSwordArm(sword.api, pose.arm, 1);
    const off = toyArm('L');
    solveArm(off.api, FIRST_PERSON_OFF_ARM, pose.offHand, 1);
    assert.ok(distance(off.api.position('hand.L'), pose.offHand.wrist) < 0.012, `the magic hand reaches the grip at ${t.toFixed(2)} s`);
    assert.ok(dot(off.api.direction('hand.L', [0, 1, 0]), pose.offHand.aim) > 0.999, `its fingers wrap the grip at ${t.toFixed(2)} s`);
    assert.ok(dot(off.api.direction('hand.L', [0, 0, 1]), normalize(pose.offHand.roll)) > 0.99, `its palm against the grip at ${t.toFixed(2)} s`);
    // the two fists stacked on the handle: a hand's width apart along it, not one on top of the other
    const grip = offHandOnGrip(pose.arm);
    const along = dot(sub(add(grip.wrist, scale(grip.aim, 0.094)), add(pose.arm.wrist, scale(normalize(pose.arm.blade), 0.076))), normalize(pose.arm.blade));
    assert.ok(along < -0.14, `below the sword hand at ${t.toFixed(2)} s (${along.toFixed(3)} m)`);
  }
  // it lets go early in the follow-through, not deep into it; and it keeps to itself through the quick cuts
  assert.ok((comboPose(C3 + 0.12).offHand?.weight ?? 0) < 0.6, 'letting go soon after the contact');
  assert.ok((comboPose(C3 + 0.24).offHand?.weight ?? 0) < 0.05, 'gone by the end of the follow-through');
  for (let t = 0; t < C2 + MELEE_CONTACT.window.late; t += 0.02) assert.equal(comboPose(t).offHand, null, `the magic hand keeps to itself at ${t.toFixed(2)} s`);
  // while it is still taking hold, it comes up from below the grip
  for (let t = C2 + 0.12; t < C3; t += 0.02) {
    const pose = comboPose(t);
    if (!pose.offHand || pose.offHand.weight > 0.9) continue;
    assert.ok(pose.offHand.wrist[1] < offHandOnGrip(pose.arm).wrist[1] - 0.005, `from below at ${t.toFixed(2)} s`);
  }
});

test('a chain let go early comes home along a path of its own: from where and as fast as the arms were going, to rest', () => {
  for (const from of [SWORD_CHAIN.starts[1], SWORD_CHAIN.starts[2]]) {
    const start = recoveryPose(from, 0);
    const chain = comboPose(from);
    assert.ok(distance(start.arm.wrist, chain.arm.wrist) < 1e-6 && dot(start.arm.edge, chain.arm.edge) > 0.9999, `it starts where the chain was at ${from}`);
    // carrying on as it was moving: the same velocity at the moment it turns for home (m/s)
    const h = 1e-3;
    const going = scale(sub(comboPose(from + h).arm.wrist, comboPose(from - h).arm.wrist), 1 / (2 * h));
    const home = scale(sub(recoveryPose(from, h).arm.wrist, start.arm.wrist), 1 / h);
    assert.ok(distance(going, home) < 0.1, `moving on as it was at ${from}`);
    // not a fade of a held pose: the hand travels home, and it gets there
    const midway = recoveryPose(from, RECOVERY.seconds / 2).arm.wrist;
    assert.ok(distance(midway, start.arm.wrist) > 0.05 && distance(midway, REST_ARM.wrist) > 0.03, `the hand travels at ${from}`);
    const last = recoveryPose(from, RECOVERY.seconds - 1e-3);
    assert.ok(distance(last.arm.wrist, REST_ARM.wrist) < 0.005 && dot(last.arm.edge, normalize(REST_ARM.edge)) > 0.99, `home at ${from}`);
    assert.equal(recoveryPose(from, RECOVERY.seconds + 0.01), null);
    // a magic hand already reaching for the grip lets go on the way home: steadily, never taking hold again
    let held = start.offHand?.weight ?? 0;
    for (let t = FRAME; t < RECOVERY.seconds; t += FRAME) {
      const now = recoveryPose(from, t)?.offHand?.weight ?? 0;
      assert.ok(now <= held + 1e-6, `the magic hand lets go of the grip, and keeps letting go, at ${from}`);
      held = now;
    }
    assert.ok(held < 0.02, `and it has let go by the time the arms are home at ${from}`);
  }
  // after the heavy strike, the chain's own settle is the way home
  const settle = recoveryPose(C3 + 0.28, 0.1);
  assert.ok(distance(settle.arm.wrist, comboPose(C3 + 0.38).arm.wrist) < 1e-6);
  assert.equal(recoveryPose(C3 + 0.28, COMBO_END), null);
});

test('the body drives the blade: it leads the hand, the blade trails a touch, the view leans only a little', () => {
  assert.ok(CHAIN.body > 0 && CHAIN.blade > 0 && CHAIN.blade < 0.02, 'the body leads; the blade trails, but not so far it lands late');
  for (let t = 0; t <= COMBO_END; t += 0.02) {
    const pose = comboPose(t);
    for (const lean of Object.values(pose.look)) assert.ok(Math.abs(lean) < 3 * Math.PI / 180, `a lean at ${t.toFixed(2)} s`);
    assert.ok(Math.hypot(...pose.body) < 0.05, `the arms carried a few centimetres, no more, at ${t.toFixed(2)} s`);
  }
  // the magic arm counterbalances the cuts: back as the forehand comes across, over toward the grip in the backhand
  assert.ok(comboPose(C1 + 0.1).counter[0] > 0.05, 'it drops back with the forehand');
  assert.ok(comboPose(C2 + 0.1).counter[1] < -0.05, 'and comes across with the backhand');
  assert.deepEqual(counterRotations([0.1, 0.1, 0.1], 0), []);
  assert.ok(counterRotations([0.1, -0.1, 0.05]).every((turn) => /\.L$/.test(turn.bone)), 'only the magic arm');
});

test('Sundering, every strike is the heavy slam: raised in both hands, driven down through the middle at each contact, smooth all the way', () => {
  assert.ok(SLAM.every((key, i) => i === 0 || key.t > SLAM[i - 1].t), 'keys in order');
  smoothly(frames(slamPose, 0, COMBO_END), 'the slams');
  for (const from of [SWORD_CHAIN.starts[1], SWORD_CHAIN.starts[2], C1 - 0.03, C2 + 0.02]) {
    for (const quick of [false, true]) {
      smoothly(frames((t) => (t < from ? slamPose(t) : recoveryPose(from, t - from, { quick, slam: true })), from - 0.1, from + RECOVERY.seconds + 0.1), `home from ${from.toFixed(2)} s`);
    }
  }
  // held: the next chain of slams takes over from the last one's settle
  const cycle = C3 + SWORD_CHAIN.restart;
  smoothly(frames((t) => (t < cycle ? slamPose(t) : blendPoses(slamPose(t), slamPose(t - cycle), (t - cycle) / 0.18)), C3, cycle + 0.8), 'slams again');
  for (const pose of [slamPose(0), slamPose(COMBO_END)]) assert.ok(distance(pose.arm.wrist, REST_ARM.wrist) < 1e-6, 'from rest, and home to it');
  for (const contact of COMBO_CONTACTS) {
    assert.ok(slamPose(contact - 0.2).arm.blade[1] > 0.8, `raised high before ${contact}`);
    assert.ok(slamPose(contact).offHand?.weight > 0.99, 'both hands on the grip');
    const before = seen(slamPose(contact - 0.05).arm).midOnScreen;
    const after = seen(slamPose(contact + 0.05).arm).midOnScreen;
    assert.ok(after[1] < before[1] - 0.4 && Math.abs(after[1] - before[1]) > 4 * Math.abs(after[0] - before[0]), `down, not across, at ${contact}`);
    let crossed = null;
    for (let t = contact - 0.2; t < contact + 0.2; t += FRAME) {
      const a = seen(slamPose(t).arm).midOnScreen[1];
      const b = seen(slamPose(t + FRAME).arm).midOnScreen[1];
      if ((a > 0) !== (b > 0)) { crossed = t + FRAME * (a / (a - b)); break; }
    }
    assert.ok(crossed !== null && Math.abs(crossed - (contact - 0.02)) < 0.03, `through the middle at ${crossed?.toFixed(3)} (contact ${contact})`);
  }
  for (const { t, pose } of frames(slamPose, 0, COMBO_END)) {
    assert.ok(-seen(pose.arm).tip[2] > 0.6, `the point near the eye at ${t.toFixed(2)} s`);
    assert.ok(size(pose.arm) < 1.6 * size(REST_ARM), `the blade looms at ${t.toFixed(2)} s`);
  }
});
