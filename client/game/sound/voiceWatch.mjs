// What the Spellblade's voice watches for over time: moments that are not one event but a way of moving, or a stretch
// of quiet. A knight charging a foe, chasing one who runs, a lull, the first foe met in a life, giving ground and then
// standing it, a sword chain carrying on past its third strike, a balance broken and found again before he could punish
// it, a blow taken that filled his Prowess, a foe's sword missing him as he moves. A swing as it begins: the first
// after a while, and the heavy third strike swung at a foe it would fell (the breath behind them leads the blade, so
// they are raised as the swing is committed, not when it lands). And, asked at a fall: whether the fallen had just
// rushed the one who felled them, and whether it was a fair fight.
//
// Fed with the host's events and every knight as last seen; returns the moments to raise ([{ speaker, tags }]), which
// the runtime hands to the voice like any other. Nothing in the game waits on it. Pure but for its memory, so it is
// tested. Times are the host's (seconds); positions and speeds are on the ground (x, z).

import { GAME, SWORD_CHAIN } from '../../../shared/src/combat.mjs';
import { PROWESS } from '../../../shared/src/prowess.mjs';

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
});

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
  }

  #knight(id, now) {
    if (!this.knights.has(id)) {
      this.knights.set(id, {
        alive: true, met: false, quietSince: now, lullSaid: false, chargeArmed: true, chargeAt: -Infinity,
        pursuitSince: null, pursuitAt: -Infinity, giving: new Map(), lastSwingAt: -Infinity, lastStrike: null,
        streak: 0, prowess: 0, hurtAt: -Infinity,
      });
    }
    return this.knights.get(id);
  }

  /**
   * Time passes: knights as last seen ([{ id, alive, position, velocity, sprinting, dashUntil, prowess, attackActive,
   * attackStartedAt, attackCommitted }]). self: my own knight (my swings are told as my arms begin them: begin()).
   */
  step(now, knights = [], { self = null } = {}) {
    const out = [];
    const living = knights.filter((k) => k && k.alive !== false && k.position);
    for (const knight of knights) {
      if (!knight?.id) continue;
      if (knight.id !== self) out.push(...this.#begunSeen(knight, now, knights));
      const state = this.#knight(knight.id, now);
      const alive = knight.alive !== false;
      // back on their feet: a new life, a new arrival, a new quiet
      if (alive && !state.alive) Object.assign(state, { met: false, quietSince: now, lullSaid: false, chargeArmed: true, streak: 0 });
      state.alive = alive;
      if (!alive || !knight.position) continue;
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
      if (state.chargeArmed && knight.sprinting && closing >= c.closing && straight && nearest.distance <= c.far && nearest.distance >= c.near) {
        state.chargeArmed = false;
        state.chargeAt = now;
        out.push({ speaker: knight.id, tags: ['charge'] });
      }
      // rushing a foe (asked about at a fall): running or dashing at them
      const dashing = (knight.dashUntil ?? -Infinity) > now;
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
    if (!attackerId || attackerId === victimId) return;
    this.#busy(this.#knight(attackerId, at), at);
    this.blows = [...this.blows.filter((blow) => at - blow.at <= WATCH.fair.withinSec), { from: attackerId, to: victimId, at }];
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

  /** A knight fell: what was being watched of them ends (their chases, their quiet). */
  death(victimId) {
    const state = this.knights.get(victimId);
    if (state) state.alive = false;
    for (const key of [...this.staggers.keys()]) if (key.endsWith(`>${victimId}`) || key.startsWith(`${victimId}>`)) this.staggers.delete(key);
  }
}
