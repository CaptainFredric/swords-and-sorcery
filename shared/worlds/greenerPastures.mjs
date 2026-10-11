function point(id, x, z, yaw = 0, y = 0) {
  return Object.freeze({ id, x, y, z, yaw });
}

function floor(id, minX, maxX, minZ, maxZ, material = 'grass') {
  return Object.freeze({ id, center: Object.freeze([(minX + maxX) / 2, -0.2, (minZ + maxZ) / 2]), size: Object.freeze([maxX - minX, 0.4, maxZ - minZ]), y: 0, material });
}

function solid(id, center, size, kind = 'field-wall', material = 'stone') {
  return Object.freeze({ id, center: Object.freeze(center), size: Object.freeze(size), kind, material });
}

const PLAYER = point('opening', 0, 120);
const MEETING = point('meeting', 0, -15, Math.PI);
const BRIDGE_TAKEOFF = point('bridge-takeoff', 32, -447.9);
const BRIDGE_LANDING = point('bridge-landing', 32, -452.9);
const FINAL = point('final', 36, -850);
const ENTRANCE = point('complaint-entrance', 36, -856);
const CHASE = Object.freeze([
  MEETING,
  point('escape', 55, -80),
  point('fireball', -50, -170),
  point('bridge-approach', 32, -427),
  BRIDGE_TAKEOFF,
  BRIDGE_LANDING,
  point('far-bank', 32, -473),
  point('counterfire', -12, -610),
  point('complaint-approach', 32, -778),
  point('pride', 36, -840),
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
  center: Object.freeze([36, 0, -862]),
  sign: Object.freeze({ id: 'complaint-sign', text: 'TATTLE ON YOU', center: Object.freeze([36, 5.85, -856.65]), width: 23, height: 3.2 }),
});

// Feet positions shared by the tutorial controller and the actual world. The bridge gap is intentionally
// crossable by an ordinary Jump as well as Dash. The controller can observe that alternate route, then use the
// open counterfire lane for the genuine Dash opportunity. Nothing here changes ordinary movement or cooldowns.
export const GREENER_ROUTE = Object.freeze({
  playerSpawn: PLAYER,
  rivalMeeting: MEETING,
  initialDistance: 135,
  bounds: Object.freeze({ minX: -85, maxX: 100, minZ: -905, maxZ: 155 }),
  dimensions: Object.freeze({ width: 185, depth: 1060 }),
  chaseWaypoints: CHASE,
  waypointById: WAYPOINTS,
  routeDistances: DISTANCES,
  totalChaseDistance: distance,
  bridge: Object.freeze({
    centerX: 32,
    width: 12,
    ravineBounds: Object.freeze({ minZ: -459, maxZ: -441 }),
    gapBounds: Object.freeze({ minX: 26, maxX: 38, minZ: -451.5, maxZ: -448.5 }),
    dashStart: BRIDGE_TAKEOFF,
    dashLanding: BRIDGE_LANDING,
    alternateCrossing: point('old-footbridge', -68, -450),
    allowsOrdinaryJump: true,
  }),
  counterfire: WAYPOINTS.counterfire,
  finalStand: FINAL,
  entrance: ENTRANCE,
  departure: point('departure', -12, -848, Math.PI / 2),
  landmarks: Object.freeze({
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
    fireball: point('fireball-checkpoint', -44, -162),
    bridge: point('bridge-checkpoint', 32, -433),
    counterfire: point('counterfire-checkpoint', 30, -478),
    complaint: point('complaint-checkpoint', 32, -770),
    final: point('final-checkpoint', 36, -841),
  }),
});

export const GREENER_TREES = Object.freeze([
  { x: -28, z: 95, scale: 1.5 }, { x: 43, z: 78, scale: 1.7 },
  { x: -44, z: 22, scale: 1.6 }, { x: 34, z: 10, scale: 1.5 },
  { x: -26, z: -22, scale: 1.8 }, { x: 60, z: -56, scale: 1.6 },
  { x: -48, z: -83, scale: 1.8 }, { x: 28, z: -131, scale: 1.6 },
  { x: -42, z: -180, scale: 1.7 }, { x: 72, z: -217, scale: 1.6 },
  { x: 72, z: -288, scale: 1.6 }, { x: -36, z: -309, scale: 1.8 },
  { x: 38, z: -365, scale: 1.7 }, { x: -53, z: -418, scale: 1.8 },
  { x: 72, z: -470, scale: 1.7 }, { x: -39, z: -525, scale: 1.7 },
  { x: 4, z: -810, scale: 1.8 }, { x: 77, z: -840, scale: 1.9 },
  { x: -38, z: -879, scale: 1.7 },
].map((tree, index) => Object.freeze({ id: `pasture-oak-${index}`, ...tree })));

