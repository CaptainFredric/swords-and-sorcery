// Castleward — Touch Controls Layout Editor
// Allows players on mobile/tablet to drag and reposition individual touch controls,
// resize buttons, choose Left/Right-handed presets, adjust opacity, and persist custom layouts.

import {
  DEFAULT_ON_FOOT_LAYOUT,
  DEFAULT_FLIGHT_LAYOUT,
  DEFAULT_BALLISTA_LAYOUT,DEFAULT_RAM_LAYOUT,TOUCH_LAYOUT_PAGES,layoutForMode,
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
            ${TOUCH_LAYOUT_PAGES.map(page => `<button type="button" class="tle-btn" data-mode="${page.id}">${page.label}</button>`).join('')}
          </span>
        </div>
        <div class="tle-controls">
          <label>Opacity: <input type="range" data-action="opacity" min="20" max="100" value="${Math.round(this.layouts.opacity * 100)}"><output>${Math.round(this.layouts.opacity * 100)}%</output></label>
          <span class="tle-selected-name" data-selected>SELECT A CONTROL</span>
          <label class="tle-dimension" data-dimension="size">DIAMETER <input type="range" data-action="size" min="40" max="172" value="60" disabled><output>--</output></label>
          <label class="tle-dimension" data-dimension="width" hidden>WIDTH <input type="range" data-action="width" min="36" max="160" value="80" disabled><output>--</output></label>
          <label class="tle-dimension" data-dimension="height" hidden>HEIGHT <input type="range" data-action="height" min="30" max="96" value="62" disabled><output>--</output></label>
          <button type="button" class="tle-btn" data-action="preset-right">RIGHT-HANDED</button>
          <button type="button" class="tle-btn" data-action="preset-left">LEFT-HANDED</button>
          <button type="button" class="tle-btn" data-action="reset">RESET DEFAULT</button>
          <button type="button" class="tle-btn primary" data-action="done">DONE</button>
        </div>
      </div>
      <div class="tle-hint">DRAG to move · SELECT to resize · JOYSTICK sizes change real input reach · DONE saves each machine separately</div>
    `;

    document.body.appendChild(this.root);

    this.opacitySlider = this.root.querySelector('input[data-action="opacity"]');
    this.opacityOutput = this.opacitySlider?.parentElement?.querySelector('output');
    this.sizeSlider = this.root.querySelector('input[data-action="size"]');
    this.sizeOutput = this.sizeSlider?.parentElement?.querySelector('output');
    this.widthSlider=this.root.querySelector('input[data-action="width"]');
    this.heightSlider=this.root.querySelector('input[data-action="height"]');
    this.selectedName=this.root.querySelector('[data-selected]');

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

    for(const [key,slider]of [['size',this.sizeSlider],['width',this.widthSlider],['height',this.heightSlider]]){
      slider?.addEventListener('input',()=>{
        if(!this.selectedAction)return;
        const layout=layoutForMode(this.layouts,this.mode);
        const item=layout?.[this.selectedAction];
        if(!item)return;
        const value=Number(slider.value);
        if(!Number.isFinite(value))return;
        item[key]=value;
        if(key==='size'&&item.type==='stick')item.size=Math.max(80,Math.min(172,value));
        const output=slider.parentElement?.querySelector('output');
        if(output)output.textContent=(item[key]??value)+'px';
        this.applyCurrent();
        saveTouchLayout(this.layouts);
      });
    }

    // Pointer events on touchControls layer during edit mode
    this.touchControls.layer.addEventListener('pointerdown', this.#onPointerDown, true);
    window.addEventListener('pointermove', this.#onPointerMove, true);
    window.addEventListener('pointerup', this.#onPointerUp, true);
    window.addEventListener('pointercancel', this.#onPointerUp, true);
  }

  open(mode = null) {
    this.active = true;
    this.mode = mode ?? (this.touchControls.flightMounted ? 'flight':
      this.touchControls.ramMounted?'ram':this.touchControls.ballistaMounted?'ballista':'onFoot');
    this.selectedAction=null;
    this.root.classList.remove('hidden');
    // Settings can open from the main menu before the hidden game HUD exists.
    // Temporarily portal its real touch controls into the visible document;
    // restore the original hierarchy on Done without duplicating controls.
    const layer=this.touchControls.layer;
    if(!layer.getClientRects?.()?.length){
      this.previewParent=layer.parentNode;
      this.previewNextSibling=layer.nextSibling;
      document.body.appendChild(layer);
      layer.classList.add('touch-layout-detached');
    }
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
    this.touchControls.previewEditMode(null);
    const layer=this.touchControls.layer;
    if(this.previewParent){
      if(this.previewNextSibling?.parentNode===this.previewParent)
        this.previewParent.insertBefore(layer,this.previewNextSibling);
      else this.previewParent.appendChild(layer);
      layer.classList.remove('touch-layout-detached');
      this.previewParent=null;this.previewNextSibling=null;
    }
    this.touchControls.setActive(Boolean(this.touchControls.input?.touchFocus));
  }

  setMode(mode) {
    if(!TOUCH_LAYOUT_PAGES.some(page=>page.id===mode))return;
    this.mode=mode;
    this.dragPointerId=null;this.dragStart=null;
    this.selectedAction=null;
    this.#clearSelectionHighlight();
    this.#syncDimensionSliders(null);
    this.root.querySelectorAll('[data-mode]').forEach(b=>{
      const active=b.dataset.mode===mode;
      b.classList.toggle('active',active);
      b.setAttribute('aria-pressed',String(active));
    });
    this.touchControls.previewEditMode(mode);
    this.applyCurrent();
  }

  resetCurrentMode() {
    const defaults={onFoot:DEFAULT_ON_FOOT_LAYOUT,flight:DEFAULT_FLIGHT_LAYOUT,
      ballista:DEFAULT_BALLISTA_LAYOUT,ram:DEFAULT_RAM_LAYOUT};
    this.layouts[this.mode]=structuredClone(defaults[this.mode]);
    this.setMode(this.mode);
    saveTouchLayout(this.layouts);
  }

  applyPreset(handedness) {
    this.layouts.handedness=handedness;
    const defaults={onFoot:DEFAULT_ON_FOOT_LAYOUT,flight:DEFAULT_FLIGHT_LAYOUT,
      ballista:DEFAULT_BALLISTA_LAYOUT,ram:DEFAULT_RAM_LAYOUT};
    const chosen=handedness==='left'?mirrorLayoutHorizontal(defaults[this.mode]):
      structuredClone(defaults[this.mode]);
    this.layouts[this.mode]=chosen; // do not destroy edits on other pages
    this.setMode(this.mode);
    saveTouchLayout(this.layouts);
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

    const activeLayout=layoutForMode(this.layouts,this.mode);
    const placement=activeLayout?.[action];
    if(!placement)return;
    this.#syncDimensionSliders(placement);
    if(this.selectedName)this.selectedName.textContent=action==='stick'?'MOVEMENT JOYSTICK':
      action==='siegeWeapon'?'BOLT CONTROL':action.toUpperCase();

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
    const activeLayout=layoutForMode(this.layouts,this.mode);

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

  #syncDimensionSliders(placement) {
    const rectangle=Boolean(placement&&(placement.width!=null||placement.height!=null));
    for(const [key,slider]of [['size',this.sizeSlider],['width',this.widthSlider],['height',this.heightSlider]]){
      if(!slider)continue;
      const visible=Boolean(placement)&&(rectangle?key!=='size':key==='size');
      const label=this.root.querySelector('[data-dimension="'+key+'"]');
      if(label)label.hidden=!visible;
      slider.disabled=!visible;
      if(!visible)continue;
      const size=placement[key]??placement.size??60;
      slider.min=key==='size'&&placement.type==='stick'?'80':key==='size'?'36':key==='width'?'36':'30';
      slider.max=key==='size'&&placement.type==='stick'?'172':key==='size'?'110':key==='width'?'160':'96';
      slider.value=String(size);
      const output=slider.parentElement?.querySelector('output');
      if(output)output.textContent=size+'px';
    }
    if(!placement&&this.selectedName)this.selectedName.textContent='SELECT A CONTROL';
  }

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
