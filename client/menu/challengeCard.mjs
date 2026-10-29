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

export function challengeCopy({ mode, players = [], localId = null, worldId = 'castleward', scoreToWin = 10, teamSize = 3 } = {}) {
  const world = worldName(worldId);
  const me = players.find((p) => p.id === localId);
  if (mode === 'BREAKTHROUGH') {
    const defending = me?.team === 'DEFENDERS';
    return {
      kicker: defending ? 'BREAKTHROUGH · DEFEND THE BASTION' : 'BREAKTHROUGH · SIEGE ASSAULT',
      you: defending ? 'DEFENDERS' : 'ATTACKERS',
      foe: defending ? 'ATTACKERS' : 'DEFENDERS',
      copy: `${world} · ${defending ? 'Defend' : 'Capture'} ${worldId === 'bastion-breach' ? 'the Outer Gate' : 'the first objective'} (${teamSize}v${teamSize})`,
    };
  }
  const others = players.filter((p) => p.id !== localId && p.actorKind !== 'dummy');
  const you = me?.name || 'YOU';
  const place = `${world} · first to ${scoreToWin ?? 10}`;
  if (mode === 'BOT_DUEL' || others.length === 1) {
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
  if (mode === 'BOT_DUEL' || mode === 'DUEL') return { title, sub: `DUEL · ${first}` };
  return { title, sub: `FREE-FOR-ALL · ${first}` };
}
