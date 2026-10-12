function point(id, x, z, yaw = 0, y = 0) {
  return Object.freeze({ id, x, y, z, yaw });
}

function floor(id, minX, maxX, minZ, maxZ, material = 'grass', y = 0) {
  return Object.freeze({ id, center: Object.freeze([(minX + maxX) / 2, y - 0.2, (minZ + maxZ) / 2]), size: Object.freeze([maxX - minX, 0.4, maxZ - minZ]), y, material });
}

function solid(id, center, size, kind = 'field-wall', material = 'stone') {
  return Object.freeze({ id, center: Object.freeze(center), size: Object.freeze(size), kind, material });
}

const PLAYER = point('opening', 0, 160);
const MEETING = point('meeting', 0, -15, Math.PI);
const JUMP_APPROACH = point('jump-approach', 55, -91);
const JUMP_TAKEOFF = point('jump-takeoff', 55, -97.8);
const JUMP_LANDING = point('jump-landing', 55, -104.2);
const JUMP_EXIT = point('jump-exit', 55, -114);
const TATTLE_REVEAL = point('tattle-reveal', 30, -400);
const BRIDGE_TAKEOFF = point('bridge-takeoff', 32, -662.4, 0, 2);
const BRIDGE_LANDING = point('bridge-landing', 32, -676.1);
const FINAL = point('final', 36, -1072);
const ENTRANCE = point('complaint-entrance', 36, -1076);
const CHASE = Object.freeze([
  MEETING,
  point('escape', 55, -80),
  JUMP_APPROACH, JUMP_TAKEOFF, JUMP_LANDING, JUMP_EXIT,
  point('fireball', -50, -170),
  TATTLE_REVEAL,
  point('sheepfold', 15, -486),
  point('bridge-approach', 32, -572),
  BRIDGE_TAKEOFF,
  BRIDGE_LANDING,
  point('far-bank', 32, -693),
  point('counterfire', -12, -830),
  point('complaint-approach', 32, -998),
  point('pride', 36, -1060),
  FINAL,
]);
const WAYPOINTS = Object.freeze(Object.fromEntries(CHASE.map(item => [item.id, item])));
let distance = 0;
const DISTANCES = Object.freeze(Object.fromEntries(CHASE.map((item, index) => {
  if (index) distance += Math.hypot(item.x - CHASE[index - 1].x, item.z - CHASE[index - 1].z);
  return [item.id, distance];
})));
const DESTINATION = Object.freeze({
  id: 'tattle-on-you',
  label: 'TATTLE ON YOU',
  entrance: ENTRANCE,
  center: Object.freeze([36, 0, -1082]),
  sign: Object.freeze({ id: 'complaint-sign', text: 'TATTLE ON YOU', center: Object.freeze([36, 5.85, -1076.65]), width: 14, height: 1.8 }),
});

// Feet positions shared by the tutorial and the physical world. The stile teaches ordinary Jump first.
// The larger broken span needs Sprint, Jump and Dash during descent with unchanged movement rules.
// An intact western footbridge remains a visible, substantial running detour.
export const GREENER_ROUTE = Object.freeze({
  playerSpawn: PLAYER,
  rivalMeeting: MEETING,
  initialDistance: 175,
  bounds: Object.freeze({ minX: -85, maxX: 100, minZ: -1125, maxZ: 195 }),
  dimensions: Object.freeze({ width: 185, depth: 1320 }),
  chaseWaypoints: CHASE,
  waypointById: WAYPOINTS,
  routeDistances: DISTANCES,
  totalChaseDistance: distance,
  jump: Object.freeze({
    takeoff: JUMP_TAKEOFF,
    landing: JUMP_LANDING,
    waitPoint: JUMP_EXIT,
    obstacleBounds: Object.freeze({ minX: 45, maxX: 65, minZ: -101.35, maxZ: -100.65, minY: 0, maxY: 0.8 }),
  }),
  bridge: Object.freeze({
    centerX: 32,
    width: 12,
    ravineBounds: Object.freeze({ minZ: -679, maxZ: -661 }),
    gapBounds: Object.freeze({ minX: 26, maxX: 38, minZ: -675.5, maxZ: -663 }),
    dashStart: BRIDGE_TAKEOFF,
    dashLanding: BRIDGE_LANDING,
    waitPoint: point('bridge-wait', 32, -658.5, 0, 2),
    alternateCrossing: point('old-footbridge', -68, -670),
    alternateFootbridge: Object.freeze({
      north: point('old-footbridge-north', -68, -659),
      crossing: point('old-footbridge', -68, -670),
      south: point('old-footbridge-south', -68, -681),
      bounds: Object.freeze({ minX: -72, maxX: -64, minZ: -679, maxZ: -661 }),
    }),
    allowsOrdinaryJump: false,
  }),
  counterfire: WAYPOINTS.counterfire,
  finalStand: FINAL,
  entrance: ENTRANCE,
  departure: point('departure', -12, -1068, Math.PI / 2),
  landmarks: Object.freeze({
    jump: JUMP_APPROACH,
    'jump-approach': JUMP_APPROACH,
    'pursuit-banter': point('pursuit-banter', -30, -220),
    'tattle-reveal': TATTLE_REVEAL,
    sheepfold: WAYPOINTS.sheepfold,
    fireball: WAYPOINTS.fireball,
    counterfire: WAYPOINTS.counterfire,
    complaintApproach: WAYPOINTS['complaint-approach'],
    pride: WAYPOINTS.pride,
    destination: DESTINATION,
  }),
  checkpointPositions: Object.freeze({
    opening: PLAYER,
    approach: point('approach-checkpoint', 0, -10),
    introductions: point('introductions-checkpoint', 0, -12.2),
    duel: point('duel-checkpoint', 0, -12.2),
    pursuit: point('pursuit-checkpoint', 12, -38),
    jump: JUMP_APPROACH,
    fireball: point('fireball-checkpoint', -44, -162),
    bridge: point('bridge-checkpoint', 32, -572),
    counterfire: point('counterfire-checkpoint', 30, -698),
    complaint: point('complaint-checkpoint', 32, -990),
    final: point('final-checkpoint', 36, -1061),
  }),
});

