// The Combat Lab: cadence combat (shared/src/combatFrameData.mjs) played with the real Spellblade, against a sparring
// knight, to be felt and tuned before the server takes it. What it puts together:
//   - the rules: a duel simulation (cadenceDuel.mjs) at a fixed 60 Hz;
//   - the bodies: the shipped model and clips, each clip fitted to the frame data (its contact frame on the cut's
//     contact), switched by inertialization (inertialize.mjs) rather than cross-fades, with a generated forehand
//     (NVIDIA Kimodo, retargeted by tools/animation/retarget-bvh.mjs) whose step moves the knight (root motion);
//   - the feel: hit-stop (the whole duel held a moment, as fighting games do), sparks, a camera kick, sound, a beat cue;
//   - the skill: a rhythm strip for your presses, their cut's timeline for your parries, and your numbers.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSpellbladeAsset } from '../game/SpellbladeAssets.mjs';
import { SCENE_PRESENTATION } from '../game/scenePresentation.mjs';
import { CADENCE, CUTS, DEFENCE, summarizeStats } from '../../shared/src/combatFrameData.mjs';
import { DT, createDuel, presentKnight, setPlayerInput, stepDuel } from './cadenceDuel.mjs';
import { Inertializer } from './inertialize.mjs';

const $ = (id) => document.getElementById(id);
const settings = {
  forehand: $('opt-forehand').value, blend: $('opt-blend').value, opponent: $('opt-opponent').value,
  hitStop: $('opt-hitstop').checked, beat: $('opt-beat').checked, timeline: $('opt-timeline').checked, speed: Number($('opt-speed').value),
};

// --- the scene
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(SCENE_PRESENTATION.background);
scene.fog = new THREE.FogExp2(SCENE_PRESENTATION.fogColor, SCENE_PRESENTATION.fogDensity * 2.2);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 120);
scene.add(new THREE.HemisphereLight(SCENE_PRESENTATION.hemisphere.skyColor, SCENE_PRESENTATION.hemisphere.groundColor, SCENE_PRESENTATION.hemisphere.intensity));
const moon = new THREE.DirectionalLight(SCENE_PRESENTATION.moon.color, SCENE_PRESENTATION.moon.intensity);
moon.position.set(-6, 12, 5);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);
const torch = new THREE.PointLight(0xffa25a, SCENE_PRESENTATION.torches.intensity, 14, 1.6);
torch.position.set(4.5, 2.6, -3);
scene.add(torch);
const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: SCENE_PRESENTATION.materials.stoneTop, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(8.95, 9.05, 96), new THREE.MeshBasicMaterial({ color: 0x8a8273 }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.005;
scene.add(ring);
for (let i = 0; i < 8; i += 1) { // posts round the yard, for depth
  const a = (i / 8) * Math.PI * 2;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 0.35), new THREE.MeshStandardMaterial({ color: SCENE_PRESENTATION.materials.darkStone, roughness: 0.9 }));
  post.position.set(Math.cos(a) * 10.5, 1.3, Math.sin(a) * 10.5);
  post.castShadow = true;
  scene.add(post);
}

