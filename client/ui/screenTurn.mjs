// Playing sideways inside an app that holds its screen upright.
//
// Some apps open web games in a browser that is locked to portrait: turning the phone does nothing, so a landscape
// game is stuck upright. When that happens the game can lie itself along the portrait screen instead: the whole
// shell is rotated a quarter turn with CSS, and the player turns the phone sideways to meet it. Where motion sensors
// are available it follows which way the phone is turned, like a native app; otherwise the player can flip it.
//
// While the game is turned, a point or a drag on the screen has to be turned into the game's own frame before the
// touch controls or the menu use it (point() and vector()). The CSS lives in mobile.css (html[data-turn]).

export const TURN = Object.freeze({
  // gravity across the screen below this (m/s^2) means the phone is lying flat: keep the current side
  minGravity: 3.5,
  // how far from upright (degrees) the phone must be tilted before the game follows it to a side
  enterDeg: 55,
  // and for how long, so a wobble does not flip the game
  settleMs: 250,
});

/**
 * The rotation the game needs (degrees): 0 when the screen is already wider than tall or turning is off; 90 to lie
 * along a portrait screen when the phone's top is turned to the left, -90 when it is turned to the right.
 */
export function turnAngle({ width, height, mode, side = 'left', typing = false }) {
  if (mode !== 'sideways' || typing || width >= height) return 0;
  return side === 'right' ? -90 : 90;
}

/** The size of the game's own frame for a screen of width x height. */
export function gameSize(angle, width, height) {
  return angle ? { width: height, height: width } : { width, height };
}

/** A point on the screen (client px) in the game's own frame (width, height: the screen). */
export function toGamePoint(angle, width, height, x, y) {
  if (angle === 90) return { x: y, y: width - x };
  if (angle === -90) return { x: height - y, y: x };
  return { x, y };
}

/** A movement on the screen (client px) in the game's own frame. */
export function toGameVector(angle, dx, dy) {
  if (angle === 90) return { x: dy, y: 0 - dx };
  if (angle === -90) return { x: 0 - dy, y: dx };
  return { x: dx, y: dy };
}

/**
 * Which way the phone is held, from gravity across its screen (normalised so that upright reads +y): 'left' (its
 * top turned to the left), 'right', 'upright', 'down', or null when it is lying too flat to tell.
 */
export function sideFromGravity(gx, gy) {
  if (Math.hypot(gx, gy) < TURN.minGravity) return null;
  const degrees = (Math.atan2(gx, gy) * 180) / Math.PI;
  if (degrees >= TURN.enterDeg && degrees <= 180 - TURN.enterDeg) return 'left';
  if (degrees <= -TURN.enterDeg && degrees >= -(180 - TURN.enterDeg)) return 'right';
  return Math.abs(degrees) < 90 ? 'upright' : 'down';
}

