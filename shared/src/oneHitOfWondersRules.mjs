import { SPELLS } from './spells.mjs';
import { STEEL_DAMAGE_RANGES } from './steel.mjs';
import { STEEL_RAM, ramEffect } from './steelRam.mjs';

// Rule foundation for the eventual server-authoritative Ultimate and its presentation.
// This does not register or activate the Ultimate or the new Line of Conduct spell.
export const ONE_HIT_RULES = Object.freeze({
  aerialWindupSec: 0.85,
  groundReleaseWindowSec: 0.32,
  // After a full-Lightning teleport, the discharge has no SECOND wind-up.
  postTeleportWindupSec: 0,
  // Held teleport visual aura does not continually expand or inflict damage.
  teleportAuraMaxRadius: 1.25,
  teleportDistanceScale: 22,
  teleportTimeScaleSec: 0.9,
  lineOfConduct: Object.freeze({ nearDamage: 20, farDamage: 12, halfFalloffMetres: 12 }),
});

// Each element's first infusion adds its minimum meaningful direct spell hit
// ONLY to the decisive impact/wave (once per victim). Full infusion does not
// grant another copy. Every figure is read from the rule that owns it:
//   Fire, Frost: the edge of the blast (the least a real contact deals);
//   Gale: the least a whole gust deals to a body it legitimately caught (its 8-point heart is its most, not its least);
//   Lightning: Line of Conduct's long-distance floor;
//   Steel: the least a qualifying Steel Dash ram deals, a ram at the weakest plate that still makes one.
export const ONE_HIT_FIRST_INFUSION_DAMAGE = Object.freeze({
  fire: SPELLS.fireball.edgeDamage,
  frost: SPELLS.frostfire.edgeDamage,
  gale: STEEL_DAMAGE_RANGES.gale.min,
  lightning: ONE_HIT_RULES.lineOfConduct.farDamage,
  steel: ramEffect(STEEL_RAM.minStrength).damage,
});

export function lineOfConductDamage(distanceMetres) {
  if (distanceMetres === Infinity) return ONE_HIT_RULES.lineOfConduct.farDamage;
  if (!Number.isFinite(distanceMetres) || distanceMetres < 0) throw new RangeError('Distance must be non-negative.');
  const { nearDamage, farDamage, halfFalloffMetres } = ONE_HIT_RULES.lineOfConduct;
  return Math.round(farDamage + (nearDamage - farDamage) / (1 + distanceMetres / halfFalloffMetres));
}

export function oneHitInfusionDamageBonus(tiers = {}) {
  return Object.entries(ONE_HIT_FIRST_INFUSION_DAMAGE).reduce((total, [element, damage]) =>
    total + (Number(tiers[element] ?? 0) >= 1 ? damage : 0), 0);
}

// Call for the decisive hit, NEVER for a vortex tick, burn tick, status, or visual arc.
export function oneHitDecisiveDamage(baseDamage, tiers = {}) {
  if (!Number.isFinite(baseDamage) || baseDamage < 0) throw new RangeError('Base damage must be non-negative.');
  return baseDamage + oneHitInfusionDamageBonus(tiers);
}

// Evaluate exactly once, at committed attack start AFTER a teleport.
export function oneHitAttackForm({ grounded, galeTier = 0 }) {
  return grounded ? 'ground' : Number(galeTier) >= 2 ? 'aerial' : null;
}

export function oneHitPostArrivalWindup({ form, lightningTier = 0, teleported = false }) {
  if (form !== 'aerial' && form !== 'ground') return null;
  // Both grounded slams and aerial waves discharge immediately after the teleport.
  if (teleported && Number(lightningTier) >= 2) return ONE_HIT_RULES.postTeleportWindupSec;
  return form === 'aerial' ? ONE_HIT_RULES.aerialWindupSec : null;
}

// No arbitrary maximum range: fast initial gain and sharply diminishing returns.
export function oneHitTeleportReach(chargeSec) {
  if (!Number.isFinite(chargeSec) || chargeSec < 0) throw new RangeError('Charge must be non-negative.');
  return ONE_HIT_RULES.teleportDistanceScale * Math.log1p(chargeSec / ONE_HIT_RULES.teleportTimeScaleSec);
}
