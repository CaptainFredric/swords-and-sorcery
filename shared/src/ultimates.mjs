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
  // (shared/src/rupture.mjs). A Sundering blow on a body ends what that knight was doing: a spell gathering, a sword
  // chain, a fist thrown, a dash, a sprint, an ultimate still being braced into (interrupted as any other; one
  // already committed is not undone). The world stops it only where it is driven straight into something (`worldStopDeg`). Sheathe in Steel meets it halfway: against hardened plate, a Sundering blow is an
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
    // the world stops a Sundering blade only where it is truly driven into it: within this far of the slam's aim (an
    // ordinary blade: BLADE.worldStopDeg), and never a small loose furnishing (a barrel's rim, a crate's corner)
    worldStopDeg: 14,
  }),
  // Blazing Vortex: for some seconds the Spellblade is a spinning, burning sword, steered. A small hop (from the
  // ground), the sword taken in both hands and lit, a turn that gathers speed (the startup, as exposed as any); then
  // the spin: the blade goes round and round as a real blade (shared/src/blade.mjs), level with a little droop,
  // leaning the way the knight looks, and cuts whoever it passes through, each of them once a turn at most, leaving a
  // scorch on them. Nothing at a distance is touched by the sword, and nothing through a wall; what the blade clips of
  // the world rings and sparks and does not stop it. Small Fireballs (shared/src/spells.mjs CONJURED) leave along the
  // aim. The knight moves faster than a run and slower than a sprint, falls slowly (it never rises of itself: no
  // flight), cannot guard, sprint, dash, swing, cast or throw a fist, and is hurt and shaken exactly as ever.
  //
  // What it is, the knight steers with what they hold (`emphasis`, -1..1, moving between them over `emphasisSec`):
  //   nothing held, or both: balanced;
  //   the guard held (the right hand's button: there is no guard to raise while it spins): the blade (it spins
  //   faster, hangs in the air longest, and its fire is a weak ember);
  //   the attack held (the left: as one looses a shot): the fire (it spins slower, falls sooner, and its fire is a
  //   small, serious Fireball).
  // One measure, eased: there is no having the fastest blade and the strongest fire at once, and nothing to gain by
  // flicking between them. A guard catches its first contacts and is then broken through (no perfect guard turns a
  // blade that is already coming round again). Then a short recovery, and a dizzy moment that is only seen.
  // Current tuning (provisional).
  vortex: Object.freeze({
    id: 'vortex',
    label: 'Blazing Vortex',
    short: 'Vortex',
    startupSec: 0.9,       // the hop, the sword lit, the turn gathering
    activeSec: 8,
    lockoutSec: 2.5,
    startupMove: 0.5,
    startupStagger: 1.5,
    hop: 5.4,              // m/s upward as it begins, from the ground only (some 0.8 m)
    speed: 9.3,            // the knight's own pace while it spins (a run is 7.5, a sprint 11)
    emphasisSec: 0.35,     // from balanced to all the way one way (twice that from one end to the other)
    // each emphasis at its full: turns a second; falling, gravity is this share of itself and the fall never faster
    // than `maxFall` (rising is as ever); which fire it throws (one projectile per full active revolution)
    balanced: Object.freeze({ revPerSec: 3.25, fallGravity: 0.4, maxFall: 5, fire: 'vortexFire' }),
    blade: Object.freeze({ revPerSec: 4.25, fallGravity: 0.2, maxFall: 2.4, fire: 'ember' }),
    fire: Object.freeze({ revPerSec: 2.1, fallGravity: 0.55, maxFall: 7, fire: 'vortexBlaze' }),
    fireFrom: 0.5,         // past this much emphasis either way, the fire thrown is that end's own
    // the blade: how far its tip droops below level, how far it leans with the aim
    spin: Object.freeze({ droopDeg: 8, leanDeg: 25 }),
    // a contact: full damage within `inner` metres of the eyes along the blade, falling to `tip` of it at the point;
    // one knight is cut no more often than `everySec` (never more than once a turn at its fastest); a guard pays
    // `guardPressure` blows' worth for each (the third breaks a fresh one)
    contact: Object.freeze({ damage: 30, inner: 1.5, tip: 0.65, everySec: 0.2, shove: 1.1, lift: 0.15, stagger: 9, guardPressure: 1.6 }),
    // the scorch a cut leaves on an unguarded knight: this much more, in licks, over this long. One at a time: a new
    // cut begins it again (it never stacks). Hardened plate takes fewer licks of it; fully hard, none
    scorch: Object.freeze({ damage: 6, seconds: 0.6, licks: 3 }),
    // what the blade clips of the world (seen and heard only): looked for along this much of the blade (the sword as
    // it is seen), every `stepDeg` of its turn; no two rings within `everySec`, none off the same thing within `sameSec`
    world: Object.freeze({ reach: 1.75, stepDeg: 12, everySec: 0.4, sameSec: 0.8 }),
    recoverSec: 0.5,       // after it ends: no sword, spell or fist
    dizzySec: 1.6,         // and this long a little dizzy (seen and heard; nothing is taken from the knight)
  }),
  chivalry: Object.freeze({
    id: 'chivalry',
    label: 'Spells & Chivalry',
    short: 'Chivalry',
    startupSec: 0.65,
    activeSec: 9,
    lockoutSec: 2.5,
    startupMove: 0.65,
    startupStagger: 1.5,
    projectileChivalryGateSec: 0.72,
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

/** The emphasis a knight asks of their Vortex by what they hold: 1 the blade (guard), -1 the fire (attack), 0 balanced (neither, or both). */
export function vortexEmphasisWanted(input) {
  const fire = Boolean(input?.attack);
  const blade = Boolean(input?.guard);
  return fire === blade ? 0 : blade ? 1 : -1;
}

/** A Vortex's emphasis `dt` seconds on: moved toward what is wanted, evenly, never faster than `emphasisSec` allows. */
export function stepVortexEmphasis(emphasis, wanted, dt, vortex = ULTIMATES.vortex) {
  const now = Number.isFinite(emphasis) ? emphasis : 0;
  const step = Math.max(0, dt) / vortex.emphasisSec;
  return Math.max(-1, Math.min(1, now + Math.max(-step, Math.min(step, wanted - now))));
}

/**
 * What a Vortex is at an emphasis (-1..1): { revPerSec, fallGravity, maxFall } eased between balanced
 * and that end's own, and `fire` (which fire it throws) and `kind` ('balanced', 'blade', 'fire').
 */
export function vortexTune(emphasis = 0, vortex = ULTIMATES.vortex) {
  const e = Math.max(-1, Math.min(1, Number.isFinite(emphasis) ? emphasis : 0));
  const end = e >= 0 ? vortex.blade : vortex.fire;
  const share = Math.abs(e);
  const mix = (key) => vortex.balanced[key] + (end[key] - vortex.balanced[key]) * share;
  const kind = share <= vortex.fireFrom ? 'balanced' : e > 0 ? 'blade' : 'fire';
  return {
    revPerSec: mix('revPerSec'),
    fallGravity: mix('fallGravity'),
    maxFall: mix('maxFall'),
    fire: vortex[kind].fire,
    kind,
  };
}

/**
 * How a spinning knight moves (movement.mjs `whirl`): the Vortex's own pace, and the slow fall of its emphasis, while
 * it is active; else null. The server and a player's own prediction ask the same question.
 */
export function ultimateWhirl(player, nowSec) {
  const vortex = vortexing(player, nowSec);
  if (!vortex) return null;
  const tune = vortexTune(player.ultimateState?.emphasis, vortex);
  return { speed: vortex.speed, fallGravity: tune.fallGravity, maxFall: tune.maxFall };
}

/**
 * Where a Vortex's blade points (its turn about the knight, radians, as a yaw) at a moment: from where the host last
 * said it was (`angle` at `angleAt`), on at the rate it was turning then (`rate`, radians a second).
 */
export function vortexAngle(state, nowSec) {
  return (state?.angle ?? 0) + (state?.rate ?? 0) * (nowSec - (state?.angleAt ?? nowSec));
}

/**
 * The turn a Vortex gathers through its startup (radians, added to where the knight faces): one whole turn, slowly
 * at first, arriving at the spin's own (balanced) speed as it commits, so what is seen runs on into the spin
 * without a step.
 */
export function vortexWindup(state, nowSec, vortex = ULTIMATES.vortex) {
  const share = Math.max(0, Math.min(1, 1 - ((state?.commitAt ?? nowSec) - nowSec) / vortex.startupSec));
  return 2 * Math.PI * share ** (vortex.balanced.revPerSec * vortex.startupSec);
}
