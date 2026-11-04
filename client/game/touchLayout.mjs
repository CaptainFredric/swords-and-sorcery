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
 // Steel is available on deployed artillery, too. Its on-foot position
 // overlapped the conditional BOTH carousel on compact landscape phones.
 spell:{right:198,bottom:104,size:48},
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

// V2 stores only user-authored DIFFERENCES. Current presets, not the
// browser's old full-layout snapshot, remain the source of truth.
export const TOUCH_LAYOUT_SCHEMA_VERSION=2;
const PAGES=['onFoot','flight','ballista','ram'];
const defaultsForPage=mode=>mode==='flight'?DEFAULT_FLIGHT_LAYOUT:
  mode==='ballista'?DEFAULT_BALLISTA_LAYOUT:
  mode==='ram'?DEFAULT_RAM_LAYOUT:DEFAULT_ON_FOOT_LAYOUT;
const safeSide=side=>side==='left'?'left':'right';
const baseForPage=(mode,side='right')=>clonePlacements(
  safeSide(side)==='left'?mirrorLayoutHorizontal(defaultsForPage(mode)):defaultsForPage(mode));
const defaultPresets=()=>Object.fromEntries(PAGES.map(mode=>[mode,'right']));
const defaultLayouts=()=>({
  ...Object.fromEntries(PAGES.map(mode=>[mode,baseForPage(mode)])),
  presets:defaultPresets(),opacity:DEFAULT_OPACITY,handedness:'right',
});
const has=(item,field)=>Object.prototype.hasOwnProperty.call(item??{},field);
const finiteField=(item,field)=>has(item,field)&&Number.isFinite(item[field]);
function placementPatch(item,base){
  if(!item||typeof item!=='object')return null;
  const patch={};
  // Horizontal/vertical anchors are exclusive pairs. A saved left anchor
  // must remove the default right anchor when defaults evolve.
  for(const pair of [['left','right'],['top','bottom']]){
    const key=pair.find(k=>finiteField(item,k));
    if(key&&(key!==pair.find(k=>finiteField(base,k))||item[key]!==base?.[key]))patch[key]=item[key];
  }
  for(const key of ['size','width','height'])
    if(finiteField(item,key)&&item[key]!==base?.[key])patch[key]=item[key];
  return Object.keys(patch).length?patch:null;
}
function mergePlacement(base,patch){
  const next={...base,...patch};
  if(has(patch,'left'))delete next.right;
  if(has(patch,'right'))delete next.left;
  if(has(patch,'top'))delete next.bottom;
  if(has(patch,'bottom'))delete next.top;
  if(patch&&Object.keys(patch).length)next.custom=true;
  return next;
}
function hydratePage(mode,side,overrides={}){
  const base=baseForPage(mode,side),page=clonePlacements(base);
  if(!overrides||typeof overrides!=='object')return page;
  for(const [action,patch]of Object.entries(overrides))
    if(base[action]&&patch&&typeof patch==='object')page[action]=mergePlacement(base[action],patch);
  return page;
}
// A previous handedness preset labeled ALL positions "custom". That flag
// does not distinguish a user edit from a historical factory position.
const OLD_ON_FOOT_LAYOUT=Object.freeze({
  ...DEFAULT_ON_FOOT_LAYOUT,crouch:{left:90,bottom:196,size:50},
});
const legacyCandidates=mode=>mode==='flight'?
  [DEFAULT_FLIGHT_LAYOUT,OUTGOING_FLIGHT_LAYOUT,PREVIOUS_FLIGHT_LAYOUT,LEGACY_FLIGHT_LAYOUT]:
  mode==='onFoot'?[DEFAULT_ON_FOOT_LAYOUT,OLD_ON_FOOT_LAYOUT]:
  [defaultsForPage(mode)];
