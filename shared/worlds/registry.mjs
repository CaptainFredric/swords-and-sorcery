import { CASTLEWARD } from './castleward.mjs';
import { SHATTERED_KEEP } from './shatteredKeep.mjs';
import { RUINED_KEEP } from './ruinedKeep.mjs';
import { GREENER_PASTURES } from './greenerPastures.mjs';
import { BASTION_BREACH } from './bastionBreach.mjs';
import { BLACKBELL_FOUNDRY } from './blackbellFoundry.mjs';

export const WORLD_IDS = Object.freeze({
  SHATTERED_KEEP: 'shattered-keep',
  CASTLEWARD: 'castleward',
  RUINED_KEEP: 'ruined-keep',
  GREENER_PASTURES: 'greener-pastures',
  BASTION_BREACH: 'bastion-breach',
  BLACKBELL_FOUNDRY: 'blackbell-foundry',
});

const WORLDS = new Map([
  [WORLD_IDS.SHATTERED_KEEP, SHATTERED_KEEP],
  [WORLD_IDS.CASTLEWARD, CASTLEWARD],
  [WORLD_IDS.RUINED_KEEP, RUINED_KEEP],
  [WORLD_IDS.GREENER_PASTURES, GREENER_PASTURES],
  [WORLD_IDS.BASTION_BREACH, BASTION_BREACH],
  [WORLD_IDS.BLACKBELL_FOUNDRY, BLACKBELL_FOUNDRY],
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
