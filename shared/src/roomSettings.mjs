import { arenasForMode, getModePolicy } from './modes.mjs';
export const ROOM_LIMITS = Object.freeze({ score: [1, 100], seconds: [60, 1800] });
export function validRoomNumber(key, value) {
  const range = key === 'score' ? ROOM_LIMITS.score : key === 'time' ? ROOM_LIMITS.seconds : null;
  return Boolean(range && Number.isInteger(value) && value >= range[0] && value <= range[1]);
}
// Siege Blades plays rounds, not a timed match: a room chooses its format and how many rounds (a fixed number for a
// Match, a cap for an Endless Exhibition), and whether a 1v1 exhibition may open with a clash.
export const SIEGE_ROOM_RULES = Object.freeze({
  formats: Object.freeze(['MATCH', 'ENDLESS']),
  matchRounds: Object.freeze([3, 5, 7]),
  endlessRoundCaps: Object.freeze([0, 10, 25, 50]),
  defaults: Object.freeze({ format: 'MATCH', matchRounds: 3, endlessRoundCap: 25, clashStarts: null }),
});
export const SOLO_ONLY_MODES = Object.freeze({
  RENOWN_TRIALS: 'Rampage to Renown is a solo trial with account rewards: begin it from Modes of Mettle.',
});
function siegeSettings(current, patch, changedMode) {
  const was = (!changedMode && current.siegeBladesSettings) || {};
  const pick = (key) => patch[key] ?? was[key] ?? SIEGE_ROOM_RULES.defaults[key];
  const format = pick('format'), matchRounds = Number(pick('matchRounds')), endlessRoundCap = Number(pick('endlessRoundCap'));
  const clash = pick('clashStarts');
  const experimentalDragOon = Boolean(pick('experimentalDragOon'));
  if (!SIEGE_ROOM_RULES.formats.includes(format)) return { error: 'Choose a Match or an Endless Exhibition.' };
  if (!SIEGE_ROOM_RULES.matchRounds.includes(matchRounds)) return { error: 'A Match plays 3, 5 or 7 rounds.' };
  if (!SIEGE_ROOM_RULES.endlessRoundCaps.includes(endlessRoundCap)) return { error: 'An exhibition caps at 10, 25 or 50 rounds, or none.' };
  if (clash !== null && typeof clash !== 'boolean') return { error: 'Choose whether clash starts are enabled.' };
  return { format, matchRounds, endlessRoundCap, clashStarts: clash, ...(experimentalDragOon ? { experimentalDragOon: true } : {}) };
}
export function roomSettings(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'Choose valid room settings.' };
  const mode = patch.mode ?? current.mode;
  if (SOLO_ONLY_MODES[mode]) return { error: SOLO_ONLY_MODES[mode] };
  if (!['FFA', 'BREAKTHROUGH', 'HIGH_GROUNDS', 'RESTLESS_DAY', 'EDGE_OF_VICTORY', 'SIEGE_BLADES'].includes(mode)) return { error: 'Choose an available battle mode.' };
  const changedMode = mode !== current.mode, defaults = getModePolicy(mode);
  const worlds = arenasForMode(mode);
  const worldId = patch.worldId ?? (!changedMode && worlds.includes(current.worldId) ? current.worldId : worlds[0]);
  if (!worlds.includes(worldId)) return { error: 'That arena belongs to another mode.' };
  const scoreToWin = mode === 'FFA' ? (patch.scoreToWin ?? (!changedMode ? current.scoreToWin : defaults.scoreToWin)) : null;
  // (Siege Blades times its own rounds: a room's match time does not apply, and keeps the mode's own)
  const matchSeconds = mode === 'SIEGE_BLADES' ? defaults.matchSeconds
    : patch.matchSeconds ?? (!changedMode ? current.policy.matchSeconds : defaults.matchSeconds);
  const teamSize = mode === 'RESTLESS_DAY' ? 5 : (mode === 'BREAKTHROUGH' || mode === 'HIGH_GROUNDS' || mode === 'SIEGE_BLADES') ? (patch.teamSize ?? (!changedMode ? current.policy.teamSize : (mode === 'SIEGE_BLADES' ? 1 : 3))) : null;
  const botSkill = (mode === 'BREAKTHROUGH' || mode === 'HIGH_GROUNDS' || mode === 'RESTLESS_DAY' || mode === 'EDGE_OF_VICTORY' || mode === 'SIEGE_BLADES') ? (patch.botSkill ?? (!changedMode ? current.botSkill : 'knight')) : null;
  if (mode === 'FFA' && !validRoomNumber('score', scoreToWin)) return { error: 'First to must be a whole number from 1 to 100.' };
  if (!validRoomNumber('time', matchSeconds)) return { error: 'Match time must be from 1 to 30 minutes.' };
  if (teamSize !== null && !(mode === 'RESTLESS_DAY' ? teamSize === 5 : mode === 'SIEGE_BLADES' ? [1, 2, 3].includes(teamSize) : [2, 3].includes(teamSize))) return { error: mode === 'SIEGE_BLADES' ? 'Choose 1v1, 2v2, or 3v3.' : 'Choose 2v2 or 3v3.' };
  if (botSkill !== null && !['squire', 'knight', 'champion', 'spellblade'].includes(botSkill)) return { error: 'Choose an available bot difficulty.' };
  const siege = mode === 'SIEGE_BLADES' ? siegeSettings(current, patch, changedMode) : null;
  if (siege?.error) return { error: siege.error };
  return { mode, worldId, scoreToWin, matchSeconds, teamSize, botSkill,
    siegeBladesSettings: siege ? { ...siege, teamSize, botDifficulty: botSkill } : null };
}
