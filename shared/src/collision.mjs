function bounds(box) {
  return {
    min: [
      box.center[0] - box.size[0] / 2,
      box.center[1] - box.size[1] / 2,
      box.center[2] - box.size[2] / 2,
    ],
    max: [
      box.center[0] + box.size[0] / 2,
      box.center[1] + box.size[1] / 2,
      box.center[2] + box.size[2] / 2,
    ],
  };
}

export function segmentAabbHit(start, end, box) {
  const { min, max } = bounds(box);
  const delta = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  let tMin = 0;
  let tMax = 1;
  let hitNormal = [0, 0, 0];

  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(delta[axis]) < 1e-9) {
      if (start[axis] < min[axis] || start[axis] > max[axis]) return null;
      continue;
    }
    const inv = 1 / delta[axis];
    let t1 = (min[axis] - start[axis]) * inv;
    let t2 = (max[axis] - start[axis]) * inv;
    let nearNormalSign = -Math.sign(delta[axis]);
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      nearNormalSign = Math.sign(delta[axis]);
    }
    if (t1 > tMin) {
      tMin = t1;
      hitNormal = [0, 0, 0];
      hitNormal[axis] = nearNormalSign;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  if (tMin < 0 || tMin > 1) return null;
  return {
    t: tMin,
    point: [
      start[0] + delta[0] * tMin,
      start[1] + delta[1] * tMin,
      start[2] + delta[2] * tMin,
    ],
    normal: hitNormal,
    box,
  };
}

export function findSwordWorldHit(origin, direction, range, solids) {
  const mag = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  const dir = direction.map((v) => v / mag);
  const end = [origin[0] + dir[0] * range, origin[1] + dir[1] * range, origin[2] + dir[2] * range];
  let nearest = null;
  for (const box of solids) {
    const hit = segmentAabbHit(origin, end, box);
    if (hit && (!nearest || hit.t < nearest.t)) nearest = hit;
  }
  if (!nearest) return null;
  return { ...nearest, distance: nearest.t * range };
}

export function resolvePlayerWorld(position, radius, solids, height = 1.8) {
  let x = position.x;
  let z = position.z;
  const yBottom = position.y;
  const yTop = yBottom + height;

  for (const box of solids) {
    const { min, max } = bounds(box);
    if (yTop <= min[1] || yBottom >= max[1]) continue;
    const closestX = Math.max(min[0], Math.min(x, max[0]));
    const closestZ = Math.max(min[2], Math.min(z, max[2]));
    let dx = x - closestX;
    let dz = z - closestZ;
    let distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;

    if (distSq < 1e-12) {
      const distances = [
        { axis: 'x', value: Math.abs(x - min[0]), target: min[0] - radius },
        { axis: 'x', value: Math.abs(max[0] - x), target: max[0] + radius },
        { axis: 'z', value: Math.abs(z - min[2]), target: min[2] - radius },
        { axis: 'z', value: Math.abs(max[2] - z), target: max[2] + radius },
      ].sort((a, b) => a.value - b.value);
      const choice = distances[0];
      if (choice.axis === 'x') x = choice.target;
      else z = choice.target;
      continue;
    }

    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    dx /= dist;
    dz /= dist;
    x += dx * push;
    z += dz * push;
  }
  return { ...position, x, z };
}

export function surfaceHeightAt(x, z, currentY, world) {
  let best = null;
  for (const floor of world.floors ?? []) {
    const halfX = floor.size[0] / 2;
    const halfZ = floor.size[2] / 2;
    if (x >= floor.center[0] - halfX && x <= floor.center[0] + halfX && z >= floor.center[2] - halfZ && z <= floor.center[2] + halfZ) {
      if (floor.y <= currentY + 0.65 && (best === null || floor.y > best)) best = floor.y;
    }
  }
  for (const ramp of world.ramps ?? []) {
    if (x < ramp.minX || x > ramp.maxX || z < ramp.minZ || z > ramp.maxZ) continue;
    const t = ramp.axis === 'z'
      ? (z - ramp.minZ) / (ramp.maxZ - ramp.minZ)
      : (x - ramp.minX) / (ramp.maxX - ramp.minX);
    const y = ramp.startY + (ramp.endY - ramp.startY) * Math.max(0, Math.min(1, t));
    if (y <= currentY + 0.65 && (best === null || y > best)) best = y;
  }
  return best;
}
