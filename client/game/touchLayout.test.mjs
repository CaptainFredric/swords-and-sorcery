import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ON_FOOT_LAYOUT,
  DEFAULT_FLIGHT_LAYOUT,
  mirrorLayoutHorizontal,
  clampPlacement,
  loadTouchLayout,
  saveTouchLayout,
  applyLayoutItem,
  MIN_BUTTON_SIZE,
  MAX_BUTTON_SIZE,
} from './touchLayout.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('touch layout defaults: on-foot and flight layouts contain all required controls', () => {
  // On-foot controls
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.stick);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.attack);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.guard);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.dash);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.jump);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.spell);

  // Flight controls: Section A & B specification
  assert.ok(DEFAULT_FLIGHT_LAYOUT.stick);
  assert.equal(DEFAULT_FLIGHT_LAYOUT.flightRise, undefined, 'rail is anchored to the stick, not a legacy button');
  assert.equal(DEFAULT_FLIGHT_LAYOUT.flightLower, undefined);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.guard);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.attack);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.jump);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeWeapon);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeSkill);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.dash);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.ultimate);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeView);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.interact);

  // Redesigned right-hand ladder, with real nonoverlapping touch rectangles.
  assert.ok(DEFAULT_FLIGHT_LAYOUT.guard.right >
    DEFAULT_FLIGHT_LAYOUT.attack.right+DEFAULT_FLIGHT_LAYOUT.attack.width,
    'Guard is to the left of the wider Sword');
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeWeapon.width>DEFAULT_FLIGHT_LAYOUT.attack.width,
    'Bolt now extends farther toward Guard without reducing Sword');
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeWeapon.right+DEFAULT_FLIGHT_LAYOUT.siegeWeapon.width>=
    DEFAULT_FLIGHT_LAYOUT.guard.right,
    'the upper Bolt target reaches at least the inner edge of Guard');
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeWeapon.bottom >=
    DEFAULT_FLIGHT_LAYOUT.attack.bottom+DEFAULT_FLIGHT_LAYOUT.attack.height+4,
    'Bolt occupies the second row directly above Sword');
  assert.equal(DEFAULT_FLIGHT_LAYOUT.jump.right,DEFAULT_FLIGHT_LAYOUT.siegeWeapon.right,
    'Jump is directly above Bolt, reachable by a single upward thumb swipe');
  assert.ok(DEFAULT_FLIGHT_LAYOUT.jump.bottom>=
    DEFAULT_FLIGHT_LAYOUT.siegeWeapon.bottom+DEFAULT_FLIGHT_LAYOUT.siegeWeapon.height+4);
  assert.equal(DEFAULT_FLIGHT_LAYOUT.dash.bottom,DEFAULT_FLIGHT_LAYOUT.jump.bottom);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.dash.right>DEFAULT_FLIGHT_LAYOUT.jump.right+DEFAULT_FLIGHT_LAYOUT.jump.size,
    'Dash moves to the left of Jump');
  assert.equal(DEFAULT_FLIGHT_LAYOUT.siegeSkill.bottom,DEFAULT_FLIGHT_LAYOUT.ultimate.bottom);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeSkill.right>
    DEFAULT_FLIGHT_LAYOUT.ultimate.right+DEFAULT_FLIGHT_LAYOUT.ultimate.size,
    'Skill is beside Ultimate, not below Dash');
  assert.ok(DEFAULT_FLIGHT_LAYOUT.ultimate.bottom>
    DEFAULT_FLIGHT_LAYOUT.jump.bottom+DEFAULT_FLIGHT_LAYOUT.jump.size);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.stick.left>0,'stick and its Rise/Lower rail remain anchored');
});

test('mirrorLayoutHorizontal swaps left and right anchors and marks customized', () => {
  const orig = {
    stick: { left: 118, bottom: 110, size: 112 },
    attack: { right: 24, bottom: 24, size: 74 },
  };
  const mirrored = mirrorLayoutHorizontal(orig);
  assert.equal(mirrored.stick.right, 118);
  assert.equal(mirrored.stick.left, undefined);
  assert.equal(mirrored.attack.left, 24);
  assert.equal(mirrored.attack.right, undefined);
  assert.equal(mirrored.stick.custom, true);
  assert.equal(mirrored.attack.custom, true);
});

