// Authoritative DRAG-OON spatial frame, 8-wheel terrain pose solver, obstacle clearance,
// articulated cannon/nozzle world transforms, hit volumes, and boarding/exit locators.
import { boxWorld, orientedBoxHit, alignedSeparated } from '../src/orientedBox.mjs';
import { surfaceHeightAt, resolvePlayerWorld } from '../src/collision.mjs';
import { DRAG_OON_GEOMETRY, DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function rotate(v, yaw = 0, pitch = 0, roll = 0) {
  let [x, y, z] = v;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  [x, y] = [x * cr - y * sr, x * sr + y * cr];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [x * cy + z * sy, y, -x * sy + z * cy];
}

export function dragOonFrameFromAngles(origin, yaw = 0, pitch = 0, roll = 0, parent = null) {
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v => rotate(v, yaw, pitch, roll));
  if (!parent) return { center: origin, axes };
  return {
    center: boxWorld(parent, origin),
    axes: axes.map(a => boxWorld(parent, a, true)),
  };
}

export function dragOonFrame(m) {
  const x = m?.x ?? m?.position?.x ?? 0;
  const y = m?.y ?? m?.position?.y ?? 0;
  const z = m?.z ?? m?.position?.z ?? 0;
  return dragOonFrameFromAngles([x, y, z], m?.heading ?? 0, m?.chassisPitch ?? 0, m?.chassisRoll ?? 0);
}

export function dragOonOperatorPose(m) {
  const frame = dragOonFrame(m);
  const settleY = m?.campFire?.settled ? DRAG_OON_GEOMETRY.campFireSettleY : 0;
  const s = DRAG_OON_GEOMETRY.stations.operatorSeat;
  const p = boxWorld(frame, [s[0], s[1] + settleY, s[2]]);
  return { x: p[0], y: p[1], z: p[2] };
}

export function dragOonPassengerStationPose(m, slotIndex, type = 'seat') {
  const stations = DRAG_OON_GEOMETRY.stations.passengers;
  const station = stations[clamp(slotIndex | 0, 0, stations.length - 1)];
  const frame = dragOonFrame(m);
  const settleY = m?.campFire?.settled ? DRAG_OON_GEOMETRY.campFireSettleY : 0;
  const local = type === 'aperture' ? station.aperture : type === 'camera' ? station.camera : station.seat;
  const p = boxWorld(frame, [local[0], local[1] + settleY, local[2]]);
  return {
    x: p[0],
    y: p[1],
    z: p[2],
    yaw: (m?.heading ?? 0) + (station.yawOffset ?? 0),
    station,
  };
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Clamps a passenger caster's aim within their aperture station's outward cone
 * (±28° yaw, -25°..+30° pitch around station outward axis) and validates that
 * Camp Fire / shutter seal and external solids immediately outside the port don't block casting.
 */
export function clampDragOonPassengerAim(m, slotIndex, rawYaw, rawPitch = 0) {
  const stations = DRAG_OON_GEOMETRY.stations.passengers;
  const station = stations[clamp(slotIndex | 0, 0, stations.length - 1)];
  const centerYaw = (m?.heading ?? 0) + (station.yawOffset ?? 0);
  const halfYaw = station.yawConeHalfRad ?? (28 * Math.PI) / 180;
  const minPitch = station.pitchMinRad ?? (-25 * Math.PI) / 180;
  const maxPitch = station.pitchMaxRad ?? (30 * Math.PI) / 180;
  const diff = wrapAngle((rawYaw ?? centerYaw) - centerYaw);
  const clampedDiff = clamp(diff, -halfYaw, halfYaw);
  const yaw = wrapAngle(centerYaw + clampedDiff);
  const pitch = clamp(rawPitch ?? 0, minPitch, maxPitch);
  const cp = Math.cos(pitch);
  const direction = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  return { yaw, pitch, direction, clamped: Math.abs(diff - clampedDiff) > 1e-4 };
}

/** Resolves world-space cannon nozzle origins and direction vectors from articulated aim. */
export function dragOonCannonRays(m) {
  const frame = dragOonFrame(m);
  const yaw = clamp(m?.cannonYaw ?? 0, -DRAG_OON_TUNING.cannonYawMax, DRAG_OON_TUNING.cannonYawMax);
  const defaultPitch = (m?.flightLikeHell?.active) ? -1.18 : 0;
  const pitch = clamp(m?.cannonPitch ?? defaultPitch, m?.flightLikeHell?.active ? -1.42 : DRAG_OON_TUNING.cannonPitchMin, DRAG_OON_TUNING.cannonPitchMax);
  const rays = [];
  for (const side of [DRAG_OON_GEOMETRY.cannons.left, DRAG_OON_GEOMETRY.cannons.right]) {
    const cFrame = dragOonFrameFromAngles(side.mount, yaw, pitch, 0, frame);
    const dir = boxWorld(cFrame, [0, 0, -1], true);
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const direction = { x: dir[0] / len, y: dir[1] / len, z: dir[2] / len };
    for (const nozzle of side.nozzles) {
      const origin = boxWorld(cFrame, nozzle.local);
      rays.push({
        cannonId: side.id,
        nozzleId: nozzle.id,
        origin: { x: origin[0], y: origin[1], z: origin[2] },
        direction,
      });
    }
  }
  return rays;
}

export function dragOonUndersideOrigin(m) {
  const p = boxWorld(dragOonFrame(m), DRAG_OON_GEOMETRY.undersideIgnitionOrigin);
  return { x: p[0], y: p[1], z: p[2] };
}

/** World-space oriented solids representing the heavy armored enclosure for player collision. */
export function dragOonSolids(m) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') return [];
  const root = dragOonFrame(m);
  const settleY = m.campFire?.settled ? DRAG_OON_GEOMETRY.campFireSettleY : 0;
  const cz = DRAG_OON_GEOMETRY.centerZOffset ?? -0.187;
  return [
    {
      id: `dragoon-${m.id}-hull`,
      machineId: m.id,
      componentId: 'hull',
      material: 'steel',
      center: boxWorld(root, [0, DRAG_OON_GEOMETRY.halfHeight * 0.96 + settleY, cz]),
      axes: root.axes,
      size: [DRAG_OON_GEOMETRY.width * 0.94, DRAG_OON_GEOMETRY.height * 0.90, DRAG_OON_GEOMETRY.length * 0.94],
    },
  ];
}

