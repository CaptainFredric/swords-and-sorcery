import { propSolids } from './props.mjs';

// The Ruined Keep: a keep on a crag, taken by siege and left half fallen. Compact, made for one against one (it holds
// a small melee too), and built for a different fight from Castleward's open green:
//
//   - the Ward, a paved courtyard broken by fallen masonry (a toppled wall, column drums, the gatehouse's rubble), with
//     siege scaffolding against the hall;
//   - the Great Hall to the north: its roof fallen in over the southern half (open sky, a fallen beam, a rubble heap)
//     and still standing over the dais at the north end, on two rows of pillars;
//   - the Gallery: a wall walk along the east curtain, 2.6 m up. A stair climbs to it from the Ward; a Gale driven into
//     the ground from anywhere along its foot throws a knight up onto it (a jump never reaches);
//   - the Breach: the west curtain is broken open onto a narrow terrace over a sheer drop. A low lip of rubble lines
//     most of its edge (a walk along it is safe); where the cliff has crumbled, the edge is bare, and a gust or a blow
//     can send a knight over it. The only lethal edge in the keep, and meant to be;
//   - the Crawl: the hall's west aisle is choked by the fallen roof; a gap under it, too low to stand in, joins the
//     Ward's west corner to the hall, for a knight who crouches.
//
// Everything substantial stands as a solid (walls, pillars, rubble, scaffold, the stair's cheek, furnishings) and stops
// bodies, blades and spells alike. Three low heaps can be stood on (a jump reaches their tops). Nothing invisible
// stands in the way. Current layout (provisional).

// a box by its bounds
function solid(id, [x0, x1], [y0, y1], [z0, z1], extra = {}) {
  return { id, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0], material: 'stone', ...extra };
}

// a floor by its bounds, at height y (draw: false for a top the masonry under it already shows)
function floor(id, [x0, x1], [z0, z1], y, material, extra = {}) {
  return { id, center: [(x0 + x1) / 2, y - 0.15, (z0 + z1) / 2], size: [x1 - x0, 0.3, z1 - z0], y, material, ...extra };
}

function yawToward(x, z, targetX, targetZ) {
  // movement forward is (-sin(yaw), -cos(yaw))
  return Math.atan2(x - targetX, z - targetZ);
}

function spawn(x, y, z, targetX = 0, targetZ = 0) {
  return { x, y, z, yaw: yawToward(x, z, targetX, targetZ) };
}

function nav(id, x, y, z) {
  return Object.freeze({ id, x, y, z });
}

// the Gallery's height, and its stair: up from the Ward at z -3.2 to the landing at z -8.6
export const KEEP_GALLERY_Y = 2.6;
const STAIR = Object.freeze({ minX: 8.3, maxX: 10.2, minZ: -8.6, maxZ: -3.2 });

// supplies from the siege, each against a wall or the scaffold (shared/worlds/props.mjs: the ones that stand are solid)
const PROPS = Object.freeze([
  { kind: 'barrel', x: 7.55, z: -11.4 }, { kind: 'barrel', x: 7.5, z: -12.2, tilt: 0.12 },
  { kind: 'crate', x: 7.55, z: -10.3, turn: 0.15 },
  { kind: 'crate', x: -3.7, z: -0.25, turn: -0.2 }, { kind: 'crate', x: -3.7, z: 0.45, turn: 0.1, stack: true },
  { kind: 'sacks', x: -7.2, z: -12.7 },
  { kind: 'woodpile', x: -8.75, z: -11.9, length: 2.2 },
  { kind: 'rack', x: -8.95, z: 8.6, facing: Math.PI / 2 },
  { kind: 'barrel', x: 9.6, z: 12.55 },
].map((prop, index) => Object.freeze({ id: `prop-${index}`, ...prop })));