test('clampPlacement enforces minimum target dimensions and safe screen bounds', () => {
  const viewport = { width: 800, height: 450 };

  // Too small size is clamped to MIN_BUTTON_SIZE
  const small = clampPlacement({ right: 20, bottom: 20, size: 20 }, viewport);
  assert.equal(small.size, MIN_BUTTON_SIZE);

  // Too large size is clamped to MAX_BUTTON_SIZE
  const large = clampPlacement({ right: 20, bottom: 20, size: 200 }, viewport);
  assert.equal(large.size, MAX_BUTTON_SIZE);

  // Position out of bounds is clamped inside viewport
  const outOfBounds = clampPlacement({ left: -50, top: -100, size: 50 }, viewport);
  assert.ok(outOfBounds.left >= 4);
  assert.ok(outOfBounds.top >= 4);

  const overflowRight = clampPlacement({ right: 900, bottom: 600, size: 50 }, viewport);
  assert.ok(overflowRight.right <= viewport.width - 50);
  assert.ok(overflowRight.bottom <= viewport.height - 50);
});

test('loadTouchLayout and saveTouchLayout roundtrip via storage', () => {
  const storage = memoryStorage();
  const initial = loadTouchLayout(storage);
  assert.equal(initial.handedness, 'right');
  assert.equal(initial.opacity, 0.85);

  initial.opacity = 0.6;
  initial.handedness = 'left';
  initial.flight.attack.size = 85;
  saveTouchLayout(initial, storage);

  const reloaded = loadTouchLayout(storage);
  assert.equal(reloaded.opacity, 0.6);
  assert.equal(reloaded.handedness, 'left');
  assert.equal(reloaded.flight.attack.size, 85);
});

test('applyLayoutItem sets inline CSS custom properties only when customized', () => {
  const element = {
    style: {
      setProperty: (k, v) => { element.style[k] = v; },
    },
  };

  // Not custom: does not overwrite CSS
  applyLayoutItem(element, { right: 24, bottom: 24, size: 74, custom: false });
  assert.equal(element.style.right, undefined);

  // Custom: applies positions and size
  applyLayoutItem(element, { right: 30, bottom: 40, size: 70, custom: true });
  assert.match(element.style.right, /30px/);
  assert.match(element.style.bottom, /40px/);
  assert.equal(element.style['--size'], '70px');
});


test('legacy default Crouch moves away from the joystick extension without overriding customization', () => {
  const old = {
    onFoot: {
      ...DEFAULT_ON_FOOT_LAYOUT,
      crouch: { left: 90, bottom: 196, size: 50 },
    },
    flight: DEFAULT_FLIGHT_LAYOUT,
  };
  const storage = memoryStorage();
  storage.setItem('ss-touch-layout', JSON.stringify(old));
  let current = loadTouchLayout(storage);
  assert.deepEqual(current.onFoot.crouch, { left: 190, bottom: 187, size: 50 });
  storage.setItem('ss-touch-layout', JSON.stringify({
    ...old,
    onFoot: { ...old.onFoot, crouch: { ...old.onFoot.crouch, custom: true } },
  }));
  current = loadTouchLayout(storage);
  assert.equal(current.onFoot.crouch.left, 90, 'explicitly customized positions are preserved');
});

test('older saved flight layouts migrate safely while preserving custom coordinates', () => {
  const oldSaved = {
    onFoot: DEFAULT_ON_FOOT_LAYOUT,
    flight: {
      attack: { right: 40, bottom: 50, size: 70, custom: true },
      dash: { right: 30, bottom: 160, size: 60 },
    },
  };
  const storage = memoryStorage();
  storage.setItem('ss-touch-layout', JSON.stringify(oldSaved));
  const loaded = loadTouchLayout(storage);
  assert.equal(loaded.flight.attack.right, 40, 'custom attack placement preserved');
  assert.equal(loaded.flight.attack.custom, true);
  assert.ok(loaded.flight.siegeWeapon, 'missing controls like siegeWeapon populated from default');
  assert.ok(loaded.flight.guard, 'missing controls like guard populated from default');
});