// --- the bodies
const sanitize = (name) => name.replace(/[[\].:/]/g, '');
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
class Body {
  constructor(asset, clips) {
    this.asset = asset;
    this.group = new THREE.Group();
    this.group.add(asset.root);
    asset.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.mixer = new THREE.AnimationMixer(asset.root);
    this.actions = new Map();
    for (const clip of clips.values()) { const a = this.mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); this.actions.set(clip.name, a); }
    this.bones = [];
    asset.root.traverse((o) => { if (o.isBone) this.bones.push(o); });
    this.pelvis = this.bones.find((b) => b.name === 'pelvis');
    this.chest = this.bones.find((b) => b.name === 'chest');
    this.sword = asset.sockets.sword;
    this.inert = new Inertializer(this.bones.length, { halflife: 0.085 });
    this.key = null;
    this.current = null;
    this.fade = null;
    this.lastShown = null;
    this.flinch = { angle: 0, vel: 0, axis: new THREE.Vector3(1, 0, 0), at: null };
  }

  /** Show `pres` ({ clip, time, key }) this frame; dt: presentation time passed (0 while the duel is held). */
  pose(pres, dt, mode) {
    const action = this.actions.get(pres.clip) ?? this.actions.get('Idle');
    if (this.current && this.current !== action) this.current.setEffectiveWeight(0);
    action.setEffectiveWeight(1);
    action.time = Math.max(0, Math.min(action.getClip().duration, pres.time));
    this.current = action;
    this.mixer.update(0);
    const transition = this.key !== null && pres.key !== this.key;
    this.key = pres.key;
    const rot = this.bones.map((b) => [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]);
    const pos = new Map([['pelvis', [this.pelvis.position.x, this.pelvis.position.y, this.pelvis.position.z]]]);
    let out = { rot, pos };
    if (mode === 'inertialize') {
      if (transition) this.inert.transition(rot, pos, Math.max(dt, 1 / 240));
      out = this.inert.apply(rot, pos, dt);
    } else if (mode === 'crossfade') {
      // the old pose, frozen as it was last shown, faded out over 0.15 s: what a cross-fade does
      if (transition && this.lastShown) this.fade = { from: this.lastShown, t: 0 };
      if (this.fade) {
        this.fade.t += dt;
        const w = Math.min(1, this.fade.t / 0.15);
        out = {
          rot: rot.map((q, i) => { _q.set(...this.fade.from.rot[i]); _q2.set(...q); _q.slerp(_q2, w); return [_q.x, _q.y, _q.z, _q.w]; }),
          pos: new Map([...pos].map(([k, p]) => [k, p.map((c, j) => this.fade.from.pos.get(k)[j] + (c - this.fade.from.pos.get(k)[j]) * w)])),
        };
        if (w >= 1) this.fade = null;
      }
    }
    out.rot.forEach((q, i) => this.bones[i].quaternion.set(q[0], q[1], q[2], q[3]));
    const p = out.pos.get('pelvis');
    this.pelvis.position.set(p[0], p[1], p[2]);
    this.lastShown = out;
    this.applyFlinch(dt);
  }

  /** A blow taken: the chest thrown back from where it came (a spring, felt more than seen). */
  struck(fromWorld) {
    this.group.updateMatrixWorld(true);
    const here = this.group.position;
    _v.set(here.x - fromWorld.x, 0, here.z - fromWorld.z).normalize();
    this.flinch.axis.copy(new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), _v)).normalize();
    this.flinch.vel = 7;
  }

  applyFlinch(dt) {
    const f = this.flinch;
    // a stiff spring: out and back in about a quarter of a second
    const k = 260, c = 26;
    f.vel += (-k * f.angle - c * f.vel) * dt;
    f.angle += f.vel * dt;
    if (Math.abs(f.angle) < 1e-4 && Math.abs(f.vel) < 1e-3) return;
    this.group.updateMatrixWorld(true);
    const parent = this.chest.parent;
    parent.getWorldQuaternion(_q);
    _q2.setFromAxisAngle(f.axis, f.angle);
    // the turn about a world axis, in the chest's parent's frame
    const local = _q.clone().invert().multiply(_q2).multiply(_q);
    this.chest.quaternion.premultiply(local);
  }

  swordPoint(out) {
    this.group.updateMatrixWorld(true);
    return this.sword ? this.sword.localToWorld(out.set(0.345 * 0.7, 0.039 * 0.7, -0.938 * 0.7)) : out.set(0, 1.4, 0).add(this.group.position);
  }
}

