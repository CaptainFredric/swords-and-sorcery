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
    description: 'The ice holds movement and new actions. Anything already under way resumes when it releases.',
  }),
  staggered: Object.freeze({
    name: 'Staggered', icon: 'afflictionStaggered', steady: true,
    description: 'Your balance is broken. You cannot begin an attack, Guard, spell, or Dash until you recover.',
  }),
  conduct: Object.freeze({
    name: 'Shocking Conduct', icon: 'afflictionConduct', steady: false,
    description: 'Your next melee strike that would land is stopped. The remaining electrical charge shocks you instead. Its potential is draining away.',
  }),
  blustered: Object.freeze({
    name: 'Blustered', icon: 'afflictionBlustered', steady: false,
    description: 'Your sword and Guard turn toward your aim more slowly. Your view is free to turn. The wind gradually lets go.',
  }),
  shaken: Object.freeze({
    name: 'Shaken', icon: 'afflictionShaken', steady: false,
    description: 'Your Sprint is impaired. It wears off, but standing on a Disaster rupture holds back your recovery.',
  }),
  burning: Object.freeze({
    name: 'Burning', icon: 'afflictionBurning', steady: true,
    description: 'Fire keeps dealing damage while it burns. The damage does not gradually weaken; the flames eventually go out.',
  }),
  chilled: Object.freeze({
    name: 'Chilled', icon: 'afflictionChilled', steady: false,
    description: 'Cold slows your movement and Sprint. The chill gradually thaws.',
  }),
  frostbound: Object.freeze({
    name: 'Frostbound', icon: 'afflictionFrostbound', steady: true,
    description: 'Disaster frost slows your movement. Its grip can linger after the initial freeze, or be renewed by a frost-covered rupture.',
  }),
  tornGround: Object.freeze({
    name: 'Torn Ground', icon: 'afflictionTornGround', steady: true,
    description: 'An enemy’s Sundering strike has torn the ground beneath you. Sprint is denied while you stand on it.',
  }),
  rupture: Object.freeze({
    name: 'On Ruptured Ground', icon: 'afflictionRupture', steady: false,
    description: 'The fractured ground delays recovery from Shaken. Damage taken here also drains Guard stamina. Its influence fades as the field settles.',
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
