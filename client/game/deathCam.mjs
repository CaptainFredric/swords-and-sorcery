// Dying, seen from inside the helm, as a short piece of film: the blow lands and jolts the view, the view goes down
// with the body (rolling, tipping back to the sky, a bump as it lands), holds a beat on the ground, then lifts away
// and turns to find whoever did it until the respawn. Purely a camera: nothing here touches state or control.
// Pure (no three.js): time since the death in, a camera out.
//
// World space: +y up; a camera faces (-sin yaw, -cos yaw) on the ground and tips up by pitch.

import { GAME_MODES } from '../../shared/src/modes.mjs';

export const DEATH_CAM = Object.freeze({
  react: 0.12,        // the blow lands: a jolt back before the legs go
  fall: 0.6,          // the view going down with the body
  hold: 0.34,         // a beat on the ground
  lift: 0.85,         // rising away and turning to the killer
  eye: 1.58,          // standing eye height
  low: 0.32,          // eye height lying on the ground
  slide: 0.55,        // how far the body carries along the blow as it falls
  roll: 0.42,         // how far the view rolls over as it goes down (radians)
  above: 1.75,        // the watching place: this high over the body,
  behind: 0.7,        // and this far back from it, away from the killer
});

/**
 * How a mode shows you your killer. A duel (or a bot, or practice) follows them freely until you are back; anything
 * with teams or objectives (none yet) gets only a glimpse and then holds still, so a death never gives away where the
 * enemy goes next.
 */
export function killerCamPolicy(mode) {
  if ([GAME_MODES.DUEL, GAME_MODES.BOT_DUEL, GAME_MODES.PRACTICE, GAME_MODES.FFA].includes(mode)) return { look: 'follow' };
  return { look: 'glimpse', seconds: 0.8 };
}

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { const s = clamp01(t); return s * s * (3 - 2 * s); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// as far along a straight leg as the walls allow, stopping `margin` short of anything in the way.
// reach(from, to): the free fraction of that segment (1: nothing in the way)
function clip(reach, from, to, margin) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(d[0], d[1], d[2]);
  if (length < 1e-6) return to;
  const unit = d.map((v) => v / length);
  const free = reach(from, to.map((v, i) => v + unit[i] * margin)) * (length + margin) - margin;
  if (free >= length - 1e-9) return to;
  return from.map((v, i) => v + unit[i] * Math.max(0, free));
}

// from `from` to `to` in two legs, across and then down (or up and then across), each kept clear of the walls:
// a wall stays a good step away however steeply the view is moving. null reach: no walls to mind
function keepClear(reach, from, to, { upFirst = false } = {}) {
  if (!reach) return to;
  if (upFirst) {
    const risen = clip(reach, from, [from[0], to[1], from[2]], 0.12);
    return clip(reach, risen, [to[0], risen[1], to[2]], 0.3);
  }
  const across = clip(reach, from, [to[0], from[1], to[2]], 0.3);
  return clip(reach, across, [across[0], to[1], across[2]], 0.12);
}

