// Place the single live menu Spellblade on his camera's screen-right,
// measured in the rotated stage's local coordinates. No world-X guesses.
export function armoryRetreatTarget(shot, stageYaw, { lateral = 0.9, back = 0.35 } = {}) {
  const [cx, , cz] = shot.camera;
  const [tx, , tz] = shot.target;
  const dx = tx - cx, dz = tz - cz;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) return { x: 0, y: 0, z: 0 };
  const fx = dx / length, fz = dz / length;
  // The horizontal camera-right vector, consistent with menuShots.screen basis.
  const wx = -fz * lateral + fx * back;
  const wz = fx * lateral + fz * back;
  const c = Math.cos(stageYaw), s = Math.sin(stageYaw);
  // THREE.Group local +X projects to (cos(yaw), -sin(yaw)) in world X/Z.
  return { x: wx * c - wz * s, y: 0, z: wx * s + wz * c };
}
