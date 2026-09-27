export const GAME_MODES = Object.freeze({
  FFA: 'FFA',
  BOT_DUEL: 'BOT_DUEL',
  PRACTICE: 'PRACTICE',
  // server-wide random one-on-one, made by the matchmaker
  DUEL: 'DUEL',
});

// what a room's players may vote on before a match (majority of connected Spellblades; a tie keeps the current)
export const VOTE_OPTIONS = Object.freeze({
  world: Object.freeze(['castleward', 'shattered-keep']),
  score: Object.freeze([5, 10, 15]),
});

const POLICIES = Object.freeze({
  [GAME_MODES.FFA]: Object.freeze({
    id: GAME_MODES.FFA,
    minHumansToStart: 2,
    botCount: 0,
    scored: true,
    timed: true,
    scoreToWin: 10,
    matchSeconds: 360,
    autoStart: false,
    allowRematchVote: true,
    countdownSec: 3,
    // no host gate: the match starts when every Spellblade is ready, or on its own this long after a second arrives
    readyCheck: true,
    votes: true,
  }),
  [GAME_MODES.BOT_DUEL]: Object.freeze({
    id: GAME_MODES.BOT_DUEL,
    minHumansToStart: 1,
    botCount: 1,
    scored: true,
    timed: true,
    scoreToWin: 10,
    matchSeconds: 360,
    autoStart: true,
    allowRematchVote: false,
    countdownSec: 3,
  }),
  [GAME_MODES.PRACTICE]: Object.freeze({
    id: GAME_MODES.PRACTICE,
    minHumansToStart: 1,
    botCount: 0,
    scored: false,
    timed: false,
    scoreToWin: null,
    matchSeconds: null,
    autoStart: true,
    allowRematchVote: false,
    countdownSec: 3,
  }),
  [GAME_MODES.DUEL]: Object.freeze({
    id: GAME_MODES.DUEL,
    minHumansToStart: 2,
    botCount: 0,
    scored: true,
    timed: true,
    scoreToWin: 5,
    matchSeconds: 240,
    autoStart: true,
    allowRematchVote: true,
    // long enough to read the challenger card
    countdownSec: 5,
    // a duellist who leaves forfeits
    forfeit: true,
  }),
});

export function getModePolicy(id) {
  const policy = POLICIES[id];
  if (!policy) throw new Error(`Unknown game mode: ${id}`);
  return policy;
}
