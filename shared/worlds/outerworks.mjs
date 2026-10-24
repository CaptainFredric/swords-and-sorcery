import { TEAMS } from '../src/teams.mjs';

/**
 * The Outerworks: Expansive fortified siege battlefield.
 *
 * Designed for combined Spellblade mobile infantry and Bi-Bye-llista siege engine warfare:
 * - Zone 1: Attacker Staging Camp (z: -58 to -40) with dedicated vehicle turnaround bay and mantlets.
 * - Zone 2: The Great Esplanade (z: -40 to -14): wide 8.5m siege road with intermittent stone and timber cover.
 * - Zone 3: Western Sally Trench (x: -26 to -16, z: -44 to 8): sunken 2.8m infantry-only bypass shielded from ballista fire.
 * - Zone 4: Eastern Siege Terrace (x: 13 to 24, z: -18 to -4, y: 1.2m): elevated vehicle firing platform with 8m wide ramp.
 * - Zone 5: Eastern High Parapet (x: 19 to 25, z: -4 to 38, y: 2.4m): elevated infantry catwalk with embrasures and plunge points.
 * - Zone 6: Objective 1 - The Forward Redoubt (z: -14 to 0, centered at 0, 0, -12, radius 7.0m): contested hornwork earthwork.
 * - Zone 7: The Great Breach (z: 0 to 6): 8.4m wide curtain wall breach with 7.0m clear passage for the 5.3m ballista bow.
 * - Zone 8: The Barbican Courtyard / Inner Bailey (z: 6 to 38): contested plaza with ruined storehouses and stone cistern.
 * - Zone 9: Objective 2 - The Barbican Gatehouse (centered at 0, 0, 34, radius 6.5m): monumental twin towers and portcullis.
 * - Zone 10: Defender Staging Camp (z: 46 to 60): secure rear staging behind the inner gatehouse.
 */

function solid(id, [x0, x1], [y0, y1], [z0, z1], extra = {}) {
  return {
    id,
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    size: [x1 - x0, y1 - y0, z1 - z0],
    material: 'stone',
    ...extra,
  };
}

function floor(id, [x0, x1], [z0, z1], y = 0, material = 'stone', extra = {}) {
  return {
    id,
    center: [(x0 + x1) / 2, y - 0.15, (z0 + z1) / 2],
    size: [x1 - x0, 0.3, z1 - z0],
    y,
    material,
    ...extra,
  };
}

function spawn(x, y, z, targetX, targetZ, team, phase = 0) {
  const dx = targetX - x;
  const dz = targetZ - z;
  const yaw = Math.atan2(-dx, -dz);
  return { x, y, z, yaw, team, phase };
}

function nav(id, x, y, z) {
  return Object.freeze({ id, x, y, z });
}

export const OUTERWORKS_TERRACE_Y = 1.2;
export const OUTERWORKS_PARAPET_Y = 2.4;
export const OUTERWORKS_GATE_OPEN_DURATION_SEC = 1.4;

const FLOORS = [
  // Attacker Staging Camp
  floor('floor-att-camp', [-18, 18], [-58, -40], 0, 'stone'),

  // The Great Esplanade (Central Approach Road)
  floor('floor-esplanade', [-16, 16], [-40, -14], 0, 'stone'),

  // Objective 1: The Forward Redoubt Ground
  floor('floor-redoubt', [-16, 16], [-14, 0], 0, 'stone'),

  // The Great Breach Passage
  floor('floor-breach', [-10, 10], [0, 6], 0, 'stone'),

  // The Barbican Courtyard / Inner Bailey
  floor('floor-bailey', [-18, 18], [6, 44], 0, 'stone'),

  // Inner Gatehouse Passage
  floor('floor-inner-gate', [-6, 6], [44, 48], 0, 'stone'),

  // Defender Staging Camp
  floor('floor-def-base', [-18, 18], [48, 60], 0, 'stone'),

  // Western Sally Trench (Sunken infantry corridor)
  floor('floor-west-trench', [-26, -16], [-44, 8], 0, 'stone'),

  // Eastern Elevated Firing Terrace (Ballista platform)
  floor('floor-east-terrace', [13, 24], [-18, -4], OUTERWORKS_TERRACE_Y, 'stone'),

  // Eastern High Parapet (Infantry catwalk)
  floor('floor-east-parapet', [19, 25], [-4, 38], OUTERWORKS_PARAPET_Y, 'stone'),
];

