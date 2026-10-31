// Castleward — Touch Controls Layout Editor
// Allows players on mobile/tablet to drag and reposition individual touch controls,
// resize buttons, choose Left/Right-handed presets, adjust opacity, and persist custom layouts.

import {
  DEFAULT_ON_FOOT_LAYOUT,
  DEFAULT_FLIGHT_LAYOUT,
  mirrorLayoutHorizontal,
  clampPlacement,
  loadTouchLayout,
  saveTouchLayout,
  applyLayoutItem,
} from './touchLayout.mjs';

export class TouchLayoutEditor {
  constructor(touchControls) {
    this.touchControls = touchControls;
    this.active = false;
    this.mode = 'flight'; // 'onFoot' | 'flight'
    this.selectedAction = null;
    this.dragPointerId = null;
    this.dragStart = null;
    this.layouts = loadTouchLayout();

    this.root = document.createElement('div');
    this.root.className = 'touch-layout-editor hidden';
    this.root.innerHTML = `
      <div class="tle-bar">
        <div class="tle-header">
          <strong>EDIT TOUCH CONTROLS</strong>
          <span class="tle-mode-toggles">
            <button type="button" class="tle-btn" data-mode="onFoot">ON-FOOT</button>
            <button type="button" class="tle-btn active" data-mode="flight">FLIGHT</button>
          </span>
        </div>
        <div class="tle-controls">
          <label>Opacity: <input type="range" data-action="opacity" min="20" max="100" value="${Math.round(this.layouts.opacity * 100)}"><output>${Math.round(this.layouts.opacity * 100)}%</output></label>
          <label>Selected Size: <input type="range" data-action="size" min="40" max="100" value="60" disabled><output>--</output></label>
          <button type="button" class="tle-btn" data-action="preset-right">RIGHT-HANDED</button>
          <button type="button" class="tle-btn" data-action="preset-left">LEFT-HANDED</button>
          <button type="button" class="tle-btn" data-action="reset">RESET DEFAULT</button>
          <button type="button" class="tle-btn primary" data-action="done">DONE</button>
        </div>
      </div>
      <div class="tle-hint">Drag any button to reposition. Tap to select and resize.</div>
    `;

    document.body.appendChild(this.root);

    this.opacitySlider = this.root.querySelector('input[data-action="opacity"]');
    this.opacityOutput = this.opacitySlider?.parentElement?.querySelector('output');
    this.sizeSlider = this.root.querySelector('input[data-action="size"]');
    this.sizeOutput = this.sizeSlider?.parentElement?.querySelector('output');

    this.#bindEvents();
  }

