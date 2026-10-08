// What the Spellblade's voice watches for over time: moments that are not one event but a way of moving, or a stretch
// of quiet. A knight charging a foe, chasing one who runs, a lull, the first foe met in a life, giving ground and then
// standing it, a sword chain carrying on past its third strike, a balance broken and found again before he could punish
// it, a blow taken that filled his Prowess, a foe's sword missing him as he moves. A swing as it begins: the first
// after a while, and the heavy third strike swung at a foe it would fell (the breath behind them leads the blade, so
// they are raised as the swing is committed, not when it lands). And, asked at a fall: whether the fallen had just
// rushed the one who felled them, and whether it was a fair fight.
//
// And from the batch of 2026-10-06: a fall past saving into the Abyss (raised as he falls); a foe a gust moved still
// alive a moment later and not falling to their end; a reckless commitment (a charge, a dash or a ram at a foe while
// low, or into two of them) survived; a sprint while low and burning; fleeing at a sprint while looking at the ground;
// a standoff long enough to begin spelling a threat; and the last seconds of a timed match he is not winning.
//
// And from the batch of 2026-10-07: two other knights trading blows some way off while he stays out of it; a long
// timed match he is not winning, well before its last stretch; and, asked at a fall, whether the fallen was sprinting
// past the one who shot them, or trading blows with someone else when they were shot from outside that fight.
//
// Fed with the host's events and every knight as last seen; returns the moments to raise ([{ speaker, tags }]), which
// the runtime hands to the voice like any other. Nothing in the game waits on it. Pure but for its memory, so it is
// tested. Times are the host's (seconds); positions and speeds are on the ground (x, z).

import { GAME, SWORD_CHAIN } from '../../../shared/src/combat.mjs';
import { PROWESS } from '../../../shared/src/prowess.mjs';
import { surfaceHeightAt } from '../../../shared/src/collision.mjs';

