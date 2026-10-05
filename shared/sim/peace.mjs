// The peace a fight can open in. For a few seconds after a match begins (a mode asks for it: its policy's
// openingPeaceSec), a bot does not begin the fight: it may move, look about, guard and slip a blow or a spell (defend
// itself), but it starts nothing. The peace ends by itself after those seconds, and at once for every bot the moment a
// player starts something: a swing, a spell, the gauntlet, an ultimate, or a blow landed. Kept on the room, so any mode
// (and any controller) can use it.

/** A peace of `seconds` from `nowSec` (a new match). */
export function beginPeace(room, nowSec, seconds) {
  room.peace = seconds > 0 ? { until: nowSec + seconds, brokenBy: null, brokenAt: null } : null;
}

// the hostile acts that end it, as the host records them, and who made each
const HOSTILE = Object.freeze({
  attackStarted: (event) => event.playerId,
  gauntletStrike: (event) => event.playerId,
  ultimateStart: (event) => event.playerId,
  // (calling a ward is no attack)
  spellCast: (event) => (event.spell === 'steel' ? null : event.playerId),
  damage: (event) => event.attackerId,
});

/**
 * Whether the peace still holds at `nowSec`. Looks first at what players have done since it last looked (the room's
 * events not yet sent, and anyone visibly swinging or gathering a spell): `isPlayer(actor)` says who counts.
 */
export function peaceHolds(room, nowSec, { isPlayer = (actor) => actor?.actorKind === 'human' } = {}) {
  const peace = room.peace;
  if (!peace || peace.brokenBy || nowSec >= peace.until) return false;
  for (const event of room.events ?? []) {
    const by = HOSTILE[event.type]?.(event);
    if (by && isPlayer(room.players.get(by))) return breakPeace(peace, by, nowSec);
  }
  for (const actor of room.players.values()) {
    if (isPlayer(actor) && actor.alive && (actor.attackActive || actor.pendingSpell)) return breakPeace(peace, actor.id, nowSec);
  }
  return true;
}

function breakPeace(peace, by, nowSec) {
  peace.brokenBy = by;
  peace.brokenAt = nowSec;
  return false;
}
