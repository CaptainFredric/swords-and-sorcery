// What the challenger countdown card and the arena gate say for a match.
import { WORLD_NAMES } from './lobbyView.mjs';

function worldName(worldId) {
  return WORLD_NAMES[worldId] ?? 'Castleward';
}

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);

export function romanCount(seconds) {
  return ROMAN[seconds] ?? String(seconds);
}

export function countdownSeconds(countdownEndsAt, serverNow) {
  if (!Number.isFinite(countdownEndsAt) || !Number.isFinite(serverNow)) return null;
  return Math.max(1, Math.ceil(countdownEndsAt - serverNow));
}

const SOLO_FOES = Object.freeze({
  RENOWN_TRIALS: 'VS. JUDGMENT',
  EDGE_OF_VICTORY: 'VS. THE WORLD',
  BOT_DUEL: 'VS. YOUR RIVAL',
  RESTLESS_DAY: 'VS. SUNDOWN',
});

export function challengeCopy({ mode, players = [], localId = null, worldId = 'castleward', scoreToWin = 10, teamSize = 3 } = {}) {
  const world = worldName(worldId);
  const me = players.find((p) => p.id === localId);
  const you = me?.name || 'YOU';
  const place = `${world} · first to ${scoreToWin ?? 10}`;
  if (SOLO_FOES[mode]) return { kicker: 'THE TRIAL AWAITS', you, foe: SOLO_FOES[mode], copy: mode === 'BOT_DUEL' ? place : world };
  // A team is an arrangement of supporting Squires, not a replacement for
  // the local Spellblade's name. Count the roster, never the living actors:
  // individual deaths must not make the introduction flicker.
  const teamMode = mode === 'BREAKTHROUGH' || mode === 'HIGH_GROUNDS' ||
    (me?.team && !['FFA', 'DUEL', 'BOT_DUEL', 'PRACTICE'].includes(mode));
  if (teamMode && me?.team) {
    const roster = players.filter(p => p?.id != null && p.actorKind !== 'dummy');
    const allies = roster.filter(p => p.id !== localId && p.team === me.team).length;
    const rivals = roster.filter(p => p.id !== localId && p.team !== me.team).length;
    const defending = me.team === 'DEFENDERS';
    const objective = mode === 'BREAKTHROUGH'
      ? (defending ? 'Defend' : 'Capture') + ' ' +
        (worldId === 'bastion-breach' ? 'the Outer Gate' : 'the first objective')
      : 'Claim the rival outposts';
    return {
      kicker: mode === 'BREAKTHROUGH'
        ? (defending ? 'BREAKTHROUGH · DEFEND THE BASTION' : 'BREAKTHROUGH · SIEGE ASSAULT')
        : 'THE HIGH GROUNDS · TAKE THE HEIGHTS',
      you: me.name || 'YOU',
      squires: allies ? '& ' + allies + ' ' + (allies === 1 ? 'SQUIRE' : 'SQUIRES') : '',
      foe: 'VS. ' + rivals + ' ' + (rivals === 1 ? 'RIVAL' : 'RIVALS'),
      copy: world + ' · ' + objective + ' (' + teamSize + 'v' + teamSize + ')',
    };
  }
  const others = players.filter((p) => p.id !== localId && p.actorKind !== 'dummy');
  if (others.length === 1) {
    return {
      kicker: 'A WORTHY CHALLENGER',
      you,
      foe: others[0]?.name || 'RIVAL',
      copy: place,
    };
  }
  return {
    kicker: 'THE MELEE BEGINS',
    you,
    foe: `${others.length} RIVALS`,
    copy: place,
  };
}

export function arenaGateCopy({ mode, worldId = 'castleward', scoreToWin = 10, team = null, teamSize = 3 } = {}) {
  const title = worldName(worldId).toUpperCase();
  const first = `FIRST TO ${scoreToWin ?? 10}`;
  if (mode === 'PRACTICE') return { title, sub: 'PRACTICE YARD · UNTIMED' };
  if (mode === 'BREAKTHROUGH') {
    const sub = team === 'DEFENDERS'
      ? (worldId === 'bastion-breach' ? 'DEFENDERS · HOLD THE OUTER GATE' : 'DEFENDERS · HOLD THE OBJECTIVES')
      : team === 'ATTACKERS'
        ? (worldId === 'bastion-breach' ? 'ATTACKERS · CAPTURE THE OUTER GATE' : 'ATTACKERS · CAPTURE THE OBJECTIVES')
        : `BREAKTHROUGH · ${teamSize}V${teamSize} SIEGE`;
    return { title, sub };
  }
  if (SOLO_FOES[mode]) return { title, sub: SOLO_FOES[mode] };
  if (mode === 'DUEL') return { title, sub: `DUEL · ${first}` };
  return { title, sub: `FREE-FOR-ALL · ${first}` };
}