export const WATCH = Object.freeze({
  // sprinting straight at a foe: closing this fast, from this far to this near, within this cone of where he runs
  charge: Object.freeze({ closing: 6, far: 14, near: 4, coneDeg: 25, rearmFar: 16, rearmSec: 10 }),
  // chasing one who runs: he closes at least `chase`, they draw away at least `flee`, this far apart, for this long
  pursuit: Object.freeze({ chase: 3, flee: 4, near: 5, far: 16, holdSec: 1.2, rearmSec: 15 }),
  // a lull: nothing struck, taken or swung, and no foe within `clear` metres, for this long
  lull: Object.freeze({ quietSec: 15, clear: 18 }),
  // the first foe met since he (re)spawned: within this far
  arrive: Object.freeze({ meet: 12 }),
  // giving ground: drawing back from a foe at least this fast, for this long within the last `withinSec`; then a
  // swing at them (within `swing` metres) is standing it
  ground: Object.freeze({ give: 2.5, giveSec: 1.0, withinSec: 4, swing: 4.5, near: 10 }),
  // a chain carrying on: strikes following one another (a held chain's restart included) this soon; the fourth is it
  chain: Object.freeze({ gapSec: 0.8, strikes: 4 }),
  firstSwing: Object.freeze({ afterSec: 8 }),
  // the heavy third strike swung at a foe it would fell: one in reach ahead (within this cone), not guarding, with no
  // more health than a blow takes
  finalStrike: Object.freeze({ reach: 3.0, coneDeg: 35 }),
  // another knight's swing seen beginning (in the snapshots) is only voiced this fresh: a late sighting says nothing
  begunFreshSec: 0.3,
  // a blow taken that filled his Prowess: the meter full this soon after it
  ready: Object.freeze({ withinSec: 0.6 }),
  // a foe's sword missing him: he the nearest within `reach` of the swing, moving at least this fast (or dashing)
  nearMiss: Object.freeze({ reach: 3.2, moving: 3 }),
  // rushed: the fallen ran or dashed at the one who felled them, closing this fast, within this long before the fall
  rushed: Object.freeze({ closing: 6, withinSec: 1.5 }),
  // a fair fight: at least this many blows each way between the two, within this long, the fall by the sword
  fair: Object.freeze({ blows: 2, withinSec: 12, sources: Object.freeze(['sword', 'gauntlet']) }),
  // past saving: this far under the lowest ground of the arena (nothing left he could land on), falling at least this
  // fast (once a life)
  abyss: Object.freeze({ below: 0.7, falling: 2 }),
  // a gust's foe dismissed: still alive this long after it, and not falling to their end (in the air over nothing,
  // dropping at least `falling`)
  dismissal: Object.freeze({ afterSec: 0.9, falling: 3 }),
  // reckless: a charge, or a dash at a foe (closing at least `closing`, within `near`), while this low, or with a
  // second foe within `crowd` of the one he goes at; survived this long; weighed again only after `rearmSec`
  reckless: Object.freeze({ health: 35, closing: 6, near: 8, crowd: 6, surviveSec: 4, rearmSec: 20 }),
  // his tombstone: sprinting this low, burning, hurt this recently (once a life)
  tombstone: Object.freeze({ health: 30, hurtSec: 2.5 }),
  // fleeing and searching the ground: sprinting away from a foe this near (drawing away at least `away`), looking at
  // least this far down (radians), for this long; likelier this low (once a life)
  flee: Object.freeze({ near: 10, away: 3, pitch: -0.6, holdSec: 0.6, low: 35, lowScale: 1.5 }),
  // a standoff: a foe (no training dummy) this far off, nearly straight ahead of him, not closing fast, and nothing
  // struck or swung by him or at him (nor a foe nearer than `near`) for this long (once a life)
  standoff: Object.freeze({ near: 6, far: 20, coneDeg: 35, calmSec: 5, closing: 3 }),
  // the clock: this many seconds of a timed match left (and more than `least`), him not its sole leader (once a match)
  lateClock: Object.freeze({ within: 25, least: 4 }),
  // a match dragging on: no more than this share of a timed match left, and more than `least` seconds (well clear of
  // the late clock's last stretch), him tied or behind (once a match)
  matchDragging: Object.freeze({ share: 0.45, least: 45 }),
  // two others at it: blows each way between them within `exchangeSec`; none between him and either of them within
  // `apartSec`; the middle of their fight `near` to `far` metres off and within `coneDeg` of where he looks (once a match)
  othersDueling: Object.freeze({ exchangeSec: 4, apartSec: 6, near: 8, far: 24, coneDeg: 60 }),
  // a shot at one running past: last seen (this fresh) sprinting at least `speed`, at most `far` off, the run at least
  // `lateral` across the line from the shooter (1: straight across; 0: straight at or away)
  passing: Object.freeze({ freshSec: 0.6, speed: 4, far: 16, lateral: 0.75 }),
  // a shot from outside another's fight: the fallen and someone else trading blows each way within `exchangeSec`; the
  // fallen not at blows with the shooter within `ownSec` (no sword of his on them, none of theirs on him); `far` off
  thirdParty: Object.freeze({ exchangeSec: 3, ownSec: 4, far: 6 }),
});

// the arena's lowest ground (a floor, or a ramp's lower end): nothing under it can be landed on (null without one)
const lowestCache = new WeakMap();
export function lowestGround(world) {
  if (!world) return null;
  if (!lowestCache.has(world)) {
    const heights = [...(world.floors ?? []).map((floor) => floor.y), ...(world.ramps ?? []).flatMap((ramp) => [ramp.startY, ramp.endY])];
    lowestCache.set(world, heights.length ? Math.min(...heights) : null);
  }
  return lowestCache.get(world);
}

const flat = (v) => ({ x: v?.x ?? 0, z: v?.z ?? 0 });
const length = (v) => Math.hypot(v.x, v.z);
const dot = (a, b) => a.x * b.x + a.z * b.z;

export class VoiceWatch {
  constructor() {
    this.reset();
  }

