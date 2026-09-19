import { KEEP_HORIZONTAL_SCALE } from '../../shared/src/map.mjs';

export const KEEP_ROUTE_COLORS = Object.freeze({
  courtyard: 0x32d7f2,
  west: 0xff9a48,
  east: 0x9a72ff,
  north: 0x9c3344,
});

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function range(random, min, max) {
  return min + (max - min) * random();
}

function placeInExpandedKeep(piece) {
  return {
    ...piece,
    ...(Number.isFinite(piece.x) ? { x: piece.x * KEEP_HORIZONTAL_SCALE } : {}),
    ...(Number.isFinite(piece.z) ? { z: piece.z * KEEP_HORIZONTAL_SCALE } : {}),
  };
}

function rubbleCluster(random, prefix, centerX, centerZ, count, spreadX, spreadZ) {
  const rubble = [];
  for (let i = 0; i < count; i += 1) {
    rubble.push({
      id: `${prefix}-${i}`,
      x: centerX + range(random, -spreadX, spreadX),
      y: 0.05 + range(random, 0, 0.08),
      z: centerZ + range(random, -spreadZ, spreadZ),
      sx: range(random, 0.16, 0.48),
      sy: range(random, 0.1, 0.25),
      sz: range(random, 0.16, 0.55),
      ry: range(random, 0, Math.PI),
      rz: range(random, -0.28, 0.28),
    });
  }
  return rubble;
}

