export class InspectionCameraTools {
  constructor(parent, actions) {
    this.root = document.createElement('div');
    this.root.className = 'inspection-camera-ui hidden';
    this.actions = actions;

    this.root.innerHTML = `
<details class="inspection-camera-tools" open>
  <summary>INSPECTION YARD <span data-camera-state></span></summary>

  <div class="inspection-authoritative-readout" data-camera-readout>LIVE · TICK 0 · 0.00s</div>

  <!-- COMPACT MAIN TOOLBAR -->
  <div class="inspection-toolbar-main">
    <div class="inspection-toolbar-row">
      <span class="inspection-pill-label">ACTOR:</span>
      <button data-camera="actor" aria-pressed="true" title="First-person Spellblade perspective">YOU</button>
      <button data-camera="dummy" aria-pressed="false" title="Possess practice dummy directly">DUMMY</button>
      <span class="inspection-pill-sep">|</span>
      <span class="inspection-pill-label">VIEW:</span>
      <button data-camera="viewFp" aria-pressed="true" title="First-person viewpoint">1ST</button>
      <button data-camera="fly" aria-pressed="false" title="Free fly observer camera">FLY</button>
      <button data-camera="split" aria-pressed="false" title="Side-by-side viewports">SPLIT</button>
    </div>

    <div class="inspection-toolbar-row">
      <button data-camera="freeze" class="inspection-btn-freeze" title="Freeze or resume simulation">FREEZE</button>
      <button data-camera="step" disabled title="Advance simulation by exactly 1 tick (30 Hz)">STEP 1 TICK</button>
      <button data-camera="captureSingle" class="inspection-btn-action" title="Export clean PNG of current view">CAPTURE PNG</button>
      <button data-camera="hideAllUi" class="inspection-btn-highlight" title="Hide all DOM UI overlays [Shortcut: H]">HIDE UI [H]</button>
    </div>
  </div>

  <!-- 1. DIRECTOR TOOLS -->
  <details class="inspection-subgroup" open data-subgroup="director">
    <summary>DIRECTOR TOOLS</summary>

    <!-- SELECTIVE FREEZING -->
    <div class="inspection-section-label">SELECTIVE FREEZING</div>
    <div class="inspection-control-row">
      <span class="inspection-row-title">FREEZE:</span>
      <div class="inspection-btn-group">
        <button data-camera="freezeMode" data-mode="none" aria-pressed="true" title="Simulation runs live">LIVE</button>
        <button data-camera="freezeMode" data-mode="all" aria-pressed="false" title="Freeze entire simulation">ALL</button>
        <button data-camera="freezeMode" data-mode="others" aria-pressed="false" title="Only selected actor moves/acts; others stationary">OTHERS</button>
        <button data-camera="freezeMode" data-mode="actor" aria-pressed="false" title="Freeze selected actor in place/pose">ACTOR</button>
      </div>
    </div>
    <div class="inspection-camera-buttons">
      <button data-camera="toggleFreezeProjectiles" data-freeze-proj-btn title="Suspend spell and siege projectiles midair">FREEZE PROJECTILES: OFF</button>
      <button data-camera="playFrames" disabled title="Play simulation at 0.2s frame beats">PLAY FRAMES</button>
    </div>

    <!-- ACTOR SETUP & STAGING -->
    <div class="inspection-section-label">ACTOR SETUP & STAGING</div>
    <div class="inspection-camera-buttons">
      <button data-camera="stageRefill" title="Restore HP and Guard Stamina to full">REFILL VITALS</button>
      <button data-camera="stageUltimate" title="Ready selected actor's Ultimate prowess">READY ULTIMATE</button>
      <button data-camera="stageClearCooldowns" title="Instantly clear spells, dash, and stagger">CLEAR COOLDOWNS</button>
      <button data-camera="stageToggleAi" data-ai-btn title="Enable or suspend practice dummy AI">AI: ACTIVE</button>
      <button data-camera="stageToggleFlight" data-flight-btn title="Toggle free 3D flight for Spellblade [Shortcut: Y]">FLIGHT: OFF</button>
    </div>

    <div class="inspection-control-row">
      <label class="inspection-row-title" for="stage-spell">SPELL:</label>
      <select id="stage-spell" class="inspection-select" data-stage-spell>
        <option value="fireball">Fireball</option>
        <option value="frostfire">Frostfire</option>
        <option value="gale">Gale</option>
        <option value="coreflagration">Coreflagration</option>
      </select>
      <button data-camera="stageApplySpell" title="Equip chosen spell on selected actor">EQUIP</button>
    </div>

    <div class="inspection-control-row">
      <label class="inspection-row-title" for="stage-ultimate">ULTIMATE:</label>
      <select id="stage-ultimate" class="inspection-select" data-stage-ultimate>
        <option value="sunder">Sunder</option>
        <option value="vortex">Vortex</option>
        <option value="chivalry">Chivalry</option>
      </select>
      <button data-camera="stageApplyUltimate" title="Equip chosen ultimate on selected actor">EQUIP</button>
    </div>

    <!-- POSES & POSITIONS -->
    <div class="inspection-section-label">POSES & POSITIONING</div>
    <div class="inspection-control-row">
      <span class="inspection-row-title">POSE:</span>
      <div class="inspection-btn-group">
        <button data-camera="stagePose" data-pose="idle" title="Neutral stance">IDLE</button>
        <button data-camera="stagePose" data-pose="guard" title="Defensive guard pose">GUARD</button>
        <button data-camera="stagePose" data-pose="swing" title="Sword swing pose">SWING</button>
        <button data-camera="stagePose" data-pose="cast" title="Spell casting pose">CAST</button>
      </div>
    </div>
    <div class="inspection-control-row">
      <span class="inspection-row-title">POSITION:</span>
      <div class="inspection-btn-group">
        <button data-camera="stagePosition" data-pos="face_target" title="Orient toward opponent">FACE TARGET</button>
        <button data-camera="stagePosition" data-pos="courtyard" title="Center courtyard">COURTYARD</button>
        <button data-camera="stagePosition" data-pos="walkway" title="Walkway platform">WALKWAY</button>
      </div>
    </div>

    <!-- SIEGE MACHINERY PREPARATION -->
    <div class="inspection-section-label">SIEGE MACHINERY</div>
    <div class="inspection-camera-buttons">
      <button data-camera="stageMount" data-mount="ballista" title="Mount Bi-Bye-llista station">MOUNT BALLISTA</button>
      <button data-camera="stageMount" data-mount="ram" title="Mount SO-FIST-ICATION station">MOUNT RAM</button>
      <button data-camera="stageMount" data-mount="dismount" title="Dismount current siege machine">DISMOUNT MACHINE</button>
      <button data-camera="stagePosition" data-pos="near_ballista" title="Position near ballista">NEAR BALLISTA</button>
    </div>
  </details>

  <!-- 2. CAMERA TOOLS -->
  <details class="inspection-subgroup" data-subgroup="camera">
    <summary>CAMERA TOOLS</summary>

    <div class="inspection-control-row">
      <span class="inspection-row-title">SPEED:</span>
      <div class="inspection-btn-group">
        <button data-camera="speed" data-speed="slow" title="2 m/s precision speed">SLOW</button>
        <button data-camera="speed" data-speed="normal" aria-pressed="true" title="8 m/s standard speed">NORM</button>
        <button data-camera="speed" data-speed="fast" title="24 m/s fast travel">FAST</button>
      </div>
    </div>

    <div class="inspection-control-row">
      <span class="inspection-row-title">FOV:</span>
      <div class="inspection-btn-group inspection-fov-group">
        <button data-camera="fovDec" title="Decrease FOV by 5 degrees">-5°</button>
        <span class="inspection-val-display" data-fov-display>78°</span>
        <button data-camera="fovInc" title="Increase FOV by 5 degrees">+5°</button>
        <button data-camera="fovReset" title="Reset FOV to default">RESET</button>
      </div>
    </div>

    <div class="inspection-camera-buttons">
      <button data-camera="levelCamera" title="Reset pitch and tilt to level horizon">LEVEL HORIZON</button>
      <button data-camera="focusSubject" title="Aim camera toward player, dummy, or siege engine">FOCUS SUBJECT</button>
      <button data-camera="reset" title="Reset fly camera near player">RESET CAMERA</button>
      <button data-camera="toggleGrid" data-grid-btn title="Toggle rule-of-thirds composition grid">GRID: OFF</button>
      <button data-camera="cycleUiMode" data-ui-mode-btn title="Toggle between Full UI, Gameplay HUD, and Clean">UI: FULL</button>
    </div>

    <!-- CAMERA BOOKMARKS -->
    <div class="inspection-section-label">CAMERA BOOKMARKS</div>
    <div class="inspection-bookmark-list">
      <div class="inspection-bookmark-row" data-bookmark-row="1">
        <label class="inspection-bookmark-check" title="Include Slot 1 in multi-camera captures">
          <input type="checkbox" data-bookmark-include="1" checked>
          <span>Slot 1</span>
        </label>
        <button data-camera="bookmarkSet" data-slot="1" title="Save current camera transform to Slot 1">SET</button>
        <button data-camera="bookmarkGo" data-slot="1" disabled title="Recall Slot 1 transform">GO</button>
      </div>
      <div class="inspection-bookmark-row" data-bookmark-row="2">
        <label class="inspection-bookmark-check" title="Include Slot 2 in multi-camera captures">
          <input type="checkbox" data-bookmark-include="2" checked>
          <span>Slot 2</span>
        </label>
        <button data-camera="bookmarkSet" data-slot="2" title="Save current camera transform to Slot 2">SET</button>
        <button data-camera="bookmarkGo" data-slot="2" disabled title="Recall Slot 2 transform">GO</button>
      </div>
      <div class="inspection-bookmark-row" data-bookmark-row="3">
        <label class="inspection-bookmark-check" title="Include Slot 3 in multi-camera captures">
          <input type="checkbox" data-bookmark-include="3" checked>
          <span>Slot 3</span>
        </label>
        <button data-camera="bookmarkSet" data-slot="3" title="Save current camera transform to Slot 3">SET</button>
        <button data-camera="bookmarkGo" data-slot="3" disabled title="Recall Slot 3 transform">GO</button>
      </div>
    </div>
  </details>

  <!-- 3. ADVANCED CAPTURE -->
  <details class="inspection-subgroup" data-subgroup="capture">
    <summary>ADVANCED CAPTURE</summary>

    <div class="inspection-camera-buttons">
      <button data-camera="captureAll" class="inspection-btn-action" title="Capture all selected bookmarks at the exact same simulation tick">CAPTURE ALL CAMERAS</button>
    </div>

    <div class="inspection-sequence-box">
      <div class="inspection-control-row">
        <label class="inspection-row-title" for="seq-cadence">CADENCE:</label>
        <select id="seq-cadence" class="inspection-select" data-sequence-cadence>
          <option value="1">Every 1 tick (30 fps)</option>
          <option value="3">Every 3 ticks (0.10s)</option>
          <option value="6" selected>Every 6 ticks (0.20s)</option>
          <option value="15">Every 15 ticks (0.50s)</option>
          <option value="30">Every 30 ticks (1.00s)</option>
        </select>
      </div>
      <div class="inspection-control-row">
        <label class="inspection-row-title" for="seq-limit">COUNT:</label>
        <select id="seq-limit" class="inspection-select" data-sequence-limit>
          <option value="6">6 moments</option>
          <option value="12" selected>12 moments</option>
          <option value="24">24 moments</option>
          <option value="48">48 moments</option>
          <option value="0">Manual Stop</option>
        </select>
      </div>
      <div class="inspection-camera-buttons">
        <button data-camera="toggleSequence" class="inspection-btn-sequence" title="Start or stop timed capture sequence">START SEQUENCE</button>
      </div>
      <div class="inspection-sequence-progress hidden" data-sequence-progress></div>
    </div>
  </details>

  <p data-camera-help></p>
  <div class="inspection-status-feedback" data-camera-feedback></div>
  <small>Local inspection simulation. Director tools stage actors & abilities. Captures export cleanly without UI overlays. Press [H] to hide UI.</small>
</details>
<div class="inspection-view-labels"></div>
`;
    parent.append(this.root);

    this.click = (event) => {
      const node = event.target.closest('[data-camera]');
      if (!node) return;
      event.stopPropagation();
      const action = node.dataset.camera;
      if (action === 'speed') actions.speed?.(node.dataset.speed);
      else if (action === 'bookmarkSet') actions.bookmarkSet?.(Number(node.dataset.slot));
      else if (action === 'bookmarkGo') actions.bookmarkGo?.(Number(node.dataset.slot));
      else if (action === 'freezeMode') actions.freezeMode?.(node.dataset.mode);
      else if (action === 'toggleFreezeProjectiles') actions.toggleFreezeProjectiles?.();
      else if (action === 'stageRefill') actions.stageRefill?.();
      else if (action === 'stageUltimate') actions.stageUltimate?.();
      else if (action === 'stageClearCooldowns') actions.stageClearCooldowns?.();
      else if (action === 'stageToggleAi') actions.stageToggleAi?.();
      else if (action === 'stageToggleFlight') actions.stageToggleFlight?.();
      else if (action === 'stageApplySpell') {
        const spell = this.root.querySelector('[data-stage-spell]')?.value;
        actions.stageLoadout?.({ spell });
      } else if (action === 'stageApplyUltimate') {
        const ultimate = this.root.querySelector('[data-stage-ultimate]')?.value;
        actions.stageLoadout?.({ ultimate });
      } else if (action === 'stagePose') actions.stagePose?.(node.dataset.pose);
      else if (action === 'stagePosition') actions.stagePosition?.(node.dataset.pos);
      else if (action === 'stageMount') actions.stageMount?.(node.dataset.mount);
      else actions[action]?.(node.dataset);
    };
    this.root.addEventListener('click', this.click);

    this.change = (event) => {
      const checkbox = event.target.closest('[data-bookmark-include]');
      if (checkbox) {
        const slot = Number(checkbox.dataset.bookmarkInclude);
        actions.bookmarkToggleInclude?.(slot, checkbox.checked);
      }
    };
    this.root.addEventListener('change', this.change);

    this.stop = (event) => event.stopPropagation();
    this.stopEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup', 'touchstart', 'touchend', 'touchmove'];
    for (const type of this.stopEvents) this.root.addEventListener(type, this.stop);
    this.labels = this.root.querySelector('.inspection-view-labels');
  }

