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
  ultimate: (input) => input.ultimate(),
  interact: (input) => input.interact(),
  deploy: (input) => input.deploy(),
  siegeSkill: (input) => input.siegeSkill(),
  siegeWeapon: (input) => input.siegeWeapon(),
  scoreboard: (input) => { input.scoreboardHeld = true; },
};
const RELEASE = {
  attack: (input) => input.setAttack(false),
  guard: (input) => input.setGuard(false),
  scoreboard: (input) => { input.scoreboardHeld = false; },
};
const HELD = new Set(['forward', 'back', 'left', 'right', 'jump', 'sprint']);
const MOVE_ACTIONS = new Set(['forward', 'back', 'left', 'right']);
const GATED_ACTIONS = new Set([...MOVE_ACTIONS, 'sprint', 'attack', 'guard', 'jump', 'crouch', 'spell', 'dash', 'gauntlet', 'ultimate']);
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
    this.pointerLocked = false;
    this.mouseLookBlocked = false;
    this.mountedBallista = false;
    this.mountedFlight = false;
    this.flightFireSources = new Set();
    this.ballistaSkillPhase = 'idle';
    this.ballistaChordMs = 45;
    this.ballistaMouse = {leftTimer:null,rightTimer:null,attackSent:false,consumed:false,primeHeld:false};
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
    if(this.mountedFlight&&action==='siegeWeapon'){this.flightFire(true,'key');return;}
    if (action === 'guard') this.setGuard(this.held('guard'), 'desktop');
    else if (action === 'attack') this.setAttack(this.held('attack'), 'desktop');
    else if (action === 'spell' && this.prepared.visible) this.beginPreparedGesture();
    else if (PRESS[action]) PRESS[action](this);
    else if (!RELEASE[action]) this.onAction(action, true);
  }

  #release(code) {
    const action = this.actionOf.get(code);
    if (HELD.has(action) && !this.held(action)) this.gateHeldAction(action, false, 'desktop');
    if (!action || HELD.has(action) || MENU_ACTIONS.has(action)) return;
    if(this.mountedFlight&&action==='siegeWeapon'){this.flightFire(false,'key');return;}
    if (action === 'guard') this.setGuard(this.held('guard'), 'desktop');
    else if (action === 'attack') this.setAttack(this.held('attack'), 'desktop');
    else if (action === 'spell') { if (!this.held('spell')) this.finishPreparedGesture(); }
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
        if (this.allowAction?.(MOVE_ACTIONS.has(action) ? 'move' : action, !event.repeat) === false) { this.blockedKeys.add(event.code); return; }
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
      this.handleMouseButtonDown(`Mouse${event.button}`);
    });

    this.#listen(document, 'mouseup', (event) => {
      this.handleMouseButtonUp(`Mouse${event.button}`);
    });
    this.#listen(document, 'contextmenu', (event) => event.preventDefault());
  }

  handleMouseButtonDown(code) {
    if (!this.enabled && !this.pointerLocked) return;
    if(this.mountedFlight&&code==='Mouse2'){this.flightFire(true,'mouse');return;}
    if(this.mountedBallista&&(code==='Mouse0'||code==='Mouse2')){
      this.#ballistaMouseDown(code);return;
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
    if(this.mountedFlight&&code==='Mouse2'){this.flightFire(false,'mouse');return;}
    if(this.mountedBallista&&(code==='Mouse0'||code==='Mouse2')){
      this.#ballistaMouseUp(code);return;
    }
    this.blockedKeys.delete(code);
    if (!this.keys.delete(code)) return;
    this.#release(code);
  }

  #ballistaCancelPending(){
    const state=this.ballistaMouse;
    this.clearTimer(state.leftTimer);this.clearTimer(state.rightTimer);
    state.leftTimer=null;state.rightTimer=null;
  }

  #ballistaMouseDown(code){
    if(this.keys.has(code))return; // compatibility pointer+mouse or OS repeat
    this.keys.add(code);
    const state=this.ballistaMouse;
    const isLeft=code==='Mouse0';
    if(!isLeft&&this.ballistaSkillPhase!=='primed'){
      // First right press is PRIME only. Holding it cannot also FIRE II.
      state.primeHeld=true;
      this.siegeSkill();this.ballistaSkillPhase='primed';
      return;
    }
    if(state.primeHeld){
      // A first-prime right hold is not a deliberate second press or chord.
      if(isLeft){this.setAttack(true,'desktop');state.attackSent=true;}
      return;
    }
    if(this.ballistaSkillPhase==='primed'&&this.keys.has('Mouse0')&&this.keys.has('Mouse2')&&!state.attackSent&&!state.consumed){
      this.#ballistaCancelPending();
      state.consumed=true;
      this.siegeBoth();
      this.ballistaSkillPhase='releasing';
      return;
    }
    const send=()=>{
      const field=isLeft?'leftTimer':'rightTimer';state[field]=null;
      if(state.consumed||!this.keys.has(code)||!this.mountedBallista)return;
      if(isLeft){this.setAttack(true,'desktop');state.attackSent=true;}
      else{this.siegeSkill();this.ballistaSkillPhase='releasing';}
    };
    // Only already-primed clicks receive the short chord recognition window.
    // Normal unprimed Bolt I retains instantaneous input.
    if(this.ballistaSkillPhase!=='primed'){
      if(isLeft){this.setAttack(true,'desktop');state.attackSent=true;}
      return;
    }
    const field=isLeft?'leftTimer':'rightTimer';
    state[field]=this.setTimer(send,this.ballistaChordMs);
  }

  #ballistaMouseUp(code){
    this.blockedKeys.delete(code);
    if(!this.keys.delete(code))return;
    const state=this.ballistaMouse,isLeft=code==='Mouse0',field=isLeft?'leftTimer':'rightTimer';
    if(state[field]!=null){
      this.clearTimer(state[field]);state[field]=null;
      if(!state.consumed){
        if(isLeft){this.setAttack(true,'desktop');state.attackSent=true;}
        else{this.siegeSkill();this.ballistaSkillPhase='releasing';}
      }
    }
    if(isLeft&&state.attackSent){this.setAttack(false,'desktop');state.attackSent=false;}
    if(!isLeft)state.primeHeld=false;
    if(!this.keys.has('Mouse0')&&!this.keys.has('Mouse2'))state.consumed=false;
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
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + pitchDelta*gain));
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
    // Losing pointer lock or backgrounding a touch arena must not leave a remote
    // machine's repeating trigger latched. A release is legitimate even after
    // `enabled` has already become false.
    if(this.flightFireSources.size){this.flightFireSources.clear();this.socket?.send?.({type:'fightFlightFire',down:false});}
    this.#ballistaCancelPending();
    this.ballistaMouse.consumed=false;this.ballistaMouse.primeHeld=false;
    this.ballistaMouse.attackSent=false;
    this.aimGain = 1;
    this.onAimCancelled();
    this.cancelPreparedGesture();
    this.attackSources.clear();
    this.guardSources.clear();
    this.preparedConsumedKeys.clear();
    if (this.allowAction) {
      for (const code of this.keys) if (GATED_ACTIONS.has(this.actionOf.get(code))) this.blockedKeys.add(code);
    } else this.blockedKeys.clear();
    releaseHeldInputs(this);
    this.blockedHolds.clear();
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
  gauntlet() {
    if (!this.enabled || this.allowAction?.('gauntlet') === false) return;
    this.socket.gauntlet();
    this.onGauntletLocal();
  }

  // the ultimate's key (the host decides whether the meter is full)
  ultimate() {
    if (!this.enabled || this.allowAction?.('ultimate') === false) return;
    this.socket.ultimate?.();
    this.onUltimateLocal?.();
  }

  dash() {
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
    if(this.enabled&&this.allowAction?.('siegeSkill')!==false)this.socket?.send?.({type:'siegeSkill'});
  }

  flightFire(down,source='touch') {
    if(down&&(!this.enabled||!this.mountedFlight))return;
    const was=this.flightFireSources.size>0;
    if(down)this.flightFireSources.add(source);else this.flightFireSources.delete(source);
    const held=this.flightFireSources.size>0;
    if(was!==held&&this.mountedFlight)this.socket?.send?.({type:'fightFlightFire',down:held});
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
    return {
      forward: moveAllowed ? (moving('forward') ? 1 : 0) - (moving('back') ? 1 : 0) + (touch?.forward ?? 0) : 0,
      right: moveAllowed ? (moving('right') ? 1 : 0) - (moving('left') ? 1 : 0) + (touch?.right ?? 0) : 0,
      jump: (this.held('jump') || Boolean(touch?.jump)) && this.allowAction?.('jump', false) !== false,
      // hold Sprint (Shift unless rebound; or push the touch stick all the way forward, or latch the touch button)
      sprint: this.gateHeldAction('sprint', this.held('sprint'), 'desktop', false) || Boolean(touch?.sprint),
      // hold Crouch (C unless rebound), or toggle the touch button: the wish; the body crouches and stands by the
      // server's rule (it cannot stand up under something)
      crouch: (this.held('crouch') || Boolean(touch?.crouch)) && this.allowAction?.('crouch', false) !== false,
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
