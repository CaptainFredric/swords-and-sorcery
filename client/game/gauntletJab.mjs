// The gauntlet strike as the arms play it (the rule is shared/src/gauntlet.mjs). The magic hand is an open gauntlet, so
// the blow is a short heel-of-the-palm shove: drawn in a touch, driven straight out with the shoulder behind it, a beat
// at full reach, then back. Compact: no wind-up to speak of, never a haymaker. Pure: the time since the press in.
//
// First person: the magic hand's target in view space (+x right, +y up, -z ahead) for swordArmIK's solveArm with
// FIRST_PERSON_OFF_ARM (aim: the fingers, roll: the palm). Third person: turns for the remote knight's left arm.

import { GAUNTLET } from '../../shared/src/gauntlet.mjs';
import { normalize } from './swordArmIK.mjs';

// the blow's own beats (seconds from the press): drawn in, landed (the server's startup), held, home
export const JAB = Object.freeze({
  draw: 0.05,
  land: GAUNTLET.startup,
  hold: GAUNTLET.startup + 0.05,
  home: GAUNTLET.startup + 0.34,
});

const smooth = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// where the magic hand goes: drawn in a little, then out to arm's length a hand's breadth left of the middle
const DRAWN = Object.freeze({ wrist: [-0.3, -0.37, -0.57], fingers: [0.05, 0.95, 0.3], palm: [0.25, 0.3, -0.92] });
const OUT = Object.freeze({ wrist: [-0.12, -0.25, -0.78], fingers: [0.1, 0.98, 0.15], palm: [0.15, 0.15, -0.98] });
// the magic arm's shoulder comes forward and in behind the blow (the body turning into it)
const SHOULDER = Object.freeze([0.18, 0.04, -0.17]);

/**
 * The magic hand's target `elapsed` seconds after the press: { wrist, aim, roll, shoulder, weight }, or null once it
 * is home. weight: how firmly the arm follows it (it takes the arm at once, and gives it back as it comes home).
 */
export function jabTarget(elapsed) {
  if (!(elapsed >= 0) || elapsed >= JAB.home) return null;
  let pose;
  let weight;
  if (elapsed < JAB.draw) {
    const t = smooth(elapsed / JAB.draw);
    pose = { wrist: DRAWN.wrist, fingers: DRAWN.fingers, palm: DRAWN.palm, reach: 0 };
    weight = t;
  } else if (elapsed < JAB.land) {
    // driven out
    const out = smooth((elapsed - JAB.draw) / (JAB.land - JAB.draw));
    pose = { wrist: mix(DRAWN.wrist, OUT.wrist, out), fingers: mix(DRAWN.fingers, OUT.fingers, out), palm: mix(DRAWN.palm, OUT.palm, out), reach: out };
    weight = 1;
  } else if (elapsed < JAB.hold) {
    pose = { wrist: OUT.wrist, fingers: OUT.fingers, palm: OUT.palm, reach: 1 };
    weight = 1;
  } else {
    // home: it lets the arm go back to the clip's own hand as it comes in
    const t = smooth((elapsed - JAB.hold) / (JAB.home - JAB.hold));
    pose = { wrist: mix(OUT.wrist, DRAWN.wrist, t * 0.6), fingers: OUT.fingers, palm: OUT.palm, reach: 1 - t };
    weight = 1 - t;
  }
  return {
    wrist: pose.wrist,
    aim: normalize(pose.fingers),
    roll: normalize(pose.palm),
    shoulder: SHOULDER.map((v) => v * pose.reach),
    weight,
  };
}

/** How much the view is nudged as the blow lands (0..1), for a small kick of the camera. */
export function jabKick(elapsed) {
  if (!(elapsed >= JAB.land - 0.02) || elapsed > JAB.hold + 0.1) return 0;
  return Math.max(0, 1 - Math.abs(elapsed - JAB.land) / 0.08);
}

/**
 * The remote knight's left arm through the blow (third person): turns about the knight's own axes, added to the
 * clip's pose. The arm comes up and forward, the forearm straightening into it, the chest turning in behind it.
 */
export function jabTurns(elapsed) {
  if (!(elapsed >= 0) || elapsed >= JAB.home) return [];
  const out = elapsed < JAB.draw ? -0.25 * smooth(elapsed / JAB.draw)
    : elapsed < JAB.land ? -0.25 + 1.25 * smooth((elapsed - JAB.draw) / (JAB.land - JAB.draw))
      : elapsed < JAB.hold ? 1
        : 1 - smooth((elapsed - JAB.hold) / (JAB.home - JAB.hold));
  // (about the knight's own axes: +x is its right, and it faces -z)
  return [
    { bone: 'chest', axis: [0, 1, 0], angle: -0.2 * out },
    { bone: 'upper_arm.L', axis: [1, 0, 0], angle: 1.3 * out },
    // (the elbow straightens as the arm comes up, so the hand drives out at chest height, not up past the helm)
    { bone: 'forearm.L', axis: [1, 0, 0], angle: -1.15 * out },
  ];
}
