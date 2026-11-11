// The High Grounds: authoritative, expansive three-level battlefield.
// All geometry is metres, +Y up. No visual-only collision surfaces.
// Azure approaches from -Z; Crimson from +Z. Captures are deliberately
// non-sequential: this map is designed for reciprocal territory control.
import { TEAMS } from '../src/teams.mjs';
import { propSolids } from './props.mjs';

const floor = (id, x, z, w, d, y, material = 'timber') => ({
  id, center: [x, y - 0.22, z], size: [w, 0.44, d], y, material,
});
const solid = (id, x, y, z, w, h, d, material = 'timber') => ({
  id, center: [x, y, z], size: [w, h, d], material,
});
const ramp = (id, axis, minX, maxX, minZ, maxZ, startY, endY) => ({
  id, axis, minX, maxX, minZ, maxZ, startY, endY,
});
const spawn = (x, y, z, team, forward = false) => ({
  x, y, z, team, forward, yaw: team === TEAMS.ATTACKERS ? Math.PI : 0,
});
const grounds = [
  floor('azure-camp', 0, -100, 46, 34, 0, 'stone'),
  floor('crimson-camp', 0, 100, 46, 34, 0, 'stone'),
  // The road and centre are reliable support for wheels and deployed ballistae.
  floor('road-azure-rear', 0, -71, 16, 30, 0),
  floor('road-azure-front', 0, -41, 15, 32, 0),
  floor('road-central-south', 0, -17, 13, 20, 0),
  floor('crown-span', 0, 0, 30, 24, 0, 'stone'),
  floor('road-central-north', 0, 17, 13, 20, 0),
  floor('road-crimson-front', 0, 41, 15, 32, 0),
  floor('road-crimson-rear', 0, 71, 16, 30, 0),
  floor('azure-forward-deck', 0, -52, 25, 23, 0, 'stone'),
  floor('crimson-forward-deck', 0, 52, 25, 23, 0, 'stone'),
  // High, exposed canopy traverse is not required to cross on foot.
  floor('west-canopy-south', -38, -42, 12, 46, 12),
  floor('west-canopy-capture', -38, -7, 25, 25, 12, 'stone'),
  floor('west-canopy-north', -38, 35, 12, 62, 12),
  floor('east-canopy-south', 38, -35, 12, 62, 12),
  floor('east-canopy-capture', 38, 7, 25, 25, 12, 'stone'),
  floor('east-canopy-north', 38, 42, 12, 46, 12),
  // Three cross-bridges join the treetop highways.
  floor('high-bridge-south', 0, -57, 78, 8, 12),
  floor('high-bridge-centre', 0, 0, 76, 7, 12),
  floor('high-bridge-north', 0, 57, 78, 8, 12),
  // Lower route catches a *subset* of falls and permits counter-flanks.
  floor('root-shelf-west', -16, -3, 10, 62, -9, 'stone'),
  floor('root-shelf-east', 16, 3, 10, 62, -9, 'stone'),
  floor('root-shelf-cross-south', 0, -28, 42, 7, -9),
  floor('root-shelf-cross-north', 0, 28, 42, 7, -9),
  floor('root-shelf-cross-centre', 0, 0, 42, 6, -9),
  // Reinforced side approaches with open, physically traversable slopes.
  floor('azure-west-landing', -38, -104, 19, 12, 0),
  floor('crimson-east-landing', 38, 104, 19, 12, 0),
  // Seamless, physically supported links between camp ground and side-ramp
  // landings. Before this, the first steps of several ramps hung in midair.
  floor('azure-west-gate-approach', -26, -99, 16, 12, 0, 'stone'),
  floor('crimson-east-gate-approach', 26, 99, 16, 12, 0, 'stone'),
  floor('azure-east-gate-approach', 26, -99, 16, 12, 0, 'stone'),
  floor('crimson-west-gate-approach', -26, 99, 16, 12, 0, 'stone'),
  floor('azure-east-ascent-landing', 38, -104, 19, 12, 0, 'stone'),
  floor('crimson-west-descent-landing', -38, 104, 19, 12, 0, 'stone'),
  // Entrances to the under-roots must be supported at Y=0, not begin
  // outside the forward deck in invisible space.
  floor('azure-root-approach', -14, -55, 13, 5, 0, 'stone'),
  floor('crimson-root-approach', 14, 54, 13, 10, 0, 'stone'),

];
const ramps = [
  // 12 m ascent over 33 m: deliberate high-ground access without teleporting.
  ramp('west-ascent', 'z', -44, -32, -98, -65, 0, 12),
  ramp('east-ascent', 'z', 32, 44, 65, 98, 12, 0),
  ramp('west-north-descent', 'z', -44, -32, 65, 98, 12, 0),
  ramp('east-south-ascent', 'z', 32, 44, -98, -65, 0, 12),
  // Cross-connect road and tree roads; intentional infantry shortcuts.
  ramp('west-to-crown', 'x', -34, -10, -7, 0, 12, 0),
  ramp('crown-to-east', 'x', 10, 34, 0, 7, 0, 12),
  // Lower root routes have separate physical access near either forward deck.
  ramp('root-west-south', 'z', -21, -11, -54, -29, 0, -9),
  ramp('root-east-north', 'z', 11, 21, 29, 54, -9, 0),
];
const trees = [
  { id: 'elder-west', x: -60, z: -10, radius: 6, height: 44, bloom: 'rose' },
  { id: 'elder-east', x: 60, z: 10, radius: 6, height: 44, bloom: 'gold' },
  { id: 'azure-giant', x: -57, z: -67, radius: 7, height: 52, bloom: 'rose' },
  { id: 'crimson-giant', x: 57, z: 67, radius: 7, height: 52, bloom: 'gold' },
  { id: 'west-lantern', x: -63, z: 51, radius: 4, height: 37, bloom: 'ivory' },
  { id: 'east-lantern', x: 63, z: -51, radius: 4, height: 37, bloom: 'ivory' },
];
// The furnishings of two armies in the field (shared/worlds/props.mjs: what stands is solid, for bodies and blades
// alike), written for Azure's half and turned half round about the Crown Span for Crimson's, as the map itself is.
// Each stands off every route: off the siege road and its production pad, off the spawns, outside the capture rings,
// off the gate approaches to the ascents, and away from the bots' straight runs (the world's tests hold all of it).
const AZURE_PROPS = [
  // the camp: a row of tents along its back edge, behind the spawns
  { kind: 'tent', x: -18.5, z: -113.2, facing: 0 }, { kind: 'tent', x: -12.2, z: -113.6, facing: 0 },
  { kind: 'tent', x: 12.2, z: -113.6, facing: 0 },
  // between them, the camp's fires and the racks of its arms
  { kind: 'brazier', x: -4.6, z: -111.6 }, { kind: 'brazier', x: 4.6, z: -111.6 },
  { kind: 'rack', x: -7.4, z: -115.9, facing: 0 }, { kind: 'rack', x: 7.4, z: -115.9, facing: 0 },
  { kind: 'woodpile', x: -21.6, z: -108.5, length: 2.2, facing: 0 },
  // the supply dump in the camp's front corner, beside its west gatepost
  { kind: 'cart', x: -21.2, z: -86.6, facing: 0.05 },
  { kind: 'crate', x: -18.6, z: -85.0, turn: 0.15 }, { kind: 'crate', x: -17.8, z: -85.1, turn: -0.2, stack: true },
  { kind: 'barrel', x: -16.8, z: -84.6 }, { kind: 'barrel', x: -16.3, z: -85.4, tilt: 0.3 },
  { kind: 'sacks', x: -18.4, z: -87.1 },
  // the foundry's smithy, behind its console: an anvil, a heap of coal, its water and its iron
  { kind: 'anvil', x: 13.2, z: -107.4, facing: Math.PI / 2 }, { kind: 'ore', x: 19.4, z: -107.8 },
  { kind: 'barrel', x: 16.4, z: -108.6 }, { kind: 'crate', x: 21.2, z: -110.6, turn: 0.3, stack: true },
  // the side's standards either side of the camp's mouth, at the road's edge
  { kind: 'standard', x: -9.6, z: -84.2 }, { kind: 'standard', x: 9.6, z: -84.2 },
  // the forward camp: a barricade of crates and sacks at each back corner, stakes at its front ones, a lantern by each
  { kind: 'crate', x: -10.9, z: -62.4, turn: 0.1 }, { kind: 'crate', x: -10.2, z: -62.6, turn: -0.25, stack: true },
  { kind: 'sacks', x: -11.0, z: -61.0 },
  { kind: 'barrel', x: 10.8, z: -62.5 }, { kind: 'barrel', x: 10.2, z: -62.7, tilt: 0.4 }, { kind: 'sacks', x: 11.0, z: -61.1 },
  { kind: 'stakes', x: -10.4, z: -41.8, length: 3.4, facing: 0 }, { kind: 'stakes', x: 10.4, z: -41.8, length: 3.4, facing: 0 },
  { kind: 'lantern', x: -12.0, z: -59.6 }, { kind: 'lantern', x: 12.0, z: -59.6 },
  // the Western Bloom (on the canopy, 12 m up): stores and a lantern in its outer corners
  { kind: 'crate', x: -48.6, y: 12, z: -17.6, turn: 0.2 }, { kind: 'barrel', x: -47.6, y: 12, z: -17.9 },
  { kind: 'lantern', x: -49.4, y: 12, z: -16.4 },
  { kind: 'sacks', x: -48.5, y: 12, z: 3.6 }, { kind: 'lantern', x: -49.4, y: 12, z: 2.4 },
  { kind: 'crate', x: -27.6, y: 12, z: -17.8, turn: -0.1, stack: true }, { kind: 'lantern', x: -26.6, y: 12, z: -18.6 },
  // the west root shelf, nine metres down: miners' lanterns along its wall side, and what grows in the dark
  { kind: 'lantern', x: -20.4, y: -9, z: -18 }, { kind: 'lantern', x: -20.4, y: -9, z: 12 },
  { kind: 'fungus', x: -20.5, y: -9, z: -9 }, { kind: 'fungus', x: -20.5, y: -9, z: 4.5 },
  { kind: 'fungus', x: -20.5, y: -9, z: 20 }, { kind: 'fungus', x: -11.6, y: -9, z: -15 },
  { kind: 'barrel', x: -20.4, y: -9, z: -21.2 }, { kind: 'crate', x: -20.3, y: -9, z: 15.4, turn: 0.2 },
];
// (half round about the Crown Span: Crimson's half is Azure's, x and z both turned)
const mirrored = (prop) => ({ ...prop, x: -prop.x, z: -prop.z, ...(prop.facing !== undefined ? { facing: prop.facing + Math.PI } : {}),
  ...(prop.turn !== undefined ? { turn: prop.turn + Math.PI } : {}) });
