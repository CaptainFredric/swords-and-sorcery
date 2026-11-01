import { galeSwipeMode } from '../../shared/src/galeModes.mjs';
import {soFistOperator} from '../../shared/sim/soFistication.mjs';
import { biByeCondition } from '../../shared/sim/biByeComponents.mjs';
import { PreparedSpellSelector, preparedSpellView } from './preparedSpellSelector.mjs';
import { MOVEMENT } from '../../shared/src/movement.mjs';
import { combatActionPolicy } from '../../shared/src/combatActionPolicy.mjs';
import { spellFor } from '../../shared/src/spells.mjs';
import { isDeliberateTap, lookDelta, stickVector, touchLayerPoint, TOUCH } from './touchControlsModel.mjs';
import { screenTurn } from '../ui/screenTurn.mjs';
import { ICONS, iconSvg } from '../ui/icons.mjs';
import { ultimateView } from '../ui/ultimateView.mjs';
import { siegeSkillControlLabel } from '../ui/siegeSkillView.mjs';
import { practiceOverride } from '../../shared/src/practiceRecast.mjs';
import { loadTouchLayout, applyLayoutItem } from './touchLayout.mjs';
import { touchMotionIndicator, TOUCH_MOTION_LABELS } from './touchMotionIndicator.mjs';

// On-screen controls for phones and tablets. They drive the same InputController actions as the mouse and
// keyboard, so the server, prediction and animation see no difference between the two.
//
// Left of STICK_ZONE: a fixed visual movement stick, steered by thumb displacement. Everywhere else: drag to look. Attack and Guard also turn the view
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
  { action: 'practiceTools', label: 'TOOLS' },
  { action: 'interact', label: 'MOUNT' },
  { action: 'deploy', label: 'DEPLOY' },
  { action: 'siegeView', label: 'VIEW' },
  { action: 'siegeWeapon', label: 'UPPER' },
  { action: 'siegeSkill', label: 'SKILL' },
  { action: 'siegeBoth', label: 'BOTH', icon: 'siegeSkill' },
  { action: 'flightRise', label: 'RISE', icon: 'rise' },
  { action: 'flightLower', label: 'LOWER', icon: 'lower' },
];

const svg = (icon) => iconSvg(icon);

// where a finger is in the game's own frame (the game may be lying sideways on a screen that stays upright)
function gamePoint(event, layer) {
  const point = touchLayerPoint(
    event.clientX, event.clientY,
    layer.getBoundingClientRect?.(),
    { width: layer.clientWidth, height: layer.clientHeight },
    screenTurn?.angle ?? 0,
  );
  // A minimal non-DOM test harness has no element rect. Real browsers always provide one.
  return point ?? (screenTurn ? screenTurn.point(event.clientX, event.clientY) : { x: event.clientX, y: event.clientY });
}