test('leaving a custom mode removes stale inline placement before applying the next',async()=>{
 const {clearLayoutItem}=await import('./touchLayout.mjs');
 const element={style:{setProperty(k,v){this[k]=v;}}};
 applyLayoutItem(element,{left:25,top:20,width:85,height:75,custom:true});
 clearLayoutItem(element);
 for(const key of ['left','right','top','bottom','width','height','--size'])assert.equal(element.style[key],'');
});
test('unchanged legacy flight controls migrate, deliberately edited controls stay',()=>{
 const storage=memoryStorage();
 storage.setItem('ss-touch-layout',JSON.stringify({flight:{
  dash:{right:24,bottom:172,size:58},
  guard:{right:130,bottom:40,size:70,custom:true}
 }}));
 const loaded=loadTouchLayout(storage);
 assert.deepEqual(loaded.flight.dash,DEFAULT_FLIGHT_LAYOUT.dash);
 assert.equal(loaded.flight.guard.right,130);
});

test('every mounted machine places untouched Leave and View in the auxiliary row, preserving deliberate edits',async()=>{
 const {mountedTouchLayout}=await import('./touchLayout.mjs');
 const right=mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT);
 assert.equal(right.interact.top,DEFAULT_FLIGHT_LAYOUT.interact.top);
 assert.equal(right.interact.bottom,undefined);
 assert.equal(right.siegeView.right,DEFAULT_FLIGHT_LAYOUT.siegeView.right);
 const mirrored=mountedTouchLayout(mirrorLayoutHorizontal(DEFAULT_ON_FOOT_LAYOUT),'left');
 assert.equal(mirrored.interact.left,DEFAULT_FLIGHT_LAYOUT.interact.right);
 assert.equal(mirrored.interact.top,DEFAULT_FLIGHT_LAYOUT.interact.top);
 const custom={right:40,bottom:50,size:55,custom:true};
 assert.deepEqual(mountedTouchLayout({...DEFAULT_ON_FOOT_LAYOUT,interact:custom}).interact,custom);
});

test('old unedited flight grid migrates to wide Bolt and adjacent Skill/Ultimate',()=>{
 const storage=memoryStorage();
 const flight={
  stick:{left:82,bottom:91,size:112,type:'stick'},
  guard:{right:88,bottom:12,size:64},
  attack:{right:14,bottom:12,size:64},
  siegeWeapon:{right:88,bottom:84,size:64},
  jump:{right:14,bottom:84,size:60},
  siegeSkill:{right:88,bottom:154,size:60},
  dash:{right:14,bottom:154,size:60},
  spell:{right:88,bottom:220,size:54},
  ultimate:{right:14,bottom:220,size:54},
 };
 storage.setItem('ss-touch-layout',JSON.stringify({flight}));
 const migrated=loadTouchLayout(storage);
 for(const name of ['attack','siegeWeapon','jump','dash','siegeSkill','ultimate'])
  assert.deepEqual(migrated.flight[name],DEFAULT_FLIGHT_LAYOUT[name],name+' migrates');
 const custom={right:260,bottom:112,width:100,height:66,custom:true};
 storage.setItem('ss-touch-layout',JSON.stringify({flight:{...flight,attack:custom}}));
 assert.deepEqual(loadTouchLayout(storage).flight.attack,custom,'explicit size and placement survive');
});

