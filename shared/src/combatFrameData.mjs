// Cadence combat (prototype): the sword's timing as data, defined once, and the rules that judge a player's timing
// against it. Pure, so the server, the bots, the body that shows a move and the tests all read the same numbers.
//
// Three ideas, kept apart:
//   - FRAME DATA: every cut's timeline (startup to contact, the live stretch around it, the tell before it, the step it
//     takes) and the clip that shows it, with that clip's own contact frame. The animation is fitted to the data, never
//     the other way round: a new clip (an artist's, a mocap take's, a generated one) brings its markers and is retimed
//     onto these numbers by tools/animation/retarget-bvh.mjs.
//   - CADENCE: the chain goes on when the button is pressed in time with it. Each cut has a beat a little after its
//     contact (the follow-through ringing out). A press on the beat brings the next cut round sooner and harder; one in
//     the window but off it brings it round as usual; an early press is kept (no penalty, no bonus: mashing earns
//     nothing); a late one lets the chain lapse. Holding the button still works, at the slow, safe cadence: the floor
//     is the old held chain, the ceiling is rhythm.
//   - DEFENCE TIERS: a guard raised just before the blow lands is a Parry; raised in the last instant, a Perfect Parry
//     (a longer stagger and a riposte); raised early, a Block (it costs stamina). A guard tapped and dropped before the
//     blow arrives is a whiff: a short opening.
//
// Current tuning, provisional: these are the numbers the Combat Lab (client/lab/) plays, to be felt and changed.

import { GAME, MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES } from './combat.mjs';

// Each cut. Times are seconds from the cut's start (the moment it is committed).
//   startup      start to contact, fresh (a chain's first cut) and linked (a later one, picked up mid-raise)
//   active       the live stretch around contact (the server's blade window and its driven follow)
//   tellLead     the tell (a glint along the blade, a breath of the swing) comes this long before contact
//   clip         the clip that shows it; clipContact its contact frame; linkEntry where a linked cut is picked up
//   step         the step it takes, forward along the knight's facing (metres, over [from, to] of the cut): moved by
//                the simulation, not by the clip (root motion), so the step the eye sees is the step the body takes
export const CUTS = Object.freeze({
  forehand: Object.freeze({
    kind: 0, clip: 'Slash_1', clipContact: 0.391, linkEntry: 0.167, clipEnd: 23 / 30,
    startup: Object.freeze({ fresh: 0.40, linked: 0.30 }),
    tellLead: 0.25,
    step: Object.freeze({ from: 0.18, to: 0.42, distance: 0.0 }),
  }),
  backhand: Object.freeze({
    kind: 1, clip: 'Slash_2', clipContact: 0.297, linkEntry: 0.167, clipEnd: 23 / 30,
    startup: Object.freeze({ fresh: 0.38, linked: 0.28 }),
    tellLead: 0.25,
    step: Object.freeze({ from: 0.1, to: 0.35, distance: 0.0 }),
  }),
  chop: Object.freeze({
    kind: 2, clip: 'Slash_3', clipContact: 0.385, linkEntry: 0.167, clipEnd: 20 / 30,
    startup: Object.freeze({ fresh: 0.40, linked: 0.32 }),
    tellLead: 0.28,
    step: Object.freeze({ from: 0.15, to: 0.4, distance: 0.0 }),
  }),
});
export const CUT_ORDER = Object.freeze(['forehand', 'backhand', 'chop']);
export const ACTIVE = Object.freeze({ before: MELEE_CONTACT.window.early, after: MELEE_CONTACT.follow });