const RAMPS = [
  // Wide 8m vehicle ramp rising from Esplanade up to the Eastern Firing Terrace
  {
    id: 'ramp-east-terrace',
    minX: 13,
    maxX: 21,
    minZ: -28,
    maxZ: -18,
    startY: 0,
    endY: OUTERWORKS_TERRACE_Y,
    axis: 'z',
  },
  // Infantry steps rising from the Terrace up to the High Parapet
  {
    id: 'stairs-east-parapet',
    minX: 19,
    maxX: 23,
    minZ: -8,
    maxZ: -4,
    startY: OUTERWORKS_TERRACE_Y,
    endY: OUTERWORKS_PARAPET_Y,
    axis: 'z',
    steps: true,
  },
];

const SOLIDS = [
  // --- Outer Perimeter Fortress Walls ---
  solid('wall-south-camp', [-19, 19], [0, 4.5], [-59, -58]),
  solid('wall-west-camp', [-19, -18], [0, 4.0], [-58, -44]),
  solid('wall-east-camp', [18, 19], [0, 4.0], [-58, -28]),
  solid('wall-west-trench-outer', [-26.8, -26.0], [0, 4.0], [-44, 8]),
  solid('wall-west-bailey-outer', [-26.8, -26.0], [0, 5.0], [8, 44]),
  solid('wall-east-outer', [25.0, 26.0], [0, 5.0], [-28, 44]),
  solid('wall-north-keep', [-19, 19], [0, 5.5], [60, 61]),
  solid('wall-west-def-camp', [-19, -18], [0, 4.5], [48, 60]),
  solid('wall-east-def-camp', [18, 19], [0, 4.5], [48, 60]),

  // --- Attacker Staging Camp Cover & Mantlets ---
  solid('cover-camp-mantlet-west', [-14, -11], [0, 1.8], [-50, -49], { material: 'timber' }),
  solid('cover-camp-mantlet-east', [11, 14], [0, 1.8], [-50, -49], { material: 'timber' }),
  solid('cover-camp-crates', [-10, -6], [0, 1.2], [-56, -54.5], { material: 'timber' }),

  // --- Western Sally Trench Partition & Revetments (Infantry Only) ---
  // Leave a 6m wide entrance at z: -46 to -40 for camp access into the trench
  solid('trench-revetment-south', [-16.8, -16.0], [0, 2.2], [-38, -26]),
  solid('trench-revetment-north', [-16.8, -16.0], [0, 2.2], [-22, -10]),
  solid('trench-chicane-1', [-20.0, -18.2], [0, 2.0], [-30, -29], { material: 'timber' }),
  solid('trench-chicane-2', [-24.8, -23.0], [0, 2.0], [-18, -17], { material: 'timber' }),
  solid('trench-exit-wall', [-16.8, -16.0], [0, 2.2], [-6, 4]),

  // --- The Great Esplanade Cover (Intermittent siege protection) ---
  solid('cover-esplanade-mantlet', [-6.5, -4.5], [0, 1.8], [-33, -32], { material: 'timber' }),
  solid('cover-esplanade-cart', [4.5, 7.5], [0, 1.4], [-27, -25], { material: 'timber' }),
  solid('cover-esplanade-boulder', [-7.5, -5.5], [0, 1.2], [-24, -22]),

  // --- Eastern Siege Firing Terrace Retaining Wall & Parapet ---
  solid('terrace-retaining-wall', [12.2, 13.0], [0, OUTERWORKS_TERRACE_Y], [-18, -4]),
  solid('terrace-parapet-south', [12.2, 13.0], [OUTERWORKS_TERRACE_Y, OUTERWORKS_TERRACE_Y + 1.0], [-18, -14]),
  solid('terrace-parapet-north', [12.2, 13.0], [OUTERWORKS_TERRACE_Y, OUTERWORKS_TERRACE_Y + 1.0], [-8, -4]),
  // 6m open embrasure between z = -14 and z = -8 for the ballista to aim across the redoubt

  // --- Eastern High Parapet Crenellations (Infantry Walkway) ---
  solid('parapet-retaining-wall', [18.2, 19.0], [0, OUTERWORKS_PARAPET_Y], [-4, 38]),
  solid('parapet-crenel-1', [18.2, 19.0], [OUTERWORKS_PARAPET_Y, OUTERWORKS_PARAPET_Y + 1.1], [-4, 4]),
  solid('parapet-crenel-2', [18.2, 19.0], [OUTERWORKS_PARAPET_Y, OUTERWORKS_PARAPET_Y + 1.1], [8, 16]),
  solid('parapet-crenel-3', [18.2, 19.0], [OUTERWORKS_PARAPET_Y, OUTERWORKS_PARAPET_Y + 1.1], [20, 28]),
  solid('parapet-crenel-4', [18.2, 19.0], [OUTERWORKS_PARAPET_Y, OUTERWORKS_PARAPET_Y + 1.1], [32, 38]),

  // --- Objective 1: The Forward Redoubt Hornwork Earthwork & Barricades ---
  solid('redoubt-hornwork-west', [-14.0, -4.5], [0, 1.2], [-15.0, -13.8]),
  solid('redoubt-hornwork-east', [4.5, 12.2], [0, 1.2], [-15.0, -13.8]),
  solid('cover-redoubt-front', [-1.8, 1.8], [0, 1.1], [-16.5, -15.5], { material: 'timber' }),
  solid('gabion-redoubt-west', [-4.8, -3.2], [0, 1.3], [-13.5, -12.0]),
  solid('gabion-redoubt-east', [3.2, 4.8], [0, 1.3], [-13.5, -12.0]),
  solid('cover-redoubt-crates', [-6.5, -4.5], [0, 1.0], [-8.0, -6.5], { material: 'timber' }),

  // --- The Outer Curtain Wall & The Great Breach (z: 0 to 4) ---
  solid('wall-curtain-west-outer', [-26.0, -20.2], [0, 5.0], [0, 3.5]),
  solid('wall-curtain-west-inner', [-17.4, -4.2], [0, 5.0], [0, 3.5]),
  solid('wall-curtain-east', [4.2, 19.0], [0, 5.0], [0, 3.5]),
  solid('rubble-breach-west', [-4.2, -3.5], [0, 0.8], [0.5, 2.5]),
  solid('rubble-breach-east', [3.5, 4.2], [0, 0.8], [0.5, 2.5]),
  // Unobstructed passage through breach: x in [-3.5, 3.5] = 7.0m clear width!

  // --- The Barbican Courtyard / Inner Bailey Cover ---
  solid('storehouse-ruin-west', [-14.0, -8.0], [0, 2.8], [14, 20]),
  solid('cistern-east', [6.0, 9.5], [0, 1.2], [16, 19.5]),
  solid('cover-bailey-cart', [-4.0, -1.0], [0, 1.4], [24, 26], { material: 'timber' }),
  solid('cover-bailey-barricade', [1.0, 4.0], [0, 1.2], [28, 29], { material: 'timber' }),

  // --- Objective 2: The Barbican Gatehouse (Inner Fortress Threshold) ---
  solid('tower-barbican-west', [-8.0, -3.8], [0, 8.0], [38, 46]),
  solid('tower-barbican-east', [3.8, 8.0], [0, 8.0], [38, 46]),
  solid('arch-barbican-overhead', [-3.8, 3.8], [4.5, 8.0], [39, 45]),
  solid('wall-inner-curtain-west', [-19.0, -8.0], [0, 5.0], [40, 42]),
  solid('wall-inner-curtain-east', [8.0, 19.0], [0, 5.0], [40, 42]),

  // --- Defender Rear Staging Barricade (split with 3.6m central passage) ---
  solid('cover-def-barricade-w', [-6.0, -1.8], [0, 1.2], [50, 51], { material: 'timber' }),
  solid('cover-def-barricade-e', [1.8, 6.0], [0, 1.2], [50, 51], { material: 'timber' }),
];