export function buildKeepDecorPlan(seed = 1337) {
  const random = mulberry32(seed);

  const rubble = [
    ...rubbleCluster(random, 'court-rubble', -6.8, 6.8, 6, 1.2, 1.1),
    ...rubbleCluster(random, 'west-rubble', -15.8, 4.8, 5, 1.2, 0.75),
    ...rubbleCluster(random, 'east-rubble', 15.6, -4.5, 5, 1.1, 0.75),
    ...rubbleCluster(random, 'south-rubble', 2.5, -10.8, 4, 1.0, 0.55),
  ].map(placeInExpandedKeep);

  const bridgeEdges = [
    { id: 'bridge-break-nl', x: -2.25, y: -0.18, z: -15.28, sx: 1.0, sy: 0.34, sz: 0.38, rx: 0.08, rz: -0.18 },
    { id: 'bridge-break-nc', x: -0.55, y: -0.21, z: -15.34, sx: 1.4, sy: 0.38, sz: 0.32, rx: -0.06, rz: 0.12 },
    { id: 'bridge-break-nr', x: 1.65, y: -0.18, z: -15.3, sx: 1.45, sy: 0.32, sz: 0.36, rx: 0.12, rz: 0.2 },
    { id: 'bridge-break-sl', x: -1.75, y: -0.20, z: -16.7, sx: 1.5, sy: 0.36, sz: 0.36, rx: -0.08, rz: 0.18 },
    { id: 'bridge-break-sc', x: 0.25, y: -0.22, z: -16.66, sx: 1.2, sy: 0.4, sz: 0.32, rx: 0.07, rz: -0.15 },
    { id: 'bridge-break-sr', x: 2.15, y: -0.18, z: -16.73, sx: 0.9, sy: 0.3, sz: 0.4, rx: -0.1, rz: -0.22 },
    { id: 'bridge-hanging-left', x: -2.52, y: -0.65, z: -15.95, sx: 0.32, sy: 0.85, sz: 0.5, rx: 0.24, rz: -0.08 },
    { id: 'bridge-hanging-right', x: 2.42, y: -0.72, z: -16.08, sx: 0.38, sy: 0.95, sz: 0.48, rx: -0.2, rz: 0.12 },
  ].map(placeInExpandedKeep);

  const floatingMasonry = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = range(random, 0, Math.PI * 2);
    const radius = range(random, 23, 42);
    floatingMasonry.push(placeInExpandedKeep({
      id: `floating-stone-${i}`,
      x: Math.cos(angle) * radius,
      y: range(random, -2, 9),
      z: Math.sin(angle) * radius,
      sx: range(random, 0.45, 1.8),
      sy: range(random, 0.35, 1.4),
      sz: range(random, 0.5, 2.0),
      rx: range(random, -0.7, 0.7),
      ry: range(random, 0, Math.PI),
      rz: range(random, -0.7, 0.7),
      drift: range(random, 0.2, 0.65),
      phase: range(random, 0, Math.PI * 2),
    }));
  }

  const clouds = [];
  for (let i = 0; i < 22; i += 1) {
    const angle = range(random, 0, Math.PI * 2);
    const radius = range(random, 27, 58);
    clouds.push(placeInExpandedKeep({
      id: `abyss-cloud-${i}`,
      x: Math.cos(angle) * radius,
      y: range(random, -9.5, -3.7),
      z: Math.sin(angle) * radius,
      scale: range(random, 2.8, 6.8),
      flatten: range(random, 0.28, 0.52),
    }));
  }

  return {
    rubble,
    bridgeEdges,
    floatingMasonry,
    clouds,
    fissures: [
      { id: 'court-fissure-a', x: -2.7, y: 0.018, z: 2.4, sx: 3.7, sz: 0.055, ry: -0.52, color: KEEP_ROUTE_COLORS.courtyard },
      { id: 'court-fissure-b', x: 2.9, y: 0.019, z: -1.8, sx: 3.0, sz: 0.045, ry: 0.68, color: KEEP_ROUTE_COLORS.courtyard },
      { id: 'east-fissure-a', x: 13.1, y: 0.02, z: 1.2, sx: 3.8, sz: 0.06, ry: -0.22, color: KEEP_ROUTE_COLORS.east },
      { id: 'east-fissure-b', x: 14.8, y: 0.021, z: -3.7, sx: 2.5, sz: 0.05, ry: 0.55, color: KEEP_ROUTE_COLORS.east },
    ].map(placeInExpandedKeep),
    banners: [
      { id: 'north-banner-a', x: -4.3, y: 4.15, z: 14.34, width: 1.25, height: 2.4, color: KEEP_ROUTE_COLORS.north },
      { id: 'north-banner-b', x: 4.3, y: 4.15, z: 14.34, width: 1.25, height: 2.4, color: KEEP_ROUTE_COLORS.north },
    ].map(placeInExpandedKeep),
    wallAccents: [
      { id: 'west-wall-rib-a', mount: 'westOuterWall', x: -17.63, y: 1.42, z: -4.55, sx: 0.055, sy: 2.2, sz: 0.28 },
      { id: 'west-wall-rib-b', mount: 'westOuterWall', x: -17.63, y: 1.42, z: -1.55, sx: 0.055, sy: 2.2, sz: 0.28 },
      { id: 'west-wall-rib-c', mount: 'westOuterWall', x: -17.63, y: 1.42, z: 1.55, sx: 0.055, sy: 2.2, sz: 0.28 },
      { id: 'west-wall-rib-d', mount: 'westOuterWall', x: -17.63, y: 1.42, z: 4.55, sx: 0.055, sy: 2.2, sz: 0.28 },
    ].map(placeInExpandedKeep),
    routeLights: [
      { id: 'west-warm-a', x: -16.7, y: 1.75, z: 4.4, color: KEEP_ROUTE_COLORS.west, intensity: 5.2, distance: 5.5 },
      { id: 'west-warm-b', x: -16.7, y: 1.75, z: -4.4, color: KEEP_ROUTE_COLORS.west, intensity: 5.2, distance: 5.5 },
      { id: 'east-violet-a', x: 16.5, y: 1.9, z: 3.8, color: KEEP_ROUTE_COLORS.east, intensity: 4.6, distance: 5.2 },
      { id: 'east-violet-b', x: 16.5, y: 1.9, z: -3.8, color: KEEP_ROUTE_COLORS.east, intensity: 4.6, distance: 5.2 },
    ].map(placeInExpandedKeep),
  };
}
