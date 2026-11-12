import { recordArenaKey, releaseHeldInputs } from './inputRelease.mjs';
import { PREPARED_HOLD_MS, preparedSpellView } from './preparedSpellSelector.mjs';
import { registry } from '../settings/settingsRegistry.mjs';

// what pressing and letting go of each action does (held movement keys are read by movement() instead); any other
// action, such as an ability added later, reaches onAction(action, pressed)
const PRESS = {
  attack: (input) => input.setAttack(true),
  guard: (input) => input.setGuard(true),
  spell: (input) => input.cast(),
  dash: (input) => input.dash(),
  gauntlet: (input) => input.gauntlet(),
  interact: (input) => input.interact(),
  deploy: (input) => input.deploy(),
  siegeSkill: (input) => input.siegeSkill(),
  siegeWeapon: (input) => input.siegeWeapon(),
  technique: (input) => input.technique(true,'binding'),
  scoreboard: (input) => { input.scoreboardHeld = true; },
};
const RELEASE = {
  attack: (input) => input.setAttack(false),
  guard: (input) => input.setGuard(false),
  scoreboard: (input) => { input.scoreboardHeld = false; },
  technique: (input) => input.technique(false,'binding'),
};
const HELD = new Set(['forward', 'back', 'left', 'right', 'jump', 'sprint']);
const MOVE_ACTIONS = new Set(['forward', 'back', 'left', 'right']);
const GATED_ACTIONS = new Set([...MOVE_ACTIONS, 'sprint', 'attack', 'guard', 'jump', 'crouch', 'spell', 'dash', 'gauntlet', 'ultimate', 'technique']);
// the menus handle these themselves (they work outside the arena too)
const MENU_ACTIONS = new Set(['toggleSound', 'toggleMusic']);

