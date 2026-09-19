import { SHATTERED_KEEP } from './shatteredKeep.mjs';

export const WORLD_IDS = Object.freeze({
  SHATTERED_KEEP: 'shattered-keep',
  CASTLEWARD: 'castleward',
});

const WORLDS = new Map([
  [WORLD_IDS.SHATTERED_KEEP, SHATTERED_KEEP],
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
