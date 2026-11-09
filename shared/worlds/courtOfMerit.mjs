// The Court of Merit: the hall of public judgment where the Rightful Renowner weighs a champion's merit. A sword
// court first: one level of marble to fight on, walled in by the stands of those who come to watch.
//
//   - The Trial Floor (36 x 35.5 m of marble with the brass compass at its heart): where the waves are fought. Four
//     slender columns of judgment stand at its corners for a breath of cover; none is thick enough to run round
//     while a blade reaches across it.
//   - The Tribunal at the north end: a dais (0.8 m) the full width of its stair, the Renowner's seat above it, the
//     coin hopper and tray; the jury boxes either side of it close the court's north corners.
//   - The Stands: three tiers of stone benches down the west, east and south sides, solid to the ground (the
//     spectators' places, not a champion's), broken by the two sally gates and the Grand Portal through which each
//     wave enters.
//
// Every surface is a floor or a solid that is drawn exactly as it stops a knight; there is nowhere to fall from and
// nowhere to stand out of a blade's reach. The Renowner's place, the spawns and the trial's own rules are unchanged.

function solid(id, [x0, x1], [y0, y1], [z0, z1], extra = {}) {
  return { id, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0], material: 'stone', ...extra };
}

function floor(id, [x0, x1], [z0, z1], y, material = 'stone', extra = {}) {
  return { id, center: [(x0 + x1) / 2, y - 0.15, (z0 + z1) / 2], size: [x1 - x0, 0.3, z1 - z0], y, material, ...extra };
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

export const TRIBUNAL_Y = 0.8;
export const TRIBUNAL_SEAT_Y = 1.4;
// (kept for older imports: the stands are no longer walked on)
export const COURT_GALLERY_Y = 1.8;

const FLOORS = [
  // the Trial Floor, and its north apron round the tribunal
  floor('court-arena', [-18, 18], [-18, 12], 0, 'marble'),
  floor('court-north-apron', [-18, 18], [11.9, 17.5], 0, 'marble'),
  // the sally gates' passages and the Grand Portal's, each closed by the outer curtain behind it
  floor('court-sally-west', [-23.5, -17.9], [-3.5, 3.5], 0),
  floor('court-sally-east', [17.9, 23.5], [-3.5, 3.5], 0),
  floor('court-portal-south', [-4, 4], [-23.5, -17.9], 0),
  // the Tribunal: its dais and the Renowner's seat
  floor('tribunal-dais', [-7.5, 7.5], [12, 17.5], TRIBUNAL_Y),
  floor('tribunal-seat-floor', [-4.5, 4.5], [14.5, 17.5], TRIBUNAL_SEAT_Y),
];

const RAMPS = [
  // the tribunal's stair, the dais's full width, and the steps up to the seat
  { id: 'tribunal-steps', minX: -7.5, maxX: 7.5, minZ: 10.5, maxZ: 12.0, startY: 0, endY: TRIBUNAL_Y, axis: 'z', steps: true },
  { id: 'tribunal-seat-steps', minX: -2.0, maxX: 2.0, minZ: 13.5, maxZ: 14.5, startY: TRIBUNAL_Y, endY: TRIBUNAL_SEAT_Y, axis: 'z', steps: true },
  // and up from the aisles either side of it, between the dais and the jury boxes
  { id: 'tribunal-west-steps', minX: -9.2, maxX: -7.5, minZ: 12.2, maxZ: 13.8, startY: 0, endY: TRIBUNAL_Y, axis: 'x', steps: true },
  { id: 'tribunal-east-steps', minX: 7.5, maxX: 9.2, minZ: 12.2, maxZ: 13.8, startY: TRIBUNAL_Y, endY: 0, axis: 'x', steps: true },
];

/** A stand of three stone tiers along one side, from `front` (its lowest bench) back to the curtain. */
function stand(prefix, axis, front, back, [a0, a1], heights = [0.9, 1.8, 2.7, 4.2]) {
  const out = [];
  const step = (back - front) / heights.length;
  heights.forEach((h, i) => {
    const p0 = front + step * i, p1 = front + step * (i + 1);
    const [lo, hi] = p0 < p1 ? [p0, p1] : [p1, p0];
    out.push(axis === 'x'
      ? solid(`${prefix}-tier-${i}`, [lo, hi], [0, h], [a0, a1], { kind: i === heights.length - 1 ? 'stand-back' : 'stand-tier', tier: i })
      : solid(`${prefix}-tier-${i}`, [a0, a1], [0, h], [lo, hi], { kind: i === heights.length - 1 ? 'stand-back' : 'stand-tier', tier: i }));
  });
  return out;
}

const SOLIDS = [
  // --- the outer curtain
  solid('north-curtain', [-24.5, 24.5], [0, 6.5], [17.5, 18.5], { kind: 'curtain' }),
  solid('south-curtain', [-24.5, 24.5], [0, 5.0], [-24.5, -23.5], { kind: 'curtain' }),
  solid('west-curtain', [-24.5, -23.5], [0, 5.0], [-24.5, 18.5], { kind: 'curtain' }),
  solid('east-curtain', [23.5, 24.5], [0, 5.0], [-24.5, 18.5], { kind: 'curtain' }),

  // --- the stands: west and east (each side of its sally gate), south (each side of the Grand Portal)
  ...stand('stand-west-north', 'x', -18, -23.5, [4.5, 17.5]),
  ...stand('stand-west-south', 'x', -18, -23.5, [-23.5, -4.5]),
  ...stand('stand-east-north', 'x', 18, 23.5, [4.5, 17.5]),
  ...stand('stand-east-south', 'x', 18, 23.5, [-23.5, -4.5]),
  ...stand('stand-south-west', 'z', -18, -23.5, [-18, -4.5]),
  ...stand('stand-south-east', 'z', -18, -23.5, [4.5, 18]),
  // the gates' piers (where the stands break for a gate) and the arches over them
  solid('west-sally-north', [-23.5, -17.9], [0, 4.6], [3.5, 4.5], { kind: 'pier' }),
  solid('west-sally-south', [-23.5, -17.9], [0, 4.6], [-4.5, -3.5], { kind: 'pier' }),
  solid('east-sally-north', [17.9, 23.5], [0, 4.6], [3.5, 4.5], { kind: 'pier' }),
  solid('east-sally-south', [17.9, 23.5], [0, 4.6], [-4.5, -3.5], { kind: 'pier' }),
  solid('south-portal-west', [-4.5, -3.5], [0, 5.2], [-23.5, -17.9], { kind: 'pier' }),
  solid('south-portal-east', [3.5, 4.5], [0, 5.2], [-23.5, -17.9], { kind: 'pier' }),
  solid('west-sally-arch', [-23.5, -17.9], [3.6, 4.6], [-3.5, 3.5], { kind: 'arch' }),
  solid('east-sally-arch', [17.9, 23.5], [3.6, 4.6], [-3.5, 3.5], { kind: 'arch' }),
  solid('south-portal-arch', [-3.5, 3.5], [4.2, 5.2], [-19.2, -17.9], { kind: 'arch' }),

  // --- the columns of judgment: slender (a blade reaches across), at the trial floor's corners
  solid('pillar-nw', [-11.0, -10.0], [0, 5.5], [5.5, 6.5], { kind: 'pillar' }),
  solid('pillar-ne', [10.0, 11.0], [0, 5.5], [5.5, 6.5], { kind: 'pillar' }),
  solid('pillar-sw', [-11.0, -10.0], [0, 5.5], [-10.5, -9.5], { kind: 'pillar' }),
  solid('pillar-se', [10.0, 11.0], [0, 5.5], [-10.5, -9.5], { kind: 'pillar' }),

  // --- the Tribunal: its base (a step under its top, so no knight walks in under the dais), balustrades, jury boxes
  solid('tribunal-base', [-7.5, 7.5], [0, 0.15], [12, 17.5], { kind: 'dais-base', drawTo: TRIBUNAL_Y }),
  solid('tribunal-base-west', [-7.5, -3.5], [0, TRIBUNAL_Y], [13.8, 17.5], { kind: 'dais-base' }),
  solid('tribunal-base-east', [3.5, 7.5], [0, TRIBUNAL_Y], [13.8, 17.5], { kind: 'dais-base' }),
  solid('tribunal-balustrade-left', [-7.5, -6.9], [TRIBUNAL_Y, TRIBUNAL_Y + 0.9], [14.0, 17.5], { kind: 'balustrade', material: 'brass' }),
  solid('tribunal-balustrade-right', [6.9, 7.5], [TRIBUNAL_Y, TRIBUNAL_Y + 0.9], [14.0, 17.5], { kind: 'balustrade', material: 'brass' }),
  solid('jury-box-west', [-17.9, -9.4], [0, 1.6], [14.2, 17.5], { kind: 'jury-box' }),
  solid('jury-box-east', [9.4, 17.9], [0, 1.6], [14.2, 17.5], { kind: 'jury-box' }),

  // --- the Rightful Renowner: podium and effigy (fixed where the trial's ceremony expects it)
  solid('renowner-tribunal-podium', [-2.2, 2.2], [TRIBUNAL_SEAT_Y, TRIBUNAL_SEAT_Y + 0.6], [15.2, 17.2], { kind: 'podium', material: 'brass' }),
  solid('renowner-tribunal-body', [-1.4, 1.4], [TRIBUNAL_SEAT_Y + 0.6, TRIBUNAL_SEAT_Y + 4.2], [15.4, 17.0], { kind: 'renowner-body', material: 'iron' }),

  // --- ceremonial fire: braziers on the dais, and one at the south of the floor
  solid('tribunal-brazier-left', [-5.0, -4.2], [TRIBUNAL_Y, TRIBUNAL_Y + 1.2], [12.4, 13.2], { kind: 'brazier' }),
  solid('tribunal-brazier-right', [4.2, 5.0], [TRIBUNAL_Y, TRIBUNAL_Y + 1.2], [12.4, 13.2], { kind: 'brazier' }),
  solid('arena-brazier-south', [-0.5, 0.5], [0, 1.2], [-15.5, -14.5], { kind: 'brazier' }),
];

export const COURT_OF_MERIT = Object.freeze({
  id: 'court-of-merit',
  name: 'The Court of Merit',
  floors: FLOORS,
  ramps: RAMPS,
  solids: SOLIDS,
  props: [],
  spawnPoints: [
    // 0: the champion (centre south, facing the tribunal)
    spawn(0, 0, -5, 0, 16),
    // 1: West Sally wave entrance
    spawn(-15, 0, 0, 0, 0),
    // 2: East Sally wave entrance
    spawn(15, 0, 0, 0, 0),
    // 3: South Grand Portal wave entrance
    spawn(0, 0, -12, 0, 0),
    // 4: before the tribunal
    spawn(0, 0, 7, 0, -5),
    // 5-9: flank skirmish spawns
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
      nav('arena-nw', -6, 0, 5),
      nav('arena-ne', 6, 0, 5),
      nav('arena-sw', -6, 0, -6),
      nav('arena-se', 6, 0, -6),
      nav('arena-far-nw', -14, 0, 9),
      nav('arena-far-ne', 14, 0, 9),
      nav('arena-far-sw', -14, 0, -14),
      nav('arena-far-se', 14, 0, -14),
      nav('sally-w', -14, 0, 0),
      nav('sally-w-gate', -20, 0, 0),
      nav('sally-e', 14, 0, 0),
      nav('sally-e-gate', 20, 0, 0),
      nav('portal-s', 0, 0, -12),
      nav('portal-s-gate', 0, 0, -20),
      nav('portal-s-flank-w', -4, 0, -15),
      nav('portal-s-flank-e', 4, 0, -15),
      nav('tribunal-approach', 0, 0, 9.5),
      nav('tribunal-aisle-w', -8.6, 0, 11.4),
      nav('tribunal-aisle-e', 8.6, 0, 11.4),
      nav('tribunal-steps', 0, TRIBUNAL_Y * 0.5, 11.25),
      nav('tribunal-dais', 0, TRIBUNAL_Y, 13),
      nav('tribunal-left', -5.5, TRIBUNAL_Y, 13.0),
      nav('tribunal-right', 5.5, TRIBUNAL_Y, 13.0),
      nav('tribunal-seat', 3.3, TRIBUNAL_SEAT_Y, 15.6),
    ]),
  }),
  abyssY: -10,
});