const PROPS = Object.freeze([
  ...AZURE_PROPS.map((prop) => ({ ...prop, team: TEAMS.ATTACKERS })),
  ...AZURE_PROPS.map((prop) => ({ ...mirrored(prop), team: TEAMS.DEFENDERS })),
].map((prop, index) => Object.freeze({ id: `hg-prop-${index}`, ...prop })));

const solids = [
  // the armies' furnishings (above)
  ...propSolids(PROPS),
  // Structural railings on the edges of high crossbridges, above the
  // central vehicle road. These have *real* collision and won't draw
  // misleading phantom barriers in flight or first-person combat.
  ...[-57,0,57].flatMap((z,i) => [
    solid('bridge-rail-north-'+i,0,12.58,z+3.62,56,1.16,.34,'wood'),
    solid('bridge-rail-south-'+i,0,12.58,z-3.62,56,1.16,.34,'wood'),
  ]),
  // Gateposts and camp stockades flank the entry but never block the
  // 15m-wide siege road or the initial player spawn coordinates.
  ...[-1,1].flatMap(sign=>[-1,1].map(side=>
    solid('camp-entry-post-'+(sign>0?'crimson':'azure')+'-'+side,
      side*19.5,2.35,sign*91,1.55,4.7,1.55,'stone'))),
  // Trunks have matching collision. The crown foliage is stylized but not a
  // solid sphere: flyers can pass through leaves, not through wood.
  ...trees.map((t) => solid('trunk-' + t.id, t.x, t.height / 2 - 1, t.z,
    t.radius * 1.5, t.height, t.radius * 1.5, 'wood')),
  // Readable cover deliberately does not close the principal machine road.
  ...[-100, -52, 0, 52, 100].flatMap((z, i) => [
    solid('cover-west-' + i, -12, 1.05, z, 2, 2.1, 3, 'stone'),
    solid('cover-east-' + i, 12, 1.05, z, 2, 2.1, 3, 'stone'),
  ]),
  ...[-20, 20].flatMap((z, i) => [
    solid('canopy-cover-west-' + i, -46, 13.0, z, 2, 2, 2, 'timber'),
    solid('canopy-cover-east-' + i, 46, 13.0, z, 2, 2, 2, 'timber'),
  ]),
];
const objectives = [
  { id: 'azure-forward', name: 'Azure Forward Camp', x: 0, y: 0, z: -52, radius: 8, captureSec: 12,
    initialOwner: TEAMS.ATTACKERS, forwardTeam: TEAMS.ATTACKERS },
  { id: 'western-bloom', name: 'The Western Bloom', x: -38, y: 12, z: -7, radius: 9, captureSec: 12,
    initialOwner: TEAMS.ATTACKERS },
  { id: 'crown-span', name: 'The Crown Span', x: 0, y: 0, z: 0, radius: 10, captureSec: 15,
    initialOwner: null },
  { id: 'eastern-bloom', name: 'The Eastern Bloom', x: 38, y: 12, z: 7, radius: 9, captureSec: 12,
    initialOwner: TEAMS.DEFENDERS },
  { id: 'crimson-forward', name: 'Crimson Forward Camp', x: 0, y: 0, z: 52, radius: 8, captureSec: 12,
    initialOwner: TEAMS.DEFENDERS, forwardTeam: TEAMS.DEFENDERS },
];
const spawnPoints = [
  ...[-7, 0, 7].flatMap(x => [-105, -99].map(z => spawn(x, 0, z, TEAMS.ATTACKERS))),
  ...[-7, 0, 7].flatMap(x => [105, 99].map(z => spawn(x, 0, z, TEAMS.DEFENDERS))),
  spawn(-5, 0, -69, TEAMS.ATTACKERS, true),
  spawn(5, 0, -69, TEAMS.ATTACKERS, true),
  spawn(-5, 0, 69, TEAMS.DEFENDERS, true),
  spawn(5, 0, 69, TEAMS.DEFENDERS, true),
];
// Navigation is authoritative world metadata shared by bot brains. Connected
// road, canopy, root and ramp samples prevent AI from sprinting over the
// apparently shortest (but actually bottomless) straight line to a capture.
const nodes = [];
const nav = (id,x,y,z) => nodes.push({id,x,y,z});
for(let z=-108;z<=108;z+=12)nav('road-'+z,0,0,z);
// Route mouths must be within the actual bot-nav link reach (18m).
// Cover the 35m horizontal excursion from main road to side ascent ramps.
for(const [side,z] of [[-1,-102],[1,-102],[-1,102],[1,102]]){
  for(const x of [side*15,side*27,side*37])nav('camp-approach-'+side+'-'+z+'-'+x,x,0,z);
}

