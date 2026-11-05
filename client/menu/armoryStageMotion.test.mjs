import test from 'node:test';
import assert from 'node:assert/strict';
import { armoryRetreatTarget } from './armoryStageMotion.mjs';
import { MENU_SHOTS } from './menuShots.mjs';

const stageYaw = Math.atan2(MENU_SHOTS.main.camera[0] + 1, MENU_SHOTS.main.camera[2] - 5.5);
function cameraProjection(shot, local) {
  const c = Math.cos(stageYaw), s = Math.sin(stageYaw);
  const wx = local.x * c + local.z * s;
  const wz = -local.x * s + local.z * c;
  const fx = shot.target[0] - shot.camera[0];
  const fz = shot.target[2] - shot.camera[2];
  const l = Math.hypot(fx, fz);
  return { screenRight: (wx * -fz + wz * fx) / l, away: (wx * fx + wz * fz) / l };
}
test('Armory steps are rightward on screen even though the stage is rotated', () => {
  const target = armoryRetreatTarget(MENU_SHOTS.armory, stageYaw);
  const p = cameraProjection(MENU_SHOTS.armory, target);
  assert.ok(Math.abs(p.screenRight - 0.9) < 1e-9);
  assert.ok(Math.abs(p.away - 0.35) < 1e-9);
  assert.ok(target.x > 0, 'stage-local +X is screen-right, unlike world X');
  assert.ok(Math.hypot(target.x, target.z) < 1.05, 'two short steps, not a sprint');
});
test('direction follows the actual selected shot rather than fixed world X', () => {
  const targets = [MENU_SHOTS.main, MENU_SHOTS.armory, MENU_SHOTS.how, MENU_SHOTS.private]
    .map(shot => ({ shot, pos: armoryRetreatTarget(shot, stageYaw) }));
  for (const { shot, pos } of targets) {
    assert.ok(cameraProjection(shot, pos).screenRight > 0.89);
  }
});