const isApple = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class ScreenTurn {
  constructor({ root = document.documentElement } = {}) {
    this.root = root;
    this.mode = 'auto';
    this.side = 'left';
    this.angle = 0;
    this.typing = false;
    this.sensing = false;
    // gravity readings are upright-positive on Android and (on older iOS) upright-negative: learned when asked
    this.gravitySign = isApple() ? -1 : 1;
    this.leaning = null;
    this.reading = null;
    this.lastKey = '';
    this.listeners = new Set();
    addEventListener('resize', () => this.apply());
    globalThis.visualViewport?.addEventListener('resize', () => this.apply());
    // typing needs the keyboard the phone offers, which comes up along its real bottom edge: stand the game upright
    // while a text field has focus, and lie it back down after
    document.addEventListener('focusin', (event) => this.#typing(event.target, true));
    document.addEventListener('focusout', (event) => this.#typing(event.target, false));
  }

  /** Called with { angle, mode, side } whenever any of them changes (renderers resize from their containers). */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  configure({ mode = this.mode, side = this.side } = {}) {
    this.mode = mode === 'sideways' ? 'sideways' : 'auto';
    this.side = side === 'right' ? 'right' : 'left';
    this.apply();
  }

  flip() {
    const side = this.side === 'left' ? 'right' : 'left';
    // the sensors say the phone is on the side being flipped away from: their sign was guessed wrong, so learn it
    // (otherwise they would turn the game straight back)
    if (this.sensing && this.reading && this.reading !== side) this.gravitySign *= -1;
    this.leaning = null;
    this.configure({ side });
    return this.side;
  }

  get turned() { return this.angle !== 0; }

  /** Screen point (client px) -> the game's frame. */
  point(x, y) {
    return toGamePoint(this.angle, innerWidth, innerHeight, x, y);
  }

  /** Screen movement (client px) -> the game's frame. */
  vector(dx, dy) {
    return toGameVector(this.angle, dx, dy);
  }

  apply() {
    const width = innerWidth;
    const height = innerHeight;
    const angle = turnAngle({ width, height, mode: this.mode, side: this.side, typing: this.typing });
    const root = this.root;
    root.style.setProperty('--turn-w', `${height}px`);
    root.style.setProperty('--turn-h', `${width}px`);
    if (angle) root.dataset.turn = String(angle);
    else delete root.dataset.turn;
    root.classList.toggle('turn-typing', this.typing && this.mode === 'sideways');
    this.angle = angle;
    const key = `${angle}|${this.mode}|${this.side}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const fn of this.listeners) fn({ angle, mode: this.mode, side: this.side });
  }

  /**
   * The player asked to play sideways (call from a tap: fullscreen, orientation lock and motion access all need
   * one). The game lies down at once; meanwhile a real landscape lock is tried, and if the app can turn after all,
   * the game stands back up and lets it. Resolves to 'locked' or 'turned'.
   */
  async goSideways() {
    // ask for the motion sensors first, while the tap still counts as the player's (iOS asks them)
    this.listenToMotion();
    this.configure({ mode: 'sideways' });
    const locked = await this.#tryLock();
    if (locked && innerWidth >= innerHeight) {
      this.configure({ mode: 'auto' });
      return 'locked';
    }
    return 'turned';
  }

  /** Follow the phone with its motion sensors (call from a tap: iOS asks the player first, once). */
  listenToMotion() {
    this.motionRequest ??= this.#listenToMotion().then((sensing) => {
      // refused: another tap may ask again
      if (!sensing) this.motionRequest = null;
      return sensing;
    });
    return this.motionRequest;
  }

  // fullscreen and a landscape lock (Android browsers allow it); some apps never answer, so give up after a moment
  async #tryLock() {
    const attempt = (async () => {
      try {
        const root = document.documentElement;
        const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
        if (request && !document.fullscreenElement && !document.webkitFullscreenElement) await request.call(root, { navigationUI: 'hide' });
        await screen.orientation?.lock?.('landscape');
        return true;
      } catch {
        return false;
      }
    })();
    const giveUp = new Promise((resolve) => { setTimeout(() => resolve(false), 1500); });
    return Promise.race([attempt, giveUp]);
  }

  async #listenToMotion() {
    if (this.sensing || typeof DeviceMotionEvent === 'undefined') return this.sensing;
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function' && await DeviceMotionEvent.requestPermission() !== 'granted') return false;
    } catch {
      return false;
    }
    this.sensing = true;
    let calibrated = false;
    addEventListener('devicemotion', (event) => {
      const g = event.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null) return;
      // the first clear reading comes from a phone held upright to read the prompt: it tells us the sign
      if (!calibrated && Math.abs(g.y) > 7 && Math.abs(g.x) < 3) {
        this.gravitySign = Math.sign(g.y);
        calibrated = true;
      }
      this.#lean(sideFromGravity(g.x * this.gravitySign, g.y * this.gravitySign), performance.now());
    });
    return true;
  }

  // follow the phone to a side once it has settled there (upright and flat keep the side it had)
  #lean(side, now) {
    if (side === 'left' || side === 'right') this.reading = side;
    if (side !== 'left' && side !== 'right') {
      this.leaning = null;
      return;
    }
    if (side === this.side) {
      this.leaning = null;
      return;
    }
    if (this.leaning?.side !== side) {
      this.leaning = { side, since: now };
      return;
    }
    if (now - this.leaning.since >= TURN.settleMs) {
      this.leaning = null;
      this.configure({ side });
    }
  }

  #typing(target, focused) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    // focus moving from one field straight to another keeps the game upright
    if (!focused) {
      setTimeout(() => {
        const active = document.activeElement;
        this.typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        this.apply();
      }, 0);
      return;
    }
    this.typing = true;
    this.apply();
  }
}

/** The page's one ScreenTurn (the input code reads points and drags through it). */
export const screenTurn = typeof document === 'undefined' ? null : new ScreenTurn();
