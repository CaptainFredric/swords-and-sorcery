// The Court of Merit: an imposing judicial amphitheater constructed for the
// solemn, pompous public judgment of martial merit by the Rightful Renowner.
//
// Layout:
//   - Central Trial Circle (diameter 24m) paved with brass compass inlays.
//   - North High Tribunal: tiered dais where the Rightful Renowner sits in judgment,
//     flanked by the ceremonial coin hopper and dispense tray.
//   - Colonnaded gallery with spectator tiers along the perimeter.
//   - Four arched wave entrances (West Sally, East Sally, South Grand Portal, North Sally).
//   - Fluted stone pillars and judicial balustrades providing tactical cover.

function solid(id, [x0, x1], [y0, y1], [z0, z1], extra = {}) {
  return {
    id,
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    size: [x1 - x0, y1 - y0, z1 - z0],
    material: 'stone',
    ...extra,
  };
}

function floor(id, [x0, x1], [z0, z1], y, material = 'stone', extra = {}) {
  return {
    id,
    center: [(x0 + x1) / 2, y - 0.15, (z0 + z1) / 2],
    size: [x1 - x0, 0.3, z1 - z0],
    y,
    material,
    ...extra,
  };
}

function yawToward(x, z, targetX, targetZ) {
  return Math.atan2(x - targetX, z - targetZ);
}

function spawn(x, y, z, targetX = 0, targetZ = 0) {
  return { x, y, z, yaw: yawToward(x, z, targetX, targetZ) };
}

function nav(id, x, y, z) {
  return Object.freeze({ id, x, y, z });
}

export const COURT_GALLERY_Y = 1.8;
export const TRIBUNAL_Y = 0.8;
export const TRIBUNAL_SEAT_Y = 1.4;

const FLOORS = [
  // Central Trial Arena floor
  floor('court-arena', [-18, 18], [-18, 12], 0, 'stone'),
  // West & East Sally alcoves
  floor('court-sally-west', [-23, -18], [-3.5, 3.5], 0, 'stone'),
  floor('court-sally-east', [18, 23], [-3.5, 3.5], 0, 'stone'),
  floor('court-portal-south', [-4, 4], [-23, -18], 0, 'stone'),
  // North Tribunal Dais
  floor('tribunal-dais', [-7.5, 7.5], [12, 17.5], TRIBUNAL_Y, 'stone'),
  floor('tribunal-seat-floor', [-4.5, 4.5], [14.5, 17.5], TRIBUNAL_SEAT_Y, 'stone'),
  // Spectator Colonnade Galleries
  floor('gallery-west', [-24, -18], [-18, 18], COURT_GALLERY_Y, 'stone'),
  floor('gallery-east', [18, 24], [-18, 18], COURT_GALLERY_Y, 'stone'),
  floor('gallery-south', [-18, 18], [-24, -18], COURT_GALLERY_Y, 'stone'),
];

const RAMPS = [
  // Steps to Tribunal Dais
  { id: 'tribunal-steps', minX: -3.5, maxX: 3.5, minZ: 10.5, maxZ: 12.0, startY: 0, endY: TRIBUNAL_Y, axis: 'z', steps: true },
  { id: 'tribunal-seat-steps', minX: -2.0, maxX: 2.0, minZ: 13.5, maxZ: 14.5, startY: TRIBUNAL_Y, endY: TRIBUNAL_SEAT_Y, axis: 'z', steps: true },
  // Gallery ascent ramps
  { id: 'west-gallery-stair', minX: -18.0, maxX: -16.0, minZ: -3.0, maxZ: 3.0, startY: COURT_GALLERY_Y, endY: 0, axis: 'x', steps: true },
  { id: 'east-gallery-stair', minX: 16.0, maxX: 18.0, minZ: -3.0, maxZ: 3.0, startY: 0, endY: COURT_GALLERY_Y, axis: 'x', steps: true },
];

