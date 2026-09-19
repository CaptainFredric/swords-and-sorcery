const ABYSS_VISUAL_MARGIN = 0.5;

function floorSurfaceY(floor) {
  if (Number.isFinite(floor.y)) return floor.y;
  return floor.center[1] + floor.size[1] / 2;
}

export function buildCastlewardTerrainSkirts(world) {
  const bottomY = world.abyssY + ABYSS_VISUAL_MARGIN;
  return world.floors.map((floor) => {
    const floorY = floorSurfaceY(floor);
    const topY = floor.center[1] - floor.size[1] / 2;
    const height = Math.max(0.01, topY - bottomY);
    return {
      floorId: floor.id,
      floorY,
      material: floor.material,
      topY,
      bottomY,
      size: [floor.size[0], height, floor.size[2]],
      center: [floor.center[0], bottomY + height / 2, floor.center[2]],
    };
  });
}

function nearlyEqual(a, b) {
  return Math.abs(a - b) <= 0.001;
}

function meshMatchesFloor(mesh, floor) {
  const parameters = mesh?.geometry?.parameters;
  if (!mesh?.isMesh || !parameters) return false;
  return nearlyEqual(mesh.position.x, floor.center[0])
    && nearlyEqual(mesh.position.y, floor.center[1])
    && nearlyEqual(mesh.position.z, floor.center[2])
    && nearlyEqual(parameters.width, floor.size[0])
    && nearlyEqual(parameters.height, floor.size[1])
    && nearlyEqual(parameters.depth, floor.size[2]);
}

export function attachCastlewardTerrainSkirts(renderer, world) {
  if (!renderer?.group || !world?.floors?.length) return [];
  const skirts = buildCastlewardTerrainSkirts(world);
  const added = [];

  for (const skirt of skirts) {
    if (renderer.group.children.some((child) => child.name === `terrain-skirt:${skirt.floorId}`)) continue;
    const floor = world.floors.find((item) => item.id === skirt.floorId);
    const floorMesh = renderer.group.children.find((child) => meshMatchesFloor(child, floor));
    if (!floorMesh) continue;

    const mesh = floorMesh.clone();
    mesh.name = `terrain-skirt:${skirt.floorId}`;
    mesh.position.set(...skirt.center);
    mesh.scale.set(1, skirt.size[1] / floor.size[1], 1);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.material = floor.material === 'stone'
      ? (renderer.materials?.stone ?? floorMesh.material)
      : (renderer.materials?.earth ?? floorMesh.material);
    renderer.group.add(mesh);
    added.push(mesh);
  }

  return added;
}
