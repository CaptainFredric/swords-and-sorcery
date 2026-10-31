export const GAME_MODES = Object.freeze({
  FFA: 'FFA',
  BOT_DUEL: 'BOT_DUEL',
  PRACTICE: 'PRACTICE',
  // server-wide random one-on-one, made by the matchmaker
  DUEL: 'DUEL',
  // objective-based team battle (attackers advance through sequential objectives)
  BREAKTHROUGH: 'BREAKTHROUGH',
  HIGH_GROUNDS: 'HIGH_GROUNDS',
});

// The tutorial world Greener Pastures is registered separately and deliberately absent from arena choices.
// The old greybox Shattered Keep stays only as a fixture for tests.
export const ARENAS = Object.freeze(['castleward', 'ruined-keep']);
export const BREAKTHROUGH_ARENAS = Object.freeze(['bastion-breach', 'outerworks', 'blackbell-foundry']);
export const HIGH_GROUNDS_ARENAS = Object.freeze(['high-grounds']);

/** An arena by id, or Castleward for anything that is not one. */
export function arenaOrDefault(worldId) {
  return (ARENAS.includes(worldId) || BREAKTHROUGH_ARENAS.includes(worldId) || HIGH_GROUNDS_ARENAS.includes(worldId)) ? worldId : ARENAS[0];
}


// what a room's players may vote on before a match (majority of connected Spellblades; a tie keeps the current)
export const VOTE_OPTIONS = Object.freeze({
  world: ARENAS,
  score: Object.freeze([5, 10, 15]),
  time: Object.freeze([180, 300, 360, 600, 900]),
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
    // the rival starts nothing for this long once the match begins (or until you do): time to find your feet
    openingPeaceSec: 3,
  }),
  [GAME_MODES.PRACTICE]: Object.freeze({
    id: GAME_MODES.PRACTICE,
    minHumansToStart: 1,
    botCount: 0,
    scored: false,
    // no prowess is earned here (the yard's tools can ready an ultimate to try)
    prowess: false,
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
  [GAME_MODES.HIGH_GROUNDS]: Object.freeze({
    id: GAME_MODES.HIGH_GROUNDS, teamMode: true, teamSize: 3,
    minHumansToStart: 1, botCount: 5, scored: false, timed: true,
    scoreToWin: null, matchSeconds: 720, respawnSec: 5,
    autoStart: true, allowRematchVote: true, countdownSec: 3,
    openingPeaceSec: 2,
  }),
  [GAME_MODES.BREAKTHROUGH]: Object.freeze({
    id: GAME_MODES.BREAKTHROUGH,
    teamMode: true,
    teamSize: 3,
    minHumansToStart: 1,
    botCount: 5,
    scored: false,
    timed: true,
    scoreToWin: null,
    matchSeconds: 300,
    respawnSec: 4.5,
    autoStart: true,
    allowRematchVote: true,
    countdownSec: 3,
    // the rival team opens in peace for a moment so players orient
    openingPeaceSec: 2,
  }),
});

export function getModePolicy(id) {
  const policy = POLICIES[id];
  if (!policy) throw new Error(`Unknown game mode: ${id}`);
  return policy;
}