for(const side of [-1,1]){
  for(let z=-57;z<=63;z+=12)nav('canopy-'+side+'-'+z,side*38,12,z);
  for(let z=-24;z<=24;z+=12)nav('root-'+side+'-'+z,side*16,-9,z);
}
for(const z of [-57,0,57])for(let x=-36;x<=36;x+=12)nav('sky-'+z+'-'+x,x,12,z);
for(const z of [-28,0,28])for(let x=-15;x<=15;x+=10)nav('root-bridge-'+z+'-'+x,x,-9,z);
for(const r of ramps) {
  for(let t=0;t<=1.001;t+=.25) {
    nav('ramp-'+r.id+'-'+Math.round(t*4),
      r.axis==='x'?r.minX+(r.maxX-r.minX)*t:(r.minX+r.maxX)/2,
      r.startY+(r.endY-r.startY)*t,
      r.axis==='z'?r.minZ+(r.maxZ-r.minZ)*t:(r.minZ+r.maxZ)/2);
  }
}

export const HIGH_GROUNDS = Object.freeze({
  id: 'high-grounds', name: 'The High Grounds',
  floors: grounds, ramps, solids, trees, objectives, spawnPoints, props: PROPS,
  practiceSpawns: [
    { id:'crown', name:'Crown Span · ground level', x:0, y:0, z:4, yaw:0 },
    { id:'crown-west', name:'Crown Span · west side', x:-4, y:0, z:4, yaw:0 },
    { id:'crown-east', name:'Crown Span · east side', x:4, y:0, z:4, yaw:0 },
  ],
  practiceDestinations: [
    { id:'crown', name:'Crown Span', x:0, y:0, z:4, yaw:0 },
    { id:'canopy', name:'Western Canopy', x:-36, y:12, z:-5, yaw:Math.PI/2 },
    { id:'roots', name:'Lower Root Shelf', x:15, y:-9, z:12, yaw:0 },
    { id:'camp', name:'Azure Siege Road', x:0, y:0, z:-96, yaw:Math.PI },
  ],
  navigation: Object.freeze({nodes}),
  bounds: Object.freeze({ minX: -78, maxX: 78, minZ: -117, maxZ: 117 }),
  abyssY: -52,
  // Production pads are separate from the home spawn; the operator's station
  // and a real forward-travel corridor must remain clear.
  siegeFoundries: Object.freeze([
    { id: 'azure-foundry', team: TEAMS.ATTACKERS, x: 16, y: 0, z: -101, spawnX: 0, spawnZ: -87, heading: Math.PI },
    { id: 'crimson-foundry', team: TEAMS.DEFENDERS, x: -16, y: 0, z: 101, spawnX: 0, spawnZ: 87, heading: 0 },
  ]),
});
