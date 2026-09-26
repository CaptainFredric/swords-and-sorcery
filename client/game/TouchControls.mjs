import { GAME } from '../../shared/src/combat.mjs';
import { MOVEMENT } from '../../shared/src/movement.mjs';
import { lookDelta, stickVector, TOUCH } from './touchControlsModel.mjs';

// On-screen controls for phones and tablets. They drive the same InputController actions as the mouse and
// keyboard, so the server, prediction and animation see no difference between the two.
//
// Left of STICK_ZONE: a floating movement stick. Everywhere else: drag to look. Attack and Guard also turn the view
// while held, so a thumb can swing and aim in one motion.

const STICK_ZONE = 0.42;
// a quick tap must stay pressed for at least two input sends (50 ms apart) to reach the server
const JUMP_LATCH_MS = 150;

const ICONS = {
  attack: '<path d="M20 4 9 15M6 12l6 6M7.5 16.5 4 20"/>',
  guard: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>',
  fireball: '<path d="M12 2.8c.9 3.7 5 5.3 5 10a5 5 0 0 1-10 0c0-2.4 1.3-4 2.6-5.3.3 1.7 1 2.7 2.1 3.2-.5-3 .1-5.5.3-7.9z"/>',
  dash: '<path d="M4 8h6M3 12h8M4 16h6M13 6l6 6-6 6"/>',
  jump: '<path d="M12 18V6M6.5 11.5 12 6l5.5 5.5M6 21h12"/>',
  sprint: '<path d="M6 12.5 12 7l6 5.5M6 18.5 12 13l6 5.5"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  scores: '<path d="M5 7h14M5 12h14M5 17h14"/>',
};

const BUTTONS = [
  { action: 'attack', label: 'ATTACK' },
  { action: 'guard', label: 'GUARD' },
  { action: 'dash', label: 'DASH', cooldown: { key: 'dashReadyAt', seconds: MOVEMENT.dashCooldown } },
  { action: 'fireball', label: 'FIREBALL', cooldown: { key: 'fireballReadyAt', seconds: GAME.fireballCooldownSec } },
  { action: 'jump', label: 'JUMP' },
  { action: 'sprint', label: 'SPRINT' },
  { action: 'pause', label: 'MENU' },
  { action: 'scores', label: 'SCORES' },
];