export const GREENER_TREES = Object.freeze([
  { x: -28, z: 95, scale: 1.5 }, { x: 43, z: 78, scale: 1.7 },
  { x: -44, z: 22, scale: 1.6 }, { x: 34, z: 10, scale: 1.5 },
  { x: -26, z: -22, scale: 1.8 }, { x: 60, z: -56, scale: 1.6 },
  { x: -48, z: -83, scale: 1.8 }, { x: 28, z: -131, scale: 1.6 },
  { x: -42, z: -180, scale: 1.7 }, { x: 72, z: -217, scale: 1.6 },
  { x: 72, z: -288, scale: 1.6 }, { x: -36, z: -309, scale: 1.8 },
  { x: 38, z: -585, scale: 1.7 }, { x: -53, z: -638, scale: 1.8 },
  { x: 72, z: -690, scale: 1.7 }, { x: -39, z: -745, scale: 1.7 },
  { x: 4, z: -1030, scale: 1.8 }, { x: 77, z: -1060, scale: 1.9 },
  { x: -38, z: -1099, scale: 1.7 },
  ...[-70, -54, -38].flatMap(x => [-226, -247, -268].map(z => ({ x, z, scale: 1.35, kind: 'oak' }))),
  ...[-66, -50].flatMap(x => [98, 121, 144].map(z => ({ x, z, scale: 1.3, kind: 'oak' }))),
].map((tree, index) => Object.freeze({ id: `pasture-oak-${index}`, ...tree })));

const FLOORS = Object.freeze([
  floor('opening-meadow', -85, 100, 40, 195),
  floor('meeting-meadow', -85, 100, -35, 40),
  floor('fireball-meadow', -85, 100, -205, -35),
  floor('bridge-meadow', -85, 100, -641, -205),
  floor('bridge-bank-west', -85, 26, -661, -641),
  floor('bridge-bank-east', 38, 100, -661, -641),
  floor('bridge-north-deck', 26, 38, -663, -653, 'stone', 2),
  floor('bridge-south-deck', 26, 38, -679, -675.5, 'stone'),
  // An old intact crossing far west makes the world's ordinary running graph coherent. It is visible, real
  // stone, and a substantial detour from the chase rather than a hidden walkable floor through the broken span.
  floor('old-footbridge', -72, -64, -679, -661, 'stone'),
  floor('far-pasture', -85, 100, -805, -679),
  floor('counterfire-meadow', -85, 100, -920, -805),
  floor('complaint-approach-meadow', -85, 100, -1050, -920),
  floor('final-meadow', -85, 100, -1072, -1050),
  floor('complaint-court-west', -85, 20, -1105, -1072),
  floor('complaint-court', 20, 52, -1105, -1072, 'stone'),
  floor('complaint-court-east', 52, 100, -1105, -1072),
  floor('far-south-meadow', -85, 100, -1125, -1105),
]);

