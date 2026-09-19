import { recordArenaKey, releaseHeldInputs } from './inputRelease.mjs';

export class InputController {
  constructor(element, socket) {
    this.element = element;
    this.socket = socket;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.attackHeld = false;
    this.guardHeld = false;
    this.scoreboardHeld = false;
    this.debugVisible = false;
    this.enabled = false;
    this.onAttackLocal = () => {};
    this.onGuardLocal = () => {};
    this.onCastLocal = () => {};
    this.onDashLocal = () => {};
    this.onPointer = () => {};

    this.#bind();
  }

  #bind() {
    document.addEventListener('pointerlockchange', () => {
      this.enabled = document.pointerLockElement === this.element;
      this.onPointer(this.enabled);
      if (!this.enabled) releaseHeldInputs(this);
    });

    window.addEventListener('blur', () => releaseHeldInputs(this));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) releaseHeldInputs(this);
    });

    this.element.addEventListener('click', () => {
      if (!this.enabled) this.element.requestPointerLock?.();
    });

    document.addEventListener('mousemove', (event) => {
      if (!this.enabled) return;
      this.yaw -= event.movementX * 0.00235;
      this.pitch -= event.movementY * 0.0021;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });

    document.addEventListener('keydown', (event) => {
      if (!recordArenaKey(this.keys, event.code, this.enabled)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab'].includes(event.code)) event.preventDefault();
      if (event.code === 'KeyQ' && !event.repeat) {
        const direction = this.lookDirection();
        this.socket.cast(direction);
        this.onCastLocal();
      }
      if (event.code === 'KeyE' && !event.repeat) {
        const dir = this.dashDirection();
        this.socket.dash(dir);
        this.onDashLocal(dir);
      }
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
      if (!this.enabled) return;
      if (event.button === 0 && !this.attackHeld) {
        this.attackHeld = true;
        this.socket.attack(true);
        this.onAttackLocal(true);
      }
      if (event.button === 2 && !this.guardHeld) {
        this.guardHeld = true;
        this.socket.guard(true);
        this.onGuardLocal(true);
      }
    });

    document.addEventListener('mouseup', (event) => {
      if (event.button === 0 && this.attackHeld) {
        this.attackHeld = false;
        this.socket.attack(false);
        this.onAttackLocal(false);
      }
      if (event.button === 2 && this.guardHeld) {
        this.guardHeld = false;
        this.socket.guard(false);
        this.onGuardLocal(false);
      }
    });
    document.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  movement() {
    return {
      forward: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0),
      right: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      jump: this.keys.has('Space'),
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
