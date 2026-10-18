import { TEAMS } from '../src/teams.mjs';

// Blackbell Foundry: Medieval industrial foundry and weaponworks for Breakthrough team battles.
//
// Centerpiece: The colossal suspended war bell ("Blackbell").
//
// Layout:
// - Zone 1: Attacker Staging Yard (z: -38 to -26): slag mounds, iron ingots, coal carts.
// - Zone 2: The Chain Yard (Objective 1, z: -26 to +8):
//     * Center Lane: Industrial yard with ingot stacks and winch crane. Objective at (0, 0, -2).
//     * Upper Lane: Elevated scaffolding/gantries along the East (x: 9.5 to 15.5, y: 2.8).
//     * Lower Lane: Maintenance drainage trench / casting sluice along the West (x: -15.5 to -8.5, y: -1.0).
// - Zone 3: Foundry Blast Portal (z: +8 to +16): massive arched iron/brick gateway.
// - Zone 4: The Monumental Furnace Hall (Objective 2, z: +16 to +38):
//     * Elevated Casting Dais at (0, 1.0, 26) directly beneath the suspended Great Bell.
//     * Flanking reverberatory furnace mouths (West) and master anvil workshops (East).
// - Zone 5: Defender Master Forge Staging (z: +32 to +38).

function solid(id, [x0, x1], [y0, y1], [z0, z1], extra = {}) {
  return { id, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0], material: 'iron', ...extra };
}

