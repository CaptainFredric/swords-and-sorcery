// The High Grounds: authoritative, expansive three-level battlefield.
// All geometry is metres, +Y up. No visual-only collision surfaces.
// Azure approaches from -Z; Crimson from +Z. Captures are deliberately
// non-sequential: this map is designed for reciprocal territory control.
import { TEAMS } from '../src/teams.mjs';

const floor = (id, x, z, w, d, y, material = 'timber') => ({
  id, center: [x, y - 0.22, z], size: [w, 0.44, d], y, material,
});
const solid = (id, x, y, z, w, h, d, material = 'timber') => ({
  id, center: [x, y, z], size: [w, h, d], material,
});
const ramp = (id, axis, minX, maxX, minZ, maxZ, startY, endY) => ({
  id, axis, minX, maxX, minZ, maxZ, startY, endY,
});
const spawn = (x, y, z, team, forward = false) => ({
  x, y, z, team, forward, yaw: team === TEAMS.ATTACKERS ? Math.PI : 0,
});
const grounds = [
  floor('azure-camp', 0, -100, 46, 34, 0, 'stone'),
  floor('crimson-camp', 0, 100, 46, 34, 0, 'stone'),
  // The road and centre are reliable support for wheels and deployed ballistae.
  floor('road-azure-rear', 0, -71, 16, 30, 0),
  floor('road-azure-front', 0, -41, 15, 32, 0),
  floor('road-central-south', 0, -17, 13, 20, 0),
  floor('crown-span', 0, 0, 30, 24, 0, 'stone'),
  floor('road-central-north', 0, 17, 13, 20, 0),
  floor('road-crimson-front', 0, 41, 15, 32, 0),
  floor('road-crimson-rear', 0, 71, 16, 30, 0),
  floor('azure-forward-deck', 0, -52, 25, 23, 0, 'stone'),
  floor('crimson-forward-deck', 0, 52, 25, 23, 0, 'stone'),
  // High, exposed canopy traverse is not required to cross on foot.
  floor('west-canopy-south', -38, -47, 12, 56, 12),
  floor('west-canopy-capture', -38, -7, 25, 25, 12, 'stone'),
  floor('west-canopy-north', -38, 35, 12, 62, 12),
  floor('east-canopy-south', 38, -35, 12, 62, 12),
  floor('east-canopy-capture', 38, 7, 25, 25, 12, 'stone'),
  floor('east-canopy-north', 38, 47, 12, 56, 12),
  // Three cross-bridges join the treetop highways.
  floor('high-bridge-south', 0, -57, 78, 8, 12),
  floor('high-bridge-centre', 0, 0, 76, 7, 12),
  floor('high-bridge-north', 0, 57, 78, 8, 12),
  // Lower route catches a *subset* of falls and permits counter-flanks.
  floor('root-shelf-west', -16, -3, 10, 62, -9, 'stone'),
  floor('root-shelf-east', 16, 3, 10, 62, -9, 'stone'),
  floor('root-shelf-cross-south', 0, -28, 42, 7, -9),
  floor('root-shelf-cross-north', 0, 28, 42, 7, -9),
  floor('root-shelf-cross-centre', 0, 0, 42, 6, -9),
  // Reinforced side approaches with open, physically traversable slopes.
  floor('azure-west-landing', -38, -80, 19, 14, 0),
  floor('crimson-east-landing', 38, 80, 19, 14, 0),
];
const ramps = [
  // 12 m ascent over 33 m: deliberate high-ground access without teleporting.
  ramp('west-ascent', 'z', -44, -32, -80, -47, 0, 12),
  ramp('east-ascent', 'z', 32, 44, 47, 80, 12, 0),
  ramp('west-north-descent', 'z', -44, -32, 65, 98, 12, 0),
  ramp('east-south-ascent', 'z', 32, 44, -98, -65, 0, 12),
  // Cross-connect road and tree roads; intentional infantry shortcuts.
  ramp('west-to-crown', 'x', -34, -10, -7, 0, 12, 0),
  ramp('crown-to-east', 'x', 10, 34, 0, 7, 0, 12),
  // Lower root routes have separate physical access near either forward deck.
  ramp('root-west-south', 'z', -21, -11, -54, -29, 0, -9),
  ramp('root-east-north', 'z', 11, 21, 29, 54, -9, 0),
];
const trees = [
  { id: 'elder-west', x: -60, z: -10, radius: 6, height: 44, bloom: 'rose' },
  { id: 'elder-east', x: 60, z: 10, radius: 6, height: 44, bloom: 'gold' },
  { id: 'azure-giant', x: -57, z: -67, radius: 7, height: 52, bloom: 'rose' },
  { id: 'crimson-giant', x: 57, z: 67, radius: 7, height: 52, bloom: 'gold' },
  { id: 'west-lantern', x: -63, z: 51, radius: 4, height: 37, bloom: 'ivory' },
  { id: 'east-lantern', x: 63, z: -51, radius: 4, height: 37, bloom: 'ivory' },
];
const solids = [
  // Trunks have matching collision. The crown foliage is stylized but not a
  // solid sphere: flyers can pass through leaves, not through wood.
  ...trees.map((t) => solid('trunk-' + t.id, t.x, t.height / 2 - 1, t.z,
    t.radius * 1.5, t.height, t.radius * 1.5, 'wood')),
  // Readable cover deliberately does not close the principal machine road.
  ...[-100, -52, 0, 52, 100].flatMap((z, i) => [
    solid('cover-west-' + i, -12, 1.05, z, 2, 2.1, 3, 'stone'),
    solid('cover-east-' + i, 12, 1.05, z, 2, 2.1, 3, 'stone'),
  ]),
  ...[-20, 20].flatMap((z, i) => [
    solid('canopy-cover-west-' + i, -46, 13.0, z, 2, 2, 2, 'timber'),
    solid('canopy-cover-east-' + i, 46, 13.0, z, 2, 2, 2, 'timber'),
  ]),
];
const objectives = [
  { id: 'azure-forward', name: 'Azure Forward Camp', x: 0, y: 0, z: -52, radius: 8, captureSec: 12,
    initialOwner: TEAMS.ATTACKERS, forwardTeam: TEAMS.ATTACKERS },
  { id: 'western-bloom', name: 'The Western Bloom', x: -38, y: 12, z: -7, radius: 9, captureSec: 12,
    initialOwner: TEAMS.ATTACKERS },
  { id: 'crown-span', name: 'The Crown Span', x: 0, y: 0, z: 0, radius: 10, captureSec: 15,
    initialOwner: null },
  { id: 'eastern-bloom', name: 'The Eastern Bloom', x: 38, y: 12, z: 7, radius: 9, captureSec: 12,
    initialOwner: TEAMS.DEFENDERS },
  { id: 'crimson-forward', name: 'Crimson Forward Camp', x: 0, y: 0, z: 52, radius: 8, captureSec: 12,
    initialOwner: TEAMS.DEFENDERS, forwardTeam: TEAMS.DEFENDERS },
];
const spawnPoints = [
  ...[-7, 0, 7].flatMap(x => [-105, -99].map(z => spawn(x, 0, z, TEAMS.ATTACKERS))),
  ...[-7, 0, 7].flatMap(x => [105, 99].map(z => spawn(x, 0, z, TEAMS.DEFENDERS))),
  spawn(-5, 0, -69, TEAMS.ATTACKERS, true),
  spawn(5, 0, -69, TEAMS.ATTACKERS, true),
  spawn(-5, 0, 69, TEAMS.DEFENDERS, true),
  spawn(5, 0, 69, TEAMS.DEFENDERS, true),
];
export const HIGH_GROUNDS = Object.freeze({
  id: 'high-grounds', name: 'The High Grounds',
  floors: grounds, ramps, solids, trees, objectives, spawnPoints,
  bounds: Object.freeze({ minX: -78, maxX: 78, minZ: -117, maxZ: 117 }),
  abyssY: -52,
  // Production pads are separate from the home spawn; the operator's station
  // and a real forward-travel corridor must remain clear.
  siegeFoundries: Object.freeze([
    { id: 'azure-foundry', team: TEAMS.ATTACKERS, x: 16, y: 0, z: -101, spawnX: 0, spawnZ: -87, heading: Math.PI },
    { id: 'crimson-foundry', team: TEAMS.DEFENDERS, x: -16, y: 0, z: 101, spawnX: 0, spawnZ: 87, heading: 0 },
  ]),
});
