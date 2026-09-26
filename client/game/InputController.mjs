import { recordArenaKey, releaseHeldInputs } from './inputRelease.mjs';

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
    this.onDashLocal = () => {};
    this.onPointer = () => {};

    this.#bind();
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
      this.turn(-event.movementX * 0.00235, -event.movementY * 0.0021);
    });

    document.addEventListener('keydown', (event) => {
      if (!recordArenaKey(this.keys, event.code, this.enabled)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab', 'ShiftLeft', 'ShiftRight'].includes(event.code)) event.preventDefault();
      if (event.code === 'KeyQ' && !event.repeat) this.cast();
      if (event.code === 'KeyE' && !event.repeat) this.dash();
      if (event.code === 'Tab') this.scoreboardHeld = true;
      if (event.code === 'F3' && !event.repeat) {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
      }
    });

    document.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      if (event.code === 'Tab') this.scoreboardHeld = false;
    });

    document.addEventListener('mousedown', (event) => {
      if (!this.pointerLocked) return;
      if (event.button === 0) this.setAttack(true);
      if (event.button === 2) this.setGuard(true);
    });

    document.addEventListener('mouseup', (event) => {
      if (this.touchFocus) return;
      if (event.button === 0) this.setAttack(false);
      if (event.button === 2) this.setGuard(false);
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

  dash() {
    if (!this.enabled) return;
    const dir = this.dashDirection();
    this.socket.dash(dir);
    this.onDashLocal(dir);
  }

  movement() {
    const touch = this.touch?.movement?.() ?? null;
    return {
      forward: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) + (touch?.forward ?? 0),
      right: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + (touch?.right ?? 0),
      jump: this.keys.has('Space') || Boolean(touch?.jump),
      // hold Shift (or push the touch stick all the way forward, or latch the touch Sprint button) to sprint
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Boolean(touch?.sprint),
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
