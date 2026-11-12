// Sword Techniques: one optional martial ability a Spellblade carries beside the ordinary longsword, chosen in the
// Armory (never a stance or another weapon: the longsword and its chain stay as they are). Two of them:
//
//   Rigid Riposte        a committed lunge. The sword is brought up across the front first (the startup), and while
//                        it is up it turns whatever actually meets it: an enemy's blade, a thrown spell. Then the
//                        thrust, the whole knight carried forward behind the point. It meets what is really there.
//   Whirl Like the Wind  the sword swept right round, level, once; held, it goes round again for a quarter of the
//                        prowess meter a turn. It cuts where the blade passes and turns only what the blade meets.
//
// A technique earns its user no prowess, by its blows or by what its blade turns (ordinary swordsmanship earns
// prowess; exceptional swordsmanship spends it). Whoever defends against one earns as ever.
//
// The blade the server sweeps is the blade drawn: sampled from the clips the client plays (swordTechniqueTracks.mjs,
// generated beside the motion sidecar). Everything here that is a number is current tuning (provisional).

import { SWORD_TECHNIQUE_TRACKS } from './swordTechniqueTracks.mjs';
import { MOVEMENT } from './movement.mjs';

export const NO_SWORD_TECHNIQUE = 'none';
export const DEFAULT_SWORD_TECHNIQUE = NO_SWORD_TECHNIQUE;
/** The spell that lets a Whirl begin in the air and climb on a held Jump. */
export const WHIRL_LIFT_SPELL = 'gale';

export const SWORD_TECHNIQUES = Object.freeze({
  rigid_riposte: Object.freeze({
    id: 'rigid_riposte',
    name: 'Rigid Riposte',
    kind: 'riposte',
    cooldownSec: 10,
    // the blow: run through the middle, or caught off to one side of it (how far the thrust's line passed from the
    // body's own, metres)
    damage: 24,
    grazeDamage: 20,
    cleanWithin: 0.2,
    // its course (seconds): the sword brought up, held across the front, the thrust, and home
    enterSec: 0.1,
    braceSec: 0.22,
    thrustSec: 0.26,
    recoverySec: 0.35,
    // the sword turns what meets it from here (it is up) to the end of the brace
    interceptFrom: 0.06,
    // the lunge: this far, over the thrust; begun in the air it takes the Dash (and needs one ready)
    lungeDistance: 5.7,
    // how much of a run is left to the knight before the thrust, and coming home from it
    startupMove: 0.3,
    recoveryMove: 0.45,
    // on a guard, on a balance, and the shove it gives
    guardPressure: 1.5,
    stagger: 22,
    shove: 2.6,
    lift: 0.3,
    // turned by a perfect guard (or an enemy's own technique): staggered this long
    parriedSec: 0.68,
    clips: Object.freeze({
      enter: 'Technique_RigidRiposte_Enter', brace: 'Technique_RigidRiposte_Interception', thrust: 'Technique_RigidRiposte_Thrust',
      recovery: 'Technique_RigidRiposte_Recovery', parried: 'Technique_RigidRiposte_Parried', air: 'Technique_RigidRiposte_Air',
    }),
  }),
  whirl_like_the_wind: Object.freeze({
    id: 'whirl_like_the_wind',
    name: 'Whirl Like the Wind',
    kind: 'whirl',
    cooldownSec: 10,
    // each time round: a knight met on the blade's body, or only by its point (the last stretch of it)
    damage: 16,
    glanceDamage: 13,
    pointShare: 0.2,
    enterSec: 0.2,
    revolutionSec: 0.6,
    exitSec: 0.25,
    interruptedSec: 0.42,
    // the first time round is free; each one after costs this much prowess, while the button is held
    extraRevolutionCost: 25,
    // it moves at a run (no sprint, no crouch); with Gale Garner carried, a held Jump climbs at this pace
    speed: MOVEMENT.runSpeed,
    liftSpeed: 5,
    guardPressure: 0.8,
    stagger: 12,
    shove: 1.6,
    lift: 0.2,
    clips: Object.freeze({
      enter: 'Technique_Whirl_Enter', revolution: 'Technique_Whirl_Revolution', lift: 'Technique_Whirl_GaleLift', exit: 'Technique_Whirl_Exit',
      interrupted: 'Technique_Whirl_Interrupted', airRecovery: 'Technique_Whirl_AirRecovery',
    }),
  }),
});

