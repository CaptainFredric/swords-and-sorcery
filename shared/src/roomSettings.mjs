import { ARENAS, BREAKTHROUGH_ARENAS, getModePolicy } from './modes.mjs';
export const ROOM_LIMITS = Object.freeze({ score: [1, 100], seconds: [60, 1800] });
export function validRoomNumber(key, value) {
  const range = key === 'score' ? ROOM_LIMITS.score : key === 'time' ? ROOM_LIMITS.seconds : null;
  return Boolean(range && Number.isInteger(value) && value >= range[0] && value <= range[1]);
}
export function roomSettings(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'Choose valid room settings.' };
  const mode = patch.mode ?? current.mode;
  if (!['FFA', 'BREAKTHROUGH'].includes(mode)) return { error: 'Choose Free for All or Breakthrough.' };
  const changedMode = mode !== current.mode, defaults = getModePolicy(mode);
  const worlds = mode === 'BREAKTHROUGH' ? BREAKTHROUGH_ARENAS : ARENAS;
  const worldId = patch.worldId ?? (!changedMode && worlds.includes(current.worldId) ? current.worldId : worlds[0]);
  if (!worlds.includes(worldId)) return { error: 'That arena belongs to another mode.' };
  const scoreToWin = mode === 'FFA' ? (patch.scoreToWin ?? (!changedMode ? current.scoreToWin : defaults.scoreToWin)) : null;
  const matchSeconds = patch.matchSeconds ?? (!changedMode ? current.policy.matchSeconds : defaults.matchSeconds);
  const teamSize = mode === 'BREAKTHROUGH' ? (patch.teamSize ?? (!changedMode ? current.policy.teamSize : 3)) : null;
  if (mode === 'FFA' && !validRoomNumber('score', scoreToWin)) return { error: 'First to must be a whole number from 1 to 100.' };
  if (!validRoomNumber('time', matchSeconds)) return { error: 'Match time must be from 1 to 30 minutes.' };
  if (teamSize !== null && ![2, 3].includes(teamSize)) return { error: 'Choose 2v2 or 3v3.' };
  return { mode, worldId, scoreToWin, matchSeconds, teamSize };
}
