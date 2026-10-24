// Map contract: structures name existing solidIds, a material profile and owning team.
// Health belongs to the room. Failed collider IDs are removed from every world consumer.
export const STRUCTURE_PROFILES = Object.freeze({
  timber: Object.freeze({ health: 240, sword: .6, spell: .8, heavy: 1.4, upper: .5, piston: 220, exposed: 110, charge: 160 }),
  reinforcedTimber: Object.freeze({ health: 600, sword: .45, spell: .6, heavy: 1.8, upper: .35, piston: 240, exposed: 120, charge: 180 }),
});
const variants = new WeakMap();
const bases = new WeakMap();
export function createStructureState(world, revision = 0) {
  return { revision, entities: Object.fromEntries((world.structures ?? []).map(def => {
    const maxHealth = STRUCTURE_PROFILES[def.profile].health;
    return [def.id, { health: maxHealth, maxHealth, lastHitAt: null, destroyedAt: null }];
  })) };
}
export function structureWorld(world, state) {
  const base = bases.get(world) ?? world;
  if (!base.structures?.length || !state) return base;
  const failed = base.structures.filter(def => state.entities?.[def.id]?.health <= 0);
  if (!failed.length) return base;
  const key = failed.map(def => def.id).join('|');
  let cache = variants.get(base);
  if (!cache) variants.set(base, cache = new Map());
  if (cache.has(key)) return cache.get(key);
  const ids = new Set(failed.flatMap(def => def.solidIds));
  const result = { ...base, solids: base.solids.filter(solid => !ids.has(solid.id)) };
  // A stable world identity preserves the navigation cache between failures.
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(key, result); bases.set(result, base);
  return result;
}
export function structureForSolid(world, solid) {
  return (world.structures ?? []).find(def => def.solidIds.includes(typeof solid === 'string' ? solid : solid?.id));
}
export function damageStructure(room, id, amount, attackerId, source, now, { point = null, raw = false } = {}) {
  const def = room.world.structures?.find(s => s.id === id), state = room.structures?.entities[id];
  const attacker = room.players.get(attackerId);
  if (!def || !state || state.health <= 0 || room.state !== 'PLAYING' || !attacker || !Number.isFinite(amount) || amount <= 0) return false;
  if (def.team && attacker.team === def.team) return false;
  const profile = STRUCTURE_PROFILES[def.profile];
  const scale = source === 'sword' ? profile.sword : source === 'bibye-siege' ? profile.heavy : source === 'bibye-conditioning' ? profile.upper : profile.spell;
  const damage = raw ? amount : amount * scale;
  const before = state.health;
  state.health = Math.max(0, Math.round((before - damage) * 100) / 100);
  state.lastHitAt = now;
  room.structures.revision++;
  if (state.health === 0) {
    state.destroyedAt = now;
    room.world = structureWorld(room.world, room.structures);
  }
  room.events.push({ type: 'structureDamaged', structureId: id, name: def.name, health: state.health, maxHealth: state.maxHealth,
    amount: before - state.health, attackerId, source, point, destroyed: state.health === 0, at: now });
  return true;
}
export function damageStructureSolid(room, solid, amount, attackerId, source, now, options) {
  const def = structureForSolid(room.world, solid);
  return def ? damageStructure(room, def.id, amount, attackerId, source, now, options) : false;
}