test('previous flight rectangles become round defaults while edited targets remain intact',()=>{
 const storage=memoryStorage();
 storage.setItem('ss-touch-layout',JSON.stringify({flight:{
  siegeWeapon:{right:88,bottom:82,width:64,height:54},
  attack:{right:14,bottom:12,width:68,height:64},
  guard:{right:120,bottom:20,size:70,custom:true},
 }}));
 const loaded=loadTouchLayout(storage);
 assert.deepEqual(loaded.flight.siegeWeapon,DEFAULT_FLIGHT_LAYOUT.siegeWeapon);
 assert.deepEqual(loaded.flight.attack,DEFAULT_FLIGHT_LAYOUT.attack);
 assert.equal(loaded.flight.guard.right,120);
 assert.equal(loaded.flight.guard.size,70);
});
test('stock mounted firing controls stay in the right thumb area with distinct targets',async()=>{
 const {mountedTouchLayout}=await import('./touchLayout.mjs');
 const layout=mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT);
 const actions=['attack','siegeSkill'];
 for(const action of actions){
  const a=layout[action];assert.ok(a.right+a.size<=168);
  for(const other of actions.filter(k=>k!==action)){
   const b=layout[other];
   assert.ok(a.right+a.size<=b.right||b.right+b.size<=a.right||
    a.bottom+a.size<=b.bottom||b.bottom+b.size<=a.bottom,action+' overlaps '+other);
  }
 }
});

test('Bi-Bye-llista has a distinct compact nonoverlapping right-thumb cluster',async()=>{
 const {mountedTouchLayout}=await import('./touchLayout.mjs');
 const l=mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT,'right','biBye');
 const items=['attack','siegeSkill','siegeBoth','siegeWeapon','deploy','interact','siegeView','spell'];
 const bounds=name=>{const p=l[name],s=p.size;return {
  left:568-(p.right??0)-s,right:568-(p.right??0),
  top:p.top??320-p.bottom-s,bottom:p.top!=null?p.top+s:320-p.bottom
 };};
 for(const a of items){
  const x=bounds(a);assert.ok(x.left>=0&&x.top>=0&&x.right<=568&&x.bottom<=320,a+' offscreen');
  for(const b of items.filter(b=>b!==a)){
   const y=bounds(b);
   assert.ok(x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top,a+' overlaps '+b);
  }
 }
 assert.ok(l.attack.size>l.siegeSkill.size);
 assert.ok(l.siegeBoth.bottom>l.attack.bottom+l.attack.size);
 assert.equal(l.deploy.top,l.siegeWeapon.top);
 const legacy=mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT,'right','generic');
 assert.deepEqual(legacy,mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT));
 assert.notDeepEqual(legacy.attack,l.attack);
 const custom={right:191,bottom:42,size:71,custom:true};
 assert.deepEqual(mountedTouchLayout({...DEFAULT_ON_FOOT_LAYOUT,attack:custom},'right','biBye').attack,custom);
 const mirrored=mountedTouchLayout(mirrorLayoutHorizontal(DEFAULT_ON_FOOT_LAYOUT),'left','biBye');
 assert.equal(mirrored.attack.left,l.attack.right);
 assert.equal(mirrored.deploy.left,l.deploy.right);
});

test('Bi-Bye View is beside BOTH but away from LEAVE, and custom VIEW stays untouched',async()=>{
 const {mountedTouchLayout}=await import('./touchLayout.mjs');
 const b=mountedTouchLayout(DEFAULT_ON_FOOT_LAYOUT,'right','biBye');
 assert.equal(b.siegeView.top,undefined);
 assert.ok(Math.abs((b.siegeView.bottom+b.siegeView.size/2)-(b.siegeBoth.bottom+b.siegeBoth.size/2))<25);
 const separation=b.siegeView.right-(b.siegeBoth.right+b.siegeBoth.size);
 assert.ok(separation>=12&&separation<55,'VIEW is to the left of BOTH with a deliberate gap');
 assert.ok(b.interact.top===8,'LEAVE stays in the separate top utility corner');
 const custom={right:211,bottom:43,size:49,custom:true};
 assert.deepEqual(mountedTouchLayout({...DEFAULT_ON_FOOT_LAYOUT,siegeView:custom},'right','biBye').siegeView,custom);
});