export class InputController {
  constructor(element, socket, {
    setTimer = (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    clearTimer = (timer) => globalThis.clearTimeout(timer),
  } = {}) {
    this.element = element;
    this.socket = socket;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.attackSources = new Set();
    this.guardSources = new Set();
    this.techniqueSources = new Set();
    this.ultimateSources = new Set();
    this.ultimateGesture = null;
    this.oneHitWaveId = null;
    this.oneHitAimUntil = null;
    this.prepared = { visible: false };
    this.preparedGesture = null;
    this.preparedConsumedKeys = new Set();
    this.pendingPreparedSelection = null;
    this.spellOnly = false;
    this.onPreparedSelector = () => {};
    this.keys = new Set();
    this.blockedKeys = new Set();
    this.blockedHolds = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.disasterThreeDAim = false;
    this.pointerLocked = false;
    this.mouseLookBlocked = false;
    this.mountedBallista = false;
    // Right mouse is a hydraulic pitch modifier only while operating the ram.
    this.ramPitchModifierHeld = false;
    this._mountedFlight = false;
    this.flightFireSources = new Set();
    this.flightDashSources = new Set();
    this.flightUltimateSources=new Set();
    this.flightEjectHeld=false;
    this.ballistaSkillPhase = 'idle';
    this.attackHeld = false;
    this.guardHeld = false;
    this.scoreboardHeld = false;
    this.debugVisible = false;
    this.enabled = false;
    this.suspended = false;
    // TouchControls on phones and tablets; there is no pointer lock there, so entering the arena sets touchFocus
    this.touch = null;
    this.touchFocus = false;
    this.onAttackLocal = () => {};
    this.onGuardLocal = () => {};
    this.onCastLocal = () => {};
    this.onGaleModeLocal = () => false;
    this.onGauntletLocal = () => {};
    this.onDashLocal = () => {};
    this.onMarkLocal = () => {};
    this.onPointer = () => {};
    this.onAction = () => {};
    this.onAimCancelled = () => {};
    // look speed (multipliers) and the key bindings, from the settings
    this.look = { mouse: 1, touch: 1, ram: .65, invertY: false };
    this.aimGain = 1;
    this.bindings = registry.defaultBindings();
    this.#index();

    this.#bind();
  }

  get mountedFlight() { return this._mountedFlight; }
  set mountedFlight(value) {
    const next = Boolean(value);
    if (this._mountedFlight !== next) {
      if (this._mountedFlight && !next) {
        this.flightFire(false, 'mouse');
        this.flightFire(false, 'key');
        this.flightFire(false, 'touch');
        this.flightDash(false, 'key');
        this.flightDash(false, 'touch');
        this.flightUltimate(false, 'key');
        this.flightUltimate(false, 'touch');
        this.flightEject(false,true);
        this.setAttack(false, 'mouse');
      }
      this._mountedFlight = next;
    }
  }

  /** Settings: { mouse, touch, invertY, bindings: { action: [codes] } }. */
  configure({ mouse = this.look.mouse, touch = this.look.touch, invertY = this.look.invertY, ram = this.look.ram, bindings = this.bindings } = {}) {
    this.releaseInputs();
    this.look = { mouse, touch, ram, invertY: Boolean(invertY) };
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
    if(this.mountedFlight&&action==='interact'){this.flightEject(true);return;}
    if(this.mountedFlight&&action==='siegeWeapon'){this.flightFire(true,'key');return;}
    if(action==='siegeWeapon'&&!this.mountedFlight&&!this.mountedRam&&!this.mountedBallista){this.technique(true,'KeyX');return;}
    if(this.mountedFlight&&action==='dash'){this.flightDash(true,'key');return;}
    // On SO-FIST-ICATION, E is hydraulic Raise, not the on-foot Dash press.
    if(this.mountedRam&&action==='dash')return;
    if(this.mountedFlight&&action==='ultimate'){this.flightUltimate(true,'key');return;}
    if (action === 'guard') this.setGuard(this.held('guard'), 'desktop');
    else if (action === 'attack') this.setAttack(this.held('attack'), 'desktop');
    else if (action === 'ultimate') this.ultimate(code);
    else if (action === 'spell' && this.prepared.visible) this.beginPreparedGesture();
    else if (PRESS[action]) PRESS[action](this);
    else if (!RELEASE[action]) this.onAction(action, true);
  }

  #release(code) {
    const action = this.actionOf.get(code);
    if (HELD.has(action) && !this.held(action)) this.gateHeldAction(action, false, 'desktop');
    if (!action || HELD.has(action) || MENU_ACTIONS.has(action)) return;
    if(action==='interact'&&this.flightEjectHeld){this.flightEject(false);return;}
    if(this.mountedFlight&&action==='siegeWeapon'){this.flightFire(false,'key');return;}
    if(action==='siegeWeapon'&&!this.mountedFlight&&!this.mountedRam&&!this.mountedBallista){this.technique(false,'KeyX');return;}
    if(this.mountedFlight&&action==='dash'){this.flightDash(false,'key');return;}
    if(this.mountedFlight&&action==='ultimate'){this.flightUltimate(false,'key');return;}
    if (action === 'guard') this.setGuard(this.held('guard'), 'desktop');
    else if (action === 'attack') this.setAttack(this.held('attack'), 'desktop');
    else if (action === 'spell') { if (!this.held('spell')) this.finishPreparedGesture(); }
    else if (action === 'ultimate') {
      // A keyup can arrive after Chrome drops the lock but before its change event.
      this.ultimateRelease(code, !this.touchFocus && document.pointerLockElement !== this.element);
    }
    else if (RELEASE[action]) RELEASE[action](this);
    else if (!PRESS[action]) this.onAction(action, false);
  }

