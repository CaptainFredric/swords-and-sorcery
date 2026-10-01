// The Blazing Vortex, seen from outside. While it is lit the view stays in the helm (the sword raised, the star, the
// blade catching); as it commits the view eases out behind and above the knight, so the one spinning can see
// themselves do it, and eases back in as it ends. Only the knight's body turns with the spin. The view is the
// player's own the whole time: it looks where they look (the same yaw and pitch as ever), and it is never turned by
// the body.
//
// The view sits back along the aim from a point over the knight's head, so the reticle (the middle of the screen) lies
// just above them and is never covered by them. What the reticle is on is then not quite where a line from the
// knight's own eyes along the same direction would go; so the aim sent to the host is the direction from the knight's
// eyes to what the reticle is on (chaseAim): the fire lands where the reticle says. The host is still only told an aim.
//
// Walls: the view is kept clear of them as the death camera is (deathCam.mjs clip: as far back as the way is open,
// a step short of anything in it), and of the ground when the player looks up. Pure (no three.js).

import { clip } from './deathCam.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';

export const VORTEX_CAMERA = Object.freeze({
  distance: 3.7,        // back along the aim, at most
  // the point it sits back from: this high over the knight's feet (well above the head, so that with the reticle on a
  // foe close in front, the foe is seen over the knight and not hidden behind them)
  over: 2.45,
  inSec: 0.2,           // easing out as the Vortex commits
  outSec: 0.35,         // and back in as it ends
  outRate: 9,           // brought in by a wall, it comes back out no faster than this (m/s)
  margin: 0.3,          // kept this far from a wall behind it
  floor: 0.35,          // and this far over the ground under it
  bodyFrom: 0.55,       // the knight's own body is drawn (and the arms in the helm are not) once the view is this far out (m)
  aimReach: 60,         // what the reticle is on is looked for out to here
  bodyRadius: 0.5,      // a knight under the reticle: an upright post this thick
});

const smooth = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };

/** The way a yaw and pitch look (a unit vector; yaw 0 looks along -z). */
export function aimVector(yaw, pitch) {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/** Whether a knight's Vortex has committed and is running now (their snapshot): the only time the view goes out. */
export function chaseWanted(knight, serverNow, vortex = ULTIMATES.vortex) {
  const state = knight?.alive ? knight.ultimateState : null;
  if (state?.id !== 'vortex' || !Number.isFinite(state.commitAt)) return false;
  return serverNow >= state.commitAt && serverNow < (state.until ?? state.commitAt + vortex.activeSec);
}

/** How far out the view is (0: in the helm; 1: all the way out), `dt` seconds on: out quickly, back in a little slower. */
export function stepChase(blend, wanted, dt, rules = VORTEX_CAMERA) {
  const now = Math.max(0, Math.min(1, Number(blend) || 0));
  return Math.max(0, Math.min(1, now + (wanted ? dt / rules.inSec : -dt / rules.outSec)));
}

/**
 * Where the view is. feet: the knight's position; eyeHeight: where their eyes are over it (the first-person view);
 * yaw, pitch: where the player looks; blend: how far out (stepChase).
 * reach(from, to): the share of that straight way that is clear of walls (1: all of it); groundAt(x, z, y): the ground
 * under a point (or null). limit: the furthest back it may sit this frame (m): a wall behind brings the view in at once,
 * and when the way opens again it eases back out (chaseLimit), never jumps.
 * Returns { position [x, y, z], yaw, pitch (the player's own, untouched), out (how far back it sits, m), thirdPerson
 * (the knight's body is drawn and the helm's arms are not) }.
 */
export function chaseCamera({ feet, eyeHeight, yaw, pitch, blend, reach = null, groundAt = null, limit = Infinity }, rules = VORTEX_CAMERA) {
  const ease = smooth(blend);
  const forward = aimVector(yaw, pitch);
  const pivot = [feet.x, feet.y + eyeHeight + (rules.over - eyeHeight) * ease, feet.z];
  let out = rules.distance * ease;
  if (out > 1e-6) {
    const wanted = pivot.map((v, i) => v - forward[i] * out);
    const clear = reach ? clip(reach, pivot, wanted, rules.margin) : wanted;
    out = Math.hypot(clear[0] - pivot[0], clear[1] - pivot[1], clear[2] - pivot[2]);
    // looking up, the view sinks behind the knight: never into the ground
    if (groundAt && forward[1] > 1e-6) {
      const ground = groundAt(pivot[0] - forward[0] * out, pivot[2] - forward[2] * out, pivot[1]);
      if (ground !== null && ground !== undefined) out = Math.min(out, Math.max(0, (pivot[1] - (ground + rules.floor)) / forward[1]));
    }
    out = Math.min(out, Math.max(0, limit));
  }
  return {
    position: pivot.map((v, i) => v - forward[i] * out),
    yaw,
    pitch,
    out,
    thirdPerson: out >= rules.bodyFrom,
  };
}

/** The furthest back the view may sit next frame, from how far back it sits now: it comes back out at `outRate` m/s. */
export function chaseLimit(out, dt, rules = VORTEX_CAMERA) {
  return Math.max(0, Number(out) || 0) + rules.outRate * Math.max(0, dt);
}

/**
 * How far along the reticle's line the first thing under it is (m), or `aimReach` when there is nothing: a wall
 * (reach), the ground (groundAt), or a knight (bodies: [{ x, y, z, crown }]).
 */
export function reticleDistance(position, forward, { reach = null, groundAt = null, bodies = [] } = {}, rules = VORTEX_CAMERA) {
  const far = rules.aimReach;
  const end = position.map((v, i) => v + forward[i] * far);
  let nearest = reach ? Math.min(far, reach(position, end) * far) : far;
  // the ground, where the line comes down to it (looked for a stride at a time, then between the two strides)
  if (groundAt && forward[1] < -1e-6) {
    const stride = 0.5;
    let before = 0;
    for (let d = stride; d <= nearest; d += stride) {
      const at = position.map((v, i) => v + forward[i] * d);
      const ground = groundAt(at[0], at[2], at[1] + 1);
      if (ground !== null && ground !== undefined && at[1] <= ground) {
        const prior = position[1] + forward[1] * before;
        const share = prior > ground ? (prior - ground) / (prior - at[1]) : 0;
        nearest = Math.min(nearest, before + (d - before) * share);
        break;
      }
      before = d;
    }
  }
  // a knight: the nearest point of the line to their upright middle, within their thickness
  for (const body of bodies) {
    const top = body.crown ?? 1.8;
    const along = (body.x - position[0]) * forward[0] + (body.y + top / 2 - position[1]) * forward[1] + (body.z - position[2]) * forward[2];
    if (along <= 0 || along >= nearest) continue;
    const at = position.map((v, i) => v + forward[i] * along);
    const aside = Math.hypot(at[0] - body.x, at[2] - body.z);
    if (aside <= rules.bodyRadius && at[1] >= body.y - 0.1 && at[1] <= body.y + top + 0.1) nearest = along;
  }
  return nearest;
}

/**
 * The aim to send the host while the view is out: from the knight's own eyes (`eye` [x, y, z]) to what the reticle is
 * on (`distance` along the view's line from `position`). Returns { yaw, pitch }.
 */
export function chaseAim(position, forward, eye, distance) {
  const target = position.map((v, i) => v + forward[i] * distance);
  const d = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const flat = Math.hypot(d[0], d[2]);
  return { yaw: flat > 1e-6 ? Math.atan2(-d[0], -d[2]) : Math.atan2(-forward[0], -forward[2]), pitch: Math.atan2(d[1], Math.max(flat, 1e-6)) };
}