test('four distinct edit pages persist joystick radius and siege controls without editing one another',async()=>{
 const {DEFAULT_BALLISTA_LAYOUT,DEFAULT_RAM_LAYOUT,TOUCH_LAYOUT_PAGES,layoutForMode}=await import('./touchLayout.mjs');
 assert.deepEqual(TOUCH_LAYOUT_PAGES.map(page=>page.id),['onFoot','flight','ballista','ram']);
 const storage=memoryStorage(),layout=loadTouchLayout(storage);
 assert.deepEqual(layout.ballista,DEFAULT_BALLISTA_LAYOUT);
 assert.deepEqual(layout.ram,DEFAULT_RAM_LAYOUT);
 layout.onFoot.stick={...layout.onFoot.stick,size:140,custom:true};
 layout.flight.stick={...layout.flight.stick,size:154,custom:true};
 layout.ballista.siegeSkill={...layout.ballista.siegeSkill,right:80,size:90,custom:true};
 layout.ram.attack={...layout.ram.attack,right:25,size:103,custom:true};
 saveTouchLayout(layout,storage);
 const next=loadTouchLayout(storage);
 assert.equal(layoutForMode(next,'onFoot').stick.size,140);
 assert.equal(layoutForMode(next,'flight').stick.size,154);
 assert.equal(layoutForMode(next,'ballista').siegeSkill.size,90);
 assert.equal(layoutForMode(next,'ram').attack.size,103);
 assert.notEqual(next.ballista.attack.size,next.ram.attack.size);
 const style={setProperty(k,v){this[k]=v;}};
 applyLayoutItem({style},{left:85,bottom:90,size:154,type:'stick',custom:true});
 assert.equal(style['--stick-size'],'154px');
 assert.match(style.bottom,/stick-size/,'joystick bottom remains the saved center');
 const rect={style:{setProperty(k,v){this[k]=v;}}};
 applyLayoutItem(rect,{right:14,bottom:82,width:140,height:70,size:62,custom:true});
 assert.match(rect.style.width,/140px/);
 assert.match(rect.style.height,/70px/);
});

test('legacy saved on-foot controls are copied, not aliased, into new siege editor pages',()=>{
 const storage=memoryStorage();
 const legacy={onFoot:{...DEFAULT_ON_FOOT_LAYOUT,
   stick:{left:118,bottom:110,size:122,type:'stick',custom:true}}};
 storage.setItem('ss-touch-layout',JSON.stringify(legacy));
 const migrated=loadTouchLayout(storage);
 assert.equal(migrated.onFoot.stick.size,122);
 assert.equal(migrated.ballista.stick.size,122);
 assert.equal(migrated.ram.stick.size,122);
 migrated.ballista.stick.size=164;
 assert.equal(migrated.onFoot.stick.size,122,'editing Ballista does not enlarge Spellblade');
 assert.equal(migrated.ram.stick.size,122,'editing Ballista does not enlarge Ram');
});

test('resizing a default joystick or button never mutates another machine or canonical presets',async()=>{
 const {DEFAULT_BALLISTA_LAYOUT,DEFAULT_RAM_LAYOUT}=await import('./touchLayout.mjs');
 const onFootPresetSize=DEFAULT_ON_FOOT_LAYOUT.stick.size;
 const flightPresetSize=DEFAULT_FLIGHT_LAYOUT.stick.size;
 const ballistaPresetSize=DEFAULT_BALLISTA_LAYOUT.stick.size;
 const ramPresetSize=DEFAULT_RAM_LAYOUT.stick.size;
 const first=loadTouchLayout(memoryStorage());
 first.ballista.stick.size=164;first.ballista.stick.custom=true;
 first.flight.siegeWeapon.width=150;first.flight.siegeWeapon.custom=true;
 assert.equal(first.onFoot.stick.size,onFootPresetSize);
 assert.equal(first.flight.stick.size,flightPresetSize);
 assert.equal(first.ram.stick.size,ramPresetSize);
 assert.equal(DEFAULT_BALLISTA_LAYOUT.stick.size,ballistaPresetSize);
 assert.equal(DEFAULT_FLIGHT_LAYOUT.siegeWeapon.width,122);
 assert.equal(loadTouchLayout(memoryStorage()).ballista.stick.size,ballistaPresetSize,
   'fresh user profile starts from untouched factory sizes');
});