/** The yaw and pitch that look from `from` at `to` ([x, y, z]). */
export function lookAt(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/**
 * The camera `age` seconds after I fell.
 *   death: { eye: [x, y, z] (my eye as the blow landed), yaw, pitch, push: [x, z] (the blow's direction, from the
 *            killer toward me; null if unknown), ground (the height I fell to) }
 *   killer: [x, y, z] where they stand now (their feet), or null (the abyss, or nobody)
 *   policy: killerCamPolicy(mode); motion: the camera-motion comfort setting (0..1: how much the view may roll)
 *   seen: for a 'glimpse', where the killer stood when the glimpse ended (the caller keeps it)
 *   reach(from, to): the free fraction of a segment through the world, so the view never ends up inside a wall
 * Returns { position: [x, y, z], yaw, pitch, roll, arms } (arms: 0..1, how much of my own arms is still in view).
 */
export function deathCamera(age, death, killer = null, { policy = { look: 'follow' }, motion = 1, seen = null, reach = null } = {}) {
  const t = Math.max(0, age);
  const c = DEATH_CAM;
  const push = death.push && Math.hypot(death.push[0], death.push[1]) > 1e-6
    ? (() => { const n = Math.hypot(death.push[0], death.push[1]); return [death.push[0] / n, death.push[1] / n]; })()
    : [Math.sin(death.yaw), Math.cos(death.yaw)];               // unknown: back the way I was facing
  // which way the body rolls: toward the side the blow pushes it, as I was facing
  const right = [Math.cos(death.yaw), -Math.sin(death.yaw)];
  const side = push[0] * right[0] + push[1] * right[1] >= 0 ? 1 : -1;
  const ground = Number.isFinite(death.ground) ? death.ground : death.eye[1] - c.eye;

  // the jolt, then down: slow to start, quicker as it goes (falling), and a small bump at the bottom
  const jolt = Math.sin(Math.PI * clamp01(t / c.react)) * (t < c.react ? 1 : 0);
  const f = clamp01((t - c.react * 0.5) / c.fall);
  const down = f * f;
  const bump = 0.05 * Math.sin(Math.PI * clamp01((t - c.react * 0.5 - c.fall) / 0.2));
  const carry = c.slide * down + 0.08 * jolt;
  const body = keepClear(reach, death.eye, [death.eye[0] + push[0] * carry, lerp(death.eye[1], ground + c.low, down) + bump, death.eye[2] + push[1] * carry]);
  const fallen = {
    position: body,
    yaw: death.yaw + 0.22 * side * down,
    // tipping back to the sky as the body goes over
    pitch: lerp(death.pitch, 0.4, down) + 0.06 * jolt,
    roll: -side * c.roll * down * clamp01(motion) || 0,
  };
  const arms = 1 - smooth(t / 0.28);

  // then away and round to find them (or, with nobody to find, up over the body looking down at it)
  const liftAt = c.react * 0.5 + c.fall + c.hold;
  const l = smooth((t - liftAt) / c.lift);
  if (l <= 0) return { ...fallen, arms };
  const corpse = [body[0], ground, body[2]];
  let target = null;
  if (killer) {
    const glimpse = policy.look === 'glimpse' && t > liftAt + c.lift + (policy.seconds ?? 0.8);
    target = glimpse && seen ? seen : killer;
  }
  let watch;
  let aim;
  if (target) {
    const away = [corpse[0] - target[0], corpse[2] - target[2]];
    const n = Math.hypot(away[0], away[1]) || 1;
    watch = keepClear(reach, body, [corpse[0] + (away[0] / n) * c.behind, ground + c.above, corpse[2] + (away[1] / n) * c.behind], { upFirst: true });
    aim = lookAt(watch, [target[0], target[1] + 1.2, target[2]]);
  } else {
    watch = keepClear(reach, body, [corpse[0] + push[0] * 0.6, ground + 2.6, corpse[2] + push[1] * 0.6], { upFirst: true });
    aim = { yaw: fallen.yaw, pitch: -1.1 };
  }
  return {
    position: [lerp(body[0], watch[0], l), lerp(body[1], watch[1], l), lerp(body[2], watch[2], l)],
    yaw: lerpAngle(fallen.yaw, aim.yaw, l),
    pitch: lerp(fallen.pitch, aim.pitch, l),
    roll: lerp(fallen.roll, 0, l),
    arms,
  };
}

const HOW = Object.freeze({ sword: 'Sword', fireball: 'Fireball', burn: 'Fireball’s burn', frostfire: 'Frostfire', gale: 'Gale Garner', gauntlet: 'Gauntlet', abyss: 'The fall' });

/**
 * What the death card says: who (and how), and how close it was: SLAIN BY ASTRA, 3 HP REMAINING.
 * { name, how, left } (left: '' when nobody felled you).
 */
export function deathCardText({ killerName = null, source = null, killerHealth = null } = {}) {
  const how = HOW[source] ?? (source ? source[0].toUpperCase() + source.slice(1) : '');
  if (!killerName) return { name: source === 'abyss' ? 'THE ABYSS' : 'THE FALL', how: HOW.abyss, left: '' };
  const left = Number.isFinite(killerHealth) && killerHealth > 0 ? `${Math.ceil(killerHealth)} HP REMAINING` : '';
  return { name: killerName, how, left };
}
