import * as THREE from 'three';
import { oneHitBacklashRemaining } from '../../shared/src/oneHitInfusions.mjs';
import { blusterSeverity, fieldStrength } from '../../shared/src/oneHitStatus.mjs';

// All-Natural Disaster's elements, as they are seen. Presentation only: who was hit, how hard, where a field lies and
// how much of it is left all come from the shared room (snapshots and events). Everything drawn here hangs off one of
// those facts: the gathering comes to the knight's real blade, the eruption starts where the blow landed and runs
// along the fissures the room planned, a field's motes and arcs thin out with the strength the room reports, and a
// status plays on the knight who carries it for as long as they do.
//
// No rings and no bloom: three instanced pools (glowing motes, lit stone, smoke), and lightning built as thick
// branching ribbons. No lights (a light added mid-fight rebuilds every lit shader: effectsBudget.test.mjs).

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const COLOR = Object.freeze({
  fire: [0xffb347, 0xff6a14, 0xd9360f], frost: [0xf2fdff, 0x9adfff, 0x5fb4ea], gale: [0xf2fff4, 0xa6efc4, 0x6fd6a0],
  lightning: [0xfffbe0, 0xffe45c, 0xffc21f], steel: [0xe9edf2, 0xaab3bf, 0x77808c], dust: [0xcabba4, 0xa3927b, 0x7d6f5e],
});
const STONE_TINTS = [0x8a8072, 0x746b60, 0x9a9184, 0x65605a];
// the sword's tip in the right hand bone's own space (the same point scripts/lib/glbPose.mjs measures)
const TIP_IN_HAND = new THREE.Vector3(0.131, 1.3383, -0.1661);

const rand = (a = 1, b = null) => (b === null ? Math.random() * a : a + Math.random() * (b - a));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const tmpColor = new THREE.Color();
const tmpObject = new THREE.Object3D();
const tmpVec = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

