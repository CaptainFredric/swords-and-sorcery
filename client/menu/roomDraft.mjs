import { arenaOptions, syncRuleForm } from './lobbyControls.mjs';
import { arenasForMode } from '../../shared/src/modes.mjs';

export const PUBLIC_ROOM_FILTERS = Object.freeze([
  'ALL',
  'FFA',
  'BREAKTHROUGH',
  'SIEGE_BLADES',
  'HIGH_GROUNDS',
  'EDGE_OF_VICTORY',
]);

/** Preserves valid public room mode filters instead of silently resetting Siege Blades or Edge of Victory to ALL. */
export function normalizeRoomFilter(mode) {
  return PUBLIC_ROOM_FILTERS.includes(mode) ? mode : 'ALL';
}

/** Applies carried battle orders / mode configuration onto Open Rooms or Private Rooms rule forms. */
export function applyDraftToRuleForm(form, mode, draft = null) {
  if (!form?.elements) return;
  const f = form.elements;
  if (f.mode && f.mode.value !== mode) {
    const allowed = [...(f.mode.options ?? [])].some((opt) => opt.value === mode);
    if (allowed) f.mode.value = mode;
  }
  if (f.worldId) {
    const validWorlds = arenasForMode(mode);
    const chosenWorld = draft?.worldId && validWorlds.includes(draft.worldId) ? draft.worldId : null;
    f.worldId.innerHTML = arenaOptions(mode, chosenWorld);
    if (chosenWorld) f.worldId.value = chosenWorld;
  }
  if (draft) {
    if (f.teamSize && draft.teamSize !== undefined && draft.teamSize !== null) {
      const sizeStr = String(draft.teamSize);
      const opt = [...(f.teamSize.options ?? [])].find((o) => o.value === sizeStr);
      if (opt) opt.hidden = opt.disabled = false;
      f.teamSize.value = sizeStr;
    }
    if (f.team && draft.team) f.team.value = draft.team;
    if (f.botSkill && draft.botSkill) f.botSkill.value = draft.botSkill;
    if (f.scoreToWin && Number.isFinite(Number(draft.scoreToWin))) f.scoreToWin.value = String(draft.scoreToWin);
    if (f.minutes && Number.isFinite(Number(draft.minutes))) f.minutes.value = String(draft.minutes);
    if (f.format && draft.format) f.format.value = draft.format;
    if (f.matchRounds && draft.matchRounds !== undefined) f.matchRounds.value = String(draft.matchRounds);
    if (f.endlessRoundCap && draft.endlessRoundCap !== undefined) f.endlessRoundCap.value = String(draft.endlessRoundCap);
    if (f.clashStarts && typeof draft.clashStarts === 'boolean') f.clashStarts.value = draft.clashStarts ? 'on' : 'off';
    if (f.experimentalDragOon && typeof draft.experimentalDragOon === 'boolean') f.experimentalDragOon.checked = draft.experimentalDragOon;
  }
  syncRuleForm(form, mode, { resetTime: !draft });
}