// --- sparks, a glint, a camera kick
const SPARK_MAX = 160;
const sparkGeometry = new THREE.BufferGeometry();
const sparkPos = new Float32Array(SPARK_MAX * 3), sparkCol = new Float32Array(SPARK_MAX * 3);
sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
sparks.frustumCulled = false;
scene.add(sparks);
const sparkState = Array.from({ length: SPARK_MAX }, () => ({ life: 0, v: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color() }));
let sparkNext = 0;
function burst(at, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const s = sparkState[sparkNext]; sparkNext = (sparkNext + 1) % SPARK_MAX;
    s.life = 0.25 + Math.random() * 0.3;
    s.p.copy(at);
    s.v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
    s.c.set(color);
  }
}
function stepSparks(dt) {
  sparkState.forEach((s, i) => {
    if (s.life > 0) { s.life -= dt; s.v.y -= 9 * dt; s.p.addScaledVector(s.v, dt); }
    const a = Math.max(0, Math.min(1, s.life * 4));
    sparkPos.set(s.life > 0 ? [s.p.x, s.p.y, s.p.z] : [0, -10, 0], i * 3);
    sparkCol.set([s.c.r * a, s.c.g * a, s.c.b * a], i * 3);
  });
  sparkGeometry.attributes.position.needsUpdate = true;
  sparkGeometry.attributes.color.needsUpdate = true;
}
const glintTexture = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.25, 'rgba(255,210,120,0.6)'); r.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
glint.visible = false;
scene.add(glint);
let glintAt = -1;
let shake = 0;

// --- sound: made, not recorded (a prototype)
const audio = { ctx: null };
function sound() {
  if (!audio.ctx) audio.ctx = new AudioContext();
  return audio.ctx;
}
function tone(freq, dur, { type = 'sine', gain = 0.2, at = 0, slide = 0 } = {}) {
  const ctx = sound(); const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { gain = 0.3, at = 0, freq = 1200, q = 0.8 } = {}) {
  const ctx = sound(); const t = ctx.currentTime + at;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buffer.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = ctx.createBufferSource(); s.buffer = buffer;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  s.connect(f).connect(g).connect(ctx.destination); s.start(t);
}
const SFX = {
  hit: (q) => { noise(0.18, { gain: 0.5, freq: 700 }); tone(90, 0.16, { type: 'triangle', gain: 0.35 * (0.6 + q), slide: 0.6 }); },
  onBeat: () => { tone(1320, 0.12, { gain: 0.06 }); },
  block: () => { noise(0.12, { gain: 0.35, freq: 2400, q: 2 }); tone(330, 0.12, { type: 'square', gain: 0.05 }); },
  parry: () => { tone(1760, 0.35, { gain: 0.12 }); tone(2637, 0.25, { gain: 0.06 }); noise(0.05, { gain: 0.2, freq: 5000 }); },
  perfect: () => { [1760, 2217, 2637].forEach((f, i) => tone(f, 0.6, { gain: 0.09, at: i * 0.012 })); noise(0.06, { gain: 0.25, freq: 6000 }); },
  riposte: () => { tone(220, 0.25, { type: 'sawtooth', gain: 0.06, slide: 0.5 }); },
  tell: () => { noise(0.22, { gain: 0.08, freq: 3200, q: 0.6 }); },
  whiff: () => { tone(160, 0.08, { type: 'square', gain: 0.04 }); },
  tick: (at) => { tone(1050, 0.05, { gain: 0.09, at }); },
  fell: () => { tone(110, 0.6, { type: 'triangle', gain: 0.25, slide: 0.5 }); },
};