const FLOORS = Object.freeze([
  floor('opening-meadow', -85, 100, 40, 155),
  floor('meeting-meadow', -85, 100, -35, 40),
  floor('fireball-meadow', -85, 100, -205, -35),
  floor('bridge-meadow', -85, 100, -441, -205),
  floor('bridge-north-deck', 26, 38, -448.5, -441, 'stone'),
  floor('bridge-south-deck', 26, 38, -459, -451.5, 'stone'),
  // An old intact crossing far west makes the world's ordinary running graph coherent. It is visible, real
  // stone, and a substantial detour from the chase rather than a hidden walkable floor through the broken span.
  floor('old-footbridge', -72, -64, -459, -441, 'stone'),
  floor('far-pasture', -85, 100, -585, -459),
  floor('counterfire-meadow', -85, 100, -700, -585),
  floor('complaint-approach-meadow', -85, 100, -830, -700),
  floor('final-meadow', -85, 100, -852, -830),
  floor('complaint-court-west', -85, 20, -885, -852),
  floor('complaint-court', 20, 52, -885, -852, 'stone'),
  floor('complaint-court-east', 52, 100, -885, -852),
  floor('far-south-meadow', -85, 100, -905, -885),
]);

const SOLIDS = Object.freeze([
  solid('west-hedgerow', [-85, 1.1, -375], [1.2, 2.2, 1060], 'hedge', 'hedge'),
  solid('east-hedgerow', [100, 1.1, -375], [1.2, 2.2, 1060], 'hedge', 'hedge'),
  solid('north-hedgerow', [7.5, 1.1, 155], [185, 2.2, 1.2], 'hedge', 'hedge'),
  solid('south-field-wall', [7.5, 1, -905], [185, 2, 0.8]),
  // Old field boundaries on the ravine rim. Every opening is a real bridge approach; the broken span itself
  // has no lip or invisible collision across its lane. Walking into the missing span is an actual fall.
  ...[-440.8, -459.2].flatMap((z, side) => [
    solid(`ravine-${side}-west`, [-78.5, 0.85, z], [13, 1.7, 0.5]),
    solid(`ravine-${side}-middle`, [-19, 0.85, z], [90, 1.7, 0.5]),
    solid(`ravine-${side}-east`, [69, 0.85, z], [62, 1.7, 0.5]),
  ]),
  ...[-444.65, -455.35].flatMap((z, side) => [
    solid(`bridge-${side}-west-parapet`, [26.3, 0.55, z], [0.6, 1.1, 7.3], 'parapet'),
    solid(`bridge-${side}-east-parapet`, [37.7, 0.55, z], [0.6, 1.1, 7.3], 'parapet'),
  ]),
  solid('footbridge-west-parapet', [-71.7, 0.65, -450], [0.6, 1.3, 18], 'parapet'),
  solid('footbridge-east-parapet', [-64.3, 0.65, -450], [0.6, 1.3, 18], 'parapet'),
  // Small landmarks and cover stand beside the main travel line, leaving both combat clearings open.
  solid('meeting-waystone', [11, 1.15, -23], [1.4, 2.3, 1.1], 'waystone'),
  solid('old-field-wall-west', [-43, 0.85, 52], [27, 1.7, 0.6]),
  solid('old-field-wall-east', [61, 0.85, 34], [25, 1.7, 0.6]),
  solid('fireball-field-wall', [58, 0.85, -159], [30, 1.7, 0.6]),
  solid('far-field-wall', [-53, 0.85, -332], [28, 1.7, 0.6]),
  solid('complaint-field-wall', [-30, 0.85, -720], [36, 1.7, 0.6]),
  solid('final-waystone', [66, 2.25, -833], [2.3, 4.5, 1.7], 'waystone'),
  // TATTLE ON YOU has ordinary walls and a genuinely open six metre entrance. Its sign and roof sit above
  // standing height. Rival can reach the doorway on his feet, then choose to turn six metres before it.
  solid('complaint-west-wing', [28, 3.9, -860], [10, 7.8, 6], 'complaint-wing', 'plaster'),
  solid('complaint-east-wing', [44, 3.9, -860], [10, 7.8, 6], 'complaint-wing', 'plaster'),
  solid('complaint-lintel', [36, 7, -860], [6, 2.2, 6], 'complaint-lintel', 'timber'),
  solid('complaint-roof', [36, 8.8, -860], [28, 1.4, 9], 'complaint-roof', 'timber'),
  solid('complaint-rear-wall', [36, 3.5, -871], [26, 7, 0.8], 'complaint-wing', 'plaster'),
  solid('complaint-sign', DESTINATION.sign.center, [DESTINATION.sign.width, DESTINATION.sign.height, 0.22], 'complaint-sign', 'timber'),
  ...GREENER_TREES.map((tree) => solid(tree.id, [tree.x, 1.05 * tree.scale, tree.z], [0.52 * tree.scale, 2.1 * tree.scale, 0.52 * tree.scale], 'tree', 'timber')),
]);

