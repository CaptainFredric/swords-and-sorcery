// The moments the Spellblade has a line for, read off what happens (the host's events) and remembered for a little
// while: who last threatened whom, how cleanly and how high one knight has been striking another, whose gust just
// threw whom, and the squire's question waiting for its answer. Each event gives the lines worth trying for it, in
// groups: within a group the first that is said is the only one (what belongs to the moment most comes first); each
// group is tried on its own. Whether a line is said is the voice's business (VoiceBank and VoiceDirector hold the
// odds, the cooldowns and the ranks). Pure but for its memory, so it is tested.
//
// knight(id): the knight as last seen (a snapshot's player: health, alive, staggerUntil, attackActive, guarding,
// dashUntil, sprinting, pitch, actorKind, practiceMode, cloth, ultimateState). Times are the host's (event.at).

import { deathLines, galeTauntScale, guardBreakLines, isMinorLethal, isOverkill } from './voiceRules.mjs';

export const MOMENTS = Object.freeze({
  // a knight near their end: this little health left, or reeling (staggered)
  nearDemise: 30,
  // the threat to a knight: whoever last hurt them, this recently (s)
  threatSec: 2.5,
  // the squire's question: asked over a foe left this low; answered by the first fall this near (m) the one who
  // asked, within `windowSec`
  squire: Object.freeze({ health: 30, windowSec: 8, near: 18 }),
  // a new knighthood: at least `hits` sword blows landed on the fallen, most of them (`share`) at the top of the scale
  // (`perfect` or more), aimed on average this high (radians); the fuller chance for a killing swing aimed `high`
  knighthood: Object.freeze({ hits: 2, perfect: 28, share: 0.75, pitch: 0.08, high: 0.2 }),
  // a gust that threw the fallen this recently makes the drop its kill (s)
  galeKillSec: 4,
  // thrown off their feet: a gust's heart this strong
  launch: 0.7,
  // a massive Sundering impact: its ruptures catching this many knights within this long (s)
  massive: Object.freeze({ caught: 2, withinSec: 0.8 }),
});

// the Practice Yard's opponents that fight (shared/sim/practice.mjs PRACTICE_DUMMY_MODES): not the ones that stand,
// guard or run
const FIGHTING = Object.freeze(['FIGHTS_BACK', 'SORCERY', 'MELEE']);

// the wildcard is for discrete things: never a burn's licks, and a fall has lines of its own
const wild = (source) => source !== 'burn' && source !== 'abyss';

const sundering = (knight, at) => knight?.ultimateState?.phase === 'active' && at < (knight.ultimateState.until ?? -Infinity);

export class VoiceMoments {
  constructor({ rand = Math.random } = {}) {
    this.rand = rand;
    this.threats = new Map();   // victim -> { by, at }
    this.strikes = new Map();   // `${attacker}>${victim}` -> [{ amount, pitch }]
    this.gusts = new Map();     // `${owner}>${victim}` -> when it threw them
    this.ruptured = new Map();  // owner -> when their ruptures caught someone, lately
    this.squire = null;         // { speaker, until, position }
  }

