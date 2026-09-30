import { recordArenaKey, releaseHeldInputs } from './inputRelease.mjs';
import { registry } from '../settings/settingsRegistry.mjs';

// what pressing and letting go of each action does (held movement keys are read by movement() instead); any other
// action, such as an ability added later, reaches onAction(action, pressed)
const PRESS = {
  attack: (input) => input.setAttack(true),
  guard: (input) => input.setGuard(true),
  spell: (input) => input.cast(),
  dash: (input) => input.dash(),
  gauntlet: (input) => input.gauntlet(),
  ultimate: (input) => input.ultimate(),
  scoreboard: (input) => { input.scoreboardHeld = true; },
};
const RELEASE = {
  attack: (input) => input.setAttack(false),
  guard: (input) => input.setGuard(false),
  scoreboard: (input) => { input.scoreboardHeld = false; },
};
const HELD = new Set(['forward', 'back', 'left', 'right', 'jump', 'sprint']);
// the menus handle these themselves (they work outside the arena too)
const MENU_ACTIONS = new Set(['toggleSound', 'toggleMusic']);

export class InputController {
  constructor(element, socket) {
    this.element = element;
    this.socket = socket;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.pointerLocked = false;
    this.attackHeld = false;
    this.guardHeld = false;
    this.scoreboardHeld = false;
    this.debugVisible = false;
    this.enabled = false;
    // TouchControls on phones and tablets; there is no pointer lock there, so entering the arena sets touchFocus
    this.touch = null;
    this.touchFocus = false;
    this.onAttackLocal = () => {};
    this.onGuardLocal = () => {};
    this.onCastLocal = () => {};
    this.onGauntletLocal = () => {};
    this.onDashLocal = () => {};
    this.onPointer = () => {};
    this.onAction = () => {};
    // look speed (multipliers) and the key bindings, from the settings
    this.look = { mouse: 1, touch: 1, invertY: false };
    this.bindings = registry.defaultBindings();
    this.#index();

    this.#bind();
  }

  /** Settings: { mouse, touch, invertY, bindings: { action: [codes] } }. */
  configure({ mouse = this.look.mouse, touch = this.look.touch, invertY = this.look.invertY, bindings = this.bindings } = {}) {
    this.look = { mouse, touch, invertY: Boolean(invertY) };
    this.bindings = bindings;
    this.#index();
  }