// The broad fields use a sparse lattice of ordinary, ground checked navigation nodes. Only the intact western
// crossing joins the two banks for a bot that cannot Jump or Dash. The authored Rival route uses GREENER_ROUTE.
const NODES = [];
for (let z = 144; z > GREENER_ROUTE.bounds.minZ + 5; z -= 16) {
  if (z < GREENER_ROUTE.bridge.ravineBounds.maxZ + 2 && z > GREENER_ROUTE.bridge.ravineBounds.minZ - 2) continue;
  for (const x of [-68, -52, -36, -20, -4, 12, 28, 44, 60, 76, 92]) {
    // Leave samples under masonry and trunks out of the graph.
    const obstructed = SOLIDS.some((item) => item.center[1] - item.size[1] / 2 < 1.8
      && Math.abs(x - item.center[0]) < item.size[0] / 2 + 0.65
      && Math.abs(z - item.center[2]) < item.size[2] / 2 + 0.65);
    if (!obstructed) NODES.push(point(`field-${x}-${z}`, x, z));
  }
}
NODES.push(point('west-crossing-north', -68, -439), point('west-crossing', -68, -450), point('west-crossing-south', -68, -461));
NODES.push(point('broken-north', 32, -445), point('broken-south', 32, -455));
NODES.push(point('complaint-front', 36, -848), ENTRANCE, point('complaint-court', 36, -865));

export const GREENER_PASTURES = Object.freeze({
  id: 'greener-pastures',
  name: 'Greener Pastures',
  tutorialOnly: true,
  zones: Object.freeze([
    Object.freeze({ id: 'opening-vista', name: 'Opening Meadow', center: Object.freeze([0, 0, 120]), radius: 30 }),
    Object.freeze({ id: 'meeting-clearing', name: 'Meeting Clearing', center: Object.freeze([0, 0, -15]), radius: 20 }),
    Object.freeze({ id: 'old-bridge', name: 'Broken Bridge', center: Object.freeze([32, 0, -450]), radius: 16 }),
    Object.freeze({ id: 'counterfire-pasture', name: 'Far Pasture', center: Object.freeze([-12, 0, -610]), radius: 24 }),
    Object.freeze({ id: 'final-clearing', name: 'TATTLE ON YOU', center: Object.freeze([36, 0, -850]), radius: 18 }),
  ]),
  floors: FLOORS,
  ramps: Object.freeze([]),
  solids: SOLIDS,
  props: Object.freeze([]),
  spawnPoints: Object.freeze([PLAYER, MEETING, point('west-field-spawn', -28, 60), point('east-field-spawn', 48, -44), point('far-field-spawn', -8, -595), point('final-spawn', 36, -841)]),
  navigation: Object.freeze({ nodes: Object.freeze(NODES) }),
  navigationHints: Object.freeze([
    Object.freeze({ id: 'opening-to-meeting', from: Object.freeze([0, 0, 120]), to: Object.freeze([0, 0, -15]), kind: 'run' }),
    Object.freeze({ id: 'broken-span', from: Object.freeze([32, 0, -447.9]), to: Object.freeze([32, 0, -452.9]), kind: 'dash-or-jump' }),
    Object.freeze({ id: 'old-crossing', from: Object.freeze([-68, 0, -439]), to: Object.freeze([-68, 0, -461]), kind: 'run' }),
    Object.freeze({ id: 'far-bank-to-final', from: Object.freeze([32, 0, -473]), to: Object.freeze([36, 0, -850]), kind: 'run' }),
  ]),
  abyssY: -9,
});