// A stick's saved left/right/top/bottom position is its center, not its edge.
// Resizing must keep the entire movement ring inside the viewport.
test('joystick safe bounds use its resized center while rectangular bounds use final dimensions',()=>{
 const viewport={width:800,height:450};
 const left=clampPlacement({left:3,bottom:60,size:172,type:'stick'},viewport);
 assert.equal(left.size,172);
 assert.equal(left.left,90,'left edge is 4px inside the viewport');
 assert.equal(left.bottom,90,'bottom edge is 4px inside the viewport');
 const right=clampPlacement({right:3,top:2,size:172,type:'stick'},viewport);
 assert.equal(right.right,90);
 assert.equal(right.top,90);
 const far=clampPlacement({left:790,bottom:440,size:172,type:'stick'},viewport);
 assert.equal(far.left,800-90);
 assert.equal(far.bottom,450-90);
 const rectangle=clampPlacement({right:740,bottom:440,width:210,height:120},viewport);
 assert.equal(rectangle.width,160);
 assert.equal(rectangle.height,96);
 assert.equal(rectangle.right,636,'bounds use *clamped* 160px width');
 assert.equal(rectangle.bottom,350,'bounds use *clamped* 96px height');
 const valid=clampPlacement({right:14,bottom:80,width:122,height:62},viewport);
 assert.equal(valid.right,14,'ordinary Bolt remains at intended right edge');
});

test('versioned saves contain only user overrides, never old defaults or a frozen entire page',async()=>{
 const {TOUCH_LAYOUT_SCHEMA_VERSION}=await import('./touchLayout.mjs');
 const storage=memoryStorage(),layout=loadTouchLayout(storage);
 layout.flight.siegeWeapon.width=150;
 layout.flight.attack.bottom=76;
 layout.ballista.siegeSkill.size=93;
 layout.onFoot.jump.right=31;
 layout.opacity=.71;
 saveTouchLayout(layout,storage);
 const stored=JSON.parse(storage.getItem('ss-touch-layout'));
 assert.equal(stored.schemaVersion,TOUCH_LAYOUT_SCHEMA_VERSION);
 assert.deepEqual(stored.overrides.flight.siegeWeapon,{width:150},
   'moving or resizing one field must not freeze unrelated default geometry');
 assert.deepEqual(stored.overrides.flight.attack,{bottom:76});
 assert.deepEqual(stored.overrides.ballista.siegeSkill,{size:93});
 assert.deepEqual(stored.overrides.onFoot.jump,{right:31});
 assert.equal(stored.overrides.flight.dash,undefined,'untouched buttons are not saved at all');
 assert.equal(stored.opacity,.71);
 const next=loadTouchLayout(storage);
 assert.equal(next.flight.siegeWeapon.width,150);
 assert.equal(next.flight.siegeWeapon.bottom,DEFAULT_FLIGHT_LAYOUT.siegeWeapon.bottom);
 assert.equal(next.flight.attack.width,DEFAULT_FLIGHT_LAYOUT.attack.width);
 assert.ok(next.flight.practiceTools,'a new or omitted default action survives without a saved record');
});

test('presets, left-handed mirrored pages and individual edits persist independently',async()=>{
 const {DEFAULT_RAM_LAYOUT,DEFAULT_BALLISTA_LAYOUT}=await import('./touchLayout.mjs');
 const storage=memoryStorage(),layouts=loadTouchLayout(storage);
 layouts.presets.flight='left';
 layouts.flight=mirrorLayoutHorizontal(DEFAULT_FLIGHT_LAYOUT);
 layouts.flight.attack.width=147;
 layouts.flight.attack.custom=true;
 layouts.ballista.siegeSkill.right=72;
 layouts.ballista.siegeSkill.custom=true;
 saveTouchLayout(layouts,storage);
 const stored=JSON.parse(storage.getItem('ss-touch-layout'));
 assert.equal(stored.presets.flight,'left');
 assert.deepEqual(stored.overrides.flight.attack,{width:147});
 assert.equal(stored.overrides.flight.dash,undefined,'mirrored preset is not mistaken for thirteen user overrides');
 const loaded=loadTouchLayout(storage);
 assert.equal(loaded.flight.attack.left,DEFAULT_FLIGHT_LAYOUT.attack.right);
 assert.equal(loaded.flight.attack.width,147);
 assert.equal(loaded.flight.dash.left,DEFAULT_FLIGHT_LAYOUT.dash.right);
 assert.equal(loaded.ballista.siegeSkill.right,72);
 assert.deepEqual(loaded.ram,DEFAULT_RAM_LAYOUT,'unrelated machine defaults remain pristine');
 assert.equal(loaded.ballista.attack.right,DEFAULT_BALLISTA_LAYOUT.attack.right);
});

