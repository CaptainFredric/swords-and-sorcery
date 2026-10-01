// The moments the Spellblade has a line for, read off what happens (the host's events) and remembered for a little
// while: who last threatened whom, how cleanly and how high one knight has been striking another, whose gust just
// threw whom, and the squire's question waiting for its answer. Each event gives the lines worth trying for it, in
// groups: within a group the first that is said is the only one (what belongs to the moment most comes first); each
// group is tried on its own. Whether a line is said is the voice's business (VoiceBank and VoiceDirector hold the
// odds, the cooldowns and the ranks). Pure but for its memory, so it is tested.
//
// knight(id): the knight as last seen (a snapshot's player: health, alive, staggerUntil, attackActive, guarding,
// dashUntil, sprinting, pitch, actorKind, practiceMode, cloth, ultimateState). Times are the host's (event.at).

import { deathMoment, galeTauntScale, isMinorLethal, isOverkill } from './voiceRules.mjs';
import { VOICE_LINE_LIST, linesFor } from './voiceLines.mjs';

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
    this.seen = new Map();      // tag -> how often its moment has been raised (for telling why a line is never heard)
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
      if (recent.length === MOMENTS.massive.caught) groups.push(this.#lines(attackerId, ['massiveSunder']));
    }
    const standing = event.health > 0;
    if (other && standing) {
      groups.push(this.#lines(attackerId, [
        // a foe he has all but finished (the squire's question); the cleanest blow, through the foe's own swing
        event.health <= MOMENTS.squire.health && 'squireOpening',
        source === 'sword' && event.clean && knight(victimId)?.attackActive && 'counterHit',
        wild(source) && 'blowDealt',
      ]));
    }
    // (a blow that kills has the fall's own lines)
    if (standing && wild(source)) groups.push(this.#lines(victimId, ['blowTaken']));
    return groups.filter((group) => group.length);
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
      // their plate still hardened as the killing blow landed (the host's word)
      steel: Boolean(event.steeled),
      clean: Boolean(blow?.clean),
      subpar: killer?.actorKind === 'human' && victim?.actorKind === 'human' && (victim.cloth ?? 'crimson') !== 'crimson',
      practice: practice && victim?.actorKind === 'dummy' && FIGHTING.includes(victim.practiceMode),
      // a kill that arrived late and messily: a burn's last lick, a fall he only set going
      messy: source === 'burn' || (source === 'abyss' && !gale),
    } : {};
    const minor = Boolean(blow) && isMinorLethal({ ...blow, source });
    const interrupted = Boolean(victim && (victim.attackActive || victim.guarding || victim.sprinting || (victim.dashUntil ?? -Infinity) > at));
    const overkill = Boolean(blow) && isOverkill(blow);
    const fall = deathMoment({ victimId, killerId, source, overkill, minor, interrupted, decisive: Boolean(event.decisive), dizzy: Boolean(event.dizzy), moment });
    // (the squire's answer is forced: a line, never a grunt, and nobody talks over it)
    const fallen = this.#lines(victimId, fall.fallen, { facts: fall.facts, force: answer });
    const victor = !answer && fall.victor ? this.#lines(killerId, fall.victor, { facts: fall.victorFacts }) : [];
    // whoever the fallen was threatening, near their own end, saved by somebody else
    const rescued = this.#rescues(victimId, killerId, at, knight);
    this.#forget(victimId);
    return { fallen, victor, rescued, answer };
  }

  /** A gust caught knights (a `galeBlast`'s `affected`): the jibe, the thrown, and anyone it rescued. */
  galeCaught(event, { knight = () => null } = {}) {
    const groups = [];
    // (how fitting the jibe is, the moment says itself: likelier the harder the gust threw them)
    const jibe = galeTauntScale(event.affected ?? []);
    if (jibe > 0) groups.push(this.#lines(event.playerId, { galeDisplacement: jibe }));
    for (const caught of event.affected ?? []) {
      if (caught.guarded || !(caught.pressure >= 0.5)) continue;
      this.gusts.set(`${event.playerId}>${caught.id}`, event.at);
      groups.push(...this.#rescues(caught.id, event.playerId, event.at, knight));
      if (caught.pressure >= MOMENTS.launch) groups.push(this.#lines(caught.id, ['launched']));
    }
    return groups.filter((group) => group.length);
  }

  /** A knight's balance broke (a `staggerBreak`): the one who broke it, and anyone it rescued. */
  staggerBreak(event, { knight = () => null } = {}) {
    const groups = [];
    // (a Sundering blow that breaks a knight is force settling the argument)
    if (event.by) groups.push(this.#lines(event.by, ['staggerBreakInflicted', sundering(knight(event.by), event.at) && 'sunderStaggerBreak']));
    groups.push(...this.#rescues(event.playerId, event.by ?? null, event.at, knight));
    return groups.filter((group) => group.length);
  }

  /** A guard broke (a `guardBreak`). */
  guardBreak(event) {
    return [this.#lines(event.attackerId, ['guardBreak', (event.impacts ?? 1) >= 2 && 'catastrophicGuardBreak'])];
  }

  /**
   * The lines for a moment `speaker` is in, by its tags (voiceLines.mjs: the lines subscribe to the moments; a list
   * may hold false for a tag that does not apply). Each moment raised is counted (`seen`), so a line that never seems
   * to be said can be told from a moment that never comes.
   */
  lines(speaker, tags, options = {}) {
    return this.#lines(speaker, tags, options);
  }

  #lines(speaker, tags, options = {}) {
    const present = Array.isArray(tags) ? Object.fromEntries(tags.filter(Boolean).map((tag) => [tag, 1])) : tags;
    for (const tag of Object.keys(present)) this.seen.set(tag, (this.seen.get(tag) ?? 0) + 1);
    return linesFor(speaker, present, { rand: this.rand, ...options });
  }

  /**
   * Why a line is or is not heard, for every line declared: { line, recorded, moments (how often a moment it waits for
   * has come), tried (how often it got as far as its odds: only a recorded line does), said }. recorded(id): whether it
   * has a take; stats: the director's (line -> { tried, said }). A line whose moments never come needs its moment
   * looked at; one tried often and never said is only rare; one never tried though its moments come is unrecorded.
   */
  report({ recorded = () => false, stats = new Map() } = {}) {
    return VOICE_LINE_LIST.map((line) => ({
      line: line.id,
      recorded: Boolean(recorded(line.id)),
      ...(line.coming ? { waitsFor: line.coming } : {}),
      moments: Object.keys(line.triggers).reduce((sum, tag) => sum + (this.seen.get(tag) ?? 0), 0),
      tried: stats.get(line.id)?.tried ?? 0,
      said: stats.get(line.id)?.said ?? 0,
    }));
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
      if ((k.health ?? 100) <= MOMENTS.nearDemise || (k.staggerUntil ?? -Infinity) > at) saved.push(this.#lines(id, ['rescued']));
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
