// Cross-fade timing between Spellblade clips. Pure functions (no three.js) so they run in node tests.
//
// Attacks, dashes and hit reactions answer the player immediately, so they blend in fast; settling back into the
// idle stance, the guard or locomotion blends slowly so the character eases between poses instead of popping.

const COMBO_CLIPS = new Set(['Slash_1', 'Slash_2', 'Slash_3']);

const BLEND_IN_SECONDS = Object.freeze({
  Slash_1: 0.1,
  Slash_2: 0.1,
  Slash_3: 0.1,
  Dash: 0.08,
  Stagger: 0.08,
  Cast: 0.12,
  Death: 0.15,
  Guard: 0.16,
  Air: 0.18,
  Run: 0.22,
  Sprint: 0.2,
  Idle: 0.24,
});

export function blendSeconds(fromClip, toClip) {
  if (!fromClip || fromClip === toClip) return 0;
  // respawn teleports the character, so leaving the death pose snaps
  if (fromClip === 'Death') return 0;
  // slashes chained inside one attack already meet at matching poses
  if (COMBO_CLIPS.has(fromClip) && COMBO_CLIPS.has(toClip)) return 0.06;
  // run <-> sprint shifts gait mid-stride
  if ((fromClip === 'Run' && toClip === 'Sprint') || (fromClip === 'Sprint' && toClip === 'Run')) return 0.16;
  return BLEND_IN_SECONDS[toClip] ?? 0.15;
}

// smoothstep: starts and ends with zero velocity, so a blend never jerks at either end
export function easeBlend(progress) {
  const u = Math.max(0, Math.min(1, progress));
  return u * u * (3 - 2 * u);
}

/**
 * Weights for the incoming clip and every clip still fading out, summing to 1 (three.js mixes any missing
 * weight toward the bind pose). `fading` entries carry their weight when they started fading.
 * @returns {{ active: number, fading: number[] }}
 */
export function blendWeights(activeProgress, fading) {
  const active = easeBlend(activeProgress);
  const raw = fading.map((entry) => Math.max(0, entry.startWeight) * (1 - easeBlend(entry.progress)));
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-6) return { active: 1, fading: raw.map(() => 0) };
  const share = (1 - active) / total;
  return { active, fading: raw.map((value) => value * share) };
}

// the blend progress at which easeBlend reaches `weight` (so a clip coming back mid-fade resumes where it is)
export function blendProgressFor(weight) {
  const w = Math.max(0, Math.min(1, weight));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (easeBlend(mid) < w) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