const FLOORS = [
  // the Ward and the Great Hall, one paved level (they overlap a hand's breadth where they meet: no seam)
  floor('ward', [-9.6, 10.25], [-13.3, 1.2], 0, 'stone'),
  floor('hall', [-9.6, 10.25], [1.1, 13.3], 0, 'stone'),
  // the dais at the hall's north end, a step up and another
  floor('dais-step', [-5, 5], [9.3, 10.3], 0.3, 'stone'),
  floor('dais', [-5, 5], [10.2, 13.3], 0.6, 'stone'),
  // the terrace beyond the Breach (it reaches under the broken wall's line: no seam there either)
  floor('terrace', [-13, -9.4], [-10.6, -2.4], 0, 'grass'),
  // the Gallery on the east curtain, and the stair's landing that joins it
  floor('gallery', [10.2, 13.35], [-13.3, 13.3], KEEP_GALLERY_Y, 'stone'),
  floor('landing', [8.25, 10.3], [-13.3, -8.5], KEEP_GALLERY_Y, 'stone'),
  // the tops of the three heaps a knight can stand on (the masonry under each is what shows)
  floor('gate-rubble-top', [-2.2, 2.2], [-13.2, -11.4], 1.0, 'stone', { draw: false }),
  floor('hall-rubble-top', [6.4, 9.0], [4.4, 6.6], 1.3, 'stone', { draw: false }),
  floor('scaffold-top', [-7.4, -4.4], [-0.9, 0.9], 1.2, 'timber', { draw: false }),
];

const RAMPS = [
  // the Gallery stair, climbing south from the Ward
  { id: 'gallery-stair', ...STAIR, startY: KEEP_GALLERY_Y, endY: 0, axis: 'z', steps: true },
];

