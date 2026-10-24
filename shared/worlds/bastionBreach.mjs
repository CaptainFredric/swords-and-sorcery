import { propSolids } from './props.mjs';
import { TEAMS } from '../src/teams.mjs';

// Bastion Breach: Formidable medieval fortress for Breakthrough team battles.
//
// Layout:
// - Zone 1: Attacker Staging Camp (z: -38 to -26) with siege mantlets, pavises, and team spawns.
// - Zone 2: The Exposed Approach (z: -26 to -10): open killzone with low wall, crate cover, and palisades.
// - Zone 3: Western Flank Route (x: -16 to -8, z: -26 to +6): covered alley partitioned by a stone curtain.
// - Zone 4: The Outer Courtyard (Objective 1, z: -10 to +8): wide contested plaza centered at (0, 0, -2).
// - Zone 5: The Gatehouse Breach & Eastern Gallery (z: +8 to +16): massive gatehouse breach flanked by an elevated ramp/gallery.
// - Zone 6: The High Sanctum (Objective 2, z: +16 to +38): vaulted military chapel with ceremonial dais at (0, 0.3, 25), effigies, and side aisles.
// - Defender Base (z: +32 to +38): secure staging area behind the Sanctum altar.

function solid(id, [x0, x1], [y0, y1], [z0, z1], extra = {}) {
  return { id, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0], material: 'stone', ...extra };
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

export const BASTION_GALLERY_Y = 2.5;

const FLOORS = [
  // Attacker Camp & Approach
  floor('floor-camp', [-15, 15], [-38, -26], 0, 'stone'),
  floor('floor-approach', [-8, 8], [-26, -10], 0, 'stone'),
  // The east side is bounded by a wall but was missing its ground tile, exposing the sky/abyss while moving.
  // Keep this separate from the central approach so the intended lane geometry remains explicit.
  floor('floor-approach-east', [8, 15.5], [-26, -10], 0, 'stone'),

  // Flank West Route
  floor('floor-flank-west', [-16, -8], [-26, 6], 0, 'stone'),

  // Outer Courtyard (Objective 1)
  floor('floor-courtyard', [-16, 16], [-10, 8], 0, 'stone'),

  // Eastern Elevated Gallery
  floor('floor-east-gallery', [9, 15], [8, 22], BASTION_GALLERY_Y, 'stone'),

  // Gate Passage & Sanctum Entrance
  floor('floor-breach', [-4, 4], [8, 16], 0, 'stone'),

  // Inner Sanctum (Objective 2)
  floor('floor-sanctum', [-14, 14], [16, 36], 0, 'stone'),
  // Tiered Ceremonial Dais for Objective 2
  floor('step-sanctum', [-6.5, 6.5], [19.5, 30.5], 0.15, 'stone'),
  floor('dais-sanctum', [-4, 4], [22, 28], 0.3, 'stone'),
];

const RAMPS = [
  // East Flank Ramp rising from Courtyard up to the Gallery
  { id: 'ramp-east-gallery', minX: 10, maxX: 13.5, minZ: -1, maxZ: 8, startY: 0, endY: BASTION_GALLERY_Y, axis: 'z', steps: true },
];

