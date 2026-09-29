// When the Spellblade is where on his round: he stands a moment at his place, runs, slows to a stop at each rival,
// fights (tourFights.mjs), runs on, and comes home, and then it all begins again. Pure: a time on the loop in, where
// he is along the path and what he is doing, out.

import { FIGHTS, FIGHT_POOL } from './tourFights.mjs';

export const TOUR_PACE = Object.freeze({
  speed: 5.5,        // metres a second on the run (the Run clip's own pace is 7.5)
  brake: 2.4,        // metres to stop in, or to get going again
  rest: 3.0,         // seconds standing at his place before he sets off
});

// the distance along the path of each fight's anchor (set to the path by tourPath.distanceNear)
export const FIGHT_DISTANCES = Object.freeze([20.5, 34.5, 70.5]);

/**
 * The loop laid out in time: phases in order, each { kind: 'rest'|'go'|'run'|'stop'|'fight', start, end, from, to,
 * fight? }, and its total length in seconds.
 */
export function buildSchedule(pathLength, { pace = TOUR_PACE, distances = FIGHT_DISTANCES, fights = FIGHTS } = {}) {
  const { speed, brake, rest } = pace;
  const rampTime = (2 * brake) / speed;
  const phases = [];
  let time = 0;
  const push = (kind, duration, from, to, extra = {}) => {
    phases.push({ kind, start: time, end: time + duration, from, to, ...extra });
    time += duration;
  };
  push('rest', rest, 0, 0);
  let at = 0;
  push('go', rampTime, at, at + brake);
  at += brake;
  fights.forEach((fight, index) => {
    const anchor = distances[index];
    push('run', (anchor - brake - at) / speed, at, anchor - brake);
    push('stop', rampTime, anchor - brake, anchor);
    push('fight', fight.duration, anchor, anchor, { fight: index });
    // a fight may leave him further down the path and already walking: the run picks up from there
    const exit = fight.exit ?? 0;
    const v0 = Math.min(speed * 0.9, fight.exitSpeed ?? 0);
    push('go', (2 * brake) / (v0 + speed), anchor + exit, anchor + exit + brake, { v0 });
    at = anchor + exit + brake;
  });
  push('run', (pathLength - brake - at) / speed, at, pathLength - brake);
  push('stop', rampTime, pathLength - brake, pathLength);
  return { phases, duration: time, pace };
}

/**
 * Where the Spellblade is `time` seconds into the loop: { distance, speed, phase, fight, fightTime } (fightTime also
 * runs before and after a fight, so a rival can see him coming and lie where he fell).
 */
export function tourMoment(schedule, time) {
  const t = ((time % schedule.duration) + schedule.duration) % schedule.duration;
  const phase = schedule.phases.find((candidate) => t < candidate.end) ?? schedule.phases[schedule.phases.length - 1];
  const local = t - phase.start;
  const length = phase.end - phase.start;
  const { speed } = schedule.pace;
  let distance = phase.from;
  let pace = 0;
  if (phase.kind === 'run') {
    distance = phase.from + speed * local;
    pace = speed;
  } else if (phase.kind === 'go') {
    const v0 = phase.v0 ?? 0;
    const accel = (speed - v0) / length;
    distance = phase.from + v0 * local + 0.5 * accel * local * local;
    pace = v0 + accel * local;
  } else if (phase.kind === 'stop') {
    const decel = speed / length;
    distance = phase.from + speed * local - 0.5 * decel * local * local;
    pace = speed - decel * local;
  }
  // every rival's own clock: how long since (or until) the Spellblade stopped in front of him
  const fightTimes = schedule.phases.filter((candidate) => candidate.kind === 'fight').map((fightPhase) => t - fightPhase.start);
  return { time: t, distance, speed: pace, phase: phase.kind, fight: phase.fight ?? null, fightTimes };
}

// every order the three stops can take the pool's fights in
const ORDERS = Object.freeze([
  ['fireball', 'whirlwind', 'whiteFlag'],
  ['whirlwind', 'whiteFlag', 'fireball'],
  ['whiteFlag', 'fireball', 'whirlwind'],
  ['fireball', 'whiteFlag', 'whirlwind'],
  ['whirlwind', 'fireball', 'whiteFlag'],
  ['whiteFlag', 'whirlwind', 'fireball'],
]);

// a small seeded random, so a round's dice are the same every time it is asked for
export function roundRandom(round) {
  let s = (Math.imul(round + 1, 2654435761) >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Which fight each stop stages in round `round`: the first round is the one the fights were written for; after that
 * the round steps through every other order, so no two rounds running are the same. Names from FIGHT_POOL.
 */
export function lineupFor(round, pool = FIGHT_POOL) {
  const names = Object.keys(pool);
  const orders = ORDERS.filter((order) => order.every((name) => names.includes(name)));
  if (!orders.length) return names.slice(0, FIGHT_DISTANCES.length);
  return orders[Math.max(0, Math.floor(round)) % orders.length];
}
