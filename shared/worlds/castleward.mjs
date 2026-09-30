import { propSolids } from './props.mjs';

function yawToward(x, z, targetX = 0, targetZ = 0) {
  // Movement forward is (-sin(yaw), -cos(yaw)).
  return Math.atan2(x - targetX, z - targetZ);
}

function spawn(x, y, z, targetX = 0, targetZ = 0) {
  return { x, y, z, yaw: yawToward(x, z, targetX, targetZ) };
}

// The furnishings of a lived-in town (shared/worlds/props.mjs), each set against a wall, a post or a hedge: barrels,
// crates and a woodpile by the village houses; sacks by the stall; lanterns along the South Road; flowers at the walls'
// feet; and on the Tourney Field, archery butts against the hedge, a rack of practice blades and pennants on the
// gateway. The ones that stand are solid, for bodies and blades alike.
const PROPS = Object.freeze([
  { kind: 'barrel', x: -10.42, z: 6.55 }, { kind: 'barrel', x: -10.45, z: 5.9, tilt: 0.1 }, { kind: 'crate', x: -10.5, z: 4.4, turn: 0.2 },
  { kind: 'crate', x: -17.8, z: 9.28, turn: 0.1 }, { kind: 'crate', x: -17.1, z: 9.3, turn: -0.15, stack: true }, { kind: 'barrel', x: -16.2, z: 9.3 },
  { kind: 'woodpile', x: -15.3, z: -4.8, length: 2.4, facing: Math.PI / 2 },
  { kind: 'sacks', x: 6.45, z: 4.9 },
  { kind: 'lantern', x: -4.62, z: -11.5 }, { kind: 'lantern', x: 4.62, z: -11.5 }, { kind: 'lantern', x: -4.62, z: -18 }, { kind: 'lantern', x: 4.62, z: -18 },
  { kind: 'flowers', x: -13.5, z: 9.35 }, { kind: 'flowers', x: 12.2, z: 11.35 }, { kind: 'flowers', x: 19.5, z: 11.3 },
  { kind: 'flowers', x: -20.9, z: -7.35 }, { kind: 'flowers', x: 7.2, z: -7.35 }, { kind: 'flowers', x: 22.2, z: -8.25 },
  { kind: 'target', x: 23.05, z: -11.2, facing: -Math.PI / 2 }, { kind: 'target', x: 23.05, z: -14.6, facing: -Math.PI / 2 },
  { kind: 'target', x: 23.05, z: -17.2, facing: -Math.PI / 2 },
  { kind: 'rack', x: 12.5, z: -22.0, facing: 0 },
  { kind: 'pennant', x: 11.0, z: -7.8, height: 3.4 }, { kind: 'pennant', x: 16.6, z: -7.8, height: 3.4 },
  ].map((prop, index) => Object.freeze({ id: `prop-${index}`, ...prop })));

// a waypoint for bots finding their way (feet)
function nav(id, x, y, z) {
  return Object.freeze({ id, x, y, z });
}

