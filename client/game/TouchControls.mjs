import { MOVEMENT } from '../../shared/src/movement.mjs';
import { spellFor } from '../../shared/src/spells.mjs';
import { isDeliberateTap, lookDelta, stickVector, TOUCH } from './touchControlsModel.mjs';
import { screenTurn } from '../ui/screenTurn.mjs';
import { ICONS, iconSvg } from '../ui/icons.mjs';
import { ultimateView } from '../ui/ultimateView.mjs';

// On-screen controls for phones and tablets. They drive the same InputController actions as the mouse and
// keyboard, so the server, prediction and animation see no difference between the two.
//
// Left of STICK_ZONE: a floating movement stick. Everywhere else: drag to look. Attack and Guard also turn the view
// while held, so a thumb can swing and aim in one motion.

const STICK_ZONE = 0.42;
// a quick tap must stay pressed for at least two input sends (50 ms apart) to reach the server
const JUMP_LATCH_MS = 150;

const BUTTONS = [
  { action: 'attack', label: 'ATTACK' },
  { action: 'guard', label: 'GUARD' },
  { action: 'dash', label: 'DASH', cooldown: { key: 'dashReadyAt', seconds: MOVEMENT.dashCooldown } },
  // the spell carried from the Armory (its icon, name and cooldown follow the spell)
  { action: 'spell', label: 'FIREBALL', icon: 'fireball', cooldown: { key: 'spellReadyAt', seconds: 4 } },
  { action: 'jump', label: 'JUMP' },
  { action: 'sprint', label: 'SPRINT' },
  // (a toggle, and only for a deliberate tap on it: see #up)
  { action: 'crouch', label: 'CROUCH' },
  // the gauntlet on its own, spell or no spell: hidden unless asked for in the settings
  { action: 'gauntlet', label: 'FIST' },
  // the ultimate: its shade drains as prowess is earned; full, it glows
  { action: 'ultimate', label: 'SUNDER', icon: 'sunder' },
  { action: 'pause', label: 'MENU' },
  { action: 'scores', label: 'SCORES' },
];

const svg = (icon) => iconSvg(icon);