// The chain's rhythm, from each cut's contact (seconds).
//   beat       the moment to press for the next cut
//   open/close the window a press counts in (before `open`: early, kept; after `close`: late, the chain lapses)
//   perfect    how far from the beat a press is still on it
//   next       when the next cut begins after an on-beat press, an in-window one, or a held button (the old chain)
//   lapse      a chain nobody carried on is over this long after its last contact (back to the stance)
// The window closes where the next cut would have begun anyway (the game's own rule: a chain goes on only if the
// button is held, or pressed again, by then), so rhythm only ever adds speed to the chain the game already has.
export const CADENCE = Object.freeze({
  beat: 0.2,
  open: 0.04,
  close: 0.32,
  perfect: 0.05,
  next: Object.freeze({ perfect: 0.18, good: 0.26, held: 0.32 }),
  lapse: 0.32,
  // the third cut ends a chain: the next press starts a new one (from the forehand), on the same beat
  finisherRestart: 0.28,
});

/** How a press for the next cut, `pressAt` seconds after the current cut's contact, is judged. */
export function judgeCadence(pressAt, cadence = CADENCE) {
  if (!Number.isFinite(pressAt)) return { grade: 'none' };
  const offset = pressAt - cadence.beat;
  if (pressAt < cadence.open) return { grade: 'early', offset };
  if (pressAt > cadence.close) return { grade: 'late', offset };
  return { grade: Math.abs(offset) <= cadence.perfect + 1e-9 ? 'perfect' : 'good', offset };
}

/** When the next cut begins (seconds after the current cut's contact), for a press's grade or a held button. */
export function nextCutDelay(grade, cadence = CADENCE) {
  if (grade === 'perfect') return cadence.next.perfect;
  if (grade === 'good') return cadence.next.good;
  if (grade === 'early' || grade === 'held') return cadence.next.held;
  return null;
}

// Timing never raises a blow's damage: aim alone decides it (blade.mjs aimQuality: 25-27 for a good ordinary blow,
// 28-30 only for consistently centred aim; that top band is not to be loosened). Rhythm is paid in speed (the next cut
// comes sooner) and in weight on a guard (an on-beat cut bears harder on it); a Perfect Parry in the reel it puts the
// attacker in (a sure opening), not in damage.
export const TIMING_BONUS = Object.freeze({ perfect: 1, good: 1, held: 1, early: 1, riposte: 1 });
export const TIMING_PRESSURE = Object.freeze({ perfect: 1.25, good: 1.1, held: 1, early: 1 });

/**
 * The game's chain, carried on by a press (server and the local arms alike): when a press made at `pressAt` brings the
 * chain's next cut, against the chain that began at `startedAt` with `landed` of its cuts landed. Returns null when
 * there is no next cut to bring (before the first contact, or after the third), else { grade, offset, strike (the cut
 * it brings), contactAt (the last contact), at (when that cut now begins, or null if the press does not hasten it),
 * shift (how far the chain's clock jumps ahead then: the rest of the follow-through is cancelled into the next cut) }.
 */
export function chainCadence({ startedAt, landed, pressAt }, cadence = CADENCE) {
  if (!(landed >= 1 && landed < SWORD_STRIKE_TIMES.length) || !Number.isFinite(startedAt) || !Number.isFinite(pressAt)) return null;
  const contactAt = startedAt + SWORD_STRIKE_TIMES[landed - 1];
  const judged = judgeCadence(pressAt - contactAt, cadence);
  const nominal = startedAt + SWORD_CHAIN.starts[landed];
  if (judged.grade !== 'perfect' && judged.grade !== 'good') return { ...judged, strike: landed, contactAt, at: null, shift: 0 };
  const at = Math.max(pressAt, contactAt + nextCutDelay(judged.grade, cadence));
  const shift = Math.max(0, nominal - at);
  return { ...judged, strike: landed, contactAt, at: shift > 1e-6 ? at : null, shift: shift > 1e-6 ? shift : 0 };
}

// Defence, by when the guard went up relative to the blow's contact (lead = contact - guard raised, seconds).
export const DEFENCE = Object.freeze({
  perfect: GAME.perfectParryWindowMs / 1000, // raised within this of the contact: a Perfect Parry
  parry: GAME.parryWindowMs / 1000, // within this: a Parry
  whiffOpening: 0.35,        // a guard tapped and dropped before the blow: this long when it cannot go up again
  parryStagger: GAME.parryStaggerMs / 1000,
  perfectStagger: GAME.perfectParryStaggerMs / 1000, // the attacker reels this long after a Perfect Parry...
  riposteWindow: 0.7,        // ...and the defender's next cut within this long is a riposte
});