export class TouchControls {
  constructor(root, input) {
    this.input = input;
    this.active = false;
    this.stick = null;
    this.look = null;
    this.deniedButtons = new Set();
    this.held = new Map();   // pointerId -> action for held buttons
    this.stickState = { forward: 0, right: 0, sprint: false };
    this.stickSprintRequested = false;
    this.sprintLatched = false;this.chargeHeld=false;
    this.valkyrieTouchLatched = new Map();
    this.flightRiseHeld = false;
    this.flightLowerHeld = false;
    this.flightRiseSources = new Set();
    this.flightLowerSources = new Set();
    this.flightRailPointer = null;
    this.jumpHeld = false;
    this.jumpUntil = 0;
    this.layouts = loadTouchLayout();
    this.previewMode = null;

    this.layer = document.createElement('div');
    this.layer.className = 'touch-controls';
    this.layer.innerHTML = `
      <div class="touch-stick">
        <div class="touch-stick-knob"></div>
        <div class="touch-motion-guide" data-motion="idle" aria-hidden="true">
          <span class="touch-motion-label"></span>
          <div class="touch-motion-well">
            <svg viewBox="0 0 20 13" aria-hidden="true"><path d="M3 10L10 3l7 7"/></svg>
            <svg viewBox="0 0 20 13" aria-hidden="true"><path d="M3 10L10 3l7 7"/></svg>
            <svg viewBox="0 0 20 13" aria-hidden="true"><path d="M3 10L10 3l7 7"/></svg>
          </div>
        </div>
        <div class="touch-flight-rail" role="slider" aria-label="Flight ascent and descent" aria-orientation="vertical" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0" tabindex="-1">
          <span class="touch-flight-rail-arrow" aria-hidden="true">↑</span>
          <span class="touch-flight-rail-thumb" aria-hidden="true"></span>
          <span class="touch-flight-rail-arrow" aria-hidden="true">↓</span>
        </div>
      </div>
      ${BUTTONS.map(({ action, label, icon = action, cooldown }) => `
        <div class="touch-btn touch-${action}" data-action="${action}" role="button" aria-label="${label}">
          ${svg(icon)}<span>${label}</span>${cooldown ? '<i class="touch-cooldown"></i><b class="touch-timer"></b>' : ''}
        </div>`).join('')}`;
    root.append(this.layer);
    this.galeGesture = null;
    this.galeHoldTimer = null;
    this.galeIndicator = document.createElement('div');
    this.galeIndicator.className = 'touch-gale-indicator';
    this.galeIndicator.innerHTML = `
      <div class="touch-gale-capsule touch-gale-burst" data-option="burst">
        <svg viewBox="0 0 16 16" class="gale-chevrons-up"><path d="M3 11l5-5 5 5M3 6l5-5 5 5"/></svg>
        <span>BURST</span>
      </div>
      <div class="touch-gale-label" data-option="label">GALE · BALANCED</div>
      <div class="touch-gale-capsule touch-gale-sustained" data-option="sustained">
        <svg viewBox="0 0 16 16" class="gale-chevrons-down"><path d="M3 5l5 5 5-5M3 10l5 5 5-5"/></svg>
        <span>SUSTAINED</span>
      </div>
    `;
    this.layer.append(this.galeIndicator);
    this.galeBurstCapsule = this.galeIndicator.querySelector('.touch-gale-burst');
    this.galeSustainedCapsule = this.galeIndicator.querySelector('.touch-gale-sustained');
    this.galeModeLabel = this.galeIndicator.querySelector('.touch-gale-label');
    this.preparedFan = document.createElement('div');
    this.preparedFan.className = 'touch-prepared-fan';
    this.preparedFan.hidden = true;
    this.layer.append(this.preparedFan);
    // Opt-in, read-only mobile diagnostics (?touchDebug=1): no control interception.
    // If hardware-specific pointer cancellation persists, screenshots show which
    // boundary lost the input rather than only showing a highlighted joystick.
    this.touchDebug = new URLSearchParams(globalThis.location?.search ?? '').has('touchDebug')
      ? document.createElement('pre') : null;
    this.touchDebugEvent = 'waiting';
    this.touchDebugMoves = 0;
    if (this.touchDebug) {
      this.touchDebug.style.cssText = 'position:absolute;left:42%;bottom:80px;z-index:30;pointer-events:none;'
        + 'background:#080a09dd;color:#bdedb8;border:1px solid #7aa277;padding:7px;'
        + 'font:12px/1.3 monospace;white-space:pre;max-width:55%;user-select:none';
      this.layer.append(this.touchDebug);
    }
    this.stickBase = this.layer.querySelector('.touch-stick');
    this.stickKnob = this.layer.querySelector('.touch-stick-knob');
    this.flightRail = this.layer.querySelector('.touch-flight-rail');
    this.flightRailThumb = this.layer.querySelector('.touch-flight-rail-thumb');
    this.motionGuide = this.layer.querySelector('.touch-motion-guide');
    this.motionLabel = this.layer.querySelector('.touch-motion-label');
    this.buttons = Object.fromEntries(BUTTONS.map(({ action }) => [action, this.layer.querySelector(`[data-action="${action}"]`)]));
    this.cooldowns = BUTTONS.filter((button) => button.cooldown).map(({ action, cooldown }) => ({
      element: this.buttons[action],
      timer: this.buttons[action].querySelector('.touch-timer'),
      ...cooldown,
    }));
    this.buttons.practiceTools.hidden = true;
    this.buttons.practiceTools.setAttribute('aria-label', 'Practice tools');
    if (this.buttons.interact) this.buttons.interact.hidden = true;
    if (this.buttons.deploy) this.buttons.deploy.hidden = true;
    if (this.buttons.siegeView) this.buttons.siegeView.hidden = true;
    if (this.buttons.siegeWeapon) this.buttons.siegeWeapon.hidden = true;
    if (this.buttons.siegeSkill) this.buttons.siegeSkill.hidden = true;
    if (this.buttons.siegeBoth) this.buttons.siegeBoth.hidden = true;
    if (this.buttons.flightRise) this.buttons.flightRise.hidden = true;
    if (this.buttons.flightLower) this.buttons.flightLower.hidden = true;
    this.applyLayout(this.layouts);

    this.layer.addEventListener('pointerdown', this.#down);
    this.layer.addEventListener('pointermove', this.#move);
    this.layer.addEventListener('pointerup', this.#up);
    this.layer.addEventListener('pointercancel', this.#up);
    this.layer.addEventListener('lostpointercapture', this.#up);
    this.layer.addEventListener('contextmenu', (event) => event.preventDefault());
    // Embedded mobile browsers may fail pointer capture when a drag crosses an overlay
    // or browser chrome. Recover movement/end events delivered outside the touch layer.
    this.onWindowStickMove = (event) => {
      if (this.stick?.id === event.pointerId && !this.layer.contains?.(event.target)) this.#moveStick(event);
      if (this.flightRailPointer === event.pointerId && !this.layer.contains?.(event.target)) this.#moveFlightRail(event);
    };
    this.onWindowStickEnd = (event) => {
      if ((this.stick?.id === event.pointerId || this.flightRailPointer === event.pointerId) && !this.layer.contains?.(event.target)) this.#up(event);
    };
    window.addEventListener('pointermove', this.onWindowStickMove, { capture: true });
    window.addEventListener('pointerup', this.onWindowStickEnd, { capture: true });
    window.addEventListener('pointercancel', this.onWindowStickEnd, { capture: true });

    // A cancelled gesture is usually reported by pointercancel/lostpointercapture; leaving
    // the app or rotating it can also strand a captured thumb on some mobile browsers.
    // Android's fullscreen UI can briefly blur a still-visible page as the thumb
    // presses. Do not discard the gesture; pointercancel/lost capture and a genuinely
    // hidden document still end it safely.
    this.onBlur = () => {
      this.touchDebugEvent = document.hidden ? 'blur-hidden' : 'blur-visible';
      if (document.hidden) this.reset();
      else this.#resetFlightRail();
    };
    this.onVisibilityChange = () => {
      this.touchDebugEvent = document.hidden ? 'visibility-hidden' : 'visibility-visible';
      if (document.hidden) this.reset();
    };
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.offScreenTurn = screenTurn?.onChange(() => { this.touchDebugEvent = 'rotation'; this.reset(); });
    // Native orientation can change with ScreenTurn still in auto mode. End the
    // old pointers across that axis change, while keeping small browser resizes live.
    this.orientationQuery = window.matchMedia?.('(orientation: portrait)');
    this.onOrientationChange = () => { this.touchDebugEvent = 'rotation'; this.reset(); };
    this.orientationQuery?.addEventListener('change', this.onOrientationChange);

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

  applyLayout(layouts = this.layouts) {
    this.layouts = layouts;
    const mode = this.previewMode ?? (this.flightMounted ? 'flight' : 'onFoot');
    const layout = mode === 'flight' ? layouts.flight : layouts.onFoot;
    // The motion well is a child of the stick: edited, moved, or mirrored
    // joystick placements carry the feedback with them automatically.
    this.stickBase.classList.toggle('motion-mirrored', Boolean(layout?.stick?.right != null));
    if (layout) {
      for (const [action, placement] of Object.entries(layout)) {
        const element = action === 'stick' ? this.stickBase : this.buttons[action];
        if (element) applyLayoutItem(element, placement);
      }
    }
    if (layouts.opacity !== undefined) {
      this.setCustomOpacity(layouts.opacity);
    }
  }

  setCustomOpacity(opacity) {
    this.layer.style.setProperty('--touch-opacity', String(opacity));
  }

  previewEditMode(mode) {
    this.previewMode = mode;
    this.layer.classList.toggle('touch-flight', mode === 'flight');
    this.layer.classList.toggle('touch-mounted', mode === 'flight');
    if (this.buttons.flightRise) this.buttons.flightRise.hidden = true;
    if (this.buttons.flightLower) this.buttons.flightLower.hidden = true;
    if (this.buttons.siegeWeapon) this.buttons.siegeWeapon.hidden = mode !== 'flight';
    if (this.buttons.siegeSkill) this.buttons.siegeSkill.hidden = mode !== 'flight';
    this.applyLayout(this.layouts);
  }

  // shown and listening only while the player is in the arena (the touch version of pointer lock)
  setActive(active) {
    this.active = Boolean(active);
    this.layer.classList.toggle('active', this.active);
    if (!this.active) this.reset();
  }

  // Shown only in actual Practice sessions, independent of operator/mount state.
  setPracticeToolsAvailable(available) {
    this.buttons.practiceTools.hidden = !available;
  }

  setInspectionFlight(active) {
    if (this.inspectionFlight === Boolean(active)) return;
    this.reset();
    this.inspectionFlight = Boolean(active);
    this.layer.classList.toggle('inspection-flight', this.inspectionFlight);
    this.buttons.jump.querySelector('span').textContent = active ? 'UP' : 'JUMP';
    this.buttons.crouch.querySelector('span').textContent = active ? 'DOWN' : 'CROUCH';
    this.buttons.sprint.querySelector('span').textContent = active ? 'FAST' : 'SPRINT';
    this.buttons.jump.setAttribute('aria-label',active?'Fly up':'JUMP');
    this.buttons.crouch.setAttribute('aria-label',active?'Fly down':'CROUCH');
    this.buttons.sprint.setAttribute('aria-label',active?'Camera fast mode':'SPRINT');
    if(active){this.ramMounted=false;this.layer.classList.remove('touch-mounted','touch-ram');this.#setMotionIndicator('idle');}
  }

  reset() {
    this.#setMotionIndicator('idle');
    this.input.onAimCancelled?.();
    if (this.galeGesture?.mode !== 'balanced' && this.galeGesture) this.input.selectGaleMode?.('balanced');
    this.galeGesture = null;
    this.#hideGaleIndicator();
    this.viewGesture=null;
    this.#cancelPreparedTouch();
    for (const [pointerId, action] of this.held) this.#release(action, pointerId, true);
    this.held.clear();
    this.#resetFlightRail();
    this.flightRiseSources.clear();
    this.flightRiseHeld = false;
    this.flightLowerSources.clear();
    this.flightLowerHeld = false;
    this.input.flightDash?.(false, 'touch');
    this.input.flightUltimate?.(false, 'touch');
    this.input.flightFire?.(false, 'touch');
    if (this.input.flightEjectHeld) this.input.flightEject?.(false, true);
    for (const [id, latched] of this.valkyrieTouchLatched) {
      if (latched.dash) this.input.flightDash?.(false, 'touch');
      if (latched.ultimate) this.input.flightUltimate?.(false, 'touch');
    }
    this.valkyrieTouchLatched.clear();
    this.#endStick();
    if (this.look) this.#gateHeld('look', false, `touch-look:${this.look.id}`, false);
    this.look = null;
    this.sprintLatched = false;this.chargeHeld=false;
    this.crouchLatched = false;
    this.flightCrouchHeld = false;
    this.crouchTap = null;
    this.viewGesture = null;
    this.jumpHeld = false;
    this.jumpUntil = 0;
    this.buttons.sprint.classList.remove('on');
    this.buttons.crouch?.classList.remove('on');
  }

  movement() {
    if (!this.active) {
      this.#showTouchDebug(null);
      return null;
    }
    const moveAllowed = this.#gateHeld('move', Boolean(this.stick), 'touch-stick', false);
    this.stickState.sprint = this.#gateHeld('sprint', this.stickSprintRequested, 'touch-stick', false);
    const moving = Math.abs(this.stickState.forward) + Math.abs(this.stickState.right) > 0;
    const result = {
      forward: moveAllowed ? this.stickState.forward : 0,
      right: moveAllowed ? this.stickState.right : 0,
      jump: this.jumpHeld || (!this.inspectionFlight && !this.flightMounted && performance.now() < this.jumpUntil),
      flightRise: Boolean(this.flightMounted && this.flightRiseHeld),
      flightLower: Boolean(this.flightMounted && this.flightLowerHeld),
      sprint: this.flightMounted ? false : this.ramMounted
        ? Boolean(this.chargeHeld || (moveAllowed && this.stickState.sprint))
        : Boolean(moveAllowed && (this.stickState.sprint || this.#gateHeld('sprint', this.sprintLatched && moving, 'touch-latch', false))),
      crouch: this.inspectionFlight ? Boolean(this.flightCrouchHeld) : this.flightMounted ? false : Boolean(this.crouchLatched),
    };
    this.#showTouchDebug(result);
    return result;
  }

  #showTouchDebug(result) {
    if (!this.touchDebug) return;
    const num = value => Number(value ?? 0).toFixed(2);
    this.touchDebug.textContent =
      `TOUCH ${this.touchDebugEvent} | moves ${this.touchDebugMoves}\n`
      + `active ${Number(this.active)} focus ${Number(Boolean(this.input.touchFocus))} enabled ${Number(Boolean(this.input.enabled))} held ${Number(Boolean(this.stick))}\n`
      + `raw F${num(this.stickState.forward)} R${num(this.stickState.right)} | output F${num(result?.forward)} R${num(result?.right)}`;
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

  update(local, serverNow, { practice = false, snapshot = null } = {}) {
    if (this.inspectionFlight) return;
    if (!local) return;
    this.galeAvailable = local.spell === 'gale' && (practice || (local.spellReadyAt ?? 0) <= serverNow || local.castingSpell === 'gale');
    this.prepared = preparedSpellView(local, serverNow);
    this.input.updatePreparedSpells(local, serverNow);
    if (!this.prepared.visible) this.#cancelPreparedTouch();
    this.layer.classList.toggle('chivalry-prepared', this.prepared.visible);
    this.#showSpell(spellFor(local.spell), !this.prepared.visible && !local.preparedSpellSelected && (local.spellReadyAt ?? 0) - serverNow > 0.01 && !practice);
    if (this.preparedTouch) this.#showPreparedTouch();
    // the Practice Yard: the real cooldown shown, and a mark while the button works anyway
    this.buttons.spell?.classList.toggle('practice', practiceOverride(local, 'spell', serverNow, practice));
    this.buttons.dash?.classList.toggle('practice', practiceOverride(local, 'dash', serverNow, practice));
    for (const { element, timer, key, seconds } of this.cooldowns) {
      if (this.flightMounted && element === this.buttons.dash) {
        element.classList.remove('cooling');
        try { element.style?.removeProperty?.('--cooldown'); } catch {}
        element.style?.setProperty?.('--cooldown', '0');
        if (timer) timer.textContent = '';
        continue;
      }
      const preparedCurrent = key === 'spellReadyAt' && this.prepared.visible ? this.prepared.spells.find((spell) => spell.current) : null;
      const remaining = preparedCurrent?.remaining ?? Math.max(0, (local[key] ?? 0) - serverNow);
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
    this.#showUltimate(local, serverNow, practice);

    // Ballista touch controls (Mount / Dismount / Deploy / Pack)
    if (this.buttons.interact || this.buttons.deploy) {
      const bl = snapshot?.bibyeBallista;
      const bx = bl?.position?.x ?? bl?.x;
      const bz = bl?.position?.z ?? bl?.z;
      const ram=Boolean(local.alive&&local.operatingRamId),flight=Boolean(local.alive&&local.operatingFightFlightId),fb=snapshot?.fightFlight,rb=snapshot?.soFistication,station=rb?soFistOperator(rb):null;
      const nearFlight=local.alive&&fb&&fb.health>0&&!fb.operatorId&&(!fb.team||fb.team===local.team)&&Math.hypot(fb.x-local.position.x,fb.z-local.position.z)<=2.5;
      const nearRam=local.alive&&rb&&rb.health>0&&(!rb.team||rb.team===local.team)&&!rb.operatorId&&Math.hypot(station.x-local.position.x,station.z-local.position.z)<=2.2;
      const mounted = Boolean(local.alive && (local.operatingBallistaId||local.operatingRamId||local.operatingFightFlightId));
      if(this.ramMounted!==undefined&&this.ramMounted!==ram)this.reset();
      if(this.flightMounted!==undefined&&this.flightMounted!==flight){this.reset();this.flightMounted=flight;this.applyLayout(this.layouts);}
      if(!local.alive && (this.valkyrieTouchLatched.size > 0 || this.held.size > 0)) this.reset();
      this.ramMounted=ram;
      this.flightMounted=flight;
      this.layer.classList.toggle('touch-ram',ram);
      this.layer.classList.toggle('touch-flight',flight);
      const airborne = Boolean(flight && !fb?.grounded);
      this.layer.classList.toggle('airborne', airborne);
      if (this.buttons.flightRise) this.buttons.flightRise.hidden = true;
      if (this.buttons.flightLower) this.buttons.flightLower.hidden = true;
      this.buttons.jump.querySelector('span').textContent='JUMP';
      this.buttons.crouch.querySelector('span').textContent='CROUCH';
      this.buttons.sprint.querySelector('span').textContent=ram?'CHARGE':'SPRINT';
      this.mounted=mounted;
      // After mount transitions (which reset held controls), paint the real
      // server-confirmed movement state without a one-frame false idle flash.
      this.#setMotionIndicator(touchMotionIndicator(local, snapshot, {
        active: this.active, inspectionFlight: this.inspectionFlight,
      }));

      if (flight) {
        const atkLabel = this.buttons.attack?.querySelector('span');
        if (atkLabel && atkLabel.textContent !== 'SWORD') atkLabel.textContent = 'SWORD';
        const guardUnavailable = airborne && !combatActionPolicy(local, serverNow).concurrent;
        this.buttons.guard?.classList.toggle('airborne-forbidden', guardUnavailable);
        this.buttons.guard?.setAttribute('aria-disabled',guardUnavailable?'true':'false');
        this.buttons.guard?.setAttribute('aria-label', guardUnavailable ? 'Guard unavailable while airborne' : 'Guard');

        const dashBtn = this.buttons.dash;
        if (dashBtn) {
          const dashGrounded = !airborne;
          const dashNoProwess = (local.prowess ?? 0) <= 0;
          const dashNoRotor = (fb?.rotorHP ?? 0) <= 0;
          const offensiveActive = Boolean(fb?.offensiveRun);
          const valkyriePrep = Boolean(fb?.terminalPrep?.phase === 'holding');
          dashBtn.classList.toggle('flight-grounded', dashGrounded);
          dashBtn.classList.toggle('flight-no-prowess', dashNoProwess);
          dashBtn.classList.toggle('flight-no-rotor', dashNoRotor);
          dashBtn.classList.toggle('flight-dash-active', offensiveActive);
          dashBtn.classList.toggle('valkyrie-prep', valkyriePrep);
          dashBtn.querySelector('span').textContent=dashGrounded?'FLY FIRST':dashNoRotor?'NO ROTOR':dashNoProwess&&!offensiveActive?'NEED METER':'DASH';
          dashBtn.setAttribute('aria-label', valkyriePrep ? 'Hold Dash + Ultimate to commit Valkyrie Dive' : dashGrounded ? 'Dash requires being airborne' : dashNoProwess ? 'Offensive run requires Prowess' : dashNoRotor ? 'Rotor destroyed' : offensiveActive ? 'Offensive Flight Run Active' : 'Hold Dash for Prowess-powered offensive run');
        }

        const valkyrieReady = flight && !fb?.terminalDive && !fb?.terminalDiveSpent && (fb?.rotorHP ?? 0) > 0 && local.ultimate === 'chivalry' && (local.prowess ?? 0) >= 100;
        this.valkyrieEligible = valkyrieReady;
        const uBtn = this.buttons.ultimate;
        if (uBtn) {
          const valkyriePrep = Boolean(fb?.terminalPrep?.phase === 'holding');
          uBtn.classList.toggle('valkyrie-ready', valkyrieReady);
          uBtn.classList.toggle('valkyrie-prep', valkyriePrep);
          if (valkyriePrep) {
            const remaining = Math.max(0, (fb.terminalPrep.until - serverNow)).toFixed(1);
            uBtn.querySelector('span').textContent = `DIVE ${remaining}s`;
            uBtn.setAttribute('aria-label', `Committing Valkyrie Dive: ${remaining}s remaining`);
          }
        }
      } else {
        const atkLabel = this.buttons.attack?.querySelector('span');
        if (atkLabel && atkLabel.textContent !== 'ATTACK') atkLabel.textContent = 'ATTACK';
        this.valkyrieEligible = false;
        this.buttons.guard?.classList.remove('airborne-forbidden');
        this.buttons.dash?.classList.remove('flight-grounded', 'flight-no-prowess', 'flight-no-rotor', 'flight-dash-active', 'valkyrie-prep');
        this.buttons.dash.querySelector('span').textContent='DASH';
        this.buttons.ultimate?.classList.remove('valkyrie-ready', 'valkyrie-prep');
      }

      if(this.buttons.siegeSkill){
        const button=this.buttons.siegeSkill,machine=flight?fb:ram?rb:bl,skill=machine?.skill,remaining=Math.max(0,(skill?.readyAt??0)-serverNow);
        const label=flight?(skill?.phase==='active'?'ACTIVE':remaining>0?Math.ceil(remaining)+'s':'FIRE AWAY'):siegeSkillControlLabel(machine,serverNow);
        button.hidden=!mounted;button.querySelector('span').textContent=label==='II PREPARING'?'II PREP':label==='II RELEASING'?'II RELEASE':label;
        button.setAttribute('aria-label',`${flight?"Fire Away? I'm Right Here":ram?'Beat to the Punch':'Bolt to the Occasion'}: ${skill?.phase==='primed'&&ram?'primed, increasingly unstable':remaining>0&&skill?.phase==='idle'?Math.ceil(remaining)+' seconds cooldown':label}`);
      }
      if(this.buttons.siegeBoth){
        const primed=!ram&&!flight&&mounted&&bl?.skill?.phase==='primed';
        const ready=primed&&bl.mainBoltLoaded!==false&&bl.state==='LOADED'&&
          serverNow+1e-8>=(bl.smallBoltReadyAt??0)&&!bl.upperPending&&!bl.upperQueued&&
          bl.combinedUpperPendingAt==null&&(!bl.coupling||bl.coupling==='INDEPENDENT');
        this.buttons.siegeBoth.hidden=!ready;
        this.buttons.siegeBoth.setAttribute('aria-label','Fire both bolts together, Bolt II first');
      }
      const near = local.alive && bl && local.position && bx !== undefined && !bl.operatorId ? Math.hypot(bx - local.position.x, bz - local.position.z) <= 3.2 : false;
      this.layer.classList.toggle('touch-mounted', mounted);
      if (this.buttons.siegeView) {
        this.buttons.siegeView.hidden=!mounted;
        this.buttons.siegeView.querySelector('span').textContent=ram||flight?'VIEW':'VIEW ↑';
        this.buttons.siegeView.setAttribute('aria-label',ram?'Change ram view':'Tap to change view. Swipe up to zoom ahead of the bow. Tap again to return.');
        if(!mounted)this.viewGesture=null;
      }
      if (this.buttons.siegeWeapon) {
        this.buttons.siegeWeapon.hidden = !mounted || ram || (!flight&&bl?.mode !== 'DEPLOYED');
        const next = flight?'BOLT':bl?.weaponFocus === 'MAIN' ? 'UPPER' : 'MAIN';
        this.buttons.siegeWeapon.querySelector('span').textContent = next;
        this.buttons.siegeWeapon.setAttribute('aria-label',flight?'Hold to fire the left-hand repeating crossbow':`Control ${next.toLowerCase()} launcher${next === 'UPPER' ? ' and cancel alignment' : ''}`);
      }

      if (mounted) {
        if (this.buttons.interact) {
          this.buttons.interact.hidden = false;
          const label = this.buttons.interact.querySelector('span');
          const text = flight ? 'EJECT' : 'LEAVE';
          if (label && label.textContent !== text) label.textContent = text;
          this.buttons.interact.setAttribute('aria-label',flight?'Tap to eject into clear space; hold to brake before ejecting':ram?'Leave ram':'Dismount ballista');
          this.buttons.interact.classList.toggle('terminal-locked', Boolean(fb?.terminalDive));
        }
        if (this.buttons.deploy) {
          this.buttons.deploy.hidden = ram||flight||!biByeCondition(bl).canDeploy;
          const label = this.buttons.deploy.querySelector('span');
          const text = bl?.mode === 'DEPLOYED' ? 'PACK' : 'DEPLOY';
          if (label && label.textContent !== text) label.textContent = text;
        }
      } else if (nearFlight||nearRam||(near && bl?.mode !== 'DESTROYED')) {
        if (this.buttons.interact) {
          this.buttons.interact.hidden = false;
          const label = this.buttons.interact.querySelector('span');
          if (label && label.textContent !== 'MOUNT') label.textContent = 'MOUNT';
          this.buttons.interact.setAttribute('aria-label',nearFlight?'Mount Fight-and-Flight':nearRam?'Operate ram':'Mount ballista');
        }
        if (this.buttons.deploy) this.buttons.deploy.hidden = true;
      } else {
        if (this.buttons.interact) this.buttons.interact.hidden = true;
        if (this.buttons.deploy) this.buttons.deploy.hidden = true;
      }
    }
  }

  #setMotionIndicator(mode) {
    const next = TOUCH_MOTION_LABELS[mode] === undefined ? 'idle' : mode;
    if (this.motionGuide.dataset.motion === next) return;
    this.motionGuide.dataset.motion = next;
    this.motionGuide.classList.toggle('active', next !== 'idle');
    this.stickBase.classList.toggle('motion-active', next !== 'idle');
    this.motionLabel.textContent = TOUCH_MOTION_LABELS[next];
  }

  // the ultimate's button: filling with prowess, glowing when full, lit while it is active
  #showUltimate(local, serverNow, practice = false) {
    const button = this.buttons.ultimate;
    if (!button) return;
    const view = ultimateView(local, serverNow, { practice });
    // (the button is the ultimate carried: its own mark and name)
    if (button.dataset.ultimate !== view.ultimate.id) {
      button.dataset.ultimate = view.ultimate.id;
      const name = (view.ultimate.short ?? view.ultimate.label).toUpperCase();
      button.setAttribute('aria-label', name);
      button.querySelector('svg')?.replaceWith(document.createRange().createContextualFragment(iconSvg(view.ultimate.id, 'sunder')));
    }
    // its name; while a Vortex runs, what it has been steered to (BLADE, FIRE), the button taking that on, and how
    // much of its stretch is left drawn round it
    const word = view.word ?? (view.ultimate.short ?? view.ultimate.label).toUpperCase();
    const label = button.querySelector('span');
    if (label.textContent !== word) label.textContent = word;
    const emphasis = view.emphasis ?? '';
    if ((button.dataset.emphasis ?? '') !== emphasis) button.dataset.emphasis = emphasis;
    button.style.setProperty('--left', view.state === 'active' ? view.charge.toFixed(3) : '0');
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
    button.classList.toggle('coreflagration', spell.id === 'coreflagration');
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
    window.removeEventListener('pointermove', this.onWindowStickMove, { capture: true });
    window.removeEventListener('pointerup', this.onWindowStickEnd, { capture: true });
    window.removeEventListener('pointercancel', this.onWindowStickEnd, { capture: true });
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.offScreenTurn?.();
    this.orientationQuery?.removeEventListener('change', this.onOrientationChange);
    this.layer.remove();
  }

  #down = (event) => {
    this.touchDebugEvent = 'down';
    if (!this.active) return;
    if (event.target.closest?.('.touch-flight-rail') && this.flightMounted) {
      event.preventDefault();
      if (this.flightRailPointer !== null) return;
      try { this.layer.setPointerCapture?.(event.pointerId); } catch {}
      this.flightRailPointer = event.pointerId;
      this.#moveFlightRail(event);
      return;
    }
    const isMouse = event.pointerType === 'mouse';
    const button = event.target.closest?.('[data-action]');
    if (button) {
      event.preventDefault();
      // keep the finger's moves and release even when it slides off its button (the pointer may already be gone)
      try { this.layer.setPointerCapture?.(event.pointerId); } catch { /* released before we could capture it */ }
      this.#press(button.dataset.action, event);
      return;
    }
    if (isMouse) {
      this.input.requestPointerLock?.({ mouse: true });
      const code = `Mouse${event.button ?? 0}`;
      this.input.handleMouseButtonDown?.(code);
      return;
    }
    event.preventDefault();
    // keep the finger's moves and release even when it slides off its button (the pointer may already be gone)
    try { this.layer.setPointerCapture?.(event.pointerId); } catch { /* released before we could capture it */ }
    const point = gamePoint(event, this.layer);
    // The ring is a real touch target. It does not float when pressed; a
    // resized/fullscreen mobile viewport cannot teleport the player's control.
    const onStick = event.target.closest?.('.touch-stick');
    if (onStick || (point.x >= 0 && point.x < this.layer.clientWidth * STICK_ZONE
      && point.y >= 0 && point.y <= this.layer.clientHeight)) {
      // If the browser lost a previous finger's release, a fresh press on the visible
      // ring can reclaim movement instead of leaving the joystick stranded.
      if (onStick && this.stick && this.stick.id !== event.pointerId) this.#endStick();
      if (!this.stick) this.#startStick(event, point);
    } else if (!this.look) {
      this.look = { id: event.pointerId, clientX:event.clientX, clientY:event.clientY };
      this.#gateHeld('look', true, `touch-look:${event.pointerId}`, false);
    }
  };

  #move = (event) => {
    if (this.flightRailPointer === event.pointerId) { this.#moveFlightRail(event); return; }
    if (event.pointerType === 'mouse' && !this.held.has(event.pointerId)) return;
    if(this.viewGesture?.id===event.pointerId){
      const point=gamePoint(event,this.layer),g=this.viewGesture,dx=point.x-g.x,dy=g.y-point.y;
      g.travel=Math.max(g.travel,Math.hypot(dx,dy));
      if(!g.zoomed&&dy>=32&&dy>Math.abs(dx)*1.25){g.zoomed=true;this.input.onAction?.('siegeZoom',true);}
      return;
    }
    if (this.galeGesture?.id === event.pointerId) {
      const point = gamePoint(event, this.layer), g = this.galeGesture;
      const dx = point.x - g.x;
      const dy = point.y - g.y;
      const mode = galeSwipeMode(dx, dy, g.mode);
      if (mode !== g.mode) {
        g.mode = mode;
        this.input.selectGaleMode?.(mode);
      }
      this.#showGaleIndicator(g.mode, dx, dy);
      return;
    }
    if (this.preparedTouch?.id === event.pointerId) {
      const point = gamePoint(event, this.layer);
      const gesture = this.preparedTouch;
      gesture.selector.move(point.x - gesture.x, point.y - gesture.y);
      this.#showPreparedTouch();
      return;
    }
    if (this.stick?.id === event.pointerId) {
      this.#moveStick(event);
      return;
    }
    const looking = this.look?.id === event.pointerId ? this.look : null;
    const held = this.held.get(event.pointerId);
    const aiming = held === 'attack' || held === 'guard' || (held === 'siegeWeapon' && this.flightMounted) ? this.aim?.get(event.pointerId) : null;
    const tracker = looking ?? aiming;
    if (!tracker) return;
    const delta=screenTurn?.vector(event.clientX-tracker.clientX,event.clientY-tracker.clientY)??{x:event.clientX-tracker.clientX,y:event.clientY-tracker.clientY};
    const { yaw, pitch } = lookDelta(delta.x,delta.y);
    tracker.clientX=event.clientX;tracker.clientY=event.clientY;
    if (!this.#gateHeld('look', true, `touch-look:${event.pointerId}`, false)) return;
    const look = this.input.look ?? { touch: 1, invertY: false };
    this.input.turn(yaw * look.touch, pitch * look.touch * (look.invertY ? -1 : 1));
  };

  #up = (event) => {
    this.touchDebugEvent = event.type;
    if (this.flightRailPointer === event.pointerId) this.#resetFlightRail();
    if(event.type!=='pointerup'&&(this.look?.id===event.pointerId||this.viewGesture?.id===event.pointerId||this.aim?.has(event.pointerId)))this.input.onAimCancelled?.();
    if (event.pointerType === 'mouse' && !this.held.has(event.pointerId)) {
      const button = typeof event.button === 'number' && event.button >= 0 ? event.button : 0;
      this.input.handleMouseButtonUp?.(`Mouse${button}`);
      return;
    }
    this.#gateHeld('look', false, `touch-look:${event.pointerId}`, false);
    if (this.galeGesture?.id === event.pointerId) {
      const g = this.galeGesture, point = gamePoint(event, this.layer);
      const mode = event.type === 'pointerup' ? galeSwipeMode(point.x-g.x, point.y-g.y, g.mode) : 'balanced';
      if (mode !== g.mode) this.input.selectGaleMode?.(mode);
      this.galeGesture = null;
      this.#hideGaleIndicator();
      delete this.buttons.spell.dataset.face;
    }
    if (this.preparedTouch?.id === event.pointerId) {
      const point = gamePoint(event, this.layer);
      const gesture = this.preparedTouch;
      const chosen = gesture.selector.move(point.x - gesture.x, point.y - gesture.y);
      this.#cancelPreparedTouch();
      if (event.type === 'pointerup' && chosen) this.input.usePreparedSpell(chosen);
    }
    if (this.stick?.id === event.pointerId) this.#endStick();
    if (this.look?.id === event.pointerId) this.look = null;
    const action = this.held.get(event.pointerId);
    if(action==='siegeView'&&this.viewGesture?.id===event.pointerId){
      const g=this.viewGesture;this.viewGesture=null;
      if(event.type==='pointerup'&&!g.zoomed&&g.travel<18&&this.input.enabled)this.input.onAction?.('siegeView',true);
    }
    // crouch toggles only for a deliberate tap: pressed on the button and lifted soon after, without sliding off it (a
    // finger passing over it while steering or looking belongs to the stick or the view, and never reaches it at all)
    if (action === 'crouch' && !this.flightMounted && !this.inspectionFlight && this.crouchTap?.id === event.pointerId) {
      const point = gamePoint(event, this.layer);
      const tap = this.crouchTap;
      this.crouchTap = null;
      if (isDeliberateTap(tap, { at: performance.now(), x: point.x, y: point.y, lifted: event.type === 'pointerup' })) {
        this.crouchLatched = !this.crouchLatched;
        this.buttons.crouch.classList.toggle('on', this.crouchLatched);
      }
    }
    if (action) {
      const denied=this.deniedButtons.has(event.pointerId);
      this.held.delete(event.pointerId);
      this.aim?.delete(event.pointerId);
      this.#release(action, event.pointerId, event.type !== 'pointerup');
      // the menu opens on release, so the lifting finger cannot land on the arena and re-enter it
      if (action === 'pause' && event.type === 'pointerup' && !denied) {
        // MENU previously just dropped touch focus without opening the dialog.
        this.input.onAction?.('pause',true);
        this.input.releaseFocus();
      }
      if (action === 'practiceTools' && event.type === 'pointerup' && !denied && !this.buttons.practiceTools.hidden) {
        // The lifting finger cannot press the arena under the newly opened panel.
        this.input.onAction?.('practiceTools', true);
        this.input.releaseFocus();
      }
    }
  };

  #gateHeld(action, requested, source, notify = true) {
    if (this.input.gateHeldAction) return this.input.gateHeldAction(action, requested, source, notify);
    return requested && this.input.allowAction?.(action, notify) !== false;
  }

  #press(action, event) {
    this.held.set(event.pointerId, action);
    if (action === 'attack' || action === 'guard' || (action === 'siegeWeapon' && this.flightMounted)) {
      this.aim ??= new Map();
      this.aim.set(event.pointerId, {clientX:event.clientX,clientY:event.clientY});
      this.#gateHeld('look', true, `touch-look:${event.pointerId}`, false);
    }
    if (!this.#gateHeld(action, true, `touch-button:${event.pointerId}`)) {
      this.deniedButtons.add(event.pointerId);
      return;
    }
    const element = this.buttons[action];
    element?.classList.add('pressed');
    if (action === 'attack') this.input.setAttack(true, `touch:${event.pointerId}`);
    if (action === 'guard') this.input.setGuard(true, `touch:${event.pointerId}`);
    if (action === 'flightRise') {
      this.flightRiseSources.add(event.pointerId);
      this.flightRiseHeld = true;
    }
    if (action === 'flightLower') {
      this.flightLowerSources.add(event.pointerId);
      this.flightLowerHeld = true;
    }
    if (action === 'spell') {
      if (this.galeAvailable && !this.prepared?.visible) {
        this.galeGesture = { id: event.pointerId, ...gamePoint(event, this.layer), mode: 'balanced' };
        this.input.cast();
        this.galeHoldTimer = setTimeout(() => {
          if (this.galeGesture) this.#showGaleIndicator(this.galeGesture.mode, 0, 0);
        }, 80);
      } else if (this.prepared?.visible) {
        if (!this.preparedTouch) {
          const point = gamePoint(event, this.layer);
          this.preparedTouch = { id: event.pointerId, ...point, selector: new PreparedSpellSelector(this.prepared.spells.map((spell) => spell.id), this.prepared.current, { touch: true }) };
          this.#showPreparedTouch();
        }
      } else this.input.cast();
    }
    if (action === 'gauntlet') this.input.gauntlet();
    if (action === 'ultimate') {
      if (this.input.mountedFlight || this.flightMounted) {
        this.input.flightUltimate?.(true, `touch:${event.pointerId}`);
      } else this.input.ultimate();
    }
    if (action === 'dash') {
      if (this.input.mountedFlight || this.flightMounted) this.input.flightDash(true, `touch:${event.pointerId}`);
      else this.input.dash();
    }
    if (action === 'jump') {
      if (this.input.mountedFlight || this.flightMounted) {
        this.input.flightHop?.();
      } else {
        this.jumpHeld = true;
        this.jumpUntil = performance.now() + JUMP_LATCH_MS;
      }
    }
    if (action === 'sprint'&&this.ramMounted){this.chargeHeld=true;return;}
    if (action === 'sprint') {
      this.sprintLatched = !this.sprintLatched;
      if (!this.sprintLatched) this.#gateHeld('sprint', false, 'touch-latch');
      this.buttons.sprint.classList.toggle('on', this.sprintLatched);
    }
    if (action === 'crouch' && (this.inspectionFlight || this.flightMounted)) { this.flightCrouchHeld=true; return; }
    if (action === 'crouch') {
      const point = gamePoint(event, this.layer);
      this.crouchTap = { id: event.pointerId, at: performance.now(), x: point.x, y: point.y };
    }
    if (action === 'scores') this.input.scoreboardHeld = !this.input.scoreboardHeld;
    if (action === 'interact') {if(this.input.mountedFlight)this.input.flightEject?.(true);else this.input.interact?.();}
    if (action === 'deploy') this.input.deploy?.();
    if (action === 'siegeWeapon') {if(this.input.mountedFlight)this.input.flightFire(true,`touch:${event.pointerId}`);else this.input.siegeWeapon?.();}
    if (action === 'siegeSkill') this.input.siegeSkill?.();
    if (action === 'siegeBoth') this.input.siegeBoth?.();
    if(action==='siegeView'&&this.input.enabled)this.viewGesture={id:event.pointerId,...gamePoint(event,this.layer),travel:0,zoomed:false};
  }

  #release(action, pointerId, cancelled=false) {
    if (action === 'attack' || action === 'guard' || (action === 'siegeWeapon' && this.flightMounted)) this.#gateHeld('look', false, `touch-look:${pointerId}`, false);
    this.#gateHeld(action, false, `touch-button:${pointerId}`);
    if (this.deniedButtons.delete(pointerId)) return;
    this.buttons[action]?.classList.remove('pressed');
    if (action === 'interact' && this.input.flightEjectHeld)this.input.flightEject?.(false,cancelled);
    if (action === 'attack') this.input.setAttack(false, `touch:${pointerId}`);
    if (action === 'guard') this.input.setGuard(false, `touch:${pointerId}`);
    if (action === 'flightRise') {
      this.flightRiseSources.delete(pointerId);
      this.flightRiseHeld = this.flightRiseSources.size > 0;
    }
    if (action === 'flightLower') {
      this.flightLowerSources.delete(pointerId);
      this.flightLowerHeld = this.flightLowerSources.size > 0;
    }
    if (action === 'siegeWeapon' && this.input.mountedFlight) this.input.flightFire(false, `touch:${pointerId}`);
    if (action === 'dash' && (this.input.mountedFlight || this.flightMounted)) this.input.flightDash(false, `touch:${pointerId}`);
    if (action === 'ultimate') {
      if (this.input.mountedFlight || this.flightMounted) {
        this.input.flightUltimate?.(false, `touch:${pointerId}`);
      }
    }
    if (action === 'jump') this.jumpHeld = false;
    if(action==='crouch'&&(this.inspectionFlight || this.flightMounted))this.flightCrouchHeld=[...this.held].some(([id,held])=>id!==pointerId&&held==='crouch'&&!this.deniedButtons.has(id));
    if(action==='sprint')this.chargeHeld=[...this.held].some(([id,held])=>id!==pointerId&&held==='sprint'&&!this.deniedButtons.has(id));
  }

  #showGaleIndicator(mode = 'balanced', dx = 0, dy = 0) {
    if (!this.galeIndicator || this.prepared?.visible) return;
    this.galeIndicator.classList.add('active');
    if (this.galeModeLabel) {
      this.galeModeLabel.textContent = `GALE · ${mode.toUpperCase()}`;
    }
    const burstProgress = Math.min(1, Math.max(0, -dy / 28));
    const sustainedProgress = Math.min(1, Math.max(0, dy / 28));
    const burstSelected = mode === 'burst';
    const sustainedSelected = mode === 'sustained';
    if (this.galeBurstCapsule) {
      this.galeBurstCapsule.classList.toggle('selected', burstSelected);
      this.galeBurstCapsule.style.opacity = burstSelected ? '' : String(0.45 + 0.5 * burstProgress);
    }
    if (this.galeSustainedCapsule) {
      this.galeSustainedCapsule.classList.toggle('selected', sustainedSelected);
      this.galeSustainedCapsule.style.opacity = sustainedSelected ? '' : String(0.45 + 0.5 * sustainedProgress);
    }
  }

