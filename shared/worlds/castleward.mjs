function yawToward(x, z, targetX = 0, targetZ = 0) {
  // Movement forward is (-sin(yaw), -cos(yaw)).
  return Math.atan2(x - targetX, z - targetZ);
}

function spawn(x, y, z, targetX = 0, targetZ = 0) {
  return { x, y, z, yaw: yawToward(x, z, targetX, targetZ) };
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
    { id: 'south-field-wall-east', center: [14.775, 0.8, -7.8], size: [18.85, 1.6, 0.4], material: 'stone', kind: 'field-wall' },

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
    { id: 'market-stall-base', center: [4.8, 0.65, 4.0], size: [2.8, 1.3, 2.2], material: 'timber' },
  ],
  spawnPoints: [
    spawn(-6.0, 0, -4.5),
    spawn(6.0, 0, -4.5),
    spawn(-6.5, 0, 4.0),
    spawn(6.5, 0, 4.0),
    spawn(-18.0, 0, -1.0),
    spawn(-14.0, 0, 7.0),
    spawn(19.0, 0, -4.5),
    spawn(19.0, 0, 3.0),
    spawn(-2.5, 0, -18.5),
    spawn(2.5, 0, -18.5),
    spawn(-4.4, 2.5, 22.5),
    spawn(4.4, 2.5, 22.5),
  ],
  navigationHints: Object.freeze([
    { id: 'green-to-bailey', from: [0, 0, 5], to: [0, 2.5, 22], kind: 'run-ramp' },
    { id: 'green-to-west', from: [-7, 0, 1], to: [-17, 0, 1], kind: 'run' },
    { id: 'green-to-east', from: [7, 0, 0], to: [20, 0, 0], kind: 'run' },
    { id: 'green-to-south', from: [0, 0, -7], to: [0, 0, -20], kind: 'run' },
  ]),
  abyssY: -9,
});