// --- the HUD
const callout = $('callout');
let calloutTimer = 0;
function say(text, kind) {
  callout.textContent = text;
  callout.className = `show ${kind}`;
  clearTimeout(calloutTimer);
  calloutTimer = setTimeout(() => { callout.className = kind; }, 450);
}
const pct = (v) => (v == null ? '–' : `${v}%`);
function showStats(stats) {
  const s = summarizeStats(stats);
  $('s-onbeat').textContent = pct(s.onBeatPct);
  $('s-cadence').textContent = s.cadenceMs == null ? '–' : `±${s.cadenceMs} ms`;
  $('s-clean').textContent = pct(s.cleanPct);
  $('s-parry').textContent = pct(s.parryPct);
  $('s-perfect').textContent = pct(s.perfectParryPct);
  $('s-chain').textContent = s.longestChain || '–';
}
// the rhythm strip: from just before your last contact to past the window
const STRIP = { from: -0.1, to: 0.52 };
const stripX = (t) => `${(100 * (t - STRIP.from)) / (STRIP.to - STRIP.from)}%`;
function layoutCadence() {
  const track = document.querySelector('#cadence .track');
  const zone = (sel, a, b) => { const el = track.querySelector(sel); el.style.left = stripX(a); el.style.width = `calc(${stripX(b)} - ${stripX(a)})`; };
  zone('.zone.window', CADENCE.open, CADENCE.close);
  zone('.zone.perfect', CADENCE.beat - CADENCE.perfect, CADENCE.beat + CADENCE.perfect);
  track.querySelector('.tick.contact').style.left = stripX(0);
}
layoutCadence();
const GRADE_COLOURS = { perfect: 'var(--perfect)', good: 'var(--good)', early: 'var(--early)', late: 'var(--late)' };
const pressDots = [];
function addPressDot(grade, offsetMs) {
  const holder = document.querySelector('#cadence .presses');
  const dot = document.createElement('i');
  dot.style.left = stripX(Math.max(STRIP.from, Math.min(STRIP.to, CADENCE.beat + offsetMs / 1000)));
  dot.style.background = GRADE_COLOURS[grade];
  holder.appendChild(dot);
  pressDots.push(dot);
  while (pressDots.length > 6) pressDots.shift().remove();
  pressDots.forEach((d, i) => { d.style.opacity = String(0.25 + (0.75 * (i + 1)) / pressDots.length); });
  const words = { perfect: 'On the beat', good: 'In time', early: 'Early', late: 'Late' };
  $('last-press').textContent = `${words[grade]} ${offsetMs >= 0 ? '+' : '−'}${Math.abs(offsetMs)} ms`;
  $('last-press').style.color = GRADE_COLOURS[grade];
}
function updateHud(duel) {
  const p = duel.player, f = duel.foe;
  $('you-health').style.width = `${p.health}%`; $('you-stamina').style.width = `${p.stamina}%`;
  $('foe-health').style.width = `${f.health}%`; $('foe-stamina').style.width = `${f.stamina}%`;
  // your rhythm: the cursor runs from your latest contact
  const cut = p.cut;
  const cursor = document.querySelector('#cadence .cursor');
  if (cut) { const since = duel.now - cut.contactAt; cursor.style.left = stripX(Math.max(STRIP.from, Math.min(STRIP.to, since))); cursor.style.opacity = since >= STRIP.from ? '1' : '0.25'; }
  else cursor.style.opacity = '0';
  // their cut: when to guard
  const tl = $('foe-timeline');
  tl.hidden = !settings.timeline;
  if (settings.timeline) {
    const c = f.cut;
    const track = tl.querySelector('.track');
    if (c && !c.resolved || (c && duel.now - c.contactAt < 0.25)) {
      const from = c.startedAt, to = c.contactAt + 0.25;
      const x = (t) => `${(100 * (t - from)) / (to - from)}%`;
      const zone = (sel, a, b) => { const el = track.querySelector(sel); el.style.left = x(a); el.style.width = `calc(${x(b)} - ${x(a)})`; };
      zone('.zone.startup', from, c.contactAt - 0.09);
      zone('.zone.parry', c.contactAt - DEFENCE.parry, c.contactAt - DEFENCE.perfect);
      zone('.zone.perfect', c.contactAt - DEFENCE.perfect, c.contactAt);
      zone('.zone.active', c.contactAt, c.contactAt + 0.045);
      track.querySelector('.tick.tell').style.left = x(c.contactAt - CUTS[c.name].tellLead);
      track.querySelector('.cursor').style.left = x(Math.min(to, duel.now));
      tl.style.opacity = '1';
    } else tl.style.opacity = '0.35';
  }
}