  setFeedback(message, isError = false) {
    const feedback = this.root.querySelector('[data-camera-feedback]');
    if (feedback) {
      feedback.textContent = String(message || '');
      feedback.classList.toggle('error', Boolean(isError));
      if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
      if (message) {
        this.feedbackTimer = setTimeout(() => {
          if (feedback.textContent === message) feedback.textContent = '';
        }, 3500);
      }
    }
  }

  update({
    available,
    focus,
    split,
    dummy,
    controlledDummy,
    frozen,
    freezeMode = 'none',
    freezeProjectiles = false,
    playingFrames,
    views,
    controls,
    tick = 0,
    simTime = 0,
    uiMode = 'full',
    gridVisible = false,
    speedMode = 'normal',
    fov = 78,
    bookmarks = [null, null, null],
    sequence = null,
    actorHealth,
    actorMaxHealth = 100,
    actorStamina,
    actorSpell,
    actorUltimate,
    actorProwess = 0,
    dummyAiSuspended = false,
    mounted = false,
    spellbladeFlight = false,
  }) {
    this.root.classList.toggle('hidden', !available);
    if (!available) return;

    const signature = JSON.stringify([
      focus,
      split,
      Boolean(dummy),
      controlledDummy,
      frozen,
      freezeMode,
      freezeProjectiles,
      playingFrames,
      views,
      controls,
      tick,
      Math.floor(simTime * 10),
      uiMode,
      gridVisible,
      speedMode,
      Math.round(fov),
      bookmarks.map((b) => Boolean(b)),
      sequence ? [sequence.active, sequence.capturedMoments, sequence.lastCapturedTick] : null,
      actorSpell,
      actorUltimate,
      dummyAiSuspended,
      mounted,
      spellbladeFlight,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;

    const button = (id) => this.root.querySelector(`[data-camera="${id}"]`);

    // Perspectives
    const actorBtn = button('actor');
    if (actorBtn) actorBtn.setAttribute('aria-pressed', String(focus === 'actor' && !controlledDummy));

    const dummyBtn = button('dummy');
    if (dummyBtn) {
      dummyBtn.disabled = !dummy;
      dummyBtn.setAttribute('aria-pressed', String(focus === 'actor' && controlledDummy));
    }

    const viewFpBtn = button('viewFp');
    if (viewFpBtn) viewFpBtn.setAttribute('aria-pressed', String(focus === 'actor'));

    const flyBtn = button('fly');
    if (flyBtn) flyBtn.setAttribute('aria-pressed', String(focus === 'fly'));

    const splitBtn = button('split');
    if (splitBtn) splitBtn.setAttribute('aria-pressed', String(split));

    // Selective Freezing
    const effectiveFreeze = freezeMode !== 'none' ? freezeMode : (frozen ? 'all' : 'none');
    for (const m of ['none', 'all', 'others', 'actor']) {
      const modeBtn = this.root.querySelector(`[data-camera="freezeMode"][data-mode="${m}"]`);
      if (modeBtn) modeBtn.setAttribute('aria-pressed', String(effectiveFreeze === m));
    }

    const projBtn = this.root.querySelector('[data-freeze-proj-btn]');
    if (projBtn) {
      projBtn.textContent = `FREEZE PROJECTILES: ${freezeProjectiles ? 'ON' : 'OFF'}`;
      projBtn.setAttribute('aria-pressed', String(freezeProjectiles));
    }

    // AI status button
    const aiBtn = this.root.querySelector('[data-ai-btn]');
    if (aiBtn) {
      aiBtn.textContent = `AI: ${dummyAiSuspended ? 'SUSPENDED' : 'ACTIVE'}`;
      aiBtn.setAttribute('aria-pressed', String(dummyAiSuspended));
    }

    // Spellblade flight toggle button
    const flightBtn = this.root.querySelector('[data-flight-btn]');
    if (flightBtn) {
      flightBtn.textContent = `FLIGHT: ${spellbladeFlight ? 'ON' : 'OFF'}`;
      flightBtn.setAttribute('aria-pressed', String(spellbladeFlight));
    }

    // Current actor loadout selectors
    if (actorSpell) {
      const spellSelect = this.root.querySelector('[data-stage-spell]');
      if (spellSelect && !spellSelect.matches(':focus')) spellSelect.value = actorSpell;
    }
    if (actorUltimate) {
      const ultSelect = this.root.querySelector('[data-stage-ultimate]');
      if (ultSelect && !ultSelect.matches(':focus')) ultSelect.value = actorUltimate;
    }

    // UI Mode & Grid
    const uiModeBtn = this.root.querySelector('[data-ui-mode-btn]');
    if (uiModeBtn) {
      uiModeBtn.textContent = `UI: ${uiMode.toUpperCase()}`;
      uiModeBtn.setAttribute('aria-pressed', String(uiMode !== 'full'));
    }
    const gridBtn = this.root.querySelector('[data-grid-btn]');
    if (gridBtn) {
      gridBtn.textContent = `GRID: ${gridVisible ? 'ON' : 'OFF'}`;
      gridBtn.setAttribute('aria-pressed', String(gridVisible));
    }

    // Speed buttons
    for (const spd of ['slow', 'normal', 'fast']) {
      const spdBtn = this.root.querySelector(`[data-camera="speed"][data-speed="${spd}"]`);
      if (spdBtn) spdBtn.setAttribute('aria-pressed', String(speedMode === spd));
    }

    // FOV display
    const fovDisplay = this.root.querySelector('[data-fov-display]');
    if (fovDisplay) fovDisplay.textContent = `${Math.round(fov)}°`;

    // Time controls
    const freezeBtn = button('freeze');
    if (freezeBtn) freezeBtn.textContent = (frozen || effectiveFreeze !== 'none') ? 'RESUME' : 'FREEZE';

    const stepBtn = button('step');
    if (stepBtn) stepBtn.disabled = !frozen && effectiveFreeze === 'none';

    const playFramesBtn = button('playFrames');
    if (playFramesBtn) {
      playFramesBtn.disabled = !frozen && effectiveFreeze === 'none';
      playFramesBtn.textContent = playingFrames ? 'STOP FRAMES' : 'PLAY FRAMES';
      playFramesBtn.setAttribute('aria-pressed', String(playingFrames));
    }

    // Authoritative readout
    const readout = this.root.querySelector('[data-camera-readout]');
    if (readout) {
      const formattedTick = Number(tick || 0).toLocaleString();
      const formattedTime = Number(simTime || 0).toFixed(2);
      const freezeLabel = effectiveFreeze === 'all' || frozen
        ? 'FROZEN ALL'
        : effectiveFreeze === 'others'
          ? 'FROZEN OTHERS'
          : effectiveFreeze === 'actor'
            ? 'FROZEN ACTOR'
            : 'LIVE';
      const projLabel = freezeProjectiles ? ' [PROJ FROZEN]' : '';
      readout.textContent = `${freezeLabel}${projLabel} · TICK ${formattedTick} · ${formattedTime}s`;
      readout.classList.toggle('frozen', Boolean(frozen || effectiveFreeze !== 'none'));
    }

    // Bookmarks
    for (let i = 1; i <= 3; i++) {
      const hasBm = Boolean(bookmarks[i - 1]);
      const goBtn = this.root.querySelector(`[data-camera="bookmarkGo"][data-slot="${i}"]`);
      if (goBtn) goBtn.disabled = !hasBm;
      const row = this.root.querySelector(`[data-bookmark-row="${i}"]`);
      if (row) row.classList.toggle('has-bookmark', hasBm);
    }

    // Sequence status
    const seqBtn = button('toggleSequence');
    const seqProg = this.root.querySelector('[data-sequence-progress]');
    if (sequence?.active) {
      if (seqBtn) {
        seqBtn.textContent = 'STOP SEQUENCE';
        seqBtn.classList.add('recording');
      }
      if (seqProg) {
        seqProg.classList.remove('hidden');
        const limitStr = sequence.limitMoments > 0 ? ` / ${sequence.limitMoments}` : '';
        seqProg.textContent = `Recording: ${sequence.capturedMoments}${limitStr} moments (tick ${sequence.lastCapturedTick >= 0 ? sequence.lastCapturedTick : tick})`;
      }
    } else {
      if (seqBtn) {
        seqBtn.textContent = 'START SEQUENCE';
        seqBtn.classList.remove('recording');
      }
      if (seqProg) seqProg.classList.add('hidden');
    }

    // State summary badge
    const stateBadge = this.root.querySelector('[data-camera-state]');
    if (stateBadge) {
      const actorLabel = focus === 'fly' ? 'FLY' : controlledDummy ? 'DUMMY' : 'YOU';
      const freezeBadge = effectiveFreeze !== 'none' || frozen ? ` · ${effectiveFreeze.toUpperCase()}` : '';
      stateBadge.textContent = `${actorLabel}${freezeBadge}`;
    }

    const helpEl = this.root.querySelector('[data-camera-help]');
    if (helpEl) {
      helpEl.textContent = focus === 'fly'
        ? controls
        : 'Select You or Dummy for gameplay control. Director tools allow staging abilities, vitals, poses, and selective freeze.';
    }

    // Split view labels
    this.labels.replaceChildren();
    if (split) {
      for (const view of views) {
        const node = document.createElement('button');
        node.dataset.camera = view.kind;
        node.className = 'inspection-view-label';
        node.textContent = view.kind === 'fly' ? 'FLY CAMERA' : controlledDummy ? 'DUMMY' : 'YOU';
        node.setAttribute('aria-label', `Control ${node.textContent.toLowerCase()}`);
        node.setAttribute('aria-pressed', String(view.controlled));
        const touch = document.body.classList.contains('touch-ui');
        Object.assign(node.style, { left: `${view.x + (touch ? view.width - 88 : 8)}px`, top: `${view.y + (touch ? 64 : 8)}px` });
        if (view.kind === 'actor') node.dataset.camera = 'body';
        const outline = document.createElement('div');
        outline.className = 'inspection-pane';
        Object.assign(outline.style, { left: `${view.x}px`, top: `${view.y}px`, width: `${view.width}px`, height: `${view.height}px` });
        this.labels.append(outline, node);
      }
    }
  }

  getSequenceSettings() {
    const cadenceSelect = this.root.querySelector('[data-sequence-cadence]');
    const limitSelect = this.root.querySelector('[data-sequence-limit]');
    return {
      intervalTicks: Number(cadenceSelect?.value) || 6,
      limitMoments: Number(limitSelect?.value) || 12,
    };
  }

  dispose() {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('change', this.change);
    for (const type of this.stopEvents) this.root.removeEventListener(type, this.stop);
    this.root.remove();
  }
}
