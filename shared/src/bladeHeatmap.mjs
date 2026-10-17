// A continuous, curved damage-quality heatmap for Castleward sword strikes.
//
// Each ordinary strike (Forehand, Backhand, Heavy Chop) possesses an invisible 3D cutting field that follows the
// attacker's changing camera/aim frame. As the blade sweeps through space, contact with an opponent is judged by:
//   1. Effective blade reach along the cutting segment (outer third sweet spot vs cramped hilt or tip graze).
//   2. Temporal swing phase relative to the cutting stroke's acceleration and commitment.
//   3. Angular cut trajectory relative to the strike's authored cutting plane.
//
// Tuning targets:
//   - Marginal valid contact (cramped <1.0m or extreme tip graze >2.3m): 19-21 damage (quality < 0.25).
//   - Ordinary centered contact on stationary torso at ~1.8m: 22-24 damage (quality ~0.35-0.45, 5 hits to defeat 100 HP).
//   - Good deliberately placed contact: 25-27 damage (the 4-hit threshold is 25+).
//   - Strong contact near optimal region: 28-29 damage.
//   - Exceptional sweet-spot contact: 30 damage (peak epicenter).
//
// Shared, deterministic, and resolution/FOV invariant.

import { BLADE, aimFrame, bladeDirection } from './blade.mjs';
import { MELEE_CONTACT, swordDamageFor } from './combat.mjs';

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export const STRIKE_HEATMAPS = Object.freeze([
  // Strike 0: Forehand slash (right to left, leaning down to the left)
  // Reaches peak cutting drive through the front-left quadrant
  Object.freeze({
    id: 'forehand',
    optimalDt: -0.004,
    dtSigma: 0.028,
    optimalReach: 0.74,          // along ~1.84m (sweet spot on outer third)
    reachSigmaIn: 0.22,
    reachSigmaOut: 0.12,
    epicenterYawDeg: 2.0,        // peak cutting sector centers around +2 deg
    epicenterPitchDeg: -3.0,     // slightly downward along the cutting plane
    yawSigmaDeg: 11.0,
    pitchSigmaDeg: 14.0,
  }),
  // Strike 1: Rising backhand (left to right, rising cut)
  // Reaches peak cutting drive through the front-right rising quadrant
  Object.freeze({
    id: 'backhand',
    optimalDt: -0.004,
    dtSigma: 0.028,
    optimalReach: 0.72,          // along ~1.80m
    reachSigmaIn: 0.22,
    reachSigmaOut: 0.12,
    epicenterYawDeg: -2.0,       // peak cutting sector centers around -2 deg
    epicenterPitchDeg: 4.0,      // rising cut
    yawSigmaDeg: 11.0,
    pitchSigmaDeg: 14.0,
  }),
  // Strike 2: Heavy descending strike (downward chop / slam)
  // Reaches peak cutting drive downward through center chest
  Object.freeze({
    id: 'chop',
    optimalDt: -0.025,
    dtSigma: 0.042,
    optimalReach: 0.74,          // along ~1.84m
    reachSigmaIn: 0.24,
    reachSigmaOut: 0.12,
    epicenterYawDeg: 0.0,        // centered horizontally
    epicenterPitchDeg: 4.0,      // descending cut driving through high-chest to mid-torso
    yawSigmaDeg: 11.0,
    pitchSigmaDeg: 16.0,
  }),
]);

/**
 * Evaluate the continuous sword heatmap at the moment of blade contact.
 *
 * @param {number} strikeIndex 0 (forehand), 1 (backhand), or 2 (chop)
 * @param {object} contact Contact parameters
 * @param {number} [contact.dt] Seconds relative to contact moment (atSec - window.contact)
 * @param {number} [contact.along] Distance along blade from attacker eyes in meters
 * @param {object} [contact.direction] Blade unit direction at contact
 * @param {object} [contact.frame] Attacker aimFrame ({ forward, right, up })
 * @param {object} [contact.blade] Blade physical configuration
 * @returns {object} Detailed quality breakdown and evaluated damage
 */
