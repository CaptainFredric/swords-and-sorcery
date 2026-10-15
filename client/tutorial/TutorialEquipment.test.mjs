import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialEquipment } from './TutorialEquipment.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { DRAW_END, REST_ARM, drawPose } from '../game/fpSlash.mjs';

// a weapon as the controller sees it: its equipment, and what it was asked to do
function weapon() {
  const calls = [];
  const w = { equipment: { sword: 'out', hand: 'out' }, calls,
    setEquipment({ sword = true, hand = true }) { calls.push(`set ${sword} ${hand}`); this.equipment.sword = sword ? 'out' : 'away'; this.equipment.hand = hand ? 'out' : 'away'; },
    drawSword() { calls.push('draw'); this.equipment.sword = 'drawing'; return true; },
    revealHand() { calls.push('reveal'); this.equipment.hand = 'revealing'; return true; } };
  return w;
}
function rig() {
  const director = new TutorialDirector(); director.start();
  const equipment = new TutorialEquipment({ session: () => ({ director }) });
  return { director, equipment, w: weapon() };
}

test('the draw is had from the hip, out of sight, and ends exactly on the hand\'s rest', () => {
  const start = drawPose(0), end = drawPose(DRAW_END);
  assert.ok(start.arm.wrist[1] < -0.9, 'down at the hip');
  for (let i = 0; i < 3; i += 1) assert.ok(Math.abs(end.arm.wrist[i] - REST_ARM.wrist[i]) < 1e-6);
  const blade = end.arm.blade, rest = REST_ARM.blade, l = Math.hypot(...rest);
  // (the blade trails the hand by a hundredth of a second, as in every path)
  assert.ok(blade.every((v, i) => Math.abs(v - rest[i] / l) < 2e-2), 'the blade at rest');
});

test('both arms are away at the start; the sword is drawn on "Try placating him."; the hand raised on "I knew that!"', () => {
  const { director, equipment, w } = rig();
  equipment.step(1 / 60, w);
  assert.deepEqual(w.equipment, { sword: 'away', hand: 'away' });
  // the lesson had up to the placating line: drawn a moment into it, played
  director.resumeAt('negotiations'); equipment.step(1 / 60, w);
  w.calls.length = 0;
  director.completeDialogue(director.cue); director.tick(0); director.tick(1);
  assert.equal(director.current.id, 'placate');
  equipment.step(0.1, w); assert.equal(w.equipment.sword, 'away', 'not on its first word');
  equipment.step(0.3, w); assert.deepEqual(w.calls, ['draw']);
  // on to the Fireball lesson's line: the hand raised as it is said
  director.resumeAt('magic-disposal'); equipment.step(1 / 60, w);
  assert.equal(w.equipment.hand, 'away');
  w.calls.length = 0;
  director.completeDialogue(director.cue); director.tick(0); director.tick(1);
  assert.equal(director.current.id, 'waiting-reminder');
  equipment.step(0.05, w); equipment.step(0.2, w); assert.deepEqual(w.calls, ['reveal']);
});

test('a retry, a checkpoint or a chapter begun has the arms as that place has them, at once', () => {
  const { director, equipment, w } = rig();
  director.resumeAt('bridge-arrival'); equipment.step(1 / 60, w);
  assert.deepEqual(w.equipment, { sword: 'out', hand: 'out' });
  assert.ok(!w.calls.includes('draw') && !w.calls.includes('reveal'), 'no draw, no reveal: there already');
  director.resumeAt('introduce-yourself'); equipment.step(1 / 60, w);
  assert.deepEqual(w.equipment, { sword: 'away', hand: 'away' });
  director.resumeAt('good-health'); equipment.step(1 / 60, w);
  assert.deepEqual(w.equipment, { sword: 'out', hand: 'away' });
  // (the tutorial over: both out, as everywhere else)
  director.skip(); equipment.step(1 / 60, w);
  assert.deepEqual(w.equipment, { sword: 'out', hand: 'out' });
});

test('a Fireball cast before its line raises the hand, and it stays raised', () => {
  const { director, equipment, w } = rig();
  director.resumeAt('why-spellblade'); equipment.step(1 / 60, w);
  assert.equal(w.equipment.hand, 'away');
  w.equipment.hand = 'revealing';   // (WeaponView.cast: a quick reveal with the cast)
  for (let i = 0; i < 30; i += 1) equipment.step(1 / 60, w);
  assert.notEqual(w.equipment.hand, 'away');
});

test('reset() clears active, clock, last and line state cleanly', () => {
  const { director, equipment, w } = rig();
  equipment.step(1 / 60, w);
  assert.equal(equipment.active, true);
  assert.ok(equipment.clock > 0);
  assert.ok(equipment.last !== null);
  equipment.reset();
  assert.equal(equipment.active, false);
  assert.equal(equipment.clock, 0);
  assert.equal(equipment.last, null);
  assert.equal(equipment.line, null);
});