/** A guard against a blow: { tier: 'perfect' | 'parry' | 'block' | 'none' }. guardedAt: when the guard went up (or null). */
export function judgeDefence({ guarding, guardedAt, contactAt }, defence = DEFENCE) {
  if (!guarding || !Number.isFinite(guardedAt)) return { tier: 'none' };
  const lead = contactAt - guardedAt;
  if (lead < -1e-9) return { tier: 'none', lead };
  if (lead <= defence.perfect + 1e-9) return { tier: 'perfect', lead };
  if (lead <= defence.parry + 1e-9) return { tier: 'parry', lead };
  return { tier: 'block', lead };
}

// Hit-stop: both fighters held for a moment as the blow lands, longer the better it was (seconds). The single
// cheapest thing that makes a blow felt. Presentation only: the simulation's clock never stops.
export const HIT_STOP = Object.freeze({ hit: 0.055, clean: 0.075, perfect: 0.09, riposte: 0.11, block: 0.05, parry: 0.08, perfectParry: 0.12 });

/** The hit-stop for a blow's outcome. quality: its aim quality (0..1); grade: its cadence grade. */
export function hitStopFor({ outcome, quality = 1, grade = 'held', riposte = false }) {
  if (outcome === 'perfect') return HIT_STOP.perfectParry;
  if (outcome === 'parry') return HIT_STOP.parry;
  if (outcome === 'block') return HIT_STOP.block;
  if (riposte) return HIT_STOP.riposte;
  if (grade === 'perfect') return HIT_STOP.perfect;
  return quality >= 0.8 ? HIT_STOP.clean : HIT_STOP.hit;
}

/** A cut's markers, seconds from its start: what the clip, the server and a bot all key on. */
export function cutMarkers(name, { linked = false } = {}) {
  const cut = CUTS[name];
  const contact = linked ? cut.startup.linked : cut.startup.fresh;
  return Object.freeze({
    tell: Math.max(0, contact - cut.tellLead),
    activeFrom: contact - ACTIVE.before,
    contact,
    activeTo: contact + ACTIVE.after,
    beat: contact + CADENCE.beat,
    windowOpen: contact + CADENCE.open,
    windowClose: contact + CADENCE.close,
    stepFrom: cut.step.from * (contact / cut.startup.fresh),
    stepTo: cut.step.to * (contact / cut.startup.fresh),
  });
}

/**
 * Where in its clip a cut is, `t` seconds after it began: fitted so the clip's contact frame lands on the cut's
 * contact, played at its own pace after it. clip: { clipContact, linkEntry, clipEnd } (a cut, or a clip's own markers).
 */
export function cutClipTime(clip, t, { linked = false, startup }) {
  const entry = linked ? clip.linkEntry : 0;
  if (t <= startup) return entry + (clip.clipContact - entry) * Math.max(0, t) / startup;
  return Math.min(clip.clipEnd, clip.clipContact + (t - startup));
}

// Skill, measured: what a player can watch get better.
export function emptyStats() {
  return { presses: 0, onBeat: 0, cadenceAbsMs: 0, hits: 0, cleanHits: 0, blows: 0, parries: 0, perfectParries: 0, blocks: 0, taken: 0, whiffs: 0, longestChain: 0 };
}
export function summarizeStats(s) {
  const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);
  return {
    onBeatPct: pct(s.onBeat, s.presses),
    cadenceMs: s.presses ? Math.round(s.cadenceAbsMs / s.presses) : null,
    cleanPct: pct(s.cleanHits, s.hits),
    parryPct: pct(s.parries + s.perfectParries, s.blows),
    perfectParryPct: pct(s.perfectParries, s.blows),
    longestChain: s.longestChain,
  };
}
