import { SPELLS } from './spells.mjs';
import { galeCarry, galeRecoil } from './gale.mjs';
import { postureOf } from './body.mjs';
import { MOVEMENT } from './movement.mjs';

export const GALE_MODES = Object.freeze(['burst', 'balanced', 'sustained']);
const profiles = Object.freeze({
  balanced: SPELLS.gale,
  burst: Object.freeze({ ...SPELLS.gale, cone: Object.freeze({ ...SPELLS.gale.cone,
    push: 22, lastsSec: .14, fadeSec: .08, wind: 4, drag: 6 }) }),
  sustained: Object.freeze({ ...SPELLS.gale, cone: Object.freeze({ ...SPELLS.gale.cone,
    push: 4.5, lastsSec: 1.25, fadeSec: .22, wind: 10, drag: 9 }),
    recoil: Object.freeze({ ...SPELLS.gale.recoil, push: 4.5, maxUp: 6 }) }),
});
export function galeModeId(mode) { return GALE_MODES.includes(mode) ? mode : 'balanced'; }
export function galeProfile(mode) { return profiles[galeModeId(mode)]; }

// Logical game coordinates, so this remains vertical when a phone's landscape shell is rotated.
export function galeSwipeMode(dx, dy, previous = 'balanced') {
  if (Math.hypot(dx, dy) < 14) return 'balanced';
  if (Math.abs(dy) < 28 || Math.abs(dy) < Math.abs(dx) * 1.2) return previous;
  return dy < 0 ? 'burst' : 'sustained';
}

// Lift approaches a bounded wind velocity. Upward wind can support a body against gravity while caught.
export function galeLift(velocityY, directionY, wind, dt, guarded = false) {
  if (!(wind > 0) || !(dt > 0)) return velocityY;
  const strength = Math.min(1, wind) * (guarded ? .35 : 1);
  const target = Math.max(-4, Math.min(6, directionY * 10 + .4)) * strength;
  const next = velocityY + (target - velocityY) * (1 - Math.exp(-9 * dt));
  return Math.min(6, next + (directionY > .25 ? MOVEMENT.gravity * dt * strength : 0));
}

// The same surface-limited recoil in authority and prediction. No new resource or jump model.
export function sustainGaleRecoil(spell, body, direction, world, dt, strength = 1) {
  if (!body || body.alive === false || !(dt > 0)) return;
  const eye = { x: body.position.x, y: body.position.y + postureOf(body).eye, z: body.position.z };
  const recoil = galeRecoil(spell, eye, direction, world);
  if (!recoil) return;
  const wind = Math.min(1, Math.hypot(recoil.x, recoil.y, recoil.z) / spell.recoil.push) * strength;
  const away = { x: -direction.x, y: -direction.y, z: -direction.z };
  body.impulse = galeCarry(spell, body.impulse, eye, away, {x:eye.x+away.x,y:eye.y+away.y,z:eye.z+away.z}, wind, dt);
  body.velocity.y = galeLift(body.velocity.y, away.y, wind, dt);
}
