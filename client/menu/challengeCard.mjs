// Copy for the countdown card between the lobby and the arena, and for the arena gate. Pure, so it can be tested.

function worldName(worldId) {
  if (worldId === 'shattered-keep') return 'The Shattered Keep';
  return 'Castleward';
}

/** What the challenge card says while a match counts down. */
export function challengeCopy({ mode, players = [], localId = null, worldId = 'castleward' }) {
  const me = players.find((player) => player.id === localId);
  const others = players.filter((player) => player.id !== localId && player.actorKind !== 'dummy');
  const place = `${worldName(worldId)} · first to 10`;
  if (mode === 'BOT_DUEL' || others.length === 1) {
    return {
      kicker: 'A WORTHY CHALLENGER',
      you: me?.name || 'YOU',
      foe: others[0]?.name || 'RIVAL',
      copy: place,
    };
  }
  return {
    kicker: 'THE MELEE BEGINS',
    you: me?.name || 'YOU',
    foe: `${others.length} RIVALS`,
    copy: place,
  };
}

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);

/** The countdown as a Roman numeral (III, II, I), as the heralds would call it. */
export function romanCount(seconds) {
  return ROMAN[seconds] ?? String(seconds);
}

/** Whole seconds left on the countdown (never below 1 while it runs). */
export function countdownSeconds(countdownEndsAt, serverNow) {
  if (!Number.isFinite(countdownEndsAt) || !Number.isFinite(serverNow)) return null;
  return Math.max(1, Math.ceil(countdownEndsAt - serverNow));
}

/** The arena gate's title and subtitle as a match opens. */
export function arenaGateCopy({ mode, worldId = 'castleward' }) {
  const title = worldName(worldId).toUpperCase();
  if (mode === 'PRACTICE') return { title, sub: 'PRACTICE YARD · UNTIMED' };
  if (mode === 'BOT_DUEL') return { title, sub: 'DUEL · FIRST TO 10' };
  return { title, sub: 'FREE-FOR-ALL · FIRST TO 10' };
}
