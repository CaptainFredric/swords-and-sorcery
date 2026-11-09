// All-Natural Disaster's brief, authoritative third-person reveal.
// A committed slam should be visible from outside, but aim, gameplay, and
// the player's normal camera mode must never be rewritten. Pure (no Three.js).
import { ULTIMATES } from '../../shared/src/ultimates.mjs';

export const DISASTER_CAMERA = Object.freeze({
  beforeCommitSec: 0.95, // include the body turn and sword wind-up
  groundAfterSec: 0.85, // linger briefly to show the ground rupture
  aerialAfterSec: 1.2, // include the delayed Gale vortex -> travelling wave
});

const clamp01 = n => Math.max(0, Math.min(1, n));
const smooth = x => { const t=clamp01(x); return t*t*(3-2*t); };

// Ordinary windup: 0.92 s. Partial Lightning shortens it to .36 s.
// Full Lightning holds indefinitely until the release message commits; it
// should NOT lock the player into a cinematic during that indefinite hold.
export function disasterWindupSec(state) {
  return (state?.preparedTiers?.lightning ?? 0) >= 1 ? 0.36 : ULTIMATES.one_hit_of_wonders.startupSec;
}

export function disasterCameraWanted(player, nowSec, rules = DISASTER_CAMERA) {
  const state = player?.alive ? player.ultimateState : null;
  if (state?.id !== 'one_hit_of_wonders' || !Number.isFinite(state.commitAt) || !Number.isFinite(nowSec)) return false;
  const post = state.oneHit?.form === 'aerial' ? rules.aerialAfterSec : rules.groundAfterSec;
  if (state.phase === 'startup') {
    const left = state.commitAt - nowSec;
    if (left > 0 && left <= Math.min(rules.beforeCommitSec, disasterWindupSec(state))) return true;
    return nowSec >= state.commitAt && nowSec < state.commitAt + post;
  }
  if (state.phase !== 'active') return false;
  return nowSec >= state.commitAt && nowSec < Math.min(state.until ?? Infinity, state.commitAt + post);
}

// A complete visual revolution finishes at the contact frame, returning
// exactly to the actor's real facing. No rotation feeds back into server aim.
export function disasterBodyTurn(state, nowSec) {
  if (state?.id !== 'one_hit_of_wonders' || state.phase !== 'startup') return 0;
  const left = state.commitAt - nowSec;
  const duration = disasterWindupSec(state);
  if (!Number.isFinite(left) || left > duration || left <= 0) return 0;
  const share = 1 - left/duration;
  return 2*Math.PI*smooth((share - 0.08)/0.92);
}
