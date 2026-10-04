import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedBracePose, guardedComboPose, guardedRecoveryPose } from './fpGuardedSlash.mjs';
import { COMBO_CONTACTS, COMBO_CYCLE, comboPose } from './fpSlash.mjs';
import { guardedSwordPose } from './chivalryMotion.mjs';
import { aimFrame, bladeDirection } from '../../shared/src/blade.mjs';
import { MELEE_CONTACT } from '../../shared/src/combat.mjs';

// Chivalry's guarded cuts in first person: the ordinary cuts across the aim, with the body held back.

const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const angle = (a,b) => 2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0))));
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const degrees = (a, b) => Math.acos(Math.max(-1, Math.min(1, norm(a).reduce((sum, v, i) => sum + v * norm(b)[i], 0)))) * 180 / Math.PI;
const FRAME = 1 / 60;
const [C1, C2, C3] = COMBO_CONTACTS;

// where the sword is, as the game's camera sees it (as swordArm.test.mjs: 78 degrees tall, 16:9, the arms' root a
// little below the eye): the middle of the blade (its strong), projected (-1..1 across the view, and up it), and the
// direction from the eye to it
const TAN = Math.tan(39 * Math.PI / 180);
function seen(arm) {
  const b = norm(arm.blade);
  const mid = arm.wrist.map((v, i) => v + b[i] * (0.076 + 0.42));
  return { onScreen: [mid[0] / -mid[2] / (TAN * 16 / 9), (mid[1] - 0.045) / -mid[2] / TAN], fromEye: [mid[0], mid[1] - 0.045, mid[2]] };
}
// the authoritative blade in the same frame (view space is an aim frame: forward -z, right +x, up +y)
const VIEW = aimFrame(0, 0);
const authoritative = (strike, dt) => { const d = bladeDirection(strike, dt, VIEW); return [d.x, d.y, d.z]; };
const screenOf = (v) => [v[0] / -v[2] / (TAN * 16 / 9), v[1] / -v[2] / TAN];

test('the guarded cuts slash across the aim as the ordinary ones do: right to left, left to right, then down through the middle', () => {
  for (const [strike, contact] of COMBO_CONTACTS.entries()) {
    const axis = strike < 2 ? 0 : 1;
    const at = (t) => seen(guardedComboPose(t).arm).onScreen;
    // it crosses the middle of the view on the cut's own axis at the contact, as the ordinary cut does
    let crossed = null;
    for (let t = contact - 0.2; t < contact + 0.2; t += FRAME) {
      const a = at(t)[axis], b = at(t + FRAME)[axis];
      if ((a > 0) !== (b > 0)) { crossed = t + FRAME * (a / (a - b)); break; }
    }
    const lead = strike < 2 ? 0 : 0.02;
    assert.ok(crossed !== null && Math.abs(crossed - (contact - lead)) < 0.03, `strike ${strike + 1} crosses the middle at ${crossed?.toFixed(3)} (contact ${contact})`);
    // from one side of the view, through the middle, to the other: not a beat that stays on one side
    const before = at(contact - 0.08), middle = at(contact), after = at(contact + 0.08);
    if (strike === 0) assert.ok(before[0] > 0.25 && Math.abs(middle[0]) < 0.1 && after[0] < -0.15, `forehand right → centre → left: ${before[0].toFixed(2)} ${middle[0].toFixed(2)} ${after[0].toFixed(2)}`);
    if (strike === 1) assert.ok(before[0] < -0.25 && Math.abs(middle[0]) < 0.1 && after[0] > 0.15, `backhand left → centre → right: ${before[0].toFixed(2)} ${middle[0].toFixed(2)} ${after[0].toFixed(2)}`);
    if (strike === 2) {
      assert.ok(before[1] > 0.25 && after[1] < -0.45, `descending above → below: ${before[1].toFixed(2)} ${after[1].toFixed(2)}`);
      assert.ok(Math.abs(after[1] - before[1]) > 4 * Math.abs(after[0] - before[0]), 'down, not across');
    }
  }
});

test('at each contact the visible blade is where the ordinary blade is, and goes the way the authoritative blade goes', () => {
  for (const [strike, contact] of COMBO_CONTACTS.entries()) {
    const guarded = guardedComboPose(contact).arm, plain = comboPose(contact).arm;
    // the cut's own blade and place: the player aims a Chivalry cut exactly as an ordinary one
    assert.ok(degrees(guarded.blade, plain.blade) < 15, `strike ${strike + 1}: the blade lies as the ordinary one (turned in the hand a little: the arm reaches less far)`);
    assert.ok(distance(seen(guarded).onScreen, seen(plain).onScreen) < 0.04, `strike ${strike + 1}: seen where the ordinary one is`);
    // near the authoritative blade (which at its contact lies along the aim): no further off it than the ordinary cut
    const off = degrees(seen(guarded).fromEye, authoritative(strike, 0));
    assert.ok(off < 25 && off <= degrees(seen(plain).fromEye, authoritative(strike, 0)) + 2, `strike ${strike + 1}: ${off.toFixed(1)} degrees off the authoritative blade`);
    // and moving across the view the way the authoritative blade moves through its contact
    const dt = 0.04;
    const shown = seen(guardedComboPose(contact + dt).arm).onScreen.map((v, i) => v - seen(guardedComboPose(contact - dt).arm).onScreen[i]);
    const truth = screenOf(authoritative(strike, dt)).map((v, i) => v - screenOf(authoritative(strike, -dt))[i]);
    assert.ok(degrees([...shown, 0], [...truth, 0]) < 35, `strike ${strike + 1}: travels ${shown.map((v) => v.toFixed(2))} against ${truth.map((v) => v.toFixed(2))}`);
  }
});