// Phase 0 Dynamic Barrier: Breachable timber palisade blocking the Great Breach until Redoubt falls
export const OUTERWORKS_PALISADE_BLOCKER = Object.freeze(
  solid('barrier-outer-palisade', [-3.5, 3.5], [0, 3.2], [1.5, 2.3], { material: 'timber' })
);

// Phase 1 Dynamic Gate: Portcullis closed inside the Barbican Gatehouse
export const OUTERWORKS_PORTCULLIS_BLOCKER = Object.freeze(
  solid('portcullis-inner-gate', [-3.8, 3.8], [0, 4.5], [41.2, 41.8], { material: 'iron' })
);

const SOLIDS_PHASE_0 = Object.freeze([...SOLIDS, OUTERWORKS_PALISADE_BLOCKER, OUTERWORKS_PORTCULLIS_BLOCKER]);
const SOLIDS_PHASE_1 = Object.freeze([...SOLIDS, OUTERWORKS_PORTCULLIS_BLOCKER]);
const SOLIDS_COMPLETED = Object.freeze([...SOLIDS]);

const OBJECTIVES = Object.freeze([
  {
    id: 'forward-redoubt',
    name: 'The Forward Redoubt',
    x: 0,
    y: 0,
    z: -12,
    radius: 7.0,
    verticalBelow: 0.6,
    verticalAbove: 1.8,
    captureSec: 15,
    decayRate: 0.5,
  },
  {
    id: 'barbican-gate',
    name: 'The Barbican Gate',
    x: 0,
    y: 0,
    z: 34,
    radius: 6.5,
    verticalBelow: 0.6,
    verticalAbove: 1.8,
    captureSec: 20,
    decayRate: 0.5,
  },
]);

