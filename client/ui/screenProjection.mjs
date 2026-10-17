const DEFAULT_BOUNDS = Object.freeze({
  minX: 0.08,
  maxX: 0.92,
  minY: 0.14,
  maxY: 0.78,
});

/**
 * Projects a 3D world position to 2D normalized screen coordinates [0..1],
 * clamping to safe screen margins when off-screen or behind the camera, and
 * computing an edge-pointer rotation angle.
 *
 * Supports Three.js camera projection when THREE is available, and falls back
 * to a deterministic trigonometric camera model when running in test environments.
 *
 * @param {{ x: number, y?: number, z: number }} worldPos
 * @param {object} camera
 * @param {object} [options]
 * @param {object} [options.bounds]
 * @param {number} [options.heightOffset=0]
 * @param {object} [options.THREE]
 * @returns {{ x: number, y: number, clamped: boolean, isBehind: boolean, angle: number } | null}
 */
export function projectToScreen(worldPos, camera, { bounds = DEFAULT_BOUNDS, heightOffset = 0, THREE = globalThis.THREE } = {}) {
  if (!worldPos || !camera) return null;

  const targetY = (worldPos.y ?? 0) + heightOffset;
  let sx = 0.5;
  let sy = 0.5;
  let isBehind = false;
  let camX = 0;
  let camY = 0;

  const canUseThree = Boolean(THREE?.Vector3 && (camera.matrixWorldInverse || camera.isCamera || camera.projectionMatrix));
  if (canUseThree) {
    camera.updateMatrixWorld?.();
    const p = new THREE.Vector3(worldPos.x, targetY, worldPos.z);
    if (camera.matrixWorldInverse) {
      const camPos = p.clone().applyMatrix4(camera.matrixWorldInverse);
      isBehind = camPos.z >= 0;
      camX = camPos.x;
      camY = camPos.y;
    }
    const ndc = p.clone().project(camera);
    if (!camera.matrixWorldInverse) {
      isBehind = ndc.z > 1;
    }
    sx = (ndc.x * 0.5) + 0.5;
    sy = (-ndc.y * 0.5) + 0.5;
  } else {
    // Pure trigonometric camera model matching Three.js YXZ Euler order:
    // yaw is rotation around +Y (positive yaw turns left towards -X)
    // pitch is rotation around local +X (positive pitch tilts up towards +Y)
    // Camera looks down -Z; +X is right, +Y is up, -Z is forward
    const camPos = camera.position ?? { x: 0, y: 1.7, z: 0 };
    const yaw = camera.yaw ?? camera.rotation?.y ?? 0;
    const pitch = camera.pitch ?? camera.rotation?.x ?? 0;
    const fov = camera.fov ?? 78;
    const aspect = camera.aspect ?? (16 / 9);

    const dx = worldPos.x - camPos.x;
    const dy = targetY - camPos.y;
    const dz = worldPos.z - camPos.z;

    // Inverse Y rotation (by -yaw around +Y):
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const x1 = dx * cosY - dz * sinY;
    const y1 = dy;
    const z1 = dx * sinY + dz * cosY;

    // Inverse X rotation (by -pitch around local X):
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const y2 = y1 * cosP + z1 * sinP;
    const z2 = -y1 * sinP + z1 * cosP;

    // Camera looks down -Z:
    // target is in front if z2 < 0, behind if z2 >= 0
    isBehind = z2 >= 0;
    camX = x1;
    camY = y2;

    const tanHalfFov = Math.tan((fov * Math.PI / 180) / 2) || 1;
    const depth = Math.max(0.1, -z2);
    sx = 0.5 + (x1 / (depth * tanHalfFov * aspect)) * 0.5;
    sy = 0.5 - (y2 / (depth * tanHalfFov)) * 0.5;
  }

  const { minX, maxX, minY, maxY } = bounds;

  if (!isBehind && sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
    return {
      x: sx,
      y: sy,
      clamped: false,
      isBehind: false,
      angle: 90,
    };
  }

  // Calculate direction from screen center (0.5, 0.5)
  let dirX, dirY;
  if (!isBehind) {
    dirX = sx - 0.5;
    dirY = sy - 0.5;
  } else {
    dirX = camX;
    dirY = -camY;
    if (Math.abs(dirX) < 0.05 && Math.abs(dirY) < 0.05) {
      dirY = 1;
    }
  }

  const len = Math.hypot(dirX, dirY) || 1;
  const udx = dirX / len;
  const udy = dirY / len;

  const tx = udx > 0 ? (maxX - 0.5) / udx : udx < 0 ? (minX - 0.5) / udx : Infinity;
  const ty = udy > 0 ? (maxY - 0.5) / udy : udy < 0 ? (minY - 0.5) / udy : Infinity;
  const t = Math.min(tx, ty);

  const clampedX = Math.max(minX, Math.min(maxX, 0.5 + t * udx));
  const clampedY = Math.max(minY, Math.min(maxY, 0.5 + t * udy));
  const angle = Math.atan2(udy, udx) * (180 / Math.PI);

  return {
    x: clampedX,
    y: clampedY,
    clamped: true,
    isBehind,
    angle,
  };
}