function svg(action) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[action]}</svg>`;
}

export class TouchControls {
  constructor(root, input) {
    this.input = input;
    this.active = false;
    this.stick = null;
    this.look = null;
    this.held = new Map();   // pointerId -> action for held buttons
    this.stickState = { forward: 0, right: 0, sprint: false };
    this.sprintLatched = false;
    this.jumpHeld = false;
    this.jumpUntil = 0;

    this.layer = document.createElement('div');
    this.layer.className = 'touch-controls';
    this.layer.innerHTML = `
      <div class="touch-stick"><div class="touch-stick-knob"></div></div>
      ${BUTTONS.map(({ action, label, cooldown }) => `
        <div class="touch-btn touch-${action}" data-action="${action}" role="button" aria-label="${label}">
          ${svg(action)}<span>${label}</span>${cooldown ? '<i class="touch-cooldown"></i><b class="touch-timer"></b>' : ''}
        </div>`).join('')}`;
    root.append(this.layer);
    this.stickBase = this.layer.querySelector('.touch-stick');
    this.stickKnob = this.layer.querySelector('.touch-stick-knob');
    this.buttons = Object.fromEntries(BUTTONS.map(({ action }) => [action, this.layer.querySelector(`[data-action="${action}"]`)]));
    this.cooldowns = BUTTONS.filter((button) => button.cooldown).map(({ action, cooldown }) => ({
      element: this.buttons[action],
      timer: this.buttons[action].querySelector('.touch-timer'),
      ...cooldown,
    }));

    this.layer.addEventListener('pointerdown', this.#down);
    this.layer.addEventListener('pointermove', this.#move);
    this.layer.addEventListener('pointerup', this.#up);
    this.layer.addEventListener('pointercancel', this.#up);
    this.layer.addEventListener('lostpointercapture', this.#up);
    this.layer.addEventListener('contextmenu', (event) => event.preventDefault());

    // the prompts name taps instead of clicks and Esc
    const hints = [
      ['#pointer-hint', 'TAP TO ENTER THE ARENA'],
      ['.practice-tools-unlocked-hint', 'TAP ARENA TO RESUME'],
      ['.practice-tools-locked-hint', 'MENU BUTTON FOR TOOLS'],
    ];
    for (const [selector, text] of hints) {
      const element = document.querySelector(selector);
      if (element) element.textContent = text;
    }
  }

  // shown and listening only while the player is in the arena (the touch version of pointer lock)
  setActive(active) {
    this.active = Boolean(active);
    this.layer.classList.toggle('active', this.active);
    if (!this.active) this.reset();
  }

  reset() {
    for (const action of this.held.values()) this.#release(action);
    this.held.clear();
    this.#endStick();
    this.look = null;
    this.sprintLatched = false;
    this.jumpHeld = false;
    this.jumpUntil = 0;
    this.buttons.sprint.classList.remove('on');
  }

  movement() {
    if (!this.active) return null;
    const moving = Math.abs(this.stickState.forward) + Math.abs(this.stickState.right) > 0;
    return {
      forward: this.stickState.forward,
      right: this.stickState.right,
      jump: this.jumpHeld || performance.now() < this.jumpUntil,
      sprint: this.stickState.sprint || (this.sprintLatched && moving),
    };
  }

  // best effort: full screen hides the browser bars, and Android can then hold landscape
  enterImmersive() {
    const root = document.documentElement;
    const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
    if (!document.fullscreenElement && !document.webkitFullscreenElement && request) {
      Promise.resolve(request.call(root, { navigationUI: 'hide' }))
        .then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    }
  }

  update(local, serverNow) {
    if (!local) return;
    for (const { element, timer, key, seconds } of this.cooldowns) {
      const remaining = Math.max(0, (local[key] ?? 0) - serverNow);
      const ready = remaining <= 0.01;
      element.classList.toggle('cooling', !ready);
      element.style.setProperty('--cooldown', String(Math.min(1, remaining / seconds)));
      timer.textContent = ready ? '' : remaining.toFixed(remaining < 1 ? 1 : 0);
    }
    this.buttons.sprint.classList.toggle('sprinting', Boolean(local.sprinting));
    this.buttons.guard.classList.toggle('drained', (local.guardStamina ?? 100) < 1);
  }

  dispose() {
    this.reset();
    this.layer.remove();
  }

  #down = (event) => {
    if (!this.active) return;
    event.preventDefault();
    // keep the finger's moves and release even when it slides off its button (the pointer may already be gone)
    try { this.layer.setPointerCapture?.(event.pointerId); } catch { /* released before we could capture it */ }
    const button = event.target.closest?.('[data-action]');
    if (button) {
      this.#press(button.dataset.action, event);
      return;
    }
    const rect = this.layer.getBoundingClientRect();
    if (event.clientX - rect.left < rect.width * STICK_ZONE) {
      if (!this.stick) this.#startStick(event, rect);
    } else if (!this.look) {
      this.look = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  };

  #move = (event) => {
    if (this.stick?.id === event.pointerId) {
      this.#moveStick(event);
      return;
    }
    const looking = this.look?.id === event.pointerId ? this.look : null;
    const held = this.held.get(event.pointerId);
    const aiming = held === 'attack' || held === 'guard' ? this.aim?.get(event.pointerId) : null;
    const tracker = looking ?? aiming;
    if (!tracker) return;
    const { yaw, pitch } = lookDelta(event.clientX - tracker.x, event.clientY - tracker.y);
    tracker.x = event.clientX;
    tracker.y = event.clientY;
    this.input.turn(yaw, pitch);
  };

  #up = (event) => {
    if (this.stick?.id === event.pointerId) this.#endStick();
    if (this.look?.id === event.pointerId) this.look = null;
    const action = this.held.get(event.pointerId);
    if (action) {
      this.held.delete(event.pointerId);
      this.aim?.delete(event.pointerId);
      this.#release(action);
      // the menu opens on release, so the lifting finger cannot land on the arena and re-enter it
      if (action === 'pause' && event.type === 'pointerup') this.input.releaseFocus();
    }
  };

  #press(action, event) {
    const element = this.buttons[action];
    element?.classList.add('pressed');
    this.held.set(event.pointerId, action);
    if (action === 'attack') this.input.setAttack(true);
    if (action === 'guard') this.input.setGuard(true);
    if (action === 'attack' || action === 'guard') {
      this.aim ??= new Map();
      this.aim.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (action === 'fireball') this.input.cast();
    if (action === 'dash') this.input.dash();
    if (action === 'jump') {
      this.jumpHeld = true;
      this.jumpUntil = performance.now() + JUMP_LATCH_MS;
    }
    if (action === 'sprint') {
      this.sprintLatched = !this.sprintLatched;
      this.buttons.sprint.classList.toggle('on', this.sprintLatched);
    }
    if (action === 'scores') this.input.scoreboardHeld = !this.input.scoreboardHeld;
  }

  #release(action) {
    this.buttons[action]?.classList.remove('pressed');
    if (action === 'attack') this.input.setAttack(false);
    if (action === 'guard') this.input.setGuard(false);
    if (action === 'jump') this.jumpHeld = false;
  }

  #startStick(event, rect) {
    // plant the stick under the thumb, far enough from the edges for the whole ring to show
    const margin = TOUCH.stickRadius + 10;
    const x = Math.max(margin, Math.min(rect.width - margin, event.clientX - rect.left));
    const y = Math.max(margin, Math.min(rect.height - margin, event.clientY - rect.top));
    this.stick = { id: event.pointerId, x: x + rect.left, y: y + rect.top };
    this.stickBase.style.left = `${x}px`;
    this.stickBase.style.top = `${y}px`;
    this.stickBase.classList.add('held');
    this.#moveStick(event);
  }

  #moveStick(event) {
    const vector = stickVector(event.clientX - this.stick.x, event.clientY - this.stick.y);
    this.stickState = { forward: vector.forward, right: vector.right, sprint: vector.sprint };
    this.stickKnob.style.transform = `translate(${vector.knob.x}px, ${vector.knob.y}px)`;
    this.stickBase.classList.toggle('sprint', vector.sprint);
  }

  #endStick() {
    this.stick = null;
    this.stickState = { forward: 0, right: 0, sprint: false };
    this.stickBase.classList.remove('held', 'sprint');
    this.stickBase.style.left = '';
    this.stickBase.style.top = '';
    this.stickKnob.style.transform = '';
    // the sprint toggle lasts until the thumb lets go of the stick
    if (this.sprintLatched) {
      this.sprintLatched = false;
      this.buttons.sprint.classList.remove('on');
    }
  }
}
