// Castleward — Touch Controls Layout Model, Presets, and Customization
// Supports distinct on-foot and Fight-and-Flight layouts, left/right-handed presets,
// safe-bounds clamping, and local persistence.

export const MIN_BUTTON_SIZE = 40;
export const MAX_BUTTON_SIZE = 110;
export const DEFAULT_OPACITY = 0.85;

export const DEFAULT_ON_FOOT_LAYOUT = Object.freeze({
  stick: { left: 118, bottom: 110, size: 112, type: 'stick' },
  attack: { right: 28, bottom: 28, size: 80 },
  guard: { right: 152, bottom: 36, size: 64 },
  dash: { right: 138, bottom: 104, size: 54 },
  spell: { right: 88, bottom: 147, size: 54 },
  jump: { right: 21, bottom: 154, size: 58 },
  sprint: { left: 26, bottom: 190, size: 50 },
  crouch: { left: 190, bottom: 187, size: 50 },
  gauntlet: { right: 206, bottom: 150, size: 46 },
  ultimate: { right: 24, bottom: 222, size: 50 },
  interact: { right: 204, bottom: 96, size: 58 },
  deploy: { right: 196, bottom: 164, size: 58 },
  pause: { left: 10, top: 8, size: 38 },
  scores: { left: 54, top: 8, size: 38 },
  practiceTools: { left: 10, top: 56, size: 44 },
});

const LEGACY_FLIGHT_LAYOUT = Object.freeze({
  stick: { left: 118, bottom: 110, size: 112, type: 'stick' },
  // Vertical flight rail is attached to the movement stick; it follows mirrored/custom stick placement.
  // Right-side combat cluster (bottom to top):
  // Bottom row: GUARD (left), SWORD (right)
  guard: { right: 108, bottom: 24, size: 66 },
  attack: { right: 20, bottom: 24, width: 88, height: 76 },
  // Second row: BOLT (left) with sustained-fire target, JUMP (right)
  siegeWeapon: { right: 108, bottom: 105, width: 86, height: 62 },
  jump: { right: 26, bottom: 105, size: 62 },
  // Third row: FIRE AWAY (left), DASH (right)
  siegeSkill: { right: 108, bottom: 172, size: 58 },
  dash: { right: 24, bottom: 172, size: 58 },
  // Above ordinary cluster: ULTIMATE / VALKYRIE and mounted Steel
  ultimate: { right: 66, bottom: 242, size: 58 },
  spell: { right: 138, bottom: 242, size: 58 },
  // Upper auxiliary controls
  siegeView: { right: 14, top: 12, size: 44 },
  interact: { right: 68, top: 12, size: 44 },
  pause: { left: 10, top: 8, size: 38 },
  scores: { left: 54, top: 8, size: 38 },
  practiceTools: { left: 10, top: 56, size: 44 },
});

const PREVIOUS_FLIGHT_LAYOUT = Object.freeze({
  stick: {left:82,bottom:91,size:112,type:'stick'},
  guard: {right:88,bottom:12,size:64},
  attack: {right:14,bottom:12,width:68,height:64},
  siegeWeapon: {right:88,bottom:82,width:64,height:54},
  jump: {right:14,bottom:82,size:54},
  siegeSkill: {right:88,bottom:142,size:54},
  dash: {right:14,bottom:142,size:54},
  spell: {right:88,bottom:202,size:54},
  ultimate: {right:14,bottom:202,size:54},
  siegeView: {right:14,top:10,size:44},
  interact: {right:64,top:10,size:44},
  pause: {left:10,top:8,size:38},
  scores: {left:54,top:8,size:38},
  practiceTools: {left:10,top:56,size:44},
});

// The Nov 2 layout is kept only for migrating unedited saved positions.
const OUTGOING_FLIGHT_LAYOUT = Object.freeze({
  ...PREVIOUS_FLIGHT_LAYOUT,
  attack:{right:14,bottom:12,size:64},
  siegeWeapon:{right:88,bottom:84,size:64},
  jump:{right:14,bottom:84,size:60},
  siegeSkill:{right:88,bottom:154,size:60},
  dash:{right:14,bottom:154,size:60},
  spell:{right:88,bottom:220,size:54},
  ultimate:{right:14,bottom:220,size:54},
});
export const DEFAULT_FLIGHT_LAYOUT = Object.freeze({
  ...OUTGOING_FLIGHT_LAYOUT,
  // Bottom: move Guard left and enlarge the actual Sword contact area.
  guard:{right:122,bottom:12,size:58},
  attack:{right:14,bottom:10,size:62,width:96,height:62},
  // Bolt now fills its former position PLUS the old Jump column. Directly
  // above Bolt is Jump, allowing one finger to slide upward into a Hop.
  siegeWeapon:{right:14,bottom:80,size:62,width:122,height:62},
  jump:{right:14,bottom:146,size:62},
  // Dash takes Fire Away's old left-hand position.
  dash:{right:88,bottom:146,size:60},
  // Fire Away moves beside Ultimate, with mounted Steel on their left.
  siegeSkill:{right:86,bottom:212,size:56},
  ultimate:{right:14,bottom:212,size:56},
  spell:{right:154,bottom:214,size:50},
  siegeView:{right:14,top:6,size:36},
  interact:{right:60,top:6,size:36},
});
const MOUNTED_ACTIONS = Object.freeze({
  attack:{right:14,bottom:20,size:76},
  siegeSkill:{right:90,bottom:112,size:64},
  siegeBoth:{right:14,bottom:112,size:64},
  siegeWeapon:{right:14,bottom:190,size:56},
  deploy:{right:90,bottom:190,size:56},
});