  #index() {
    this.actionOf = new Map();
    for (const [action, codes] of Object.entries(this.bindings)) for (const code of codes ?? []) this.actionOf.set(code, action);
  }

  /** Whether any key bound to an action is held. */
  held(action) {
    for (const code of this.bindings[action] ?? []) if (this.keys.has(code)) return true;
    return false;
  }

  #press(code, repeat = false) {
    const action = this.actionOf.get(code);
    if (!action || repeat || HELD.has(action) || MENU_ACTIONS.has(action)) return;
    if (PRESS[action]) PRESS[action](this);
    else if (!RELEASE[action]) this.onAction(action, true);
  }

  #release(code) {
    const action = this.actionOf.get(code);
    if (!action || HELD.has(action) || MENU_ACTIONS.has(action)) return;
    if (RELEASE[action]) RELEASE[action](this);
    else if (!PRESS[action]) this.onAction(action, false);
  }

  #bind() {
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
      if (this.touchFocus) return;
      this.#setEnabled(this.pointerLocked);
    });

    window.addEventListener('blur', () => releaseHeldInputs(this));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      releaseHeldInputs(this);
      // leaving the app counts as leaving the arena, like losing pointer lock
      if (this.touchFocus) this.#setTouchFocus(false);
    });

    this.element.addEventListener('click', () => this.requestPointerLock());

    document.addEventListener('mousemove', (event) => {
      if (!this.pointerLocked) return;
      const invert = this.look.invertY ? -1 : 1;
      this.turn(-event.movementX * 0.00235 * this.look.mouse, -event.movementY * 0.0021 * this.look.mouse * invert);
    });

    document.addEventListener('keydown', (event) => {
      if (!recordArenaKey(this.keys, event.code, this.enabled)) return;
      // a bound key belongs to the game while in the arena (Space would scroll, Tab would move focus)
      if (this.actionOf.has(event.code)) event.preventDefault();
      this.#press(event.code, event.repeat);
      if (event.code === 'F3' && !event.repeat) {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
      }
    });

    document.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      this.#release(event.code);
    });

    // mouse buttons are bindings like keys: Mouse0 is the left button, Mouse2 the right
    document.addEventListener('mousedown', (event) => {
      if (!this.pointerLocked) return;
      const code = `Mouse${event.button}`;
      this.keys.add(code);
      this.#press(code);
    });

    document.addEventListener('mouseup', (event) => {
      if (this.touchFocus) return;
      const code = `Mouse${event.button}`;
      this.keys.delete(code);
      this.#release(code);
    });
    document.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  #setEnabled(enabled) {
    this.enabled = enabled;
    this.onPointer(this.enabled);
    if (!this.enabled) releaseHeldInputs(this);
  }

  #setTouchFocus(focused) {
    if (this.touchFocus === focused) return;
    this.touchFocus = focused;
    this.touch?.setActive(focused);
    if (focused) this.touch?.enterImmersive();
    this.#setEnabled(focused);
  }

  // enter the arena: pointer lock with a mouse, the on-screen controls on a touch device
  requestPointerLock() {
    if (this.enabled) return;
    if (this.touch) this.#setTouchFocus(true);
    else this.element.requestPointerLock?.();
  }

  releaseFocus() {
    if (this.touchFocus) this.#setTouchFocus(false);
    else if (this.pointerLocked) document.exitPointerLock?.();
  }

  turn(yawDelta, pitchDelta) {
    if (!this.enabled) return;
    this.yaw += yawDelta;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + pitchDelta));
  }

  setAttack(held) {
    if (Boolean(held) === this.attackHeld) return;
    this.attackHeld = Boolean(held);
    this.socket.attack(this.attackHeld);
    this.onAttackLocal(this.attackHeld);
  }

  setGuard(held) {
    if (Boolean(held) === this.guardHeld) return;
    this.guardHeld = Boolean(held);
    this.socket.guard(this.guardHeld);
    this.onGuardLocal(this.guardHeld);
  }

  cast() {
    if (!this.enabled) return;
    this.socket.cast(this.lookDirection());
    this.onCastLocal();
  }

  // the gauntlet on its own key (unbound unless chosen): the fist whether or not the spell is ready
  gauntlet() {
    if (!this.enabled) return;
    this.socket.gauntlet();
    this.onGauntletLocal();
  }

  // the ultimate's key (the host decides whether the meter is full)
  ultimate() {
    if (!this.enabled) return;
    this.socket.ultimate?.();
    this.onUltimateLocal?.();
  }

  dash() {
    if (!this.enabled) return;
    const dir = this.dashDirection();
    this.socket.dash(dir);
    this.onDashLocal(dir);
  }

  movement() {
    const touch = this.touch?.movement?.() ?? null;
    return {
      forward: (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0) + (touch?.forward ?? 0),
      right: (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0) + (touch?.right ?? 0),
      jump: this.held('jump') || Boolean(touch?.jump),
      // hold Sprint (Shift unless rebound; or push the touch stick all the way forward, or latch the touch button)
      sprint: this.held('sprint') || Boolean(touch?.sprint),
      // hold Crouch (C unless rebound), or toggle the touch button: the wish; the body crouches and stands by the
      // server's rule (it cannot stand up under something)
      crouch: this.held('crouch') || Boolean(touch?.crouch),
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  lookDirection() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  dashDirection() {
    const input = this.movement();
    const f = input.forward;
    const r = input.right;
    if (Math.abs(f) + Math.abs(r) < 0.01) {
      return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const x = -sin * f + cos * r;
    const z = -cos * f - sin * r;
    const m = Math.hypot(x, z) || 1;
    return { x: x / m, z: z / m };
  }
}
