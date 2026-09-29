// The sword chain as the first-person arms play it, ahead of the server's word: the same rule as the server's
// (SWORD_CHAIN in shared/src/combat.mjs), on the local clock. A press starts a chain; the next strike follows only if
// the button is still held as its swing would begin, or was pressed again during the swing before it; let go and the
// swing under way plays out, and the chain ends where the next would have begun. After the heavy third strike, the
// arms play its recovery to the end of the cycle, where a held (or pressed again) button carries straight on into the
// next chain. (What the arms do once a chain ends is fpSlash.mjs's recoveryPose.) Pure: times in, the chain out.

import { MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES, nextChainStep } from '../../shared/src/combat.mjs';

// the heavy third strike lands, and a new chain may start this much later (fpSlash COMBO_CYCLE: 1.8 + 0.28)
export const CHAIN_CYCLE = SWORD_STRIKE_TIMES[SWORD_STRIKE_TIMES.length - 1] + SWORD_CHAIN.restart;

export class LocalSwordChain {
  constructor() {
    this.held = false;
    this.queued = false;
    // { startedAt, committed, landed } while a chain is under way
    this.chain = null;
    this.restartAt = -Infinity;
  }

  /** Whether a chain is under way (the arms are in the combo). */
  get active() { return this.chain !== null; }

  /** When the chain under way began (for the combo's pose), or null. */
  get startedAt() { return this.chain?.startedAt ?? null; }

  press(now) {
    // (up to date first: a press just after the chain ended starts a new one, as it does on the server)
    this.step(now);
    this.held = true;
    if (!this.chain && now >= this.restartAt) this.#start(now);
    else this.queued = true;
  }

  release() {
    this.held = false;
  }

  /**
   * Stop at once: a guard, a spell, a wall, a parry, a fall. As on the server, nothing new starts before the chain's
   * next strike would have begun (a strike that went live is spent even if broken off before its contact).
   */
  cancel(now = null) {
    if (this.chain && Number.isFinite(now)) this.restartAt = Math.max(this.restartAt, nextStrikeDue(this.chain, now));
    this.chain = null;
    this.held = false;
    this.queued = false;
  }

  /** Advance to `now`. Returns the chain under way ({ startedAt, committed, landed }) or null. */
  step(now) {
    // a press made before the last chain's next strike was due starts the new one when it is (buffered, as on the
    // server)
    if (!this.chain && (this.held || this.queued) && now >= this.restartAt && Number.isFinite(this.restartAt)) {
      this.#start(now);
    }
    const chain = this.chain;
    if (!chain) return null;
    const elapsed = now - chain.startedAt;
    for (;;) {
      const next = nextChainStep(chain, elapsed);
      if (!next) break;
      if (next.kind === 'land') {
        chain.landed += 1;
      } else if (this.held || this.queued) {
        chain.committed += 1;
        this.queued = false;
      } else {
        // let go: the swing under way has played out (and the next could not have begun sooner than now)
        this.chain = null;
        this.restartAt = Math.max(this.restartAt, chain.startedAt + next.at);
        return null;
      }
    }
    if (chain.landed >= SWORD_STRIKE_TIMES.length && elapsed >= CHAIN_CYCLE) {
      // the heavy strike's recovery is over: straight on into the next chain, or back to rest
      this.chain = null;
      this.restartAt = chain.startedAt + CHAIN_CYCLE;
      if (this.held || this.queued) {
        this.#start(this.restartAt);
        return this.step(now);
      }
      return null;
    }
    return chain;
  }

  #start(at) {
    this.chain = { startedAt: at, committed: 1, landed: 0 };
    this.queued = false;
  }
}

// when a chain broken off at `now` would have begun its next strike (-Infinity if none of its strikes went live)
function nextStrikeDue(chain, now) {
  const elapsed = now - chain.startedAt;
  let spent = chain.landed;
  for (let i = chain.landed; i < chain.committed; i += 1) {
    if (elapsed >= SWORD_STRIKE_TIMES[i] - MELEE_CONTACT.window.early) spent = i + 1;
  }
  if (spent <= 0) return -Infinity;
  const begin = SWORD_CHAIN.starts[spent];
  return chain.startedAt + (Number.isFinite(begin) ? begin : CHAIN_CYCLE);
}