// --- input
const keys = new Set();
const input = { yaw: 0, attack: false, guard: false, pressedAt: null };
let locked = false;
let cameraMode = 'behind';
renderer.domElement.addEventListener('click', () => {
  if (locked || !$('settings').hidden) return;
  try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch { /* unlocked */ }
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked) $('settings').hidden = false;
});
document.addEventListener('mousemove', (e) => { if (locked) input.yaw -= e.movementX * 0.0024; });
const simClock = { wall: performance.now(), sim: 0 };
const pressNow = () => simClock.sim + Math.max(0, (performance.now() - simClock.wall) / 1000) * settings.speed;
function attackDown() { if (!input.attack) input.pressedAt = pressNow(); input.attack = true; sound(); }
// (a page that cannot lock the mouse, an embedded preview for one, still fights: clicks on the yard count, and the
// knight turns to face his opponent by himself)
document.addEventListener('mousedown', (e) => {
  if (!locked && (e.target !== renderer.domElement || !$('settings').hidden)) return;
  if (e.button === 0) attackDown();
  if (e.button === 2) input.guard = true;
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) input.attack = false; if (e.button === 2) input.guard = false; });
document.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyJ') attackDown();
  if (e.code === 'KeyK') input.guard = true;
  if (e.code === 'KeyV') cameraMode = cameraMode === 'behind' ? 'side' : 'behind';
  if (e.code === 'Escape' && !locked) $('settings').hidden = !$('settings').hidden;
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyJ') input.attack = false;
  if (e.code === 'KeyK') input.guard = false;
});
addEventListener('blur', () => { keys.clear(); input.attack = false; input.guard = false; });
const moveInput = () => ({ x: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), z: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) });

// --- settings
for (const [id, key, read] of [['opt-forehand', 'forehand', (e) => e.value], ['opt-blend', 'blend', (e) => e.value], ['opt-opponent', 'opponent', (e) => e.value],
  ['opt-hitstop', 'hitStop', (e) => e.checked], ['opt-beat', 'beat', (e) => e.checked], ['opt-timeline', 'timeline', (e) => e.checked], ['opt-speed', 'speed', (e) => Number(e.value)]]) {
  $(id).addEventListener('change', (e) => { settings[key] = read(e.target); applySettings(); });
}
$('resume').addEventListener('click', () => {
  $('settings').hidden = true;
  sound();
  // (may be refused, an embedded preview for one: the lab plays unlocked)
  try { const p = renderer.domElement.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* unlocked */ }
});
$('reset-stats').addEventListener('click', () => { if (duel) { duel.player.stats = createDuel().player.stats; showStats(duel.player.stats); } });

// --- load
let duel = null, you = null, foe = null;
const variants = {};
async function loadVariant(name) {
  const meta = await (await fetch(`client/lab/assets/kimodo-forehand-${name}.motion.json`, { cache: 'no-store' })).json();
  const gltf = await new GLTFLoader().loadAsync(`client/lab/assets/kimodo-forehand-${name}.motion.glb?v=${meta.sha256.slice(0, 12)}`);
  const clip = gltf.animations[0];
  clip.name = `Kimodo_Forehand_${name}`;
  return { clip, cut: { ...CUTS.forehand, clip: clip.name, ...meta.markers, rootMotion: meta.rootMotion } };
}
function applySettings() {
  if (!duel) return;
  if (settings.forehand === 'argon') delete duel.variants.forehand;
  else duel.variants.forehand = variants[settings.forehand].cut;
  if (duel.opponent !== settings.opponent) { duel.opponent = settings.opponent; duel.foe.stats = duel.foe.stats; }
  $('foe-name').textContent = { drill: 'Drill knight', spar: 'Sparring knight', dummy: 'Dummy' }[settings.opponent];
  for (const b of [you, foe]) { b.inert.reset(); b.fade = null; }
}

async function start() {
  const [a, b, v7, v42] = await Promise.all([createSpellbladeAsset(), createSpellbladeAsset(), loadVariant('seed7'), loadVariant('seed42')]);
  variants.seed7 = v7; variants.seed42 = v42;
  b.setCloth('azure');
  const clipsOf = (asset) => {
    const map = new Map([...asset.animator.actions.values()].map((action) => [action.getClip().name, action.getClip()]));
    for (const v of [v7, v42]) map.set(v.clip.name, v.clip);
    return map;
  };
  you = new Body(a, clipsOf(a));
  foe = new Body(b, clipsOf(b));
  scene.add(you.group, foe.group);
  $('model-rev').textContent = `${a.sourceRevision.slice(0, 8)}; forehand takes: Kimodo-SOMA-RP-v1, ${v7.cut.clip}, ${v42.cut.clip}`;
  duel = createDuel({ opponent: settings.opponent });
  input.yaw = duel.player.yaw;
  applySettings();
  $('loading').hidden = true;
  requestAnimationFrame(frame);
}

