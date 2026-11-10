// Restless Day: a five-against-five storm of a castle in one long day, from the attackers' muster to the Rightful
// Renowner's dais. Everything that stops a knight here is drawn, and everything drawn that looks solid stops a knight.
//
//   z -106 .. -80  The Muster. The attackers' siege camp: tents down both flanks, carts, a field forge, the command
//                  pavilion at the rear; SO-FIST-ICATION and the Bi-Bye-llista park on open ground with room to turn,
//                  and the two heavy ladders lie on their trestles.
//   z  -80 .. -31  The Approach. Three clear lanes for the siege kit (the ram's road to the gate, a ladder lane either
//                  side of it, the ballista's lane on the east) between two flanks of cover for the infantry: sap
//                  trenches' spoil banks, mantlets, the burnt-out wreck of an earlier siege tower on the west and a
//                  broken trebuchet on the east. The wall overlooks all of it; the cover is how a ladder gets there.
//   z  -31 .. -24  The Outer Curtain (6 m). A crenellated wall-walk 3.6 m deep. The parapet is broken at four ladder
//                  landings (marked by their timber hoardings): a ladder goes up only where the parapet is down. Flank
//                  towers close the wall to the field's edge on both sides, so there is no way round. Stairs run down
//                  its inner face at both ends into...
//   z  -24 ..  22  The Lower Bailey, the contested courtyard. Not a second field: a working castle yard with
//                  buildings that split it into three ways to the inner wall (the stable range and barracks on the
//                  west, the processional road up the middle, the masons' yard and its raised loading dock on the
//                  east, a forge beside it).
//   z   22         The Inner Curtain (7 m), crenellated the same way, its own landings and flank towers; its stairs
//                  run down its north face into...
//   z   24 ..  82  The Court of the Renowner. A processional avenue past effigies of former champions to the
//                  Rightful Renowner on a broad dais stepped on all four sides; a colonnade round the court; the
//                  throne hall's facade closing its north end.
//
// Mode constants live in shared/sim/restlessDayMode.mjs and are matched here, not changed: the curtains' lines and
// heights, their ladder lips and ladder-foot bands, the Renowner's position, the ladders' trestles, the spawns of each
// phase and the siege machines' emplacements.
import { TEAMS } from '../src/teams.mjs';
import { surfaceHeightAt, resolvePlayerWorld } from '../src/collision.mjs';
import { propSolids } from './props.mjs';

const floor = (id, [x0, x1], [z0, z1], y = 0, material = 'stone', extra = {}) =>
  ({ id, center: [(x0 + x1) / 2, y - 0.18, (z0 + z1) / 2], size: [x1 - x0, 0.36, z1 - z0], y, material, ...extra });
const box = (id, [x0, x1], [y0, y1], [z0, z1], material = 'stone', extra = {}) =>
  ({ id, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0], material, ...extra });
const spawn = (x, z, team, phase = 0) => ({ x, y: 0, z, team, phase, yaw: team === TEAMS.ATTACKERS ? Math.PI : 0 });

// The two curtains, as the mode's rules know them (approachZ: where a ladder's foot stands).
const walls = Object.freeze([
  Object.freeze({ id: 'outer', z: -24, height: 6, thickness: 2.2, landingZ: -16, approachZ: -31, walk: [-25.8, -22.2] }),
  Object.freeze({ id: 'inner', z: 22, height: 7, thickness: 2.5, landingZ: 32, approachZ: 14, walk: [19.9, 24.1] }),
]);

// Where a ladder can go up: the parapet is down across these spans (ladder centres must sit at |x| <= 20 by rule; the
// mode's ladder-carrying bots make for x = +-6, and a ladder carried straight from its trestle meets the wall at +-10).
export const RESTLESS_LANDINGS = Object.freeze([[-19.8, -15.2], [-11.6, -4.4], [4.4, 11.6], [15.2, 19.8]]);

/**
 * A stair: a ramp, and under it stepped footings that stop a body walking beneath its high end. Each footing's top
 * stays under the slope by a body's radius of rise and a hand more: a knight's leading edge is half a body ahead of
 * his feet, uphill, and must never meet the next footing.
 */
