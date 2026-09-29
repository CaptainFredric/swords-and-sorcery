import test from 'node:test';
import assert from 'node:assert/strict';
import { DEATH_CAM, deathCamera, deathCardText, killerCamPolicy, lookAt } from './deathCam.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { segmentAabbHit } from '../../shared/src/collision.mjs';

// I stand at the origin facing -z (yaw 0); the killer stands 2 m in front of me and knocks me straight back (+z)
const death = { eye: [0, 1.58, 0], yaw: 0, pitch: 0, push: [0, 1], ground: 0 };
const killer = [0, 0, -2];
const fell = DEATH_CAM.react * 0.5 + DEATH_CAM.fall;
const lifted = fell + DEATH_CAM.hold + DEATH_CAM.lift;

test('the blow lands, then the view goes down with the body and my arms fall out of view', () => {
  const start = deathCamera(0, death, killer);
  assert.deepEqual(start.position.map((v) => +v.toFixed(6)), [0, 1.58, 0], 'from exactly where I stood');
  assert.equal(start.roll, 0);
  assert.equal(start.arms, 1);
  // quickly going, then gone: on the ground, carried back by the blow, rolled over and tipped to the sky
  const down = deathCamera(fell + 0.25, death, killer);
  assert.ok(Math.abs(down.position[1] - DEATH_CAM.low) < 0.02, 'lying on the ground');
  assert.ok(down.position[2] > 0.4, 'carried back along the blow');
  assert.ok(Math.abs(down.roll) > 0.3 && down.pitch > 0.3, 'rolled over, looking up');
  assert.equal(down.arms, 0, 'my arms are gone from view');
  // it falls, faster as it goes: the first half of the fall covers less than the second
  const at = (t) => deathCamera(t, death, killer).position[1];
  const mid = DEATH_CAM.react * 0.5 + DEATH_CAM.fall / 2;
  assert.ok(1.58 - at(mid) < at(mid) - at(fell), 'it accelerates');
});

test('then it holds a beat on the ground, lifts away and turns to find the killer, and keeps them in view', () => {
  const holding = [fell + 0.22, fell + DEATH_CAM.hold - 0.01].map((t) => deathCamera(t, death, killer).position);
  assert.ok(Math.hypot(holding[0][0] - holding[1][0], holding[0][1] - holding[1][1], holding[0][2] - holding[1][2]) < 0.01, 'a still beat');
  const watching = deathCamera(lifted + 0.3, death, killer);
  assert.ok(watching.position[1] > 1.4, 'up off the ground');
  assert.equal(watching.roll, 0, 'the world level again');
  const want = lookAt(watching.position, [killer[0], killer[1] + 1.2, killer[2]]);
  assert.ok(Math.abs(watching.yaw - want.yaw) < 1e-6 && Math.abs(watching.pitch - want.pitch) < 1e-6, 'looking at them');
  // following them: when they walk off, the view turns after them
  const walked = deathCamera(lifted + 0.6, death, [3, 0, -2]);
  assert.ok(Math.abs(walked.yaw - watching.yaw) > 0.3);
  // with nobody to find (the abyss), it rises over the body and looks down at it
  const alone = deathCamera(lifted + 0.3, death, null);
  assert.ok(alone.position[1] > 2 && alone.pitch < -0.8);
});

test('a duel follows the killer freely; team and objective modes only glimpse them, then hold still', () => {
  for (const mode of [GAME_MODES.DUEL, GAME_MODES.BOT_DUEL, GAME_MODES.PRACTICE, GAME_MODES.FFA]) {
    assert.equal(killerCamPolicy(mode).look, 'follow', mode);
  }
  const team = killerCamPolicy('TEAM_OBJECTIVE');
  assert.equal(team.look, 'glimpse');
  assert.ok(team.seconds <= 1, 'only a glimpse');
  // past the glimpse, the view stays on where they were, not where they go
  const seen = [0, 0, -2];
  const later = deathCamera(lifted + team.seconds + 0.5, death, [6, 0, -8], { policy: team, seen });
  const want = lookAt(later.position, [seen[0], seen[1] + 1.2, seen[2]]);
  assert.ok(Math.abs(later.yaw - want.yaw) < 1e-6, 'held on the glimpse');
  // with camera motion turned down, it does not roll
  assert.equal(deathCamera(fell + 0.2, death, killer, { motion: 0 }).roll, 0);
});

test('dying against a wall, the view stops short of it instead of going into the stone', () => {
  // a wall 0.4 m behind me, right where the blow carries me
  const wall = { center: [0, 2, 0.4 + 0.5], size: [6, 4, 1] };
  const reach = (from, to) => segmentAabbHit(from, to, wall)?.t ?? 1;
  for (const age of [fell + 0.25, fell + DEATH_CAM.hold + DEATH_CAM.lift + 0.5]) {
    const view = deathCamera(age, death, killer, { reach });
    assert.ok(view.position[2] <= 0.4 - 0.2, `clear of the wall at ${age.toFixed(2)}s (z ${view.position[2].toFixed(2)})`);
  }
  // in the open, nothing changes
  assert.deepEqual(deathCamera(fell + 0.25, death, killer, { reach: () => 1 }), deathCamera(fell + 0.25, death, killer));
});

test('the death card: who, how, and how close it was', () => {
  assert.deepEqual(deathCardText({ killerName: 'Astra', source: 'sword', killerHealth: 3 }), { name: 'Astra', how: 'Sword', left: '3 HP REMAINING' });
  assert.equal(deathCardText({ killerName: 'Astra', source: 'fireball', killerHealth: 100 }).how, 'Fireball');
  assert.equal(deathCardText({ killerName: 'Astra', source: 'burn', killerHealth: 2.2 }).left, '3 HP REMAINING', 'never rounds a living knight down to 0');
  assert.deepEqual(deathCardText({ killerName: null, source: 'abyss' }), { name: 'THE ABYSS', how: 'The fall', left: '' });
});
