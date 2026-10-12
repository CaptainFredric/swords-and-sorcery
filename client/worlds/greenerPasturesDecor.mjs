import { GREENER_ROUTE, GREENER_TREES } from '../../shared/worlds/greenerPastures.mjs';
import { seededRandom, valueNoise } from './kit/kitRandom.mjs';

export const GREENER_PRESENTATION = Object.freeze({
  background: 0xdce8dc,
  cameraFar: 900,
  fog: Object.freeze({ color: 0xdce8dc, density: 0.0016 }),
  hemisphere: Object.freeze({ skyColor: 0xf0eee0, groundColor: 0x617342, intensity: 1.75 }),
  sun: Object.freeze({ color: 0xffedc5, intensity: 2.7, position: Object.freeze([-28, 34, 18]) }),
  sky: Object.freeze({ zenith: 0x80abc9, horizon: 0xe8eedc, below: 0x91a576 }),
  groundCell: 6,
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

const BACKDROP_CELL = 14;

// Distant props must sit on the triangles players actually see, not the smoother analytic height function.
// outerTerrain splits each cell along a->c; this reproduces that interpolation at an arbitrary x/z.
export function greenerBackdropMeshHeight(x, z) {
  const b = GREENER_ROUTE.bounds;
  const minZ = b.minZ - 220;
  let originX = b.minX;
  let originZ = minZ;
  if (x < b.minX) originX = b.minX - 250;
  else if (x > b.maxX) originX = b.maxX;
  else if (z > b.maxZ) originZ = b.maxZ;

  const x0 = originX + Math.floor((x - originX) / BACKDROP_CELL) * BACKDROP_CELL;
  const z0 = originZ + Math.floor((z - originZ) / BACKDROP_CELL) * BACKDROP_CELL;
  const u = (x - x0) / BACKDROP_CELL;
  const v = (z - z0) / BACKDROP_CELL;
  const a = greenerBackdropHeight(x0, z0);
  const b1 = greenerBackdropHeight(x0, z0 + BACKDROP_CELL);
  const c1 = greenerBackdropHeight(x0 + BACKDROP_CELL, z0 + BACKDROP_CELL);
  const d = greenerBackdropHeight(x0 + BACKDROP_CELL, z0);
  return v >= u
    ? a * (1 - v) + b1 * (v - u) + c1 * u
    : a * (1 - u) + c1 * v + d * (u - v);
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
    { x: -132, z: -260, sx: 6.5, sy: 4.1, sz: 7 },
    { x: -149, z: -276, sx: 5.5, sy: 3.8, sz: 6 },
    { x: 139, z: -392, sx: 7, sy: 4.3, sz: 6.5 },
    { x: 156, z: -407, sx: 5.5, sy: 3.8, sz: 6 },
    { x: -130, z: -630, sx: 6, sy: 4, sz: 7 },
    { x: -145, z: -855, sx: 7, sy: 4.2, sz: 6 },
    { x: 146, z: -935, sx: 6.5, sy: 4.1, sz: 7 },
    { x: 143, z: GREENER_ROUTE.finalStand.z + 25, sx: 7, sy: 4.5, sz: 6 },
  ];
  const fieldPatches = [
    { id: 'east-furrows', x: 70, z: -410, sx: 34, sz: 96, rows: 9, color: 0x7f8b49 },
    { id: 'west-furrows', x: -64, z: -575, sx: 30, sz: 82, rows: 8, color: 0x788449 },
    { id: 'south-furrows', x: 68, z: -880, sx: 36, sz: 92, rows: 9, color: 0x84904d },
  ];
  const clouds = Array.from({ length: 16 }, (_, i) => ({
    x: -240 + random() * 480,
    y: 68 + random() * 38,
    z: b.minZ + 30 + (b.maxZ - b.minZ - 60) * i / 15 + (random() - 0.5) * 35,
    scale: 10 + random() * 10,
    id: `cloud-${i}`,
  }));
  return {
    // Worn cart paths join the farm gates and both real bridge approaches.
    paths: [
      [[0, b.maxZ - 10], [0, 110], [0, 32], ...GREENER_ROUTE.chaseWaypoints
        .slice(0, GREENER_ROUTE.chaseWaypoints.findIndex(point => point.id === 'bridge-takeoff') + 1)
        .map(point => [point.x, point.z])],
      [...GREENER_ROUTE.chaseWaypoints
        .slice(GREENER_ROUTE.chaseWaypoints.findIndex(point => point.id === 'bridge-landing'))
        .map(point => [point.x, point.z]), [GREENER_ROUTE.entrance.x, GREENER_ROUTE.entrance.z]],
      [[32, -637], [-30, -637], [-68, -651], [-68, -670], [-68, -689], [-30, -701], [32, -701]],
      [[-8, -191], [-22, -215], [-22, -281], [0, -290]],
      [[0, -400], [68, -298], [68, -318]],
    ],
    trees: GREENER_TREES,
    forest,
    houses,
    fieldPatches,
    clouds,
    destination: GREENER_ROUTE.landmarks.destination,
    pointLights: 0,
  };
}