const SOLIDS = [
  // Outer Amphitheater Enclosure
  solid('north-curtain', [-24.5, 24.5], [0, 6.5], [17.5, 18.5], { kind: 'curtain' }),
  solid('south-curtain', [-24.5, 24.5], [0, 5.0], [-24.5, -23.5], { kind: 'curtain' }),
  solid('west-curtain', [-24.5, -23.5], [0, 5.0], [-24.5, 18.5], { kind: 'curtain' }),
  solid('east-curtain', [23.5, 24.5], [0, 5.0], [-24.5, 18.5], { kind: 'curtain' }),

  // Sally Gateway Piers
  solid('west-sally-north', [-24, -18], [0, 4.0], [3.5, 4.5]),
  solid('west-sally-south', [-24, -18], [0, 4.0], [-4.5, -3.5]),
  solid('east-sally-north', [18, 24], [0, 4.0], [3.5, 4.5]),
  solid('east-sally-south', [18, 24], [0, 4.0], [-4.5, -3.5]),
  solid('south-portal-west', [-18, -4], [0, 4.0], [-19, -18]),
  solid('south-portal-east', [4, 18], [0, 4.0], [-19, -18]),

  // Grand Colonnade Pillars for Arena Cover
  solid('pillar-nw', [-9.0, -7.0], [0, 5.5], [5.0, 7.0], { kind: 'pillar' }),
  solid('pillar-ne', [7.0, 9.0], [0, 5.5], [5.0, 7.0], { kind: 'pillar' }),
  solid('pillar-sw', [-9.0, -7.0], [0, 5.5], [-7.0, -5.0], { kind: 'pillar' }),
  solid('pillar-se', [7.0, 9.0], [0, 5.5], [-7.0, -5.0], { kind: 'pillar' }),

  // Tribunal Base and Balustrades
  solid('tribunal-base-west', [-7.5, -3.5], [0, TRIBUNAL_Y], [12, 17.5]),
  solid('tribunal-base-east', [3.5, 7.5], [0, TRIBUNAL_Y], [12, 17.5]),
  solid('tribunal-balustrade-left', [-7.4, -6.8], [TRIBUNAL_Y, TRIBUNAL_Y + 0.9], [12, 17.5], { kind: 'balustrade', material: 'brass' }),
  solid('tribunal-balustrade-right', [6.8, 7.4], [TRIBUNAL_Y, TRIBUNAL_Y + 0.9], [12, 17.5], { kind: 'balustrade', material: 'brass' }),

  // Gallery Parapets
  solid('gallery-parapet-west', [-18.2, -17.8], [COURT_GALLERY_Y, COURT_GALLERY_Y + 0.9], [-18, 18], { kind: 'balustrade' }),
  solid('gallery-parapet-east', [17.8, 18.2], [COURT_GALLERY_Y, COURT_GALLERY_Y + 0.9], [-18, 18], { kind: 'balustrade' }),

  // The Rightful Renowner Judgment Effigy & Podium
  solid('renowner-tribunal-podium', [-2.2, 2.2], [TRIBUNAL_SEAT_Y, TRIBUNAL_SEAT_Y + 0.6], [15.2, 17.2], { kind: 'podium', material: 'brass' }),
  solid('renowner-tribunal-body', [-1.4, 1.4], [TRIBUNAL_SEAT_Y + 0.6, TRIBUNAL_SEAT_Y + 4.2], [15.4, 17.0], { kind: 'renowner-body', material: 'iron' }),

  // Ceremonial Braziers
  solid('tribunal-brazier-left', [-4.0, -3.2], [TRIBUNAL_Y, TRIBUNAL_Y + 1.2], [12.4, 13.2], { kind: 'brazier' }),
  solid('tribunal-brazier-right', [3.2, 4.0], [TRIBUNAL_Y, TRIBUNAL_Y + 1.2], [12.4, 13.2], { kind: 'brazier' }),
  solid('arena-brazier-south', [-0.5, 0.5], [0, 1.2], [-11.5, -10.5], { kind: 'brazier' }),
];

export const COURT_OF_MERIT = Object.freeze({
  id: 'court-of-merit',
  name: 'The Court of Merit',
  floors: FLOORS,
  ramps: RAMPS,
  solids: SOLIDS,
  props: [],
  spawnPoints: [
    // 0: Human Spellblade player spawn (center south facing tribunal)
    spawn(0, 0, -5, 0, 16),
    // 1: West Sally wave entrance
    spawn(-15, 0, 0, 0, 0),
    // 2: East Sally wave entrance
    spawn(15, 0, 0, 0, 0),
    // 3: South Grand Portal wave entrance
    spawn(0, 0, -14, 0, 0),
    // 4: North Sally / Dais approach
    spawn(0, 0, 7, 0, -5),
    // 5-9: Flank skirmish spawns
    spawn(-6, 0, 2, 6, 2),
    spawn(6, 0, 2, -6, 2),
    spawn(-7, 0, -8, 0, 0),
    spawn(7, 0, -8, 0, 0),
    spawn(0, TRIBUNAL_Y, 13, 0, 0),
  ],
  navigation: Object.freeze({
    nodes: Object.freeze([
      nav('center', 0, 0, 0),
      nav('arena-n', 0, 0, 6),
      nav('arena-s', 0, 0, -7),
      nav('arena-w', -6, 0, 0),
      nav('arena-e', 6, 0, 0),
      nav('arena-nw', -7, 0, 5),
      nav('arena-ne', 7, 0, 5),
      nav('arena-sw', -7, 0, -6),
      nav('arena-se', 7, 0, -6),
      nav('sally-w', -14, 0, 0),
      nav('sally-w-gate', -19, 0, 0),
      nav('sally-e', 14, 0, 0),
      nav('sally-e-gate', 19, 0, 0),
      nav('portal-s', 0, 0, -13),
      nav('portal-s-gate', 0, 0, -19),
      nav('tribunal-approach', 0, 0, 10),
      nav('tribunal-steps', 0, TRIBUNAL_Y * 0.5, 11.2),
      nav('tribunal-dais', 0, TRIBUNAL_Y, 13),
      nav('tribunal-left', -4.5, TRIBUNAL_Y, 14),
      nav('tribunal-right', 4.5, TRIBUNAL_Y, 14),
      nav('tribunal-renowner', 0, TRIBUNAL_SEAT_Y, 15.5),
    ]),
  }),
  abyssY: -10,
});
