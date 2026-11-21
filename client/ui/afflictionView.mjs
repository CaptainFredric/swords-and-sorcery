// Afflictions on the local Spellblade. A pure projection of authoritative
// snapshot state: no client-owned timers, predicted statuses, or fictitious
// weakening of conditions which actually end at full strength.
import { SPELLS, chillScale } from '../../shared/src/spells.mjs';
import { shakenSprintFactor, oneHitBacklashRemaining } from '../../shared/src/oneHitInfusions.mjs';
import { blusterSeverity, ONE_HIT_BLUSTER, ONE_HIT_CONDUCT, ONE_HIT_FIELD } from '../../shared/src/oneHitStatus.mjs';

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const AFFLICTIONS = Object.freeze({
  frozen: Object.freeze({
    name: 'Frozen', icon: 'afflictionFrozen', steady: true,
    description: "You can't move or start new actions. Anything already in progress resumes when the ice breaks.",
  }),
  staggered: Object.freeze({
    name: 'Staggered', icon: 'afflictionStaggered', steady: true,
    description: "You've lost your balance. You can't attack, Guard, cast spells, or Dash until you recover.",
  }),
  conduct: Object.freeze({
    name: 'Shocking Conduct', icon: 'afflictionConduct', steady: false,
    description: 'Your next sword or gauntlet hit is cancelled, and the remaining charge shocks you instead. The charge fades over time.',
  }),
  blustered: Object.freeze({
    name: 'Blustered', icon: 'afflictionBlustered', steady: false,
    description: 'You can look around freely, but your sword and Guard turn more slowly toward your aim. This wears off over time.',
  }),
  shaken: Object.freeze({
    name: 'Shaken', icon: 'afflictionShaken', steady: false,
    description: "Sprinting is slowed. Standing in All-Natural Disaster's lingering field delays your recovery.",
  }),
  burning: Object.freeze({
    name: 'Burning', icon: 'afflictionBurning', steady: true,
    description: 'Fire deals repeated damage until the flames go out.',
  }),
  chilled: Object.freeze({
    name: 'Chilled', icon: 'afflictionChilled', steady: false,
    description: 'Your movement is slowed. Your normal speed returns as the chill wears off.',
  }),
  frostbound: Object.freeze({
    name: 'Frostbound', icon: 'afflictionFrostbound', steady: true,
    description: "All-Natural Disaster's frost slows your movement. Standing in its frosted field can keep you slowed.",
  }),
  tornGround: Object.freeze({
    name: 'Torn Ground', icon: 'afflictionTornGround', steady: true,
    description: "You can't Sprint while standing on a Sunder fissure. Move off it to run again.",
  }),
  rupture: Object.freeze({
    name: 'On Ruptured Ground', icon: 'afflictionRupture', steady: false,
    description: 'You recover from Shaken more slowly here. Damage taken inside the field also drains Guard stamina.',
  }),
});

const push = (output, id, strength) => {
  if (strength > 0.005) output.push({ id, strength: clamp(strength), ...AFFLICTIONS[id] });
};

/** Snapshot status, in a stable danger-first order. Strength is current
 * effectiveness, NOT a countdown: fixed-strength statuses stay full until
 * they actually end. Display no remaining seconds, timers, or percentages. */
export function afflictionView(player, nowSec) {
  if (!player?.alive || !Number.isFinite(nowSec)) return [];
  const effects = [];
  if ((player.oneHitFrozenUntil ?? -Infinity) > nowSec) push(effects, 'frozen', 1);
  if ((player.staggerUntil ?? -Infinity) > nowSec) push(effects, 'staggered', 1);
  const conduct = player.electricalBacklash;
  if (conduct) {
    const potential = oneHitBacklashRemaining(conduct, nowSec);
    push(effects, 'conduct', potential / ONE_HIT_CONDUCT.potential);
  }
  const bluster = blusterSeverity(player.blustered, nowSec);
  if (bluster > ONE_HIT_BLUSTER.free) push(effects, 'blustered', bluster);
  if (player.shaken) push(effects, 'shaken', 1 - shakenSprintFactor(player.shaken, nowSec));
  if ((player.burningUntil ?? -Infinity) > nowSec) push(effects, 'burning', 1);
  if (player.chill && nowSec < player.chill.until) {
    const current = 1 - chillScale(player.chill, nowSec);
    // Compare against the spell's strongest chill, not the exposure's own
    // initial depth; a glancing, mild chill must not look fully potent.
    push(effects, 'chilled', current / Math.max(0.001, SPELLS.frostfire.chill.slow));
  }
  const frost = player.oneHitFrostSlow;
  if (frost && nowSec < frost.until) {
    // This slow really holds at a fixed depth until it ends or is refreshed.
    push(effects, 'frostbound', (frost.depth ?? ONE_HIT_FIELD.frostDepth) / ONE_HIT_FIELD.frostDepth);
  }
  if (player.tornGround) push(effects, 'tornGround', 1);
  const field = player.oneHitField;
  if (field && field.ownerId !== player.id) push(effects, 'rupture', field.strength);
  return effects;
}
