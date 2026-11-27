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
  const p = boxWorld(frame, DRAG_OON_GEOMETRY.stations.operatorSeat);
  return { x: p[0], y: p[1], z: p[2] };
}

export function dragOonPassengerStationPose(m, slotIndex, type = 'seat') {
  const stations = DRAG_OON_GEOMETRY.stations.passengers;
  const station = stations[clamp(slotIndex | 0, 0, stations.length - 1)];
  const frame = dragOonFrame(m);
  const local = type === 'aperture' ? station.aperture : station.seat;
  const p = boxWorld(frame, local);
  return {
    x: p[0],
    y: p[1],
    z: p[2],
    yaw: (m?.heading ?? 0) + (station.yawOffset ?? 0),
  };
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
  const settleY = m.campFire?.settled ? -0.22 : 0;
  return [
    {
      id: `dragoon-${m.id}-hull`,
      machineId: m.id,
      componentId: 'hull',
      material: 'steel',
      center: boxWorld(root, [0, DRAG_OON_GEOMETRY.halfHeight * 0.96 + settleY, 0]),
      axes: root.axes,
      size: [DRAG_OON_GEOMETRY.width * 0.94, DRAG_OON_GEOMETRY.height * 0.9, DRAG_OON_GEOMETRY.length * 0.95],
    },
  ];
}

/** Articulated component hit volumes for projectiles, sword strikes, blasts, and machine collisions. */
export function dragOonHitVolumes(m) {
  if (!m || m.retired || m.health <= 0 || m.mode === 'DESTROYED') return [];
  const root = dragOonFrame(m);
  const settleY = m.campFire?.settled ? -0.22 : 0;
  const out = [
    {
      id: `dragoon-${m.id}-hull`,
      machineId: m.id,
      componentId: 'hull',
      material: 'steel',
      center: boxWorld(root, [0, 1.48 + settleY, 0]),
      axes: root.axes,
      size: [3.65, 2.35, 5.25],
    },
    {
      id: `dragoon-${m.id}-Drive`,
      machineId: m.id,
      componentId: 'Drive',
      material: 'steel',
      center: boxWorld(root, [0, 0.72 + settleY, 1.45]),
      axes: root.axes,
      size: [2.1, 1.0, 1.75],
    },
    {
      id: `dragoon-${m.id}-Cannons`,
      machineId: m.id,
      componentId: 'Cannons',
      material: 'steel',
      center: boxWorld(root, [0, 0.85 + settleY, -2.55]),
      axes: root.axes,
      size: [3.2, 0.9, 1.15],
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
      size: [0.55, 1.05, 1.05],
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
  const corners = [
    [-1.85, -2.05],
    [1.85, -2.05],
    [-1.85, 2.05],
    [1.85, 2.05],
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
  const pitch = Math.atan2(front - rear, 4.10);
  const roll = Math.atan2(right - left, 3.70);
  if (Math.abs(pitch) > DRAG_OON_TUNING.maxSlopePitchRad || Math.abs(roll) > DRAG_OON_TUNING.maxSlopeRollRad) {
    return null;
  }
  const y = samples.reduce((s, v) => s + v, 0) / samples.length;
  return { y, chassisPitch: pitch, chassisRoll: roll };
}

export function dragOonClear(m, world, extraSolids = []) {
  const root = dragOonFrame(m);
  const hullBox = {
    center: boxWorld(root, [0, 1.52, 0]),
    axes: root.axes,
    size: [DRAG_OON_GEOMETRY.width * 0.92, DRAG_OON_GEOMETRY.height * 0.85, DRAG_OON_GEOMETRY.length * 0.92],
  };
  const allSolids = [...(world?.solids ?? []), ...extraSolids];
  return !allSolids.some(s => dragOonMachineryOverlap(hullBox, s));
}

export function dragOonExit(room, m, player, extraSolids = [], { excludeHull = false } = {}) {
  const frame = dragOonFrame(m);
  const solids = [
    ...(room.world?.solids ?? []),
    ...(excludeHull ? [] : dragOonSolids(m)),
    ...extraSolids,
    ...[...room.players.values()]
      .filter(v => v.alive && v.id !== player.id && !v.aboardDragOonId && !v.operatingDragOonId)
      .map(v => ({ center: [v.position.x, v.position.y + 0.9, v.position.z], size: [0.9, 1.8, 0.9] })),
  ];
  for (const local of DRAG_OON_GEOMETRY.stations.exits) {
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
