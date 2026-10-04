// Authored first person Chivalry cuts in view space. They are the ordinary chain's three cuts (fpSlash.mjs COMBO):
// the forehand right to left, the backhand left to right, the third down through the middle, each blade on the
// ordinary path through its contact, so it crosses the view where and when the ordinary one does and the player aims
// it the same way. What Guard restrains is the body, not the blade: a shorter cock, the shoulder and the view barely
// opening, no counterbalance from the free gauntlet (it keeps its Guard, or its spell), the third strike in one hand,
// each finish stopped higher and sooner, and the way home to the angled hold short.
// The existing solver keeps the physical grip. Only presentation changes; contact clocks belong to combat.
import { COMBO, COMBO_CONTACTS, COMBO_CYCLE, createSwordPath } from './fpSlash.mjs';
import { MELEE_CONTACT } from '../../shared/src/combat.mjs';

const DEG = Math.PI / 180;
// a direction by its turn to the left of straight ahead and its rise, in degrees (as fpSlash's keys are written)
const dir = (yaw, pitch) => [-Math.sin(yaw * DEG) * Math.cos(pitch * DEG), Math.sin(pitch * DEG), -Math.cos(yaw * DEG) * Math.cos(pitch * DEG)];
const [C1, C2, C3] = COMBO_CONTACTS;
const { early: EARLY, late: LATE } = MELEE_CONTACT.window;

// how much of the ordinary cut's carried body and view lean is kept, and of its shoulder (the sword arm's root: it
// still has to bring the hand where the cut needs it)
const RESTRAINT = 0.4;
const SHOULDER = 0.65;
// the free gauntlet takes no part in the cut: no counterbalance, no second hand on the grip
const FREE = Object.freeze({ counter: [0, 0, 0], grip: 0 });

const BRACE = { wrist: [.27, -.29, -.55], blade: [-.62, .55, -.56], edge: [.78, .57, -.30] };
const brace = t => ({ t, ...BRACE, ease: 0, ...FREE });
const kept = (v) => v.map((x) => x * RESTRAINT);

// the sword arm's root in view space (the rig's upper_arm.R) and how far from it the hand can be put without the
// shoulder coming across (the arm all but straight)
const ROOT = Object.freeze([0.44, -0.49, -0.08]);
const REACH = 0.58;
// where along the blade from the hand the cut is seen (its strong: the grip and 0.42 m on)
const STRONG = 0.5;
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

// Without the shoulder coming across, the hand cannot go as far as the ordinary hand goes: a hand asked for beyond
// reach is brought in, and the blade turned in the hand to pass through the same place (its strong where it was
// asked to be), so the cut is seen and aimed where it was, with less of the arm
function within(hand, blade, shoulder) {
  const strong = hand.map((v, i) => v + norm(blade)[i] * STRONG);
  const root = ROOT.map((v, i) => v + shoulder[i]);
  const out = hand.map((v, i) => v - root[i]);
  const far = Math.hypot(...out);
  if (far <= REACH) return { wrist: hand, blade: norm(blade) };
  const wrist = root.map((v, i) => v + out[i] * REACH / far);
  return { wrist, blade: norm(strong.map((v, i) => v - wrist[i])) };
}

// a key of the ordinary chain, held back: the hand moved by `lift` (up, for a higher line), the shoulder, body and
// view's share of it cut down
function ordinary(t, { lift = [0, 0, 0], blade, ease } = {}) {
  const k = COMBO.find((key) => Math.abs(key.t - t) < 1e-9);
  if (!k) throw new Error(`no ordinary key at ${t}`);
  const shoulder = k.shoulder.map((v) => v * SHOULDER);
  return {
    t, ...within(k.wrist.map((v, i) => v + lift[i]), blade ?? k.blade, shoulder), edge: k.lead,
    shoulder, body: kept(k.body), look: kept(k.look), ...FREE,
    ...((ease ?? k.ease) !== undefined ? { ease: ease ?? k.ease } : {}),
  };
}
// a key of its own (where the guarded cut parts from the ordinary: its shorter windups and higher finishes)
const own = (t, wrist, blade, edge, { shoulder = [0, 0, 0], body = [0, 0, 0], look = [0, 0, 0], ease } = {}) =>
  ({ t, ...within(wrist, blade, shoulder), edge, shoulder, body, look, ...FREE, ...(ease !== undefined ? { ease } : {}) });

const path = createSwordPath([
  brace(0),
  // 1. the forehand: a short cock out to the right, still in front of the hold...
  own(C1 - 0.22, [0.4, -0.23, -0.6], dir(-32, 38), [-0.8, -0.3, -0.5], { shoulder: [0.012, 0.012, 0.012], look: [0.15, 0.35, 0.35] }),
  ordinary(C1 - 0.16, { lift: [-0.05, 0.015, 0], blade: dir(-46, 33) }),
  // ...then down across the front as the ordinary forehand, through the middle at the contact...
  ordinary(C1 - EARLY),
  ordinary(C1),
  // ...and stopped on the left, high, the edge still covering (no carrying on round the low left)
  ordinary(C1 + LATE, { lift: [0.06, 0.04, 0], blade: dir(66, -4) }),
  own(C1 + 0.26, [0.03, -0.2, -0.62], dir(66, 6), [0.75, 0.6, -0.2], { shoulder: [-0.06, 0, -0.04], look: [0, -0.4, -0.5] }),
  // 2. the backhand: from the guarded left a short dip to load (not down to the hip)...
  own(C2 - 0.2, [-0.02, -0.27, -0.61], dir(66, -8), [0.7, 0.65, -0.2], { shoulder: [-0.07, -0.01, -0.035], look: [0.1, -0.4, -0.6] }),
  ordinary(C2 - EARLY, { lift: [0, 0.02, 0] }),
  // ...rising across as the ordinary backhand, through the middle at the contact...
  ordinary(C2),
  // ...and stopped high on the right, out in front
  ordinary(C2 + LATE, { lift: [-0.03, -0.02, 0], blade: dir(-40, 42) }),
  own(C2 + 0.22, [0.28, -0.15, -0.61], dir(-34, 52), [-0.1, 0.4, 0.9], { shoulder: [0.004, 0.028, -0.02], look: [0.15, 0.5, 0.45] }),
  // 3. the descending strike: raised high on the right in the one hand, a short load...
  own(C3 - 0.28, [0.29, -0.14, -0.6], dir(-20, 60), [-0.3, 0.1, -0.95], { shoulder: [0, 0.045, -0.02], look: [0.4, 0.6, 0.45] }),
  ordinary(C3 - 0.14, { ease: 0.25 }),
  // ...then down through the middle as the ordinary third strike...
  ordinary(C3 - 0.07),
  ordinary(C3),
  // ...and stopped at the waist, not driven into the ground, before the short way home to the hold
  own(C3 + 0.09, [0.12, -0.3, -0.68], dir(10, -28), [-0.1, -0.7, 0.7], { shoulder: [-0.07, -0.02, -0.05], look: [-0.7, -0.6, -0.4] }),
  brace(COMBO_CYCLE - 0.04),
  brace(COMBO_CYCLE),
]);

export const guardedBracePose = () => path.sample(0);
export const guardedComboPose = time => path.sample(time);
export const guardedRecoveryPose = (from, elapsed) => path.recover(from, elapsed);