const SOLIDS = [
  // --- the curtain: the outer walls (the east one is the Gallery's parapet above its walk)
  solid('south-curtain', [-9.8, 13.8], [0, 4.2], [-13.8, -13.3], { kind: 'curtain' }),
  solid('east-curtain', [13.35, 13.8], [0, 3.8], [-13.8, 13.8], { kind: 'curtain' }),
  solid('hall-north-wall', [-9.8, 13.8], [0, 6.6], [13.3, 13.8], { kind: 'hall-wall' }),
  solid('hall-west-wall', [-9.8, -9.2], [0, 6.6], [1.2, 13.3], { kind: 'hall-wall' }),
  // the west curtain, broken open between these two stretches (the Breach)
  solid('west-curtain-south', [-9.8, -9.2], [0, 4.0], [-13.3, -9.5], { kind: 'ruin' }),
  solid('west-curtain-north', [-9.8, -9.2], [0, 3.4], [-3.5, 1.2], { kind: 'ruin' }),
  // rubble spilled at the Breach's jambs (low: a knight is not stopped short at the gap)
  solid('breach-rubble-south', [-10.4, -8.6], [0, 0.9], [-9.8, -8.6], { kind: 'rubble' }),
  solid('breach-rubble-north', [-10.4, -8.8], [0, 0.7], [-4.4, -3.3], { kind: 'rubble' }),
  // the terrace: walls at each end, and the lip along its edge (the gap between the lips: the crumbled edge)
  solid('terrace-south-return', [-13.2, -9.8], [0, 2.4], [-11.0, -10.4], { kind: 'ruin' }),
  solid('terrace-north-return', [-13.2, -9.8], [0, 2.0], [-2.6, -2.0], { kind: 'ruin' }),
  solid('terrace-lip-south', [-13.4, -13.0], [0, 0.45], [-10.4, -7.4], { kind: 'lip' }),
  solid('terrace-lip-north', [-13.4, -13.0], [0, 0.45], [-5.6, -2.6], { kind: 'lip' }),

  // --- the Gallery: the curtain's thickness under its walk, the landing's base, and the stair's stepped cheek (each
  // step of the cheek below the stair's slope half a body back from it, so a knight climbing never meets its edge)
  solid('gallery-undercroft', [10.2, 13.35], [0, KEEP_GALLERY_Y], [-13.3, 13.3], { kind: 'undercroft' }),
  // (the landing's base stops a little under its walk: the stair's last step runs onto it without catching its edge)
  solid('landing-base', [8.3, 10.2], [0, KEEP_GALLERY_Y - 0.25], [-13.3, -8.6], { kind: 'undercroft' }),
  solid('stair-footing-high', [STAIR.minX, STAIR.maxX], [0, 1.55], [-8.6, -7.2], { kind: 'footing' }),
  solid('stair-footing-mid', [STAIR.minX, STAIR.maxX], [0, 0.95], [-7.2, -5.9], { kind: 'footing' }),
  solid('stair-footing-low', [STAIR.minX, STAIR.maxX], [0, 0.3], [-5.9, -4.6], { kind: 'footing' }),
  // broken stubs of the Gallery's inner parapet (cover up there; the gaps are where a knight drops down or comes up)
  solid('gallery-stub-south', [10.2, 10.55], [KEEP_GALLERY_Y, 3.5], [-3.5, -2.0], { kind: 'stub' }),
  solid('gallery-stub-mid', [10.2, 10.55], [KEEP_GALLERY_Y, 3.5], [2.4, 3.9], { kind: 'stub' }),
  solid('gallery-stub-north', [10.2, 10.55], [KEEP_GALLERY_Y, 3.5], [8.0, 9.6], { kind: 'stub' }),

  // --- the Great Hall: what is left of its south wall (the gap between is the way in), pillars, roof and fall
  solid('hall-south-west', [-7.8, -3.5], [0, 2.0], [0.9, 1.5], { kind: 'ruin' }),
  solid('hall-south-east', [3.0, 8.2], [0, 1.6], [0.9, 1.5], { kind: 'ruin' }),
  solid('pillar-west-south', [-6.3, -5.3], [0, 1.9], [3.1, 4.1], { kind: 'stump' }),
  solid('pillar-east-south', [5.3, 6.3], [0, 6.0], [3.1, 4.1], { kind: 'pillar' }),
  solid('pillar-west-mid', [-6.3, -5.3], [0, 6.0], [7.1, 8.1], { kind: 'pillar' }),
  solid('pillar-east-mid', [5.3, 6.3], [0, 6.0], [7.1, 8.1], { kind: 'pillar' }),
  solid('pillar-west-north', [-6.3, -5.3], [0, 6.0], [10.9, 11.9], { kind: 'pillar' }),
  solid('pillar-east-north', [5.3, 6.3], [0, 6.0], [10.9, 11.9], { kind: 'pillar' }),
  // the roof still standing over the north end (overhead: spells break on it)
  solid('hall-roof', [-9.2, 10.2], [6.0, 6.6], [7.2, 13.3], { kind: 'roof' }),
  // the fallen half: a roof beam across the floor, a heap of masonry in the east aisle
  solid('fallen-beam', [1.0, 4.4], [0, 0.6], [4.8, 5.4], { kind: 'beam', material: 'timber' }),
  solid('hall-rubble', [6.4, 9.0], [0, 1.3], [4.4, 6.6], { kind: 'rubble' }),
  // the Crawl: the west aisle choked by fallen roof, a gap under it 1.35 m high (a crouch fits; standing does not)
  solid('crawl-roof', [-9.2, -7.8], [1.35, 2.5], [0.9, 4.8], { kind: 'fallen-roof', material: 'timber' }),
  solid('crawl-rubble', [-7.8, -6.3], [0, 2.5], [0.9, 4.8], { kind: 'rubble' }),

  // --- the Ward: a toppled wall, column drums, the gatehouse's rubble, the siege scaffold
  solid('toppled-wall', [-2.8, 1.4], [0, 2.4], [-6.6, -6.0], { kind: 'ruin' }),
  solid('column-drums-west', [-7.2, -5.8], [0, 0.9], [-8.4, -7.0], { kind: 'drums' }),
  solid('column-drums-east', [3.6, 5.0], [0, 0.8], [-3.6, -2.2], { kind: 'drums' }),
  solid('gate-rubble', [-2.2, 2.2], [0, 1.0], [-13.3, -11.4], { kind: 'rubble' }),
  solid('siege-scaffold', [-7.4, -4.4], [0, 1.2], [-0.9, 0.9], { kind: 'scaffold', material: 'timber' }),
  // its two back poles stand up past the deck against the hall's wall (solid: a blade rings off them)
  solid('scaffold-pole-west', [-7.35, -7.15], [1.2, 3.5], [0.66, 0.86], { kind: 'scaffold-pole', material: 'timber' }),
  solid('scaffold-pole-east', [-4.65, -4.45], [1.2, 3.5], [0.66, 0.86], { kind: 'scaffold-pole', material: 'timber' }),

  // --- fire
  solid('ward-brazier', [-5.3, -4.7], [0, 1.3], [-10.8, -10.2], { kind: 'brazier' }),
  solid('dais-brazier-west', [-3.8, -3.2], [0.6, 1.9], [11.8, 12.4], { kind: 'brazier' }),
  solid('dais-brazier-east', [3.2, 3.8], [0.6, 1.9], [11.8, 12.4], { kind: 'brazier' }),

  ...propSolids(PROPS),
];