// --- the loop: the duel at 60 Hz (held while a blow's hit-stop lasts), the bodies every frame
let last = performance.now(), acc = 0, held = 0;
const cam = { pos: new THREE.Vector3(0, 2, 6), look: new THREE.Vector3() };
function handle(events) {
  for (const e of events) {
    if (e.type === 'press' && e.who === 'player') addPressDot(e.grade, e.offsetMs);
    if (e.type === 'tell' && e.who === 'foe') { glintAt = 0; SFX.tell(); }
    if (e.type === 'cutStart' && e.riposte && e.who === 'player') { say('Riposte', 'riposte'); SFX.riposte(); }
    if (e.type === 'feint' && e.who === 'player') say('Feint', 'feint');
    if (e.type === 'whiff' && e.who === 'player') { say('Whiff', 'bad'); SFX.whiff(); }
    if (e.type === 'fell') { SFX.fell(); say(e.who === 'player' ? 'You fell' : 'He falls', e.who === 'player' ? 'bad' : 'riposte'); }
    if (e.type === 'respawn') { you.inert.reset(); foe.inert.reset(); }
    if (e.type !== 'contact' || e.outcome === 'miss') continue;
    const attacker = e.who === 'player' ? you : foe, defender = e.who === 'player' ? foe : you;
    const at = attacker.swordPoint(new THREE.Vector3());
    if (settings.hitStop && e.hitStop) held = Math.max(held, e.hitStop);
    if (e.outcome === 'hit') {
      burst(at, e.riposte ? 0xffd27a : e.grade === 'perfect' ? 0xfff0c0 : 0xff7a4a, e.quality > 0.8 ? 26 : 16, 3.2);
      SFX.hit(e.quality ?? 0.5);
      defender.struck(attacker.group.position);
      shake = Math.max(shake, e.who === 'player' ? 0.05 : 0.09);
      if (e.who === 'player' && e.grade === 'perfect') SFX.onBeat();
    } else if (e.outcome === 'block' || e.outcome === 'guardBreak') {
      burst(at, 0xfff2c8, 12, 2.4); SFX.block(); shake = Math.max(shake, 0.04);
      if (e.target === 'player') say(e.outcome === 'guardBreak' ? 'Guard broken' : 'Block', e.outcome === 'guardBreak' ? 'bad' : 'block');
    } else if (e.outcome === 'parry') {
      burst(at, 0xbfe2ff, 22, 3.5); SFX.parry(); shake = Math.max(shake, 0.05);
      say(e.target === 'player' ? 'Parry' : 'Parried', e.target === 'player' ? 'parry' : 'bad');
    } else if (e.outcome === 'perfect') {
      burst(at, 0xffe08a, 44, 4.5); SFX.perfect(); shake = Math.max(shake, 0.08);
      say(e.target === 'player' ? 'Perfect Parry' : 'Perfectly parried', e.target === 'player' ? 'perfect' : 'bad');
    }
    // the beat cue: a tick on the beat after each of your contacts (after the hit-stop, which holds the beat too)
    if (e.who === 'player' && settings.beat) SFX.tick(((settings.hitStop ? e.hitStop ?? 0 : 0) + CADENCE.beat) / settings.speed);
  }
}

let paused = false;
function frame(nowMs) {
  const real = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  // (the duel waits while the settings are open: nobody is cut down reading them)
  if (!paused) update($('settings').hidden ? real : 0);
  requestAnimationFrame(frame);
}

