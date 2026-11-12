import {normalizeSiegeLoadout} from '../../shared/src/siegeLoadout.mjs';
import { DEFAULT_SPELL, isSpell } from '../../shared/src/spells.mjs';
import { DEFAULT_ULTIMATE, isUltimate } from '../../shared/src/ultimates.mjs';
import { normalizePreparedSpells } from '../../shared/src/preparedSpells.mjs';
import { normalizeSwordTechnique } from '../../shared/src/swordTechniques.mjs';

/** Armory changes configure the next match, never a tactical cooldown reset. */
export function applySavedLoadout(session, room, player, message) {
  session.spell = isSpell(message.spell) ? message.spell : DEFAULT_SPELL;
  session.ultimate = isUltimate(message.ultimate) ? message.ultimate : DEFAULT_ULTIMATE;
  session.preparedSpells = normalizePreparedSpells(session.spell, message.preparedSpells);
  // (an older client says nothing of it: what the session had stays)
  session.technique = normalizeSwordTechnique(message.technique ?? session.technique);
  session.siegeLoadout = normalizeSiegeLoadout(message.siegeLoadout??session.siegeLoadout);
  if (!player) return;
  // Equipment switches only while unmounted; an active apparatus cannot have
  // its current technique silently replaced by an Armory request.
  if (!player.operatingBallistaId&&!player.operatingRamId&&!player.operatingFightFlightId)
    player.siegeLoadout={...session.siegeLoadout};
  else player.queuedSiegeLoadout={...session.siegeLoadout};
  player.startingSpell = session.spell;
  player.startingPreparedSpells = [...session.preparedSpells];
  player.startingUltimate = session.ultimate;
  player.startingTechnique = session.technique;
  if (room?.state === 'PLAYING') return;
  player.spell = session.spell;
  player.preparedSpells = [...session.preparedSpells];
  player.ultimate = session.ultimate;
  player.technique = session.technique;
}
