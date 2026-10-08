// The front door's two forms, and which one it is in. COMMAND: the banner up, the round framed to the right of it.
// Observation: the banner drawn aside and the world given the screen, either asked for (OBSERVE_MANUAL: it stays until
// SHOW MENU or Escape; the pointer moving about does nothing to it) or fallen into after a long stillness on the front
// door (OBSERVE_IDLE: the player's return, by a real movement, a press or a key, brings the banner straight back). One
// state, never a set of booleans that could disagree.
//
// Pure: the clock (seconds) is handed in, and so is whether idling may happen at all (the runtime knows what is open,
// what is focused, whether the page is seen), so all of it is tested. Nothing here touches the round itself.

export const PRESENTATION = Object.freeze({ COMMAND: 'COMMAND', OBSERVE_MANUAL: 'OBSERVE_MANUAL', OBSERVE_IDLE: 'OBSERVE_IDLE' });

export const IDLE = Object.freeze({
  afterSec: 90,      // this long with nothing done on an eligible front door: the banner yields to the yard
  wakePx: 6,         // a pointer moved at least this far (all told, since it yielded) is the player back; less is jitter
});

const { COMMAND, OBSERVE_MANUAL, OBSERVE_IDLE } = PRESENTATION;

export class MenuPresentation {
  constructor({ onChange = () => {}, idleAfter = IDLE.afterSec, wakePx = IDLE.wakePx, now = 0 } = {}) {
    this.onChange = onChange;
    this.idleAfter = idleAfter;
    this.wakePx = wakePx;
    this.state = COMMAND;
    this.lastActive = now;
    this.drift = 0;
  }

  get observing() {
    return this.state !== COMMAND;
  }

  #set(state, cause) {
    if (state === this.state) return false;
    const previous = this.state;
    this.state = state;
    this.drift = 0;
    this.onChange(state, previous, cause);
    return true;
  }

  /** WATCH THE YARD: the banner drawn aside until it is asked back (also the way out of an idle yield, made deliberate). */
  observe() {
    return this.#set(OBSERVE_MANUAL, 'manual');
  }

  /** SHOW MENU (or Escape): the banner back; the stillness counted afresh from now. */
  showMenu(now) {
    this.lastActive = now;
    return this.#set(COMMAND, 'manual');
  }

  /** Leaving the front door (another screen, a match): back to COMMAND at once, the stillness counted afresh. */
  reset(now) {
    this.lastActive = now;
    return this.#set(COMMAND, 'reset');
  }

  /**
   * The player did something at `now`: kind 'pointer' (with `moved`, pixels since the last), 'press', 'key', 'wheel' or
   * 'touch'; 'visible' (the page seen again: the stillness counted afresh, never yielded to on its return). Returns
   * { woke, swallow }: whether it brought the banner back from an idle yield, and whether the event that did so should
   * go no further (a press or a key is the player waking it, not choosing the button under the pointer or in focus).
   */
  activity(now, { kind = 'pointer', moved = 0 } = {}) {
    if (this.state === OBSERVE_IDLE) {
      if (kind === 'pointer') {
        this.drift += Math.max(0, moved);
        if (this.drift < this.wakePx) return { woke: false, swallow: false };
      }
      if (kind === 'visible') {
        this.lastActive = now;
        return { woke: false, swallow: false };
      }
      this.lastActive = now;
      this.#set(COMMAND, 'wake');
      return { woke: true, swallow: kind === 'press' || kind === 'key' || kind === 'touch' };
    }
    // (watching by choice, or the banner up: only the stillness is counted afresh)
    this.lastActive = now;
    return { woke: false, swallow: false };
  }

  /**
   * Time passes. eligible: whether the front door may yield to the yard on its own right now (the main menu, nothing
   * open or being typed in, nothing waiting on the player, the page seen, a device with a pointer). While it may not,
   * the stillness is not counted (a panel open for ten minutes does not leave the banner to vanish as it closes).
   */
  tick(now, eligible) {
    if (this.state !== COMMAND) return false;
    if (!eligible) {
      this.lastActive = now;
      return false;
    }
    if (now - this.lastActive < this.idleAfter) return false;
    return this.#set(OBSERVE_IDLE, 'idle');
  }
}
