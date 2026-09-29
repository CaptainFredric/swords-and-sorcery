// The sword chain as the first-person arms play it, ahead of the server's word: the same rule as the server's
// (SWORD_CHAIN in shared/src/combat.mjs), on the local clock. A press starts a chain; the next strike follows only if
// the button is still held as its swing would begin, or was pressed again during the swing before it; let go and the
// swing under way plays out, and the chain ends where the next would have begun. After the finisher, the arms play its
// recovery to the end of the cycle, where a held (or pressed again) button carries straight on into the next chain.
// Pure: times in, the chain under way out.

import { SWORD_CHAIN, SWORD_STRIKE_TIMES, nextChainStep } from '../../shared/src/combat.mjs';

// the finisher lands, and a new chain may start this much later (fpSlash COMBO_CYCLE: 1.8 + 0.28)
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
    this.held = true;
    if (!this.chain && now >= this.restartAt) this.#start(now);
    else this.queued = true;
  }

  release() {
    this.held = false;
  }

  /** Stop at once: a guard, a spell, a wall, a parry, a fall. */
  cancel() {
    this.chain = null;
    this.held = false;
    this.queued = false;
  }

  /** Advance to `now`. Returns the chain under way ({ startedAt, committed, landed }) or null. */
  step(now) {
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
        // let go: the swing under way has played out
        this.chain = null;
        this.restartAt = -Infinity;
        return null;
      }
    }
    if (chain.landed >= SWORD_STRIKE_TIMES.length && elapsed >= CHAIN_CYCLE) {
      // the finisher's recovery is over: straight on into the next chain, or back to rest
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