// where a finger is in the game's own frame (the game may be lying sideways on a screen that stays upright)
function gamePoint(event) {
  return screenTurn ? screenTurn.point(event.clientX, event.clientY) : { x: event.clientX, y: event.clientY };
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
      ${BUTTONS.map(({ action, label, icon = action, cooldown }) => `
        <div class="touch-btn touch-${action}" data-action="${action}" role="button" aria-label="${label}">
          ${svg(icon)}<span>${label}</span>${cooldown ? '<i class="touch-cooldown"></i><b class="touch-timer"></b>' : ''}
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

  /** The buttons' size as a share of their natural size (a setting). */
  setScale(scale) {
    this.layer.style.setProperty('--ts', String(scale));
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
    this.crouchLatched = false;
    this.crouchTap = null;
    this.jumpHeld = false;
    this.jumpUntil = 0;
    this.buttons.sprint.classList.remove('on');
    this.buttons.crouch?.classList.remove('on');
  }

  movement() {
    if (!this.active) return null;
    const moving = Math.abs(this.stickState.forward) + Math.abs(this.stickState.right) > 0;
    return {
      forward: this.stickState.forward,
      right: this.stickState.right,
      jump: this.jumpHeld || performance.now() < this.jumpUntil,
      sprint: this.stickState.sprint || (this.sprintLatched && moving),
      crouch: Boolean(this.crouchLatched),
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
    this.#showSpell(spellFor(local.spell), (local.spellReadyAt ?? 0) - serverNow > 0.01);
    for (const { element, timer, key, seconds } of this.cooldowns) {
      const remaining = Math.max(0, (local[key] ?? 0) - serverNow);
      const ready = remaining <= 0.01;
      element.classList.toggle('cooling', !ready);
      element.style.setProperty('--cooldown', String(Math.min(1, remaining / seconds)));
      timer.textContent = ready ? '' : remaining.toFixed(remaining < 1 ? 1 : 0);
    }
    this.buttons.sprint.classList.toggle('sprinting', Boolean(local.sprinting));
    this.buttons.crouch?.classList.toggle('crouched', Boolean(local.crouched));
    // its word says what it is doing: CROUCH to go down, DOWN while it holds the knight low
    const crouchWord = this.crouchLatched ? 'DOWN' : 'CROUCH';
    const crouchLabel = this.buttons.crouch?.querySelector('span');
    if (crouchLabel && crouchLabel.textContent !== crouchWord) crouchLabel.textContent = crouchWord;
    this.buttons.guard.classList.toggle('drained', (local.guardStamina ?? 100) < 1);
    this.#showUltimate(local, serverNow);
  }

  // the ultimate's button: filling with prowess, glowing when full, lit while it is active
  #showUltimate(local, serverNow) {
    const button = this.buttons.ultimate;
    if (!button) return;
    const view = ultimateView(local, serverNow);
    button.classList.toggle('charging', view.state === 'charging' || view.state === 'locked');
    button.classList.toggle('ready', view.state === 'ready');
    button.classList.toggle('active', view.state === 'active' || view.state === 'bracing');
    button.style.setProperty('--charge', view.charge.toFixed(3));
  }

  /**
   * While the spell cools its button is the gauntlet's (the fist on it, the spell's own mark small in its corner, the
   * cooldown still counting down); `ready`: the fist can be thrown now (dimmed while the sword has the hand).
   */
  setFistReady(ready) {
    this.buttons.spell?.classList.toggle('fist-held', !ready);
  }

  /** The gauntlet's own button (a setting; hidden unless asked for). */
  setGauntletButton(shown) {
    this.layer.classList.toggle('gauntlet-on', Boolean(shown));
  }

  // the spell button wears the carried spell, or, while that cools, the gauntlet
  #showSpell(spell, cooling) {
    const button = this.buttons.spell;
    const face = `${spell.id}:${cooling ? 'fist' : 'spell'}`;
    if (!button || button.dataset.face === face) return;
    button.dataset.face = face;
    button.dataset.spell = spell.id;
    button.classList.toggle('frost', spell.id === 'frostfire');
    button.classList.toggle('gale', spell.id === 'gale');
    button.classList.toggle('steel', spell.id === 'steel');
    button.classList.toggle('fist', Boolean(cooling));
    button.setAttribute('aria-label', cooling ? `GAUNTLET (${spell.label.toUpperCase()} RECHARGING)` : spell.label.toUpperCase());
    button.querySelector('span').textContent = cooling ? 'FIST' : (spell.short ?? spell.label).toUpperCase();
    button.querySelector('svg').innerHTML = ICONS[cooling ? 'gauntlet' : spell.id] ?? ICONS.fireball;
    let badge = button.querySelector('.touch-badge');
    if (!badge) {
      badge = document.createElement('i');
      badge.className = 'touch-badge';
      button.append(badge);
    }
    badge.innerHTML = cooling ? iconSvg(spell.id) : '';
    const cooldown = this.cooldowns.find((entry) => entry.element === button);
    if (cooldown) cooldown.seconds = spell.cooldownSec;
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
    const point = gamePoint(event);
    if (point.x < this.layer.clientWidth * STICK_ZONE) {
      if (!this.stick) this.#startStick(event, point);
    } else if (!this.look) {
      this.look = { id: event.pointerId, x: point.x, y: point.y };
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
    const point = gamePoint(event);
    const { yaw, pitch } = lookDelta(point.x - tracker.x, point.y - tracker.y);
    tracker.x = point.x;
    tracker.y = point.y;
    const look = this.input.look ?? { touch: 1, invertY: false };
    this.input.turn(yaw * look.touch, pitch * look.touch * (look.invertY ? -1 : 1));
  };

  #up = (event) => {
    if (this.stick?.id === event.pointerId) this.#endStick();
    if (this.look?.id === event.pointerId) this.look = null;
    const action = this.held.get(event.pointerId);
    // crouch toggles only for a deliberate tap: pressed on the button and lifted soon after, without sliding off it (a
    // finger passing over it while steering or looking belongs to the stick or the view, and never reaches it at all)
    if (action === 'crouch' && this.crouchTap?.id === event.pointerId) {
      const point = gamePoint(event);
      const tap = this.crouchTap;
      this.crouchTap = null;
      if (isDeliberateTap(tap, { at: performance.now(), x: point.x, y: point.y, lifted: event.type === 'pointerup' })) {
        this.crouchLatched = !this.crouchLatched;
        this.buttons.crouch.classList.toggle('on', this.crouchLatched);
      }
    }
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
      this.aim.set(event.pointerId, gamePoint(event));
    }
    if (action === 'spell') this.input.cast();
    if (action === 'gauntlet') this.input.gauntlet();
    if (action === 'ultimate') this.input.ultimate();
    if (action === 'dash') this.input.dash();
    if (action === 'jump') {
      this.jumpHeld = true;
      this.jumpUntil = performance.now() + JUMP_LATCH_MS;
    }
    if (action === 'sprint') {
      this.sprintLatched = !this.sprintLatched;
      this.buttons.sprint.classList.toggle('on', this.sprintLatched);
    }
    if (action === 'crouch') {
      const point = gamePoint(event);
      this.crouchTap = { id: event.pointerId, at: performance.now(), x: point.x, y: point.y };
    }
    if (action === 'scores') this.input.scoreboardHeld = !this.input.scoreboardHeld;
  }

  #release(action) {
    this.buttons[action]?.classList.remove('pressed');
    if (action === 'attack') this.input.setAttack(false);
    if (action === 'guard') this.input.setGuard(false);
    if (action === 'jump') this.jumpHeld = false;
  }

  #startStick(event, point) {
    // plant the stick under the thumb, far enough from the edges for the whole ring to show
    const margin = TOUCH.stickRadius + 10;
    const x = Math.max(margin, Math.min(this.layer.clientWidth - margin, point.x));
    const y = Math.max(margin, Math.min(this.layer.clientHeight - margin, point.y));
    this.stick = { id: event.pointerId, x, y };
    this.stickBase.style.left = `${x}px`;
    this.stickBase.style.top = `${y}px`;
    this.stickBase.classList.add('held');
    this.#moveStick(event);
  }

  #moveStick(event) {
    const point = gamePoint(event);
    const vector = stickVector(point.x - this.stick.x, point.y - this.stick.y);
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
