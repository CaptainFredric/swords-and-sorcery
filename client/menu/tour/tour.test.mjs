import test from 'node:test';
import assert from 'node:assert/strict';
import { CASTLEWARD } from '../../../shared/worlds/castleward.mjs';
import { TOUR_POINTS, buildTourPath, yawFacing } from './tourPath.mjs';
import { FIGHTS, clipAt, keyed } from './tourFights.mjs';
import { FIGHT_DISTANCES, buildSchedule, tourMoment } from './tourSchedule.mjs';
import {
  FIGHT_SHOT, FOLLOW_SETTINGS, blocked, blockedMoments, castlewardBlockers, chooseSwing, fightFrame, fightPair, fightShot,
  followEye, followPlan, lookFor,
} from './tourCamera.mjs';
import { insideCastlewardFootprint } from '../../worlds/castlewardDecor.mjs';

const path = buildTourPath();

const gapTo = (x, z, solid) => Math.hypot(
  Math.max(0, Math.abs(x - solid.center[0]) - solid.size[0] / 2),
  Math.max(0, Math.abs(z - solid.center[2]) - solid.size[2] / 2),
);

test('the round keeps to open ground: clear of every wall, well, stall, bale and post, and closed on itself', () => {
  assert.ok(path.length > 60 && path.length < 120, `a round of ${path.length.toFixed(1)} m`);
  for (let d = 0; d < path.length; d += 0.25) {
    const p = path.at(d);
    for (const solid of CASTLEWARD.solids) {
      if (solid.center[1] - solid.size[1] / 2 > 1.8) continue;   // walls up on the Bailey are not in the way
      assert.ok(gapTo(p.x, p.z, solid) > 0.75, `${solid.id} at ${d.toFixed(1)} m (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
    const ground = CASTLEWARD.floors.some((floor) => floor.y === 0
      && Math.abs(p.x - floor.center[0]) <= floor.size[0] / 2 && Math.abs(p.z - floor.center[2]) <= floor.size[2] / 2);
    assert.ok(ground, `off the ground at ${d.toFixed(1)} m`);
  }
  const start = path.at(0);
  const end = path.at(path.length - 1e-6);
  assert.ok(Math.hypot(start.x - end.x, start.z - end.z) < 1e-3, 'it comes home');
  assert.deepEqual([start.x, start.z].map((v) => +v.toFixed(2)), TOUR_POINTS[0]);
  // a knight facing -z faces north with yaw 0, east with -pi/2
  assert.equal(yawFacing([0, -1]), 0);
  assert.ok(Math.abs(yawFacing([1, 0]) + Math.PI / 2) < 1e-9);
});

test('each rival waits on the round, with room around him for his fight, and neither knight ever stands in a wall', () => {
  FIGHT_DISTANCES.forEach((distance, index) => {
    const fight = FIGHTS[index];
    const anchor = path.at(distance);
    const side = fight.side ?? 1;
    const across = [anchor.dir[1] * side, -anchor.dir[0] * side];
    const rival = [anchor.x + across[0] * fight.reach, anchor.z + across[1] * fight.reach];
    for (const solid of CASTLEWARD.solids) {
      if (solid.center[1] - solid.size[1] / 2 > 1.8) continue;
      // a whole reach of room around him (the whirlwind's stroll circles him at it)
      assert.ok(gapTo(rival[0], rival[1], solid) > fight.reach + 0.4, `${fight.id}: ${solid.id} too close to the rival`);
    }
    // wherever the fight takes them (a leap back, a stroll round, a run for it), both stay on open ground
    const frame = fightFrame(path, fight, distance);
    for (let t = -1; t <= fight.duration; t += 0.1) {
      const { hero, rival: runner, rivalHere } = fightPair(fight, frame, t);
      for (const [who, at] of [['the Spellblade', hero], ['the rival', runner]]) {
        if (who === 'the rival' && !rivalHere) continue;
        for (const solid of CASTLEWARD.solids) {
          if (solid.center[1] - solid.size[1] / 2 > 1.8) continue;
          assert.ok(gapTo(at[0], at[1], solid) > 0.45, `${fight.id}: ${who} in ${solid.id} at ${t.toFixed(1)} s`);
        }
        assert.ok(insideCastlewardFootprint(at[0], at[1], -0.6), `${fight.id}: ${who} off the ground at ${t.toFixed(1)} s`);
      }
    }
  });
});

test('the schedule is one smooth run: he never jumps along the path, and stops dead for each fight', () => {
  const schedule = buildSchedule(path.length);
  let last = tourMoment(schedule, 0);
  assert.equal(last.distance, 0);
  assert.equal(last.phase, 'rest');
  for (let t = 0.05; t < schedule.duration; t += 0.05) {
    const now = tourMoment(schedule, t);
    assert.ok(now.distance >= last.distance - 1e-6, 'never backwards');
    assert.ok(now.distance - last.distance <= schedule.pace.speed * 0.05 + 1e-6, 'never faster than a run');
    assert.ok(Math.abs(now.speed - last.speed) < 1.2, 'no jolts in pace');
    if (now.phase === 'fight') assert.equal(now.speed, 0);
    last = now;
  }
  assert.ok(Math.abs(last.distance - path.length) < 0.05, 'home at the end');
  const fights = schedule.phases.filter((phase) => phase.kind === 'fight');
  assert.deepEqual(fights.map((phase) => phase.from), FIGHT_DISTANCES);
  // every rival's clock: waiting before, fighting at his time, lying where he fell after, and waiting again next round
  const second = fights[1].start + 1;
  const moment = tourMoment(schedule, second);
  assert.ok(moment.fightTimes[0] > FIGHTS[0].duration, 'the first is done for');
  assert.ok(Math.abs(moment.fightTimes[1] - 1) < 1e-9);
  assert.ok(moment.fightTimes[2] < -10, 'the third has a while yet');
  const nextRound = tourMoment(schedule, schedule.duration + 0.5).fightTimes[0];
  assert.ok(nextRound < -5 && FIGHTS[0].rival(nextRound).clip === 'Idle', 'next round, he is back and waiting');
});

test('every fight hands the Spellblade back to the path as it found him, facing on down it', () => {
  for (const fight of FIGHTS) {
    for (const t of [0, fight.duration]) {
      const hero = fight.hero(t);
      assert.ok(Math.abs(hero.u) < 1e-6 && Math.abs(hero.v) < 1e-6, `${fight.id}: on the path at ${t}`);
      assert.ok(Math.abs(Math.cos(hero.heading)) < 1e-6 && Math.sin(hero.heading) > 0.99, `${fight.id}: facing along it at ${t}`);
    }
    // cues all happen within the fight, in order
    const times = fight.cues.map((cue) => cue.at);
    assert.deepEqual(times, [...times].sort((a, b) => a - b), `${fight.id}: cues in order`);
    assert.ok(times.every((at) => at >= 0 && at <= fight.duration), `${fight.id}: cues inside the fight`);
    // before he arrives the rival waits at his place; long after, he is beaten one way or another
    const waiting = fight.rival(-30);
    assert.equal(waiting.clip, 'Idle');
    assert.equal(waiting.u, fight.reach);
  }
  const [fireball, whirlwind, whiteFlag] = FIGHTS;
  assert.equal(fireball.rival(20).clip, 'Death', 'burned down');
  assert.ok(fireball.cues.some((cue) => cue.type === 'burn'));
  assert.equal(whirlwind.rival(20).gone, true, 'fallen to pieces');
  assert.ok(whirlwind.cues.some((cue) => cue.type === 'shatter'));
  assert.equal(whiteFlag.rival(20).gone, true, 'run off with his flag');
  assert.ok(whiteFlag.cues.some((cue) => cue.type === 'cut') && whiteFlag.cues.some((cue) => cue.type === 'flag'));
  // the duck is deep while the fireball passes
  const flight = whiteFlag.cues.find((cue) => cue.type === 'cast');
  assert.ok(whiteFlag.hero(flight.at + flight.flight / 2).crouch > 0.8);
});

test('every fight is filmed in clear view: nothing solid between the camera and either knight, and the camera inside the walls', () => {
  const blockers = castlewardBlockers();
  FIGHTS.forEach((fight, index) => {
    const frame = fightFrame(path, fight, FIGHT_DISTANCES[index]);
    const swing = chooseSwing(fight, frame, blockers);
    assert.equal(blockedMoments(fight, frame, swing, blockers), 0, `${fight.id}: in clear view (turned ${swing})`);
    const look = lookFor(frame, swing);
    for (let t = -0.4; t <= fight.duration; t += 0.1) {
      const { hero, rival } = fightPair(fight, frame, t + FIGHT_SHOT.lead);
      const shot = fightShot(hero, rival, look);
      const [x, y, z] = shot.position;
      assert.ok(insideCastlewardFootprint(x, z), `${fight.id}: the camera stands in Castleward at ${t.toFixed(1)} s`);
      assert.ok(y > 1.5 && y < 2.6, `${fight.id}: at eye height`);
      // never on top of either of them, and never so far back that they are specks
      for (const at of [hero, rival]) {
        const range = Math.hypot(x - at[0], z - at[1]);
        assert.ok(range > 2.5, `${fight.id}: the camera keeps its distance at ${t.toFixed(1)} s (${range.toFixed(1)} m)`);
      }
      assert.ok(Math.hypot(x - hero[0], z - hero[1]) < 11, `${fight.id}: the Spellblade stays close enough to read`);
    }
  });
  // a rival far off is framed as if he were only so far away, and one the fight lets go of not at all
  assert.deepEqual(fightShot([0, 0], [30, 0], [0, 1]), fightShot([0, 0], [FIGHT_SHOT.maxSpread, 0], [0, 1]));
  assert.deepEqual(fightShot([0, 0], [30, 0], [0, 1], { held: 0 }), fightShot([0, 0], [0, 0], [0, 1]));
  const [, , whiteFlag] = FIGHTS;
  assert.equal(whiteFlag.rival(6).framed, 1);
  assert.equal(whiteFlag.rival(9.5).framed, 0, 'the White Flag lets him go as he runs');
  // and the pair lands in the clear part of the screen, whatever its shape
  for (const aspect of [4 / 3, 16 / 9, 2.16]) {
    const shot = fightShot([0, 0], [2, 0], [0, 1], { aspect });
    const along = [shot.target[0] - shot.position[0], shot.target[2] - shot.position[2]];
    const depth = Math.hypot(...along);
    const spread = Math.tan((FIGHT_SHOT.fov * Math.PI) / 360) * aspect;
    // looking north (+z), east (+x) is on the left: screen x runs with -x
    const screen = (x) => 0.5 + (0.5 * (shot.position[0] - x)) / (depth * spread);
    const shares = [2 + FIGHT_SHOT.reach, -FIGHT_SHOT.reach].map(screen);
    assert.ok(shares[0] >= FIGHT_SHOT.clear[0] - 1e-6 && shares[1] <= FIGHT_SHOT.clear[1] + 1e-6, `${aspect}: ${shares.map((v) => v.toFixed(2))}`);
  }
});

test('on the run the camera sees him all the way round, from inside the walls, and often from its usual place', () => {
  const blockers = castlewardBlockers();
  const plan = followPlan(path, blockers);
  let usual = 0;
  let samples = 0;
  for (let d = 0; d < path.length; d += 0.1) {
    const here = path.at(d);
    const setting = plan.at(d);
    const eye = followEye(here, setting);
    assert.ok(insideCastlewardFootprint(eye[0], eye[2]), `inside the walls at ${d.toFixed(1)} m`);
    assert.ok(!blocked(eye, [here.x, here.z], blockers), `nothing between the camera and him at ${d.toFixed(1)} m`);
    // it glides: never climbing or closing in faster than 0.8 m for every metre he runs
    const next = plan.at(d + 0.1);
    assert.ok(Math.abs(next.up - setting.up) < 0.08 && Math.abs(next.back - setting.back) < 0.08, `a jolt at ${d.toFixed(1)} m`);
    samples += 1;
    if (Math.abs(setting.up - FOLLOW_SETTINGS[0].up) < 1e-6) usual += 1;
  }
  // (the meadow, the gateway and the Tourney Field crowd his left, so it rides higher through them)
  assert.ok(usual / samples > 0.4, `the usual shot for much of the way (${((100 * usual) / samples).toFixed(0)}%)`);
});

test('keyed values ease between keys and hold at the ends; clips play from their start or hold a frame', () => {
  assert.equal(keyed([[0, 0], [1, 10]], -1), 0);
  assert.equal(keyed([[0, 0], [1, 10]], 0.5), 5);
  assert.equal(keyed([[0, 0], [1, 10]], 2), 10);
  const sheet = [[0, 'Idle', { loop: true }], [1, 'Slash_1'], [2, 'Guard', { hold: 0.4 }]];
  assert.deepEqual(clipAt(sheet, 0.5), { clip: 'Idle', time: 0.5, loop: true });
  assert.deepEqual(clipAt(sheet, 1.25), { clip: 'Slash_1', time: 0.25, loop: false });
  assert.deepEqual(clipAt(sheet, 5), { clip: 'Guard', time: 0.4, loop: false });
});
