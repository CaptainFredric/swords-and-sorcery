// When a cut is told (cutTell.mjs draws it): a bell centred a quarter of a second before each committed cut's contact,
// read from the swing anyone watching could see (when the chain began, which cuts are committed), never a button. Pure.

import { SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { CUTS, CUT_ORDER } from '../../shared/src/combatFrameData.mjs';

// how long before contact the glint peaks, and how wide it is either side (seconds)
export const CUT_TELL = Object.freeze({ lead: CUTS.forehand.tellLead, width: 0.075 });

/** How strongly a knight's next cut is told at `now` (0..1). */
export function cutTellStrength(player, now, tell = CUT_TELL) {
  if (!player?.attackActive || !Number.isFinite(player.attackStartedAt)) return 0;
  const first = Math.max(0, player.attackNextStrike ?? 0);
  const last = Math.min(SWORD_STRIKE_TIMES.length, player.attackCommitted ?? 0);
  let best = 0;
  for (let strike = first; strike < last; strike += 1) {
    const lead = (player.attackStartedAt + SWORD_STRIKE_TIMES[strike]) - now;
    // (the chop is told a touch earlier: its arc is longer)
    const centre = CUTS[CUT_ORDER[strike]]?.tellLead ?? tell.lead;
    const x = (lead - centre) / tell.width;
    if (Math.abs(x) < 1) best = Math.max(best, 0.5 + 0.5 * Math.cos(Math.PI * x));
  }
  return best;
}