const SPAWN_POINTS = Object.freeze([
  // Attackers initial staging spawns (Phase 0 - South Staging Camp z: -52)
  spawn(-4, 0, -52, 0, -12, TEAMS.ATTACKERS, 0),
  spawn(0, 0, -52, 0, -12, TEAMS.ATTACKERS, 0),
  spawn(4, 0, -52, 0, -12, TEAMS.ATTACKERS, 0),
  spawn(-2, 0, -50, 0, -12, TEAMS.ATTACKERS, 0),
  spawn(2, 0, -50, 0, -12, TEAMS.ATTACKERS, 0),

  // Attackers forward spawns (Phase 1 - Captured Forward Redoubt z: -9)
  spawn(-3, 0, -9, 0, 34, TEAMS.ATTACKERS, 1),
  spawn(0, 0, -8, 0, 34, TEAMS.ATTACKERS, 1),
  spawn(3, 0, -9, 0, 34, TEAMS.ATTACKERS, 1),
  spawn(-2, 0, -6, 0, 34, TEAMS.ATTACKERS, 1),
  spawn(2, 0, -6, 0, 34, TEAMS.ATTACKERS, 1),

  // Defenders Phase 0 spawns (Forward Redoubt & Bailey defending Redoubt)
  spawn(-3, 0, -4, 0, -12, TEAMS.DEFENDERS, 0),
  spawn(0, 0, -3, 0, -12, TEAMS.DEFENDERS, 0),
  spawn(3, 0, -4, 0, -12, TEAMS.DEFENDERS, 0),
  spawn(21.5, OUTERWORKS_PARAPET_Y, 2, 0, -12, TEAMS.DEFENDERS, 0), // Elevated Parapet defender!
  spawn(-2, 0, 8, 0, -12, TEAMS.DEFENDERS, 0),

  // Defenders Phase 1 spawns (Inner Keep Rear Base z: 52 to 56)
  spawn(-3, 0, 52, 0, 34, TEAMS.DEFENDERS, 1),
  spawn(0, 0, 54, 0, 34, TEAMS.DEFENDERS, 1),
  spawn(3, 0, 52, 0, 34, TEAMS.DEFENDERS, 1),
  spawn(-2, 0, 56, 0, 34, TEAMS.DEFENDERS, 1),
  spawn(2, 0, 56, 0, 34, TEAMS.DEFENDERS, 1),
]);

