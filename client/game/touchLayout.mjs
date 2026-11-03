// Castleward — Touch Controls Layout Model, Presets, and Customization
// Supports distinct on-foot and Fight-and-Flight layouts, left/right-handed presets,
// safe-bounds clamping, and local persistence.

export const MIN_BUTTON_SIZE = 40;
export const MAX_BUTTON_SIZE = 110;
export const DEFAULT_OPACITY = 0.85;
const clonePlacements=layout=>Object.fromEntries(
  Object.entries(layout).map(([action,placement])=>[action,{...placement}]));

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

// Bi-Bye-llista only. Fixed positions prevent the conditional BOTH control from
// shifting the main firing targets. The generic layout remains the ram preset.
export const BI_BYE_MOUNTED_ACTIONS=Object.freeze({
 attack:{right:12,bottom:14,size:76},
 siegeSkill:{right:98,bottom:18,size:68},
 siegeBoth:{right:64,bottom:102,size:60},
 deploy:{right:68,top:56,size:48},
 siegeWeapon:{right:12,top:56,size:48},
});
const BI_BYE_UTILITIES=Object.freeze({
 interact:{right:60,top:8,size:38},
 // View sits beside the conditional BOTH slot, not beside accidental LEAVE.
 // Keep enough clearance from the lower Steel / heavy-fire row on short phones.
 siegeView:{right:145,bottom:111,size:40},
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

/** Preserve the ram preset; choose the independent ballista ladder by machine. */
export function mountedTouchLayout(onFoot,handedness='right',machine='generic'){
  const layout=clonePlacements(onFoot);
  const auxiliary=machine==='biBye'
    ? {...BI_BYE_MOUNTED_ACTIONS,...BI_BYE_UTILITIES}
    : {...MOUNTED_ACTIONS,interact:DEFAULT_FLIGHT_LAYOUT.interact,siegeView:DEFAULT_FLIGHT_LAYOUT.siegeView};
  const defaults=handedness==='left'?mirrorLayoutHorizontal(auxiliary):auxiliary;
  for(const [action,placement]of Object.entries(defaults)){
    const saved=onFoot?.[action],original=DEFAULT_ON_FOOT_LAYOUT[action];
    const mirrored=original?mirrorLayoutHorizontal({[action]:original})[action]:null;
    const preset=mirrored&&Object.entries(mirrored).every(([k,v])=>saved?.[k]===v);
    layout[action]=saved?.custom&&!preset?{...saved}:{...placement,custom:true};
  }
  return layout;
}

// Separate editable pages for stationary artillery and the mobile ram. Old
// shared on-foot layouts are preserved when migrating an existing player.
export const DEFAULT_BALLISTA_LAYOUT=Object.freeze(mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT,'right','biBye'));
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
  const safeMargin = 4;
  const stick = item.type === 'stick';

  if (clamped.size !== undefined) {
    clamped.size = Math.max(stick ? 80 : MIN_BUTTON_SIZE,
      Math.min(stick ? 172 : MAX_BUTTON_SIZE, Number(clamped.size) || (stick ? 112 : 50)));
  }
  if (clamped.width !== undefined) {
    clamped.width = Math.max(36, Math.min(160, Number(clamped.width) || 36));
  }
  if (clamped.height !== undefined) {
    clamped.height = Math.max(30, Math.min(96, Number(clamped.height) || 30));
  }

  // The joystick is anchored at its CENTER; ordinary controls use their
  // exterior edge. After resizing, constrain the *actual* dimensions.
  const w = clamped.width ?? clamped.size ?? 50;
  const h = clamped.height ?? clamped.size ?? 50;
  const sideInset = stick ? w / 2 : 0;
  const verticalInset = stick ? h / 2 : 0;
  const horizontalMin = safeMargin + sideInset;
  const verticalMin = safeMargin + verticalInset;
  const horizontalMax = Math.max(horizontalMin, viewport.width - w - safeMargin + sideInset);
  const verticalMax = Math.max(verticalMin, viewport.height - h - safeMargin + verticalInset);
  const clamp = (number, lo, hi) => Math.max(lo, Math.min(hi, Number(number) || 0));

  if ('left' in clamped) clamped.left = clamp(clamped.left, horizontalMin, horizontalMax);
  else if ('right' in clamped) clamped.right = clamp(clamped.right, horizontalMin, horizontalMax);
  if ('top' in clamped) clamped.top = clamp(clamped.top, verticalMin, verticalMax);
  else if ('bottom' in clamped) clamped.bottom = clamp(clamped.bottom, verticalMin, verticalMax);

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
  if (!flight) return clonePlacements(DEFAULT_FLIGHT_LAYOUT);
  const matches=(a,b)=>a&&b&&Object.keys(b).every(k=>a[k]===b[k])&&Object.keys(a).every(k=>k==='custom'||k in b);
  // The old handedness preset marked every control custom. Migrate only the
  // complete unedited preset; individual edited controls remain untouched.
  const oldMirror=mirrorLayoutHorizontal(LEGACY_FLIGHT_LAYOUT);
  const previousMirror=mirrorLayoutHorizontal(PREVIOUS_FLIGHT_LAYOUT);
  const outgoingMirror=mirrorLayoutHorizontal(OUTGOING_FLIGHT_LAYOUT);
  if(Object.keys(outgoingMirror).every(k=>matches(flight[k],outgoingMirror[k])))return mirrorLayoutHorizontal(DEFAULT_FLIGHT_LAYOUT);
  if(Object.keys(previousMirror).every(k=>matches(flight[k],previousMirror[k])))return mirrorLayoutHorizontal(DEFAULT_FLIGHT_LAYOUT);
  if(Object.keys(oldMirror).every(k=>matches(flight[k],oldMirror[k])))return mirrorLayoutHorizontal(DEFAULT_FLIGHT_LAYOUT);
  const migrated=clonePlacements(DEFAULT_FLIGHT_LAYOUT);
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
        onFoot: migrateCrouchPosition(parsed.onFoot ?? clonePlacements(DEFAULT_ON_FOOT_LAYOUT)),
        flight: migrateFlightLayout(parsed.flight),
        ballista:{...mountedTouchLayout(parsed.onFoot??clonePlacements(DEFAULT_ON_FOOT_LAYOUT),
          parsed.handedness==='left'?'left':'right','biBye'),...(parsed.ballista??{})},
        ram:{...mountedTouchLayout(parsed.onFoot??clonePlacements(DEFAULT_ON_FOOT_LAYOUT),
          parsed.handedness==='left'?'left':'right'),...(parsed.ram??{})},
        opacity: Number.isFinite(parsed.opacity) ? parsed.opacity : DEFAULT_OPACITY,
        handedness: parsed.handedness === 'left' ? 'left' : 'right',
      };
    }
  } catch {}
  return {
    onFoot: clonePlacements(DEFAULT_ON_FOOT_LAYOUT),
    flight: clonePlacements(DEFAULT_FLIGHT_LAYOUT),
    ballista: clonePlacements(DEFAULT_BALLISTA_LAYOUT),
    ram: clonePlacements(DEFAULT_RAM_LAYOUT),
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
  for(const key of ['left','right','top','bottom','width','height','marginLeft','marginRight'])if(element.style[key]!=null)element.style[key]='';
  element.style.setProperty('--size','');
  element.style.setProperty('--stick-size','');
}

export function applyLayoutItem(element, placement, scale = 1) {
  if (!element || !placement || !placement.custom) return;
  const s = scale;
  if ('left' in placement) {
    element.style.left = `calc(var(--safe-l) + ${placement.left}px * var(--s))`;
    element.style.right = 'auto';
    if(placement.type==='stick'){element.style.marginLeft='calc(var(--stick-size) * -.5)';element.style.marginRight='0';}
  } else if ('right' in placement) {
    element.style.right = `calc(var(--safe-r) + ${placement.right}px * var(--s))`;
    element.style.left = 'auto';
    if(placement.type==='stick'){element.style.marginLeft='0';element.style.marginRight='calc(var(--stick-size) * -.5)';}
  }

  if ('top' in placement) {
    element.style.top = `calc(var(--safe-t) + ${placement.top}px * var(--s))`;
    element.style.bottom = 'auto';
  } else if ('bottom' in placement) {
    element.style.bottom = placement.type==='stick'?
      `calc(var(--safe-b) + ${placement.bottom}px * var(--s) - var(--stick-size) * .5)`:
      `calc(var(--safe-b) + ${placement.bottom}px * var(--s))`;
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
