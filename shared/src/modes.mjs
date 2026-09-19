export const GAME_MODES = Object.freeze({
  FFA: 'FFA',
  BOT_DUEL: 'BOT_DUEL',
  PRACTICE: 'PRACTICE',
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
  }),
});

export function getModePolicy(id) {
  const policy = POLICIES[id];
  if (!policy) throw new Error(`Unknown game mode: ${id}`);
  return policy;
}
