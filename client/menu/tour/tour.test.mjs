import test from 'node:test';
import assert from 'node:assert/strict';
import { CASTLEWARD } from '../../../shared/worlds/castleward.mjs';
import { TOUR_POINTS, buildTourPath, yawFacing } from './tourPath.mjs';
import { FIGHTS, FIGHT_POOL, clipAt, keyed, makeWhirlwind } from './tourFights.mjs';
import { FIGHT_DISTANCES, buildSchedule, lineupFor, roundRandom, tourMoment } from './tourSchedule.mjs';
import {
  COMPACT_SHOT, FIGHT_SHOT, FOLLOW_SETTINGS, blocked, blockedMoments, castlewardBlockers, fightPair, fightShot, followAim, followEye, followPlan,
  lookFor, placeFight,
} from './tourCamera.mjs';
import { insideCastlewardFootprint } from '../../worlds/castlewardDecor.mjs';

const path = buildTourPath();
const blockers = castlewardBlockers();

// every version of every fight in the pool (the whirlwind's spins vary), as the round would try them
const VERSIONS = Object.entries(FIGHT_POOL).map(([name, versions]) => [name, versions(() => 0), versions(() => 0.99)]);
// where a stop stages a fight: the first version that places (as TourDirector does)
const placements = new Map();
function stage(name, slot, random = () => 0) {
  const key = `${name}@${slot}@${random()}`;
  if (!placements.has(key)) {
    placements.set(key, FIGHT_POOL[name](random).map((fight) => placeFight(path, fight, FIGHT_DISTANCES[slot], blockers)).find(Boolean) ?? null);
  }
  return placements.get(key);
}

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

test('any fight can be staged at any stop: room around the rival, both knights on open ground all through it', () => {
  for (const [name] of VERSIONS) {
    FIGHT_DISTANCES.forEach((distance, slot) => {
      for (const random of [() => 0, () => 0.99]) {
        const placed = stage(name, slot, random);
        assert.ok(placed, `${name} has room at stop ${slot + 1}`);
        const { fight, frame } = placed;
        // wherever the fight takes them (a leap back, a walk away, a run for it), both stay on open ground
        for (let t = -1; t <= fight.duration; t += 0.1) {
          const { hero, rival, rivalHere } = fightPair(fight, frame, t);
          for (const [who, at] of [['the Spellblade', hero], ['the rival', rival]]) {
            if (who === 'the rival' && !rivalHere) continue;
            for (const solid of CASTLEWARD.solids) {
              if (solid.center[1] - solid.size[1] / 2 > 1.8) continue;
              assert.ok(gapTo(at[0], at[1], solid) > 0.45, `${name} at stop ${slot + 1}: ${who} in ${solid.id} at ${t.toFixed(1)} s`);
            }
            assert.ok(insideCastlewardFootprint(at[0], at[1], -0.6), `${name} at stop ${slot + 1}: ${who} off the ground at ${t.toFixed(1)} s`);
          }
        }
      }
    });
  }
});

test('each round stages the fights in another order: the first as written, never the same twice running', () => {
  assert.deepEqual(lineupFor(0), ['fireball', 'whirlwind', 'whiteFlag']);
  const seen = new Set();
  const slushAt = [];
  for (let round = 1; round < 24; round += 1) {
    const lineup = lineupFor(round);
    assert.notDeepEqual(lineup, lineupFor(round - 1), `round ${round} changes the order`);
    assert.equal(new Set(lineup).size, 3, 'three different fights');
    assert.ok(lineup.every((name) => FIGHT_POOL[name]), 'all from the pool');
    // the three of the first round, each once; now and then the Slush in one of their places
    const classic = lineup.filter((name) => name !== 'slush');
    if (classic.length === 3) seen.add(lineup.join());
    if (lineup.includes('slush')) slushAt.push([round, lineup.indexOf('slush')]);
    // and every round can be staged
    lineup.forEach((name, slot) => assert.ok(stage(name, slot, roundRandom(round)), `round ${round}: ${name} at stop ${slot + 1}`));
  }
  assert.equal(seen.size, 6, 'every order comes round');
  // the Slush: a discovery, not a fixture (never the first round, then every third), at each of the stops in turn
  assert.ok(!lineupFor(0).includes('slush') && !lineupFor(1).includes('slush'));
  assert.deepEqual(slushAt.map(([round]) => round), [2, 5, 8, 11, 14, 17, 20, 23]);
  assert.deepEqual(new Set(slushAt.map(([, slot]) => slot)), new Set([0, 1, 2]));
  // what varies within a fight from round to round: how many times the whirlwind goes round
  const turns = new Set(Array.from({ length: 20 }, (_, round) => FIGHT_POOL.whirlwind(roundRandom(round))[0].key));
  assert.ok(turns.size >= 2);
});

