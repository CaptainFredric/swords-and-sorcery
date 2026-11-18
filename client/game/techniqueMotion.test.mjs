import test from 'node:test';
import assert from 'node:assert/strict';
import { RIPOSTE_MOTION, ripostePhases, riposteBody, riposteView, whirlBody, whirlSpin, whirlView } from './techniqueMotion.mjs';
import { SWORD_TECHNIQUE_CONTRACTS } from '../../shared/src/swordTechniqueContracts.mjs';

const turn = (body, bone, axis) => body.turns.filter((t) => t.bone === bone && t.axis.join() === axis.join()).reduce((s, t) => s + t.angle, 0);

test('the Riposte\'s body keeps the server\'s clock: braced through the interception, driving from the lunge', () => {
  const contract = SWORD_TECHNIQUE_CONTRACTS.rigid_riposte;
  assert.equal(RIPOSTE_MOTION.brace, contract.activeFrom);
  assert.equal(RIPOSTE_MOTION.driveTo, contract.activeUntil);
  const braced = ripostePhases(contract.activeFrom - 0.01);
  assert.ok(braced.coil > 0.95 && braced.drive === 0, 'coiled, not yet driving, as the brace ends');
  const driving = ripostePhases(contract.activeFrom + 0.1);
  assert.ok(driving.drive > 0.9 && driving.coil < 0.1, 'the coil let go into the drive within a tenth of a second');
  assert.ok(ripostePhases(0.34).air > 0.9, 'off the ground mid-lunge');
  assert.equal(ripostePhases(0.2).air, 0);
  assert.equal(ripostePhases(0.5).air, 0);
  const done = ripostePhases(contract.activeUntil + RIPOSTE_MOTION.hold + RIPOSTE_MOTION.rise + 0.01);
  assert.ok(done.drive < 1e-6 && done.coil === 0, 'risen out of the lunge');
});

test('the Riposte drives the torso forward behind the point, and sinks for the brace and the landing', () => {
  const brace = riposteBody(0.2), drive = riposteBody(0.34), land = riposteBody(0.52);
  assert.ok(turn(brace, 'spine', [1, 0, 0]) > 0, 'drawn back for the brace');
  assert.ok(turn(drive, 'spine', [1, 0, 0]) < -0.2, 'pitched in behind the point');
  assert.ok(turn(drive, 'chest', [0, 1, 0]) > 0.15, 'the sword shoulder driven forward');
  assert.ok(brace.crouch > 0.2 && land.crouch > 0.05, 'weight sunk for the brace and the landing');
  assert.equal(drive.turns.filter((t) => /thigh|shin|foot|arm|hand/.test(t.bone)).length, 0, 'the legs and the sword are the clip\'s');
});

test('the Riposte\'s view stays restrained: a degree or two of lean, a small widening only in the leap', () => {
  for (let age = 0; age <= 1; age += 0.01) {
    const v = riposteView(age);
    assert.ok(Math.abs(v.camera.pitch) < 0.05 && Math.abs(v.camera.roll) < 0.04, `lean at ${age}`);
    assert.ok(v.fov <= 6 && v.fov >= 0);
  }
  assert.equal(riposteView(0.2).fov, 0);
  assert.ok(riposteView(0.34).fov > 5);
});

test('the Whirl leans into its spin, builds through the first revolution and eases out on release', () => {
  const at = (phase, startedAt, now, endsAt) => ({ phase, startedAt, initialStartedAt: startedAt, endsAt });
  assert.equal(whirlSpin(null, 1), 0);
  assert.ok(whirlSpin(at('active', 0), 0.05) < 0.2, 'building at the start');
  assert.equal(whirlSpin(at('active', 0), 0.6), 1);
  assert.ok(whirlSpin(at('recovery', 0, 0, 1.45), 1.35) < 1 && whirlSpin(at('recovery', 0, 0, 1.45), 1.5) === 0, 'eased out after release');
  const body = whirlBody(at('active', 0), 0.6);
  assert.ok(turn(body, 'spine', [0, 0, 1]) > 0.1, 'leaned into the turn');
  assert.ok(turn(body, 'chest', [0, 1, 0]) > 0.1, 'the chest leading the sword round');
  assert.equal(body.turns.filter((t) => /arm|hand/.test(t.bone)).length, 0, 'the sword arm left to its own path');
  assert.deepEqual(whirlBody(at('active', 0), 0).turns, []);
  assert.equal(whirlView(null, 1), null);
  assert.ok(Math.abs(whirlView(at('active', 0), 0.6).camera.roll) < 0.04, 'the view leans only a little');
});
