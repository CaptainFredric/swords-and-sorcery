// My own blade's swing, judged in my own view as the server will judge it (the same sweep: shared/src/blade.mjs), so
// that what it rings off is heard and felt as it happens, not a round trip later when the swing is already over. Only
// what is felt is foretold (the clang, the sparks, the jolt). Whether the blow was truly stopped stays the server's
// word (that is what ends the chain); and the server's own clang for a strike already foretold is not played twice.
// Only the blade's driven part is looked at: from where its swing begins to a step past its contact, where the world
// can still stop it (MELEE_CONTACT.worldFollow). A Sundering slam is left to the server (the ground it splits is the
// server's to say). Pure but for its memory, so it is tested.

import { MELEE_CONTACT, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { aimFrame, bladeDirection, sweepBlade } from '../../shared/src/blade.mjs';
import { POSTURES, postureOf } from '../../shared/src/body.mjs';

const STEP = 1 / 60;

export class LocalBladeSweep {
  constructor() {
    // the strike being swept ({ key, strike, contact, sampledTo, direction }) and the last one finished
    this.live = null;
    this.done = null;
  }

  /**
   * Carry my swing on to `now` (the arms' clock, seconds). chain: { startedAt, committed } (LocalSwordChain's), or null;
   * body: my own ({ position, crouched }); yaw, pitch: my aim; bodies: the other knights [{ id, x, y, z, crown? }];
   * solids: the world's. Returns what my blade has just rung off ({ point, normal, solid }), once per strike, or null.
   */
  step(now, { chain = null, slam = false, body = null, yaw = 0, pitch = 0, bodies = [], solids = [] } = {}) {
    if (!chain || slam || !body?.position) {
      this.live = null;
      return null;
    }
    if (!this.live) this.live = this.#strikeAt(chain, now);
    const live = this.live;
    if (!live) return null;
    const until = Math.min(now, live.to);
    const frame = aimFrame(yaw, pitch);
    const at = body.position;
    const eye = { x: at.x, y: at.y + postureOf(body).eye, z: at.z };
    const others = bodies.map((other) => ({ id: other.id, base: { x: other.x, y: other.y, z: other.z }, top: other.crown ?? POSTURES.standing.crown }));
    while (live.sampledTo < until - 1e-9) {
      const next = Math.min(until, live.sampledTo + STEP);
      const from = live.direction ?? bladeDirection(live.strike, live.sampledTo - live.contact, frame);
      const to = bladeDirection(live.strike, next - live.contact, frame);
      const driven = live.sampledTo < live.contact + MELEE_CONTACT.worldFollow - 1e-9;
      const met = sweepBlade(eye, from, to, others, solids, { aim: frame.forward, world: driven });
      live.sampledTo = next;
      live.direction = to;
      if (met) {
        this.#finish(live);
        // (a knight met first takes the blow: the server lands it, and nothing rings)
        return met.kind === 'solid' ? { point: met.point, normal: met.normal, solid: met.solid, strike: live.strike } : null;
      }
    }
    if (live.sampledTo >= live.to - 1e-9) this.#finish(live);
    return null;
  }

  // the committed strike whose driven part `now` falls in, if it has not been swept already
  #strikeAt(chain, now) {
    for (let strike = 0; strike < Math.min(chain.committed, SWORD_STRIKE_TIMES.length); strike += 1) {
      const contact = chain.startedAt + SWORD_STRIKE_TIMES[strike];
      const from = contact - MELEE_CONTACT.window.early;
      const to = contact + MELEE_CONTACT.worldFollow + STEP;
      const key = `${chain.startedAt}:${strike}`;
      if (now >= from && now < to + 0.25 && key !== this.done) return { key, strike, contact, to, sampledTo: from, direction: null };
    }
    return null;
  }

  #finish(live) {
    this.done = live.key;
    this.live = null;
  }
}