/** Articulated component hit volumes for projectiles, sword strikes, blasts, and machine collisions. */
export function dragOonHitVolumes(m) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') return [];
  const root = dragOonFrame(m);
  const settleY = m.campFire?.settled ? DRAG_OON_GEOMETRY.campFireSettleY : 0;
  const cz = DRAG_OON_GEOMETRY.centerZOffset ?? -0.187;
  const out = [
    {
      id: `dragoon-${m.id}-hull`,
      machineId: m.id,
      componentId: 'hull',
      material: 'steel',
      center: boxWorld(root, [0, 1.54 + settleY, cz]),
      axes: root.axes,
      size: [4.05, 2.52, 5.95],
    },
    {
      id: `dragoon-${m.id}-Drive`,
      machineId: m.id,
      componentId: 'Drive',
      material: 'steel',
      center: boxWorld(root, [0, 0.84 + settleY, 1.55]),
      axes: root.axes,
      size: [2.25, 1.15, 2.10],
    },
    {
      id: `dragoon-${m.id}-Cannons`,
      machineId: m.id,
      componentId: 'Cannons',
      material: 'steel',
      center: boxWorld(root, [0, 0.72 + settleY, -2.85]),
      axes: root.axes,
      size: [3.60, 0.85, 1.35],
    },
  ];
  for (const w of DRAG_OON_GEOMETRY.wheels) {
    if ((m.components?.[w.id]?.health ?? 1) <= 0) continue;
    out.push({
      id: `dragoon-${m.id}-${w.id}`,
      machineId: m.id,
      componentId: w.id,
      material: 'steel',
      center: boxWorld(root, [w.pivot[0], w.pivot[1] + settleY * 0.5, w.pivot[2]]),
      axes: root.axes,
      size: [0.55, 0.78, 0.78],
    });
  }
  return out;
}

export function dragOonFirstHit(m, start, end, grow = 0) {
  let best = null;
  for (const box of dragOonHitVolumes(m)) {
    const h = orientedBoxHit(start, end, box, grow);
    if (h && (!best || h.t < best.t)) best = h;
  }
  return best;
}

export function dragOonMachineryOverlap(a, b) {
  if (!a || !b) return false;
  if (alignedSeparated(a, b)) return false;
  if (b.axes) {
    const ba = dragOonHitExtent(a, b.axes);
    const bb = dragOonHitExtent(b, a.axes);
    return (
      Math.abs((a.center[0] - b.center[0]) * a.axes[0][0] + (a.center[1] - b.center[1]) * a.axes[0][1] + (a.center[2] - b.center[2]) * a.axes[0][2]) < (a.size[0] + bb[0]) * 0.5 &&
      Math.abs((a.center[0] - b.center[0]) * a.axes[1][0] + (a.center[1] - b.center[1]) * a.axes[1][1] + (a.center[2] - b.center[2]) * a.axes[1][2]) < (a.size[1] + bb[1]) * 0.5 &&
      Math.abs((a.center[0] - b.center[0]) * a.axes[2][0] + (a.center[1] - b.center[1]) * a.axes[2][1] + (a.center[2] - b.center[2]) * a.axes[2][2]) < (a.size[2] + bb[2]) * 0.5 &&
      Math.abs((a.center[0] - b.center[0]) * b.axes[0][0] + (a.center[1] - b.center[1]) * b.axes[0][1] + (a.center[2] - b.center[2]) * b.axes[0][2]) < (b.size[0] + ba[0]) * 0.5 &&
      Math.abs((a.center[0] - b.center[0]) * b.axes[1][0] + (a.center[1] - b.center[1]) * b.axes[1][1] + (a.center[2] - b.center[2]) * b.axes[1][2]) < (b.size[1] + ba[1]) * 0.5 &&
      Math.abs((a.center[0] - b.center[0]) * b.axes[2][0] + (a.center[1] - b.center[1]) * b.axes[2][1] + (a.center[2] - b.center[2]) * b.axes[2][2]) < (b.size[2] + ba[2]) * 0.5
    );
  }
  return Boolean(orientedBoxHit(b.center, b.center, {
    ...a,
    size: a.size.map((v, i) => v + Math.hypot(...b.size.map((s, j) => Math.abs(a.axes[i][j]) * s))),
  }));
}