test('the schedule is one smooth run: he never jumps along the path, and stops dead for each fight', () => {
  const schedule = buildSchedule(path.length);
  let last = tourMoment(schedule, 0);
  assert.equal(last.distance, 0);
  assert.equal(last.phase, 'rest');
  for (let t = 0.05; t < schedule.duration; t += 0.05) {
    const now = tourMoment(schedule, t);
    assert.ok(now.distance >= last.distance - 1e-6, 'never backwards');
    // (a fight that ends with him walking away down the path has already carried him that far)
    const walked = last.phase === 'fight' && now.phase !== 'fight' ? FIGHTS[last.fight].exit ?? 0 : 0;
    assert.ok(now.distance - last.distance <= schedule.pace.speed * 0.05 + walked + 1e-6, 'never faster than a run');
    // (and the run picks up from the pace he was walking at, which the fight, not the schedule, gave him)
    const pace = last.phase === 'fight' && now.phase !== 'fight' ? FIGHTS[last.fight].exitSpeed ?? 0 : 0;
    assert.ok(Math.abs(now.speed - last.speed - pace) < 1.2, 'no jolts in pace');
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

test('every fight hands the Spellblade back to the path, facing on down it (or already walking down it)', () => {
  for (const fight of FIGHTS) {
    const start = fight.hero(0);
    assert.ok(Math.abs(start.u) < 1e-6 && Math.abs(start.v) < 1e-6, `${fight.id}: on the path at the start`);
    const end = fight.hero(fight.duration);
    if (fight.exit) {
      // it leaves him walking away down the path, as far down it as the schedule picks up from
      assert.ok(Math.abs(end.path - fight.exit) < 1e-6, `${fight.id}: ${fight.exit} m down the path`);
      const pace = (fight.hero(fight.duration).path - fight.hero(fight.duration - 0.05).path) / 0.05;
      assert.ok(Math.abs(pace - fight.exitSpeed) < 0.05, `${fight.id}: walking at the pace the run picks up from`);
    } else {
      assert.ok(Math.abs(end.u) < 1e-6 && Math.abs(end.v) < 1e-6, `${fight.id}: on the path at the end`);
    }
    for (const hero of [start, fight.exit ? null : end].filter(Boolean)) {
      assert.ok(Math.abs(Math.cos(hero.heading)) < 1e-6 && Math.sin(hero.heading) > 0.99, `${fight.id}: facing along it`);
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
  // the whirlwind: round and round fast, slowing to a dizzy stop, then away down the path while the rival falls apart
  const spin = (a, b) => Math.abs(whirlwind.hero(b).heading - whirlwind.hero(a).heading) / (b - a);
  assert.ok(spin(2.1, 2.2) > 2 * spin(3.9, 4.0), 'the spin starts fast and slows');
  assert.ok(whirlwind.hero(2.5).snap, 'a spin is not eased after');
  assert.ok(whirlwind.cues.some((cue) => cue.type === 'dizzy'));
  const shatter = whirlwind.cues.find((cue) => cue.type === 'shatter').at;
  assert.ok(whirlwind.hero(shatter).path > 0.3, 'he is already walking away when the rival falls apart');
  assert.ok(Math.abs(whirlwind.hero(shatter).heading - Math.PI / 2) < 0.05, 'and does not look back');
  assert.equal(whirlwind.rival(shatter - 1).clip, 'Guard', 'the rival never moved');
  assert.ok(!whirlwind.hero(6).sword && !whirlwind.hero(7).sword, 'no sword laid on the shoulder');
  assert.notEqual(makeWhirlwind({ turns: 3 }).key, makeWhirlwind({ turns: 5 }).key);
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
  for (const [name] of VERSIONS) {
    FIGHT_DISTANCES.forEach((distance, slot) => {
      const { fight, frame, swing } = stage(name, slot);
      assert.equal(blockedMoments(fight, frame, swing, blockers), 0, `${name} at stop ${slot + 1}: in clear view`);
      const look = lookFor(frame, swing);
      for (let t = -0.4; t <= fight.duration; t += 0.1) {
        const { hero, rival, held } = fightPair(fight, frame, t + FIGHT_SHOT.lead);
        const shot = fightShot(hero, rival, look, { held });
        const [x, y, z] = shot.position;
        const where = `${name} at stop ${slot + 1}, ${t.toFixed(1)} s`;
        assert.ok(insideCastlewardFootprint(x, z), `${where}: the camera stands in Castleward`);
        assert.ok(y > 1.5 && y < 2.6, `${where}: at eye height`);
        // never on top of either of them, and never so far back that they are specks
        for (const at of [hero, rival]) assert.ok(Math.hypot(x - at[0], z - at[1]) > 2.5, `${where}: the camera keeps its distance`);
        assert.ok(Math.hypot(x - hero[0], z - hero[1]) < 11, `${where}: the Spellblade stays close enough to read`);
      }
    });
  }
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

test('the running camera keeps him clear of the banner: it turns just enough, and not at all when he is clear', () => {
  const eye = [0, 2, 0];
  const target = [0, 1, -10];
  const aspect = 2.16;
  // where a point shows across the screen (0 at the left edge, 1 at the right) looking from eye at target
  const share = (aim, point) => {
    const l = [aim[0] - eye[0], aim[2] - eye[2]];
    const n = Math.hypot(l[0], l[1]);
    const d = [l[0] / n, l[1] / n];
    const p = [point[0] - eye[0], point[1] - eye[2]];
    const along = p[0] * d[0] + p[1] * d[1];
    const across = p[0] * -d[1] + p[1] * d[0];
    return (across / along / (Math.tan((FIGHT_SHOT.fov * Math.PI) / 360) * aspect) + 1) / 2;
  };
  const hero = [-0.5, -6];
  assert.ok(share(target, hero) < 0.5);
  assert.equal(followAim(eye, hero, target, { aspect, clear: [0.2, 0.96] }), target, 'clear already: untouched');
  // a phone's wide banner: he is moved right of it, with his reach
  const aimed = followAim(eye, hero, target, { aspect, clear: [0.55, 0.96] });
  const halfReach = FIGHT_SHOT.reach / (6 * Math.tan((FIGHT_SHOT.fov * Math.PI) / 360) * aspect) / 2;
  assert.ok(share(aimed, hero) >= 0.55 + halfReach - 1e-6);
  assert.equal(aimed[1], target[1], 'a level turn');
});

test('on a small screen the knights stand a little smaller in the fights, still inside the clear part', () => {
  const look = [0, -1];
  const hero = [0, 0];
  const rival = [1.9, 0];
  const clear = [0.41, 0.96];
  const normal = fightShot(hero, rival, look, { aspect: 2.16, clear });
  const compact = fightShot(hero, rival, look, { aspect: 2.16, clear, fov: COMPACT_SHOT.fov, fill: COMPACT_SHOT.fill });
  // how big a knight stands: his height over the view's height at his distance
  const size = (shot) => 1 / (Math.hypot(shot.position[0] - shot.target[0], shot.position[2] - shot.target[2]) * Math.tan((shot.fov * Math.PI) / 360));
  assert.ok(size(compact) < size(normal) * 0.95, `smaller: ${size(compact).toFixed(3)} vs ${size(normal).toFixed(3)}`);
  assert.ok(size(compact) > size(normal) * 0.7, 'but only a little');
});
