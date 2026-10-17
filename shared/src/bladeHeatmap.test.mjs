import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRIKE_HEATMAPS,
  evaluateBladeHeatmap,
  qualityColor,
  sampleStrikeHeatmap,
} from './bladeHeatmap.mjs';
import { BLADE, aimFrame, bladeDirection } from './blade.mjs';
import { GAME, swordDamageFor } from './combat.mjs';

test('blade heatmap: mathematical bounds, continuity, and deterministic evaluation', () => {
  // 1. Extreme and malformed inputs never produce NaN, Infinity, or out-of-bounds quality
  for (const strike of [0, 1, 2, 99]) {
    for (const dt of [-10, -0.05, 0, 0.05, 10, NaN, Infinity, -Infinity]) {
      for (const along of [-5, 0, 0.4, 1.2, 1.8, 2.35, 5.0, NaN]) {
        const res = evaluateBladeHeatmap(strike, { dt, along });
        assert.ok(Number.isFinite(res.quality), `quality finite for strike=${strike}, dt=${dt}, along=${along}`);
        assert.ok(res.quality >= 0 && res.quality <= 1, `quality in [0, 1]: ${res.quality}`);
        assert.ok(Number.isInteger(res.damage), `damage is integer: ${res.damage}`);
        assert.ok(res.damage >= GAME.swordGlance && res.damage <= GAME.swordDamage, `damage in [19, 30]: ${res.damage}`);
      }
    }
  }

  // 2. Strict continuity: fine increments along reach produce continuous quality curves
  const frame = aimFrame(0, 0);
  let prevQuality = evaluateBladeHeatmap(0, { dt: 0, along: 0.4, frame }).quality;
  for (let along = 0.41; along <= 2.35; along += 0.01) {
    const q = evaluateBladeHeatmap(0, { dt: 0, along, frame }).quality;
    const diff = Math.abs(q - prevQuality);
    assert.ok(diff < 0.15, `continuous reach curve at along=${along}: jump=${diff}`);
    prevQuality = q;
  }

  // 3. Strict continuity: fine increments in dt produce continuous quality curves
  prevQuality = evaluateBladeHeatmap(0, { dt: -0.09, along: 1.84, frame }).quality;
  for (let dt = -0.089; dt <= 0.09; dt += 0.002) {
    const q = evaluateBladeHeatmap(0, { dt, along: 1.84, frame }).quality;
    const diff = Math.abs(q - prevQuality);
    assert.ok(diff < 0.15, `continuous phase curve at dt=${dt}: jump=${diff}`);
    prevQuality = q;
  }
});

test('blade heatmap: resolution and FOV invariance (pure 3D mathematical field)', () => {
  // Evaluation depends purely on 3D spatial geometry (view frame and blade arc vectors)
  // Viewport resolution, pixel buffer dimensions, and display FOV have zero presence.
  const frameA = aimFrame(Math.PI / 4, -0.2);
  const frameB = aimFrame(Math.PI / 4, -0.2);
  const dir = bladeDirection(0, -0.005, frameA);

  const evalA = evaluateBladeHeatmap(0, { dt: -0.005, along: 1.84, direction: dir, frame: frameA });
  const evalB = evaluateBladeHeatmap(0, { dt: -0.005, along: 1.84, direction: dir, frame: frameB });

  assert.equal(evalA.quality, evalB.quality);
  assert.equal(evalA.damage, evalB.damage);
  assert.equal(evalA.category, evalB.category);
});

test('blade heatmap: Strike 0 (Forehand) asymmetric cutting geometry', () => {
  const frame = aimFrame(0, 0);
  // Strike 0 sweeps right to left (+yaw is to attacker left, the cutting follow-through).
  // Optimal cutting development occurs through the front-left quadrant.
  const sweetDir = bladeDirection(0, -0.005, frame);
  const sweet = evaluateBladeHeatmap(0, { dt: -0.005, along: 1.84, direction: sweetDir, frame });
  assert.ok(sweet.quality >= 0.85, `sweet spot quality: ${sweet.quality}`);
  assert.ok(sweet.damage >= 29, `sweet spot damage: ${sweet.damage}`);

  // Early peripheral contact on the right (before cutting acceleration)
  const earlyDir = bladeDirection(0, -0.07, frame);
  const early = evaluateBladeHeatmap(0, { dt: -0.07, along: 1.84, direction: earlyDir, frame });
  assert.ok(early.quality <= 0.20, `early quality: ${early.quality}`);
  assert.ok(early.damage <= 21, `early damage: ${early.damage}`);
});

test('blade heatmap: Strike 1 (Backhand) asymmetric rising cut geometry', () => {
  const frame = aimFrame(0, 0);
  // Strike 1 sweeps left to right rising (-yaw is to attacker right, +pitch is rising).
  const sweetDir = bladeDirection(1, -0.005, frame);
  const sweet = evaluateBladeHeatmap(1, { dt: -0.005, along: 1.80, direction: sweetDir, frame });
  assert.ok(sweet.quality >= 0.85, `sweet spot quality: ${sweet.quality}`);
  assert.ok(sweet.damage >= 29, `sweet spot damage: ${sweet.damage}`);

  // Early peripheral contact on the left
  const earlyDir = bladeDirection(1, -0.07, frame);
  const early = evaluateBladeHeatmap(1, { dt: -0.07, along: 1.80, direction: earlyDir, frame });
  assert.ok(early.quality <= 0.20, `early quality: ${early.quality}`);
  assert.ok(early.damage <= 21, `early damage: ${early.damage}`);
});

