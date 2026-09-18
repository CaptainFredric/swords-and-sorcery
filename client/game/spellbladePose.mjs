export function resolveSpellbladeState(player, serverNow, castPoseUntil = 0) {
  if (!player?.alive) return 'dead';
  if ((player.staggerUntil ?? 0) > serverNow) return 'stagger';
  if ((player.dashUntil ?? 0) > serverNow) return 'dash';
  if (player.guarding) return 'guard';
  if (player.attackActive) return 'attack';
  if (castPoseUntil > serverNow) return 'cast';

  const velocity = player.velocity ?? { x: 0, y: 0, z: 0 };
  if (Math.abs(velocity.y ?? 0) > 0.45) return 'air';
  if (Math.hypot(velocity.x ?? 0, velocity.z ?? 0) > 0.8) return 'run';
  return 'idle';
}

export function attackMotion(player, serverNow) {
  const elapsed = Math.max(0, serverNow - (player.attackStartedAt ?? serverNow));
  const cycle = elapsed % 2.08;
  const strike = cycle < 0.72 ? 0 : cycle < 1.44 ? 1 : 2;
  const start = strike === 0 ? 0 : strike === 1 ? 0.72 : 1.44;
  const duration = strike === 2 ? 0.64 : 0.72;
  const local = Math.max(0, Math.min(1, (cycle - start) / duration));
  const swing = Math.sin(local * Math.PI);
  return { strike, local, swing };
}