const NAVIGATION_NODES = Object.freeze([
  // Attacker Camp & Vehicle Staging
  nav('att-camp-center', 0, 0, -52),
  nav('att-camp-west', -6, 0, -50),
  nav('att-camp-east', 6, 0, -50),
  nav('bibye-start', -8, 0, -46),

  // The Great Esplanade (Central Road)
  nav('esplanade-south', 0, 0, -42),
  nav('esplanade-mid', 0, 0, -28),
  nav('esplanade-flank-w', -2.5, 0, -22),
  nav('esplanade-flank-e', 3.5, 0, -22),
  nav('esplanade-north', 0, 0, -18),

  // Western Sally Trench (Infantry Flank Route)
  nav('trench-camp-approach', -12, 0, -47),
  nav('trench-portal', -18, 0, -43),
  nav('trench-south', -21, 0, -35),
  nav('trench-corner-1', -21.5, 0, -30),
  nav('trench-mid', -22.0, 0, -24),
  nav('trench-corner-2', -22.0, 0, -16),
  nav('trench-north', -21, 0, -8),
  nav('trench-exit', -18.8, 0, -2),
  nav('trench-postern', -18.8, 0, 1.8),
  nav('trench-flank-bailey', -15.0, 0, 6),

  // Eastern Elevated Firing Terrace & Ramp
  nav('terrace-ramp-foot', 16, 0, -27),
  nav('terrace-ramp-mid', 16, 0.6, -22),
  nav('terrace-firing-platform', 16, OUTERWORKS_TERRACE_Y, -14),
  nav('terrace-north', 16, OUTERWORKS_TERRACE_Y, -7),

  // Eastern High Parapet (Infantry Catwalk)
  nav('parapet-stairs-foot', 21, OUTERWORKS_TERRACE_Y, -7),
  nav('parapet-stairs-mid', 21, 1.8, -5),
  nav('parapet-south', 21.5, OUTERWORKS_PARAPET_Y, 0),
  nav('parapet-mid', 21.5, OUTERWORKS_PARAPET_Y, 14),
  nav('parapet-north', 21.5, OUTERWORKS_PARAPET_Y, 28),

  // Objective 1: The Forward Redoubt Entries & Center
  nav('redoubt-approach-west', -3.5, 0, -17),
  nav('redoubt-approach-east', 3.5, 0, -17),
  nav('redoubt-west', -4.5, 0, -11),
  nav('redoubt-center', 0, 0, -11),
  nav('redoubt-east', 4.5, 0, -11),
  nav('redoubt-rear', 0, 0, -5),

  // The Great Breach Passage
  nav('breach-south', 0, 0, -2),
  nav('breach-center', 0, 0, 1.8),
  nav('breach-north', 0, 0, 6),

  // The Barbican Courtyard / Inner Bailey
  nav('bailey-south', 0, 0, 12),
  nav('bailey-mid', 0, 0, 20),
  nav('bailey-west', -6, 0, 24),
  nav('bailey-east', 6, 0, 24),
  nav('bailey-north', 0, 0, 28),

  // Objective 2: The Barbican Gatehouse
  nav('gate-approach', 0, 0, 31),
  nav('gate-west', -4, 0, 34),
  nav('gate-center', 0, 0, 34),
  nav('gate-east', 4, 0, 34),
  nav('gate-threshold', 0, 0, 38),
  nav('gate-passage', 0, 0, 44),

  // Defender Rear Base
  nav('def-base-south', 0, 0, 48),
  nav('def-base-west', -4, 0, 54),
  nav('def-base-center', 0, 0, 54),
  nav('def-base-east', 4, 0, 54),
]);