function floor(id, [x0, x1], [z0, z1], y, material = 'stone', extra = {}) {
  return { id, center: [(x0 + x1) / 2, y - 0.15, (z0 + z1) / 2], size: [x1 - x0, 0.3, z1 - z0], y, material, ...extra };
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

export const FOUNDRY_GANTRY_Y = 2.8;
export const FOUNDRY_TRENCH_Y = -1.0;
export const FOUNDRY_DAIS_Y = 1.0;

const FLOORS = [
  // Attacker Staging Camp
  floor('floor-camp', [-16, 16], [-38, -26], 0, 'stone'),

  // Route 1: Central Yard
  floor('floor-yard-center', [-8.5, 9.5], [-26, 8], 0, 'stone'),

  // Route 2: Lower Maintenance Drainage Trench (West, y = -1.0)
  floor('floor-trench-west', [-15.5, -8.5], [-24, 2], FOUNDRY_TRENCH_Y, 'stone'),

  // Route 3: Upper Gantry Walkway (East, y = 2.8)
  floor('floor-gantry-east', [9.5, 15.5], [-15, 0], FOUNDRY_GANTRY_Y, 'timber'),

  // West Forecourt Connection once Trench rises at z >= 6
  floor('floor-forecourt-west', [-16, -8.5], [6, 8], 0, 'stone'),

  // East Forecourt Connection once Gantry descends at z >= 6
  floor('floor-forecourt-east', [8.5, 16], [6, 8], 0, 'stone'),

  // Foundry Blast Portal Passage
  floor('floor-portal', [-5, 5], [8, 16], 0, 'stone'),

  // Furnace Hall Main Floor (Stage 2)
  floor('floor-furnace-hall', [-16, 16], [16, 36], 0, 'stone'),

  // Furnace Hall Tier 1 Raised Apron
  floor('floor-dais-tier1', [-7.5, 7.5], [20, 32], 0.5, 'stone'),

  // The Great Bell Casting Dais (Objective 2)
  floor('floor-bell-dais', [-5, 5], [22.5, 29.5], FOUNDRY_DAIS_Y, 'stone'),
];

const RAMPS = [
  // West Trench Entry Ramp (descends from camp y:0 to y:-1.0)
  { id: 'ramp-trench-entry', minX: -15.5, maxX: -8.5, minZ: -28, maxZ: -24, startY: 0, endY: FOUNDRY_TRENCH_Y, axis: 'z', steps: true },
  // West Trench Exit Ramp (ascends from trench y:-1.0 to yard y:0)
  { id: 'ramp-trench-exit', minX: -15.5, maxX: -8.5, minZ: 2, maxZ: 6, startY: FOUNDRY_TRENCH_Y, endY: 0, axis: 'z', steps: true },

  // East Gantry Rising Ramp (ascends from yard y:0 to gantry y:2.8)
  { id: 'ramp-gantry-rise', minX: 9.5, maxX: 15.5, minZ: -25, maxZ: -15, startY: 0, endY: FOUNDRY_GANTRY_Y, axis: 'z', steps: true },
  // East Gantry Descent Ramp (descends from gantry y:2.8 to portal forecourt y:0)
  { id: 'ramp-gantry-fall', minX: 9.5, maxX: 15.5, minZ: 0, maxZ: 6, startY: FOUNDRY_GANTRY_Y, endY: 0, axis: 'z', steps: true },

  // South Ramp onto the Great Bell Dais
  { id: 'ramp-bell-south', minX: -3.5, maxX: 3.5, minZ: 17.5, maxZ: 22.5, startY: 0, endY: FOUNDRY_DAIS_Y, axis: 'z', steps: true },
  // North Ramp down from the Great Bell Dais to Defender Base
  { id: 'ramp-bell-north', minX: -3.5, maxX: 3.5, minZ: 29.5, maxZ: 34.5, startY: FOUNDRY_DAIS_Y, endY: 0, axis: 'z', steps: true },
];

const SOLIDS = [
  // --- Boundary Walls ---
  solid('wall-south-camp', [-16.5, 16.5], [0, 4.5], [-38.5, -37.5], { material: 'stone' }),
  solid('wall-west-camp', [-17.0, -15.8], [FOUNDRY_TRENCH_Y, 5.0], [-38, 8], { material: 'stone' }),
  solid('wall-east-camp', [15.8, 17.0], [0, 5.0], [-38, 8], { material: 'stone' }),

  // Dividing Wall / Blast Portal Facade
  solid('wall-portal-west', [-16.5, -4.5], [0, 6.2], [8, 9.8], { material: 'stone' }),
  solid('wall-portal-east', [4.5, 16.5], [0, 6.2], [8, 9.8], { material: 'stone' }),
  solid('arch-portal-lintel', [-4.5, 4.5], [5.0, 6.5], [8.2, 9.6], { material: 'iron' }),

  // Furnace Hall Perimeter Walls
  solid('wall-furnace-west', [-16.5, -15.5], [0, 6.8], [9.8, 36.5], { material: 'stone' }),
  solid('wall-furnace-east', [15.5, 16.5], [0, 6.8], [9.8, 36.5], { material: 'stone' }),
  solid('wall-furnace-north', [-16.5, 16.5], [0, 6.8], [36.5, 37.5], { material: 'stone' }),

  // --- Route Partition: Trench Retaining Wall (separates trench from central yard) ---
  solid('wall-trench-divider-s', [-8.6, -7.9], [FOUNDRY_TRENCH_Y, 1.4], [-24, -10], { material: 'stone' }),
  solid('wall-trench-divider-n', [-8.6, -7.9], [FOUNDRY_TRENCH_Y, 1.4], [-6, 2], { material: 'stone' }),

  // --- Route Partition: Upper Gantry Supports & Balustrade ---
  solid('pillar-gantry-1', [9.0, 9.8], [0, FOUNDRY_GANTRY_Y], [-14, -12], { material: 'iron' }),
  solid('pillar-gantry-2', [9.0, 9.8], [0, FOUNDRY_GANTRY_Y], [-8, -6], { material: 'iron' }),
  solid('pillar-gantry-3', [9.0, 9.8], [0, FOUNDRY_GANTRY_Y], [-2, 0], { material: 'iron' }),
  solid('balustrade-gantry-west', [9.1, 9.6], [FOUNDRY_GANTRY_Y, FOUNDRY_GANTRY_Y + 1.1], [-15, 0], { material: 'iron' }),
  solid('balustrade-gantry-east', [15.4, 15.9], [FOUNDRY_GANTRY_Y, FOUNDRY_GANTRY_Y + 1.1], [-15, 0], { material: 'iron' }),


  // --- Staging Yard & Central Approach Cover ---
  solid('cover-coal-wagon-w', [-7.0, -4.5], [0, 1.35], [-27.5, -26.0], { material: 'timber' }),
  solid('cover-coal-sacks-e', [4.5, 7.0], [0, 1.2], [-27.5, -26.0], { material: 'timber' }),
  solid('cover-ingot-stack-w', [-6.0, -3.5], [0, 1.25], [-19.5, -17.5], { material: 'iron' }),
  solid('cover-ingot-stack-e', [3.5, 6.0], [0, 1.25], [-19.5, -17.5], { material: 'iron' }),
  solid('cover-slag-hopper-w', [-7.5, -5.5], [0, 1.3], [-14.5, -12.5], { material: 'iron' }),
  solid('cover-quenching-bin-e', [5.5, 7.5], [0, 1.3], [-14.5, -12.5], { material: 'timber' }),
  solid('cover-trench-debris', [-14.5, -12.5], [FOUNDRY_TRENCH_Y, FOUNDRY_TRENCH_Y + 0.85], [-15, -13], { material: 'iron' }),

  // --- Chain Yard Winch (Objective 1 Flanking Machinery) ---
  solid('winch-drum-west', [-4.8, -3.2], [0, 3.8], [-3.2, -0.8], { material: 'iron' }),
  solid('winch-drum-east', [3.2, 4.8], [0, 3.8], [-3.2, -0.8], { material: 'iron' }),
  solid('winch-crane-beam', [-4.2, 4.2], [3.2, 3.8], [-2.4, -1.6], { material: 'timber' }),
  solid('rubble-yard-sw', [-6.5, -4.5], [0, 1.1], [3, 4.8], { material: 'stone' }),
  solid('rubble-yard-se', [4.5, 6.5], [0, 1.1], [3, 4.8], { material: 'stone' }),

  // --- Furnace Hall Interiors (Stage 2) ---
  solid('furnace-bay-west', [-15.5, -11.5], [0, 4.8], [21, 31], { material: 'stone' }),
  solid('master-forge-east', [11.5, 15.5], [0, 2.4], [22, 30], { material: 'iron' }),

  solid('pillar-furnace-sw', [-5.8, -4.4], [0, 6.2], [20.5, 22.0], { material: 'stone' }),
  solid('pillar-furnace-se', [4.4, 5.8], [0, 6.2], [20.5, 22.0], { material: 'stone' }),
  solid('pillar-furnace-nw', [-5.8, -4.4], [0, 6.2], [30.0, 31.5], { material: 'stone' }),
  solid('pillar-furnace-ne', [4.4, 5.8], [0, 6.2], [30.0, 31.5], { material: 'stone' }),

  // Rear Master Forge Chimney
  solid('furnace-rear-chimney', [-2.5, 2.5], [0, 3.5], [36.2, 37.2], { material: 'stone' }),
];

const OBJECTIVES = Object.freeze([
  {
    id: 'chain-winch',
    name: 'The Chain Winch',
    x: 0,
    y: 0,
    z: -2,
    radius: 6.0,
    captureSec: 15,
    decayRate: 0.5,
  },
  {
    id: 'blackbell',
    name: 'The Great Bell',
    x: 0,
    y: FOUNDRY_DAIS_Y,
    z: 26,
    radius: 5.5,
    captureSec: 20,
    decayRate: 0.5,
  },
]);

const SPAWN_POINTS = Object.freeze([
  // Attackers Phase 0 - South Staging Camp
  spawn(-4, 0, -33, 0, -2, 'ATTACKERS', 0),
  spawn(0, 0, -34, 0, -2, 'ATTACKERS', 0),
  spawn(4, 0, -33, 0, -2, 'ATTACKERS', 0),
  spawn(-2, 0, -31, 0, -2, 'ATTACKERS', 0),
  spawn(2, 0, -31, 0, -2, 'ATTACKERS', 0),

  // Attackers Phase 1 - Captured Chain Yard Forecourt
  spawn(-2.5, 0, -1.0, 0, 26, 'ATTACKERS', 1),
  spawn(0, 0, -1.5, 0, 26, 'ATTACKERS', 1),
  spawn(2.5, 0, -1.0, 0, 26, 'ATTACKERS', 1),
  spawn(-2.5, 0, 0.5, 0, 26, 'ATTACKERS', 1),
  spawn(2.5, 0, 0.5, 0, 26, 'ATTACKERS', 1),

  // Defenders Phase 0 - Foundry Portal & Gantry Overlook
  spawn(-2.5, 0, 12.5, 0, -2, 'DEFENDERS', 0),
  spawn(0, 0, 13.5, 0, -2, 'DEFENDERS', 0),
  spawn(2.5, 0, 12.5, 0, -2, 'DEFENDERS', 0),
  spawn(-2, 0, 15.0, 0, -2, 'DEFENDERS', 0),
  spawn(12.0, FOUNDRY_GANTRY_Y, -3.0, 0, -2, 'DEFENDERS', 0),


  // Defenders Phase 1 - Rear Master Forge Staging
  spawn(-4, 0, 35.0, 0, 26, 'DEFENDERS', 1),
  spawn(0, 0, 35.0, 0, 26, 'DEFENDERS', 1),
  spawn(4, 0, 35.0, 0, 26, 'DEFENDERS', 1),
  spawn(-2, 0, 35.0, 0, 26, 'DEFENDERS', 1),
  spawn(2, 0, 35.0, 0, 26, 'DEFENDERS', 1),
]);

const NAVIGATION_NODES = Object.freeze([
  // Attacker Camp
  nav('att-camp-center', 0, 0, -32),
  nav('att-camp-west', -5, 0, -30),
  nav('att-camp-east', 5, 0, -30),
  nav('trench-entry', -12, 0, -29),
  nav('gantry-entry', 12.5, 0, -26),

  // Central Approach Lane
  nav('approach-south', 0, 0, -23),
  nav('approach-mid', 0, 0, -16),
  nav('approach-flank-left', -3.0, 0, -13),
  nav('approach-flank-right', 3.0, 0, -13),
  nav('approach-north', 0, 0, -8),

  // West Maintenance Drainage Trench (Lower Lane)
  nav('trench-south', -12, FOUNDRY_TRENCH_Y, -20),
  nav('trench-mid', -12, FOUNDRY_TRENCH_Y, -10),
  nav('trench-north', -12, FOUNDRY_TRENCH_Y, 0),
  nav('trench-exit', -12, 0, 7),

  // East Scaffolding Gantry (Upper Lane)
  nav('gantry-rise', 12.5, 1.4, -20),
  nav('gantry-mid', 12.5, FOUNDRY_GANTRY_Y, -10),
  nav('gantry-north', 12.5, FOUNDRY_GANTRY_Y, 0),
  nav('gantry-fall', 12.5, 1.4, 3),
  nav('gantry-exit', 12.5, 0, 7),


  // Chain Yard (Objective 1)
  nav('yard-west', -6, 0, 0.5),
  nav('yard-center', 0, 0, -2),
  nav('yard-east', 6, 0, 0.5),
  nav('yard-forward', 0, 0, 4),

  // Blast Portal Chokepoint
  nav('portal-south', 0, 0, 7),
  nav('portal-center', 0, 0, 11),
  nav('portal-north', 0, 0, 15),

  // Furnace Hall (Objective 2)
  nav('furnace-entry', 0, 0, 16.5),
  nav('furnace-bay-west', -8.5, 0, 25),
  nav('furnace-aisle-east', 8.5, 0, 25),
  nav('bell-dais-south', 0, 0.5, 20),
  nav('bell-dais-center', 0, FOUNDRY_DAIS_Y, 26),
  nav('bell-dais-north', 0, 0.5, 32),
  nav('furnace-rear', 0, 0, 35),

  // Defender Base
  nav('def-base-west', -4, 0, 35),
  nav('def-base-center', 0, 0, 35),
  nav('def-base-east', 4, 0, 35),
]);


export const BLACKBELL_FOUNDRY_TACTICS = Object.freeze({
  getTacticalGoal({ actor, rivalIndex, objectiveState, activeObj, enemies, disengageTarget }) {
    if (objectiveState.index === 0) {
      // Stage 1: The Chain Winch
      if (actor.team === TEAMS.ATTACKERS) {
        if (actor.position.z < -4) {
          if (rivalIndex === 1) {
            // Lower Maintenance Trench Route
            if (actor.position.z < -22) return { x: -12, y: FOUNDRY_TRENCH_Y, z: -20 };
            if (actor.position.z < -8) return { x: -12, y: FOUNDRY_TRENCH_Y, z: -8 };
            if (actor.position.z < 2) return { x: -12, y: 0, z: 3 };
            return { x: -4.5, y: 0, z: -1.0 };
          }
          if (rivalIndex === 2) {
            // Upper Scaffolding Gantry Route
            if (actor.position.z < -16) return { x: 12.5, y: FOUNDRY_GANTRY_Y, z: -16 };
            if (actor.position.z < 0) return { x: 12.5, y: FOUNDRY_GANTRY_Y, z: 0 };
            return { x: 4.5, y: 0, z: -1.0 };
          }
          // Central Industrial Yard Lane
          if (actor.position.z < -16) return { x: 0, y: 0, z: -16 };
          return { x: 0, y: 0, z: -2.0 };
        }
      } else {
        // Defenders holding the Winch Yard
        if (objectiveState.attackersCount === 0 && (objectiveState.progress ?? 0) < 0.05) {
          if (rivalIndex === 1) return { x: -5.0, y: 0, z: 0.5 };
          if (rivalIndex === 2) return { x: 5.0, y: 0, z: 0.5 };
          return { x: 0, y: 0, z: -1.0 };
        }
      }
    } else if (objectiveState.index === 1) {
      // Stage 2: The Great Bell
      if (actor.team === TEAMS.DEFENDERS) {
        const outsideFurnace = actor.position.z < 16;
        if (outsideFurnace) {
          const immediateThreat = enemies.some((e) => {
            const dx = actor.position.x - e.position.x;
            const dz = actor.position.z - e.position.z;
            return Math.hypot(dx, dz) <= 2.5 && e.attackActive;
          });
          if (!immediateThreat) {
            disengageTarget?.();
          }
          return { x: rivalIndex === 1 ? -4.5 : rivalIndex === 2 ? 4.5 : 0, y: FOUNDRY_DAIS_Y, z: 26 };
        }
        if (objectiveState.attackersCount === 0 && (objectiveState.progress ?? 0) < 0.05) {
          if (rivalIndex === 1) return { x: -4.8, y: FOUNDRY_DAIS_Y, z: 26.0 };
          if (rivalIndex === 2) return { x: 0, y: 0, z: 32.5 };
          return { x: 0, y: FOUNDRY_DAIS_Y, z: 26.0 };
        }
      } else if (actor.position.z < 20) {
        if (rivalIndex === 1) return { x: -4.5, y: 0, z: 22.0 };
        if (rivalIndex === 2) return { x: 4.5, y: 0, z: 22.0 };
        return { x: 0, y: FOUNDRY_DAIS_Y, z: 26.0 };
      }
    }
    return null;
  },
});

export const BLACKBELL_FOUNDRY = Object.freeze({
  id: 'blackbell-foundry',
  name: 'Blackbell Foundry',
  floors: FLOORS,
  ramps: RAMPS,
  solids: SOLIDS,
  props: [],
  objectives: OBJECTIVES,
  spawnPoints: SPAWN_POINTS,
  navigation: Object.freeze({
    nodes: NAVIGATION_NODES,
  }),
  tactics: BLACKBELL_FOUNDRY_TACTICS,
  abyssY: -10,
});