function legacySide(mode,items){
  // Global handedness belonged to whichever page was last edited; infer
  // each page's handedness from its actual mirrored anchors instead.
  const stock=defaultsForPage(mode),mirrored=mirrorLayoutHorizontal(stock);
  let right=0,left=0;
  for(const [action,placement]of Object.entries(items??{})){
    if(!placement||!stock[action])continue;
    const axis=['left','right'].find(k=>finiteField(placement,k));
    if(!axis)continue;
    if(axis===['left','right'].find(k=>finiteField(stock[action],k)))right++;
    if(axis===['left','right'].find(k=>finiteField(mirrored[action],k)))left++;
  }
  return left>right?'left':'right';
}
function legacyPage(mode,saved,side){
  const base=baseForPage(mode,side);
  if(!saved||typeof saved!=='object')return base;
  const candidates=legacyCandidates(mode).map(layout=>side==='left'?mirrorLayoutHorizontal(layout):layout);
  const result=clonePlacements(base);
  for(const [action,item]of Object.entries(saved)){
    if(!base[action]||!item||typeof item!=='object')continue;
    // Match each historical control to the nearest stock version. Keep
    // only actual differences, so unrelated old dimensions cannot stick.
    const reference=candidates
      .filter(layout=>layout[action])
      .map(layout=>({patch:placementPatch(item,layout[action])}))
      .sort((a,b)=>Object.keys(a.patch??{}).length-Object.keys(b.patch??{}).length)[0];
    // Legacy right-handed Crouch had one historical factory coordinate
    // also used by an explicitly edited button. Preserve that position when
    // the save actually marked Crouch custom (the unmarked preset migrates).
    const provenance=mode==='onFoot'&&side==='right'&&action==='crouch'&&
      item.custom===true&&reference?.patch==null?
        placementPatch(item,base[action]):null;
    const patch=reference?.patch??provenance;
    if(patch){
      const merged=mergePlacement(base[action],patch);
      // An older explicitly drawn rectangle had no circular "size" field.
      // Do not invent one during the one-time legacy migration. On the next
      // save only the edited rectangle dimensions become V2 overrides.
      if(item.custom===true&&!has(item,'size')&&finiteField(item,'width')&&
        finiteField(item,'height'))delete merged.size;
      result[action]=merged;
    }
  }
  return result;
}
function migrateLegacyLayout(parsed){
  const presets=defaultPresets();
  const result={presets,opacity:Number.isFinite(parsed.opacity)?parsed.opacity:DEFAULT_OPACITY,
    handedness:safeSide(parsed.handedness)};
  const originalOnFoot=parsed.onFoot??DEFAULT_ON_FOOT_LAYOUT;
  for(const mode of PAGES){
    let saved=parsed[mode];
    if((mode==='ballista'||mode==='ram')&&!saved){
      // Before each siege machine had its own page, deliberate on-foot
      // edits inherited into mounted controls. Copy, do not alias, them.
      const onFoot=legacyPage('onFoot',originalOnFoot,legacySide('onFoot',originalOnFoot));
      saved=mountedTouchLayout(onFoot,parsed.handedness,mode==='ballista'?'biBye':'generic');
    }
    presets[mode]=legacySide(mode,saved);
    result[mode]=legacyPage(mode,saved,presets[mode]);
  }
  return result;
}
// Browsers embedded in third-party frames may reject localStorage. Preserve
// edits in this tab and report durable-save failure rather than silently
// discarding edits when the workshop reopens.
const sessionLayouts=new WeakMap();
let deniedStorageCache=null;
function resolveStorage(explicit){
  if(explicit!==undefined)return explicit;
  try{return globalThis.localStorage;}catch{return null;}
}
function cachedState(store){
  return store&&typeof store==='object'?sessionLayouts.get(store):deniedStorageCache;
}
function cacheState(store,state){
  if(store&&typeof store==='object')sessionLayouts.set(store,state);
  else deniedStorageCache=state;
}
export function loadTouchLayout(storage=undefined){
  try{
    const store=resolveStorage(storage);
    let raw=null,readSucceeded=false;
    try{raw=store?.getItem?.('ss-touch-layout')??null;readSucceeded=Boolean(store?.getItem);}
    catch{}
    const cache=cachedState(store);
    // A genuine missing/cleared key is respected. Fall back to memory only
    // when persistent writes/reads are unavailable.
    if(!raw&&(!readSucceeded||cache?.persisted===false))raw=cache?.value??null;
    if(!raw)return defaultLayouts();
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object')return defaultLayouts();
    if(parsed.schemaVersion===TOUCH_LAYOUT_SCHEMA_VERSION){
      const presets=Object.fromEntries(PAGES.map(mode=>[mode,safeSide(parsed.presets?.[mode])]));
      return {...Object.fromEntries(PAGES.map(mode=>[
        mode,hydratePage(mode,presets[mode],parsed.overrides?.[mode])])),
        presets,opacity:Number.isFinite(parsed.opacity)?parsed.opacity:DEFAULT_OPACITY,
        handedness:safeSide(parsed.handedness)};
    }
    return migrateLegacyLayout(parsed);
  }catch{return defaultLayouts();}
}
export function saveTouchLayout(layout,storage=undefined){
  try{
    const presets=Object.fromEntries(PAGES.map(mode=>[mode,safeSide(layout.presets?.[mode])]));
    const overrides={};
    for(const mode of PAGES){
      const base=baseForPage(mode,presets[mode]);
      overrides[mode]={};
      for(const [action,item]of Object.entries(layout[mode]??{})){
        if(!base[action])continue;
        const patch=placementPatch(item,base[action]);
        if(patch)overrides[mode][action]=patch;
      }
    }
    const value=JSON.stringify({
      schemaVersion:TOUCH_LAYOUT_SCHEMA_VERSION,presets,overrides,
      opacity:Number.isFinite(layout.opacity)?layout.opacity:DEFAULT_OPACITY,
      handedness:safeSide(layout.handedness),
    });
    const store=resolveStorage(storage);
    let persisted=false;
    try{
      if(typeof store?.setItem==='function'){
        store.setItem('ss-touch-layout',value);persisted=true;
      }
    }catch{}
    cacheState(store,{value,persisted});
    return persisted;
  }catch{return false;}
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
