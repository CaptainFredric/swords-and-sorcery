// Ultimates, as data. Each is spent from the one Prowess meter (prowess.mjs) and goes the same way:
//
//   the key is pressed (the meter full) -> a vulnerable startup -> the commit point: the charge is spent, and the
//   ultimate is active for its stretch.
//
// Staggered before the commit point (a broken balance, a broken guard, a parry: anything that sets `staggerUntil`),
// or killed, the knight keeps their charge but cannot try again for a moment (`lockoutSec`). Once committed, it is
// spent however it ends. Each ultimate says what its startup allows and how exposed it leaves the knight
// (`startupStagger`: stagger from blows during it goes up by this much). Current tuning (provisional).

export const ULTIMATES = Object.freeze({
  // Sunder All That Rusts: for a while, every blow the Spellblade lands is the most forceful it could be. The sword
  // strikes at an elevated level, with the greatest physical force (the shove, the weight on a guard, the stagger),
  // a guard pays for two blows at once, and every strike is a slam: the sword comes down from overhead, driven along an
  // aim at least `slamPitch` below level (so it finds the ground without the knight looking at their feet), through
  // whoever it meets and on into the ground, which ruptures under them and whoever else stands on its line
  // (shared/src/rupture.mjs). Sheathe in Steel meets it halfway: against hardened plate, a Sundering blow is an
  // ordinary one.
  sunder: Object.freeze({
    id: 'sunder',
    label: 'Sunder All That Rusts',
    short: 'Sunder',
    startupSec: 0.6,       // the brace (and the cry)
    activeSec: 8,
    lockoutSec: 2.5,
    startupMove: 0.35,     // a bracing knight moves this much of a run
    startupStagger: 1.5,
    guardImpacts: 2,       // one Sundering blow on a guard weighs as two
    slamPitch: -0.45,      // radians: a slam is driven along the aim, or this far below level if that is lower
  }),
});

export const DEFAULT_ULTIMATE = 'sunder';

/** Whether `id` names an ultimate. */
export function isUltimate(id) {
  return Object.hasOwn(ULTIMATES, String(id));
}

/** An ultimate by id (the default for anything else). */
export function ultimateFor(id) {
  return ULTIMATES[id] ?? ULTIMATES[DEFAULT_ULTIMATE];
}

/** The ultimate a knight is bracing into (its startup) now, or null. */
export function ultimateStartup(player, nowSec) {
  const state = player?.ultimateState;
  return state && state.phase === 'startup' && nowSec < state.commitAt ? ultimateFor(state.id) : null;
}

/** The ultimate a knight has active now, or null. */
export function activeUltimate(player, nowSec) {
  const state = player?.ultimateState;
  return state && state.phase === 'active' && nowSec < state.until ? ultimateFor(state.id) : null;
}

/** Whether a knight is Sundering now. */
export function sundering(player, nowSec) {
  return activeUltimate(player, nowSec)?.id === 'sunder';
}