const SOLIDS = [
  // --- Outer Boundary Walls ---
  solid('wall-south-camp', [-16, 16], [0, 4.5], [-38.5, -37.5]),
  solid('wall-west-camp', [-16.5, -15.5], [0, 3.5], [-38, -26]),
  solid('wall-east-camp', [15.5, 16.5], [0, 3.5], [-38, -26]),

  // Exterior Buttresses (silhouette and structural depth)
  solid('buttress-west-camp', [-16.5, -15.0], [0, 4.2], [-33, -31]),
  solid('buttress-east-camp', [15.0, 16.5], [0, 4.2], [-33, -31]),

  solid('wall-west-courtyard', [-16.5, -15.5], [0, 4.5], [-26, 8]),
  solid('wall-east-courtyard', [15.5, 16.5], [0, 4.5], [-26, 8]),
  solid('buttress-west-courtyard', [-16.5, -15.0], [0, 5.0], [-1, 1]),
  solid('buttress-east-courtyard', [15.0, 16.5], [0, 5.0], [-1, 1]),

  // --- Western Flank Partition Wall (separates exposed approach from flank alley) ---
  solid('wall-flank-divider-south', [-8.5, -7.8], [0, 2.8], [-26, -12]),
  solid('wall-flank-divider-north', [-8.5, -7.8], [0, 2.8], [-8, 0]),
  solid('rubble-flank-west', [-14.5, -12.5], [0, 0.9], [-16, -14]),

  // --- Approach Cover (pavises, barricades, crates, breastwork) ---
  solid('cover-camp-barricade', [-3, 3], [0, 1.2], [-28, -27], { material: 'timber' }),
  solid('cover-camp-pavise', [-7.0, -5.0], [0, 1.4], [-27.5, -26.5], { material: 'timber' }),
  solid('cover-approach-pillar-left', [-4.5, -3.0], [0, 2.8], [-20, -18]),
  solid('cover-approach-crates-right', [2.5, 4.5], [0, 1.4], [-19, -17], { material: 'timber' }),
  solid('cover-approach-breastwork', [-2.9, 2.9], [0, 2.35], [-14.5, -13.7], { material: 'timber' }),

  // --- Barbican Gatehouse (Objective 1) Defensive Bulwarks ---
  solid('tower-barbican-west', [-6.0, -3.8], [0, 5.8], [-3.5, -0.5]),
  solid('tower-barbican-east', [3.8, 6.0], [0, 5.8], [-3.5, -0.5]),
  solid('arch-barbican-overhead', [-3.8, 3.8], [4.6, 5.8], [-2.6, -1.4]),
  solid('breastwork-barbican-west', [-8.5, -6.0], [0, 1.2], [-2.5, -1.5]),
  solid('breastwork-barbican-east', [6.0, 8.5], [0, 1.2], [-2.5, -1.5]),
  solid('rubble-courtyard-sw', [-6.5, -4.5], [0, 1.1], [3, 4.5]),
  solid('rubble-courtyard-se', [4.5, 6.5], [0, 1.1], [3, 4.5]),
  solid('wreckage-courtyard-mid', [-1.5, 1.5], [0, 1.1], [-6.5, -5.2], { material: 'timber' }),

  // --- Breach / Curtain Walls (seamlessly meeting gatehouse at x = -7.575 and x = +7.575) ---
  solid('wall-breach-west-outer', [-16, -13.0], [0, 5.5], [8, 9.8]),
  solid('wall-construction-footing', [-13.0, -10.0], [0, 0.95], [8.0, 9.8]),
  solid('wall-construction-hoarding', [-13.0, -10.0], [0.95, 3.2], [8.5, 9.3], { material: 'timber' }),
  solid('wall-breach-west-inner', [-10.0, -7.575], [0, 5.5], [8, 9.8]),
  solid('wall-breach-east', [7.575, 9.5], [0, 5.5], [8, 9.8]),

  // --- The Honorable Entry Gatehouse (Authored Argon Model at z = +8.8) ---
  // Left Tower Front Buttress (Static, Always active)
  solid('gatehouse-buttress-west', [-7.575, -3.500], [0.000, 8.636], [4.341, 7.000]),
  // Left Tower & Inner Arch Jamb (Static, Always active)
  solid('gatehouse-tower-west', [-7.575, -1.696], [0.000, 8.636], [7.000, 11.280]),
  // Right Tower Front Buttress (Static, Always active)
  solid('gatehouse-buttress-east', [3.500, 7.575], [0.000, 8.636], [4.341, 7.000]),
  // Right Tower & Inner Arch Jamb (Static, Always active)
  solid('gatehouse-tower-east', [1.696, 7.575], [0.000, 8.636], [7.000, 11.280]),
  // Upper Arch Wall & Winch Housing (Static, Always active, overhead clearance Y = 3.940m)
  solid('gatehouse-arch-overhead', [-1.696, 1.696], [3.940, 8.636], [7.000, 10.600]),

  // Gallery Parapets
  solid('gallery-parapet-east', [14.8, 15.5], [BASTION_GALLERY_Y, BASTION_GALLERY_Y + 1.2], [8, 22]),
  solid('gallery-parapet-west', [8.8, 9.4], [BASTION_GALLERY_Y, BASTION_GALLERY_Y + 1.1], [9, 15]),

  // --- Inner Sanctum (Objective 2) Enclosing Walls & Military Chapel ---
  solid('wall-sanctum-west', [-15, -14], [0, 6.0], [9.8, 36]),
  solid('wall-sanctum-east', [14, 15], [0, 6.0], [9.8, 36]),
  solid('wall-sanctum-north', [-15, 15], [0, 6.0], [36, 37]),

  // Vaulted Chapel Nave Pillars
  solid('pillar-sanctum-sw', [-5.5, -4.0], [0, 5.5], [19.5, 21.0]),
  solid('pillar-sanctum-se', [4.0, 5.5], [0, 5.5], [19.5, 21.0]),
  solid('pillar-sanctum-nw', [-5.5, -4.0], [0, 5.5], [29.0, 30.5]),
  solid('pillar-sanctum-ne', [4.0, 5.5], [0, 5.5], [29.0, 30.5]),

  // Stone Knight Effigies (sarcophagi in side aisles providing tactical cover)
  solid('effigy-sanctum-sw', [-10.5, -8.5], [0, 1.1], [22.5, 25.5]),
  solid('effigy-sanctum-se', [8.5, 10.5], [0, 1.1], [22.5, 25.5]),

  // Rear Reredos Altar & Staging Wall
  solid('sanctum-altar', [-3.0, 3.0], [0, 2.2], [35.5, 36.5]),

  // Defender Rear Barricade
  solid('cover-defender-barricade', [-2.5, 2.5], [0, 1.2], [31.0, 31.8], { material: 'timber' }),
];


