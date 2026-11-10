export function worldSpawnPoints(world, mode) {
  if (mode === 'PRACTICE' && world?.practiceSpawns?.length) return world.practiceSpawns;
  if (['FFA', 'BOT_DUEL', 'DUEL', 'PRACTICE'].includes(mode) && world?.skirmishSpawns?.length) {
    return world.skirmishSpawns;
  }
  return world?.spawnPoints ?? [];
}

export function chooseSpawn(spawnPoints, enemies, recentUse = new Map(), nowSec = 0) {
  let best = null;
  for (let i = 0; i < spawnPoints.length; i += 1) {
    const spawn = spawnPoints[i];
    let minDistance = 999;
    for (const enemy of enemies) {
      const dx = spawn.x - enemy.position.x;
      const dz = spawn.z - enemy.position.z;
      minDistance = Math.min(minDistance, Math.hypot(dx, dz));
    }
    const lastUsed = recentUse.get(i) ?? -Infinity;
    const recentPenalty = Math.max(0, 8 - (nowSec - lastUsed)) * 2;
    const score = minDistance - recentPenalty;
    if (!best || score > best.score) best = { index: i, spawn, score };
  }
  return best;
}