function stair(id, axis, [x0, x1], [z0, z1], highAt, lowY, highY, material = 'stone') {
  const ramp = { id, axis, minX: x0, maxX: x1, minZ: z0, maxZ: z1, startY: highAt === 'min' ? highY : lowY, endY: highAt === 'min' ? lowY : highY, steps: true };
  const [a0, a1] = axis === 'x' ? [x0, x1] : [z0, z1];
  const length = a1 - a0;
  const heightAt = (a) => ramp.startY + (ramp.endY - ramp.startY) * (a - a0) / length;
  const footings = [];
  const pieces = Math.ceil(length / 1.2);
  for (let i = 0; i < pieces; i += 1) {
    const s0 = a0 + (i / pieces) * length, s1 = a0 + ((i + 1) / pieces) * length;
    const slope = Math.abs(highY - lowY) / length;
    const top = Math.min(heightAt(s0), heightAt(s1)) - 0.45 * slope - 0.1;
    if (top < 0.3) continue;
    footings.push(axis === 'x'
      ? box(`${id}-footing-${i}`, [s0, s1], [0, top], [z0, z1], material, { kind: 'stair-footing' })
      : box(`${id}-footing-${i}`, [x0, x1], [0, top], [s0, s1], material, { kind: 'stair-footing' }));
  }
  return { ramp, footings };
}