export function evaluateBladeHeatmap(strikeIndex, {
  dt = 0,
  along = 1.8,
  direction = null,
  frame = null,
  blade = BLADE,
} = {}) {
  const map = STRIKE_HEATMAPS[strikeIndex] ?? STRIKE_HEATMAPS[0];

  // 1. Physical reach along cutting segment (0..1)
  const length = Math.max(1e-4, blade.to - blade.from);
  const reach = clamp01((along - blade.from) / length);
  const sigmaReach = reach <= map.optimalReach ? map.reachSigmaIn : map.reachSigmaOut;
  const qReach = Math.exp(-Math.pow(reach - map.optimalReach, 2) / (2 * sigmaReach * sigmaReach));

  // 2. Temporal swing phase
  const safeDt = Number.isFinite(dt) ? dt : 0;
  const qPhase = Math.exp(-Math.pow(safeDt - map.optimalDt, 2) / (2 * map.dtSigma * map.dtSigma));

  // 3. Angular direction in attacker view frame
  const safeFrame = frame ?? aimFrame(0, 0);
  const safeDir = direction ?? bladeDirection(strikeIndex, safeDt, safeFrame);
  const fwd = dot(safeDir, safeFrame.forward);
  const right = dot(safeDir, safeFrame.right);
  const up = dot(safeDir, safeFrame.up);
  const yawDeg = Math.atan2(right, fwd) * 180 / Math.PI;
  const pitchDeg = Math.asin(Math.max(-1, Math.min(1, up))) * 180 / Math.PI;

  const dyaw = yawDeg - map.epicenterYawDeg;
  const dpitch = pitchDeg - map.epicenterPitchDeg;
  const qAngle = Math.exp(-(dyaw * dyaw) / (2 * map.yawSigmaDeg * map.yawSigmaDeg)
                         -(dpitch * dpitch) / (2 * map.pitchSigmaDeg * map.pitchSigmaDeg));

  // Multiplicative combination: physical reach bounds cutting effectiveness;
  // phase and cut angle define the curved epicenter.
  const qRaw = qReach * Math.pow(qPhase, 0.6) * Math.pow(qAngle, 0.7);
  const quality = clamp01(qRaw);
  const damage = swordDamageFor(quality);

  let category = 'ordinary';
  if (damage <= 21) category = 'marginal';
  else if (damage <= 24) category = 'ordinary';
  else if (damage <= 27) category = 'solid';
  else if (damage <= 29) category = 'strong';
  else category = 'peak';

  return {
    quality,
    damage,
    category,
    reach: +reach.toFixed(3),
    qReach: +qReach.toFixed(3),
    dt: +safeDt.toFixed(3),
    qPhase: +qPhase.toFixed(3),
    yawDeg: +yawDeg.toFixed(1),
    pitchDeg: +pitchDeg.toFixed(1),
    qAngle: +qAngle.toFixed(3),
  };
}

/**
 * Conceptual RGB color mapping for visual inspection of the heatmap.
 * Cool blue (weak) -> Green (ordinary) -> Yellow (solid) -> Orange (strong) -> Red (peak).
 */
export function qualityColor(quality) {
  const q = clamp01(quality);
  if (q < 0.25) {
    // Blue to Teal
    const t = q / 0.25;
    return { r: 0.16 * (1 - t) + 0.18 * t, g: 0.43 * (1 - t) + 0.76 * t, b: 0.86 * (1 - t) + 0.49 * t };
  }
  if (q < 0.50) {
    // Green to Yellow-Green
    const t = (q - 0.25) / 0.25;
    return { r: 0.18 * (1 - t) + 0.80 * t, g: 0.76 * (1 - t) + 0.82 * t, b: 0.49 * (1 - t) + 0.30 * t };
  }
  if (q < 0.75) {
    // Yellow to Orange
    const t = (q - 0.50) / 0.25;
    return { r: 0.80 * (1 - t) + 0.92 * t, g: 0.82 * (1 - t) + 0.55 * t, b: 0.30 * (1 - t) + 0.18 * t };
  }
  // Orange to Peak Red
  const t = (q - 0.75) / 0.25;
  return { r: 0.92 * (1 - t) + 0.95 * t, g: 0.55 * (1 - t) + 0.20 * t, b: 0.18 * (1 - t) + 0.20 * t };
}

/**
 * Pre-sample the 3D ribbon vertices and qualities for a strike trajectory in the attacker's aim frame.
 * Used for development debug inspection and geometric verification.
 */
export function sampleStrikeHeatmap(strikeIndex, {
  stepsDt = 24,
  stepsReach = 8,
  eye = { x: 0, y: 1.58, z: 0 },
  frame = aimFrame(0, 0),
  blade = BLADE,
  contact = MELEE_CONTACT,
} = {}) {
  const dtMin = -contact.window.early;
  const dtMax = contact.follow;
  const grid = [];

  for (let i = 0; i <= stepsDt; i += 1) {
    const dt = dtMin + (dtMax - dtMin) * (i / stepsDt);
    const dir = bladeDirection(strikeIndex, dt, frame, contact, blade);
    const row = [];
    for (let j = 0; j <= stepsReach; j += 1) {
      const reachNorm = j / stepsReach;
      const along = blade.from + reachNorm * (blade.to - blade.from);
      const point = {
        x: eye.x + dir.x * along,
        y: eye.y + dir.y * along,
        z: eye.z + dir.z * along,
      };
      const evaluation = evaluateBladeHeatmap(strikeIndex, {
        dt,
        along,
        direction: dir,
        frame,
        blade,
      });
      row.push({
        dt,
        along,
        reachNorm,
        point,
        dir,
        ...evaluation,
        color: qualityColor(evaluation.quality),
      });
    }
    grid.push(row);
  }

  return grid;
}
