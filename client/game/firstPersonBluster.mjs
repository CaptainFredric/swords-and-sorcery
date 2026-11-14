// First-person counterpart to the server's Blustered fighting-facing limit.
// The camera remains free; only the two visible arms, sword and Guard carriage
// lean toward the slower, authoritative body heading. Never write this result
// into camera yaw, input yaw or the server-owned combat transform.
import { blusterSeverity, ONE_HIT_BLUSTER } from '../../shared/src/oneHitStatus.mjs';

export const FIRST_PERSON_BLUSTER = Object.freeze({
  maxArmYaw: 0.58,        // Keep both hands in view even when the body faces behind the camera.
  followPerSec: 21,      // Smooth network snapshots without turning the camera.
  recoverPerSec: 26,     // Once freed, settle fully back into the normal hand carriage.
  maxShiftPerSec: 5.5,   // No arm-swap snap as the shortest angle switches at +/-180 degrees.
});

const bounded = (value, range) => Math.max(-range, Math.min(range, value));
const angularDifference = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Advance the first-person arm rig, not camera aim or combat orientation.
 *
 * The body is still the host's true slower fighting yaw. Show the shortest
 * world-facing gap between head and body, compressed to a safe screen-space
 * angle so the weapon never vanishes behind the camera. A full look revolution
 * returns to zero when head and body face the same way, rather than leaving
 * an artificial 360-degree debt. The finite presentation rate keeps the
 * +/-pi shortest-path switch from teleporting the arms across the screen.
 */
export function stepFirstPersonBluster(previous, {
  lookYaw, bodyYaw, blustered, nowSec, dt = 0,
} = {}, rules = FIRST_PERSON_BLUSTER) {
  const active = Number.isFinite(lookYaw) && Number.isFinite(bodyYaw) &&
    Number.isFinite(nowSec) && blusterSeverity(blustered, nowSec) > ONE_HIT_BLUSTER.free;
  const yaw = Number.isFinite(previous?.yaw) ? previous.yaw : 0;
  const elapsed = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const lag = active ? angularDifference(lookYaw, bodyYaw) : 0;
  const target = bounded(lag, rules.maxArmYaw);
  const tracking = 1 - Math.exp(-(active ? rules.followPerSec : rules.recoverPerSec) * elapsed);
  const eased = yaw + (target - yaw) * tracking;
  const settled = yaw + bounded(eased - yaw, rules.maxShiftPerSec * elapsed);
  return { yaw: Math.abs(settled) < 0.0005 ? 0 : settled, active, lag };
}
