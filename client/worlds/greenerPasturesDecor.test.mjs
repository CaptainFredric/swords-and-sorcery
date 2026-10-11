import test from 'node:test';
import assert from 'node:assert/strict';
import { GREENER_PASTURES, GREENER_ROUTE, GREENER_TREES } from '../../shared/worlds/greenerPastures.mjs';
import { buildGreenerPasturesDecor, greenerBackdropHeight, GREENER_PRESENTATION } from './greenerPasturesDecor.mjs';

test('pastoral scenery is deterministic and bounded for phones', () => {
  const decor = buildGreenerPasturesDecor();
  assert.deepEqual(decor, buildGreenerPasturesDecor());
  assert.equal(decor.trees.length, GREENER_TREES.length);
  assert.ok(decor.forest.length <= 130);
  assert.ok(decor.houses.length <= 8);
  assert.ok(decor.clouds.length <= 16);
  assert.equal(decor.pointLights, 0);
  for (const spec of decor.forest) {
    const { minX, maxX, minZ, maxZ } = GREENER_ROUTE.bounds;
    assert.ok(spec.x < minX - 5 || spec.x > maxX + 5 || spec.z < minZ - 5 || spec.z > maxZ + 5);
  }
});

test('all trees inside the playable meadow have ordinary solid trunks', () => {
  for (const tree of buildGreenerPasturesDecor().trees) {
    assert.ok(GREENER_PASTURES.solids.some((solid) => solid.id === tree.id && solid.kind === 'tree'));
  }
});

test('the long sightline presentation retains Rival contrast and a wide useful camera range', () => {
  assert.ok(GREENER_PRESENTATION.cameraFar >= 650);
  const visibility = Math.exp(-((GREENER_PRESENTATION.fog.density * GREENER_ROUTE.initialDistance) ** 2));
  assert.ok(visibility > 0.9, `Rival retains ${visibility} of its unfogged contrast`);
  assert.ok(GREENER_PRESENTATION.groundCell >= 2.5, 'large fields use coarse faceted mesh');
});

test('the enlarged real meadows retain a bounded ground mesh and world draw budget', () => {
  const groundTriangles = GREENER_PASTURES.floors
    .filter(floor => floor.material === 'grass')
    .reduce((total, floor) => total + 2 * Math.ceil(floor.size[0] / GREENER_PRESENTATION.groundCell)
      * Math.ceil(floor.size[2] / GREENER_PRESENTATION.groundCell), 0);
  assert.ok(groundTriangles <= 18000, 'the larger chase fields avoid a dense ground grid');
  assert.ok(GREENER_PRESENTATION.geometryBudget <= 155000);
  assert.ok(GREENER_PRESENTATION.drawCallBudget <= 9);
});

test('backdrop hills sit outside the real playable surface and the ravine is visibly deep', () => {
  assert.ok(greenerBackdropHeight(-220, 60) > 15);
  assert.ok(greenerBackdropHeight(240, -190) > 15);
  const { minZ, maxZ } = GREENER_ROUTE.bridge.ravineBounds;
  assert.ok(greenerBackdropHeight(-100, (minZ + maxZ) / 2) < GREENER_PASTURES.abyssY);
  assert.ok(Math.abs(greenerBackdropHeight(-85, 50)) < 0.2);
});

test('the extended landscape and destination follow the shared route contract', () => {
  const decor = buildGreenerPasturesDecor();
  assert.equal(decor.destination.label, 'TATTLE ON YOU');
  assert.deepEqual(decor.destination.entrance, GREENER_ROUTE.entrance);
  assert.equal(decor.destination.sign.text, 'TATTLE ON YOU');
  assert.ok(decor.destination.sign.width >= 12);
  const toPathPoint = ({ x, z }) => [x, z];
  assert.deepEqual(decor.paths[0].at(-1), toPathPoint(GREENER_ROUTE.bridge.dashStart));
  assert.deepEqual(decor.paths[1][0], toPathPoint(GREENER_ROUTE.bridge.dashLanding));
  assert.deepEqual(decor.paths[1].at(-2), toPathPoint(GREENER_ROUTE.finalStand));
  assert.deepEqual(decor.paths[1].at(-1), toPathPoint(GREENER_ROUTE.entrance));
  assert.ok(decor.forest.some(tree => tree.z < GREENER_ROUTE.finalStand.z));
  assert.ok(decor.clouds.some(cloud => cloud.z < GREENER_ROUTE.landmarks.complaintApproach.z));
});

test('the roof reads at the distant vista while the naturally smaller sign becomes readable on the approach', () => {
  const destination = GREENER_ROUTE.landmarks.destination;
  const reveal = GREENER_ROUTE.waypointById['tattle-reveal'];
  const approach = GREENER_ROUTE.landmarks.complaintApproach;
  const revealDistance = Math.hypot(destination.sign.center[0] - reveal.x, destination.sign.center[2] - reveal.z);
  const approachDistance = Math.hypot(destination.sign.center[0] - approach.x, destination.sign.center[2] - approach.z);
  const signAngularHeight = distance => 2 * Math.atan(destination.sign.height / (2 * distance));
  assert.ok(revealDistance < GREENER_PRESENTATION.cameraFar);
  assert.ok(Math.exp(-((GREENER_PRESENTATION.fog.density * revealDistance) ** 2)) > 0.3);
  assert.ok(signAngularHeight(revealDistance) < 0.004);
  assert.ok(signAngularHeight(approachDistance) > 0.02);
  assert.ok(signAngularHeight(approachDistance) > signAngularHeight(revealDistance) * 7);
  assert.ok(GREENER_PASTURES.zones.some(zone => zone.id === 'western-orchard'));
  assert.ok(GREENER_PASTURES.zones.some(zone => zone.id === 'granary-remnants'));
  assert.ok(buildGreenerPasturesDecor().paths.some(path => path.some(([x, z]) => x === 68 && z === -318)));
});
