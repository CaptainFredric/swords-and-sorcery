import { GREENER_ROUTE, GREENER_TREES } from '../../shared/worlds/greenerPastures.mjs';
import { seededRandom, valueNoise } from './kit/kitRandom.mjs';

export const GREENER_PRESENTATION = Object.freeze({
  background: 0xdce8dc,
  cameraFar: 700,
  fog: Object.freeze({ color: 0xdce8dc, density: 0.0018 }),
  hemisphere: Object.freeze({ skyColor: 0xf0eee0, groundColor: 0x617342, intensity: 1.75 }),
  sun: Object.freeze({ color: 0xffedc5, intensity: 2.7, position: Object.freeze([-28, 34, 18]) }),
  sky: Object.freeze({ zenith: 0x80abc9, horizon: 0xe8eedc, below: 0x91a576 }),
  groundCell: 5,
  geometryBudget: 155000,
  drawCallBudget: 9,
});

export function greenerBackdropHeight(x, z) {
  const ravine = GREENER_ROUTE.bridge.ravineBounds;
  if (z > ravine.minZ && z < ravine.maxZ) {
    const edge = Math.min(z - ravine.minZ, ravine.maxZ - z);
    return -13 * Math.min(1, edge / 2.2) - 0.12;
  }
  const b = GREENER_ROUTE.bounds;
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  const distance = Math.hypot(dx, dz);
  const rise = Math.min(1, distance / 55);
  const hills = 18 + valueNoise(x * 0.018, z * 0.018, 71) * 35 + valueNoise(x * 0.047, z * 0.047, 8) * 7;
  return -0.12 + hills * rise * rise;
}

export function buildGreenerPasturesDecor(seed = 5713) {
  const random = seededRandom(seed);
  const b = GREENER_ROUTE.bounds;
  const forest = [];
  for (let i = 0; i < 115; i += 1) {
    const x = i % 2 ? b.minX - 18 - random() * 145 : b.maxX + 18 + random() * 145;
    const z = b.minZ - 130 + (b.maxZ - b.minZ + 260) * i / 114 + (random() - 0.5) * 14;
    if (z > GREENER_ROUTE.bridge.ravineBounds.minZ - 12 && z < GREENER_ROUTE.bridge.ravineBounds.maxZ + 12) continue;
    forest.push({ id: `distant-tree-${forest.length}`, x, z, scale: 1.7 + random() * 1.8, kind: random() < 0.15 ? 'pine' : 'oak' });
  }
  const houses = [
    { x: -127, z: -57, sx: 6, sy: 4, sz: 7 },
    { x: -142, z: -69, sx: 7, sy: 4.2, sz: 6 },
    { x: -119, z: -79, sx: 5, sy: 3.7, sz: 6 },
    { x: 144, z: 65, sx: 6, sy: 4.5, sz: 6 },
    { x: 154, z: 78, sx: 7, sy: 4, sz: 6 },
    { x: -130, z: -410, sx: 6, sy: 4, sz: 7 },
    { x: 143, z: GREENER_ROUTE.finalStand.z + 25, sx: 7, sy: 4.5, sz: 6 },
  ];
  const clouds = Array.from({ length: 16 }, (_, i) => ({
    x: -240 + random() * 480,
    y: 68 + random() * 38,
    z: b.minZ + 30 + (b.maxZ - b.minZ - 60) * i / 15 + (random() - 0.5) * 35,
    scale: 10 + random() * 10,
    id: `cloud-${i}`,
  }));
  return {
    // A faint path leads out of the opening meadow; no solid hedges squeeze the player into its line.
    paths: [
      [[0, 145], [0, 90], [0, 32], ...GREENER_ROUTE.chaseWaypoints.slice(0, 5).map(point => [point.x, point.z])],
      [...GREENER_ROUTE.chaseWaypoints.slice(5).map(point => [point.x, point.z]), [GREENER_ROUTE.entrance.x, GREENER_ROUTE.entrance.z]],
      [[-68, GREENER_ROUTE.bridge.ravineBounds.maxZ + 14], [-68, GREENER_ROUTE.bridge.ravineBounds.minZ - 14]],
    ],
    trees: GREENER_TREES,
    forest,
    houses,
    clouds,
    destination: GREENER_ROUTE.landmarks.destination,
    pointLights: 0,
  };
}
