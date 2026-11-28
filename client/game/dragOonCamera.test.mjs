import test from 'node:test';
import assert from 'node:assert/strict';
import { dragOonCameraTarget } from './dragOonCamera.mjs';
import { segmentAabbHit } from '../../shared/src/collision.mjs';

test('dragOonCameraTarget avoids masonry obstruction with fast inward pull and smooth outward recovery', () => {
  const pillar = { center: [0, 2.5, 4.0], size: [1.5, 6, 1.5] };
  const reachBlocked = (from, to) => segmentAabbHit(from, to, pillar)?.t ?? 1;
  const machine = { x: 0, y: 0, z: 0, grounded: true, velocity: { x: 0, y: 0, z: 0 } };

  // Unobstructed baseline
  const open = dragOonCameraTarget({ reach: () => 1, machine, yaw: 0, pitch: 0, previousDist: null, dt: 1 / 60 });
  assert.ok(open.dist > 7.8 && open.dist < 8.5, `expected normal distance ~8.1, got ${open.dist}`);

  // Pillar between pivot and camera compresses inward
  const blocked = dragOonCameraTarget({ reach: reachBlocked, machine, yaw: 0, pitch: 0, previousDist: open.dist, dt: 0.05 });
  assert.ok(blocked.dist < 6.0, `expected fast inward pull past pillar, got ${blocked.dist}`);

  // Once clear, recovery is gradual rather than an instantaneous snap back to max dist
  const recovered = dragOonCameraTarget({ reach: () => 1, machine, yaw: 0, pitch: 0, previousDist: blocked.dist, dt: 0.05 });
  assert.ok(recovered.dist > blocked.dist && recovered.dist < open.dist - 0.5,
    `expected damped outward recovery (${recovered.dist}), not an instant snap to ${open.dist}`);
});

test('dragOonCameraTarget widens during Flight Like Hell and high-speed Rite of Ascension', () => {
  const grounded = { x: 0, y: 0, z: 0, grounded: true, velocity: { x: 0, y: 0, z: 0 } };
  const flying = { x: 0, y: 6, z: 0, grounded: false, flightLikeHell: { active: true }, velocity: { x: 0, y: 3, z: -4 } };
  const rite = { x: 0, y: 18, z: -12, grounded: false, rite: { active: true }, velocity: { x: 0, y: 14, z: -22 } };

  const gCam = dragOonCameraTarget({ reach: () => 1, machine: grounded, yaw: 0, pitch: 0 });
  const fCam = dragOonCameraTarget({ reach: () => 1, machine: flying, yaw: 0, pitch: 0 });
  const rCam = dragOonCameraTarget({ reach: () => 1, machine: rite, yaw: 0, pitch: 0 });

  assert.ok(fCam.dist > gCam.dist + 0.7, 'airborne camera frames wider to keep landing zone visible');
  assert.ok(rCam.dist > fCam.dist + 1.5, 'fast Rite trajectory widens framing proportionally');
});