const OBJECTIVES = Object.freeze([
  {
    id: 'outer-gate',
    name: 'The Outer Gate',
    x: 0,
    y: 0,
    z: -2,
    radius: 6.0,
    verticalBelow: 0.6,
    verticalAbove: 1.8,
    captureSec: 15,
    decayRate: 0.5,
  },
  {
    id: 'high-sanctum',
    name: 'The High Sanctum',
    x: 0,
    y: 0.3,
    z: 25,
    radius: 5.5,
    verticalBelow: 0.6,
    verticalAbove: 1.8,
    captureSec: 20,
    decayRate: 0.5,
  },
]);

const SPAWN_POINTS = Object.freeze([
  // Attackers initial staging spawns (Phase 0 - South Staging Camp)
  spawn(-4, 0, -33, 0, -2, 'ATTACKERS', 0),
  spawn(0, 0, -34, 0, -2, 'ATTACKERS', 0),
  spawn(4, 0, -33, 0, -2, 'ATTACKERS', 0),
  spawn(-2, 0, -31, 0, -2, 'ATTACKERS', 0),
  spawn(2, 0, -31, 0, -2, 'ATTACKERS', 0),

  // Attackers forward spawns (Phase 1 - Captured Outer Courtyard)
  spawn(-2.5, 0, -1.0, 0, 25, 'ATTACKERS', 1),
  spawn(0, 0, -1.5, 0, 25, 'ATTACKERS', 1),
  spawn(2.5, 0, -1.0, 0, 25, 'ATTACKERS', 1),
  spawn(-2.5, 0, 0.5, 0, 25, 'ATTACKERS', 1),
  spawn(2.5, 0, 0.5, 0, 25, 'ATTACKERS', 1),

  // Defenders Phase 0 spawns (Outer Courtyard & Gallery ramp defending Outer Gate)
  // Defenders Phase 0 spawns (Outer Courtyard & Gallery ramp defending Outer Gate)
  // Positioned > 6.0m from Objective 1 center (0, 0, -2) outside the capture zone,
  // clear of stepped gatehouse buttresses (X in [-3.5, 3.5] clear central bay).
  spawn(-2.8, 0, 5.0, 0, -2, 'DEFENDERS', 0),
  spawn(0, 0, 5.5, 0, -2, 'DEFENDERS', 0),
  spawn(2.8, 0, 5.0, 0, -2, 'DEFENDERS', 0),
  spawn(-1.5, 0, 5.2, 0, -2, 'DEFENDERS', 0),
  spawn(11.5, 1.25, 3.5, 0, -2, 'DEFENDERS', 0),

  // Defenders Phase 1 spawns (Sanctum Rear Bastion - defending High Sanctum)
  spawn(-4, 0, 33.5, 0, 25, 'DEFENDERS', 1),
  spawn(0, 0, 34.2, 0, 25, 'DEFENDERS', 1),
  spawn(4, 0, 33.5, 0, 25, 'DEFENDERS', 1),
  spawn(-2, 0, 32.8, 0, 25, 'DEFENDERS', 1),
  spawn(2, 0, 32.8, 0, 25, 'DEFENDERS', 1),
]);