const RAMPS = Object.freeze([
  Object.freeze({ id: 'bridge-north-ramp', minX: 26, maxX: 38, minZ: -653, maxZ: -641, axis: 'z', startY: 2, endY: 0, material: 'stone' }),
]);

const SOLIDS = Object.freeze([
  solid('west-hedgerow', [-85, 1.1, -465], [1.2, 2.2, 1320], 'hedge', 'hedge'),
  solid('east-hedgerow', [100, 1.1, -465], [1.2, 2.2, 1320], 'hedge', 'hedge'),
  solid('north-hedgerow', [7.5, 1.1, 195], [185, 2.2, 1.2], 'hedge', 'hedge'),
  solid('south-field-wall', [7.5, 1, -1125], [185, 2, 0.8]),
  // Old field boundaries on the ravine rim. Every opening is a real bridge approach; the broken span itself
  // has no lip or invisible collision across its lane. Walking into the missing span is an actual fall.
  ...[-660.8, -679.2].flatMap((z, side) => [
    solid(`ravine-${side}-west`, [-78.5, 0.85, z], [13, 1.7, 0.5]),
    solid(`ravine-${side}-middle`, [-19, 0.85, z], [90, 1.7, 0.5]),
    solid(`ravine-${side}-east`, [69, 0.85, z], [62, 1.7, 0.5]),
  ]),
  // The elevated north deck ends in a real drop. Both parapets stay beside the lane.
  solid('bridge-north-footing', [32, -5.455, -658], [12, 14.09, 10], 'bridge-footing'),
  solid('bridge-north-west-parapet', [26.3, 2.55, -658], [0.6, 1.1, 10], 'parapet'),
  solid('bridge-north-east-parapet', [37.7, 2.55, -658], [0.6, 1.1, 10], 'parapet'),
  solid('bridge-south-west-parapet', [26.3, 0.55, -677.25], [0.6, 1.1, 3.5], 'parapet'),
  solid('bridge-south-east-parapet', [37.7, 0.55, -677.25], [0.6, 1.1, 3.5], 'parapet'),
  solid('footbridge-west-parapet', [-71.7, 0.65, -670], [0.6, 1.3, 18], 'parapet'),
  solid('footbridge-east-parapet', [-64.3, 0.65, -670], [0.6, 1.3, 18], 'parapet'),
  // Field boundaries frame useful open lanes, an orchard and the remains of a farm courtyard.
  solid('opening-west-field-wall', [-29, 0.85, 103], [0.7, 1.7, 82]),
  solid('opening-west-return', [-53, 0.85, 62], [48, 1.7, 0.7]),
  solid('opening-east-hedge', [49, 1.1, 124], [1.1, 2.2, 58], 'hedge', 'hedge'),
  solid('opening-east-return', [68, 0.85, 95], [38, 1.7, 0.7]),
  solid('meeting-waystone', [11, 1.15, -23], [1.4, 2.3, 1.1], 'waystone'),
  solid('escape-east-hedge', [80, 1.1, -74], [1.1, 2.2, 44], 'hedge', 'hedge'),
  solid('orchard-stile', [55, 0.4, -101], [20, 0.8, 0.7]),
  solid('stile-west-post', [44.4, 1, -101], [1.2, 2, 1.2]),
  solid('stile-east-post', [65.6, 1, -101], [1.2, 2, 1.2]),
  solid('stile-west-hedge', [37, 1.1, -101], [13.6, 2.2, 1.1], 'hedge', 'hedge'),
  solid('stile-east-hedge', [78, 1.1, -101], [23.6, 2.2, 1.1], 'hedge', 'hedge'),
  solid('fireball-west-field-wall', [-72, 0.85, -166], [0.7, 1.7, 52]),
  solid('fireball-field-wall', [58, 0.85, -159], [30, 1.7, 0.7]),
  solid('orchard-west-hedge', [-78, 1.1, -246], [1.1, 2.2, 82], 'hedge', 'hedge'),
  solid('orchard-south-wall', [-55, 0.85, -287], [46, 1.7, 0.7]),
  solid('granary-west-remnant', [56, 1.2, -318], [0.8, 2.4, 26]),
  solid('granary-east-remnant', [80, 1.2, -318], [0.8, 2.4, 26]),
  solid('granary-south-remnant', [68, 1.2, -331], [24, 2.4, 0.8]),
  solid('granary-front-west-remnant', [59, 0.65, -305], [6, 1.3, 0.8]),
  solid('granary-front-east-remnant', [77, 0.65, -305], [6, 1.3, 0.8]),
  solid('sheepfold-west-wall', [-43, 0.85, -481], [0.7, 1.7, 28]),
  solid('sheepfold-south-wall', [-27, 0.85, -495], [32, 1.7, 0.7]),
  solid('sheepfold-east-remnant', [-11, 0.6, -487], [0.7, 1.2, 16]),
  solid('sheepfold-gate-west', [-36, 0.55, -467], [14, 1.1, 0.7]),
  solid('sheepfold-gate-east', [-15, 0.55, -467], [8, 1.1, 0.7]),
  solid('far-field-wall', [-53, 0.85, -332], [28, 1.7, 0.7]),
  solid('counterfire-west-hedge', [-56, 1.1, -859], [1.1, 2.2, 84], 'hedge', 'hedge'),
  solid('counterfire-east-wall', [60, 0.85, -853], [0.7, 1.7, 66]),
  solid('complaint-field-wall', [-30, 0.85, -940], [36, 1.7, 0.7]),
  solid('complaint-lane-west-hedge', [-40, 1.1, -991], [1.1, 2.2, 70], 'hedge', 'hedge'),
  solid('complaint-lane-east-hedge', [76, 1.1, -992], [1.1, 2.2, 62], 'hedge', 'hedge'),
  solid('final-waystone', [66, 2.25, -1053], [2.3, 4.5, 1.7], 'waystone'),
  // TATTLE ON YOU has ordinary walls and a genuinely open six metre entrance. Its sign and roof sit above
  // standing height. Rival can reach the doorway on his feet, then choose to turn four metres before it.
  solid('complaint-west-wing', [28, 3.9, -1080], [10, 7.8, 6], 'complaint-wing', 'plaster'),
  solid('complaint-east-wing', [44, 3.9, -1080], [10, 7.8, 6], 'complaint-wing', 'plaster'),
  solid('complaint-lintel', [36, 7, -1080], [6, 2.2, 6], 'complaint-lintel', 'timber'),
  solid('complaint-roof', [36, 8.8, -1080], [28, 1.4, 9], 'complaint-roof', 'timber'),
  solid('complaint-rear-wall', [36, 3.5, -1091], [26, 7, 0.8], 'complaint-wing', 'plaster'),
  solid('complaint-sign', DESTINATION.sign.center, [DESTINATION.sign.width, DESTINATION.sign.height, 0.22], 'complaint-sign', 'timber'),
  ...GREENER_TREES.map((tree) => solid(tree.id, [tree.x, 1.05 * tree.scale, tree.z], [0.52 * tree.scale, 2.1 * tree.scale, 0.52 * tree.scale], 'tree', 'timber')),
]);