export const SWORD_TECHNIQUE_IDS = Object.freeze(Object.keys(SWORD_TECHNIQUES));

export function isSwordTechnique(id) {
  return typeof id === 'string' && Object.hasOwn(SWORD_TECHNIQUES, id);
}

/** A loadout's technique: one of them, or none. */
export function normalizeSwordTechnique(id) {
  return isSwordTechnique(id) ? id : NO_SWORD_TECHNIQUE;
}

export function swordTechniqueFor(id) {
  return isSwordTechnique(id) ? SWORD_TECHNIQUES[id] : null;
}

/** A technique's whole course when nothing cuts it short (a Whirl: once round). */
export function techniqueDuration(technique) {
  return technique.kind === 'riposte' ? technique.enterSec + technique.braceSec + technique.thrustSec + technique.recoverySec
    : technique.enterSec + technique.revolutionSec + technique.exitSec;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Where a technique is, `nowSec`: { technique, phase, clip, time (into the clip), age } from its replicated state
 * ({ id, startedAt, spinAt?, endAt?, end?, airborne?, lifting? }), or null when there is none. The server's sweep, the
 * body's clip and the first-person arms all ask this.
 *   riposte: 'startup' (enter, then brace), 'thrust', 'recovery' (or 'parried')
 *   whirl:   'startup' (enter), 'spin' (the revolution it is in: `revolution`, from 1), 'recovery' (or 'interrupted')
 */
export function techniqueMoment(state, nowSec) {
  const technique = swordTechniqueFor(state?.id);
  if (!technique || !Number.isFinite(state.startedAt)) return null;
  const age = Math.max(0, nowSec - state.startedAt);
  const clips = technique.clips;
  if (Number.isFinite(state.endAt) && nowSec >= state.endAt) {
    const since = nowSec - state.endAt;
    if (technique.kind === 'riposte') {
      return state.end === 'parried'
        ? { technique, phase: 'parried', clip: clips.parried, time: Math.min(since, technique.parriedSec), age }
        : { technique, phase: 'recovery', clip: clips.recovery, time: Math.min(since, technique.recoverySec), age };
    }
    return state.end === 'interrupted'
      ? { technique, phase: 'interrupted', clip: clips.interrupted, time: Math.min(since, technique.interruptedSec), age }
      : { technique, phase: 'recovery', clip: state.airborne ? clips.airRecovery : clips.exit, time: Math.min(since, technique.exitSec), age };
  }
  if (technique.kind === 'riposte') {
    if (age < technique.enterSec) return { technique, phase: 'startup', clip: clips.enter, time: age, age, intercepts: age >= technique.interceptFrom };
    const braced = age - technique.enterSec;
    if (braced < technique.braceSec) return { technique, phase: 'startup', clip: clips.brace, time: braced, age, intercepts: true };
    return { technique, phase: 'thrust', clip: clips.thrust, time: clamp(braced - technique.braceSec, 0, technique.thrustSec), age };
  }
  if (age < technique.enterSec) return { technique, phase: 'startup', clip: clips.enter, time: age, age };
  const spun = Math.max(0, nowSec - (state.spinAt ?? state.startedAt + technique.enterSec));
  const revolution = Math.floor(spun / technique.revolutionSec + 1e-9);
  return { technique, phase: 'spin', clip: state.lifting ? clips.lift : clips.revolution, time: spun - revolution * technique.revolutionSec,
    age, revolution: revolution + 1, intercepts: true };
}

/** When a technique that has ended is over (its recovery played out): the knight may act again. */
export function techniqueOverAt(state) {
  const technique = swordTechniqueFor(state?.id);
  if (!technique || !Number.isFinite(state.endAt)) return Infinity;
  const tail = technique.kind === 'riposte' ? (state.end === 'parried' ? technique.parriedSec : technique.recoverySec)
    : state.end === 'interrupted' ? technique.interruptedSec : technique.exitSec;
  return state.endAt + tail;
}

/**
 * How a knight in a technique moves (movement.mjs `whirl`), or null. The server and a player's own prediction ask the
 * same question of the same replicated state.
 *   speed: their pace; lunge: { x, z, speed } carried forward regardless of what is held; liftSpeed: a held Jump
 *   climbs at this pace; steer: false while the facing is committed (`yaw`).
 */
export function techniqueMotion(player, nowSec) {
  const state = player?.techniqueState;
  const moment = techniqueMoment(state, nowSec);
  if (!moment) return null;
  const { technique, phase } = moment;
  const ordinaryFall = { fallGravity: 1, maxFall: Infinity };
  if (technique.kind === 'riposte') {
    if (phase === 'thrust') {
      const lunging = !(Number.isFinite(state.lungeEndAt) && nowSec >= state.lungeEndAt);
      return { ...ordinaryFall, speed: 0, steer: false, yaw: state.yaw, noJump: true,
        ...(lunging ? { lunge: { x: -Math.sin(state.yaw), z: -Math.cos(state.yaw), speed: technique.lungeDistance / technique.thrustSec } } : {}) };
    }
    if (phase === 'startup') return { ...ordinaryFall, speed: MOVEMENT.runSpeed * technique.startupMove, noJump: true };
    return { ...ordinaryFall, speed: MOVEMENT.runSpeed * technique.recoveryMove, noJump: true };
  }
  if (phase === 'recovery' || phase === 'interrupted') return { ...ordinaryFall, speed: technique.speed * 0.6 };
  return { ...ordinaryFall, speed: technique.speed, ...(state.lift ? { liftSpeed: technique.liftSpeed } : {}) };
}

/** What a knight in a technique may still do with their feet: `input` as the technique leaves it (movement.mjs). */
export function techniqueInput(input, motion) {
  if (!motion) return input;
  return { ...input, sprint: false, crouch: false, ...(motion.noJump ? { jump: false } : {}),
    ...(motion.steer === false ? { forward: 0, right: 0, yaw: motion.yaw } : {}) };
}

/** The sword's guard and point `time` seconds into a technique clip, in the knight's own space (+x right, -z ahead). */
export function techniqueBlade(clip, time) {
  const track = SWORD_TECHNIQUE_TRACKS[clip];
  if (!track) return null;
  const last = track[track.length - 1];
  if (time <= track[0].time) return track[0];
  if (time >= last.time) return last;
  // (60 Hz rows: straight to the pair either side)
  const i = Math.min(track.length - 2, Math.floor(time * 60 + 1e-9));
  const a = track[i], b = track[i + 1];
  const w = clamp((time - a.time) / Math.max(1e-9, b.time - a.time), 0, 1);
  const mix = (p, q) => ({ x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w, z: p.z + (q.z - p.z) * w });
  return { time, base: mix(a.base, b.base), tip: mix(a.tip, b.tip) };
}

/** A blade in the knight's own space, stood in the world at `position`, facing `yaw`. */
export function placeTechniqueBlade(blade, position, yaw) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  // right = (cos, 0, -sin), ahead = (-sin, 0, -cos); a point's -z is how far ahead it is
  const place = ({ x, y, z }) => ({ x: position.x + x * cos + z * sin, y: position.y + y, z: position.z - x * sin + z * cos });
  return { base: place(blade.base), tip: place(blade.tip) };
}

/** Which way a Whirl's blade goes round, seen from above: -1 clockwise (a Blazing Vortex turns the other way, +1). */
export const WHIRL_TURN = -1;