const NAVIGATION_NODES = Object.freeze([
  // Attacker Camp
  nav('att-camp-center', 0, 0, -32),
  nav('att-camp-west', -5, 0, -30),
  nav('att-camp-east', 5, 0, -30),
  nav('flank-entry', -12, 0, -28),

  // Exposed Approach
  nav('approach-south', 0, 0, -24),
  nav('approach-mid', 0, 0, -17),
  nav('approach-flank-left', -3.5, 0, -14),
  nav('approach-flank-right', 3.5, 0, -14),
  nav('approach-north', 0, 0, -11),
  nav('barricade-east-south', 3.7, 0, -16),
  nav('barricade-east-north', 3.7, 0, -11),
  nav('barricade-west-north', -3.7, 0, -11),

  // West Flank Route
  nav('flank-south', -12, 0, -22),
  nav('flank-mid', -12, 0, -12),
  nav('flank-exit', -12, 0, 2),

  // Outer Courtyard (Objective 1)
  nav('courtyard-west', -6, 0, 0.5),
  nav('courtyard-center', 0, 0, -2),
  nav('courtyard-east', 6, 0, 0.5),
  nav('courtyard-forward', 0, 0, 4),

  // Gatehouse Breach Chokepoint
  nav('breach-south', 0, 0, 7),
  nav('breach-center', 0, 0, 11),
  nav('breach-north', 0, 0, 15),

  // East Flank Gallery
  nav('ramp-foot', 11.5, 0, 0),
  nav('ramp-mid', 11.5, 1.25, 4),
  nav('gallery-mid', 11.5, BASTION_GALLERY_Y, 12),
  nav('gallery-end', 11.5, BASTION_GALLERY_Y, 18),

  // Inner Sanctum (Objective 2)
  nav('sanctum-entry', 0, 0, 18),
  nav('sanctum-aisle-w', -7.5, 0, 24),
  nav('sanctum-west', -5, 0, 25),
  nav('sanctum-center', 0, 0.3, 25),
  nav('sanctum-east', 5, 0, 25),
  nav('sanctum-aisle-e', 7.5, 0, 24),
  nav('sanctum-rear', 0, 0, 30),

  // Defender Base
  nav('def-base-west', -4, 0, 34),
  nav('def-base-center', 0, 0, 34),
  nav('def-base-east', 4, 0, 34),
]);

export const BASTION_BREACH_TACTICS = Object.freeze({
  getTacticalGoal({ actor, rivalIndex, objectiveState, activeObj, enemies, disengageTarget, nowSec = undefined }) {
    if (objectiveState.index === 0) {
      // Stage 1: Outer Gate
      if (actor.team === TEAMS.ATTACKERS) {
        if (actor.position.z < -4) {
          if (rivalIndex === 1) {
            // West Flank Route
            if (actor.position.z < -22) return { x: -12, y: 0, z: -22 };
            if (actor.position.z < -10) return { x: -12, y: 0, z: -10 };
            if (actor.position.z < 1) return { x: -12, y: 0, z: 2 };
            return { x: -4.5, y: 0, z: -1.0 };
          }
          if (rivalIndex === 2) {
            // Eastern approach lane
            if (actor.position.z < -14) return { x: 3.5, y: 0, z: -14 };
            if (actor.position.z < -2) return { x: 5.5, y: 0, z: 0.5 };
            return { x: 4.0, y: 0, z: -1.0 };
          }
          // Central Vanguard lane
          if (actor.position.z < -16) return { x: 0, y: 0, z: -16 };
          return { x: 0, y: 0, z: -2.0 };
        }
      } else {
        // Defenders holding the Outer Gate
        if (objectiveState.attackersCount === 0 && (objectiveState.progress ?? 0) < 0.05) {
          if (rivalIndex === 1) return { x: -5.5, y: 0, z: 0.5 };
          if (rivalIndex === 2) return { x: 5.5, y: 0, z: 0.5 };
          return { x: 0, y: 0, z: -1.0 };
        }
      }
    } else if (objectiveState.index === 1) {
      // Stage 2: High Sanctum
      const capturedAt = objectiveState.lastCapturedAt;
      const isGateOpening = Number.isFinite(capturedAt) && Number.isFinite(nowSec) && nowSec < capturedAt + BASTION_GATE_OPEN_DURATION_SEC;

      if (isGateOpening) {
        // While gate is actively opening (~1.2s ceremony), bots hold their respective sides of the threshold
        if (actor.team === TEAMS.ATTACKERS) {
          if (actor.position.z < 5.5) {
            return { x: rivalIndex === 1 ? -3.0 : rivalIndex === 2 ? 3.0 : 0, y: 0, z: 5.5 };
          }
          return { x: actor.position.x, y: 0, z: actor.position.z };
        } else {
          if (actor.position.z < 8.5) {
            return { x: rivalIndex === 1 ? -4.5 : rivalIndex === 2 ? 4.5 : 0, y: 0, z: 5.0 };
          }
          return { x: rivalIndex === 1 ? -4.5 : rivalIndex === 2 ? 4.5 : 0, y: 0.3, z: 25.0 };
        }
      }

      if (actor.team === TEAMS.DEFENDERS) {
        const outsideSanctum = actor.position.z < 16;
        if (outsideSanctum) {
          const immediateThreat = enemies.some((e) => {
            const dx = actor.position.x - e.position.x;
            const dz = actor.position.z - e.position.z;
            return Math.hypot(dx, dz) <= 2.5 && e.attackActive;
          });
          if (!immediateThreat) {
            disengageTarget?.();
          }
          return { x: rivalIndex === 1 ? -4.5 : rivalIndex === 2 ? 4.5 : 0, y: 0.3, z: 25 };
        }
        if (objectiveState.attackersCount === 0 && (objectiveState.progress ?? 0) < 0.05) {
          if (rivalIndex === 1) return { x: -4.8, y: 0, z: 25.0 };
          if (rivalIndex === 2) return { x: 0, y: 0, z: 30.5 };
          return { x: 0, y: 0.3, z: 25.0 };
        }
      } else if (actor.position.z < 20) {
        if (rivalIndex === 1) return { x: -4.5, y: 0, z: 22.0 };
        if (rivalIndex === 2) return { x: 4.5, y: 0, z: 22.0 };
        return { x: 0, y: 0.3, z: 25.0 };
      }
    }
    return null;
  },
});

