import {normalizeSiegeLoadout} from '../../shared/src/siegeLoadout.mjs';
import { DEFAULT_SPELL, isSpell } from '../../shared/src/spells.mjs';
import { DEFAULT_ULTIMATE, isUltimate } from '../../shared/src/ultimates.mjs';
import { normalizePreparedSpells } from '../../shared/src/preparedSpells.mjs';

/** Armory changes configure the next match, never a tactical cooldown reset. */
export function applySavedLoadout(session, room, player, message) {
  session.spell = isSpell(message.spell) ? message.spell : DEFAULT_SPELL;
  session.ultimate = isUltimate(message.ultimate) ? message.ultimate : DEFAULT_ULTIMATE;
  session.preparedSpells = normalizePreparedSpells(session.spell, message.preparedSpells);
  session.siegeLoadout = normalizeSiegeLoadout(message.siegeLoadout);
  if (!player) return;
  // Equipment switches only while unmounted; an active apparatus cannot have
  // its current technique silently replaced by an Armory request.
  if (!player.operatingBallistaId&&!player.operatingRamId&&!player.operatingFightFlightId)
    player.siegeLoadout={...session.siegeLoadout};
  player.startingSpell = session.spell;
  player.startingPreparedSpells = [...session.preparedSpells];
  player.startingUltimate = session.ultimate;
  if (room?.state === 'PLAYING') return;
  player.spell = session.spell;
  player.preparedSpells = [...session.preparedSpells];
  player.ultimate = session.ultimate;
}
