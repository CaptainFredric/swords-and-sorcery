import { combatActionPolicy } from '../../shared/src/combatActionPolicy.mjs';

export const CHIVALRY_SIGNATURES = Object.freeze({ fireball: 0xff9852, frostfire: 0x77dfff, gale: 0xc5f3d8, steel: 0xdbe8f1 });
export const CHIVALRY_END_SEC = 0.3;

export function chivalryTellState(player, now, previous = {}) {
  const active = combatActionPolicy(player, now).concurrent && Boolean(player?.alive);
  const endedAt = active ? null : previous.active ? now : previous.endedAt ?? null;
  return {
    active,
    committedAt: active ? player.ultimateState.commitAt : previous.committedAt,
    endedAt,
    opacity: active ? 1 : endedAt === null ? 0 : Math.max(0, 1 - (now - endedAt) / CHIVALRY_END_SEC),
    signatures: player?.preparedSpells ?? previous.signatures ?? ['fireball', 'frostfire', 'gale'],
  };
}


const THIRD_PERSON_TELL = Object.freeze({ signatureRadius: 0.035, opacity: 0.65, commitRise: 0.06, spacing: 0.11, height: 0.055, depth: 0.015 });
const FIRST_PERSON_TELL = Object.freeze({ signatureRadius: 0.005, opacity: 0.25, commitRise: 0.006, spacing: 0.022, height: 0.018, depth: 0.014 });

export function chivalryTellStyle({ firstPerson = false } = {}) {
  return firstPerson ? FIRST_PERSON_TELL : THIRD_PERSON_TELL;
}
