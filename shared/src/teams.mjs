// Team definitions and ally/enemy classification for team-based combat modes.

export const TEAMS = Object.freeze({
  ATTACKERS: 'ATTACKERS',
  DEFENDERS: 'DEFENDERS',
});

export const TEAM_NAMES = Object.freeze({
  [TEAMS.ATTACKERS]: 'Attackers',
  [TEAMS.DEFENDERS]: 'Defenders',
});

export const TEAM_COLORS = Object.freeze({
  [TEAMS.ATTACKERS]: Object.freeze({
    name: 'Azure',
    hex: 0x3d7eed,
    css: '#3d7eed',
  }),
  [TEAMS.DEFENDERS]: Object.freeze({
    name: 'Crimson',
    hex: 0xde3838,
    css: '#de3838',
  }),
});

/**
 * Resolves whether two combatants are allies.
 * In FFA, Duel, or unteamed combat, players are never allies (except with themselves).
 * In team matches, two combatants are allies if both have valid, identical team assignments.
 */
export function areAllies(room, a, b) {
  if (!a || !b) return false;
  const idA = typeof a === 'string' ? a : a.id;
  const idB = typeof b === 'string' ? b : b.id;
  if (idA && idB && idA === idB) return true;

  const playerA = typeof a === 'string' ? room?.players?.get?.(a) : a;
  const playerB = typeof b === 'string' ? room?.players?.get?.(b) : b;
  if (!playerA?.team || !playerB?.team) return false;
  return playerA.team === playerB.team;
}

/**
 * Resolves whether two combatants are hostile enemies.
 * An entity is never an enemy of itself.
 * Combatants on opposing teams, or players in unteamed/FFA modes, are enemies.
 */
export function areEnemies(room, a, b) {
  if (!a || !b) return false;
  const idA = typeof a === 'string' ? a : a.id;
  const idB = typeof b === 'string' ? b : b.id;
  if (idA && idB && idA === idB) return false;
  return !areAllies(room, a, b);
}

/**
 * Returns counts of players on each team in the room.
 */
export function getTeamCounts(room) {
  let attackers = 0;
  let defenders = 0;
  if (!room?.players) return { attackers, defenders };
  for (const player of room.players.values()) {
    if (player.team === TEAMS.ATTACKERS) attackers += 1;
    else if (player.team === TEAMS.DEFENDERS) defenders += 1;
  }
  return { attackers, defenders };
}

/**
 * Balances or assigns a team to a joining player/bot.
 */
export function assignTeam(room, requestedTeam = null, isHuman = false) {
  const teamSize = room?.policy?.teamSize ?? 3;
  let humanAttackers = 0;
  let humanDefenders = 0;
  if (room?.players) {
    for (const player of room.players.values()) {
      if (player.actorKind === 'human') {
        if (player.team === TEAMS.ATTACKERS) humanAttackers += 1;
        else if (player.team === TEAMS.DEFENDERS) humanDefenders += 1;
      }
    }
  }

  if (isHuman) {
    if (requestedTeam === TEAMS.ATTACKERS) {
      if (humanAttackers < teamSize) return TEAMS.ATTACKERS;
      if (humanDefenders < teamSize) return TEAMS.DEFENDERS;
      return TEAMS.ATTACKERS;
    }
    if (requestedTeam === TEAMS.DEFENDERS) {
      if (humanDefenders < teamSize) return TEAMS.DEFENDERS;
      if (humanAttackers < teamSize) return TEAMS.ATTACKERS;
      return TEAMS.DEFENDERS;
    }
    if (humanAttackers !== humanDefenders) {
      if (humanAttackers < humanDefenders && humanAttackers < teamSize) return TEAMS.ATTACKERS;
      if (humanDefenders < humanAttackers && humanDefenders < teamSize) return TEAMS.DEFENDERS;
    }
  } else if (requestedTeam === TEAMS.ATTACKERS || requestedTeam === TEAMS.DEFENDERS) {
    return requestedTeam;
  }

  const { attackers, defenders } = getTeamCounts(room);
  if (isHuman) {
    if (attackers <= defenders && humanAttackers < teamSize) return TEAMS.ATTACKERS;
    if (humanDefenders < teamSize) return TEAMS.DEFENDERS;
    if (humanAttackers < teamSize) return TEAMS.ATTACKERS;
  }
  return attackers <= defenders ? TEAMS.ATTACKERS : TEAMS.DEFENDERS;
}