/** The crenellated parapet along a wall-walk's outer edge, broken at the ladder landings. */
function battlement(prefix, [z0, z1], baseY, { from = -24, to = 24 } = {}) {
  const out = [];
  const spans = [];
  let x = from;
  for (const [a, b] of RESTLESS_LANDINGS) { spans.push([x, a]); x = b; }
  spans.push([x, to]);
  spans.forEach(([a, b], i) => {
    if (b - a < 0.4) return;
    out.push(box(`${prefix}-parapet-${i}`, [a, b], [baseY, baseY + 0.95], [z0, z1], 'stone', { kind: 'parapet' }));
    // merlons on it: 0.9 m of stone, 0.9 m of crenel, centred on the span
    const count = Math.floor((b - a + 0.9) / 1.8);
    const pad = (b - a - (count * 1.8 - 0.9)) / 2;
    for (let k = 0; k < count; k += 1) {
      const m0 = a + pad + k * 1.8;
      out.push(box(`${prefix}-merlon-${i}-${k}`, [m0, m0 + 0.9], [baseY + 0.95, baseY + 1.75], [z0, z1], 'stone', { kind: 'merlon' }));
    }
  });
  // a timber hoarding frame marks each landing: two posts and a beam well over a climber's head
  RESTLESS_LANDINGS.forEach(([a, b], i) => {
    for (const [p, q] of [[a - 0.05, a + 0.25], [b - 0.25, b + 0.05]]) {
      out.push(box(`${prefix}-landing-post-${i}-${p < a + 0.1 ? 'w' : 'e'}`, [p, q], [baseY, baseY + 3.1], [z0, z0 + 0.3], 'timber', { kind: 'landing-post' }));
    }
    out.push(box(`${prefix}-landing-beam-${i}`, [a - 0.05, b + 0.05], [baseY + 2.8, baseY + 3.1], [z0, z0 + 0.3], 'timber', { kind: 'landing-beam' }));
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Ground
const floors = [
  floor('field', [-28, 28], [-106, -24], 0, 'grass'),
  floor('outer-yard', [-28, 28], [-24, 22], 0, 'paving'),
  floor('inner-yard', [-28, 28], [20, 72], 0, 'paving'),
  floor('final-court', [-28, 28], [61, 83], 0, 'paving'),
  // the wall-walks (their ids and heights are the mode's)
  floor('outer-rampart', [-24, 24], walls[0].walk, 6),
  floor('inner-rampart', [-24, 24], walls[1].walk, 7),
  // the masons' loading dock in the Lower Bailey: a platform a knight climbs by its ramp or steps up onto from a cart
  floor('mason-dock', [16, 24.2], [-12, -5.6], 1.3, 'timber'),
  // the Renowner's dais, stepped on all four sides, and the upper step round its plinth
  floor('renowner-dais', [-7, 7], [49, 63], 0.75, 'marble'),
  floor('renowner-step', [-3, 3], [53, 59], 1.1, 'marble'),
];

const stairs = [
  // each curtain's stairs come straight down off its walk into the yard behind it, at both ends: a knight (and a
  // ladder on his shoulder) goes down facing the way he is going, never turning against the wall
  // (the outer stairs' heads stand clear of the landings' hoarding posts: a carrier swings a 5.4 m ladder round
  // on the walk to face down them)
  stair('outer-stair-west', 'z', [-19, -16.6], [-22.2, -13.2], 'min', 0, 6),
  stair('outer-stair-east', 'z', [16.6, 19], [-22.2, -13.2], 'min', 0, 6),
  stair('inner-stair-west', 'z', [-20.6, -18.2], [24.1, 34.1], 'min', 0, 7),
  stair('inner-stair-east', 'z', [18.2, 20.6], [24.1, 34.1], 'min', 0, 7),
  // the loading dock's ramp, up its west side from the bailey
  stair('mason-dock-ramp', 'x', [12.6, 16], [-11.2, -8.2], 'max', 0, 1.3, 'timber'),
];

const ramps = [
  ...stairs.map((s) => s.ramp),
  // the dais's four flights
  { id: 'renowner-dais-south', axis: 'z', minX: -7, maxX: 7, minZ: 47.5, maxZ: 49, startY: 0, endY: 0.75, steps: true },
  { id: 'renowner-dais-north', axis: 'z', minX: -7, maxX: 7, minZ: 63, maxZ: 64.5, startY: 0.75, endY: 0, steps: true },
  { id: 'renowner-dais-west', axis: 'x', minX: -8.5, maxX: -7, minZ: 49, maxZ: 63, startY: 0, endY: 0.75, steps: true },
  { id: 'renowner-dais-east', axis: 'x', minX: 7, maxX: 8.5, minZ: 49, maxZ: 63, startY: 0.75, endY: 0, steps: true },
];

// ---------------------------------------------------------------------------------------------------------------
// Furnishings (shared/worlds/props.mjs: each that stands is a solid of its size)
const A = TEAMS.ATTACKERS, D = TEAMS.DEFENDERS;
const PROPS = Object.freeze([
  // the Muster: tents down both flanks, the command pavilion and its standards, carts, braziers, a field forge
  ...[-100, -93, -86].flatMap((z) => [{ kind: 'tent', x: -23.2, z, facing: Math.PI / 2, team: A }, { kind: 'tent', x: 23.2, z, facing: -Math.PI / 2, team: A }]),
  { kind: 'tent', x: 0, z: -101.5, facing: 0, team: A },
  { kind: 'standard', x: -3, z: -98.6, team: A }, { kind: 'standard', x: 3, z: -98.6, team: A },
  { kind: 'cart', x: -12.5, z: -101, facing: Math.PI / 2 }, { kind: 'cart', x: 12.5, z: -101, facing: -Math.PI / 2 },
  { kind: 'brazier', x: -8, z: -96 }, { kind: 'brazier', x: 8, z: -96 },
  { kind: 'barrel', x: -20.9, z: -96.4 }, { kind: 'barrel', x: -20.85, z: -97.2, tilt: 0.15 }, { kind: 'crate', x: 20.9, z: -96.5, turn: 0.2, stack: true },
  { kind: 'sacks', x: 20.8, z: -89.6 }, { kind: 'crate', x: -20.9, z: -89.5, turn: -0.1 },
  { kind: 'anvil', x: -19.5, z: -78.4, facing: Math.PI / 2 }, { kind: 'ore', x: -22.4, z: -77 }, { kind: 'brazier', x: -19.6, z: -80.8 },
  { kind: 'woodpile', x: -24.6, z: -80.5, length: 2.6, facing: 0 },
  { kind: 'rack', x: -26.6, z: -75, facing: Math.PI / 2 },
  { kind: 'cart', x: 22.5, z: -80.5, facing: 0 },
  // the Approach: cheval-de-frise along both flanks of the ladder bands (never across a lane)
  { kind: 'stakes', x: -23.8, z: -37.5, facing: 0, length: 3 }, { kind: 'stakes', x: 23.8, z: -37.5, facing: 0, length: 3 },
  { kind: 'stakes', x: -21.2, z: -44.5, facing: 0, length: 3 }, { kind: 'stakes', x: 21.6, z: -46, facing: 0, length: 3 },
  // the Lower Bailey: stores by the stable range and the forge, a defender's rack by the inner gate
  { kind: 'barrel', x: -20.0, z: -2.2 }, { kind: 'barrel', x: -19.4, z: -1.8, tilt: 0.2 }, { kind: 'woodpile', x: -26.4, z: -0.6, length: 2.4, facing: Math.PI / 2 },
  { kind: 'sacks', x: -20, z: 1.4 }, { kind: 'crate', x: 23.5, z: -13.2, turn: 0.15 },
  { kind: 'cart', x: -15.0, z: -8.0, facing: 0 }, { kind: 'sacks', x: 20.0, z: 13.4 }, { kind: 'barrel', x: 24.4, z: 13.3 }, { kind: 'crate', x: 22.7, z: -13.4, turn: -0.1, stack: true },
  { kind: 'anvil', x: 19.8, z: 4.6, facing: 0 }, { kind: 'brazier', x: 18.4, z: 5.9 }, { kind: 'ore', x: 26.2, z: 11.8 },
  { kind: 'standard', x: -5.7, z: 18.6, team: D }, { kind: 'standard', x: 5.7, z: 18.6, team: D },
  // the Court of the Renowner: braziers at the dais's corners (off its flights), defenders' standards at the gate
  { kind: 'brazier', x: -9.8, z: 46.6 }, { kind: 'brazier', x: 9.8, z: 46.6 }, { kind: 'brazier', x: -9.8, z: 65.4 }, { kind: 'brazier', x: 9.8, z: 65.4 },
  { kind: 'standard', x: -5.6, z: 26.9, team: D }, { kind: 'standard', x: 5.6, z: 26.9, team: D },
].map((prop, i) => Object.freeze({ id: `rd-prop-${i}`, ...prop })));

// ---------------------------------------------------------------------------------------------------------------
// What stands
const solids = [
  // --- the field's edge: an earth bank topped with a palisade (the siege lines), the camp's rear palisade
  box('field-bank-west', [-29, -27.4], [0, 4.5], [-106.2, -28], 'timber', { kind: 'palisade' }),
  box('field-bank-east', [27.4, 29], [0, 4.5], [-106.2, -28], 'timber', { kind: 'palisade' }),
  box('camp-rear-palisade', [-29, 29], [0, 4.5], [-106.8, -105.6], 'timber', { kind: 'palisade' }),
  // --- the castle's side curtains, from the outer towers to the throne hall
  box('castle-flank-west', [-29, -27.4], [0, 8], [-28, 82.7], 'stone', { kind: 'curtain' }),
  box('castle-flank-east', [27.4, 29], [0, 8], [-28, 82.7], 'stone', { kind: 'curtain' }),
  box('boundary-rear', [-28.5, 28.5], [0, 6], [82, 83.4], 'stone', { kind: 'curtain' }),

  // --- the outer curtain (ids, line and height are the mode's)
  box('outer-curtain-west', [-24, -3], [0, 6], [-25.1, -22.9]),
  box('outer-curtain-east', [3, 24], [0, 6], [-25.1, -22.9]),
  box('outer-gate', [-3, 3], [0, 6], [-25.1, -22.9], 'timber'),
  // its flank towers close it to the field's edge (no way round) and command the wall's face
  box('outer-tower-west', [-28.2, -23.4], [0, 9.6], [-28.4, -20.2], 'stone', { kind: 'tower' }),
  box('outer-tower-east', [23.4, 28.2], [0, 9.6], [-28.4, -20.2], 'stone', { kind: 'tower' }),
  // the gate's jambs stand proud of the curtain, clear of the landings beside them
  box('outer-gate-jamb-west', [-4.4, -3], [0, 8.4], [-27.4, -25.1], 'stone', { kind: 'gate-tower' }),
  box('outer-gate-jamb-east', [3, 4.4], [0, 8.4], [-27.4, -25.1], 'stone', { kind: 'gate-tower' }),
  box('outer-gate-lintel', [-3, 3], [6, 8.4], [-27.4, -25.1], 'stone', { kind: 'gate-lintel' }),
  ...battlement('outer', [-25.8, -25.15], 6),

  // --- the inner curtain
  box('inner-curtain-west', [-24, -3], [0, 7], [20.75, 23.25]),
  box('inner-curtain-east', [3, 24], [0, 7], [20.75, 23.25]),
  box('inner-gate', [-3, 3], [0, 7], [20.75, 23.25], 'timber'),
  box('inner-tower-west', [-28.2, -23.4], [0, 10.6], [17.6, 26.4], 'stone', { kind: 'tower' }),
  box('inner-tower-east', [23.4, 28.2], [0, 10.6], [17.6, 26.4], 'stone', { kind: 'tower' }),
  box('inner-gate-jamb-west', [-4.4, -3], [0, 9.4], [18.2, 20.75], 'stone', { kind: 'gate-tower' }),
  box('inner-gate-jamb-east', [3, 4.4], [0, 9.4], [18.2, 20.75], 'stone', { kind: 'gate-tower' }),
  box('inner-gate-lintel', [-3, 3], [7, 9.4], [18.2, 20.75], 'stone', { kind: 'gate-lintel' }),
  ...battlement('inner', [19.9, 20.55], 7),

  ...stairs.flatMap((s) => s.footings),

  // --- the Approach: west flank (sap spoil, mantlets, the wrecked siege tower), east flank (spoil, mantlets, the
  // broken trebuchet). The lanes between stay open: the ram's road (x -6.5..2), the ladder lanes, the ballista's lane.
  box('sap-spoil-west-far', [-24.5, -15.5], [0, 1.15], [-63.6, -62.2], 'earth', { kind: 'spoil' }),
  box('mantlet-west-a', [-17.6, -14.4], [0, 2.3], [-55.4, -54.8], 'timber', { kind: 'mantlet' }),
  box('siege-tower-wreck', [-24.4, -19.2], [0, 4.6], [-50.2, -44.8], 'timber', { kind: 'wreck' }),
  box('sap-spoil-west-near', [-18.5, -12.6], [0, 1.15], [-42.4, -41], 'earth', { kind: 'spoil' }),
  box('mantlet-west-b', [-23.5, -20.3], [0, 2.3], [-36.1, -35.5], 'timber', { kind: 'mantlet' }),
  box('sap-spoil-east-far', [19.2, 26.2], [0, 1.15], [-66.6, -65.2], 'earth', { kind: 'spoil' }),
  box('mantlet-east-a', [19.6, 22.8], [0, 2.3], [-57.4, -56.8], 'timber', { kind: 'mantlet' }),
  box('trebuchet-wreck', [20.2, 25.8], [0, 2.2], [-51.4, -47.6], 'timber', { kind: 'trebuchet' }),
  box('sap-spoil-east-near', [19.4, 25.4], [0, 1.15], [-42.6, -41.2], 'earth', { kind: 'spoil' }),
  // a second line nearer the wall: gabion walls a knight crouches behind, the flanks' last cover before the foot
  box('gabions-west-mid', [-25.6, -19.6], [0, 1.45], [-57.2, -56.2], 'timber', { kind: 'gabions' }),
  box('gabions-west-near', [-26.2, -21.4], [0, 1.45], [-31.6, -30.6], 'timber', { kind: 'gabions' }),
  box('mantlet-west-c', [-15.4, -12.2], [0, 2.3], [-49.2, -48.6], 'timber', { kind: 'mantlet' }),
  box('gabions-east-mid', [22.2, 26.6], [0, 1.45], [-61.6, -60.6], 'timber', { kind: 'gabions' }),
  box('gabions-east-near', [21.4, 26.2], [0, 1.45], [-33.8, -32.8], 'timber', { kind: 'gabions' }),
  box('mantlet-east-b', [19.4, 22.6], [0, 2.3], [-38.6, -38], 'timber', { kind: 'mantlet' }),
  // the shot for the ballista, stacked off its lane at the Muster's edge
  box('staging-shot-crates-east', [20.4, 22.6], [0, 1.2], [-75.2, -72.8], 'timber', { kind: 'shot' }),

  // --- the Lower Bailey: the stable range and barracks (west), the masons' yard and its dock, the forge (east),
  // a market cross and a cistern by the road, and the defenders' sally barricades before the inner wall
  box('stable-range', [-27.4, -20.6], [0, 3.4], [-16.4, -3.2], 'plaster', { kind: 'building', roof: 'slate', door: '+x' }),
  box('barracks', [-27.4, -21.2], [0, 3.2], [2.4, 10.4], 'plaster', { kind: 'building', roof: 'slate', door: '+x' }),
  // (a raised floor's base stops a step under its top: a body coming up a flight never catches its edge, and none can
  // walk in under it)
  box('mason-dock-base', [16, 24.2], [0, 0.65], [-12, -5.6], 'timber', { kind: 'dock', drawTo: 1.3 }),
  box('mason-block-a', [21.2, 23.4], [1.3, 2.5], [-11.2, -9.4], 'stone', { kind: 'cut-stone' }),
  box('mason-block-b', [17.6, 19.2], [1.3, 2.2], [-7.4, -6.2], 'stone', { kind: 'cut-stone' }),
  box('crane-post', [23.4, 24], [1.3, 6.8], [-6.8, -6.2], 'timber', { kind: 'crane' }),
  box('crane-jib', [19.6, 24], [6.4, 6.8], [-6.7, -6.3], 'timber', { kind: 'crane-jib' }),
  box('forge', [21.6, 27.4], [0, 3.2], [1.2, 8.6], 'stone', { kind: 'building', roof: 'slate', door: '-x' }),
  box('market-cross', [-15.6, -14.4], [0, 3.1], [-12.6, -11.4], 'stone', { kind: 'cross' }),
  box('cistern', [14.2, 16.4], [0, 0.95], [1.6, 3.8], 'stone', { kind: 'cistern' }),
  // mid-yard: a well under its roof on four posts, a market stall, a hay wain (the yard's middle is to fight in,
  // with something to fight round). The two ladder roads across the bailey (x 3..13 either side of the processional
  // road, outer landings to inner) keep clear of anything at a carried ladder's height.
  box('wellhouse-well', [-16.3, -14.7], [0, 0.95], [1.7, 3.3], 'stone', { kind: 'cistern' }),
  ...[[-17.1, 0.9], [-13.9, 0.9], [-17.1, 4.1], [-13.9, 4.1]].map(([x, z], i) => box(`wellhouse-post-${i}`, [x - 0.12, x + 0.12], [0, 2.6], [z - 0.12, z + 0.12], 'timber', { kind: 'post' })),
  box('wellhouse-roof', [-17.6, -13.4], [2.6, 3.5], [0.4, 4.6], 'slate', { kind: 'post-roof' }),
  box('stall-east', [20.6, 23.6], [0, 1.1], [12.6, 14.2], 'timber', { kind: 'stall' }),
  ...[[20.7, 12.7], [23.5, 12.7], [20.7, 14.1], [23.5, 14.1]].map(([x, z], i) => box(`stall-east-post-${i}`, [x - 0.06, x + 0.06], [1.1, 2.4], [z - 0.06, z + 0.06], 'timber', { kind: 'post' })),
  box('stall-east-awning', [20.4, 23.8], [2.4, 2.55], [12.3, 14.5], 'cloth', { kind: 'awning' }),
  box('inner-sally-cover-left', [-17.2, -12.8], [0, 1.6], [9.4, 10.6], 'timber', { kind: 'barricade' }),
  box('inner-sally-cover-right', [11, 15.4], [0, 1.6], [6.6, 7.8], 'timber', { kind: 'barricade' }),

  // --- the Court of the Renowner: effigies along the avenue, the colonnade, the throne hall's facade
  ...[[-5.3, 30.5], [5.3, 30.5], [-5.3, 41.5], [5.3, 41.5]].map(([x, z], i) => box(`champion-effigy-${i}`, [x - 0.7, x + 0.7], [0, 3.4], [z - 0.7, z + 0.7], 'stone', { kind: 'effigy' })),
  ...[32, 40, 48, 56, 64, 72].flatMap((z) => [-1, 1].map((s) => box(`colonnade-${s < 0 ? 'w' : 'e'}-${z}`, [s * 17 - 0.65, s * 17 + 0.65], [0, 5.6], [z - 0.65, z + 0.65], 'stone', { kind: 'column' }))),
  box('throne-hall-facade', [-20, 20], [0, 9], [78.4, 82], 'stone', { kind: 'facade' }),

  // --- the Rightful Renowner: its plinth (the mode's strikes pass over it by id) and the effigy that takes the blows
  box('renowner-dais-base', [-7, 7], [0, 0.1], [49, 63], 'marble', { kind: 'dais-base', drawTo: 0.75 }),
  box('renowner-podium', [-1.65, 1.65], [0, 1.4], [54.5, 57.5], 'brass'),
  box('renowner-body', [-1.55, 1.55], [1.45, 6.55], [54.6, 57.4], 'iron'),

  ...propSolids(PROPS),
];
// a building's roof is as solid as its walls: the box under its pitch (a bolt or a coin breaks on it)
for (const b of solids.filter((x) => x.kind === 'building')) {
  const [sx, sy, sz] = b.size, top = b.center[1] + sy / 2, pitch = Math.min(sx, sz) * 0.62;
  solids.push(box(`${b.id}-roof`, [b.center[0] - sx / 2, b.center[0] + sx / 2], [top, top + pitch * 0.55], [b.center[2] - sz / 2, b.center[2] + sz / 2], 'slate', { kind: 'roof', of: b.id }));
}

const spawnPoints = [
  ...[-16, -8, 0, 8, 16].map((x) => spawn(x, -90, TEAMS.ATTACKERS, 0)),
  ...[-15, -7, 0, 7, 15].map((x) => spawn(x, -5, TEAMS.ATTACKERS, 1)),
  ...[-15, -7, 0, 7, 15].map((x) => spawn(x, 35, TEAMS.ATTACKERS, 2)),
  ...[-15, 0, 15].map((x) => ({ ...spawn(x, -24, TEAMS.DEFENDERS, 0), y: 6 })),
  ...[-7, 7].map((x) => ({ ...spawn(x, 22.8, TEAMS.DEFENDERS, 0), y: 7 })),
  // once the outer curtain has fallen the defenders return along the inner walk; once the inner has, round the dais
  ...[-21, -13, 0, 13, 21].map((x) => ({ ...spawn(x, 22.6, TEAMS.DEFENDERS, 1), y: 7 })),
  ...[[-11, 46], [11, 46], [-12, 60], [12, 60], [0, 68]].map(([x, z]) => spawn(x, z, TEAMS.DEFENDERS, 2)),
];

// ---------------------------------------------------------------------------------------------------------------
// Waypoints for bots: a grid over each open ground, the walks, both ends and the middle of every stair, the dais.
// Only points a knight can stand at survive (supported, a body's room). Ladders add their own (restlessDayMode).
const draft = { floors, ramps, solids };
const standable = (x, y, z) => {
  const g = surfaceHeightAt(x, z, y + 0.1, draft);
  if (g === null || Math.abs(g - y) > 0.05) return false;
  const placed = resolvePlayerWorld({ x, y, z }, 0.45, solids, 1.8);
  return Math.hypot(placed.x - x, placed.z - z) < 1e-3;
};
const nodes = [];
const node = (id, x, y, z) => { if (standable(x, y, z)) nodes.push(Object.freeze({ id, x, y, z })); };
const XS = [-23, -15, -8, 0, 8, 15, 23];
for (const z of [-100, -91, -82, -73, -64, -55, -46, -38, -32]) for (const x of XS) node(`rd-field-${x}-${z}`, x, 0, z);
for (const z of [-18, -11, -4, 3, 10, 16.5]) for (const x of XS) if (!(Math.abs(x) === 23 && z === -18)) node(`rd-yard-${x}-${z}`, x, 0, z);
for (const z of [29, 36, 44, 52, 60, 68, 75]) for (const x of XS) node(`rd-court-${x}-${z}`, x, 0, z);
for (const x of [-21, -15, -9, -3, 3, 9, 15, 21]) { node(`rd-outer-walk-${x}`, x, 6, -23.6); node(`rd-inner-walk-${x}`, x, 7, 22.2); }
// (the dock is high ground for knights, not a road for bots: they go round it)
for (const s of stairs.filter((st) => !st.ramp.id.startsWith('mason-dock'))) {
  const r = s.ramp, axisX = r.axis === 'x';
  for (const t of [0.04, 0.5, 0.96]) {
    const x = axisX ? r.minX + (r.maxX - r.minX) * t : (r.minX + r.maxX) / 2;
    const z = axisX ? (r.minZ + r.maxZ) / 2 : r.minZ + (r.maxZ - r.minZ) * t;
    node(`rd-${r.id}-${t}`, x, +(r.startY + (r.endY - r.startY) * t).toFixed(3), z);
  }
}
// the foot of each stair, on the ground beyond its low end, and its top on the walk
node('rd-outer-stair-west-foot', -17.8, 0, -11.8); node('rd-outer-stair-east-foot', 17.8, 0, -11.8);
node('rd-inner-stair-west-foot', -19.4, 0, 35.5); node('rd-inner-stair-east-foot', 19.4, 0, 35.5);
node('rd-outer-stair-west-head', -17.8, 6, -23.4); node('rd-outer-stair-east-head', 17.8, 6, -23.4);
node('rd-inner-stair-west-head', -19.4, 7, 22.6); node('rd-inner-stair-east-head', 19.4, 7, 22.6);

node('rd-yard-dock-sw', 12.2, 0, -12.8); node('rd-yard-dock-nw', 13.2, 0, -6.9);
for (const [x, z] of [[0, 50], [-5, 50], [5, 50], [-5, 62], [5, 62], [0, 62], [-5.5, 56], [5.5, 56]]) node(`rd-dais-${x}-${z}`, x, 0.75, z);
for (const [x, z] of [[0, 53.4], [0, 58.6], [-2.5, 56], [2.5, 56]]) node(`rd-step-${x}-${z}`, x, 1.1, z);

export const RESTLESS_DAY_WORLD = Object.freeze({
  id: 'restless-day', name: 'Restless Day', floors, ramps, solids, spawnPoints, walls, props: PROPS,
  structures: Object.freeze([
    { id: 'outer-gate', name: 'Outer gate', profile: 'reinforcedTimber', team: TEAMS.DEFENDERS, solidIds: ['outer-gate'] },
    { id: 'inner-gate', name: 'Inner gate', profile: 'reinforcedTimber', team: TEAMS.DEFENDERS, solidIds: ['inner-gate'] },
    { id: 'rightful-renowner', name: 'The Rightful Renowner', profile: 'renowner', team: TEAMS.DEFENDERS, solidIds: ['renowner-body'] },
  ]),
  // Existing machine instances, not a mode-specific mechanical imitation.
  ballistaEmplacement: Object.freeze({ id: 'restless-ballista', x: 15, y: 0, z: -77, baseYaw: Math.PI, team: TEAMS.ATTACKERS, interactRadius: 3.2 }),
  siegeEmplacements: Object.freeze([
    { id: 'restless-ram', type: 'so-fist-ication', team: TEAMS.ATTACKERS, phases: [0, 1, 2], x: -4, y: 0, z: -76, heading: Math.PI },
  ]),
  navigation: Object.freeze({ nodes: Object.freeze(nodes) }),
  // the lanes the siege kit keeps clear (tests hold every solid out of them): [minX, maxX, minZ, maxZ]
  lanes: Object.freeze({
    ram: Object.freeze([-6.5, 2, -85, -27.6]),
    ballista: Object.freeze([12.5, 17.5, -85, -35]),
    ladderWest: Object.freeze([-11.2, -4.8, -72, -31]),
    ladderEast: Object.freeze([4.8, 11.2, -72, -31]),
    bailey: Object.freeze([-5, 5, -22.9, 18.2]),
    ladderBaileyWest: Object.freeze([-13, -3, -22, 8]),
    ladderBaileyEast: Object.freeze([3, 13, -22, 6]),
    avenue: Object.freeze([-4, 4, 23.3, 47.5]),
  }),
  bounds: Object.freeze({ minX: -28, maxX: 28, minZ: -105, maxZ: 82 }), abyssY: -28,
  restlessDay: Object.freeze({ renowner: { x: 0, y: 1.4, z: 56 }, ladders: [{ id: 'ladder-a', x: -10, z: -68 }, { id: 'ladder-b', x: 10, z: -68 }] }),
});