// The broad fields use a sparse lattice of ordinary, ground checked navigation nodes. Only the intact western
// crossing joins the two banks for a bot that cannot Jump or Dash. The authored Rival route uses GREENER_ROUTE.
function navigationHeight(x, z) {
  let y = null;
  for (const item of FLOORS) {
    if (Math.abs(x - item.center[0]) <= item.size[0] / 2 && Math.abs(z - item.center[2]) <= item.size[2] / 2) y = Math.max(y ?? -Infinity, item.y);
  }
  for (const item of RAMPS) {
    if (x < item.minX || x > item.maxX || z < item.minZ || z > item.maxZ) continue;
    const t = (z - item.minZ) / (item.maxZ - item.minZ);
    y = Math.max(y ?? -Infinity, item.startY + (item.endY - item.startY) * t);
  }
  return y;
}

const NODES = [];
for (let z = 184; z > GREENER_ROUTE.bounds.minZ + 5; z -= 16) {
  if (z < GREENER_ROUTE.bridge.ravineBounds.maxZ + 2 && z > GREENER_ROUTE.bridge.ravineBounds.minZ - 2) continue;
  for (const x of [-68, -52, -36, -20, -4, 12, 28, 44, 60, 76, 92]) {
    const y = navigationHeight(x, z);
    if (y === null) continue;
    const obstructed = SOLIDS.some((item) => item.center[1] - item.size[1] / 2 < y + 1.8
      && item.center[1] + item.size[1] / 2 > y + 0.01
      && Math.abs(x - item.center[0]) < item.size[0] / 2 + 0.65
      && Math.abs(z - item.center[2]) < item.size[2] / 2 + 0.65);
    if (!obstructed) NODES.push(point(`field-${x}-${z}`, x, z, 0, y));
  }
}
NODES.push(point('west-crossing-north', -68, -659), point('west-crossing', -68, -670), point('west-crossing-south', -68, -681));
for (const z of [-640, -647, -653, -658, -662]) NODES.push(point(`north-bridge-${z}`, 32, z, 0, navigationHeight(32, z)));
NODES.push(point('granary-front', 68, -298), point('granary-gate', 68, -305), point('granary-court', 68, -316));
NODES.push(point('broken-south', 32, -677), point('broken-south-exit', 32, -684));
NODES.push(point('complaint-front', 36, -1068), ENTRANCE, point('complaint-court', 36, -1085));

