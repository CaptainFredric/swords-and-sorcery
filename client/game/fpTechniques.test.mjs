import test from 'node:test';
import assert from 'node:assert/strict';
import { FP_RIPOSTE, riposteFirstPersonPose } from './fpTechniques.mjs';
import { RIPOSTE_MOTION } from './techniqueMotion.mjs';
import { REST_ARM } from './fpSlash.mjs';

const DEG = 180 / Math.PI;
const offAim = (blade) => Math.acos(Math.max(-1, Math.min(1, -blade[2] / Math.hypot(...blade)))) * DEG;

test('the first-person Riposte braces, then drives the sword forward along the aim on the server\'s clock', () => {
  const loaded = riposteFirstPersonPose(RIPOSTE_MOTION.brace - 0.005).arm;
  const driven = riposteFirstPersonPose(RIPOSTE_MOTION.brace + FP_RIPOSTE.driveSec + 0.02).arm;
  assert.ok(loaded.wrist[2] > -0.55 && loaded.wrist[2] > riposteFirstPersonPose(0.1).arm.wrist[2] + 0.08, 'drawn back from the interception as the brace ends (still in view)');
  // (the hand within the arm's reach; the body carries it on: the arms' root driven forward with it)
  const bodyDriven = riposteFirstPersonPose(RIPOSTE_MOTION.brace + FP_RIPOSTE.driveSec + 0.02).body;
  assert.ok(driven.wrist[2] + bodyDriven[2] - loaded.wrist[2] < -0.3, `thrown forward ${(loaded.wrist[2] - driven.wrist[2] - bodyDriven[2]).toFixed(2)} m`);
  assert.ok(driven.wrist[2] > -0.75, 'never past the arm\'s reach');
  // the point on the crosshair (the sword's tip, a sword's length on from the wrist, seen near the middle of the view)
  const onScreen = (arm) => { const tip = arm.wrist.map((v, i) => v + arm.blade[i] * 1.1); return Math.hypot(tip[0] / -tip[2], tip[1] / -tip[2]); };
  assert.ok(onScreen(loaded) < 0.12 && onScreen(driven) < 0.12, `the point on the crosshair, loaded (${onScreen(loaded).toFixed(2)}) and driven (${onScreen(driven).toFixed(2)})`);
  assert.ok(offAim(driven.blade) > 8, 'not laid along the line of sight, where only its guard would show');
  // the interception before it: the blade up across the body
  assert.ok(riposteFirstPersonPose(0.1).arm.blade[1] > 0.7, 'the blade raised to take the blow');
  // held at full stretch to the lunge's end
  const held = riposteFirstPersonPose(RIPOSTE_MOTION.driveTo).arm;
  assert.ok(Math.hypot(...held.wrist.map((v, i) => v - driven.wrist[i])) < 0.01);
});

test('the first-person Riposte comes home and lets go of the arms', () => {
  const end = RIPOSTE_MOTION.driveTo + RIPOSTE_MOTION.hold + RIPOSTE_MOTION.rise;
  const nearly = riposteFirstPersonPose(end - 0.001).arm;
  assert.ok(Math.hypot(...nearly.wrist.map((v, i) => v - REST_ARM.wrist[i])) < 0.01, 'home at rest');
  assert.equal(riposteFirstPersonPose(end + 0.01), null);
  assert.equal(riposteFirstPersonPose(-0.1), null);
  // smooth from frame to frame (no hand jumps, even through the drive)
  let previous = riposteFirstPersonPose(0);
  for (let t = 1 / 60; t < end; t += 1 / 60) {
    const pose = riposteFirstPersonPose(t);
    assert.ok(Math.hypot(...pose.arm.wrist.map((v, i) => v - previous.arm.wrist[i])) < 0.1, `the hand jumps at ${t.toFixed(3)}`);
    previous = pose;
  }
});

test('the first-person Riposte begins from the sword as it was shown: out of a Guard just let go it never jumps', async () => {
  const { guardTargets } = await import('./fpGuardPose.mjs');
  const { mixSwordArm } = await import('./fpTechniques.mjs');
  // a Guard fully up, and one half let go (as a Riposte pressed at once after letting go finds it)
  for (const shown of [guardTargets(0).arm, mixSwordArm(null, guardTargets(0).arm, 0.5)]) {
    const first = riposteFirstPersonPose(0, undefined, undefined, shown).arm;
    assert.ok(Math.hypot(...first.wrist.map((v, i) => v - shown.wrist[i])) < 1e-6, 'the hand where it was');
    const tip = (a) => a.wrist.map((v, i) => v + a.blade[i] * 1.1);
    let previous = tip(first);
    let most = 0;
    for (let t = 1 / 60; t < RIPOSTE_MOTION.brace + FP_RIPOSTE.driveSec; t += 1 / 60) {
      const now = tip(riposteFirstPersonPose(t, undefined, undefined, shown).arm);
      most = Math.max(most, Math.hypot(...now.map((v, i) => v - previous[i])));
      previous = now;
    }
    // no faster than the forehand at its contact (800 degrees a second, about 0.25 m a frame at the point): the parry
    // snaps across as a cut does. (Before, out of the Guard the arms were pulled toward rest first, 0.27 m a frame.)
    assert.ok(most < 0.25, `the point moves ${most.toFixed(3)} m in a frame through the brace and drive`);
  }
  // the hand never rolls in a snatch: from rest it keeps its roll, out of a Guard the turn back is spread out (before,
  // the interception's edge faced the other way and the gauntlet rolled a quarter turn in one frame)
  const roll = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((s, x, i) => s + x * b[i], 0)))) * DEG;
  for (const shown of [null, guardTargets(0).arm]) {
    let previous = riposteFirstPersonPose(0, undefined, undefined, shown).arm;
    for (let t = 1 / 60; t < 0.9; t += 1 / 60) {
      const now = riposteFirstPersonPose(t, undefined, undefined, shown);
      if (!now) break;
      assert.ok(roll(previous.edge, now.arm.edge) < 16, `the hand rolls ${roll(previous.edge, now.arm.edge).toFixed(1)} degrees in a frame at ${t.toFixed(3)}${shown ? ' out of the Guard' : ''}`);
      previous = now.arm;
    }
  }
  // and the drive is the fast part: quicker than the draw back before it
  const step = (t) => { const a = riposteFirstPersonPose(t).arm, b = riposteFirstPersonPose(t + 1 / 60).arm; return Math.hypot(...a.wrist.map((v, i) => v - b.wrist[i])); };
  const drawn = Math.max(...Array.from({ length: 8 }, (_, k) => step(FP_RIPOSTE.loadFrom + k / 60)));
  const driven = Math.max(...Array.from({ length: 6 }, (_, k) => step(RIPOSTE_MOTION.brace + k / 60)));
  assert.ok(driven > 1.5 * drawn, `the hand drives at ${driven.toFixed(3)} m a frame, drawn back at ${drawn.toFixed(3)}`);
});
