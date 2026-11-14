// First-person counterpart to the server's Blustered fighting-facing limit.
// The camera remains free; only the two visible arms, sword and Guard carriage
// lean toward the slower, authoritative body heading. Never write this result
// into camera yaw, input yaw or the server-owned combat transform.
import { blusterSeverity, ONE_HIT_BLUSTER } from '../../shared/src/oneHitStatus.mjs';

export const FIRST_PERSON_BLUSTER = Object.freeze({
  maxArmYaw: 0.58,        // Keep both hands in the view even when the body is 180 degrees behind.
  followPerSec: 21,      // Filter stepped network snapshots without turning the camera.
  recoverPerSec: 26,     // Once freed, settle fully back into the normal hand carriage.
});

const bounded = (value, range) => Math.max(-range, Math.min(range, value));
const angularStep = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Advance the view-relative arms without changing head or fighting facing.
 * Unwrap successive camera/body samples separately: a player can spin through
 * +/-pi while Blustered without the arms jumping from one screen edge to the other.
 *
 * The visual angle is intentionally capped. Actual sword/Guard collision and
 * third-person facing continue to use the unrestricted server-owned body yaw.
 */
export function stepFirstPersonBluster(previous, {
  lookYaw, bodyYaw, blustered, nowSec, dt = 0,
} = {}, rules = FIRST_PERSON_BLUSTER) {
  const active = Number.isFinite(lookYaw) && Number.isFinite(bodyYaw) &&
    Number.isFinite(nowSec) && blusterSeverity(blustered, nowSec) > ONE_HIT_BLUSTER.free;
  const wasActive = Boolean(previous?.active);
  const yaw = Number.isFinite(previous?.yaw) ? previous.yaw : 0;
  const elapsed = Math.max(0, Number.isFinite(dt) ? dt : 0);

  if (!active) {
    const recovery = 1 - Math.exp(-rules.recoverPerSec * elapsed);
    const settled = yaw * (1 - recovery);
    return { yaw: Math.abs(settled) < 0.0005 ? 0 : settled, active: false,
      lag: 0, lookYaw: null, bodyYaw: null };
  }

  // On the first status frame, use the nearest world-facing angle.
  // Thereafter, integrate each sample's shortest increment rather than
  // re-wrapping the total backlog (which can exceed half a turn).
  const lag = wasActive && Number.isFinite(previous.lookYaw) && Number.isFinite(previous.bodyYaw)
    ? previous.lag + angularStep(previous.bodyYaw, bodyYaw) - angularStep(previous.lookYaw, lookYaw)
    : angularStep(lookYaw, bodyYaw);
  const target = bounded(lag, rules.maxArmYaw);
  const tracking = 1 - Math.exp(-rules.followPerSec * elapsed);
  const next = yaw + (target - yaw) * tracking;
  return { yaw: next, active: true, lag, lookYaw, bodyYaw };
}
