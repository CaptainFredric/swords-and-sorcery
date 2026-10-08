// The moments the Spellblade has a line for, read off what happens (the host's events) and remembered for a little
// while: who last threatened whom, how cleanly and how high one knight has been striking another, whose gust just
// threw whom, and the squire's question waiting for its answer. Each event gives the lines worth trying for it, in
// groups: within a group the first that is said is the only one (what belongs to the moment most comes first); each
// group is tried on its own. Whether a line is said is the voice's business (VoiceBank and VoiceDirector hold the
// odds, the cooldowns and the ranks). Pure but for its memory, so it is tested.
//
// knight(id): the knight as last seen (a snapshot's player: health, alive, staggerUntil, attackActive, guarding,
// dashUntil, sprinting, pitch, actorKind, practiceMode, cloth, ultimateState). Times are the host's (event.at).

import { surfaceHeightAt } from '../../../shared/src/collision.mjs';
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
  // a fresh encounter (the final duel's opening): the first blow between two knights, both with at least this much
  worthy: Object.freeze({ health: 60 }),
  // a miracle: a blow of at least `blow` that leaves him alive with `left` or less
  miracle: Object.freeze({ blow: 20, left: 9 }),
  // the last stand: struck and left this low; losing face: left this low with the foe at least `foe`
  lastStand: Object.freeze({ health: 22 }),
  losingFace: Object.freeze({ health: 34, foe: 57 }),
  // the two are never said in the same low moment: one waits this long (s) after the other
  lowApart: 25,
  // struck and left this low, standing: badly hurt (Constitution, likelier if Sheathe in Steel took the blow)
  survived: Object.freeze({ health: 30, blow: 12 }),
  // the hurt he makes: a severe blow (at least this much); a small one (under `small`) after this long unhurt
  hurtSounds: Object.freeze({ heavy: 24, small: 15, coldSec: 12 }),
  // a foe who will not be hit: this many sword attempts on the same foe blocked, parried or slipped within this long
  // (a miss counts against whoever was within `near` metres of it)
  denied: Object.freeze({ count: 3, withinSec: 5, near: 4 }),
  // nearly felled: a blow that leaves him this low; felling the one who did it within this long avenges it
  avenged: Object.freeze({ health: 15, withinSec: 10 }),
  // a recurring rival: each has felled the other at least this often this match
  rival: Object.freeze({ kills: 2 }),
  // a losing run: this many falls in a row without a kill of his own (said as he gets up from the last)
  losingRun: Object.freeze({ falls: 3 }),
  // a chill worth remarking on: his Frostfire slowing a living foe at least this much (its full chill is 0.55)
  chill: Object.freeze({ slow: 0.35 }),
  // a bad stretch's explanations (EXCUSES): once one is made, no other for this long (s): never a wall of excuses
  excuses: Object.freeze({ apartSec: 300 }),
  // a foe flailing at him: this many of the same foe's sword swings missing him (he the nearest, within the denied
  // reach) within this long, none of theirs landing meanwhile; never the yard
  flailing: Object.freeze({ count: 3, withinSec: 6 }),
  // possessed: struck while clearly losing, this many falls into a run without a kill
  possessed: Object.freeze({ falls: 2 }),
});

// The explanations a bad stretch can draw from him (their line ids): one of them, now and then, never two in one
// collapse. "I shall quit..." (losingRun), the comeback (its opening), the real match, possession, going easy.
export const EXCUSES = Object.freeze(['oneMoreDefeat', 'comeback', 'realMatch', 'possessed', 'goingEasy']);

// what flies (a kill by one is a shot from where he stood, not a blade): the Fireball, the Frostfire, the gauntlet
export const PROJECTILES = Object.freeze(['fireball', 'frostfire', 'gauntlet']);

// How a knight lies once felled, for the lines about it: on the ground (not falling, not in the air), and fallen back
// (the blow came from in front: from within `fromFront` of the way he faced), his eyes level or raised (`skyward`: the
// pitch at least this), or somewhere inconvenient (torn ground, a ramp, or alight)
export const POSE = Object.freeze({ fromFront: 0.25, skyward: -0.05, grounded: 0.3 });

const onRamp = (world, x, z) => (world?.ramps ?? []).some((ramp) => x >= ramp.minX && x <= ramp.maxX && z >= ramp.minZ && z <= ramp.maxZ);

