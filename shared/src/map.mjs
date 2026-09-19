function yawTowardKeep(x, z, targetX = 0, targetZ = 0) {
  // Movement forward is (-sin(yaw), -cos(yaw)), so this is the yaw whose
  // forward vector points from the spawn toward the requested arena target.
  return Math.atan2(x - targetX, z - targetZ);
}

export const KEEP_HORIZONTAL_SCALE = 1.1;

const BASE_KEEP = {
  name: 'The Shattered Keep',
  floors: [
    { id: 'courtyard', center: [0, -0.15, 0], size: [18, 0.3, 18], y: 0, material: 'stone' },
    { id: 'west-hall', center: [-13.5, -0.15, 0], size: [9, 0.3, 12], y: 0, material: 'stone' },
    { id: 'east-hall', center: [13.5, -0.15, 0], size: [9, 0.3, 12], y: 0, material: 'stone' },
    { id: 'north-apron', center: [0, -0.15, 10.5], size: [14, 0.3, 3], y: 0, material: 'stone' },
    { id: 'north-battlement', center: [0, 2.85, 13], size: [14, 0.3, 3.5], y: 3, material: 'stone' },
    { id: 'south-approach', center: [0, -0.15, -10.5], size: [8, 0.3, 3], y: 0, material: 'stone' },
    { id: 'broken-bridge-north', center: [0, -0.15, -13.7], size: [5.5, 0.3, 3.4], y: 0, material: 'stone' },
    { id: 'broken-bridge-south', center: [0, -0.15, -18.3], size: [5.5, 0.3, 3.4], y: 0, material: 'stone' },
    { id: 'south-tower', center: [0, -0.15, -22.5], size: [10, 0.3, 5], y: 0, material: 'stone' },
  ],
  ramps: [
    { id: 'north-ramp-left', minX: -6.5, maxX: -3.5, minZ: 8.5, maxZ: 11.5, startY: 0, endY: 3, axis: 'z' },
    { id: 'north-ramp-right', minX: 3.5, maxX: 6.5, minZ: 8.5, maxZ: 11.5, startY: 0, endY: 3, axis: 'z' },
  ],
  solids: [
    { id: 'arcane-spire-base', center: [0, 0.95, 0], size: [1.8, 1.9, 1.8], material: 'arcane' },
    { id: 'pillar-nw', center: [-5, 1.5, 5], size: [1.4, 3, 1.4], material: 'stone' },
    { id: 'pillar-ne', center: [5, 1.5, 5], size: [1.4, 3, 1.4], material: 'stone' },
    { id: 'pillar-sw', center: [-5, 1.5, -5], size: [1.4, 3, 1.4], material: 'stone' },
    { id: 'pillar-se', center: [5, 1.5, -5], size: [1.4, 3, 1.4], material: 'stone' },
    { id: 'west-north-wall', center: [-13.5, 1.4, 6], size: [10, 2.8, 0.7], material: 'stone' },
    { id: 'west-south-wall', center: [-13.5, 1.4, -6], size: [10, 2.8, 0.7], material: 'stone' },
    { id: 'west-outer-wall', center: [-18, 1.4, 0], size: [0.7, 2.8, 12], material: 'stone' },
    { id: 'west-divider-a', center: [-9.2, 1.3, 4.5], size: [0.7, 2.6, 3], material: 'stone' },
    { id: 'west-divider-b', center: [-9.2, 1.3, -4.5], size: [0.7, 2.6, 3], material: 'stone' },
    { id: 'east-north-wall', center: [13.5, 1.4, 6], size: [10, 2.8, 0.7], material: 'stone' },
    { id: 'east-south-wall', center: [13.5, 1.4, -6], size: [10, 2.8, 0.7], material: 'stone' },
    { id: 'east-outer-wall', center: [18, 1.4, 0], size: [0.7, 2.8, 12], material: 'stone' },
    { id: 'east-gallery-cover-a', center: [11.5, 1.1, 2.8], size: [1.3, 2.2, 1.3], material: 'stone' },
    { id: 'east-gallery-cover-b', center: [15, 1.1, -2.8], size: [1.3, 2.2, 1.3], material: 'stone' },
    { id: 'north-battlement-back', center: [0, 4.2, 14.7], size: [15, 2.4, 0.6], material: 'stone' },
    { id: 'bridge-left-ruin', center: [-3, 1.0, -15.5], size: [0.7, 2.0, 2.5], material: 'stone' },
    { id: 'bridge-right-ruin', center: [3, 1.0, -18], size: [0.7, 2.0, 2.5], material: 'stone' },
  ],
  spawnPoints: [
    { x: -6.5, y: 0, z: -6.5 },
    { x: 6.5, y: 0, z: -6.5 },
    { x: -6.5, y: 0, z: 6.5 },
    { x: 6.5, y: 0, z: 6.5 },
    { x: -15.5, y: 0, z: 0 },
    { x: 15.5, y: 0, z: 0 },
    { x: -5, y: 3, z: 13 },
    { x: 5, y: 3, z: 13 },
    { x: -1.7, y: 0, z: -21.5 },
    { x: 1.7, y: 0, z: -21.5 },
  ],
  abyssY: -9,
};

function scaleCenter([x, y, z]) {
  return [x * KEEP_HORIZONTAL_SCALE, y, z * KEEP_HORIZONTAL_SCALE];
}

function scaleFloor(floor) {
  return {
    ...floor,
    center: scaleCenter(floor.center),
    size: [floor.size[0] * KEEP_HORIZONTAL_SCALE, floor.size[1], floor.size[2] * KEEP_HORIZONTAL_SCALE],
  };
}

function scaleRamp(ramp) {
  return {
    ...ramp,
    minX: ramp.minX * KEEP_HORIZONTAL_SCALE,
    maxX: ramp.maxX * KEEP_HORIZONTAL_SCALE,
    minZ: ramp.minZ * KEEP_HORIZONTAL_SCALE,
    maxZ: ramp.maxZ * KEEP_HORIZONTAL_SCALE,
  };
}

function scaleSolid(solid) {
  const stretchBoundary = solid.id.includes('wall') || solid.id === 'north-battlement-back';
  return {
    ...solid,
    center: scaleCenter(solid.center),
    size: stretchBoundary
      ? [solid.size[0] * KEEP_HORIZONTAL_SCALE, solid.size[1], solid.size[2] * KEEP_HORIZONTAL_SCALE]
      : [...solid.size],
  };
}

function scaleSpawn(spawn) {
  const x = spawn.x * KEEP_HORIZONTAL_SCALE;
  const z = spawn.z * KEEP_HORIZONTAL_SCALE;
  return { ...spawn, x, z, yaw: yawTowardKeep(x, z) };
}

export const SHATTERED_KEEP = Object.freeze({
  name: BASE_KEEP.name,
  floors: BASE_KEEP.floors.map(scaleFloor),
  ramps: BASE_KEEP.ramps.map(scaleRamp),
  solids: BASE_KEEP.solids.map(scaleSolid),
  spawnPoints: BASE_KEEP.spawnPoints.map(scaleSpawn),
  abyssY: BASE_KEEP.abyssY,
});

export const SPAWN_POINTS = SHATTERED_KEEP.spawnPoints;