  #bindEvents() {
    this.root.addEventListener('click', (e) => {
      const modeBtn = e.target.closest('[data-mode]');
      if (modeBtn) {
        this.setMode(modeBtn.dataset.mode);
        return;
      }
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        if (action === 'done') this.close();
        else if (action === 'reset') this.resetCurrentMode();
        else if (action === 'preset-right') this.applyPreset('right');
        else if (action === 'preset-left') this.applyPreset('left');
      }
    });

    this.opacitySlider?.addEventListener('input', () => {
      const val = Number(this.opacitySlider.value) / 100;
      this.layouts.opacity = val;
      if (this.opacityOutput) this.opacityOutput.textContent = `${Math.round(val * 100)}%`;
      this.touchControls.setCustomOpacity(val);
    });

    this.sizeSlider?.addEventListener('input', () => {
      if (!this.selectedAction) return;
      const size = Number(this.sizeSlider.value);
      const activeLayout = this.mode === 'flight' ? this.layouts.flight : this.layouts.onFoot;
      if (activeLayout[this.selectedAction]) {
        activeLayout[this.selectedAction].size = size;
        if (this.sizeOutput) this.sizeOutput.textContent = `${size}px`;
        this.applyCurrent();
      }
    });

    // Pointer events on touchControls layer during edit mode
    this.touchControls.layer.addEventListener('pointerdown', this.#onPointerDown, true);
    window.addEventListener('pointermove', this.#onPointerMove, true);
    window.addEventListener('pointerup', this.#onPointerUp, true);
    window.addEventListener('pointercancel', this.#onPointerUp, true);
  }

  open(mode = null) {
    this.active = true;
    this.mode = mode ?? (this.touchControls.flightMounted ? 'flight' : 'onFoot');
    this.root.classList.remove('hidden');
    this.touchControls.layer.classList.add('touch-layout-editing');
    this.setMode(this.mode);
  }

  close() {
    this.active = false;
    this.selectedAction = null;
    this.dragPointerId = null;
    this.root.classList.add('hidden');
    this.touchControls.layer.classList.remove('touch-layout-editing');
    this.#clearSelectionHighlight();
    saveTouchLayout(this.layouts);
    this.touchControls.applyLayout(this.layouts);
  }

  setMode(mode) {
    this.mode = mode;
    this.root.querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    this.touchControls.previewEditMode(mode);
    this.applyCurrent();
  }

  resetCurrentMode() {
    if (this.mode === 'flight') {
      this.layouts.flight = { ...DEFAULT_FLIGHT_LAYOUT };
    } else {
      this.layouts.onFoot = { ...DEFAULT_ON_FOOT_LAYOUT };
    }
    this.applyCurrent();
  }

  applyPreset(handedness) {
    this.layouts.handedness = handedness;
    if (handedness === 'left') {
      this.layouts.onFoot = mirrorLayoutHorizontal(DEFAULT_ON_FOOT_LAYOUT);
      this.layouts.flight = mirrorLayoutHorizontal(DEFAULT_FLIGHT_LAYOUT);
    } else {
      this.layouts.onFoot = { ...DEFAULT_ON_FOOT_LAYOUT };
      this.layouts.flight = { ...DEFAULT_FLIGHT_LAYOUT };
    }
    this.applyCurrent();
  }

  applyCurrent() {
    this.touchControls.applyLayout(this.layouts);
  }

  #onPointerDown = (event) => {
    if (!this.active) return;
    const button = event.target.closest('[data-action], .touch-stick');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const action = button.dataset.action ?? (button.classList.contains('touch-stick') ? 'stick' : null);
    if (!action) return;

    this.selectedAction = action;
    this.dragPointerId = event.pointerId;
    this.#highlightSelected(button);

    const activeLayout = this.mode === 'flight' ? this.layouts.flight : this.layouts.onFoot;
    const placement = activeLayout[action];
    if (placement && this.sizeSlider) {
      this.sizeSlider.disabled = false;
      const sizeVal = placement.size ?? placement.width ?? 60;
      this.sizeSlider.value = String(sizeVal);
      if (this.sizeOutput) this.sizeOutput.textContent = `${sizeVal}px`;
    }

    const rect = button.getBoundingClientRect();
    this.dragStart = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      placement: { ...placement },
      buttonRect: rect,
    };
  };

  #onPointerMove = (event) => {
    if (!this.active || this.dragPointerId !== event.pointerId || !this.dragStart || !this.selectedAction) return;
    event.preventDefault();
    event.stopPropagation();

    const dx = event.clientX - this.dragStart.pointerX;
    const dy = event.clientY - this.dragStart.pointerY;
    const orig = this.dragStart.placement;
    const activeLayout = this.mode === 'flight' ? this.layouts.flight : this.layouts.onFoot;

    const viewport = {
      width: this.touchControls.layer.clientWidth || window.innerWidth,
      height: this.touchControls.layer.clientHeight || window.innerHeight,
    };

    const updated = { ...orig };
    if ('left' in orig) updated.left = Math.round(orig.left + dx);
    else if ('right' in orig) updated.right = Math.round(orig.right - dx);

    if ('top' in orig) updated.top = Math.round(orig.top + dy);
    else if ('bottom' in orig) updated.bottom = Math.round(orig.bottom - dy);

    activeLayout[this.selectedAction] = clampPlacement(updated, viewport);
    this.applyCurrent();
  };

  #onPointerUp = (event) => {
    if (!this.active || this.dragPointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.dragPointerId = null;
    this.dragStart = null;
    saveTouchLayout(this.layouts);
  };

  #highlightSelected(button) {
    this.#clearSelectionHighlight();
    button.classList.add('tle-selected');
  }

  #clearSelectionHighlight() {
    this.touchControls.layer.querySelectorAll('.tle-selected').forEach((el) => {
      el.classList.remove('tle-selected');
    });
  }
}