test('legacy unedited full layout snapshots migrate to the newest flight and on-foot presets',()=>{
 const storage=memoryStorage();
 const outgoing={
   stick:{left:82,bottom:91,size:112,type:'stick'},
   guard:{right:88,bottom:12,size:64},
   attack:{right:14,bottom:12,size:64},
   siegeWeapon:{right:88,bottom:84,size:64},
   jump:{right:14,bottom:84,size:60},
   siegeSkill:{right:88,bottom:154,size:60},
   dash:{right:14,bottom:154,size:60},
   spell:{right:88,bottom:220,size:54},
   ultimate:{right:14,bottom:220,size:54},
 };
 storage.setItem('ss-touch-layout',JSON.stringify({
   onFoot:{...DEFAULT_ON_FOOT_LAYOUT,crouch:{left:90,bottom:196,size:50}},
   flight:outgoing,handedness:'right'
 }));
 const loaded=loadTouchLayout(storage);
 for(const action of Object.keys(outgoing))
   assert.deepEqual(loaded.flight[action],DEFAULT_FLIGHT_LAYOUT[action],
     action+' adopts its newest default despite the old complete snapshot');
 assert.deepEqual(loaded.onFoot.crouch,DEFAULT_ON_FOOT_LAYOUT.crouch);
 saveTouchLayout(loaded,storage);
 const next=JSON.parse(storage.getItem('ss-touch-layout'));
 assert.deepEqual(next.overrides.flight,{});
 assert.deepEqual(next.overrides.onFoot,{});
});

test('a legacy change to just button size survives while its old placement updates to modern defaults',()=>{
 const storage=memoryStorage();
 storage.setItem('ss-touch-layout',JSON.stringify({
  flight:{attack:{right:14,bottom:12,size:77,custom:true}},
 }));
 const loaded=loadTouchLayout(storage);
 assert.equal(loaded.flight.attack.size,77);
 assert.equal(loaded.flight.attack.bottom,DEFAULT_FLIGHT_LAYOUT.attack.bottom);
 assert.equal(loaded.flight.attack.width,DEFAULT_FLIGHT_LAYOUT.attack.width);
 saveTouchLayout(loaded,storage);
 assert.deepEqual(JSON.parse(storage.getItem('ss-touch-layout')).overrides.flight.attack,{size:77});
});

test('older completely mirrored flight presets are recognized as untouched, not intentional edits',()=>{
 const storage=memoryStorage();
 storage.setItem('ss-touch-layout',JSON.stringify({
   handedness:'left',flight:{
     stick:{right:82,bottom:91,size:112,type:'stick',custom:true},
     attack:{left:14,bottom:12,size:64,custom:true},
     siegeWeapon:{left:88,bottom:84,size:64,custom:true},
     dash:{left:14,bottom:154,size:60,custom:true},
     jump:{left:14,bottom:84,size:60,custom:true},
   },
 }));
 const loaded=loadTouchLayout(storage);
 assert.equal(loaded.presets.flight,'left');
 assert.equal(loaded.flight.attack.left,DEFAULT_FLIGHT_LAYOUT.attack.right);
 assert.equal(loaded.flight.attack.width,DEFAULT_FLIGHT_LAYOUT.attack.width);
 assert.equal(loaded.flight.siegeWeapon.left,DEFAULT_FLIGHT_LAYOUT.siegeWeapon.right);
 saveTouchLayout(loaded,storage);
 assert.deepEqual(JSON.parse(storage.getItem('ss-touch-layout')).overrides.flight,{});
});