  // a listener for as long as this controller lives (dispose() takes every one off again)
  #listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    (this.listeners ??= []).push([target, type, handler, options]);
  }

  /** Done with: every listener it put on the page taken off (a match put away). */
  dispose() {
    this.releaseInputs();
    for (const [target, type, handler, options] of this.listeners ?? []) target.removeEventListener(type, handler, options);
    this.listeners = [];
    this.enabled = false;
  }

  #bind() {
    this.#listen(document, 'pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.element;
      if (this.pointerLocked) {
        this.#setEnabled(true);
      } else if (!this.touchFocus) {
        this.#setEnabled(false);
      }
    });

    // An Android fullscreen/permission overlay may blur the window without hiding it.
    // Cancelling touch holds on that transient blur made the joystick light briefly,
    // then return to neutral. Pointer cancellation and document visibility still
    // release touch input when the gesture really ends or the page is backgrounded.
    this.#listen(window, 'blur', () => {
      if (!this.touchFocus || document.hidden) this.releaseInputs();
    });
    this.#listen(document, 'visibilitychange', () => {
      if (!document.hidden) return;
      this.releaseInputs();
      // leaving the app counts as leaving the arena, like losing pointer lock
      if (this.touchFocus) this.#setTouchFocus(false);
    });

    this.#listen(this.element, 'click', () => this.requestPointerLock());
    this.#listen(this.element, 'pointerdown', () => this.requestPointerLock());

    this.#listen(document, 'mousemove', (event) => {
      if (!this.pointerLocked) return;
      if (!this.allowAction) this.mouseLookBlocked = false;
      else if (this.allowAction('look', false) === false) { this.mouseLookBlocked = true; return; }
      // The first event after Look opens can contain motion from before the permission changed.
      if (this.mouseLookBlocked) { this.mouseLookBlocked = false; return; }
      const invert = this.look.invertY ? -1 : 1;
      this.turn(-event.movementX * 0.00235 * this.look.mouse, -event.movementY * 0.0021 * this.look.mouse * invert);
    });

    this.#listen(document, 'keydown', (event) => {
      if (event.code === 'Escape') this.cancelPreparedGesture();
      if (this.preparedConsumedKeys.has(event.code)) { event.preventDefault(); return; }
      const slot = /^(?:Digit|Numpad)([123])$/.exec(event.code)?.[1];
      // a number chooses while Q is held, or once a short hold has opened the choice (it stays open after Q is let go)
      const choosing = this.preparedGesture && (this.held('spell') || this.preparedGesture.shown);
      if (this.enabled && choosing && slot && !event.repeat && !this.keys.has(event.code)) {
        event.preventDefault();
        if (this.allowAction?.('spell') === false) return;
        this.preparedConsumedKeys.add(event.code);
        this.pendingPreparedSelection = this.prepared.spells[Number(slot) - 1]?.id;
        if (this.prepared.phase === 'startup') this.socket.selectPreparedSlot(Number(slot));
        else {
          this.socket.castPreparedSlot(Number(slot), this.lookDirection(), { yaw: this.yaw, pitch: this.pitch });
          const chosen = this.prepared.spells[Number(slot) - 1];
          if (chosen?.available) this.onCastLocal({ spell: chosen.id, prepared: true });
        }
        this.cancelPreparedGesture();
        return;
      }
      const action = this.actionOf.get(event.code);
      if (this.enabled && action) {
        event.preventDefault();
        if (this.blockedKeys.has(event.code)) return;
        const onFootX=action==='siegeWeapon'&&!this.mountedBallista&&!this.mountedRam&&!this.mountedFlight;
        if (this.allowAction?.(onFootX?'technique':MOVE_ACTIONS.has(action)?'move':action, !event.repeat) === false) {
          this.blockedKeys.add(event.code); return;
        }
      }
      if (!recordArenaKey(this.keys, event.code, this.enabled)) return;
      if (event.code === 'KeyV' && !event.repeat && this.enabled && !this.suspended) {
        event.preventDefault();
        this.socket.markTarget?.();
        this.onMarkLocal();
        return;
      }
      // a bound key belongs to the game while in the arena (Space would scroll, Tab would move focus)
      if (action) event.preventDefault();
      if(action==='siegeView'&&event.shiftKey&&this.enabled){if(!event.repeat)this.onAction('siegeZoom',true);return;}
      this.#press(event.code, event.repeat);
      if (event.code === 'F3' && !event.repeat) {
        event.preventDefault();
        this.debugVisible = !this.debugVisible;
      }
    });

    this.#listen(document, 'wheel', event => {
      if (!event.deltaY || event.target?.closest?.('input, select, textarea, [role=dialog]')) return;
      if (this.selectGaleMode(event.deltaY < 0 ? 'burst' : 'sustained')) event.preventDefault();
    }, { passive: false });

    this.#listen(document, 'keyup', (event) => {
      this.blockedKeys.delete(event.code);
      if (this.preparedConsumedKeys.delete(event.code)) { event.preventDefault(); return; }
      if (!this.keys.delete(event.code)) return;
      this.#release(event.code);
    });

    // mouse buttons are bindings like keys: Mouse0 is the left button, Mouse2 the right
    this.#listen(document, 'mousedown', (event) => {
      // A focused touch arena can coexist with menus and Inspection controls.
      // Their compatibility mouse clicks must never become a sword press.
      if (event.sourceCapabilities?.firesTouchEvents || event.target?.closest?.('button, input, select, textarea, summary, a, [role=dialog]')) return;
      if (!this.enabled && !this.pointerLocked) return;
      if(this.actionOf.get('Mouse'+event.button))event.preventDefault();
      this.handleMouseButtonDown(`Mouse${event.button}`);
    });
    // Chrome may interpret auxiliary Mouse4 clicks as navigation unless the
    // on-foot action consumes the auxiliary click, not only mousedown.
    this.#listen(document,'auxclick',event=>{
      if(this.enabled&&this.actionOf.get('Mouse'+event.button))event.preventDefault();
    });

    this.#listen(document, 'mouseup', (event) => {
      this.handleMouseButtonUp(`Mouse${event.button}`);
    });
    this.#listen(document, 'contextmenu', (event) => event.preventDefault());
  }

  handleMouseButtonDown(code) {
    if (!this.enabled && !this.pointerLocked) return;
    if(this.mountedFlight){
      if(code==='Mouse0'){this.flightFire(true,'mouse');return;}
      if(code==='Mouse2'){this.setAttack(true,'mouse');return;}
    }
    if(this.mountedBallista&&(code==='Mouse0'||code==='Mouse2')){
      this.#ballistaMouseDown(code);return;
    }
    if(this.mountedRam&&code==='Mouse2'){
      this.ramPitchModifierHeld=true;return;
    }
    if (this.blockedKeys.has(code)) return;
    const action = this.actionOf.get(code);
    if (action && this.allowAction?.(MOVE_ACTIONS.has(action) ? 'move' : action) === false) {
      this.blockedKeys.add(code);
      return;
    }
    this.keys.add(code);
    this.#press(code);
  }

  handleMouseButtonUp(code) {
    if(this.mountedFlight){
      if(code==='Mouse0'){this.flightFire(false,'mouse');return;}
      if(code==='Mouse2'){this.setAttack(false,'mouse');return;}
    }
    if(this.mountedBallista&&(code==='Mouse0'||code==='Mouse2')){
      this.#ballistaMouseUp(code);return;
    }
    if(code==='Mouse2'&&this.ramPitchModifierHeld){
      this.ramPitchModifierHeld=false;return;
    }
    this.blockedKeys.delete(code);
    if (!this.keys.delete(code)) return;
    this.#release(code);
  }

  // Mouse buttons are independent edge-triggered weapon requests. U is
  // the Skill activation; RMB must never secretly prime it or wait for a chord.
  #ballistaMouseDown(code){
    if(this.keys.has(code))return;
    this.keys.add(code);
    if(code==='Mouse0')this.setAttack(true,'desktop');
    else if(this.allowAction?.('siegeSkill')!==false)this.socket?.send?.({type:'bibyeHeavyFire',yaw:this.yaw,pitch:this.pitch,
      ...(this.siegeTarget?{siegeTarget:{...this.siegeTarget}}:{})});
  }

  #ballistaMouseUp(code){
    this.blockedKeys.delete(code);
    if(!this.keys.delete(code))return;
    if(code==='Mouse0')this.setAttack(false,'desktop');
  }

  #setEnabled(enabled) {
    this.enabled = enabled;
    this.onPointer(this.enabled);
    if (!this.enabled) this.releaseInputs();
  }

  #setTouchFocus(focused) {
    if (this.touchFocus === focused) return;
    this.touchFocus = focused;
    this.touch?.setActive(focused);
    // Entering touch focus must not launch Android's fullscreen/pointer-lock UI.
    // ScreenTurn's explicit PLAY SIDEWAYS control owns optional immersive mode.
    this.#setEnabled(focused);
  }

  // enter the arena: pointer lock with a mouse, the on-screen controls on a touch device
  requestPointerLock({ mouse = false } = {}) {
    if (this.suspended) return;
    if (this.touch && !mouse) {
      this.#setTouchFocus(true);
      return; // Mobile touch needs neither browser pointer lock nor forced fullscreen.
    }
    if (!this.pointerLocked && typeof this.element.requestPointerLock === 'function') {
      try {
        const promise = this.element.requestPointerLock();
        promise?.catch?.(() => {});
      } catch {
        /* pointer lock not allowed or unavailable */
      }
    }
  }

  releaseFocus() {
    if (this.pointerLocked) document.exitPointerLock?.();
    if (this.touchFocus) this.#setTouchFocus(false);
  }

  turn(yawDelta, pitchDelta) {
    if (!this.enabled) return;
    if (this.allowAction?.('look', false) === false) { this.mouseLookBlocked = true; return; }
    const gain=(this.mountedRam?this.look.ram:1)*this.aimGain;
    this.yaw += yawDelta*gain;
    // Most combat keeps its original camera comfort limits. Only a held
    // Full-Lightning + Full-Gale teleport admits a truly vertical destination.
    const pitchLimit=this.disasterThreeDAim ? Math.PI/2 : 1.45;
    this.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.pitch + pitchDelta*gain));
  }

  /** A denied held source must release before it may request the newly available action. */
  gateHeldAction(action, requested, source = 'default', notify = true) {
    const key = `${action}:${source}`;
    if (!requested) { this.blockedHolds.delete(key); return false; }
    if (this.blockedHolds.has(key)) return false;
    if (this.allowAction?.(action, notify) === false) { this.blockedHolds.add(key); return false; }
    return true;
  }

  // An authored head start suspends already taught travel; it is not another WALK lesson.
  resumeHeldMovement() {
    for (const code of this.blockedKeys) {
      const action = this.actionOf.get(code);
      if (MOVE_ACTIONS.has(action) || action === 'sprint') {
        this.blockedKeys.delete(code); this.keys.add(code);
      }
    }
    for (const key of this.blockedHolds) if (key.startsWith('move:') || key.startsWith('sprint:')) this.blockedHolds.delete(key);
  }

  setAttack(held, source = 'touch') {
    const accepted = this.gateHeldAction('attack', Boolean(held), source);
    if (held && !accepted) return;
    if (held) this.attackSources.add(source);
    else this.attackSources.delete(source);
    const logical = this.attackSources.size > 0;
    if (!logical) this.gateHeldAction('attack', false, 'logical');
    if (logical === this.attackHeld) return;
    this.attackHeld = logical;
    this.socket.attack(this.attackHeld);
    this.onAttackLocal(this.attackHeld);
  }

  technique(down,source='touch'){
    if(down&&(!this.enabled||this.mountedBallista||this.mountedRam||this.mountedFlight||
      !this.gateHeldAction('technique',true,source)))return;
    const before=this.techniqueSources.size>0;
    if(down)this.techniqueSources.add(source);
    else{this.techniqueSources.delete(source);this.gateHeldAction('technique',false,source);}
    const held=this.techniqueSources.size>0;
    if(held!==before)this.socket?.technique?.(held);
  }

  setGuard(held, source = 'touch') {
    const accepted = this.gateHeldAction('guard', Boolean(held), source);
    if (held && !accepted) return;
    if (held) this.guardSources.add(source);
    else this.guardSources.delete(source);
    const logical = this.guardSources.size > 0;
    if (!logical) this.gateHeldAction('guard', false, 'logical');
    if (logical === this.guardHeld) return;
    this.guardHeld = logical;
    this.socket.guard(this.guardHeld);
    this.onGuardLocal(this.guardHeld);
  }

  releaseInputs() {
    this.ramPitchModifierHeld=false;
    if(this.ultimateGesture==='charge')this.socket.oneHitRelease?.({cancel:true});
    this.ultimateSources.clear();
    this.ultimateGesture=null;
    // Losing pointer lock or backgrounding a touch arena must not leave a remote
    // machine's repeating trigger latched. A release is legitimate even after
    // `enabled` has already become false.
    if(this.flightEjectHeld)this.flightEject(false,true);
    if(this.flightFireSources.size){this.flightFireSources.clear();this.socket?.send?.({type:'fightFlightFire',down:false});}
    if(this.flightDashSources.size){this.flightDashSources.clear();this.socket?.send?.({type:'flightDash',down:false});}
    if(this.flightUltimateSources.size){this.flightUltimateSources.clear();this.socket?.send?.({type:'flightUltimateHold',down:false,cancel:true});}
    this.aimGain = 1;
    this.onAimCancelled();
    this.cancelPreparedGesture();
    this.attackSources.clear();
    this.guardSources.clear();
    if(this.techniqueSources.size){this.techniqueSources.clear();this.socket?.technique?.(false);}
    this.preparedConsumedKeys.clear();
    if (this.allowAction) {
      for (const code of this.keys) if (GATED_ACTIONS.has(this.actionOf.get(code))) this.blockedKeys.add(code);
    } else this.blockedKeys.clear();
    releaseHeldInputs(this);
    this.blockedHolds.clear();
    this.onInputsReleased?.();
  }

  updatePreparedSpells(local, serverNow) {
    this.prepared = preparedSpellView(local, serverNow);
    this.spellOnly = Boolean(local?.preparedSpellSelected);
    if (local?.spell === this.pendingPreparedSelection || !this.prepared.visible) this.pendingPreparedSelection = null;
    if (!this.prepared.visible) this.cancelPreparedGesture();
  }

  // Q in Spells & Chivalry: a tap casts the selected spell; a short hold (PREPARED_HOLD_MS) opens the choice, which then
  // stays open once Q is let go, until a number chooses and casts, Q is pressed again, or Escape
  beginPreparedGesture() {
    if (!this.enabled || !this.prepared.visible || this.allowAction?.('spell') === false) return;
    // (open and waiting for a number: Q again puts it away, without casting)
    if (this.preparedGesture?.shown) { this.preparedGesture.closing = true; return; }
    if (this.preparedGesture) return;
    const gesture = { shown: false, slots: this.prepared.spells.map((spell, index) => ({ id: spell.id, slot: index + 1 })) };
    this.preparedGesture = gesture;
    this.preparedTimer = this.setTimer(() => {
      if (this.preparedGesture !== gesture) return;
      gesture.shown = true;
      this.#showPreparedGesture();
    }, PREPARED_HOLD_MS);
  }

  #showPreparedGesture() {
    const gesture = this.preparedGesture;
    this.onPreparedSelector(gesture?.shown ? { mode: 'keyboard', slots: gesture.slots } : null);
  }

  cancelPreparedGesture() {
    this.clearTimer(this.preparedTimer);
    this.preparedTimer = null;
    this.preparedGesture = null;
    this.onPreparedSelector(null);
  }

  finishPreparedGesture() {
    const gesture = this.preparedGesture;
    if (!gesture) return;
    // held long enough to open the choice: it stays open for a number (Q again closes it)
    if (gesture.shown && !gesture.closing) return;
    const tap = !gesture.shown;
    this.cancelPreparedGesture();
    if (tap && this.prepared.phase === 'active') this.castCurrentSpell();
  }

  usePreparedSpell(id) {
    if (!this.enabled || !this.prepared.visible || this.allowAction?.('spell') === false) return;
    const spell = this.prepared.spells.find((entry) => entry.id === id);
    if (!spell) return;
    if (this.prepared.phase === 'startup') {
      this.socket.selectPreparedSpell(id);
      return;
    }
    this.socket.castPreparedSpell(id, this.lookDirection(), { yaw: this.yaw, pitch: this.pitch });
    if (spell.available) this.onCastLocal({ spell: id, prepared: true });
  }

  castCurrentSpell() {
    if (!this.enabled || this.allowAction?.('spell') === false) return;
    this.socket.castCurrentSpell(this.lookDirection(), { yaw: this.yaw, pitch: this.pitch });
    // Predict the ordered selection intent without sending a stale identity back to authority.
    this.onCastLocal({ spellOnly: true, ...(this.pendingPreparedSelection ? { spell: this.pendingPreparedSelection } : {}) });
  }

  selectGaleMode(mode) {
    if (!this.enabled || !this.onGaleModeLocal(mode)) return false;
    this.socket.send?.({ type: 'galeMode', mode });
    return true;
  }

  cast() {
    if (!this.enabled || this.allowAction?.('spell') === false) return;
    if (this.prepared.visible) { if (this.prepared.phase === 'active') this.castCurrentSpell(); return; }
    if (this.spellOnly) { this.castCurrentSpell(); return; }
    this.socket.cast(this.lookDirection());
    this.onCastLocal();
  }

  // the gauntlet on its own key (unbound unless chosen): the fist whether or not the spell is ready
  ramFlick(){
    if(!this.enabled||!this.mountedRam||this.allowAction?.('attack')===false)return;
    this.socket?.send?.({type:'ramFlick'});
  }

  gauntlet() {
    // The ordinary gauntlet binding becomes the ram's third core attack.
    // It is not an additional selectable Skill, and never leaks on dismount.
    if(this.mountedRam){this.ramFlick();return;}
    if (!this.enabled || this.allowAction?.('gauntlet') === false) return;
    this.socket.gauntlet();
    this.onGauntletLocal();
  }

  // Each physical press is one gesture even with two rebound inputs held.
  ultimate(source='direct') {
    if (!this.enabled || this.allowAction?.('ultimate') === false) return;
    const busy=this.ultimateSources.size>0;
    this.ultimateSources.add(source);
    if(busy)return;
    if(Number.isFinite(this.oneHitAimUntil)){
      this.ultimateGesture='fire';
      this.socket.oneHitFire?.();
      return;
    }
    if(this.oneHitWaveId){
      this.ultimateGesture='detonate';
      this.socket.oneHitDetonate?.(this.oneHitWaveId);
      return;
    }
    this.ultimateGesture='charge';
    this.socket.ultimate?.({held:true});
    this.onUltimateLocal?.();
  }

  ultimateRelease(source='direct',cancel=false) {
    if(!this.ultimateSources.delete(source)||this.ultimateSources.size)return;
    if(this.ultimateGesture==='charge')this.socket.oneHitRelease?.({cancel,yaw:this.yaw,pitch:this.pitch});
    this.ultimateGesture=null;
  }

  dash() {
    // On SO-FIST-ICATION the same key is a held hydraulic lift control,
    // not a personal instant Dash.
    if(this.mountedRam)return;
    if (!this.enabled || this.allowAction?.('dash') === false) return;
    const dir = this.dashDirection();
    this.socket.dash(dir);
    this.onDashLocal(dir);
  }

  interact() {
    if (!this.enabled) return;
    this.socket?.send?.({ type: 'siegeOperate' });
  }

  deploy() {
    if (!this.enabled) return;
    // The easy-to-reach existing Deploy binding (B) is a contextual second
    // route to this machine's Skill, leaving U rebinds and normal B intact.
    if(this.mountedFlight){this.siegeSkill();return;}
    this.socket?.send?.({ type: 'bibyeToggleDeploy' });
  }

  siegeSkill() {
    if(this.enabled&&this.allowAction?.('siegeSkill')!==false)
      this.socket?.send?.({type:'siegeSkill',
        ...(this.mountedFlight?{yaw:this.yaw,pitch:this.pitch}:{})});
  }

  // One discrete mounted Hop packet. Touch Jump and Bolt-to-Jump swipe use
  // the same authoritative command; neither starts the held Rise motor.
  flightHop(){
    if(this.enabled&&this.mountedFlight&&this.allowAction?.('jump')!==false)
      this.socket?.send?.({type:'flightHop'});
  }

  flightEject(down,cancel=false){
    if(down&&(!this.enabled||!this.mountedFlight||this.flightEjectHeld))return;
    if(!down&&!this.flightEjectHeld)return;
    this.flightEjectHeld=Boolean(down);
    this.socket?.send?.({type:'flightEject',down:Boolean(down),...(cancel?{cancel:true}:{})});
  }

  flightUltimate(down,source='touch') {
    if(down&&(!this.enabled||!this.mountedFlight))return;
    const was=this.flightUltimateSources.size>0;
    if(down)this.flightUltimateSources.add(source);else this.flightUltimateSources.delete(source);
    const held=this.flightUltimateSources.size>0;
    if(was!==held&&this.mountedFlight)this.socket?.send?.({type:'flightUltimateHold',down:held});
  }
  flightTerminalRitual() {
    // The overlay is only a gesture recognizer. The host owns the cost,
    // eligibility, once-per-machine flag and irrevocable terminal lifecycle.
    if(this.enabled&&this.mountedFlight)
      this.socket?.send?.({type:'flightTerminalRitual'});
  }
  flightDash(down,source='touch') {
    if(down&&(!this.enabled||!this.mountedFlight))return;
    const was=this.flightDashSources.size>0;
    if(down)this.flightDashSources.add(source);else this.flightDashSources.delete(source);
    const held=this.flightDashSources.size>0;
    if(was!==held&&this.mountedFlight)this.socket?.send?.({type:'flightDash',down:held});
  }
  flightFire(down,source='touch') {
    if(down&&(!this.enabled||!this.mountedFlight))return;
    const was=this.flightFireSources.size>0;
    if(down)this.flightFireSources.add(source);else this.flightFireSources.delete(source);
    const held=this.flightFireSources.size>0;
    if(was!==held&&this.mountedFlight)this.socket?.send?.({type:'fightFlightFire',down:held});
  }
  siegeCoupled() {
    if(!this.enabled||!this.mountedBallista||this.allowAction?.('attack')===false)return;
    this.socket?.send?.({type:'bibyeCoupledFire',yaw:this.yaw,pitch:this.pitch,
      ...(this.siegeTarget?{siegeTarget:{...this.siegeTarget}}:{})});
  }
  siegeBoth() {
    if(this.enabled&&this.mountedBallista&&this.allowAction?.('siegeSkill')!==false)
      this.socket?.send?.({type:'bibyeCombinedFire'});
  }

  siegeWeapon() {
    if (this.enabled) this.socket?.send?.({ type: 'bibyeWeaponFocus' });
  }

  movement() {
    if (this.allowAction?.('look', false) === false) this.mouseLookBlocked = true;
    const touch = this.touch?.movement?.() ?? null;
    const moveAllowed = this.allowAction?.('move', false) !== false;
    if (!moveAllowed) {
      for (const code of this.keys) if (MOVE_ACTIONS.has(this.actionOf.get(code))) this.blockedKeys.add(code);
    }
    const moving = action => (this.bindings[action] ?? []).some(code => this.keys.has(code) && !this.blockedKeys.has(code));
    // E/C tilt the front; RMB+E/C lift the independent upper saddle.
    // Never route mounted hydraulics to personal Dash, Jump or Crouch.
    const ramLiftMode=Boolean(this.mountedRam&&this.ramPitchModifierHeld);
    const ramUpKey=moving('dash'),ramDownKey=moving('crouch');
    return {
      forward: moveAllowed ? (moving('forward') ? 1 : 0) - (moving('back') ? 1 : 0) + (touch?.forward ?? 0) : 0,
      right: moveAllowed ? (moving('right') ? 1 : 0) - (moving('left') ? 1 : 0) + (touch?.right ?? 0) : 0,
      jump: !this.mountedRam && (this.held('jump') || Boolean(touch?.jump)) && this.allowAction?.('jump', false) !== false,
      // Flight rail uses distinct held inputs: never recast Rise as Jump or Lower as Crouch.
      // Only forward live, mounted, authorized touch input to the authoritative host.
      flightRise: Boolean(this.enabled && this.mountedFlight && moveAllowed && touch?.flightRise),
      flightLower: Boolean(this.enabled && this.mountedFlight && moveAllowed && touch?.flightLower),
      ramRaise: Boolean(this.enabled && this.mountedRam && moveAllowed &&
         ((ramLiftMode&&ramUpKey)||touch?.ramRaise)),
       ramLower: Boolean(this.enabled && this.mountedRam && moveAllowed &&
         ((ramLiftMode&&ramDownKey)||touch?.ramLower)),
       ramPitchUp: Boolean(this.enabled && this.mountedRam && moveAllowed &&
         ((!ramLiftMode&&ramUpKey)||touch?.ramPitchUp)),
       ramPitchDown: Boolean(this.enabled && this.mountedRam && moveAllowed &&
         ((!ramLiftMode&&ramDownKey)||touch?.ramPitchDown)),
      // hold Sprint (Shift unless rebound; or push the touch stick all the way forward, or latch the touch button)
      sprint: this.gateHeldAction('sprint', this.held('sprint'), 'desktop', false) || Boolean(touch?.sprint),
      // hold Crouch (C unless rebound), or toggle the touch button: the wish; the body crouches and stands by the
      // server's rule (it cannot stand up under something)
      crouch: !this.mountedRam && (this.held('crouch') || Boolean(touch?.crouch)) &&
        this.allowAction?.('crouch', false) !== false,
      // what is held, beside the presses themselves (a Blazing Vortex is steered by it: the attack for its fire, the
      // guard for its blade; on a touch screen, the same two buttons)
      attack: this.gateHeldAction('attack', this.attackHeld, 'logical', false),
      guard: this.gateHeldAction('guard', this.guardHeld, 'logical', false),
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
