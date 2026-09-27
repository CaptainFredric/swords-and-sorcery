import { CASTLEWARD } from '../../shared/worlds/castleward.mjs';
import { seededRandom } from './kit/kitRandom.mjs';

function jitter(random, amount) {
  return (random() - 0.5) * amount;
}

// The playable footprint: every floor slab, widened by the boundary walls standing on its rim.
export function insideCastlewardFootprint(x, z, margin = 0, { floors = CASTLEWARD.floors, skip = [] } = {}) {
  return floors.some((floor) => {
    if (skip.includes(floor.id)) return false;
    const reach = 0.6 + margin;
    return Math.abs(x - floor.center[0]) < floor.size[0] / 2 + reach && Math.abs(z - floor.center[2]) < floor.size[2] / 2 + reach;
  });
}

/**
 * Deterministic presentation-only decor. Nothing here collides, so everything inside the footprint sits against
 * an authoritative solid or well clear of the lanes; the rest is scenery beyond the walls.
 */
export function buildCastlewardDecorPlan(seed = 1337) {
  const random = seededRandom(seed);

  // worn earth where feet go: green to castle, village, meadow, chapel and down the road
  const paths = [
    [[0, -7], [0, 3], [0, 9], [0, 14]],
    [[-3, 0.5], [-9, 0.8], [-15, 1.2], [-20, 1]],
    [[3, -0.5], [9, 0.2], [16, 1], [21, 1.5]],
    [[16, 1], [17.5, 3.6]],
    [[0, -7], [0, -24]],
    [[-2.8, -1], [-1, -0.2]],
  ];

  // cottages seen over the walls
  const houses = [
    { id: 'west-backdrop-a', x: -27.0, z: 8.5, sx: 5.2, sy: 3.2, sz: 4.8, roof: 'slate', yaw: -0.08 },
    { id: 'west-backdrop-b', x: -27.4, z: -4.5, sx: 4.6, sy: 2.9, sz: 4.3, roof: 'thatch', yaw: 0.07 },
    { id: 'north-backdrop', x: -16.5, z: 14.6, sx: 4.4, sy: 3.0, sz: 4.0, roof: 'thatch', yaw: 0.05 },
    { id: 'south-backdrop-a', x: 10.8, z: -13.4, sx: 4.8, sy: 3.0, sz: 4.2, roof: 'slate', yaw: -0.12 },
    { id: 'south-backdrop-b', x: -12.5, z: -14.0, sx: 5.0, sy: 3.1, sz: 4.4, roof: 'thatch', yaw: 0.1 },
    { id: 'east-backdrop', x: 29.5, z: 4.0, sx: 4.4, sy: 3.0, sz: 5.0, roof: 'slate', yaw: 0.04 },
  ];

  // trees close outside the walls (they read over them)
  const trees = [
    [-21.0, 12.4, 'oak'], [-12.6, 12.8, 'oak'], [-24.6, 3.0, 'pine'], [-24.8, -6.4, 'oak'],
    [11.5, 14.4, 'oak'], [16.0, 13.6, 'pine'], [21.0, 14.0, 'oak'], [26.2, 10.5, 'pine'],
    [26.6, 0.5, 'oak'], [26.4, -6.5, 'pine'], [14.0, -10.2, 'oak'], [20.5, -10.6, 'pine'],
    [-8.5, -10.8, 'oak'], [-17.5, -10.4, 'pine'], [7.8, -11.5, 'pine'], [-11.8, 20.5, 'pine'],
    [12.5, 21.5, 'pine'],
  ].map(([x, z, kind], index) => ({
    id: `tree-${index}`,
    x: x + jitter(random, 0.6),
    z: z + jitter(random, 0.6),
    scale: 0.95 + random() * 0.35,
    kind,
    turn: random() * Math.PI * 2,
  }));

  // the forest belt on the hills around Castleward (clear of the ravine and the keep)
  const forest = [];
  for (let i = 0; forest.length < 90 && i < 600; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 34 + random() * 46;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius + 4;
    if (insideCastlewardFootprint(x, z, 7)) continue;
    if (z < -20 && z > -44) continue;                    // the ravine and its lips
    if (Math.abs(x) < 16 && z > 24 && z < 48) continue;  // the keep
    forest.push({ id: `forest-${forest.length}`, x, z, scale: 1.0 + random() * 0.8, kind: random() < 0.55 ? 'pine' : 'oak' });
  }

  // brass wall sconces; only `light` ones cast real light (kept few for phones, together with the braziers)
  const torches = [
    { x: -4.25, y: 3.2, z: 14.55, facing: Math.PI, light: true },
    { x: 4.25, y: 3.2, z: 14.55, facing: Math.PI, light: true },
    { x: -3.0, y: 4.4, z: 25.95, facing: Math.PI, light: true },
    { x: 3.0, y: 4.4, z: 25.95, facing: Math.PI, light: false },
    { x: -21.9, y: 2.0, z: 4.0, facing: Math.PI / 2, light: false },
    { x: -15.8, y: 2.2, z: 3.95, facing: Math.PI, light: true },
    { x: -2.95, y: 3.0, z: -21.3, facing: 0, light: true },
    { x: 2.95, y: 3.0, z: -21.3, facing: 0, light: false },
    { x: 18.0, y: 2.6, z: 7.7, facing: Math.PI, light: false },
  ].map((torch, index) => ({ id: `torch-${index}`, ...torch }));

  // braziers and rune stones are authoritative solids in the world; this only says which braziers cast light
  // and which way each stone's rune faces
  const braziers = [
    { id: 'forecourt-brazier-west', light: false },
    { id: 'forecourt-brazier-east', light: false },
    { id: 'meadow-brazier', light: true },
  ];

  const banners = [
    { id: 'gate-west', x: -5.8, y: 5.6, z: 14.6, facing: Math.PI, width: 1.2, height: 2.6 },
    { id: 'gate-east', x: 5.8, y: 5.6, z: 14.6, facing: Math.PI, width: 1.2, height: 2.6 },
    { id: 'bailey-west', x: -6.2, y: 5.4, z: 25.97, facing: Math.PI, width: 1.1, height: 2.3 },
    { id: 'bailey-east', x: 6.2, y: 5.4, z: 25.97, facing: Math.PI, width: 1.1, height: 2.3 },
    { id: 'keep-front', x: 0, y: 12.5, z: 27.38, facing: Math.PI, width: 2.2, height: 4.6 },
    { id: 'south-gate-west', x: -4.0, y: 5.3, z: -21.35, facing: 0, width: 1.0, height: 2.2 },
    { id: 'south-gate-east', x: 4.0, y: 5.3, z: -21.35, facing: 0, width: 1.0, height: 2.2 },
    { id: 'chapel', x: 18.0, y: 3.3, z: 7.7, facing: Math.PI, width: 0.9, height: 1.8 },
  ];

  // restrained cyan magic: a few old standing stones by the chapel and one in the village corner
  const runeStones = [
    { id: 'chapel-rune-a', facing: Math.PI },
    { id: 'chapel-rune-b', facing: 0 },
    { id: 'chapel-rune-c', facing: -Math.PI / 2 },
    { id: 'village-rune', facing: 0 },
  ];

  return { paths, houses, trees, forest, torches, braziers, banners, runeStones };
}