export function mirrorLayoutHorizontal(layout) {
  const mirrored = {};
  for (const [key, item] of Object.entries(layout)) {
    const copy = { ...item, custom: true };
    if ('left' in copy) {
      copy.right = copy.left;
      delete copy.left;
    } else if ('right' in copy) {
      copy.left = copy.right;
      delete copy.right;
    }
    mirrored[key] = copy;
  }
  return mirrored;
}

/** Contextual controls share one auxiliary row on every mounted machine. */
export function mountedTouchLayout(onFoot,handedness='right'){
  const layout={...onFoot};
  const auxiliary={...MOUNTED_ACTIONS,interact:DEFAULT_FLIGHT_LAYOUT.interact,siegeView:DEFAULT_FLIGHT_LAYOUT.siegeView};
  const defaults=handedness==='left'?mirrorLayoutHorizontal(auxiliary):auxiliary;
  for(const [action,placement]of Object.entries(defaults)){
    const saved=onFoot?.[action],original=DEFAULT_ON_FOOT_LAYOUT[action];
    const mirrored=original?mirrorLayoutHorizontal({[action]:original})[action]:null;
    const preset=mirrored&&Object.entries(mirrored).every(([k,v])=>saved?.[k]===v);
    layout[action]=saved?.custom&&!preset?saved:{...placement,custom:true};
  }
  return layout;
}

// Separate editable pages for stationary artillery and the mobile ram. Old
// shared on-foot layouts are preserved when migrating an existing player.
export const DEFAULT_BALLISTA_LAYOUT=Object.freeze(mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT));
export const DEFAULT_RAM_LAYOUT=Object.freeze(mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT));
export const TOUCH_LAYOUT_PAGES=Object.freeze([
 {id:'onFoot',label:'SPELLBLADE'}, {id:'flight',label:'FLIGHT'},
 {id:'ballista',label:'BALLISTA'}, {id:'ram',label:'RAM'},
]);
export const layoutForMode=(layouts,mode)=>
 mode==='flight'?layouts.flight:mode==='ballista'?layouts.ballista:
 mode==='ram'?layouts.ram:layouts.onFoot;

export function clampPlacement(item, viewport = { width: 800, height: 450 }) {
  const clamped = { ...item, custom: true };
  const w = item.width ?? item.size ?? 50;
  const h = item.height ?? item.size ?? 50;
  const safeMargin = 4;

  if (clamped.size !== undefined) {
    clamped.size = Math.max(item.type==='stick'?80:MIN_BUTTON_SIZE,
      Math.min(item.type==='stick'?172:MAX_BUTTON_SIZE, clamped.size));
  }
  if (clamped.width !== undefined) {
    clamped.width = Math.max(36, Math.min(160, clamped.width));
  }
  if (clamped.height !== undefined) {
    clamped.height = Math.max(30, Math.min(96, clamped.height));
  }

  if ('left' in clamped) {
    clamped.left = Math.max(safeMargin, Math.min(viewport.width - w - safeMargin, clamped.left));
  } else if ('right' in clamped) {
    clamped.right = Math.max(safeMargin, Math.min(viewport.width - w - safeMargin, clamped.right));
  }

  if ('top' in clamped) {
    clamped.top = Math.max(safeMargin, Math.min(viewport.height - h - safeMargin, clamped.top));
  } else if ('bottom' in clamped) {
    clamped.bottom = Math.max(safeMargin, Math.min(viewport.height - h - safeMargin, clamped.bottom));
  }

  return clamped;
}

// Old saved default layouts used the centerline above the joystick for Crouch.
// Migrate only that exact unmodified location; preserve deliberate custom layouts.
function migrateCrouchPosition(onFoot) {
  const crouch = onFoot?.crouch;
  if (!crouch || crouch.custom || crouch.left !== 90 || crouch.bottom !== 196) return onFoot;
  return { ...onFoot, crouch: { ...crouch, left: 190, bottom: 187 } };
}