function dragOonHitExtent(box, targetAxes) {
  return targetAxes.map(ax => box.axes.reduce((sum, bx, i) => sum + Math.abs(ax[0] * bx[0] + ax[1] * bx[1] + ax[2] * bx[2]) * box.size[i], 0));
}

export function dragOonTerrainPose(m, world) {
  const flat = dragOonFrameFromAngles([m.x ?? 0, m.y ?? 0, m.z ?? 0], m.heading ?? 0, 0, 0);
  // Sample V4.1 front/rear/left/right wheel centers (Wheel_L1/R1 at Z=-1.42, Wheel_L4/R4 at Z=+1.52, X=±1.92)
  const corners = [
    [-1.92, -1.42],
    [1.92, -1.42],
    [-1.92, 1.52],
    [1.92, 1.52],
  ];
  const samples = [];
  for (const [lx, lz] of corners) {
    const pt = boxWorld(flat, [lx, 0, lz]);
    const h = surfaceHeightAt(pt[0], pt[2], (m.y ?? 0) + 1.15, world);
    if (h == null || Math.abs(h - (m.y ?? 0)) > 1.25) return null;
    samples.push(h);
  }
  const front = (samples[0] + samples[1]) * 0.5;
  const rear = (samples[2] + samples[3]) * 0.5;
  const left = (samples[0] + samples[2]) * 0.5;
  const right = (samples[1] + samples[3]) * 0.5;
  const pitch = Math.atan2(front - rear, 2.94);
  const roll = Math.atan2(right - left, 3.84);
  if (Math.abs(pitch) > DRAG_OON_TUNING.maxSlopePitchRad || Math.abs(roll) > DRAG_OON_TUNING.maxSlopeRollRad) {
    return null;
  }
  const y = samples.reduce((s, v) => s + v, 0) / samples.length;
  return { y, chassisPitch: pitch, chassisRoll: roll };
}

export function dragOonClear(m, world, extraSolids = []) {
  const root = dragOonFrame(m);
  const cz = DRAG_OON_GEOMETRY.centerZOffset ?? -0.187;
  const hullBox = {
    center: boxWorld(root, [0, 1.58, cz]),
    axes: root.axes,
    size: [DRAG_OON_GEOMETRY.width * 0.92, DRAG_OON_GEOMETRY.height * 0.85, DRAG_OON_GEOMETRY.length * 0.92],
  };
  const allSolids = [...(world?.solids ?? []), ...extraSolids];
  return !allSolids.some(s => dragOonMachineryOverlap(hullBox, s));
}

export function dragOonExit(room, m, player, extraSolids = [], { excludeHull = false, startIndex = 0 } = {}) {
  const frame = dragOonFrame(m);
  const solids = [
    ...(room.world?.solids ?? []),
    ...(excludeHull ? [] : dragOonSolids(m)),
    ...extraSolids,
    ...[...room.players.values()]
      .filter(v => v.alive && v.id !== player.id && !v.aboardDragOonId && !v.operatingDragOonId)
      .map(v => ({ center: [v.position.x, v.position.y + 0.9, v.position.z], size: [0.95, 1.8, 0.95] })),
  ];
  const exits = DRAG_OON_GEOMETRY.stations.exits;
  const count = exits.length;
  for (let n = 0; n < count; n++) {
    const local = exits[(n + Math.max(0, startIndex | 0)) % count];
    const at = boxWorld(frame, local);
    const y = surfaceHeightAt(at[0], at[2], (m.y ?? 0) + 1.1, room.world);
    if (y == null || Math.abs(y - (m.y ?? 0)) > 1.35) continue;
    const candidate = { x: at[0], y, z: at[2] };
    const resolved = resolvePlayerWorld(candidate, 0.45, solids, 1.8);
    if (Math.hypot(resolved.x - candidate.x, resolved.z - candidate.z) < 0.08) {
      return candidate;
    }
  }
  return null;
}