export const BASTION_GATE_OPEN_DURATION_SEC = 1.2;

export const BASTION_GATE_BLOCKER = Object.freeze(
  solid('gatehouse-honorable-gate-closed', [-1.696, 1.696], [0.000, 3.940], [8.550, 9.100], { material: 'iron' })
);

export const BASTION_GATE_DOOR_BUMPERS = Object.freeze([
  solid('gatehouse-door-bumper-west', [-1.696, -1.544], [0.000, 2.900], [9.040, 10.640], { material: 'timber' }),
  solid('gatehouse-door-bumper-east', [1.544, 1.696], [0.000, 2.900], [9.040, 10.640], { material: 'timber' }),
]);

const SOLIDS_CLOSED = Object.freeze([...SOLIDS, BASTION_GATE_BLOCKER]);
const SOLIDS_OPEN = Object.freeze([...SOLIDS, ...BASTION_GATE_DOOR_BUMPERS]);

const BASE_BASTION_BREACH = Object.freeze({
  id: 'bastion-breach',
  name: 'Bastion Breach',
  floors: FLOORS,
  ramps: RAMPS,
  props: [],
  objectives: OBJECTIVES,
  structures: Object.freeze([
    { id: 'assault-barricade', name: 'Reinforced assault barricade', solidIds: ['cover-approach-breastwork'], profile: 'reinforcedTimber', team: TEAMS.DEFENDERS },
    { id: 'approach-screen', name: 'Supply screen', solidIds: ['cover-approach-crates-right'], profile: 'timber', team: TEAMS.DEFENDERS },
    { id: 'sanctum-barricade', name: 'Sanctum rear barricade', solidIds: ['cover-defender-barricade'], profile: 'reinforcedTimber', team: TEAMS.DEFENDERS },
  ]),
  siegeEmplacements: Object.freeze([
    { id: 'approach-ram', type: 'so-fist-ication', team: TEAMS.ATTACKERS, phases: [0, 1], x: 0, y: 0, z: -23, heading: Math.PI },
  ]),
  spawnPoints: SPAWN_POINTS,
  navigation: Object.freeze({
    nodes: NAVIGATION_NODES,
  }),
  tactics: BASTION_BREACH_TACTICS,
  abyssY: -10,
});

export const BASTION_BREACH_CLOSED = Object.freeze({
  ...BASE_BASTION_BREACH,
  solids: SOLIDS_CLOSED,
});

export const BASTION_BREACH_OPEN = Object.freeze({
  ...BASE_BASTION_BREACH,
  solids: SOLIDS_OPEN,
});

export function bastionBreachForObjective(objectiveState, nowSec = undefined) {
  if (!objectiveState) return BASTION_BREACH_CLOSED;
  if (objectiveState.completed) return BASTION_BREACH_OPEN;
  const index = objectiveState.index ?? 0;
  if (index === 0) return BASTION_BREACH_CLOSED;
  if (index > 1) return BASTION_BREACH_OPEN;
  // Stage 2: index === 1 (The High Sanctum)
  const capturedAt = objectiveState.lastCapturedAt;
  if (Number.isFinite(capturedAt) && Number.isFinite(nowSec)) {
    return nowSec >= capturedAt + BASTION_GATE_OPEN_DURATION_SEC
      ? BASTION_BREACH_OPEN
      : BASTION_BREACH_CLOSED;
  }
  return BASTION_BREACH_OPEN;
}

export const BASTION_BREACH = BASTION_BREACH_OPEN;