// Ensure saved flight layouts preserve custom positioning while migrating missing controls.
function migrateFlightLayout(flight) {
  if (!flight) return { ...DEFAULT_FLIGHT_LAYOUT };
  const matches=(a,b)=>a&&b&&Object.keys(b).every(k=>a[k]===b[k])&&Object.keys(a).every(k=>k==='custom'||k in b);
  // The old handedness preset marked every control custom. Migrate only the
  // complete unedited preset; individual edited controls remain untouched.
  const oldMirror=mirrorLayoutHorizontal(LEGACY_FLIGHT_LAYOUT);
  const previousMirror=mirrorLayoutHorizontal(PREVIOUS_FLIGHT_LAYOUT);
  const outgoingMirror=mirrorLayoutHorizontal(OUTGOING_FLIGHT_LAYOUT);
  if(Object.keys(outgoingMirror).every(k=>matches(flight[k],outgoingMirror[k])))return mirrorLayoutHorizontal(DEFAULT_FLIGHT_LAYOUT);
  if(Object.keys(previousMirror).every(k=>matches(flight[k],previousMirror[k])))return mirrorLayoutHorizontal(DEFAULT_FLIGHT_LAYOUT);
  if(Object.keys(oldMirror).every(k=>matches(flight[k],oldMirror[k])))return mirrorLayoutHorizontal(DEFAULT_FLIGHT_LAYOUT);
  const migrated={...DEFAULT_FLIGHT_LAYOUT};
  for(const [key,item] of Object.entries(flight)){
    const legacy=LEGACY_FLIGHT_LAYOUT[key];
    const untouched=!item.custom&&(legacy&&matches(item,legacy)||
      matches(item,PREVIOUS_FLIGHT_LAYOUT[key])||matches(item,OUTGOING_FLIGHT_LAYOUT[key]));
    if(!untouched)migrated[key]=item;
  }
  return migrated;
}

export function loadTouchLayout(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.('ss-touch-layout');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        onFoot: migrateCrouchPosition(parsed.onFoot ?? { ...DEFAULT_ON_FOOT_LAYOUT }),
        flight: migrateFlightLayout(parsed.flight),
        ballista:{...mountedTouchLayout(parsed.onFoot??DEFAULT_ON_FOOT_LAYOUT,
          parsed.handedness==='left'?'left':'right'),...(parsed.ballista??{})},
        ram:{...mountedTouchLayout(parsed.onFoot??DEFAULT_ON_FOOT_LAYOUT,
          parsed.handedness==='left'?'left':'right'),...(parsed.ram??{})},
        opacity: Number.isFinite(parsed.opacity) ? parsed.opacity : DEFAULT_OPACITY,
        handedness: parsed.handedness === 'left' ? 'left' : 'right',
      };
    }
  } catch {}
  return {
    onFoot: { ...DEFAULT_ON_FOOT_LAYOUT },
    flight: { ...DEFAULT_FLIGHT_LAYOUT },
    ballista: { ...DEFAULT_BALLISTA_LAYOUT },
    ram: { ...DEFAULT_RAM_LAYOUT },
    opacity: DEFAULT_OPACITY,
    handedness: 'right',
  };
}

export function saveTouchLayout(layout, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.('ss-touch-layout', JSON.stringify(layout));
  } catch {}
}

export function clearLayoutItem(element){
  if(!element?.style)return;
  for(const key of ['left','right','top','bottom','width','height'])if(element.style[key]!=null)element.style[key]='';
  element.style.setProperty('--size','');
  element.style.setProperty('--stick-size','');
}

export function applyLayoutItem(element, placement, scale = 1) {
  if (!element || !placement || !placement.custom) return;
  const s = scale;
  if ('left' in placement) {
    element.style.left = `calc(var(--safe-l) + ${placement.left}px * var(--s))`;
    element.style.right = 'auto';
  } else if ('right' in placement) {
    element.style.right = `calc(var(--safe-r) + ${placement.right}px * var(--s))`;
    element.style.left = 'auto';
  }

  if ('top' in placement) {
    element.style.top = `calc(var(--safe-t) + ${placement.top}px * var(--s))`;
    element.style.bottom = 'auto';
  } else if ('bottom' in placement) {
    element.style.bottom = `calc(var(--safe-b) + ${placement.bottom}px * var(--s))`;
    element.style.top = 'auto';
  }

  if (placement.size !== undefined) {
    element.style.setProperty(placement.type==='stick'?'--stick-size':'--size', `${placement.size}px`);
  }
  if (placement.width !== undefined) {
    element.style.width = `calc(${placement.width}px * var(--s))`;
  }
  if (placement.height !== undefined) {
    element.style.height = `calc(${placement.height}px * var(--s))`;
  }
}