  #hideGaleIndicator() {
    if (this.galeHoldTimer) {
      clearTimeout(this.galeHoldTimer);
      this.galeHoldTimer = null;
    }
    if (this.galeIndicator) {
      this.galeIndicator.classList.remove('active');
      this.galeBurstCapsule?.classList.remove('selected');
      this.galeSustainedCapsule?.classList.remove('selected');
      if (this.galeBurstCapsule) this.galeBurstCapsule.style.opacity = '';
      if (this.galeSustainedCapsule) this.galeSustainedCapsule.style.opacity = '';
    }
  }

  #cancelPreparedTouch() {
    this.preparedTouch = null;
    if (this.preparedFan) this.preparedFan.hidden = true;
    this.buttons?.spell?.classList.remove('prepared-highlighted');
  }

  #showPreparedTouch() {
    const gesture = this.preparedTouch;
    if (!gesture) return;
    this.preparedFan.hidden = false;
    this.preparedFan.style.left = `${gesture.x}px`;
    this.preparedFan.style.top = `${gesture.y}px`;
    this.preparedFan.innerHTML = gesture.selector.slots.slice(1).map((slot) => {
      const entry = this.prepared.spells.find((spell) => spell.id === slot.id);
      const state = entry.available ? 'READY' : this.prepared.phase === 'startup' ? 'PRESELECT' : entry.remaining > 0.01 ? `${entry.remaining.toFixed(1)}s` : 'GATHER';
      return `<div data-spell="${slot.id}" class="touch-prepared-slot ${slot.id === gesture.selector.highlight ? 'highlighted' : ''} ${entry.available ? '' : 'cooling'}" style="left:${slot.x}px;top:${slot.y}px">${iconSvg(slot.id)}<span>${entry.spell.short ?? entry.spell.label}</span><b>${state}</b></div>`;
    }).join('');
    this.buttons.spell.classList.toggle('prepared-highlighted', gesture.selector.highlight === this.prepared.current);
  }

  #moveFlightRail(event) {
    if (this.flightRailPointer !== event.pointerId || !this.flightMounted) return;
    // The control's own frame works on portrait-locked rotated screens too.
    const height = this.flightRail.offsetHeight || 132;
    const point = touchLayerPoint(event.clientX, event.clientY,
      this.flightRail.getBoundingClientRect?.(), {width:this.flightRail.offsetWidth || 44, height},
      screenTurn?.angle ?? 0);
    if (!point) return;
    const value = Math.max(-1, Math.min(1, (height * .5 - point.y) / (height * .5 - 14)));
    const intent = Math.abs(value) < .24 ? 'neutral' : value > 0 ? 'rise' : 'lower';
    this.flightRiseHeld = intent === 'rise';
    this.flightLowerHeld = intent === 'lower';
    this.flightRail.dataset.intent = intent;
    this.flightRail.setAttribute('aria-valuenow', String(intent === 'rise' ? 1 : intent === 'lower' ? -1 : 0));
    this.flightRailThumb.style.transform = `translateY(calc(-50% + ${(-value * (height * .5 - 21)).toFixed(1)}px))`;
  }

  #resetFlightRail() {
    this.flightRailPointer = null;
    this.flightRiseSources.clear();
    this.flightLowerSources.clear();
    this.flightRiseHeld = false;
    this.flightLowerHeld = false;
    if (this.flightRail) {
      this.flightRail.dataset.intent = 'neutral';
      this.flightRail.setAttribute('aria-valuenow', '0');
    }
    if (this.flightRailThumb) this.flightRailThumb.style.transform = '';
  }

  #startStick(event, point) {
    // The joystick's outer ring stays anchored in the lower left. Never write its CSS
    // left/top from touch-layer dimensions: on mobile fullscreen/resize transitions
    // they can be stale and clamp both axes to the upper-left minimum (66, 66).
    // Capture the starting screen point; only *relative* thumb movement steers.
    this.stick = {
      id: event.pointerId,
      x: point.x, y: point.y,
      clientX: event.clientX, clientY: event.clientY,
    };
    this.#gateHeld('move', true, 'touch-stick');
    this.stickBase.classList.add('held');
    this.#moveStick(event);
  }

  #moveStick(event) {
    this.touchDebugEvent = 'pointermove';
    this.touchDebugMoves += 1;
    // Use client-space deltas rather than gamePoint()/getBoundingClientRect() for
    // steering. The latter is useful for picking a touch zone, but a fullscreen
    // resize or transformed mobile shell can change its dimensions mid-gesture.
    const dx = event.clientX - this.stick.clientX;
    const dy = event.clientY - this.stick.clientY;
    const delta = screenTurn?.vector(dx, dy) ?? { x: dx, y: dy };
    const vector = stickVector(delta.x, delta.y, {deadZone:this.mounted?.06:TOUCH.deadZone, sprintActive:this.stickSprintRequested});
    this.stickSprintRequested = !this.flightMounted && vector.sprint;
    // The detent physically travels up the cavity as the joystick is pushed.
    // Its position represents thumb intent; the arrows/label show confirmed action.
    const forwardPush = !this.flightMounted ? Math.max(0, Math.min(1, -vector.knob.y / TOUCH.stickRadius)) : 0;
    this.motionGuide.style.setProperty('--motion-push', forwardPush.toFixed(3));
    this.motionGuide.classList.toggle('forward', forwardPush > .2);
    this.motionGuide.classList.toggle('approaching', !this.flightMounted && vector.magnitude >= .78 && vector.forward >= .55);
    this.#gateHeld('move', true, 'touch-stick', false);
    const sprint = this.#gateHeld('sprint', this.stickSprintRequested, 'touch-stick');
    this.stickState = { forward: vector.forward, right: vector.right, sprint };
    this.stickKnob.style.transform = `translate(${vector.knob.x}px, ${vector.knob.y}px)`;
    this.stickBase.classList.toggle('sprint', sprint);
  }

  #endStick() {
    this.stick = null;
    this.#gateHeld('move', false, 'touch-stick', false);
    this.stickSprintRequested = false;
    this.#gateHeld('sprint', false, 'touch-stick');
    this.#gateHeld('sprint', false, 'touch-latch');
    this.stickState = { forward: 0, right: 0, sprint: false };
    this.stickBase.classList.remove('held', 'sprint');
    this.motionGuide.classList.remove('approaching', 'forward');
    this.motionGuide.style.setProperty('--motion-push', '0');
    this.stickKnob.style.transform = '';
    // the sprint toggle lasts until the thumb lets go of the stick
    if (this.sprintLatched) {
      this.sprintLatched = false;
      this.buttons.sprint.classList.remove('on');
    }
  }
}
