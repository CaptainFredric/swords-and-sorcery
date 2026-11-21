import { SPELLS } from './spells.mjs';
import { STEEL_DAMAGE_RANGES } from './steel.mjs';
import { STEEL_RAM, ramEffect } from './steelRam.mjs';

// Rule foundation for the eventual server-authoritative Ultimate and its presentation.
// This does not register or activate the Ultimate or the new Line of Conduct spell.
export const ONE_HIT_RULES = Object.freeze({
  aerialWindupSec: 0.85,
  groundReleaseWindowSec: 0.32,
  // Half Lightning's finite hold is long enough to aim, not a four-second aerial refuge.
  // An early release cannot bypass its genuinely faster .36 s minimum wind-up.
  halfLightningStartupSec: 0.36,
  halfLightningHoldMaxSec: 1.75,
  // Without Full Gale, a caster knocked from a ledge completes a swift,
  // grounded plunge, without acquiring Gale's airborne projectile.
  groundPlungeFallSpeed: 21,

  // After a full-Lightning teleport, the discharge has no SECOND wind-up.
  postTeleportWindupSec: 0,
  // A one-second authored vortex after an airborne teleport lets the player
  // retarget the sword independently from the travel direction.
  postTeleportAimSec: 1.0,
  groundedGaleWaveDelaySec: 0.14,
  waveMaxReach: 22,
  waveTerminalRadius: 2.2,
  // A Fire-infused terminal blast equals an ordinary (uninfused) ground slam;
  // it is still smaller than the widened Fire-infused ground slam.
  waveTerminalFireRadius: 4.0,
  // Held teleport visual aura does not continually expand or inflict damage.
  teleportAuraMaxRadius: 1.25,
  teleportDistanceScale: 22,
  teleportTimeScaleSec: 0.9,
  lineOfConduct: Object.freeze({
    nearDamage: 20, farDamage: 12, halfFalloffMetres: 12,
    afterlineSeconds: 1, afterlineRadius: .18, directRadius: .7,
    // Electrical potential and its brief lifetime also fall off with
    // distance, without making an across-map strike useless.
    nearConduct: 12, farConduct: 4, nearConductSeconds: 3, farConductSeconds: 1.25,
  }),
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

/** Gameplay has finite authored arenas, but no 240m damage cutoff.
 * Aim through every known arena surface and target, stopping only at real
 * intersecting solids. Compute the segment's end for network/VFX only. */
export function lineOfConductReach(origin,direction,world={},targets=[]){
  const project=p=>((p.x-origin.x)*direction.x+
    (p.y-origin.y)*direction.y+(p.z-origin.z)*direction.z);
  let reach=240;
  for(const p of targets){
    if(p&&[p.x,p.y,p.z].every(Number.isFinite))
      reach=Math.max(reach,project(p)+12);
  }
  for(const f of world.floors??[]){
    if(!Array.isArray(f.center)||!Array.isArray(f.size))continue;
    const p={x:f.center[0],y:f.y??f.center[1],z:f.center[2]};
    const half=.5*(Math.abs(direction.x)*(f.size[0]??0)+
      Math.abs(direction.y)*(f.size[1]??0)+
      Math.abs(direction.z)*(f.size[2]??0));
    reach=Math.max(reach,project(p)+half+12);
  }
  for(const r of world.ramps??[]){
    if(!Number.isFinite(r.minX)||!Number.isFinite(r.maxX)||
       !Number.isFinite(r.minZ)||!Number.isFinite(r.maxZ))continue;
    const mid={x:(r.minX+r.maxX)/2,
      y:(Number(r.startY)||0)*.5+(Number(r.endY)||0)*.5,
      z:(r.minZ+r.maxZ)/2};
    const half=(Math.abs(direction.x)*(r.maxX-r.minX)+
      Math.abs(direction.z)*(r.maxZ-r.minZ)+
      Math.abs(direction.y)*Math.abs((r.endY??0)-(r.startY??0)))/2;
    reach=Math.max(reach,project(mid)+half+12);
  }
  return reach;
}

export function lineOfConductAffliction(distanceMetres,nowSec,sourceId){
  const r=ONE_HIT_RULES.lineOfConduct;
  const d=Math.max(0,Number.isFinite(distanceMetres)?distanceMetres:Infinity);
  const intensity=1/(1+d/r.halfFalloffMetres);
  return {at:nowSec,initial:r.farConduct+
      (r.nearConduct-r.farConduct)*intensity,
    seconds:r.farConductSeconds+(r.nearConductSeconds-r.farConductSeconds)*intensity,
    sourceId};
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