// one frame: real seconds passed (scaled by the slow-motion setting)
function update(real) {
  const dt = real * settings.speed;
  // unlocked: face the opponent (a lock-on), turning at a knight's pace
  if (!locked && duel.foe.alive) {
    const want = Math.atan2(-(duel.foe.pos.x - duel.player.pos.x), -(duel.foe.pos.z - duel.player.pos.z));
    const turn = Math.atan2(Math.sin(want - input.yaw), Math.cos(want - input.yaw));
    input.yaw += Math.max(-7 * dt, Math.min(7 * dt, turn));
  }
  let shownDt = dt;
  if (held > 0) { const take = Math.min(held, dt); held -= take; shownDt = dt - take; }
  else acc += dt;
  let steps = 0;
  while (acc >= DT && steps < 8 && held <= 0) {
    acc -= DT;
    steps += 1;
    const pressed = input.pressedAt != null;
    setPlayerInput(duel, { move: moveInput(), yaw: input.yaw, attack: input.attack, guard: input.guard, pressed, pressedAt: input.pressedAt });
    input.pressedAt = null;
    const events = stepDuel(duel);
    simClock.sim = duel.now; simClock.wall = performance.now();
    handle(events);
  }
  // the bodies at the duel's time (between steps: the remainder)
  const showAt = duel.now + Math.min(acc, DT);
  for (const [body, k] of [[you, duel.player], [foe, duel.foe]]) {
    body.group.position.set(k.pos.x, 0, k.pos.z);
    body.group.rotation.y = k.yaw;
    body.pose(presentKnight(duel, k, showAt), shownDt, settings.blend);
  }
  // the glint along their blade as the tell comes
  if (glintAt >= 0) {
    glintAt += dt;
    const s = Math.sin(Math.min(1, glintAt / 0.22) * Math.PI);
    glint.visible = s > 0.01;
    foe.swordPoint(glint.position);
    glint.scale.setScalar(0.25 + 0.55 * s);
    glint.material.opacity = s;
    if (glintAt > 0.22) { glintAt = -1; glint.visible = false; }
  }
  stepSparks(dt);
  // the camera: over your shoulder, or square to the duel
  const p = duel.player, f = duel.foe;
  const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  if (cameraMode === 'behind') {
    // locked to the duel, as duel games do: behind you and off your right shoulder, looking at the space between the
    // two of you, so your own back never hides the blade coming at you (a camera behind your facing put the two of
    // you on one line and did)
    const line = new THREE.Vector3(f.pos.x - p.pos.x, 0, f.pos.z - p.pos.z);
    if (line.lengthSq() < 0.01 || !f.alive) line.copy(fwd); else line.normalize();
    const side = new THREE.Vector3(-line.z, 0, line.x);
    wantPos.set(p.pos.x, 2.6, p.pos.z).addScaledVector(line, -3.1).addScaledVector(side, 2.2);
    wantLook.set((p.pos.x + f.pos.x) / 2, 1.15, (p.pos.z + f.pos.z) / 2);
    if (!f.alive) wantLook.set(p.pos.x, 1.15, p.pos.z).addScaledVector(fwd, 2.5);
  } else {
    const mid = new THREE.Vector3((p.pos.x + f.pos.x) / 2, 1.2, (p.pos.z + f.pos.z) / 2);
    const across = new THREE.Vector3(f.pos.z - p.pos.z, 0, -(f.pos.x - p.pos.x)).normalize();
    wantPos.copy(mid).addScaledVector(across, 5.2).setY(1.7);
    wantLook.copy(mid);
  }
  // (held, the camera goes straight to its framing)
  const k = real > 0 ? 1 - Math.exp(-real * 14) : 1;
  cam.pos.lerp(wantPos, k); cam.look.lerp(wantLook, k);
  camera.position.copy(cam.pos);
  if (shake > 0.001) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= Math.exp(-real * 18); }
  camera.lookAt(cam.look);
  moon.target.position.set(p.pos.x, 0, p.pos.z);
  moon.position.set(p.pos.x - 6, 12, p.pos.z + 5);
  updateHud(duel);
  if ((duel.tick & 7) === 0) showStats(duel.player.stats);
  renderer.render(scene, camera);
}

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
// (for checking the lab from a script: the duel, the settings, and a way to press)
globalThis.__combatLab = {
  get duel() { return duel; }, settings, input, press: attackDown, release: () => { input.attack = false; },
  applySettings, keys, setCamera: (mode) => { cameraMode = mode; },
  // a stalled loop (a hidden page) started again, and the frame as drawn
  kick: () => requestAnimationFrame(frame),
  // a clock of its own (for captures): paused, then advanced by exact frames
  pause: (on = true) => { paused = on; },
  advance: (seconds, fps = 60) => { for (let t = 0; t < seconds - 1e-9; t += 1 / fps) update(1 / fps); },
  snapshot: (quality = 0.85) => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', quality); },
};
start().catch((error) => { $('loading').textContent = `The lab could not load: ${error.message}`; console.error(error); });