test('layout workshop previews share game scale, avoid Arena Menu and preserve editor-only orientation mapping',async()=>{
 const {readFileSync}=await import('node:fs');
 const mobile=readFileSync(new URL('../mobile.css',import.meta.url),'utf8');
 const editor=readFileSync(new URL('./TouchLayoutEditor.mjs',import.meta.url),'utf8');
 const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
 const controls=readFileSync(new URL('./TouchControls.mjs',import.meta.url),'utf8');
 assert.match(mobile,/touch-layout-detached\s*\{position:absolute !important/);
 const editorStyle=mobile.slice(mobile.indexOf('.touch-controls.touch-layout-editing {'),
   mobile.indexOf('@container app (min-height:560px)',mobile.indexOf('.touch-controls.touch-layout-editing {')));
 assert.doesNotMatch(editorStyle,/--s\s*:/,'editor must not replace live computed CSS scale');
 assert.match(editor,/closest\?\.\('#game-shell'\)/);
 assert.match(editor,/screenTurn\?\.vector\(delta.x,delta.y\)/);
 assert.match(editor,/classList.add\('touch-layout-editor-open'\)/);
 assert.match(mobile,/body\.touch-layout-editor-open #pause-menu/);
 assert.match(main,/if\(runtime\?\.touchLayoutEditor\?\.active\)/);
 assert.match(controls,/applyLayoutItem\(element,\s*mode!=='onFoot'\?\{\.\.\.placement,custom:true\}:placement\)/,
   'all active controls, including default on-foot controls, render canonical layout values');
});

test('blocked browser storage retains customized positions in session without claiming persistence',()=>{
 const blocked={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
 const initial=loadTouchLayout(blocked);
 initial.flight.jump.bottom=191;
 assert.equal(saveTouchLayout(initial,blocked),false,'durable save must report the denial');
 const restored=loadTouchLayout(blocked);
 assert.equal(restored.flight.jump.bottom,191,'tab-local layout must not vanish on reopening editor');
 assert.equal(restored.flight.attack.width,DEFAULT_FLIGHT_LAYOUT.attack.width);
 const other=memoryStorage();
 assert.equal(loadTouchLayout(other).flight.jump.bottom,DEFAULT_FLIGHT_LAYOUT.jump.bottom,
   'session cache must never leak into a distinct storage profile');
});

test('SO-FIST-ICATION has a non-overlapping mobile control ladder with hydraulic controls',async()=>{
 const {DEFAULT_RAM_LAYOUT,mirrorLayoutHorizontal}=await import('./touchLayout.mjs');
 const actions=['attack','siegeSkill','spell','jump','crouch','interact','siegeView'];
 const bounds=(name,layout)=>{const p=layout[name],w=p.width??p.size,h=p.height??p.size;
  return {left:p.left!=null?p.left:568-(p.right??0)-w,
    right:p.left!=null?p.left+w:568-(p.right??0),
    top:p.top??320-p.bottom-h,bottom:p.top!=null?p.top+h:320-p.bottom};};
 for(const layout of [DEFAULT_RAM_LAYOUT,mirrorLayoutHorizontal(DEFAULT_RAM_LAYOUT)]){
  for(const a of actions){
   const x=bounds(a,layout);
   assert.ok(x.left>=0&&x.top>=0&&x.right<=568&&x.bottom<=320,a+' offscreen');
   for(const b of actions.filter(b=>b!==a)){
    const y=bounds(b,layout);
    assert.ok(x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top,
      'Ram '+a+' overlaps '+b);
   }
  }
 }
 assert.equal(DEFAULT_RAM_LAYOUT.jump.bottom,DEFAULT_RAM_LAYOUT.crouch.bottom);
 assert.ok(DEFAULT_RAM_LAYOUT.jump.bottom>DEFAULT_RAM_LAYOUT.attack.bottom+DEFAULT_RAM_LAYOUT.attack.size);
});
