import { CONJURED } from '../../shared/src/spells.mjs';

// Presentation budgets only. Gameplay reach and force remain in the shared spells.
export function elementalProfile(spell = 'fireball') {
  const frost = spell === 'frostfire';
  const conjured = CONJURED[spell];
  const size = conjured?.size ?? 1;
  const strength = conjured?.shove ?? 1;
  // (a conjured fire seen larger than a Fireball, the Vortex's blaze, costs no more to draw than one)
  const budget = Math.min(1, size);
  return {
    frost, size, strength,
    core: frost ? 0xf3feff : 0xfff2bf,
    shell: frost ? 0x9cdeee : 0xff6920,
    trail: frost ? 0xd6f7ff : 0xffac32,
    coreScale: frost ? [0.7, 0.7, 1.8] : [1, 1, 1],
    shellScale: frost ? [0.65, 0.65, 1.5] : [1, 1, 1],
    trailLife: frost ? 0.27 : 0.16 + 0.04 * budget,
    trailSpacing: 0.16 / Math.max(0.65, size),
    maxTrailSamples: 4,
    blastLife: frost ? 0.22 : 0.26,
    smokeCount: Math.round((frost ? 4 : 5) * budget),
    fragmentCount: Math.round((frost ? 18 : 16) * budget * (0.65 + 0.35 * strength)),
    // Thin front reaches the actual radius; dense flame stays compact.
    denseReach: frost ? 0.18 : 0.26,
    frontOpacity: frost ? 0.16 : 0.2,
  };
}

export function gatherEnvelope(age, duration) {
  const progress = Math.max(0, Math.min(1, age / Math.max(0.001, duration)));
  return { progress, scale: 0.24 + 0.76 * Math.sin(progress * Math.PI / 2), light: 0.2 + 0.8 * progress ** 2 };
}

export function chillPresentation(chill) {
  const strength = Math.max(0, Math.min(1, Number.isFinite(chill) ? chill : 0));
  return { opacity: strength * 0.22, dustRate: strength * 16, mistRate: strength * 4, scale: 0.7 + 0.3 * strength };
}