export const CASTLEWARD = Object.freeze({
  id: 'castleward',
  name: 'Castleward',
  zones: Object.freeze([
    { id: 'town-green', name: 'Town Green', center: [0, 0, 0], radius: 9 },
    { id: 'castle-bailey', name: 'Castle Bailey', center: [0, 2.5, 21.5], radius: 9 },
    { id: 'west-village', name: 'West Village', center: [-15, 0, 1], radius: 8 },
    { id: 'east-meadow', name: 'East Meadow', center: [16, 0, 2], radius: 9 },
    { id: 'south-road', name: 'South Road', center: [0, 0, -15.5], radius: 8 },
    // open ground for a straight fight: through the gateway in the meadow's south wall
    { id: 'tourney-field', name: 'Tourney Field', center: [14.5, 0, -15.2], radius: 8 },
  ]),
  // Traversal rules. Ordinary running, sprinting or dashing never carries anyone into the abyss:
  //  * every ground-level edge of the map is closed by a visible boundary at least 1.5 m tall (a jump peaks at
  //    about 1.44 m): village palisade, field walls, hedgerow, road banks and castle curtain walls;
  //  * interior drops land on another floor, and the tall ones are marked with a low lip (kind 'lip');
  //  * the one deliberate hazard is the Broken Bridge beyond the South Gate: its broken end is a low lip
  //    (hazard: true) that only a jump carries you over.
  floors: [
    // Central market green. The east/west/south pieces deliberately overlap it
    // slightly so all primary routes are ordinary running routes.
    { id: 'town-green', center: [0, -0.15, 0], size: [18, 0.3, 16], y: 0, material: 'grass' },
    { id: 'west-village', center: [-15, -0.15, 1], size: [14, 0.3, 18], y: 0, material: 'earth' },
    { id: 'east-meadow', center: [16, -0.15, 2], size: [16, 0.3, 20], y: 0, material: 'grass' },
    { id: 'south-road', center: [0, -0.15, -15.5], size: [10, 0.3, 17], y: 0, material: 'earth' },
    // The forecourt spans the full castle front, so nothing opens between it, the village and the meadow, and a
    // drop from the Bailey's front edge lands on it.
    { id: 'castle-approach', center: [0, -0.15, 12.25], size: [18, 0.3, 9.5], y: 0, material: 'earth' },
    { id: 'castle-bailey', center: [0, 2.35, 21.5], size: [18, 0.3, 9], y: 2.5, material: 'stone' },
    { id: 'west-wall-walk', center: [-7.4, 3.85, 23.15], size: [3, 0.3, 5.3], y: 4, material: 'stone' },
    { id: 'east-wall-walk', center: [7.4, 3.85, 23.15], size: [3, 0.3, 5.3], y: 4, material: 'stone' },
    // beyond the South Gate the road runs out onto a bridge that ends in a broken span
    { id: 'broken-bridge', center: [0, -0.15, -26], size: [6, 0.3, 4], y: 0, material: 'stone' },
    // the Tourney Field: open grass south of the meadow, reached through the gateway in the field wall. It runs under
    // the road's east bank and the meadow's wall, so no strip of it is left without ground
    { id: 'tourney-field', center: [14.55, -0.15, -15.2], size: [19.3, 0.3, 14.8], y: 0, material: 'grass' },
  ],
  ramps: [
    // Wide central castle climb: no Dash/jump is required.
    { id: 'castle-ramp', minX: -4, maxX: 4, minZ: 14, maxZ: 18, startY: 0, endY: 2.5, axis: 'z' },
    // Straight 3 m stairs from the Bailey's front corners up onto the wall walks.
    { id: 'west-wall-ramp', minX: -8.9, maxX: -5.9, minZ: 17.5, maxZ: 20.5, startY: 2.5, endY: 4, axis: 'z' },
    { id: 'east-wall-ramp', minX: 5.9, maxX: 8.9, minZ: 17.5, maxZ: 20.5, startY: 2.5, endY: 4, axis: 'z' },
  ],
  solids: [
    // Castle gatehouse pieces leave a broad readable center lane to the ramp.
    { id: 'castle-gate-west', center: [-5.8, 2.0, 15.8], size: [3.2, 4, 2.2], material: 'limestone' },
    { id: 'castle-gate-east', center: [5.8, 2.0, 15.8], size: [3.2, 4, 2.2], material: 'limestone' },
    { id: 'bailey-back-wall', center: [0, 4.0, 26.25], size: [18.5, 3.0, 0.5], material: 'limestone' },
    { id: 'bailey-west-wall', center: [-9.15, 4.0, 22], size: [0.5, 3.0, 8.5], material: 'limestone' },
    { id: 'bailey-east-wall', center: [9.15, 4.0, 22], size: [0.5, 3.0, 8.5], material: 'limestone' },
    // masonry under the high end of the castle ramp (below its running surface), so nothing can pass beneath it
    { id: 'castle-ramp-footing', center: [0, 0.6, 17.25], size: [8, 1.2, 1.5], material: 'limestone', kind: 'footing' },
    // curtain walls close the forecourt's sides down to the ground
    { id: 'forecourt-west-wall', center: [-9.15, 2.75, 13.875], size: [0.5, 5.5, 7.75], material: 'limestone', kind: 'curtain' },
    { id: 'forecourt-east-wall', center: [9.15, 2.75, 14.875], size: [0.5, 5.5, 5.75], material: 'limestone', kind: 'curtain' },
    // the wall walks are reached by their stairs; a waist-high balustrade stops a side-step off them (and keeps
    // the Bailey from walking underneath)
    { id: 'west-walk-balustrade', center: [-5.75, 3.75, 21.9], size: [0.3, 2.5, 7.6], material: 'limestone', kind: 'balustrade' },
    { id: 'east-walk-balustrade', center: [5.75, 3.75, 21.9], size: [0.3, 2.5, 7.6], material: 'limestone', kind: 'balustrade' },
    // the Bailey's raised floor has a masonry front face beside the gatehouse, so the forecourt corners are closed
    { id: 'bailey-front-west', center: [-6.55, 1.25, 17.2], size: [4.7, 2.5, 0.4], material: 'limestone', kind: 'curtain' },
    { id: 'bailey-front-east', center: [6.55, 1.25, 17.2], size: [4.7, 2.5, 0.4], material: 'limestone', kind: 'curtain' },
    // the Bailey's front corners drop 2.5 m to the forecourt: marked by a lip, crossed only by a jump
    { id: 'bailey-west-lip', center: [-8.15, 2.72, 17.15], size: [1.5, 0.45, 0.3], material: 'limestone', kind: 'lip' },
    { id: 'bailey-east-lip', center: [8.15, 2.72, 17.15], size: [1.5, 0.45, 0.3], material: 'limestone', kind: 'lip' },

    // West Village building masses define cover and a crooked lane without
    // closing the Town Green connector at x=-9.
    { id: 'west-house-north', center: [-18.7, 1.8, 6.6], size: [5.0, 3.6, 5.2], material: 'plaster' },
    { id: 'west-house-south', center: [-18.3, 1.7, -4.8], size: [5.5, 3.4, 4.8], material: 'timber' },
    { id: 'west-house-mid', center: [-12.4, 1.5, 5.4], size: [3.3, 3.0, 3.5], material: 'plaster' },
    { id: 'west-outer-bank', center: [-22.15, 1.1, 0.9], size: [0.4, 2.2, 18.8], material: 'stone', kind: 'bank' },
    { id: 'village-north-palisade', center: [-15.675, 0.8, 9.8], size: [12.55, 1.6, 0.4], material: 'timber', kind: 'palisade' },

    // East Meadow remains open through z=0; chapel ruins and hedges sit off-axis.
    { id: 'chapel-north-wall', center: [18.0, 1.7, 8.0], size: [7.0, 3.4, 0.55], material: 'limestone' },
    { id: 'chapel-east-wall', center: [21.2, 1.7, 5.3], size: [0.55, 3.4, 5.8], material: 'limestone' },
    { id: 'chapel-pillar', center: [15.1, 1.4, 6.0], size: [1.1, 2.8, 1.1], material: 'limestone' },
    { id: 'east-hedgerow', center: [23.75, 0.8, 2], size: [0.5, 1.6, 20.4], material: 'hedge', kind: 'hedge' },
    { id: 'meadow-north-hedge', center: [16.575, 0.8, 11.8], size: [14.35, 1.6, 0.4], material: 'hedge', kind: 'hedge' },

    // South gate: its arch opens onto the Broken Bridge.
    { id: 'south-gate-west', center: [-4.0, 1.9, -22.6], size: [2.1, 3.8, 2.4], material: 'limestone' },
    { id: 'south-gate-east', center: [4.0, 1.9, -22.6], size: [2.1, 3.8, 2.4], material: 'limestone' },
    { id: 'south-road-west-bank', center: [-5.15, 0.8, -14.675], size: [0.4, 1.6, 14.15], material: 'stone', kind: 'bank' },
    { id: 'south-road-east-bank', center: [5.15, 0.8, -14.675], size: [0.4, 1.6, 14.15], material: 'stone', kind: 'bank' },
    { id: 'bridge-west-parapet', center: [-2.3, 0.55, -25.9], size: [0.4, 1.1, 4.2], material: 'stone', kind: 'parapet' },
    { id: 'bridge-east-parapet', center: [2.3, 0.55, -25.9], size: [0.4, 1.1, 4.2], material: 'stone', kind: 'parapet' },
    { id: 'bridge-broken-lip', center: [0, 0.22, -27.8], size: [4.2, 0.45, 0.4], material: 'stone', kind: 'lip', hazard: true },

    // field walls close the south edge of the village, the green and the meadow
    { id: 'south-field-wall-west', center: [-13.85, 0.8, -7.8], size: [17, 1.6, 0.4], material: 'stone', kind: 'field-wall' },
    // (east of the road it opens in a 5 m gateway onto the Tourney Field, between two posts)
    { id: 'south-field-wall-east', center: [8.325, 0.8, -7.8], size: [5.95, 1.6, 0.4], material: 'stone', kind: 'field-wall' },
    { id: 'south-field-wall-far-east', center: [20.25, 0.8, -7.8], size: [7.9, 1.6, 0.4], material: 'stone', kind: 'field-wall' },
    { id: 'tourney-gatepost-west', center: [11.0, 1.15, -7.8], size: [0.7, 2.3, 0.7], material: 'stone', kind: 'gatepost' },
    { id: 'tourney-gatepost-east', center: [16.6, 1.15, -7.8], size: [0.7, 2.3, 0.7], material: 'stone', kind: 'gatepost' },

    // the Tourney Field's own bounds: the hedgerow carries on down its east side, a field wall along the ravine
    { id: 'tourney-east-hedge', center: [23.75, 0.8, -15.2], size: [0.5, 1.6, 14.8], material: 'hedge', kind: 'hedge' },
    { id: 'tourney-south-wall', center: [14.6, 0.8, -22.5], size: [19.2, 1.6, 0.4], material: 'stone', kind: 'field-wall' },
    // and very little in it: a pavilion in the far corner, two stacks of straw to break a line of sight
    { id: 'tourney-pavilion', center: [20.6, 1.2, -19.6], size: [3.4, 2.4, 3.4], material: 'cloth', kind: 'pavilion' },
    { id: 'tourney-bales-west', center: [9.6, 0.5, -17.6], size: [1.8, 1.0, 1.1], material: 'straw', kind: 'bales' },
    { id: 'tourney-bales-east', center: [18.4, 0.5, -12.4], size: [1.1, 1.0, 1.8], material: 'straw', kind: 'bales' },

    // braziers flank the ramp foot (clear of its 8 m lane) and light the meadow; old rune stones stand by the chapel
    { id: 'forecourt-brazier-west', center: [-5.2, 0.65, 13.3], size: [0.62, 1.3, 0.62], material: 'stone', kind: 'brazier' },
    { id: 'forecourt-brazier-east', center: [5.2, 0.65, 13.3], size: [0.62, 1.3, 0.62], material: 'stone', kind: 'brazier' },
    { id: 'meadow-brazier', center: [13.4, 0.65, 3.4], size: [0.62, 1.3, 0.62], material: 'stone', kind: 'brazier' },
    { id: 'chapel-rune-a', center: [20.4, 0.75, -0.5], size: [0.7, 1.5, 0.5], material: 'stone', kind: 'rune-stone' },
    { id: 'chapel-rune-b', center: [13.6, 0.65, 9.4], size: [0.7, 1.3, 0.5], material: 'stone', kind: 'rune-stone' },
    { id: 'chapel-rune-c', center: [22.4, 0.72, 9.2], size: [0.5, 1.45, 0.7], material: 'stone', kind: 'rune-stone' },
    { id: 'village-rune', center: [-21.3, 0.6, -6.9], size: [0.7, 1.2, 0.5], material: 'stone', kind: 'rune-stone' },

    // Town Green cover stays sparse enough for the north/east route tests and
    // preserves a readable central duel space.
    { id: 'market-well', center: [-2.8, 0.75, -1.0], size: [1.8, 1.5, 1.8], material: 'stone' },
    // (its roof on two posts and a beam, head high over the well)
    { id: 'market-well-post-west', center: [-3.58, 1.65, -1.0], size: [0.14, 1.5, 0.14], material: 'timber' },
    { id: 'market-well-post-east', center: [-2.02, 1.65, -1.0], size: [0.14, 1.5, 0.14], material: 'timber' },
    { id: 'market-well-beam', center: [-2.8, 2.25, -1.0], size: [1.8, 0.12, 0.12], material: 'timber' },
    { id: 'market-stall-base', center: [4.8, 0.65, 4.0], size: [2.8, 1.3, 2.2], material: 'timber' },
    // (its awning on four corner posts)
    { id: 'market-stall-post-nw', center: [3.46, 1.125, 3.0], size: [0.12, 2.25, 0.12], material: 'timber' },
    { id: 'market-stall-post-ne', center: [6.14, 1.125, 3.0], size: [0.12, 2.25, 0.12], material: 'timber' },
    { id: 'market-stall-post-se', center: [6.14, 1.125, 5.0], size: [0.12, 2.25, 0.12], material: 'timber' },
    { id: 'market-stall-post-sw', center: [3.46, 1.125, 5.0], size: [0.12, 2.25, 0.12], material: 'timber' },
    // the furnishings that stand in the way (above)
    ...propSolids(PROPS),
  ],
  props: PROPS,
  spawnPoints: [
    spawn(-6.0, 0, -4.5),
    spawn(6.0, 0, -4.5),
    spawn(-6.5, 0, 4.0),
    spawn(7.4, 0, 3.6),
    spawn(-18.0, 0, -1.0),
    spawn(-13.5, 0, 1.8),
    spawn(19.0, 0, -4.5),
    spawn(19.0, 0, 3.0),
    spawn(-2.5, 0, -18.5),
    spawn(2.5, 0, -18.5),
    spawn(-4.4, 2.5, 22.5),
    spawn(4.4, 2.5, 22.5),
    spawn(8.5, 0, -12.5, 14.5, -15),
    spawn(20.5, 0, -15.5, 14.5, -15),
  ],
  // where bots find their way round (shared/sim/botNav.mjs): the middle of each open space, each gate, each end of a
  // ramp; linked wherever a knight could run straight between them
  navigation: Object.freeze({
    nodes: Object.freeze([
      // the green and the castle approach
      nav('green', 0, 0, 3), nav('green-south', 0, 0, -5.5), nav('green-east', 6.5, 0, -1), nav('green-west', -6.5, 0, 2.5),
      nav('approach', 0, 0, 10.5), nav('approach-west', -7, 0, 9), nav('approach-east', 7, 0, 9),
      // up the ramp to the bailey, and up to each wall walk
      nav('ramp-top', 0, 2.5, 19.5), nav('bailey', 0, 2.5, 23), nav('bailey-west', -4.8, 2.5, 17.75), nav('bailey-east', 4.8, 2.5, 17.75),
      nav('west-walk-foot', -7, 2.5, 17.75), nav('west-walk', -7.4, 4, 22.5),
      nav('east-walk-foot', 7, 2.5, 17.75), nav('east-walk', 7.4, 4, 22.5),
      // the west village
      nav('village', -12, 0, 0), nav('village-west', -18.5, 0, 0.5), nav('village-south', -12.5, 0, -5.5), nav('village-north', -12, 0, 8.5),
      // the east meadow and the chapel
      nav('meadow', 12, 0, 0), nav('meadow-east', 18.5, 0, 1.5), nav('chapel', 18, 0, 5), nav('meadow-north', 12, 0, 9.5),
      // the south road and the bridge
      nav('road', 0, 0, -11), nav('road-south', 0, 0, -18.5), nav('south-gate', 0, 0, -22.6), nav('bridge', 0, 0, -25.5),
      // the tourney field, through its gate
      nav('tourney-gate-north', 13.8, 0, -5.5), nav('tourney-gate-south', 13.8, 0, -10), nav('tourney', 13.5, 0, -15),
      nav('tourney-west', 7.5, 0, -14), nav('tourney-southwest', 7.5, 0, -20.5), nav('tourney-east', 21, 0, -12.5),
      nav('tourney-south', 14, 0, -20.5),
    ]),
  }),
  navigationHints: Object.freeze([
    { id: 'green-to-bailey', from: [0, 0, 5], to: [0, 2.5, 22], kind: 'run-ramp' },
    { id: 'green-to-west', from: [-7, 0, 1], to: [-17, 0, 1], kind: 'run' },
    { id: 'green-to-east', from: [7, 0, 0], to: [20, 0, 0], kind: 'run' },
    { id: 'green-to-south', from: [0, 0, -7], to: [0, 0, -20], kind: 'run' },
    { id: 'meadow-to-tourney', from: [13.8, 0, -3], to: [13.8, 0, -15], kind: 'run' },
  ]),
  abyssY: -9,
});
