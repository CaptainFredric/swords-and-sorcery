// Who is out on the round, and in which part. One knight makes the round (the traveller); one rival waits at each of
// the stops; any other rival is out of sight (the spare). At the start of every visit the traveller is the player's own
// Spellblade, as the menu shows him. The Gale Lift-Off Handover passes the round to the rival at that stop (the one who
// stares after him: tourFights.mjs), and after that the round keeps changing hands every so often, between his rivals
// and him, out of sight (a change of map: TourDirector).
//
// Visual only, and kept so: the player's knight is never put at a stop (a rival's part is to be burned, frozen, drunk
// and broken, all of which is done to that rival's own copy of the model), and nothing here, or that reads it, touches
// the player's knight beyond showing, hiding and posing him as the traveller. Pure: names in, names out.

export const HERO = 'hero';

/** The cast at the start of a visit: the player's knight travelling, rivals 0..stops-1 at the stops, the rest spare. */
export function createCast(rivals = 4, stops = 3) {
  const all = Array.from({ length: rivals }, (_, index) => index);
  return Object.freeze({ traveller: HERO, posted: Object.freeze(all.slice(0, stops)), spare: Object.freeze(all.slice(stops)), handovers: 0 });
}

/**
 * The round handed over at a stop: the rival there makes the round from now on. Whoever made it before is gone (flown
 * off): a rival takes the stop's place in the next rounds (the spare, if the player's knight was travelling; the one
 * who flew off, if a rival was), out of sight until then.
 */
export function handOver(cast, stop) {
  const taker = cast.posted[stop];
  if (taker === undefined) return cast;
  const posted = [...cast.posted];
  const spare = [...cast.spare];
  if (cast.traveller === HERO) posted[stop] = spare.shift() ?? null;
  else posted[stop] = cast.traveller;
  return Object.freeze({ traveller: taker, posted: Object.freeze(posted), spare: Object.freeze(spare), handovers: cast.handovers + 1 });
}

/**
 * The round changing hands out of sight (at a change of map): back to the player's knight if a rival has it, or, if he
 * has it again, to one of the rivals at the stops (`random`, 0..1, picks which), the spare taking that rival's stop.
 */
export function changeHands(cast, random = Math.random) {
  if (cast.traveller !== HERO) {
    return Object.freeze({ traveller: HERO, posted: cast.posted, spare: Object.freeze([...cast.spare, cast.traveller]), handovers: cast.handovers + 1 });
  }
  if (!cast.spare.length) return cast;
  const stop = Math.min(cast.posted.length - 1, Math.floor(random() * cast.posted.length));
  const posted = [...cast.posted];
  const spare = [...cast.spare];
  const taker = posted[stop];
  posted[stop] = spare.shift();
  return Object.freeze({ traveller: taker, posted: Object.freeze(posted), spare: Object.freeze(spare), handovers: cast.handovers + 1 });
}

/** Every rival is somewhere exactly once, and the player's knight is never at a stop or spare. */
export function castIsSound(cast, rivals = 4) {
  const placed = [...cast.posted, ...cast.spare, ...(cast.traveller === HERO ? [] : [cast.traveller])];
  if (placed.includes(HERO)) return false;
  if (placed.some((index) => index === null || index === undefined)) return false;
  return placed.length === rivals && new Set(placed).size === rivals;
}