// One instanced pool of particles: a ring buffer, so a burst can never grow the scene.
class ParticlePool {
  constructor(parent, geometry, material, capacity, { additive = false } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpColor.set(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.capacity = capacity;
    this.items = [];
    this.additive = additive;
    parent.add(this.mesh);
  }
  spawn(p) {
    if (this.items.length >= this.capacity) this.items.shift();
    const color = tmpColor.set(p.color ?? 0xffffff);
    this.items.push({
      x: p.x, y: p.y, z: p.z, vx: p.vx ?? 0, vy: p.vy ?? 0, vz: p.vz ?? 0,
      sx: p.sx ?? 0.1, sy: p.sy ?? p.sx ?? 0.1, sz: p.sz ?? p.sx ?? 0.1,
      r: color.r, g: color.g, b: color.b, ttl: p.ttl ?? 0.6, life: p.ttl ?? 0.6,
      gravity: p.gravity ?? 0, drag: p.drag ?? 0, grow: p.grow ?? 0, align: Boolean(p.align), floor: p.floor ?? null,
      home: p.home ?? null, pull: p.pull ?? 0, swirl: p.swirl ?? 0, spin: p.spin ?? 0, angle: rand(TAU), tilt: rand(TAU),
      fadeIn: p.fadeIn ?? 0, rest: false,
    });
  }
  update(dt) {
    const items = this.items;
    let n = 0;
    for (let i = 0; i < items.length; i += 1) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      items[n] = p;
      if (!p.rest) {
        if (p.home) {
          // drawn toward a point (the blade), circling it as it comes
          const hx = p.home.x - p.x, hy = p.home.y - p.y, hz = p.home.z - p.z;
          const d = Math.hypot(hx, hy, hz) || 1;
          p.vx += (hx / d * p.pull + -hz / d * p.swirl) * dt;
          p.vy += (hy / d * p.pull) * dt;
          p.vz += (hz / d * p.pull + hx / d * p.swirl) * dt;
          if (d < 0.18) p.life = Math.min(p.life, 0.05);
        }
        p.vy -= p.gravity * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.floor !== null && p.y < p.floor && p.vy < 0) {
          // stone lands, skips once, and lies there
          p.y = p.floor;
          if (Math.abs(p.vy) > 1.6) { p.vy = -p.vy * 0.28; p.vx *= 0.5; p.vz *= 0.5; }
          else { p.rest = true; p.vx = p.vy = p.vz = 0; }
        }
        p.angle += p.spin * dt;
      }
      const age = 1 - p.life / p.ttl;
      const fade = Math.min(1, p.life / (p.ttl * 0.35)) * (p.fadeIn ? Math.min(1, (p.ttl - p.life) / p.fadeIn) : 1);
      const k = 1 + p.grow * age;
      tmpObject.position.set(p.x, p.y, p.z);
      if (p.align) {
        tmpDir.set(p.vx, p.vy, p.vz);
        if (tmpDir.lengthSq() > 1e-8) tmpObject.quaternion.setFromUnitVectors(UP, tmpDir.normalize());
      } else tmpObject.rotation.set(p.tilt, p.angle, p.tilt * 0.5);
      // glowing motes dim out (additive: black is nothing); stone and smoke shrink away at the end
      const shrink = this.additive ? 1 : Math.min(1, p.life / (p.ttl * 0.2));
      tmpObject.scale.set(p.sx * k * shrink, p.sy * k * shrink, p.sz * k * shrink);
      tmpObject.updateMatrix();
      this.mesh.setMatrixAt(n, tmpObject.matrix);
      const glow = this.additive ? fade : 1;
      this.mesh.setColorAt(n, tmpColor.setRGB(p.r * glow, p.g * glow, p.b * glow));
      n += 1;
    }
    items.length = n;
    // (never empty: one unseen instance keeps the pool drawn, so its shader is built before the first blow, not on it)
    if (n === 0) { tmpObject.position.set(0, -1e4, 0); tmpObject.scale.setScalar(1e-6); tmpObject.updateMatrix(); this.mesh.setMatrixAt(0, tmpObject.matrix); }
    this.mesh.count = Math.max(1, n);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// A jagged path from a to b with forks off it, as points and child branches.
function boltPath(a, b, { jag = 0.22, steps = 7, forks = 2, depth = 0 } = {}) {
  const points = [a.clone()];
  const along = b.clone().sub(a);
  const length = along.length() || 1;
  const side = new THREE.Vector3().crossVectors(along, Math.abs(along.y) > length * 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
  const other = new THREE.Vector3().crossVectors(along, side).normalize();
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const sway = jag * length * (0.35 + 0.65 * Math.sin(t * Math.PI));
    points.push(a.clone().addScaledVector(along, t).addScaledVector(side, rand(-1, 1) * sway).addScaledVector(other, rand(-1, 1) * sway));
  }
  points.push(b.clone());
  const branches = [];
  if (depth < 2) for (let f = 0; f < forks; f += 1) {
    const at = 1 + Math.floor(rand(steps - 2));
    const from = points[at];
    const reach = length * rand(0.28, 0.5) * (1 - at / steps * 0.4);
    const to = from.clone().addScaledVector(along, reach / length * rand(0.5, 1))
      .addScaledVector(side, rand(-1, 1) * reach * 0.8).addScaledVector(other, rand(-1, 1) * reach * 0.8);
    branches.push(boltPath(from, to, { jag: jag * 1.15, steps: Math.max(3, steps - 3), forks: depth === 0 ? 1 : 0, depth: depth + 1 }));
  }
  return { points, branches, depth };
}

// Thick ribbons along a bolt's path: a white-yellow core and a wider, dimmer yellow sheath, each as two crossed strips
// so it has width from any side.
function boltGeometry(path, width) {
  const positions = [], colors = [], index = [];
  const core = new THREE.Color(0xfffbe0), sheath = new THREE.Color(0xffd53a);
  const strip = (points, half, color, gain, basis) => {
    const start = positions.length / 3;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const next = points[Math.min(points.length - 1, i + 1)], prev = points[Math.max(0, i - 1)];
      tmpDir.copy(next).sub(prev).normalize();
      tmpVec.crossVectors(tmpDir, basis);
      if (tmpVec.lengthSq() < 1e-6) tmpVec.set(1, 0, 0);
      tmpVec.normalize();
      const taper = half * (i === points.length - 1 ? 0.15 : 1);
      positions.push(p.x + tmpVec.x * taper, p.y + tmpVec.y * taper, p.z + tmpVec.z * taper, p.x - tmpVec.x * taper, p.y - tmpVec.y * taper, p.z - tmpVec.z * taper);
      colors.push(color.r * gain, color.g * gain, color.b * gain, color.r * gain, color.g * gain, color.b * gain);
      if (i) { const k = start + (i - 1) * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  };
  const walk = (node) => {
    const w = width * (node.depth === 0 ? 1 : node.depth === 1 ? 0.55 : 0.32);
    for (const basis of [UP, new THREE.Vector3(1, 0, 0.35).normalize()]) {
      strip(node.points, w * 2.6, sheath, 0.34, basis);
      strip(node.points, w, core, 1, basis);
    }
    node.branches.forEach(walk);
  };
  walk(path);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  return geometry;
}

export class DisasterElementEffects {
  constructor(parent, remotePlayers = null) {
    this.remotePlayers = remotePlayers;
    this.root = new THREE.Group();
    this.root.name = 'All-Natural Disaster elements (presentation only)';
    parent.add(this.root);
    this.glow = new ParticlePool(this.root, new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 560, { additive: true });
    this.rock = new ParticlePool(this.root, new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02, flatShading: true }), 240);
    this.smoke = new ParticlePool(this.root, new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.17, depthWrite: false }), 110);
    this.boltMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.bolts = [];
    // (one unseen bolt, always drawn: every later bolt's material is this program, already built)
    this.warmBolt = new THREE.Mesh(boltGeometry(boltPath(new THREE.Vector3(0, -1e4, 0), new THREE.Vector3(0, -1e4 + 0.01, 0), { forks: 0, steps: 2 }), 1e-5), this.boltMaterial);
    this.warmBolt.frustumCulled = false;
    this.root.add(this.warmBolt);
    // Full Frost's standing ice: its material built (and drawn once, unseen) now, so the first field costs no shader
    this.iceMaterial = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x2a6f9c, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.05,
      transparent: true, opacity: 0.86, flatShading: true });
    this.warmIce = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), this.iceMaterial, 1);
    tmpObject.position.set(0, -1e4, 0); tmpObject.scale.setScalar(1e-6); tmpObject.updateMatrix();
    this.warmIce.setMatrixAt(0, tmpObject.matrix);
    this.warmIce.frustumCulled = false;
    this.root.add(this.warmIce);
    this.fields = new Map();     // field id -> { ice, emit clocks }
    this.fractures = [];         // radial fractures still running: rocks thrown where each arm's head is
    this.gather = new Map();     // player id -> emit clocks
    this.status = new Map();     // player id -> emit clocks
    this.fireAcc = {};
    this.waveAcc = 0;
    this.clock = 0;
    this.density = 1;
  }
  setDensity(density) { this.density = Math.max(0.45, Math.min(1, Number(density) || 0.45)); }
  #n(count) { return Math.max(1, Math.round(count * this.density)); }

  // --- where the knight really is ---------------------------------------------------------------------------------
  #shell(id) {
    return id === this.remotePlayers?.localId ? this.remotePlayers.self : this.remotePlayers?.rigs?.get(id);
  }
  #feet(player) {
    const shell = this.#shell(player.id);
    return shell?.root?.visible ? shell.root.position : player.position;
  }
  // the blade: its grip and its tip, in the world, from the rig as it is posed this frame (or null: no body shown)
  #blade(player) {
    const shell = this.#shell(player.id);
    const hand = shell?.root?.visible ? shell.visualInstance?.animator?.bone?.('hand.R') : null;
    if (!hand) return null;
    hand.updateWorldMatrix(true, false);
    return { grip: new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld), tip: TIP_IN_HAND.clone().applyMatrix4(hand.matrixWorld) };
  }

  // --- pieces -----------------------------------------------------------------------------------------------------
  /** A thick branching bolt between two points (the teleport's flash and guide use it too). */
  bolt(from, to, options) { this.#bolt(from, to, options); }
  #bolt(from, to, { width = 0.035, ttl = 0.16, jag = 0.2, forks = 2, steps = 7 } = {}) {
    if (this.bolts.length >= 42) this.#dropBolt(0);
    const mesh = new THREE.Mesh(boltGeometry(boltPath(from, to, { jag, forks, steps }), width), this.boltMaterial.clone());
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.bolts.push({ mesh, ttl, life: ttl });
  }
  #dropBolt(i) {
    const [bolt] = this.bolts.splice(i, 1);
    bolt.mesh.parent?.remove(bolt.mesh);
    bolt.mesh.geometry.dispose();
    bolt.mesh.material.dispose();
  }
  #stone(at, velocity, size, floor, ttl = 1.5) {
    this.rock.spawn({ x: at.x, y: at.y, z: at.z, vx: velocity.x, vy: velocity.y, vz: velocity.z, sx: size, sy: size * rand(0.6, 0.9), sz: size * rand(0.7, 1.1),
      color: pick(STONE_TINTS), gravity: 14, ttl, floor, spin: rand(-7, 7) });
  }
  #dust(at, velocity, size = 0.3, ttl = 0.9, color = pick(COLOR.dust)) {
    this.smoke.spawn({ x: at.x, y: at.y, z: at.z, vx: velocity.x, vy: velocity.y, vz: velocity.z, sx: size, ttl, color, grow: 1.5, drag: 2.2, fadeIn: 0.05 });
  }
  #mote(element, at, velocity, { size = 0.05, ttl = 0.5, gravity = 0, align = true, stretch = 3, drag = 0, home = null, pull = 0, swirl = 0 } = {}) {
    this.glow.spawn({ x: at.x, y: at.y, z: at.z, vx: velocity.x, vy: velocity.y, vz: velocity.z, sx: size, sy: size * (align ? stretch : 1), sz: size,
      color: pick(COLOR[element]), ttl, gravity, align, drag, home, pull, swirl });
  }

  // --- the gathering: each element is drawn out of the ground round the knight and into the blade -----------------
  #gather(player, tiers, dt, now) {
    let entry = this.gather.get(player.id);
    if (!entry) this.gather.set(player.id, entry = { acc: {}, boltAt: 0, scoreAt: 0 });
    const feet = this.#feet(player);
    const blade = this.#blade(player);
    const heart = blade ? blade.grip.clone().lerp(blade.tip, 0.55) : new THREE.Vector3(feet.x, feet.y + 1.2, feet.z);
    const floor = feet.y + 0.03;
    const state = player.ultimateState;
    const held = Number.isFinite(state.teleportHoldAt);
    // how far through the wind-up (a held aim keeps gathering at its full pace)
    const span = Math.max(0.2, (state.commitAt ?? now) - (state.startedAt ?? now));
    const progress = held ? 1 : clamp01(1 - ((state.commitAt ?? now) - now) / Math.min(span, 0.92));
    const emit = (key, perSec, fn) => {
      entry.acc[key] = (entry.acc[key] ?? 0) + perSec * this.density * dt * (0.45 + 0.75 * progress);
      while (entry.acc[key] >= 1) { entry.acc[key] -= 1; fn(); }
    };
    const rim = (radius) => { const a = rand(TAU); return new THREE.Vector3(feet.x + Math.cos(a) * radius, floor, feet.z + Math.sin(a) * radius); };
    const home = { x: heart.x, y: heart.y, z: heart.z };
    // every Disaster: grit lifted off the ground toward the blade (the simple one is only this)
    emit('dust', 16, () => {
      const at = rim(rand(0.9, 2.2));
      this.rock.spawn({ x: at.x, y: at.y, z: at.z, vx: 0, vy: rand(1.2, 2.6), vz: 0, sx: rand(0.025, 0.06), color: pick(STONE_TINTS), ttl: rand(0.35, 0.6),
        gravity: -2, home, pull: 16, swirl: 9, spin: 9 });
    });
    if (tiers.fire) emit('fire', tiers.fire === 2 ? 46 : 26, () => {
      const at = rim(rand(0.5, 1.9));
      this.#mote('fire', at, { x: 0, y: rand(1.5, 3), z: 0 }, { size: rand(0.03, 0.06), ttl: rand(0.4, 0.7), home, pull: 20, swirl: 12, stretch: 2.4 });
    });
    if (tiers.frost) emit('frost', tiers.frost === 2 ? 34 : 20, () => {
      const at = rim(rand(0.7, 2.1));
      this.#mote('frost', at, { x: 0, y: rand(0.4, 1.2), z: 0 }, { size: rand(0.03, 0.055), ttl: rand(0.5, 0.8), home, pull: 13, swirl: -7, stretch: 4 });
    });
    if (tiers.gale) emit('gale', tiers.gale === 2 ? 44 : 26, () => {
      // wind: long streaks circling in, level, at every height of the body
      const a = rand(TAU), r = rand(1.2, 2.4), y = feet.y + rand(0.2, 2);
      const at = new THREE.Vector3(feet.x + Math.cos(a) * r, y, feet.z + Math.sin(a) * r);
      const speed = rand(5, 8);
      this.#mote('gale', at, { x: -Math.sin(a) * speed, y: rand(-0.3, 0.6), z: Math.cos(a) * speed }, { size: 0.016, stretch: rand(14, 24), ttl: rand(0.3, 0.5),
        home: { x: feet.x, y, z: feet.z }, pull: 26, swirl: 0 });
    });
    if (tiers.steel) emit('steel', tiers.steel === 2 ? 22 : 12, () => {
      // stone and filings dragged up off the ground into the plate
      const at = rim(rand(0.8, 2));
      this.rock.spawn({ x: at.x, y: at.y, z: at.z, vx: 0, vy: rand(2, 3.4), vz: 0, sx: rand(0.05, 0.11), color: pick(COLOR.steel), ttl: rand(0.4, 0.65), gravity: -3,
        home, pull: 22, swirl: 6, spin: 11 });
      this.#mote('steel', at, { x: 0, y: rand(2, 3), z: 0 }, { size: 0.02, ttl: 0.4, home, pull: 22, swirl: 6, stretch: 5 });
    });
    if (tiers.lightning && this.clock >= entry.boltAt) {
      // up out of the ground into the blade, more often as it builds
      entry.boltAt = this.clock + (tiers.lightning === 2 ? 0.07 : 0.11) / (0.5 + progress) / this.density;
      const from = rim(rand(0.6, 2));
      this.#bolt(from, blade ? blade.grip.clone().lerp(blade.tip, rand(0.2, 1)) : heart, { width: 0.022 + 0.014 * progress, ttl: 0.11, jag: 0.16, forks: tiers.lightning });
    }
    // the authored spins carry the blade along (and under) the ground: where it scores it, the ground shows it
    if (blade && blade.tip.y < floor + 0.06 && this.clock >= entry.scoreAt) {
      entry.scoreAt = this.clock + 0.016;
      const at = new THREE.Vector3(blade.tip.x, floor, blade.tip.z);
      const out = tmpVec.set(at.x - feet.x, 0, at.z - feet.z).normalize();
      for (let i = 0; i < this.#n(2); i += 1) this.#mote('fire', at, { x: out.x * rand(1, 4) + rand(-1, 1), y: rand(1.5, 4), z: out.z * rand(1, 4) + rand(-1, 1) },
        { size: 0.022, ttl: rand(0.18, 0.34), gravity: 12, stretch: 5 });
      this.#stone(at, { x: out.x * rand(0.5, 2), y: rand(1.5, 3), z: out.z * rand(0.5, 2) }, rand(0.03, 0.07), floor, 0.7);
      if (Math.random() < 0.5) this.#dust(at, { x: out.x * 0.8, y: 0.6, z: out.z * 0.8 }, 0.16, 0.6);
    }
  }

  // --- the aerial form's own vortex: wind wound round the knight as the blade turns -------------------------------
  #vortex(player, tiers, dt) {
    let entry = this.gather.get(player.id);
    if (!entry) this.gather.set(player.id, entry = { acc: {}, boltAt: 0, scoreAt: 0 });
    const feet = this.#feet(player);
    entry.acc.vortex = (entry.acc.vortex ?? 0) + 90 * this.density * dt;
    while (entry.acc.vortex >= 1) {
      entry.acc.vortex -= 1;
      const a = rand(TAU), r = rand(0.9, 2.3), y = feet.y + rand(-0.2, 2.3);
      const speed = rand(8, 13);
      const element = tiers.fire && Math.random() < 0.25 ? 'fire' : tiers.frost && Math.random() < 0.25 ? 'frost' : 'gale';
      this.#mote(element, { x: feet.x + Math.cos(a) * r, y, z: feet.z + Math.sin(a) * r }, { x: -Math.sin(a) * speed, y: rand(-0.5, 1.4), z: Math.cos(a) * speed },
        { size: 0.02, stretch: rand(16, 28), ttl: rand(0.22, 0.4), home: { x: feet.x, y, z: feet.z }, pull: speed * speed / r, swirl: 0 });
    }
    if (tiers.lightning && this.clock >= entry.boltAt) {
      entry.boltAt = this.clock + 0.09;
      const a = rand(TAU);
      const from = new THREE.Vector3(feet.x, feet.y + 1.1, feet.z);
      this.#bolt(from, from.clone().add(new THREE.Vector3(Math.cos(a) * 2, rand(-0.8, 1), Math.sin(a) * 2)), { width: 0.026, ttl: 0.1, forks: 1 });
    }
  }

  // --- the blow lands ---------------------------------------------------------------------------------------------
  impact(event) {
    const tiers = event.tiers ?? {};
    const p = new THREE.Vector3(event.point.x, event.point.y, event.point.z);
    const ground = event.form === 'ground';
    const floor = p.y + 0.02;
    const steel = tiers.steel ?? 0;
    const radius = event.radius ?? 3.4;
    if (ground) {
      // the ground breaks where the blade went in: stone thrown out and up, more of it and harder for Steel
      const rocks = this.#n(steel === 2 ? 80 : steel === 1 ? 46 : 22);
      const force = steel === 2 ? 1.55 : steel === 1 ? 1.25 : 1;
      for (let i = 0; i < rocks; i += 1) {
        const a = rand(TAU), out = rand(1.2, 5.2) * force, r = rand(0.1, 0.9);
        this.#stone({ x: p.x + Math.cos(a) * r, y: floor, z: p.z + Math.sin(a) * r }, { x: Math.cos(a) * out, y: rand(3, 8.5) * force, z: Math.sin(a) * out },
          rand(0.05, steel === 2 ? 0.19 : 0.14), floor, rand(1.3, 2.2));
      }
      // and the dust of it, rolling outward low (in place of a drawn ring: it is the ground's own)
      for (let i = 0; i < this.#n(22); i += 1) {
        const a = i / 22 * TAU + rand(0.2), speed = rand(3.5, 6.5) * (steel ? 1.2 : 1);
        this.#dust({ x: p.x + Math.cos(a) * 0.5, y: floor + 0.15, z: p.z + Math.sin(a) * 0.5 }, { x: Math.cos(a) * speed, y: rand(0.2, 1), z: Math.sin(a) * speed }, rand(0.22, 0.36), rand(0.8, 1.3));
      }
    } else {
      // a wave breaking on stone or in the air: chips off the face it struck
      const n = event.normal ? new THREE.Vector3(...event.normal) : null;
      if (n) for (let i = 0; i < this.#n(14); i += 1) this.#stone(p, { x: n.x * rand(2, 5) + rand(-2, 2), y: n.y * rand(2, 5) + rand(0, 3), z: n.z * rand(2, 5) + rand(-2, 2) }, rand(0.04, 0.12), null, 1);
      for (let i = 0; i < this.#n(8); i += 1) this.#dust(p, { x: rand(-2, 2), y: rand(0, 1.5), z: rand(-2, 2) }, 0.3, 0.8);
    }
    if (tiers.fire) {
      // ignition: a column of flame straight up out of the wound, and fire flung low across the ground
      const full = tiers.fire === 2;
      for (let i = 0; i < this.#n(full ? 60 : 34); i += 1) {
        const a = rand(TAU), r = rand(0.5);
        this.#mote('fire', { x: p.x + Math.cos(a) * r, y: floor + rand(0.6), z: p.z + Math.sin(a) * r }, { x: Math.cos(a) * rand(0.6), y: rand(4, full ? 11 : 8), z: Math.sin(a) * rand(0.6) },
          { size: rand(0.05, 0.1), ttl: rand(0.35, 0.7), drag: 1.6, stretch: 3.6 });
      }
      for (let i = 0; i < this.#n(full ? 46 : 22); i += 1) {
        const a = rand(TAU), speed = rand(3, full ? radius * 2.4 : 6);
        this.#mote('fire', { x: p.x, y: floor + 0.12, z: p.z }, { x: Math.cos(a) * speed, y: rand(0.5, 2.5), z: Math.sin(a) * speed }, { size: rand(0.022, 0.045), ttl: rand(0.3, 0.55), gravity: 5, drag: 2, stretch: 4 });
      }
      for (let i = 0; i < this.#n(full ? 10 : 5); i += 1) this.#dust({ x: p.x + rand(-0.6, 0.6), y: floor + rand(0.8, 1.6), z: p.z + rand(-0.6, 0.6) }, { x: rand(-0.5, 0.5), y: rand(1.5, 3), z: rand(-0.5, 0.5) }, rand(0.35, 0.6), rand(1.2, 1.9), 0x2b211c);
    }
    if (tiers.frost) {
      // formation: frost racing outward over the ground, and a burst of splinters where it started
      const full = tiers.frost === 2;
      for (let i = 0; i < this.#n(full ? 44 : 24); i += 1) {
        const a = rand(TAU), speed = rand(2.5, full ? 8 : 5);
        this.#mote('frost', { x: p.x, y: floor + 0.05, z: p.z }, { x: Math.cos(a) * speed, y: rand(0.1, 0.6), z: Math.sin(a) * speed }, { size: rand(0.03, 0.06), ttl: rand(0.4, 0.7), drag: 2.4, stretch: 7 });
      }
      for (let i = 0; i < this.#n(full ? 18 : 10); i += 1) {
        const a = rand(TAU);
        this.#mote('frost', { x: p.x, y: floor + 0.3, z: p.z }, { x: Math.cos(a) * rand(1, 3), y: rand(2, 5.5), z: Math.sin(a) * rand(1, 3) }, { size: rand(0.04, 0.08), ttl: rand(0.5, 0.8), gravity: 9, stretch: 4 });
      }
      for (let i = 0; i < this.#n(6); i += 1) this.#dust({ x: p.x + rand(-1, 1), y: floor + 0.2, z: p.z + rand(-1, 1) }, { x: rand(-1.5, 1.5), y: 0.3, z: rand(-1.5, 1.5) }, 0.28, 1.2, 0xcfe9f5);
      if (!ground || !event.fieldId) this.#iceCrown(p, 1.1, full ? 9 : 6, 1.1);
    }
    if (tiers.gale) {
      // pressure: the air thrown outward in long level streaks, and wound upward round the blow
      const full = tiers.gale === 2;
      for (let i = 0; i < this.#n(full ? 54 : 30); i += 1) {
        const a = rand(TAU), speed = rand(9, 16);
        this.#mote('gale', { x: p.x + Math.cos(a) * 0.6, y: floor + rand(0.1, 1.6), z: p.z + Math.sin(a) * 0.6 }, { x: Math.cos(a) * speed, y: rand(-0.2, 0.8), z: Math.sin(a) * speed },
          { size: 0.018, stretch: rand(18, 30), ttl: rand(0.22, 0.38), drag: 3 });
      }
      for (let i = 0; i < this.#n(full ? 26 : 12); i += 1) {
        const a = rand(TAU), r = rand(0.6, 1.6);
        this.#mote('gale', { x: p.x + Math.cos(a) * r, y: floor + rand(0.2), z: p.z + Math.sin(a) * r }, { x: -Math.sin(a) * 6, y: rand(3, 7), z: Math.cos(a) * 6 },
          { size: 0.02, stretch: 16, ttl: rand(0.4, 0.7), home: { x: p.x, y: floor + 4, z: p.z }, pull: 14 });
      }
    }
    if (tiers.lightning) {
      // the discharge: one strike down into the blow, and thick forks running out from it along the ground
      const full = tiers.lightning === 2;
      this.#bolt(new THREE.Vector3(p.x + rand(-1.5, 1.5), p.y + 15, p.z + rand(-1.5, 1.5)), new THREE.Vector3(p.x, floor, p.z), { width: full ? 0.13 : 0.085, ttl: 0.24, jag: 0.07, forks: 3, steps: 11 });
      const forks = this.#n(full ? 9 : 5);
      for (let i = 0; i < forks; i += 1) {
        const a = i / forks * TAU + rand(0.4), reach = rand(0.6, 1) * radius * (full ? 1.15 : 0.8);
        this.#bolt(new THREE.Vector3(p.x, floor + 0.15, p.z), new THREE.Vector3(p.x + Math.cos(a) * reach, floor + rand(0.05, 0.5), p.z + Math.sin(a) * reach),
          { width: full ? 0.06 : 0.042, ttl: rand(0.16, 0.26), jag: 0.14, forks: 2 });
      }
      for (let i = 0; i < this.#n(24); i += 1) {
        const a = rand(TAU);
        this.#mote('lightning', { x: p.x, y: floor + 0.2, z: p.z }, { x: Math.cos(a) * rand(3, 9), y: rand(1, 6), z: Math.sin(a) * rand(3, 9) }, { size: 0.02, ttl: rand(0.15, 0.3), gravity: 14, stretch: 6 });
      }
    }
    if (steel && ground) {
      // struck plate: a spray of white-hot filings off the blade
      for (let i = 0; i < this.#n(steel === 2 ? 50 : 26); i += 1) {
        const a = rand(TAU);
        this.#mote('steel', { x: p.x, y: floor + 0.25, z: p.z }, { x: Math.cos(a) * rand(4, 12), y: rand(2, 9), z: Math.sin(a) * rand(4, 12) }, { size: 0.016, ttl: rand(0.25, 0.5), gravity: 18, stretch: 7 });
      }
    }
  }

  // ice thrown up out of the ground in a rough crown (a splash's frost, with no field to keep it)
  #iceCrown(p, radius, count, ttl) {
    for (let i = 0; i < this.#n(count); i += 1) {
      const a = i / count * TAU + rand(0.3), r = radius * rand(0.5, 1);
      this.glow.spawn({ x: p.x + Math.cos(a) * r, y: p.y + 0.25, z: p.z + Math.sin(a) * r, sx: 0.07, sy: rand(0.4, 0.8), sz: 0.07, color: pick(COLOR.frost), ttl, vy: 0.4 });
    }
  }

  // A Steel-infused blow's radial fracture, as the room planned it: each arm throws stone where its head is now.
  fracture(event) {
    if (!event.radial) return;
    this.fractures.push({ origin: { ...event.origin }, fissures: event.fissures.map((f) => ({ dir: { ...f.dir }, length: f.length })), speed: event.speed ?? 8.5,
      steel: event.steel ?? 1, age: 0, reached: 0 });
  }
  #stepFractures(dt) {
    for (let i = this.fractures.length - 1; i >= 0; i -= 1) {
      const f = this.fractures[i];
      f.age += dt;
      const head = f.age * f.speed;
      const longest = Math.max(...f.fissures.map((arm) => arm.length));
      const floor = f.origin.y + 0.02;
      // (stone thrown every third of a metre of ground each arm splits)
      while (f.reached < Math.min(head, longest)) {
        f.reached += 0.34;
        for (const arm of f.fissures) {
          if (f.reached > arm.length) continue;
          const at = { x: f.origin.x + arm.dir.x * f.reached, y: floor, z: f.origin.z + arm.dir.z * f.reached };
          const count = f.steel === 2 ? 3 : 2;
          for (let k = 0; k < this.#n(count); k += 1) {
            const side = rand(-1, 1);
            this.#stone(at, { x: arm.dir.x * rand(0.5, 2.5) - arm.dir.z * side * 2, y: rand(3, f.steel === 2 ? 8 : 5.5), z: arm.dir.z * rand(0.5, 2.5) + arm.dir.x * side * 2 },
              rand(0.05, f.steel === 2 ? 0.17 : 0.12), floor, rand(1.1, 1.8));
          }
          if (Math.random() < 0.6) this.#dust({ ...at, y: floor + 0.2 }, { x: arm.dir.x * 1.2, y: rand(0.6, 1.4), z: arm.dir.z * 1.2 }, 0.28, 0.9);
          this.#mote('steel', { ...at, y: floor + 0.1 }, { x: rand(-2, 2), y: rand(3, 7), z: rand(-2, 2) }, { size: 0.014, ttl: 0.3, gravity: 16, stretch: 6 });
        }
      }
      if (head >= longest + 0.5) this.fractures.splice(i, 1);
    }
  }

  // --- the field it leaves: thinning with the strength the room reports -------------------------------------------
  #stepFields(snapshot, now, dt) {
    const seen = new Set();
    for (const field of snapshot?.oneHitFields ?? []) {
      const strength = fieldStrength(field, now);
      if (strength <= 0) continue;
      seen.add(field.id);
      let entry = this.fields.get(field.id);
      if (!entry) {
        entry = { acc: {}, arcAt: 0, ice: null };
        if (field.tiers?.frost === 2) entry.ice = this.#iceField(field);
        this.fields.set(field.id, entry);
      }
      const p = field.position, floor = p.y + 0.03;
      const emit = (key, perSec, fn) => {
        entry.acc[key] = (entry.acc[key] ?? 0) + perSec * this.density * dt * strength;
        while (entry.acc[key] >= 1) { entry.acc[key] -= 1; fn(); }
      };
      const inside = (share = 1) => { const a = rand(TAU), r = Math.sqrt(Math.random()) * field.radius * share; return { x: p.x + Math.cos(a) * r, y: floor, z: p.z + Math.sin(a) * r }; };
      // every field: the broken ground still shifting, grit hopping and dust hanging over it
      emit('grit', 26, () => { const at = inside(); this.#stone(at, { x: rand(-0.4, 0.4), y: rand(1.2, 2.6), z: rand(-0.4, 0.4) }, rand(0.02, 0.05), floor, 0.6); });
      emit('haze', 2.5, () => { const at = inside(); this.#dust({ ...at, y: floor + 0.12 }, { x: rand(-0.3, 0.3), y: rand(0.25, 0.6), z: rand(-0.3, 0.3) }, rand(0.16, 0.28), 1.3); });
      if (field.tiers?.frost === 2) {
        // cold coming up off the ice, and the ice itself sinking back as the field goes
        emit('cold', 20, () => { const at = inside(); this.#mote('frost', { ...at, y: floor + rand(0.05, 0.3) }, { x: rand(-0.4, 0.4), y: rand(0.3, 0.9), z: rand(-0.4, 0.4) }, { size: rand(0.02, 0.04), ttl: rand(0.6, 1), stretch: 2.5, drag: 0.8 }); });
        emit('mist', 3, () => { const at = inside(); this.#dust({ ...at, y: floor + 0.1 }, { x: rand(-0.5, 0.5), y: 0.15, z: rand(-0.5, 0.5) }, 0.26, 1.4, 0xd4edf8); });
        if (entry.ice) this.#poseIce(entry.ice, field, strength, now);
      }
      if (field.tiers?.lightning === 2 && this.clock >= entry.arcAt) {
        // arcs crawling over the ground between two points of it: fewer and thinner as the charge runs out
        entry.arcAt = this.clock + rand(0.05, 0.11) / Math.max(0.15, strength) / this.density;
        const a = inside(), b = inside();
        this.#bolt(new THREE.Vector3(a.x, floor + 0.08, a.z), new THREE.Vector3(b.x, floor + rand(0.1, 0.9 * strength + 0.15), b.z), { width: 0.016 + 0.03 * strength, ttl: 0.12, jag: 0.2, forks: strength > 0.5 ? 2 : 1 });
        for (let i = 0; i < 3; i += 1) this.#mote('lightning', { ...b, y: floor + 0.1 }, { x: rand(-2, 2), y: rand(1, 3.5), z: rand(-2, 2) }, { size: 0.016, ttl: 0.22, gravity: 12, stretch: 5 });
      }
    }
    for (const [id, entry] of this.fields) if (!seen.has(id)) {
      if (entry.ice) { entry.ice.parent?.remove(entry.ice); entry.ice.geometry.dispose(); entry.ice.material.dispose(); }
      this.fields.delete(id);
    }
  }
  // Full Frost's field: real ice standing out of the ground across it, tallest at the heart
  #iceField(field) {
    const count = Math.round(46 * this.density);
    const ice = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), this.iceMaterial.clone(), count);
    ice.frustumCulled = false;
    ice.userData.spikes = Array.from({ length: count }, (_, i) => {
      const a = i * 2.39996, r = Math.sqrt((i + 0.5) / count) * field.radius * 0.97;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, height: (0.35 + Math.random() * 0.75) * (1.25 - 0.6 * r / field.radius), lean: rand(-0.35, 0.35), turn: rand(TAU), width: rand(0.09, 0.2), delay: r / field.radius * 0.22 };
    });
    ice.position.set(field.position.x, field.position.y, field.position.z);
    this.root.add(ice);
    return ice;
  }
  #poseIce(ice, field, strength, now) {
    const age = now - field.bornAt;
    ice.userData.spikes.forEach((s, i) => {
      // it forms outward from the blow in the first quarter second, then sinks with the field's strength
      const formed = clamp01((age - s.delay) / 0.12);
      const h = s.height * formed * (0.2 + 0.8 * strength);
      tmpObject.position.set(s.x, h * 0.5 - 0.02, s.z);
      tmpObject.rotation.set(s.lean, s.turn, s.lean * 0.6);
      tmpObject.scale.set(s.width * (0.5 + 0.5 * strength), Math.max(0.001, h), s.width * (0.5 + 0.5 * strength));
      tmpObject.updateMatrix();
      ice.setMatrixAt(i, tmpObject.matrix);
    });
    ice.instanceMatrix.needsUpdate = true;
    ice.material.opacity = 0.35 + 0.5 * strength;
  }

  // Full Fire's burning ground (the room's burn zones): flame standing on it, embers going up, smoke over it, all of
  // it dying down with what is left of the fire
  #stepFire(snapshot, now, dt) {
    for (const zone of snapshot?.oneHitBurnZones ?? []) {
      const strength = fieldStrength(zone, now);
      if (strength <= 0) continue;
      const entry = this.fireAcc[zone.id] ??= { flame: 0, ember: 0, smoke: 0, seen: 0 };
      entry.seen = this.clock;
      const p = zone.position, floor = p.y + 0.03;
      const inside = () => { const a = rand(TAU), r = Math.sqrt(Math.random()) * zone.radius; return { x: p.x + Math.cos(a) * r, y: floor, z: p.z + Math.sin(a) * r }; };
      entry.flame += 230 * strength * this.density * dt;
      while (entry.flame >= 1) {
        entry.flame -= 1;
        this.#mote('fire', inside(), { x: rand(-0.3, 0.3), y: rand(1.2, 2.2 + 2.4 * strength), z: rand(-0.3, 0.3) }, { size: rand(0.05, 0.1) * (0.55 + 0.45 * strength), ttl: rand(0.28, 0.5), stretch: 3.4, drag: 1.2 });
      }
      entry.ember += 26 * strength * this.density * dt;
      while (entry.ember >= 1) {
        entry.ember -= 1;
        this.#mote('fire', inside(), { x: rand(-0.8, 0.8), y: rand(2.5, 5), z: rand(-0.8, 0.8) }, { size: 0.018, ttl: rand(0.8, 1.4), stretch: 1.6, gravity: -1 });
      }
      entry.smoke += 9 * (0.4 + 0.6 * strength) * this.density * dt;
      while (entry.smoke >= 1) {
        entry.smoke -= 1;
        const at = inside();
        this.#dust({ ...at, y: floor + rand(0.9, 1.5) }, { x: rand(-0.3, 0.3), y: rand(1.2, 2.2), z: rand(-0.3, 0.3) }, rand(0.35, 0.6), rand(1.4, 2.1), 0x2e2520);
      }
    }
    for (const id of Object.keys(this.fireAcc)) if (this.clock - this.fireAcc[id].seen > 1) delete this.fireAcc[id];
  }
  // the sword wave in flight: the air it tears along, and whatever it carries
  #stepWaves(snapshot, dt) {
    for (const wave of snapshot?.oneHitWaves ?? []) {
      const tiers = wave.tiers ?? {};
      const kinds = ['gale', ...['fire', 'frost', 'lightning', 'steel'].filter((k) => tiers[k] > 0)];
      this.waveAcc += 120 * this.density * dt;
      while (this.waveAcc >= 1) {
        this.waveAcc -= 1;
        const d = wave.direction, back = rand(0, 1.2);
        this.#mote(pick(kinds), { x: wave.position.x - d.x * back + rand(-0.9, 0.9), y: wave.position.y - d.y * back + rand(-0.7, 0.7), z: wave.position.z - d.z * back + rand(-0.9, 0.9) },
          { x: d.x * rand(6, 12), y: d.y * rand(6, 12), z: d.z * rand(6, 12) }, { size: 0.018, stretch: rand(12, 22), ttl: rand(0.18, 0.32) });
      }
    }
  }

  // --- what a knight carries --------------------------------------------------------------------------------------
  #stepStatuses(snapshot, now, dt) {
    const seen = new Set();
    for (const player of snapshot?.players ?? []) {
      if (!player.alive) continue;
      const conduct = oneHitBacklashRemaining(player.electricalBacklash, now);
      const bluster = blusterSeverity(player.blustered, now);
      const shaken = player.shaken && player.oneHitField ? player.oneHitField.strength : 0;
      const chilled = (player.oneHitFrostSlow?.until ?? 0) > now ? (player.oneHitFrostSlow.depth ?? 0.35) / 0.35 : 0;
      if (conduct <= 0.05 && bluster <= 0.02 && shaken <= 0 && chilled <= 0) continue;
      seen.add(player.id);
      let entry = this.status.get(player.id);
      if (!entry) this.status.set(player.id, entry = { arcAt: 0, acc: 0, grit: 0 });
      const feet = this.#feet(player);
      if (conduct > 0.05 && this.clock >= entry.arcAt) {
        // Shocking Conduct: the charge they carry crawling over the plate; livelier the more of it is left
        const share = conduct / 12;
        entry.arcAt = this.clock + (0.34 - 0.24 * share) / this.density;
        const a = rand(TAU), b = a + rand(1.2, 2.6);
        const from = new THREE.Vector3(feet.x + Math.cos(a) * 0.36, feet.y + rand(0.3, 1.7), feet.z + Math.sin(a) * 0.36);
        const to = new THREE.Vector3(feet.x + Math.cos(b) * 0.36, feet.y + rand(0.3, 1.7), feet.z + Math.sin(b) * 0.36);
        this.#bolt(from, to, { width: 0.012 + 0.02 * share, ttl: 0.1, jag: 0.3, forks: share > 0.5 ? 1 : 0, steps: 5 });
        this.#mote('lightning', to, { x: rand(-1, 1), y: rand(0.5, 2), z: rand(-1, 1) }, { size: 0.014, ttl: 0.2, gravity: 8, stretch: 4 });
      }
      if (bluster > 0.02) {
        // Blustered: wind still wound round them, the way their facing is held; it thins as it lets them go
        entry.acc += 34 * bluster * this.density * dt;
        while (entry.acc >= 1) {
          entry.acc -= 1;
          const a = rand(TAU), r = rand(0.55, 0.85), y = feet.y + rand(0.3, 1.7), speed = rand(4, 6);
          this.#mote('gale', { x: feet.x + Math.cos(a) * r, y, z: feet.z + Math.sin(a) * r }, { x: -Math.sin(a) * speed, y: rand(-0.2, 0.3), z: Math.cos(a) * speed },
            { size: 0.013, stretch: rand(12, 20), ttl: rand(0.25, 0.4), home: { x: feet.x, y, z: feet.z }, pull: speed * speed / r });
        }
      }
      if (chilled > 0) {
        // slowed by frost: rime creeping up the legs, as deep as the slow is
        entry.rime = (entry.rime ?? 0) + 30 * chilled * this.density * dt;
        while (entry.rime >= 1) {
          entry.rime -= 1;
          const a = rand(TAU);
          this.#mote('frost', { x: feet.x + Math.cos(a) * 0.32, y: feet.y + rand(0.02, 0.2), z: feet.z + Math.sin(a) * 0.32 }, { x: 0, y: rand(0.5, 1.4), z: 0 }, { size: rand(0.02, 0.035), ttl: rand(0.4, 0.7), stretch: 3 });
        }
      }
      if (shaken > 0) {
        // Shaken, held back by the field they stand in: the ground still jumping under their feet
        entry.grit += 14 * shaken * this.density * dt;
        while (entry.grit >= 1) {
          entry.grit -= 1;
          const a = rand(TAU);
          this.#stone({ x: feet.x + Math.cos(a) * 0.4, y: feet.y + 0.03, z: feet.z + Math.sin(a) * 0.4 }, { x: Math.cos(a) * 0.6, y: rand(1.5, 2.6), z: Math.sin(a) * 0.6 }, rand(0.02, 0.045), feet.y + 0.03, 0.5);
        }
      }
    }
    for (const id of this.status.keys()) if (!seen.has(id)) this.status.delete(id);
  }

  // Shocking Conduct discharged into the knight who swung: everything they carried, at once
  discharge(event, snapshot) {
    const player = snapshot?.players?.find((p) => p.id === event.victimId);
    if (!player) return;
    const feet = this.#feet(player);
    const chest = new THREE.Vector3(feet.x, feet.y + 1.1, feet.z);
    const blade = this.#blade(player);
    const share = clamp01((event.amount ?? 6) / 12);
    // down the blade into the body, then out of it in every direction
    if (blade) this.#bolt(blade.tip, chest, { width: 0.05 + 0.05 * share, ttl: 0.22, jag: 0.12, forks: 2 });
    const forks = this.#n(5 + Math.round(6 * share));
    for (let i = 0; i < forks; i += 1) {
      const a = i / forks * TAU + rand(0.5), reach = 0.9 + 1.3 * share;
      this.#bolt(chest, new THREE.Vector3(chest.x + Math.cos(a) * reach, feet.y + rand(0.02, 2.2), chest.z + Math.sin(a) * reach), { width: 0.03 + 0.03 * share, ttl: rand(0.14, 0.24), jag: 0.2, forks: 1 });
    }
    for (let i = 0; i < this.#n(30); i += 1) {
      const a = rand(TAU);
      this.#mote('lightning', chest, { x: Math.cos(a) * rand(2, 7), y: rand(-1, 5), z: Math.sin(a) * rand(2, 7) }, { size: 0.02, ttl: rand(0.2, 0.4), gravity: 12, stretch: 6 });
    }
  }
  // the Conduct taking hold of a knight (a direct hit, or a field touching them)
  conduct(event, snapshot) {
    const player = snapshot?.players?.find((p) => p.id === event.playerId);
    if (!player) return;
    const feet = this.#feet(player);
    const share = clamp01((event.initial ?? 12) / 12);
    for (let i = 0; i < this.#n(2 + Math.round(3 * share)); i += 1) {
      const a = rand(TAU);
      this.#bolt(new THREE.Vector3(feet.x + Math.cos(a) * 0.9, feet.y + 0.05, feet.z + Math.sin(a) * 0.9), new THREE.Vector3(feet.x, feet.y + rand(0.6, 1.6), feet.z), { width: 0.02 + 0.025 * share, ttl: 0.15, forks: 1 });
    }
  }
  // Half Gale's wind turning a spell aside: the air it slid off, along the way it now goes
  deflect(event) {
    const p = event.point, v = event.velocity;
    const speed = Math.hypot(v.x, v.y, v.z) || 1;
    for (let i = 0; i < this.#n(22); i += 1) {
      this.#mote('gale', { x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.3, 0.3), z: p.z + rand(-0.3, 0.3) }, { x: v.x / speed * rand(8, 14) + rand(-2, 2), y: v.y / speed * rand(8, 14) + rand(-2, 2), z: v.z / speed * rand(8, 14) + rand(-2, 2) },
        { size: 0.018, stretch: rand(14, 24), ttl: rand(0.2, 0.36), drag: 2.5 });
    }
  }
  // Full Steel holding its knight at 1 HP: the blow that should have killed rings off the plate
  lastStand(event, snapshot) {
    const player = snapshot?.players?.find((p) => p.id === event.playerId);
    if (!player) return;
    const feet = this.#feet(player);
    for (let i = 0; i < this.#n(44); i += 1) {
      const a = rand(TAU), y = feet.y + rand(0.4, 1.7);
      this.#mote('steel', { x: feet.x + Math.cos(a) * 0.4, y, z: feet.z + Math.sin(a) * 0.4 }, { x: Math.cos(a) * rand(3, 9), y: rand(-1, 5), z: Math.sin(a) * rand(3, 9) }, { size: 0.018, ttl: rand(0.25, 0.5), gravity: 14, stretch: 7 });
    }
  }
  // Full Steel: a struck knight's Skills knocked back to the start of their cooldowns (filings shaken off their hands)
  cooldowns(event, snapshot) {
    const player = snapshot?.players?.find((p) => p.id === event.playerId);
    if (!player) return;
    const feet = this.#feet(player);
    for (let i = 0; i < this.#n(18); i += 1) {
      const a = rand(TAU);
      this.#mote('steel', { x: feet.x + Math.cos(a) * 0.3, y: feet.y + rand(0.9, 1.5), z: feet.z + Math.sin(a) * 0.3 }, { x: Math.cos(a) * rand(0.5, 2), y: rand(-3, -1), z: Math.sin(a) * rand(0.5, 2) }, { size: 0.016, ttl: 0.45, gravity: 6, stretch: 5 });
    }
  }

  event(event, snapshot) {
    if (event.type === 'oneHitImpact') this.impact(event);
    else if (event.type === 'rupture') this.fracture(event);
    else if (event.type === 'oneHitBacklash') this.discharge(event, snapshot);
    else if (event.type === 'oneHitConduct') this.conduct(event, snapshot);
    else if (event.type === 'oneHitDeflect') this.deflect(event);
    else if (event.type === 'oneHitLastStand') this.lastStand(event, snapshot);
    else if (event.type === 'oneHitCooldownsRestarted') this.cooldowns(event, snapshot);
  }

  update(dt, snapshot, now) {
    const frame = Math.max(0, Math.min(0.06, Number(dt) || 0));
    this.clock += frame;
    const active = new Set();
    for (const player of snapshot?.players ?? []) {
      const state = player.ultimateState;
      if (state?.id !== 'one_hit_of_wonders' || !player.alive) continue;
      const tiers = state.oneHit?.tiers ?? state.preparedTiers ?? player.oneHitInfusions ?? {};
      if (state.phase === 'startup') { active.add(player.id); this.#gather(player, tiers, frame, now); }
      else if (state.oneHit?.form === 'aerial' && !state.oneHit.hit) { active.add(player.id); this.#vortex(player, tiers, frame); }
    }
    for (const id of this.gather.keys()) if (!active.has(id)) this.gather.delete(id);
    this.#stepFractures(frame);
    this.#stepFields(snapshot, now, frame);
    this.#stepFire(snapshot, now, frame);
    this.#stepWaves(snapshot, frame);
    this.#stepStatuses(snapshot, now, frame);
    this.glow.update(frame);
    this.rock.update(frame);
    this.smoke.update(frame);
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.bolts[i];
      bolt.life -= frame;
      if (bolt.life <= 0) { this.#dropBolt(i); continue; }
      // (a bolt flickers rather than fades: bright, a dip, bright, gone)
      const t = bolt.life / bolt.ttl;
      bolt.mesh.material.opacity = t > 0.7 ? 1 : t > 0.5 ? 0.35 : t > 0.25 ? 0.85 : t * 3;
    }
  }

  /** What is on screen now, for tests and captures: live counts by kind. */
  census() {
    return { glow: this.glow.items.length, rock: this.rock.items.length, smoke: this.smoke.items.length, bolts: this.bolts.length,
      fields: this.fields.size, fractures: this.fractures.length, ice: [...this.fields.values()].filter((f) => f.ice).length };
  }

  dispose() {
    while (this.bolts.length) this.#dropBolt(0);
    for (const entry of this.fields.values()) if (entry.ice) { entry.ice.parent?.remove(entry.ice); entry.ice.geometry.dispose(); entry.ice.material.dispose(); }
    this.fields.clear();
    this.glow.dispose(); this.rock.dispose(); this.smoke.dispose();
    this.warmBolt.geometry.dispose();
    this.warmIce.geometry.dispose();
    this.iceMaterial.dispose();
    this.boltMaterial.dispose();
    this.root.parent?.remove(this.root);
  }
}