  /** A new match: nothing carries over. */
  reset() {
    this.knights = new Map();     // id -> what is remembered of them
    this.staggers = new Map();    // `${by}>${victim}` -> { until, struck }
    this.blows = [];              // [{ from, to, at }]: blows landed lately, for a fair fight
    this.rushes = new Map();      // `${from}>${to}` -> when `from` last rushed `to`
    this.begun = new Map();       // another knight -> { chain, count }: the strikes of their chain seen begun
    this.gusts = new Map();       // whose gust -> { victims, at }: foes it moved, to see if they are still about
    this.clocked = new Set();     // knights the late clock has been raised for, this match
    this.dragged = new Set();     // knights a dragging match has been raised for, this match
    this.watchedDuels = new Set(); // knights two others' fight has been raised for, this match
  }

  #knight(id, now) {
    if (!this.knights.has(id)) {
      this.knights.set(id, {
        alive: true, met: false, quietSince: now, lullSaid: false, chargeArmed: true, chargeAt: -Infinity,
        pursuitSince: null, pursuitAt: -Infinity, giving: new Map(), lastSwingAt: -Infinity, lastStrike: null,
        streak: 0, prowess: 0, hurtAt: -Infinity, ...this.#freshLife(now),
      });
    }
    return this.knights.get(id);
  }

  // what is watched once a life (or begun again with it)
  #freshLife(now) {
    return { abyssSaid: false, reckless: null, recklessAt: -Infinity, tombstoneSaid: false, fleeDown: 0, fleeAt: now, fleeSaid: false, calmSince: now, standoffSaid: false };
  }

  /**
   * Time passes: knights as last seen ([{ id, alive, position, velocity, sprinting, dashUntil, prowess, attackActive,
   * attackStartedAt, attackCommitted, health, burningUntil, pitch, yaw, actorKind }]). self: my own knight (my swings
   * are told as my arms begin them: begin()). world: the arena (its lowest ground: where the Abyss begins).
   */
  step(now, knights = [], { self = null, world = null, practice = false } = {}) {
    const out = [];
    const living = knights.filter((k) => k && k.alive !== false && k.position);
    out.push(...this.#dismissals(now, knights, world));
    if (!practice) out.push(...this.#othersDueling(now, living));
    const lowest = lowestGround(world);
    for (const knight of knights) {
      if (!knight?.id) continue;
      if (knight.id !== self) out.push(...this.#begunSeen(knight, now, knights));
      const state = this.#knight(knight.id, now);
      const alive = knight.alive !== false;
      // back on their feet: a new life, a new arrival, a new quiet
      if (alive && !state.alive) Object.assign(state, { met: false, quietSince: now, lullSaid: false, chargeArmed: true, streak: 0, ...this.#freshLife(now) });
      state.alive = alive;
      if (!alive || !knight.position) continue;
      // (as last seen alive: asked about at their fall)
      state.seen = { at: now, position: flat(knight.position), velocity: flat(knight.velocity), sprinting: Boolean(knight.sprinting) };
      const health = knight.health ?? 100;
      // falling past saving: under every ground there is, and going down
      if (!state.abyssSaid && lowest !== null && knight.position.y < lowest - WATCH.abyss.below && (knight.velocity?.y ?? 0) < -WATCH.abyss.falling) {
        state.abyssSaid = true;
        out.push({ speaker: knight.id, tags: ['abyssFall'] });
      }
      // a reckless commitment, survived
      if (state.reckless && now - state.reckless.at >= WATCH.reckless.surviveSec) {
        state.reckless = null;
        out.push({ speaker: knight.id, tags: ['recklessSurvived'] });
      }
      // a sprint for his tombstone: low, burning, hurt a moment ago
      const t = WATCH.tombstone;
      if (!state.tombstoneSaid && knight.sprinting && health <= t.health && (knight.burningUntil ?? 0) > now && now - state.hurtAt <= t.hurtSec) {
        state.tombstoneSaid = true;
        out.push({ speaker: knight.id, tags: ['tombstoneSprint'] });
      }
      // a blow taken that filled the meter
      const prowess = knight.prowess ?? 0;
      if (prowess >= PROWESS.full && state.prowess < PROWESS.full && now - state.hurtAt <= WATCH.ready.withinSec) out.push({ speaker: knight.id, tags: ['hurtToReady'] });
      state.prowess = prowess;
      const foes = living.filter((other) => other.id !== knight.id);
      if (!foes.length) continue;
      const at = flat(knight.position);
      const nearest = foes.map((foe) => {
        const to = { x: foe.position.x - at.x, z: foe.position.z - at.z };
        const distance = length(to);
        return { foe, distance, toward: distance > 1e-6 ? { x: to.x / distance, z: to.z / distance } : { x: 0, z: 0 } };
      }).sort((a, b) => a.distance - b.distance)[0];
      const v = flat(knight.velocity);
      const closing = dot(v, nearest.toward);
      const away = dot(flat(nearest.foe.velocity), nearest.toward);
      // (a calm for a standoff: broken by a blow or a swing, his or theirs, and by a foe coming near)
      if (nearest.distance < WATCH.standoff.near) state.calmSince = now;
      // the first foe met in a life
      if (!state.met && nearest.distance <= WATCH.arrive.meet) {
        state.met = true;
        out.push({ speaker: knight.id, tags: ['arrive'] });
      }
      // a lull: nobody near and nothing done for a while (a foe coming near ends it, as a blow or a swing does)
      if (nearest.distance <= WATCH.lull.clear) this.#busy(state, now);
      if (!state.lullSaid && now - state.quietSince >= WATCH.lull.quietSec) {
        state.lullSaid = true;
        out.push({ speaker: knight.id, tags: ['lull'] });
      }
      // a charge: sprinting straight at them, closing fast (once an approach)
      const c = WATCH.charge;
      if (!state.chargeArmed && (nearest.distance > c.rearmFar || now - state.chargeAt > c.rearmSec)) state.chargeArmed = true;
      const speed = length(v);
      const straight = speed > 1e-6 && closing / speed >= Math.cos((c.coneDeg * Math.PI) / 180);
      let charged = false;
      if (state.chargeArmed && knight.sprinting && closing >= c.closing && straight && nearest.distance <= c.far && nearest.distance >= c.near) {
        state.chargeArmed = false;
        state.chargeAt = now;
        charged = true;
        out.push({ speaker: knight.id, tags: ['charge'] });
      }
      // rushing a foe (asked about at a fall): running or dashing at them
      const dashing = (knight.dashUntil ?? -Infinity) > now;
      // reckless: charging or dashing (a Steel ram is one) at a foe while low, or with a second foe beside the first
      const r = WATCH.reckless;
      const committing = charged || (dashing && closing >= r.closing && nearest.distance <= r.near);
      if (committing && !state.reckless && now - state.recklessAt > r.rearmSec) {
        const crowd = foes.filter((foe) => Math.hypot(foe.position.x - nearest.foe.position.x, foe.position.z - nearest.foe.position.z) <= r.crowd).length;
        if (health <= r.health || crowd >= 2) {
          state.reckless = { at: now };
          state.recklessAt = now;
        }
      }
      // fleeing at a sprint and searching the ground for a way out of it
      const f = WATCH.flee;
      const searching = knight.sprinting && -closing >= f.away && nearest.distance <= f.near && (knight.pitch ?? 0) <= f.pitch;
      state.fleeDown = searching ? state.fleeDown + Math.max(0, Math.min(0.25, now - state.fleeAt)) : 0;
      state.fleeAt = now;
      if (!state.fleeSaid && state.fleeDown >= f.holdSec) {
        state.fleeSaid = true;
        out.push({ speaker: knight.id, tags: { fleeDownward: health <= f.low ? f.lowScale : 1 } });
      }
      // a standoff: a foe ahead at a distance, and a calm long enough to begin spelling a threat at them
      const so = WATCH.standoff;
      const yaw = knight.yaw ?? 0;
      const ahead = dot({ x: -Math.sin(yaw), z: -Math.cos(yaw) }, nearest.toward) >= Math.cos((so.coneDeg * Math.PI) / 180);
      if (!state.standoffSaid && now - state.calmSince >= so.calmSec && nearest.distance >= so.near && nearest.distance <= so.far
        && ahead && nearest.foe.actorKind !== 'dummy' && -away < so.closing) {
        state.standoffSaid = true;
        out.push({ speaker: knight.id, tags: ['standoff'] });
      }
      if ((knight.sprinting || dashing) && closing >= WATCH.rushed.closing) this.rushes.set(`${knight.id}>${nearest.foe.id}`, now);
      // a pursuit: he closes on one drawing away from him, for a while
      const p = WATCH.pursuit;
      const chasing = closing >= p.chase && away >= p.flee && nearest.distance >= p.near && nearest.distance <= p.far;
      if (!chasing) state.pursuitSince = null;
      else {
        state.pursuitSince ??= now;
        if (now - state.pursuitSince >= p.holdSec && now - state.pursuitAt > p.rearmSec) {
          state.pursuitAt = now;
          out.push({ speaker: knight.id, tags: ['pursuit'] });
        }
      }
      // giving ground: drawing back from the nearest foe (remembered, to be stood later)
      const giving = state.giving.get(nearest.foe.id) ?? { seconds: 0, last: -Infinity, at: now };
      if (now - giving.last > WATCH.ground.withinSec) giving.seconds = 0;
      if (-closing >= WATCH.ground.give && nearest.distance <= WATCH.ground.near) {
        giving.seconds += Math.max(0, Math.min(0.25, now - giving.at));
        giving.last = now;
      }
      giving.at = now;
      state.giving.set(nearest.foe.id, giving);
    }
    // a balance broken and found again before the one who broke it struck them
    for (const [key, watch] of [...this.staggers]) {
      if (now < watch.until) continue;
      this.staggers.delete(key);
      const [by, victim] = key.split('>');
      const fallen = knights.find((k) => k?.id === victim)?.alive === false;
      if (!watch.struck && !fallen) out.push({ speaker: by, tags: ['staggerEscaped'] });
    }
    return out;
  }

  #busy(state, now) {
    state.quietSince = now;
    state.lullSaid = false;
  }

  /**
   * A gust caught knights (a `galeBlast` or `galeCatch`): the foes it really moved (not behind a guard) are looked at
   * again a moment later (#dismissals).
   */
  gale(event) {
    const moved = (event.affected ?? []).filter((caught) => caught.id !== event.playerId && !caught.guarded && caught.pressure >= 0.5).map((caught) => caught.id);
    if (!event.playerId || !moved.length) return;
    const pending = this.gusts.get(event.playerId);
    this.gusts.set(event.playerId, { victims: [...new Set([...(pending?.victims ?? []), ...moved])], at: pending?.at ?? event.at });
  }

  // the foes a gust moved, a moment later: one still alive, and not falling to their end, is dismissed (for now)
  #dismissals(now, knights, world) {
    const out = [];
    const rule = WATCH.dismissal;
    const lowest = lowestGround(world);
    for (const [speaker, gust] of [...this.gusts]) {
      if (now < gust.at + rule.afterSec) continue;
      this.gusts.delete(speaker);
      const standing = gust.victims.some((id) => {
        const k = knights.find((knight) => knight?.id === id);
        if (!k?.position || k.alive === false) return false;
        const p = k.position;
        if (lowest !== null && p.y < lowest - WATCH.abyss.below) return false;
        const overNothing = world ? surfaceHeightAt(p.x, p.z, p.y, world) === null : false;
        return !(overNothing && (k.velocity?.y ?? 0) < -rule.falling);
      });
      if (standing) out.push({ speaker, tags: ['galeDismissal'] });
    }
    return out;
  }

  /**
   * The match clock (a timed match, never the yard's): `timeLeft` seconds of it (of `total`), every knight as last seen
   * (with their kills). Well into it, each knight tied or behind is raised once: the match is taking its time. In its
   * last stretch, each knight who is not its sole leader is raised once: business left unfinished.
   */
  clock(timeLeft, knights = [], { total = null } = {}) {
    const top = Math.max(0, ...knights.map((k) => k?.kills ?? 0));
    const leaders = knights.filter((k) => (k?.kills ?? 0) === top);
    const leads = (knight) => leaders.length === 1 && leaders[0].id === knight.id;
    const speaking = (knight) => knight?.id && knight.alive !== false && knight.actorKind !== 'dummy';
    const out = [];
    const drag = WATCH.matchDragging;
    if (Number.isFinite(total) && timeLeft <= total * drag.share && timeLeft > drag.least) {
      // (him leading now, it is not dragging for him: he may yet fall level later in the stretch)
      for (const knight of knights) {
        if (!speaking(knight) || this.dragged.has(knight.id) || leads(knight)) continue;
        this.dragged.add(knight.id);
        out.push({ speaker: knight.id, tags: ['matchDragging'] });
      }
    }
    const rule = WATCH.lateClock;
    if (!(timeLeft <= rule.within && timeLeft > rule.least)) return out;
    for (const knight of knights) {
      if (!speaking(knight) || this.clocked.has(knight.id)) continue;
      this.clocked.add(knight.id);
      if (leads(knight)) continue;
      out.push({ speaker: knight.id, tags: ['lateClock'] });
    }
    return out;
  }

  // two others trading blows some way off, in his sight, him out of it: once a match, he may remark on it
  #othersDueling(now, living) {
    const rule = WATCH.othersDueling;
    const recent = this.blows.filter((blow) => now - blow.at <= rule.exchangeSec);
    const byId = new Map(living.map((k) => [k.id, k]));
    // (each pair of the living who have struck each other lately, once)
    const exchanges = new Map();
    for (const blow of recent) {
      if (!byId.has(blow.from) || !byId.has(blow.to) || blow.from === blow.to) continue;
      if (!recent.some((back) => back.from === blow.to && back.to === blow.from)) continue;
      const pair = [blow.from, blow.to].sort();
      exchanges.set(pair.join('|'), pair);
    }
    const pairs = [...exchanges.values()];
    if (!pairs.length) return [];
    const out = [];
    for (const me of living) {
      if (me.actorKind === 'dummy' || this.watchedDuels.has(me.id)) continue;
      const busy = (id) => this.blows.some((blow) => now - blow.at <= rule.apartSec && ((blow.from === me.id && blow.to === id) || (blow.from === id && blow.to === me.id)));
      const seen = pairs.find(([a, b]) => {
        if (a === me.id || b === me.id) return false;
        const [one, two] = [byId.get(a), byId.get(b)];
        if (one.actorKind === 'dummy' || two.actorKind === 'dummy' || busy(a) || busy(b)) return false;
        const to = { x: (one.position.x + two.position.x) / 2 - me.position.x, z: (one.position.z + two.position.z) / 2 - me.position.z };
        const distance = length(to);
        if (distance < rule.near || distance > rule.far) return false;
        const yaw = me.yaw ?? 0;
        return dot({ x: -Math.sin(yaw), z: -Math.cos(yaw) }, to) / distance >= Math.cos((rule.coneDeg * Math.PI) / 180);
      });
      if (!seen) continue;
      this.watchedDuels.add(me.id);
      out.push({ speaker: me.id, tags: ['othersDueling'] });
    }
    return out;
  }

  /**
   * Whether `victim`, felled at `at` by a shot from `shooter` (where they stood), was sprinting across or past them
   * (as last seen alive): not at them, not away.
   */
  passing(victim, shooter, at) {
    const rule = WATCH.passing;
    const seen = this.knights.get(victim)?.seen;
    if (!seen || !shooter || at - seen.at > rule.freshSec || !seen.sprinting) return false;
    const speed = length(seen.velocity);
    if (speed < rule.speed) return false;
    const to = { x: seen.position.x - shooter.x, z: seen.position.z - shooter.z };
    const distance = length(to);
    if (distance < 1e-6 || distance > rule.far) return false;
    const radial = dot(seen.velocity, to) / distance;
    return Math.sqrt(Math.max(0, speed * speed - radial * radial)) / speed >= rule.lateral;
  }

  /**
   * Whether `victim`, felled at `at` by a shot from `killer` (standing at `shooter`), was trading blows with someone
   * else a moment ago, and shot from outside that fight: not at blows with the killer, and some way off.
   */
  thirdParty(victim, killer, at, shooter) {
    const rule = WATCH.thirdParty;
    const seen = this.knights.get(victim)?.seen;
    if (!killer || !shooter || !seen) return false;
    if (Math.hypot(seen.position.x - shooter.x, seen.position.z - shooter.z) < rule.far) return false;
    const recent = this.blows.filter((blow) => at - blow.at <= rule.exchangeSec);
    const exchanged = recent.some((blow) => blow.to === victim && blow.from !== killer && blow.from !== victim
      && recent.some((back) => back.from === victim && back.to === blow.from));
    // (the killing shot itself, and any earlier shot of his, are his contribution; a sword of his, or a blow of theirs
    // on him, is a fight of his own)
    const own = this.blows.some((blow) => at - blow.at <= rule.ownSec
      && ((blow.from === victim && blow.to === killer) || (blow.from === killer && blow.to === victim && blow.source === 'sword')));
    return exchanged && !own;
  }

  /**
   * A strike's swing begun (committed): the first swing after a while, and the heavy third strike swung at a foe it
   * would fell. Mine as my arms begin it; another's as their chain is seen (step). knights: as last seen (mine where I
   * am now).
   */
  begin({ playerId, strikeIndex, at }, knights = []) {
    if (!playerId) return [];
    const state = this.#knight(playerId, at);
    const tags = [];
    if (strikeIndex === 0 && at - state.lastSwingAt >= WATCH.firstSwing.afterSec) tags.push('firstSwing');
    if (strikeIndex === 2 && this.#finishing(playerId, knights)) tags.push('finalStrike');
    return tags.length ? [{ speaker: playerId, tags }] : [];
  }

  // another knight's strikes as their chain shows them begun (the chain's start, and each strike committed since)
  #begunSeen(knight, now, knights) {
    if (!knight.attackActive || !Number.isFinite(knight.attackStartedAt)) return [];
    const chain = knight.attackStartedAt;
    const committed = Math.min(SWORD_CHAIN.starts.length, Number.isInteger(knight.attackCommitted) ? knight.attackCommitted : 1);
    const seen = this.begun.get(knight.id);
    const from = seen?.chain === chain ? seen.count : 0;
    if (committed <= from) return [];
    this.begun.set(knight.id, { chain, count: committed });
    const out = [];
    for (let strike = from; strike < committed; strike += 1) {
      const at = chain + SWORD_CHAIN.starts[strike];
      if (now - at <= WATCH.begunFreshSec) out.push(...this.begin({ playerId: knight.id, strikeIndex: strike, at }, knights));
    }
    return out;
  }

  // a foe the swing would fell: in reach ahead of the swinger, not guarding, with no more health than a blow takes
  #finishing(attackerId, knights) {
    const attacker = knights.find((k) => k?.id === attackerId);
    if (!attacker?.position) return false;
    const rule = WATCH.finalStrike;
    const yaw = attacker.yaw ?? 0;
    const facing = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    return knights.some((foe) => {
      if (!foe?.position || foe.id === attackerId || foe.alive === false || foe.guarding) return false;
      if (!((foe.health ?? Infinity) <= GAME.swordDamage)) return false;
      const to = { x: foe.position.x - attacker.position.x, z: foe.position.z - attacker.position.z };
      const distance = length(to);
      return distance <= rule.reach && (distance < 1e-6 || dot(to, facing) / distance >= Math.cos((rule.coneDeg * Math.PI) / 180));
    });
  }

  /** A sword swung (a `swordSwing`, as it goes live): a chain carrying on, ground stood. */
  swing(event, knights = []) {
    const { playerId, at } = event;
    if (!playerId) return [];
    const state = this.#knight(playerId, at);
    const tags = [];
    const follows = at - state.lastSwingAt <= WATCH.chain.gapSec
      && (event.strikeIndex === (state.lastStrike ?? -2) + 1 || (event.strikeIndex === 0 && state.lastStrike === 2));
    state.streak = follows ? state.streak + 1 : 1;
    if (state.streak === WATCH.chain.strikes) tags.push('longChain');
    state.lastSwingAt = at;
    state.lastStrike = event.strikeIndex;
    this.#busy(state, at);
    state.calmSince = at;
    // ground given to a foe now within reach of this swing, and stood
    const me = knights.find((k) => k?.id === playerId);
    if (me?.position) {
      for (const [foeId, giving] of state.giving) {
        const foe = knights.find((k) => k?.id === foeId && k.alive !== false && k.position);
        if (!foe || giving.seconds < WATCH.ground.giveSec || at - giving.last > WATCH.ground.withinSec) continue;
        if (Math.hypot(foe.position.x - me.position.x, foe.position.z - me.position.z) > WATCH.ground.swing) continue;
        tags.push('standsGround');
        state.giving.delete(foeId);
        break;
      }
    }
    return tags.length ? [{ speaker: playerId, tags }] : [];
  }

  /** A blow landed (a `damage` event): the quiet ends for both, a fair fight is counted, a broken balance struck. */
  damage(event) {
    const { attackerId, victimId, at } = event;
    if (!(event.amount > 0) || !victimId) return;
    const victim = this.#knight(victimId, at);
    victim.hurtAt = at;
    this.#busy(victim, at);
    victim.calmSince = at;
    if (!attackerId || attackerId === victimId) return;
    const attacker = this.#knight(attackerId, at);
    this.#busy(attacker, at);
    attacker.calmSince = at;
    this.blows = [...this.blows.filter((blow) => at - blow.at <= WATCH.fair.withinSec), { from: attackerId, to: victimId, at, source: event.source }];
    const stagger = this.staggers.get(`${attackerId}>${victimId}`);
    if (stagger) stagger.struck = true;
  }

  /** A balance broke (a `staggerBreak`): watched until it is found again. */
  staggerBreak(event) {
    if (event.by && event.by !== event.playerId && Number.isFinite(event.until)) this.staggers.set(`${event.by}>${event.playerId}`, { until: event.until, struck: false });
  }

  /** A sword swung at nothing (a `swordMiss`): the knight it narrowly missed, if he was moving, dodged it. */
  miss(event, knights = [], now = event.at) {
    const swinger = knights.find((k) => k?.id === event.playerId);
    if (!swinger?.position) return [];
    const near = knights
      .filter((k) => k?.id !== event.playerId && k.alive !== false && k.position)
      .map((k) => ({ k, distance: Math.hypot(k.position.x - swinger.position.x, k.position.z - swinger.position.z) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!near || near.distance > WATCH.nearMiss.reach) return [];
    const moving = length(flat(near.k.velocity)) >= WATCH.nearMiss.moving || (near.k.dashUntil ?? -Infinity) > now - 0.1;
    return moving ? [{ speaker: near.k.id, tags: ['nearMiss'] }] : [];
  }

  /** Whether `victim` had just rushed `killer` (ran or dashed straight at them) before falling to them at `at`. */
  rushed(victim, killer, at) {
    return at - (this.rushes.get(`${victim}>${killer}`) ?? -Infinity) <= WATCH.rushed.withinSec;
  }

  /** Whether `victim` fell to `killer` by the sword after a real exchange (blows each way, lately). */
  fair(victim, killer, at, source) {
    if (!WATCH.fair.sources.includes(source)) return false;
    const recent = this.blows.filter((blow) => at - blow.at <= WATCH.fair.withinSec);
    const count = (from, to) => recent.filter((blow) => blow.from === from && blow.to === to).length;
    return count(killer, victim) >= WATCH.fair.blows && count(victim, killer) >= WATCH.fair.blows;
  }

  /** Whether `id` charged a foe within the last `withinSec` seconds (asked about at a fall). */
  charging(id, at, withinSec = 2) {
    return at - (this.knights.get(id)?.chargeAt ?? -Infinity) <= withinSec;
  }

  /** A knight fell: what was being watched of them ends (their chases, their quiet, a recklessness not survived). */
  death(victimId) {
    const state = this.knights.get(victimId);
    if (state) {
      state.alive = false;
      state.reckless = null;
    }
    // (a foe a gust moved who has fallen since is not dismissed)
    for (const [speaker, gust] of [...this.gusts]) {
      gust.victims = gust.victims.filter((id) => id !== victimId);
      if (!gust.victims.length || speaker === victimId) this.gusts.delete(speaker);
    }
    for (const key of [...this.staggers.keys()]) if (key.endsWith(`>${victimId}`) || key.startsWith(`${victimId}>`)) this.staggers.delete(key);
  }
}
