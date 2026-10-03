import { DEFAULT_SPELL, SPELLS, isSpell } from './spells.mjs';

export const PREPARED_COUNT = 3;
export const DEFAULT_PREPARED_SPELLS = Object.freeze(['fireball', 'frostfire', 'gale']);

/** Preserve ordered membership when the starting marker moves. An outside starter replaces the last member. */
export function normalizePreparedSpells(starting = DEFAULT_SPELL, ids = DEFAULT_PREPARED_SPELLS) {
  const start = isSpell(starting) ? starting : DEFAULT_SPELL;
  const result = [...new Set((Array.isArray(ids) ? ids : []).filter(isSpell))].slice(0, PREPARED_COUNT);
  if (!result.includes(start)) {
    if (result.length === PREPARED_COUNT) result[PREPARED_COUNT - 1] = start;
    else result.push(start);
  }
  for (const id of Object.keys(SPELLS)) {
    if (result.length === PREPARED_COUNT) break;
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

export function preparedSpellMember(player, id) {
  return isSpell(id) && Array.isArray(player?.preparedSpells) && player.preparedSpells.includes(id);
}

export function replacePreparedSpell(starting, ids, slot, id) {
  const result = normalizePreparedSpells(starting, ids);
  if (!Number.isInteger(slot) || slot < 0 || slot >= PREPARED_COUNT || !isSpell(id)
    || result[slot] === starting || result.includes(id)) return result;
  result[slot] = id;
  return result;
}