export const RUINED_KEEP = Object.freeze({
  id: 'ruined-keep',
  name: 'The Ruined Keep',
  floors: FLOORS,
  ramps: RAMPS,
  solids: SOLIDS,
  props: PROPS,
  // the first two face each other across the keep (a one-on-one begins there); the rest spread round it
  spawnPoints: [
    spawn(-5, 0, -9.5, 5, 8.5),
    spawn(5, 0, 8.5, -5, -9.5),
    spawn(-3, 0, 6.5),
    spawn(4.5, 0, -9.5),
    spawn(0, 0.6, 11.8, 0, 0),
    spawn(11.7, KEEP_GALLERY_Y, -1, 0, -1),
    spawn(11.7, KEEP_GALLERY_Y, 9, 0, 4),
    spawn(-6.5, 0, -2.5),
    spawn(0.5, 0, -3.8, 0, 6),
    spawn(-7.2, 0, 10),
  ],
  // where bots find their way (shared/sim/botNav.mjs); the Crawl is no way for a bot (it does not crouch)
  navigation: Object.freeze({
    nodes: Object.freeze([
      nav('ward', 0, 0, -9), nav('ward-west', -5.5, 0, -4), nav('ward-east', 5.5, 0, -6.5), nav('ward-southwest', -6.5, 0, -11),
      nav('ward-southeast', 5.5, 0, -11), nav('ward-north', 0, 0, -1.5), nav('ward-northeast', 7, 0, -1.2),
      nav('breach', -9.3, 0, -6.5), nav('terrace', -11.2, 0, -6.5), nav('terrace-north', -11.2, 0, -3.8), nav('terrace-south', -11.2, 0, -9.3),
      nav('hall-gap', 0, 0, 1.2), nav('side-door', 9.2, 0, 1.2), nav('east-aisle', 9.6, 0, 5.5), nav('hall', -2, 0, 6.5), nav('hall-east', 7.8, 0, 8.5),
      nav('hall-west', -7.8, 0, 7), nav('hall-northwest', -7.8, 0, 11.5), nav('hall-northeast', 7.8, 0, 11.5), nav('hall-centre', 2.5, 0, 8),
      nav('dais', 0, 0.6, 11.8),
      nav('stair-foot', 9.25, 0, -2.6), nav('stair-mid', 9.25, 1.3, -5.9), nav('stair-top', 9.25, KEEP_GALLERY_Y, -8.9),
      nav('landing', 9.25, KEEP_GALLERY_Y, -10.8), nav('gallery-south', 11.8, KEEP_GALLERY_Y, -10.8),
      nav('gallery', 11.8, KEEP_GALLERY_Y, 0), nav('gallery-north', 11.8, KEEP_GALLERY_Y, 11),
    ]),
  }),
  abyssY: -9,
});
