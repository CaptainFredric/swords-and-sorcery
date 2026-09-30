import { CASTLEWARD } from './castleward.mjs';
import { SHATTERED_KEEP } from './shatteredKeep.mjs';
import { RUINED_KEEP } from './ruinedKeep.mjs';

export const WORLD_IDS = Object.freeze({
  SHATTERED_KEEP: 'shattered-keep',
  CASTLEWARD: 'castleward',
  RUINED_KEEP: 'ruined-keep',
});

const WORLDS = new Map([
  [WORLD_IDS.SHATTERED_KEEP, SHATTERED_KEEP],
  [WORLD_IDS.CASTLEWARD, CASTLEWARD],
  [WORLD_IDS.RUINED_KEEP, RUINED_KEEP],
]);

export function getWorld(id) {
  const world = WORLDS.get(id);
  if (!world) throw new Error(`Unknown world: ${id}`);
  return world;
}

export function registerWorld(world) {
  if (!world?.id || !Array.isArray(world.spawnPoints)) throw new Error('Invalid world definition');
  WORLDS.set(world.id, world);
  return world;
}
