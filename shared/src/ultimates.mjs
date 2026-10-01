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
  // Blazing Vortex: for a few seconds the Spellblade is a spinning sword, steered. A small hop (from the ground), the
  // sword taken in both hands and lit, a turn that gathers speed (the startup, as exposed as any); then the spin: the
  // blade goes round and round as a real blade (shared/src/blade.mjs), level with a little droop, leaning the way the
  // knight looks, and cuts whoever it passes through, each of them once a turn at most. Nothing at a distance is
  // touched by the sword. Small Fireballs (shared/src/spells.mjs CONJURED.ember) peel off toward the aim. The knight
  // moves faster than a run and slower than a sprint, falls slowly (it never rises of itself: no flight), cannot
  // guard, sprint, dash, swing, cast or throw a fist, and is hurt and shaken exactly as ever. Feet on the ground the
  // sword does the work; falling fast, it bites less and the fire comes thicker. A guard catches its first contacts
  // and is then broken through (no perfect guard turns a blade that is already coming round again). Then a short
  // recovery, and a dizzy moment that is only seen. Current tuning (provisional).
  vortex: Object.freeze({
    id: 'vortex',
    label: 'Blazing Vortex',
    short: 'Vortex',
    startupSec: 0.9,       // the hop, the sword lit, the turn gathering
    activeSec: 4.5,
    lockoutSec: 2.5,
    startupMove: 0.5,
    startupStagger: 1.5,
    hop: 5.4,              // m/s upward as it begins, from the ground only (some 0.8 m)
    // the knight's own pace while it spins (a run is 7.5, a sprint 11); falling, gravity is this share of itself and
    // the fall never faster than `maxFall` (rising is as ever)
    move: Object.freeze({ speed: 9.3, fallGravity: 0.4, maxFall: 5 }),
    // the blade: turns a second (leftward), how far its tip droops below level, how far it leans with the aim
    spin: Object.freeze({ revPerSec: 3, droopDeg: 8, leanDeg: 25 }),
    // a contact: full damage within `inner` metres of the eyes along the blade, falling to `tip` of it at the point;
    // one knight is cut no more often than `everySec`; a guard pays `guardPressure` blows' worth for each
    // (the third breaks a fresh one); `airborne`: the share of the damage left when falling fast
    contact: Object.freeze({ damage: 27, inner: 1.5, tip: 0.65, everySec: 0.3, shove: 1.1, lift: 0.15, stagger: 9, guardPressure: 1.6, airborne: 0.6 }),
    // the fire: one ember every `everySec` with feet on the ground, every `fallingEverySec` falling fast (`fallBias`
    // m/s or more), evenly between; the first no sooner than `firstAfterSec` into the spin
    ember: Object.freeze({ spell: 'ember', everySec: 0.55, fallingEverySec: 0.24, firstAfterSec: 0.3 }),
    fallBias: 4,
    recoverSec: 0.5,       // after it ends: no sword, spell or fist
    dizzySec: 1.6,         // and this long a little dizzy (seen and heard; nothing is taken from the knight)
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

/** The Blazing Vortex a knight is spinning in now (its data), or null. */
export function vortexing(player, nowSec) {
  const ultimate = activeUltimate(player, nowSec);
  return ultimate?.id === 'vortex' ? ultimate : null;
}

/** Whether a knight is still dizzy from a Vortex just ended. */
export function dizzy(player, nowSec) {
  return nowSec < (player?.dizzyUntil ?? -Infinity);
}

/**
 * How a spinning knight moves (movement.mjs `whirl`): the Vortex's own pace and slow fall while it is active, else
 * null. The server and a player's own prediction ask the same question.
 */
export function ultimateWhirl(player, nowSec) {
  return vortexing(player, nowSec)?.move ?? null;
}

/**
 * How far a Vortex has tipped from sword to fire (0..1): 0 with feet on the ground or rising, 1 falling at
 * `fallBias` m/s or faster.
 */
export function vortexFallBias(player, vortex = ULTIMATES.vortex) {
  if (!player || player.grounded) return 0;
  return Math.max(0, Math.min(1, -(player.velocity?.y ?? 0) / vortex.fallBias));
}

/** Where a Vortex's blade points (its turn about the knight, radians, as a yaw) at a moment: from `spinFrom` at its commit. */
export function vortexAngle(state, nowSec, vortex = ULTIMATES.vortex) {
  return (state?.spinFrom ?? 0) + 2 * Math.PI * vortex.spin.revPerSec * (nowSec - (state?.commitAt ?? nowSec));
}

/**
 * The turn a Vortex gathers through its startup (radians, added to where the knight faces): one whole turn, slowly
 * at first, arriving at the spin's own speed as it commits (so what is seen runs on into the spin without a step).
 */
export function vortexWindup(state, nowSec, vortex = ULTIMATES.vortex) {
  const share = Math.max(0, Math.min(1, 1 - ((state?.commitAt ?? nowSec) - nowSec) / vortex.startupSec));
  return 2 * Math.PI * share ** (vortex.spin.revPerSec * vortex.startupSec);
}
