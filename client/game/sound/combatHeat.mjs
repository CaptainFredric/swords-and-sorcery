// How hot the fight is around you, for the battle music: 0 calm, 1 blades out nearby, 2 the fight is on (you are
// trading blows, or the match is about to be decided). It holds for a few seconds after the last blow, so the drums
// do not drop out between exchanges.

export const HEAT = Object.freeze({ fightHold: 7, stirHold: 10, nearDistance: 14, closingSeconds: 30 });

export class CombatHeat {
  constructor() {
    this.lastFightAt = -Infinity;
    this.lastStirAt = -Infinity;
  }

  /** You struck, were struck, blocked or parried. */
  fight(now) { this.lastFightAt = now; }

  /** Steel somewhere in the arena. */
  stir(now) { this.lastStirAt = now; }

  level({ now, nearestFoe = Infinity, closing = false, cap = 2 }) {
    let level = 0;
    if (now - this.lastStirAt < HEAT.stirHold || nearestFoe < HEAT.nearDistance) level = 1;
    if (now - this.lastFightAt < HEAT.fightHold || closing) level = 2;
    return Math.min(level, cap);
  }
}

/** The match is about to be decided: someone is one blow from winning, or the clock is nearly out. */
export function matchClosing(snapshot, serverNow) {
  if (!snapshot || snapshot.roomState !== 'PLAYING' || snapshot.mode === 'PRACTICE') return false;
  if (snapshot.suddenDeath) return true;
  const needed = snapshot.scoreToWin;
  if (Number.isFinite(needed) && snapshot.players?.some((p) => p.kills >= needed - 1)) return true;
  if (Number.isFinite(snapshot.matchStartedAt) && Number.isFinite(snapshot.matchSeconds)) {
    return snapshot.matchStartedAt + snapshot.matchSeconds - serverNow < HEAT.closingSeconds;
  }
  return false;
}

/** Distance to the nearest living Spellblade who can fight back (training dummies do not count). */
export function nearestFoe(me, players = []) {
  if (!me?.position) return Infinity;
  let best = Infinity;
  for (const player of players) {
    if (player.id === me.id || player.alive === false || player.actorKind === 'dummy' || !player.position) continue;
    best = Math.min(best, Math.hypot(player.position.x - me.position.x, player.position.z - me.position.z));
  }
  return best;
}
