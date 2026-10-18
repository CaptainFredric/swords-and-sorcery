import { propSolids } from './props.mjs';

// Bastion Breach: Prototype battlefield for Breakthrough / Siege team battles.
//
// Layout:
// - Zone 1: Attacker Staging Camp (z: -38 to -26) with rear ramparts and team spawn points.
// - Zone 2: The Exposed Approach (z: -26 to -10): open killzone with low wall and crate cover.
// - Zone 3: Western Flank Route (x: -16 to -8, z: -26 to +6): covered alley partitioned by a stone curtain.
// - Zone 4: The Outer Courtyard (Objective 1, z: -10 to +8): wide contested plaza centered at (0, 0, -2).
// - Zone 5: The Gatehouse Breach & Eastern Gallery (z: +8 to +16): central breach flanked by an elevated ramp/gallery.
// - Zone 6: The High Sanctum (Objective 2, z: +16 to +38): enclosed hall with central dais at (0, 0.3, 25) and pillars.
// - Defender Base (z: +32 to +38): secure staging area behind the Sanctum.

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
  // Raised Dais for Objective 2
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

  solid('wall-west-courtyard', [-16.5, -15.5], [0, 4.5], [-26, 8]),
  solid('wall-east-courtyard', [15.5, 16.5], [0, 4.5], [-26, 8]),

  // --- Western Flank Partition Wall (separates exposed approach from flank alley) ---
  solid('wall-flank-divider-south', [-8.5, -7.8], [0, 2.8], [-26, -12]),
  solid('wall-flank-divider-north', [-8.5, -7.8], [0, 2.8], [-8, 0]),

  // --- Approach Cover (low walls & crates) ---
  solid('cover-camp-barricade', [-3, 3], [0, 1.2], [-28, -27], { material: 'timber' }),
  solid('cover-approach-pillar-left', [-4.5, -3.0], [0, 2.8], [-20, -18]),
  solid('cover-approach-crates-right', [2.5, 4.5], [0, 1.4], [-19, -17], { material: 'timber' }),
  solid('cover-approach-breastwork', [-1.8, 1.8], [0, 0.95], [-14.5, -13.7]),

  // --- Courtyard (Objective 1) Structures & Cover ---
  solid('gate-pillar-left', [-5.5, -3.8], [0, 4.0], [-3.5, -1.5]),
  solid('gate-pillar-right', [3.8, 5.5], [0, 4.0], [-3.5, -1.5]),
  solid('rubble-courtyard-sw', [-6.5, -4.5], [0, 1.1], [3, 4.5]),
  solid('rubble-courtyard-se', [4.5, 6.5], [0, 1.1], [3, 4.5]),

  // --- Breach / Gatehouse Rampart (divides Courtyard and Sanctum) ---
  solid('wall-breach-west', [-16, -3.5], [0, 5.0], [8, 9.8]),
  solid('wall-breach-east', [3.5, 9.5], [0, 5.0], [8, 9.8]),
  // Gallery Outer Balustrade
  solid('gallery-parapet-east', [14.8, 15.5], [BASTION_GALLERY_Y, BASTION_GALLERY_Y + 1.2], [8, 22]),

  // --- Inner Sanctum (Objective 2) Enclosing Walls ---
  solid('wall-sanctum-west', [-15, -14], [0, 5.5], [9.8, 36]),
  solid('wall-sanctum-east', [14, 15], [0, 5.5], [9.8, 36]),
  solid('wall-sanctum-north', [-15, 15], [0, 5.5], [36, 37]),

  // Inner Sanctum Pillars (tighter melee corners)
  solid('pillar-sanctum-sw', [-5.5, -4.0], [0, 4.8], [19.5, 21.0]),
  solid('pillar-sanctum-se', [4.0, 5.5], [0, 4.8], [19.5, 21.0]),
  solid('pillar-sanctum-nw', [-5.5, -4.0], [0, 4.8], [29.0, 30.5]),
  solid('pillar-sanctum-ne', [4.0, 5.5], [0, 4.8], [29.0, 30.5]),

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
    captureSec: 20,
    decayRate: 0.5,
  },
]);

const SPAWN_POINTS = Object.freeze([
  // Attackers initial staging spawns (Phase 0 — South Staging Camp)
  spawn(-4, 0, -33, 0, -2, 'ATTACKERS', 0),
  spawn(0, 0, -34, 0, -2, 'ATTACKERS', 0),
  spawn(4, 0, -33, 0, -2, 'ATTACKERS', 0),
  spawn(-2, 0, -31, 0, -2, 'ATTACKERS', 0),
  spawn(2, 0, -31, 0, -2, 'ATTACKERS', 0),

  // Attackers forward spawns (Phase 1 — Captured Outer Courtyard)
  spawn(-2.5, 0, -1.0, 0, 25, 'ATTACKERS', 1),
  spawn(0, 0, -1.5, 0, 25, 'ATTACKERS', 1),
  spawn(2.5, 0, -1.0, 0, 25, 'ATTACKERS', 1),
  spawn(-2.5, 0, 0.5, 0, 25, 'ATTACKERS', 1),
  spawn(2.5, 0, 0.5, 0, 25, 'ATTACKERS', 1),

  // Defenders Phase 0 spawns (Gatehouse Inner Ward & Gallery — 15m behind Outer Gate)
  spawn(-2.5, 0, 12.5, 0, -2, 'DEFENDERS', 0),
  spawn(0, 0, 13.5, 0, -2, 'DEFENDERS', 0),
  spawn(2.5, 0, 12.5, 0, -2, 'DEFENDERS', 0),
  spawn(-2, 0, 15.0, 0, -2, 'DEFENDERS', 0),
  spawn(11.5, BASTION_GALLERY_Y, 11.0, 0, -2, 'DEFENDERS', 0),

  // Defenders Phase 1 spawns (Sanctum Rear Bastion — defending High Sanctum)
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
  nav('sanctum-west', -5, 0, 25),
  nav('sanctum-center', 0, 0.3, 25),
  nav('sanctum-east', 5, 0, 25),
  nav('sanctum-rear', 0, 0, 30),

  // Defender Base
  nav('def-base-west', -4, 0, 34),
  nav('def-base-center', 0, 0, 34),
  nav('def-base-east', 4, 0, 34),
]);

export const BASTION_BREACH = Object.freeze({
  id: 'bastion-breach',
  name: 'Bastion Breach',
  floors: FLOORS,
  ramps: RAMPS,
  solids: SOLIDS,
  props: [],
  objectives: OBJECTIVES,
  spawnPoints: SPAWN_POINTS,
  navigation: Object.freeze({
    nodes: NAVIGATION_NODES,
  }),
  abyssY: -10,
});