  /** A blow landed (a `damage` event). */
  damage(event, { knight = () => null } = {}) {
    const { attackerId, victimId, source, at } = event;
    if (!(event.amount > 0)) return [];
    const groups = [];
    const other = Boolean(attackerId) && attackerId !== victimId;
    if (other) this.threats.set(victimId, { by: attackerId, at });
    if (other && source === 'sword') {
      const key = `${attackerId}>${victimId}`;
      // (a Sundering blow is force, not finesse: it does not count toward a knighthood)
      const list = [...(this.strikes.get(key) ?? []), { amount: event.level ? 0 : event.amount, pitch: knight(attackerId)?.pitch ?? 0 }];
      this.strikes.set(key, list.slice(-8));
    }
    // a Sundering slam whose split ground catches two: force has settled the argument
    if (other && source === 'rupture') {
      const recent = [...(this.ruptured.get(attackerId) ?? []).filter((t) => at - t <= MOMENTS.massive.withinSec), at];
      this.ruptured.set(attackerId, recent);
      if (recent.length === MOMENTS.massive.caught) groups.push([{ line: 'victory', speaker: attackerId, delay: 0.5 }]);
    }
    const standing = event.health > 0;
    if (other && standing) {
      const said = [];
      // "What did the squire say to the Spellblade?" over a foe he has all but finished
      if (event.health <= MOMENTS.squire.health) said.push({ line: 'squireSetup', speaker: attackerId, delay: 0.45, squire: true });
      // the cleanest blow, through the foe's own swing
      if (source === 'sword' && event.clean && knight(victimId)?.attackActive) said.push({ line: 'hackSlash', speaker: attackerId, delay: 0.4, chanceScale: 0.6 });
      if (wild(source)) said.push({ line: 'laugh', speaker: attackerId, delay: 0.3 });
      groups.push(said);
    }
    // (a blow that kills has the fall's own lines)
    if (standing && wild(source)) groups.push([{ line: 'laugh', speaker: victimId, delay: 0.3 }]);
    return groups;
  }

  /**
   * A knight fell (a `death` event): { fallen, victor, rescued } (the fallen first; the victor only if the fallen kept
   * quiet; each rescued group on its own). blow: the killing blow ({ amount, healthBefore, level, ultimate, clean }).
   */
  death(event, { blow = null, knight = () => null, positionOf = () => null, practice = false } = {}) {
    const { victimId, source, at } = event;
    const killerId = event.killerId && event.killerId !== victimId ? event.killerId : null;
    const victim = knight(victimId);
    const killer = killerId ? knight(killerId) : null;
    // the squire's question: the first fall near whoever asked it is the answer
    let answer = false;
    if (this.squire && at > this.squire.until) this.squire = null;
    if (this.squire) {
      const here = positionOf(victimId);
      const asked = this.squire.position;
      answer = !asked || !here || Math.hypot(here.x - asked.x, here.z - asked.z) <= MOMENTS.squire.near;
      if (answer) this.squire = null;
    }
    const gale = Boolean(killerId) && source === 'abyss' && at - (this.gusts.get(`${killerId}>${victimId}`) ?? -Infinity) <= MOMENTS.galeKillSec;
    const moment = killerId ? {
      sunder: blow?.level === 'elevated' || source === 'rupture',
      knighthood: source === 'sword' ? this.#knighthood(killerId, victimId) : 0,
      gale,
      clean: Boolean(blow?.clean),
      subpar: killer?.actorKind === 'human' && victim?.actorKind === 'human' && (victim.cloth ?? 'crimson') !== 'crimson',
      practice: practice && victim?.actorKind === 'dummy' && FIGHTING.includes(victim.practiceMode),
      // a kill that arrived late and messily: a burn's last lick, a fall he only set going
      messy: source === 'burn' || (source === 'abyss' && !gale),
    } : {};
    const minor = Boolean(blow) && isMinorLethal({ ...blow, source });
    const interrupted = Boolean(victim && (victim.attackActive || victim.guarding || victim.sprinting || (victim.dashUntil ?? -Infinity) > at));
    const overkill = Boolean(blow) && isOverkill(blow);
    const { fallen, victor } = deathLines({
      victimId, killerId, source, overkill, minor, interrupted, decisive: Boolean(event.decisive), answer, moment,
    }, this.rand);
    // whoever the fallen was threatening, near their own end, saved by somebody else
    const rescued = this.#rescues(victimId, killerId, at, knight);
    this.#forget(victimId);
    return { fallen, victor, rescued, answer };
  }