export const GREENER_PASTURES = Object.freeze({
  id: 'greener-pastures',
  name: 'Greener Pastures',
  tutorialOnly: true,
  zones: Object.freeze([
    Object.freeze({ id: 'opening-vista', name: 'Opening Meadow', center: Object.freeze([0, 0, 160]), radius: 35 }),
    Object.freeze({ id: 'meeting-clearing', name: 'Meeting Clearing', center: Object.freeze([0, 0, -15]), radius: 20 }),
    Object.freeze({ id: 'orchard-stile', name: 'Orchard Stile', center: Object.freeze([55, 0, -101]), radius: 24 }),
    Object.freeze({ id: 'fireball-clearing', name: 'Lower Hayfield', center: Object.freeze([-50, 0, -170]), radius: 28 }),
    Object.freeze({ id: 'western-orchard', name: 'Western Orchard', center: Object.freeze([-55, 0, -247]), radius: 32 }),
    Object.freeze({ id: 'granary-remnants', name: 'Old Granary', center: Object.freeze([68, 0, -318]), radius: 22 }),
    Object.freeze({ id: 'old-sheepfold', name: 'Old Sheepfold', center: Object.freeze([-27, 0, -481]), radius: 24 }),
    Object.freeze({ id: 'old-bridge', name: 'Broken Bridge', center: Object.freeze([32, 0, -670]), radius: 16 }),
    Object.freeze({ id: 'counterfire-pasture', name: 'Far Pasture', center: Object.freeze([-12, 0, -830]), radius: 24 }),
    Object.freeze({ id: 'final-clearing', name: 'TATTLE ON YOU', center: Object.freeze([36, 0, -1070]), radius: 18 }),
  ]),
  floors: FLOORS,
  ramps: RAMPS,
  solids: SOLIDS,
  props: Object.freeze([]),
  spawnPoints: Object.freeze([PLAYER, MEETING, point('west-field-spawn', -28, 60), point('east-field-spawn', 48, -44), point('far-field-spawn', -8, -815), point('final-spawn', 36, -1061)]),
  navigation: Object.freeze({ nodes: Object.freeze(NODES) }),
  navigationHints: Object.freeze([
    Object.freeze({ id: 'opening-to-meeting', from: Object.freeze([0, 0, 160]), to: Object.freeze([0, 0, -15]), kind: 'run' }),
    Object.freeze({ id: 'orchard-stile', from: Object.freeze([55, 0, -97.8]), to: Object.freeze([55, 0, -104.2]), kind: 'jump' }),
    Object.freeze({ id: 'broken-span', from: Object.freeze([32, 2, -662.4]), to: Object.freeze([32, 0, -676.1]), kind: 'jump-and-airborne-dash' }),
    Object.freeze({ id: 'old-crossing', from: Object.freeze([-68, 0, -659]), to: Object.freeze([-68, 0, -681]), kind: 'run' }),
    Object.freeze({ id: 'far-bank-to-final', from: Object.freeze([32, 0, -693]), to: Object.freeze([36, 0, -1070]), kind: 'run' }),
  ]),
  abyssY: -9,
});

// A local tutorial overlay. The canonical world is never mutated by retries.
export const BRIDGE_RETRY = Object.freeze({ metresPerFailure: 1.2, maxFailures: 3 });
export function greenerBridgeRetryFloor(failures = 0) {
  const count = Math.min(BRIDGE_RETRY.maxFailures, Math.max(0, Math.trunc(failures) || 0));
  if (!count) return null;
  const start = GREENER_ROUTE.bridge.gapBounds.minZ;
  return floor('bridge-retry-deck', 26, 38, start, start + count * BRIDGE_RETRY.metresPerFailure, 'stone');
}
export function greenerPasturesWithBridgeRetries(failures = 0) {
  const extension = greenerBridgeRetryFloor(failures);
  return extension ? { ...GREENER_PASTURES, floors: [...GREENER_PASTURES.floors, extension] } : GREENER_PASTURES;
}
