// The sword chain as the first-person arms play it, ahead of the server's word: the same rule as the server's
// (SWORD_CHAIN in shared/src/combat.mjs), on the local clock. A press starts a chain; the next strike follows only if
// the button is still held as its swing would begin, or was pressed again during the swing before it; let go and the
// swing under way plays out, and the chain ends where the next would have begun. After the heavy third strike, the
// arms play its recovery to the end of the cycle, where a held (or pressed again) button carries straight on into the
// next chain. (What the arms do once a chain ends is fpSlash.mjs's recoveryPose.) Pure: times in, the chain out.

import { MELEE_CONTACT, SWORD_CHAIN, SWORD_STRIKE_TIMES, nextChainStep, nextChainVariant } from '../../shared/src/combat.mjs';
import { chainCadence } from '../../shared/src/combatFrameData.mjs';

// the heavy third strike lands, and a new chain may start this much later (fpSlash COMBO_CYCLE: 1.8 + 0.28)
export const CHAIN_CYCLE = SWORD_STRIKE_TIMES[SWORD_STRIKE_TIMES.length - 1] + SWORD_CHAIN.restart;

export class LocalSwordChain {
  constructor() {
    this.held = false;
    this.queued = false;
    // { startedAt, committed, landed, variant } while a chain is under way
    this.chain = null;
    this.restartAt = -Infinity;
    // the last chain that ran its whole course ({ variant, restartAt }): one begun straight on from it takes the other
    // form (SWORD_CHAINS), by the server's own rule (nextChainVariant)
    this.run = null;
  }

  /** Whether a chain is under way (the arms are in the combo). */
  get active() { return this.chain !== null; }

  /** The active strike index (0, 1, or 2) in the running chain. */
  get currentStrike() {
    const chain = this.chain;
    if (!chain) return 0;
    return Math.max(0, Math.min(2, chain.landed));
  }

  /** When the chain under way began (for the combo's pose), or null. */
  get startedAt() { return this.chain?.startedAt ?? null; }

  press(now) {
    // (up to date first: a press just after the chain ended starts a new one, as it does on the server)
    this.step(now);
    this.held = true;
    this.lastCadence = null;
    if (!this.chain && now >= this.restartAt) this.#start(now);
    else {
      this.queued = true;
      this.#judge(now);
    }
    return this.lastCadence;
  }

  // the press for the chain's next cut, judged against its beat, as the server judges it (chainCadence): on it, the
  // rest of the follow-through is cancelled into the next cut when that cut now begins (step). Only the first press
  // after each contact counts.
  #judge(now) {
    const chain = this.chain;
    if (!chain || this.plain) return;
    if (chain.cadence?.strike === chain.landed) return;
    const judged = chainCadence({ startedAt: chain.startedAt, landed: chain.landed, pressAt: now });
    if (!judged || judged.grade === 'early') return;
    chain.cadence = { strike: judged.strike, grade: judged.grade, at: judged.at, shift: judged.shift, applied: false };
    this.lastCadence = { ...chain.cadence, offset: judged.offset };
  }

  /**
   * The server's word on a press's cadence for my chain under way (its event: the cut it brought, its grade, how far
   * the chain's clock jumped, and when, on my clock). What the arms guessed is set right: a jump not yet made is
   * replaced; one already made is corrected by the difference.
   */
  adoptCadence({ strike, grade, shift = 0, cutAt = null }) {
    const chain = this.chain;
    if (!chain || !Number.isInteger(strike)) return;
    const local = chain.cadence?.strike === strike ? chain.cadence : null;
    if (local?.applied) {
      chain.startedAt -= shift - local.shift;
      local.shift = shift;
      local.grade = grade;
      return;
    }
    chain.cadence = { strike, grade, at: shift > 0 && Number.isFinite(cutAt) ? cutAt : null, shift, applied: !(shift > 0) };
  }

  release() {
    this.held = false;
  }

  /**
   * A chain that began at `at`, the button held, whatever came before it (as the host begins a Sunder's first slam as
   * its brace ends, its swing already on the way up: the old chain and its recovery are over).
   */
  begin(at) {
    this.held = true;
    this.restartAt = -Infinity;
    this.run = null;
    this.#start(at);
  }

  /** Whether the sword has the hand: a committed strike yet to land, or a strike's blade still live (the gauntlet
   * waits for both, as on the server). */
  busy(now) {
    const chain = this.chain;
    if (!chain) return false;
    if (chain.landed < chain.committed) return true;
    const last = chain.landed - 1;
    return last >= 0 && now - chain.startedAt < SWORD_STRIKE_TIMES[last] + MELEE_CONTACT.follow;
  }

  /**
   * Stop at once: a guard, a spell, a wall, a parry, a fall. As on the server, nothing new starts before the chain's
   * next strike would have begun (a strike that went live is spent even if broken off before its contact).
   */
  cancel(now = null) {
    if (this.chain && Number.isFinite(now)) this.restartAt = Math.max(this.restartAt, nextStrikeDue(this.chain, now));
    this.chain = null;
    this.run = null;
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
    // (a press on the beat: the chain's clock jumps to its next cut as it now begins)
    const c = chain.cadence;
    if (c && !c.applied && Number.isFinite(c.at) && now + 1e-9 >= c.at) {
      c.applied = true;
      chain.startedAt -= c.shift;
    }
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
        this.run = null;
        this.restartAt = Math.max(this.restartAt, chain.startedAt + next.at);
        return null;
      }
    }
    if (chain.landed >= SWORD_STRIKE_TIMES.length && elapsed >= CHAIN_CYCLE) {
      // the heavy strike's recovery is over: straight on into the next chain, or back to rest
      this.chain = null;
      this.restartAt = chain.startedAt + CHAIN_CYCLE;
      this.run = { variant: chain.variant, restartAt: this.restartAt };
      if (this.held || this.queued) {
        this.#start(this.restartAt);
        return this.step(now);
      }
      return null;
    }
    return chain;
  }

  #start(at) {
    // (id: the chain itself, which its clock is not: a cadence jump moves startedAt, never the chain)
    this.serial = (this.serial ?? 0) + 1;
    this.chain = { id: this.serial, startedAt: at, committed: 1, landed: 0, variant: this.plain ? 0 : nextChainVariant(this.run, at) };
    this.run = null;
    this.queued = false;
  }

  /** Correct the form of the chain under way to the server's word for it (it is the server's to say). */
  adopt(variant) {
    if (this.chain && Number.isInteger(variant)) this.chain.variant = variant;
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