  /** A gust caught knights (a `galeBlast`'s `affected`): the jibe, the thrown, and anyone it rescued. */
  galeCaught(event, { knight = () => null } = {}) {
    const groups = [];
    const jibe = galeTauntScale(event.affected ?? []);
    if (jibe > 0) groups.push([{ line: 'galeTaunt', speaker: event.playerId, delay: 0.7, chanceScale: jibe }]);
    for (const caught of event.affected ?? []) {
      if (caught.guarded || !(caught.pressure >= 0.5)) continue;
      this.gusts.set(`${event.playerId}>${caught.id}`, event.at);
      groups.push(...this.#rescues(caught.id, event.playerId, event.at, knight));
      if (caught.pressure >= MOMENTS.launch) groups.push([{ line: 'laugh', speaker: caught.id, delay: 0.4 }]);
    }
    return groups;
  }

  /** A knight's balance broke (a `staggerBreak`): the one who broke it, and anyone it rescued. */
  staggerBreak(event, { knight = () => null } = {}) {
    const groups = [];
    if (event.by) {
      groups.push([
        // a Sundering blow that breaks a knight is force settling the argument
        ...(sundering(knight(event.by), event.at) ? [{ line: 'victory', speaker: event.by, delay: 0.6 }] : []),
        { line: 'staggerDisplay', speaker: event.by, delay: 0.6 },
      ]);
    }
    groups.push(...this.#rescues(event.playerId, event.by ?? null, event.at, knight));
    return groups;
  }

  /** A guard broke (a `guardBreak`). */
  guardBreak(event) {
    return [guardBreakLines({ attackerId: event.attackerId, catastrophic: (event.impacts ?? 1) >= 2 })];
  }

  /** Whether someone has hurt `id` within the last moment (a knight with a threat at their heels). */
  underPressure(id, at) {
    const threat = this.threats.get(id);
    return Boolean(threat) && at - threat.at <= MOMENTS.threatSec;
  }

  /** The squire's question was asked: the next fall near `position` (within the window) answers it. */
  squireAsked(speaker, at, position = null) {
    this.squire = { speaker, until: at + MOMENTS.squire.windowSec, position: position ? { x: position.x, z: position.z } : null };
  }

  /** A new match: nothing carries over. */
  reset() {
    this.threats.clear();
    this.strikes.clear();
    this.gusts.clear();
    this.ruptured.clear();
    this.squire = null;
  }

  // 0, or 1 when the killer's blows on the fallen were mostly perfect and aimed high on the whole (2: and the killing
  // swing higher still)
  #knighthood(killerId, victimId) {
    const rules = MOMENTS.knighthood;
    const hits = this.strikes.get(`${killerId}>${victimId}`) ?? [];
    if (hits.length < rules.hits) return 0;
    const perfect = hits.filter((hit) => hit.amount >= rules.perfect).length / hits.length;
    const pitch = hits.reduce((sum, hit) => sum + hit.pitch, 0) / hits.length;
    if (perfect < rules.share || pitch < rules.pitch) return 0;
    return hits[hits.length - 1].pitch >= rules.high ? 2 : 1;
  }

  // the knights `threatId` was threatening a moment ago who are near their end, now saved by someone else (`by`, or
  // nobody at all: the threat fell off the edge on its own)
  #rescues(threatId, by, at, knight) {
    const saved = [];
    for (const [id, threat] of this.threats) {
      if (threat.by !== threatId || id === by || id === threatId || at - threat.at > MOMENTS.threatSec) continue;
      const k = knight(id);
      if (!k || k.alive === false) continue;
      if ((k.health ?? 100) <= MOMENTS.nearDemise || (k.staggerUntil ?? -Infinity) > at) saved.push([{ line: 'alwaysKnew', speaker: id, delay: 0.7 }]);
    }
    return saved;
  }

  #forget(id) {
    this.threats.delete(id);
    for (const [victim, threat] of [...this.threats]) if (threat.by === id) this.threats.delete(victim);
    for (const map of [this.strikes, this.gusts]) {
      for (const key of [...map.keys()]) if (key.endsWith(`>${id}`)) map.delete(key);
    }
  }
}