export const OUTERWORKS_TACTICS = Object.freeze({
  getTacticalGoal({ actor, rivalIndex, objectiveState, activeObj, enemies, disengageTarget, nowSec = undefined }) {
    if (objectiveState.index === 0) {
      // Stage 1: The Forward Redoubt
      if (actor.team === TEAMS.ATTACKERS) {
        if (actor.position.z < -10) {
          if (rivalIndex === 1) {
            // Western Sally Trench flank route
            if (actor.position.z < -38) return { x: -21, y: 0, z: -38 };
            if (actor.position.z < -18) return { x: -21, y: 0, z: -18 };
            if (actor.position.z < -4) return { x: -21, y: 0, z: -4 };
            return { x: -14, y: 0, z: 2 };
          }
          if (rivalIndex === 2) {
            // Eastern elevated terrace support
            if (actor.position.z < -25) return { x: 16, y: 0, z: -25 };
            if (actor.position.z < -14) return { x: 16, y: OUTERWORKS_TERRACE_Y, z: -14 };
            return { x: 5, y: 0, z: -12 };
          }
          // Vanguard central assault
          if (actor.position.z < -26) return { x: 0, y: 0, z: -26 };
          return { x: 0, y: 0, z: -12 };
        }
      } else {
        // Defenders holding The Forward Redoubt
        if (objectiveState.attackersCount === 0 && (objectiveState.progress ?? 0) < 0.05) {
          if (rivalIndex === 1) return { x: -4.5, y: 0, z: -10 };
          if (rivalIndex === 2) return { x: 21.5, y: OUTERWORKS_PARAPET_Y, z: 2 }; // Hold high parapet!
          return { x: 0, y: 0, z: -11 };
        }
      }
    } else if (objectiveState.index === 1) {
      // Stage 2: The Barbican Gatehouse
      if (actor.team === TEAMS.ATTACKERS) {
        if (actor.position.z < 28) {
          if (actor.position.z < 6) return { x: 0, y: 0, z: 6 };
          if (rivalIndex === 1) return { x: -6, y: 0, z: 24 };
          if (rivalIndex === 2) return { x: 6, y: 0, z: 24 };
          return { x: 0, y: 0, z: 34 };
        }
      } else {
        // Defenders holding The Barbican Gatehouse
        if (actor.position.z < 24) {
          return { x: 0, y: 0, z: 34 };
        }
        if (objectiveState.attackersCount === 0 && (objectiveState.progress ?? 0) < 0.05) {
          if (rivalIndex === 1) return { x: -4.0, y: 0, z: 34 };
          if (rivalIndex === 2) return { x: 4.0, y: 0, z: 34 };
          return { x: 0, y: 0, z: 34 };
        }
      }
    }
    return null;
  },
});

export const OUTERWORKS_BALLISTA_EMPLACEMENT = Object.freeze({
  id: 'bibye-outerworks-01',
  x: -8.0,
  y: 0,
  z: -46.0,
  baseYaw: Math.PI, // Facing North (+Z) straight down the Great Esplanade
  team: TEAMS.ATTACKERS,
  interactRadius: 3.2,
});

const BASE_OUTERWORKS = Object.freeze({
  id: 'outerworks',
  name: 'The Outerworks',
  floors: FLOORS,
  ramps: RAMPS,
  props: [],
  objectives: OBJECTIVES,
  spawnPoints: SPAWN_POINTS,
  ballistaEmplacement: OUTERWORKS_BALLISTA_EMPLACEMENT,
  navigation: Object.freeze({
    nodes: NAVIGATION_NODES,
  }),
  tactics: OUTERWORKS_TACTICS,
  abyssY: -10,
});

export const OUTERWORKS_CLOSED = Object.freeze({
  ...BASE_OUTERWORKS,
  solids: SOLIDS_PHASE_0,
});

export const OUTERWORKS_PHASE_1 = Object.freeze({
  ...BASE_OUTERWORKS,
  solids: SOLIDS_PHASE_1,
});

export const OUTERWORKS_OPEN = Object.freeze({
  ...BASE_OUTERWORKS,
  solids: SOLIDS_COMPLETED,
});

export function outerworksForObjective(objectiveState, nowSec = undefined) {
  if (!objectiveState) return OUTERWORKS_CLOSED;
  if (objectiveState.completed) return OUTERWORKS_OPEN;
  const index = objectiveState.index ?? 0;
  if (index === 0) return OUTERWORKS_CLOSED;
  if (index === 1) return OUTERWORKS_PHASE_1;
  return OUTERWORKS_OPEN;
}

export const OUTERWORKS = Object.freeze({
  ...OUTERWORKS_OPEN,
  forObjective: outerworksForObjective,
});