test('Guard restrains the body, not the cut: shoulder and view held back, the free gauntlet out of it, finishes higher and shorter', () => {
  for (let t = 0; t <= COMBO_CYCLE; t += 1 / 120) {
    const guarded = guardedComboPose(t), plain = comboPose(t);
    assert.equal(guarded.offHand, null, `the free gauntlet never joins the grip (${t.toFixed(2)} s)`);
    assert.ok(Math.max(...guarded.counter.map(Math.abs)) < 1e-9, 'nor counterbalances the cut: it keeps its Guard or its spell');
    // the torso carries the arms less, the view leans less, and the shoulder opens less (it still brings the hand
    // where the cut needs it)
    const size = (v) => Math.hypot(...v);
    if (size(plain.body) > 0.01) assert.ok(size(guarded.body) < 0.5 * size(plain.body), `the torso commits less at ${t.toFixed(2)} s`);
    if (size(Object.values(plain.look)) > 0.005) assert.ok(size(Object.values(guarded.look)) < 0.5 * size(Object.values(plain.look)), `the view leans less at ${t.toFixed(2)} s`);
    if (size(plain.arm.shoulder) > 0.05) assert.ok(size(guarded.arm.shoulder) < 0.75 * size(plain.arm.shoulder), `the shoulder opens less at ${t.toFixed(2)} s`);
  }
  // the follow-through is stopped sooner and higher: never down round the hip as the ordinary forehand and chop go
  const low = (pose, t) => pose(t).arm.wrist[1];
  assert.ok(low(guardedComboPose, C1 + 0.22) > low(comboPose, C1 + 0.22) + 0.04, 'the forehand finishes higher');
  assert.ok(low(guardedComboPose, C3 + 0.08) > low(comboPose, C3 + 0.08) + 0.1, 'the descending strike stops at the waist');
  const sweep = (pose, contact) => Math.abs(seen(pose(contact + 0.2).arm).onScreen[0] - seen(pose(contact).arm).onScreen[0]);
  assert.ok(sweep(guardedComboPose, C1) < sweep(comboPose, C1), 'a shorter follow-through');
  // and the cock before the forehand opens less
  assert.ok(guardedComboPose(C1 - 0.16).arm.wrist[0] < comboPose(C1 - 0.16).arm.wrist[0] - 0.03, 'a smaller backswing');
});

test('the guarded chain is one continuous path: no snap of the hand, no flip of the grip, from the hold and back to it', () => {
  let previous = guardedComboPose(0);
  for (let t = 1 / 240; t <= COMBO_CYCLE; t += 1 / 240) {
    const pose = guardedComboPose(t);
    assert.ok(pose.arm.blade[2] < -0.3, `no backswing behind the hands at ${t.toFixed(3)} s`);
    assert.ok(pose.arm.wrist[1] > -0.34, `the hand never drops to the hip at ${t.toFixed(3)} s`);
    assert.ok(distance(previous.arm.wrist, pose.arm.wrist) < 0.02, `wrist moves without snapping at ${t.toFixed(3)} s`);
    assert.ok(angle(previous.raw.turn, pose.raw.turn) < 0.11, `grip never flips at ${t.toFixed(3)} s`);
    previous = pose;
  }
  const start = guardedBracePose(), end = guardedComboPose(COMBO_CYCLE);
  assert.ok(distance(start.arm.wrist, end.arm.wrist) < 1e-8);
  assert.ok(angle(start.raw.turn, end.raw.turn) < 1e-6);
  // contacts are the combat clock's own
  assert.deepEqual(COMBO_CONTACTS, [0.4, 1.1, 1.8]);
  assert.ok(MELEE_CONTACT.window.early > 0);
});

test('release after each guarded strike carries wrist velocity into a short, direct return to Guard',()=>{
  const h=1e-5;
  for(const from of COMBO_CONTACTS.map(t=>t+.1)) {
    const original=guardedComboPose(from), recovery=guardedRecoveryPose(from,0);
    assert.ok(distance(original.arm.wrist,recovery.arm.wrist)<1e-8);
    const before=guardedComboPose(from-h),after=guardedComboPose(from+h);
    const step=guardedRecoveryPose(from,h);
    const velocity=after.arm.wrist.map((v,i)=>(v-before.arm.wrist[i])/(2*h));
    const resumed=step.arm.wrist.map((v,i)=>(v-recovery.arm.wrist[i])/h);
    assert.ok(distance(velocity,resumed)<.02,'recovery retains outgoing velocity');
    let previous=recovery;
    for(let elapsed=1/240;elapsed<=.31;elapsed+=1/240) {
      const next=guardedRecoveryPose(from,elapsed);
      assert.ok(distance(previous.arm.wrist,next.arm.wrist)<.025);
      assert.ok(angle(previous.raw.turn,next.raw.turn)<.12);
      previous=next;
    }
    assert.ok(distance(previous.arm.wrist,guardedBracePose().arm.wrist)<1e-8);
  }
});

test('entering and lowering Chivalry Guard blend the ordinary path without changing its clock; without Guard it is the ordinary cut',()=>{
  const ordinary={...comboPose(COMBO_CONTACTS[1]),weight:.6};
  assert.equal(guardedSwordPose(ordinary,0),ordinary,'an ordinary (non-Chivalry) cut is untouched');
  const defended=guardedSwordPose(ordinary,1);
  const half=guardedSwordPose(ordinary,.5);
  assert.equal(defended.time,ordinary.time);
  assert.equal(defended.strike,ordinary.strike);
  assert.ok(distance(half.arm.wrist,ordinary.arm.wrist)<=distance(defended.arm.wrist,ordinary.arm.wrist)+1e-9);
  assert.equal(half.weight,.8,'ordinary release fades into the persistent defended stance');
});