test('blade heatmap: Strike 2 (Heavy Chop / Slam) vertical descending geometry', () => {
  const frame = aimFrame(0, 0);
  // Strike 2 descends vertically through center chest.
  // Sweet spot driving through target
  const sweetDir = bladeDirection(2, -0.025, frame);
  const sweet = evaluateBladeHeatmap(2, { dt: -0.025, along: 1.84, direction: sweetDir, frame });
  assert.ok(sweet.damage >= 28, `sweet spot damage: ${sweet.damage}`);

  // Late over-follow-through near the floor
  const lateDir = bladeDirection(2, 0.05, frame);
  const late = evaluateBladeHeatmap(2, { dt: 0.05, along: 1.84, direction: lateDir, frame });
  assert.ok(late.damage <= 22, `late damage: ${late.damage}`);
});

test('blade heatmap: Scenarios A-D (Melee distance, sweet spot, cramped, and tip graze)', () => {
  const frame = aimFrame(0, 0);

  // Scenario A: Centered contact at ordinary melee distance (~1.8m)
  // Must NOT produce 28-30 damage; must produce ordinary 22-24 damage (5-hit defeat).
  const dir0 = bladeDirection(0, -0.02, frame);
  const scenarioA = evaluateBladeHeatmap(0, { dt: -0.02, along: 1.73, direction: dir0, frame });
  assert.ok(scenarioA.damage >= 22 && scenarioA.damage <= 24, `Scenario A damage: ${scenarioA.damage}`);

  // Scenario B: Deliberate sweet-spot contact (spacing ~1.84m, developed cut angle)
  const sweetDir0 = bladeDirection(0, -0.004, frame);
  const scenarioB = evaluateBladeHeatmap(0, { dt: -0.004, along: 1.84, direction: sweetDir0, frame });
  assert.ok(scenarioB.damage >= 29, `Scenario B damage: ${scenarioB.damage}`);

  // Scenario C: Cramped combat (< 1.0m, near hilt)
  const scenarioC = evaluateBladeHeatmap(0, { dt: -0.02, along: 0.75, direction: dir0, frame });
  assert.ok(scenarioC.damage >= 19 && scenarioC.damage <= 20, `Scenario C damage: ${scenarioC.damage}`);

  // Scenario D: Tip graze (> 2.3m, outer blade margin)
  const scenarioD = evaluateBladeHeatmap(0, { dt: -0.02, along: 2.32, direction: dir0, frame });
  assert.ok(scenarioD.damage >= 19 && scenarioD.damage <= 21, `Scenario D damage: ${scenarioD.damage}`);
});

test('blade heatmap: physical reach distance is strictly met.along and not promoted by horizontal distance', () => {
  const frame = aimFrame(0, 0);
  const dir0 = bladeDirection(0, -0.004, frame);
  // Hilt contact (along = 0.55m):
  // Even with optimal timing (dt = -0.004) and perfect direction, hilt contact cannot be promoted
  // by any external distance proxy to sweet-spot reach and remains strictly marginal (<= 20 damage).
  const hiltContact = evaluateBladeHeatmap(0, { dt: -0.004, along: 0.55, direction: dir0, frame });
  assert.ok(hiltContact.damage <= 20, `hilt damage: ${hiltContact.damage}`);
  assert.ok(hiltContact.quality <= 0.10, `hilt quality: ${hiltContact.quality}`);
  assert.equal(hiltContact.category, 'marginal');
});

test('blade heatmap: visual color mapping gradient and debug sample ribbon generator', () => {
  // Quality color mapping: Blue (weak) -> Green (ordinary) -> Yellow (solid) -> Orange (strong) -> Red (peak)
  const weakColor = qualityColor(0.05);
  assert.ok(weakColor.b > weakColor.r, 'weak contact is predominantly blue');

  const ordinaryColor = qualityColor(0.40);
  assert.ok(ordinaryColor.g > ordinaryColor.r && ordinaryColor.g > ordinaryColor.b, 'ordinary contact is green');

  const peakColor = qualityColor(0.95);
  assert.ok(peakColor.r > peakColor.b, 'peak contact is warm red/orange');

  // sampleStrikeHeatmap produces structured visual grid geometry for dev visualization
  for (let strike = 0; strike < 3; strike += 1) {
    const grid = sampleStrikeHeatmap(strike, { stepsDt: 10, stepsReach: 5 });
    assert.ok(Array.isArray(grid), 'grid is array');
    assert.ok(grid.length > 0, 'grid has rows');
    assert.ok(grid[0].length > 0, 'row has columns');
    const firstCell = grid[0][0];
    assert.ok(firstCell.point && typeof firstCell.point.x === 'number', 'cell has 3D point');
    assert.ok(firstCell.color && typeof firstCell.color.r === 'number', 'cell has color');
    assert.ok(Number.isFinite(firstCell.quality), 'cell has quality');
  }
});
