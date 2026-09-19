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
  floors: [
    // Central market green. The east/west/south pieces deliberately overlap it
    // slightly so all primary routes are ordinary running routes.
    { id: 'town-green', center: [0, -0.15, 0], size: [18, 0.3, 16], y: 0, material: 'grass' },
    { id: 'west-village', center: [-15, -0.15, 1], size: [14, 0.3, 18], y: 0, material: 'earth' },
    { id: 'east-meadow', center: [16, -0.15, 2], size: [16, 0.3, 20], y: 0, material: 'grass' },
    { id: 'south-road', center: [0, -0.15, -15.5], size: [10, 0.3, 17], y: 0, material: 'earth' },
    { id: 'castle-approach', center: [0, -0.15, 11], size: [11, 0.3, 7], y: 0, material: 'earth' },
    { id: 'castle-bailey', center: [0, 2.35, 21.5], size: [18, 0.3, 9], y: 2.5, material: 'stone' },
    { id: 'west-wall-walk', center: [-7.6, 3.85, 21.5], size: [2.4, 0.3, 8], y: 4, material: 'stone' },
    { id: 'east-wall-walk', center: [7.6, 3.85, 21.5], size: [2.4, 0.3, 8], y: 4, material: 'stone' },
  ],
  ramps: [
    // Wide central castle climb: no Dash/jump is required.
    { id: 'castle-ramp', minX: -4, maxX: 4, minZ: 14, maxZ: 18, startY: 0, endY: 2.5, axis: 'z' },
    // Short side stair-equivalents from Bailey to its low wall walks.
    { id: 'west-wall-ramp', minX: -8, maxX: -5.5, minZ: 18, maxZ: 20.5, startY: 2.5, endY: 4, axis: 'x' },
    { id: 'east-wall-ramp', minX: 5.5, maxX: 8, minZ: 18, maxZ: 20.5, startY: 2.5, endY: 4, axis: 'x' },
  ],
  solids: [
    // Castle gatehouse pieces leave a broad readable center lane to the ramp.
    { id: 'castle-gate-west', center: [-5.8, 2.0, 15.8], size: [3.2, 4, 2.2], material: 'limestone' },
    { id: 'castle-gate-east', center: [5.8, 2.0, 15.8], size: [3.2, 4, 2.2], material: 'limestone' },
    { id: 'bailey-back-wall', center: [0, 4.0, 26.25], size: [18.5, 3.0, 0.5], material: 'limestone' },
    { id: 'bailey-west-wall', center: [-9.15, 4.0, 22], size: [0.5, 3.0, 8.5], material: 'limestone' },
    { id: 'bailey-east-wall', center: [9.15, 4.0, 22], size: [0.5, 3.0, 8.5], material: 'limestone' },

    // West Village building masses define cover and a crooked lane without
    // closing the Town Green connector at x=-9.
    { id: 'west-house-north', center: [-18.7, 1.8, 6.6], size: [5.0, 3.6, 5.2], material: 'plaster' },
    { id: 'west-house-south', center: [-18.3, 1.7, -4.8], size: [5.5, 3.4, 4.8], material: 'timber' },
    { id: 'west-house-mid', center: [-12.4, 1.5, 5.4], size: [3.3, 3.0, 3.5], material: 'plaster' },
    { id: 'west-outer-bank', center: [-22.15, 1.1, 0.5], size: [0.4, 2.2, 18], material: 'stone' },

    // East Meadow remains open through z=0; chapel ruins and hedges sit off-axis.
    { id: 'chapel-north-wall', center: [18.0, 1.7, 8.0], size: [7.0, 3.4, 0.55], material: 'limestone' },
    { id: 'chapel-east-wall', center: [21.2, 1.7, 5.3], size: [0.55, 3.4, 5.8], material: 'limestone' },
    { id: 'chapel-pillar', center: [15.1, 1.4, 6.0], size: [1.1, 2.8, 1.1], material: 'limestone' },
    { id: 'east-hedge-north', center: [23.75, 0.7, 10], size: [0.5, 1.4, 4], material: 'hedge' },
    { id: 'east-hedge-south', center: [23.75, 0.7, -6], size: [0.5, 1.4, 4], material: 'hedge' },

    // South gate visually terminates the road while leaving its central arch open.
    { id: 'south-gate-west', center: [-4.0, 1.9, -22.6], size: [2.1, 3.8, 2.4], material: 'limestone' },
    { id: 'south-gate-east', center: [4.0, 1.9, -22.6], size: [2.1, 3.8, 2.4], material: 'limestone' },
    { id: 'south-road-west-bank', center: [-5.15, 0.85, -15.5], size: [0.4, 1.7, 12.5], material: 'stone' },
    { id: 'south-road-east-bank', center: [5.15, 0.85, -15.5], size: [0.4, 1.7, 12.5], material: 'stone' },

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
    spawn(-5.5, 2.5, 22.0),
    spawn(5.5, 2.5, 22.0),
  ],
  navigationHints: Object.freeze([
    { id: 'green-to-bailey', from: [0, 0, 5], to: [0, 2.5, 22], kind: 'run-ramp' },
    { id: 'green-to-west', from: [-7, 0, 1], to: [-17, 0, 1], kind: 'run' },
    { id: 'green-to-east', from: [7, 0, 0], to: [20, 0, 0], kind: 'run' },
    { id: 'green-to-south', from: [0, 0, -7], to: [0, 0, -20], kind: 'run' },
  ]),
  abyssY: -9,
});