/**
 * How `victim` (as last seen before falling: position, velocity, yaw, pitch, tornGround, burningUntil) lies, felled
 * by `killer` (where they stood, or null): { back, skyward, inconvenient }, or null when he is not felled on the
 * ground (a fall into the Abyss, a body in the air). world: the arena (its floors, its ramps).
 */
export function deathPose(victim, killer = null, { source = null, world = null, at = 0 } = {}) {
  const at3 = victim?.position;
  if (!at3 || source === 'abyss') return null;
  const ground = world ? surfaceHeightAt(at3.x, at3.z, at3.y, world) : at3.y;
  if (ground === null || at3.y - ground > POSE.grounded || Math.abs(victim.velocity?.y ?? 0) > 2) return null;
  let back = false;
  if (killer && (killer.x !== undefined)) {
    const to = { x: killer.x - at3.x, z: killer.z - at3.z };
    const distance = Math.hypot(to.x, to.z);
    const yaw = victim.yaw ?? 0;
    back = distance > 1e-6 && (to.x * -Math.sin(yaw) + to.z * -Math.cos(yaw)) / distance >= POSE.fromFront;
  }
  return {
    back,
    skyward: back && (victim.pitch ?? 0) >= POSE.skyward,
    inconvenient: Boolean(victim.tornGround) || (victim.burningUntil ?? 0) > at || onRamp(world, at3.x, at3.z),
  };
}

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
    this.ruptured = new Map();  // owner -> [{ at, victimId }]: whom their ruptures caught, lately
    this.squire = null;         // { speaker, until, position }
    this.met = new Set();       // pairs of knights who have traded a blow this life (`a|b`)
    this.duelFoes = new Map();  // speaker -> the foe a fresh encounter was opened with
    this.denials = new Map();   // `${attacker}>${defender}` -> when their sword was lately denied
    this.streaks = new Map();   // knight -> kills without falling
    this.lastHurt = new Map();  // knight -> when they were last hurt
    this.nearlyFelled = new Map(); // knight -> { by, at }: who last left them nearly dead, and when
    this.felled = new Map();    // `${killer}>${victim}` -> how often this match
    this.fallsInARow = new Map(); // knight -> falls since their last kill
    this.matchPoints = new Set(); // knights whose match point has been raised this match
    this.fellTo = new Map();    // knight -> who felled them in this run of falls, in order (a kill of their own ends it)
    this.misses = new Map();    // `${swinger}>${target}` -> when the swinger's sword lately missed the target
    this.seen = new Map();      // tag -> how often its moment has been raised (for telling why a line is never heard)
  }

  /**
   * A blow landed (a `damage` event). matchPoint(id): whether that knight is one kill from winning a scored match.
   */
  damage(event, { knight = () => null, saidAgo = () => Infinity, steeled = () => false, matchPoint = () => false } = {}) {
    const { attackerId, victimId, source, at } = event;
    if (!(event.amount > 0)) return [];
    const groups = [];
    const other = Boolean(attackerId) && attackerId !== victimId;
    if (other) this.threats.set(victimId, { by: attackerId, at });
    // (a sword that lands is no longer being denied, nor flailing)
    if (other && source === 'sword') {
      this.denials.delete(`${attackerId}>${victimId}`);
      this.misses.delete(`${attackerId}>${victimId}`);
    }
    // a fresh encounter: the first blow these two have traded this life, both still whole (a training dummy, who never
    // speaks, is no challenger: nothing is declared to one)
    let fresh = false;
    let engaged = false;
    if (other && wild(source)) {
      const pair = [attackerId, victimId].sort().join('|');
      engaged = !this.met.has(pair);
      fresh = engaged && event.health >= MOMENTS.worthy.health && (knight(attackerId)?.health ?? 0) >= MOMENTS.worthy.health
        && knight(victimId)?.actorKind !== 'dummy';
      this.met.add(pair);
      if (fresh) this.duelFoes.set(attackerId, victimId);
    }
    if (other && source === 'sword') {
      const key = `${attackerId}>${victimId}`;
      // (a Sundering blow is force, not finesse: it does not count toward a knighthood)
      const list = [...(this.strikes.get(key) ?? []), { amount: event.level ? 0 : event.amount, pitch: knight(attackerId)?.pitch ?? 0 }];
      this.strikes.set(key, list.slice(-8));
    }
    // a Sundering slam whose split ground catches two: force has settled the argument
    if (other && source === 'rupture') {
      // (two knights, not one knight caught by two ruptures in quick succession: every rupture catches again)
      const recent = [...(this.ruptured.get(attackerId) ?? []).filter((hit) => at - hit.at <= MOMENTS.massive.withinSec), { at, victimId }];
      this.ruptured.set(attackerId, recent);
      const caught = new Set(recent.map((hit) => hit.victimId)).size;
      const before = new Set(recent.slice(0, -1).map((hit) => hit.victimId)).size;
      if (caught === MOMENTS.massive.caught && before < caught) groups.push(this.#lines(attackerId, ['massiveSunder']));
    }
    const standing = event.health > 0;
    // (nearly felled: remembered, for felling the one who did it)
    if (other && standing && event.health <= MOMENTS.avenged.health) this.nearlyFelled.set(victimId, { by: attackerId, at });
    // one kill from winning, meeting a foe afresh (once a match)
    const point = other && engaged && !this.matchPoints.has(attackerId) && matchPoint(attackerId);
    if (point) this.matchPoints.add(attackerId);
    if (other && standing) {
      groups.push(this.#lines(attackerId, [
        // a foe he has all but finished (the squire's question); the cleanest blow, through the foe's own swing
        event.health <= MOMENTS.squire.health && 'squireOpening',
        source === 'sword' && event.clean && knight(victimId)?.attackActive && 'counterHit',
        fresh && 'worthyFoe',
        // (by the sword: the count of strikes on that same foe may begin)
        fresh && source === 'sword' && 'strikeCount',
        point && 'matchPoint',
        // (the first blow of any fresh encounter is him committing to it; his own spell landing is magic helping him)
        engaged && 'engage',
        (source === 'fireball' || source === 'frostfire') && 'magicHelped',
        wild(source) && 'blowDealt',
      ]));
    }
    // (a blow that kills has the fall's own lines)
    if (standing && wild(source)) {
      // struck and still standing: a miracle (a heavy blow that left almost nothing), the last stand (very low), or
      // face to be saved (low, and the foe well ahead); the last two never in the same low moment
      const foe = other ? knight(attackerId) : null;
      const miracle = other && event.amount >= MOMENTS.miracle.blow && event.health <= MOMENTS.miracle.left;
      const stand = other && event.health <= MOMENTS.lastStand.health && foe?.alive !== false && saidAgo(victimId, 'chivalryTest') > MOMENTS.lowApart;
      const face = other && !stand && event.health > MOMENTS.lastStand.health && event.health <= MOMENTS.losingFace.health
        && (foe?.health ?? 0) >= MOMENTS.losingFace.foe && saidAgo(victimId, 'standFight') > MOMENTS.lowApart;
      // badly hurt but standing: his reserves (Sheathe in Steel having taken the blow makes them likelier)
      const low = other && event.health <= MOMENTS.survived.health && event.amount >= MOMENTS.survived.blow;
      const steel = low && ((event.steel ?? 0) > 0 || steeled(victimId, at));
      // clearly losing, deep in a run of falls: something else must be working his strings (unless he has lately
      // explained himself some other way)
      const possessed = other && event.health <= MOMENTS.losingFace.health && (this.fallsInARow.get(victimId) ?? 0) >= MOMENTS.possessed.falls
        && !this.#excused(victimId, saidAgo);
      groups.push(this.#lines(victimId, [miracle && 'miracle', steel && 'steelSave', possessed && 'possessedStretch', stand && 'lastStand', face && 'losingFace', low && 'survivedLow', 'blowTaken']));
    }
    return groups.filter((group) => group.length);
  }

  /**
   * A knight fell (a `death` event): { fallen, victor, rescued } (the fallen first; the victor only if the fallen kept
   * quiet; each rescued group on its own). blow: the killing blow ({ amount, healthBefore, level, ultimate, clean }).
   * extra: what the runtime watched of it (rushed, fair, leader, chivalry; charging: the fallen charged a foe a moment
   * ago; pose: how he lies, deathPose; doomCut: he was spelling a threat).
   */
  death(event, { blow = null, knight = () => null, positionOf = () => null, practice = false, planFailed = false, extra = {} } = {}) {
    // (extra, from the runtime's watch: passing, the fallen was sprinting across or past the one who shot them;
    // thirdParty, the fallen was trading blows with someone else and was shot from outside that fight; nap, his return
    // is to come and no comeback is under way)
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
      // what the runtime watched of it (voiceWatch.mjs): the fallen had rushed him; the fallen led the match; it was a
      // fair fight; and his kills without falling
      rushed: Boolean(extra.rushed),
      fair: Boolean(extra.fair),
      leader: Boolean(extra.leader),
      streak: (this.streaks.get(killerId) ?? 0) + 1,
      // the one who had just left him nearly dead, and him still standing
      avenged: this.#avenges(killerId, victimId, at, killer),
      // a rival: each has felled the other again and again this match (this fall counted)
      rival: (this.felled.get(`${killerId}>${victimId}`) ?? 0) + 1 >= MOMENTS.rival.kills && (this.felled.get(`${victimId}>${killerId}`) ?? 0) >= MOMENTS.rival.kills,
      // a shot, from where he stood: at a foe running past him, or at one busy with someone else
      passing: PROJECTILES.includes(source) && Boolean(extra.passing),
      thirdParty: PROJECTILES.includes(source) && Boolean(extra.thirdParty),
      // the blow that wins him the match
      decisive: Boolean(event.decisive),
    } : {};
    if (killerId) {
      this.streaks.set(killerId, moment.streak);
      this.felled.set(`${killerId}>${victimId}`, (this.felled.get(`${killerId}>${victimId}`) ?? 0) + 1);
      this.fallsInARow.set(killerId, 0);
      this.fellTo.delete(killerId);
    }
    this.fallsInARow.set(victimId, (this.fallsInARow.get(victimId) ?? 0) + 1);
    this.fellTo.set(victimId, [...(this.fellTo.get(victimId) ?? []), killerId]);
    const minor = Boolean(blow) && isMinorLethal({ ...blow, source });
    const interrupted = Boolean(victim && (victim.attackActive || victim.guarding || victim.sprinting || (victim.dashUntil ?? -Infinity) > at));
    const overkill = Boolean(blow) && isOverkill(blow);
    // committed to an attack as he fell: mid-swing, dashing, or charging or rushing at a foe
    const committed = Boolean(victim && (victim.attackActive || (victim.dashUntil ?? -Infinity) > at)) || Boolean(extra.rushed) || Boolean(extra.charging);
    const fall = deathMoment({
      victimId, killerId, source, overkill, minor, interrupted, decisive: Boolean(event.decisive), dizzy: Boolean(event.dizzy), planFailed,
      chivalry: Boolean(extra.chivalry), fair: Boolean(extra.fair), committed, pose: extra.pose ?? null, doomCut: Boolean(extra.doomCut), moment,
      // (a nap: his return to come (never the fall that ends the match), and never the yard)
      nap: Boolean(extra.nap) && !practice && !event.decisive && Number.isFinite(event.respawnAt) && event.respawnAt > at,
    });
    // (the squire's answer is forced: a line, never a grunt, and nobody talks over it)
    const fallen = this.#lines(victimId, fall.fallen, { facts: fall.facts, force: answer });
    const victor = !answer && fall.victor ? this.#lines(killerId, fall.victor, { facts: fall.victorFacts }) : [];
    // whoever the fallen was threatening, near their own end, saved by somebody else
    const rescued = this.#rescues(victimId, killerId, at, knight);
    this.#forget(victimId);
    return { fallen, victor, rescued, answer };
  }

  /**
   * A knight back on their feet (a `respawn`), in a bad stretch: one explanation of it now and then, never two in one
   * collapse (EXCUSES, MOMENTS.excuses). The same foe has felled him twice running (going easy); or a run of falls has
   * reached its length (once a run: a fall after that is simply another fall): one foe every time (the real match), a
   * comeback declared, or a vow. Never in the Practice Yard. saidAgo(speaker, line): how long ago he said it.
   */
  respawn(event, { practice = false, saidAgo = () => Infinity } = {}) {
    const id = event.playerId;
    if (practice || !id || this.#excused(id, saidAgo)) return [];
    const falls = this.fallsInARow.get(id) ?? 0;
    const by = this.fellTo.get(id) ?? [];
    const one = by.length === falls && Boolean(by[0]) && by.every((killer) => killer === by[0]);
    const tags = [];
    if (falls === 2 && one) tags.push('beatenAgain');
    if (falls === MOMENTS.losingRun.falls) tags.push(one && 'losingRunToOne', 'comebackRun', 'losingRun');
    return tags.length ? [this.#lines(id, tags)].filter((group) => group.length) : [];
  }

  /**
   * A sword swung at nothing near `targetId` (a `swordMiss`, he the nearest foe to it): the same foe flailing at him
   * again and again, landing nothing, is a moment of his (once it has come, the count begins again). Never the yard.
   */
  flailing(swingerId, targetId, at, { practice = false, knight = () => null } = {}) {
    if (practice || !swingerId || !targetId || swingerId === targetId || knight(swingerId)?.actorKind === 'dummy') return [];
    const key = `${swingerId}>${targetId}`;
    const times = [...(this.misses.get(key) ?? []).filter((t) => at - t <= MOMENTS.flailing.withinSec), at];
    if (times.length < MOMENTS.flailing.count) {
      this.misses.set(key, times);
      return [];
    }
    this.misses.delete(key);
    return [this.#lines(targetId, ['foeFlailing'])];
  }

  // whether `id` has lately explained a bad stretch one way already (one of EXCUSES, within MOMENTS.excuses)
  #excused(id, saidAgo) {
    return EXCUSES.some((line) => saidAgo(id, line) <= MOMENTS.excuses.apartSec);
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

  /**
   * A sword that did not land on a foe: caught on their guard (a `block`), turned (a `parry`), or swung past them (a
   * `swordMiss` with a foe close by: `near` gives who). The same foe denying him again and again is a moment of its
   * own (once it has come, the count begins again).
   */
  denied(attackerId, defenderId, at) {
    if (!attackerId || !defenderId || attackerId === defenderId) return [];
    const key = `${attackerId}>${defenderId}`;
    const times = [...(this.denials.get(key) ?? []).filter((t) => at - t <= MOMENTS.denied.withinSec), at];
    if (times.length < MOMENTS.denied.count) {
      this.denials.set(key, times);
      return [];
    }
    this.denials.delete(key);
    return [this.#lines(attackerId, ['deniedOpening'])];
  }

  /** The foe a fresh encounter was opened with by `speaker` (the final duel is declared to them; the strikes counted). */
  duelFoe(speaker) {
    return this.duelFoes.get(speaker) ?? null;
  }

  // whether `killerId` felling `victimId` avenges a blow of theirs that had just left him nearly dead (him standing)
  #avenges(killerId, victimId, at, killer) {
    const low = this.nearlyFelled.get(killerId);
    return Boolean(low) && low.by === victimId && at - low.at <= MOMENTS.avenged.withinSec && killer?.alive !== false && (killer?.health ?? 1) > 0;
  }

  /**
   * The sound of a blow taken and survived (a `damage` event), as its tags: a severe one, a small one after a long
   * while unhurt, and any real one.
   */
  hurt(event) {
    const { victimId, at, amount } = event;
    const since = at - (this.lastHurt.get(victimId) ?? -Infinity);
    this.lastHurt.set(victimId, at);
    const sounds = MOMENTS.hurtSounds;
    return [amount >= sounds.heavy && 'heavyHurt', amount < sounds.small && since >= sounds.coldSec && 'coldHurt', 'hurt'].filter(Boolean);
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
    this.met.clear();
    this.duelFoes.clear();
    this.denials.clear();
    this.streaks.clear();
    this.lastHurt.clear();
    this.nearlyFelled.clear();
    this.felled.clear();
    this.fallsInARow.clear();
    this.matchPoints.clear();
    this.fellTo.clear();
    this.misses.clear();
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
    this.streaks.delete(id);
    // (nearly felled is about a life: a new one starts whole)
    this.nearlyFelled.delete(id);
    // (a new life is a new encounter with everyone)
    for (const pair of [...this.met]) if (pair.split('|').includes(id)) this.met.delete(pair);
    this.duelFoes.delete(id);
    for (const key of [...this.denials.keys()]) if (key.startsWith(`${id}>`) || key.endsWith(`>${id}`)) this.denials.delete(key);
    for (const key of [...this.misses.keys()]) if (key.startsWith(`${id}>`) || key.endsWith(`>${id}`)) this.misses.delete(key);
    for (const [victim, threat] of [...this.threats]) if (threat.by === id) this.threats.delete(victim);
    for (const map of [this.strikes, this.gusts]) {
      for (const key of [...map.keys()]) if (key.endsWith(`>${id}`)) map.delete(key);
    }
  }
}
