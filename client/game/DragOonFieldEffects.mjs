// Stylized, pooled GPU-instanced VFX engine for DRAG-OON.
// Zero per-puff Mesh/Material allocations: uses shared InstancedMeshes with per-instance matrices & colors,
// per-machine emission state, distance-based LOD / mobile density budgets, and an opt-in Practice hit-volume overlay.
import * as THREE from 'three';
import { DRAG_OON_GEOMETRY, DRAG_OON_TUNING } from '../../shared/src/dragOonConfig.mjs';
import { dragOonCannonRays } from '../../shared/sim/dragOonGeometry.mjs';
import { findSwordWorldHit } from '../../shared/src/collision.mjs';
import { puffTexture, windStreakTexture, starTexture } from './softTextures.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

const ELEMENT_COLORS = Object.freeze({
  fire: new THREE.Color(0xff6b22),
  fireHot: new THREE.Color(0xffd26a),
  frost: new THREE.Color(0x88e6ff),
  frostWhite: new THREE.Color(0xe6fbff),
  gale: new THREE.Color(0x9affcc),
  lightning: new THREE.Color(0xffe970),
  steel: new THREE.Color(0x7c8794),
  steelMolten: new THREE.Color(0xd29a5c),
  smokeDark: new THREE.Color(0x282321),
  smokeWarm: new THREE.Color(0x523f36),
  dustEarth: new THREE.Color(0xb8a382),
  steamCold: new THREE.Color(0xdcf0fa),
  steamHot: new THREE.Color(0xf6dec8),
});

let cachedScorchTex = null;
function scorchDecalTexture() {
  if (cachedScorchTex) return cachedScorchTex;
  if (typeof document === 'undefined') return puffTexture();
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const cx = 64;
  // Charcoal blasted soot base with ragged lobes
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const rad = 28 + Math.sin(i * 3.7) * 9;
    const ox = cx + Math.cos(ang) * (12 + Math.cos(i * 2.3) * 8);
    const oy = cx + Math.sin(ang) * (12 + Math.sin(i * 1.9) * 8);
    const grad = g.createRadialGradient(ox, oy, 2, ox, oy, rad);
    grad.addColorStop(0, 'rgba(18,12,10,0.86)');
    grad.addColorStop(0.55, 'rgba(32,20,16,0.52)');
    grad.addColorStop(1, 'rgba(20,14,12,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  // Glowing ember cracks near center
  g.strokeStyle = 'rgba(255,115,36,0.65)';
  g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 6, cx + Math.sin(a) * 6);
    g.lineTo(cx + Math.cos(a + 0.14) * 26, cx + Math.sin(a + 0.14) * 26);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedScorchTex = tex;
  return tex;
}

class InstancedParticlePool {
  constructor(parent, geometry, material, capacity) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, white);
    if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    parent.add(this.mesh);
    this.items = [];
    this._mat = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._col = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);
    this._dir = new THREE.Vector3();
  }

  spawn(opts) {
    if (this.items.length >= this.capacity) {
      // Overwrite oldest expiring entry smoothly instead of allocating
      let oldestIdx = 0;
      let bestProgress = -1;
      for (let i = 0; i < this.items.length; i++) {
        const p = this.items[i].age / this.items[i].life;
        if (p > bestProgress) { bestProgress = p; oldestIdx = i; }
      }
      this.items[oldestIdx] = opts;
      return;
    }
    this.items.push(opts);
  }

  step(dt, cameraQuat = null) {
    const keep = [];
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.gravity) p.vy -= p.gravity * dt;
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d; p.vz *= d;
      }
      if (p.swirl) {
        const s = p.swirl * dt;
        const nx = p.vx * Math.cos(s) - p.vz * Math.sin(s);
        const nz = p.vx * Math.sin(s) + p.vz * Math.cos(s);
        p.vx = nx; p.vz = nz;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.floorY != null && p.y < p.floorY) {
        p.y = p.floorY;
        if (p.bounce) {
          p.vy = Math.abs(p.vy) * p.bounce;
          p.vx *= 0.65;
          p.vz *= 0.65;
        } else {
          p.vy = Math.max(0, p.vy);
        }
      }
      p.spin = (p.spin ?? 0) + (p.spinVel ?? 0) * dt;
      keep.push(p);
    }
    this.items = keep;

    const count = Math.min(this.capacity, keep.length);
    for (let i = 0; i < count; i++) {
      const p = keep[i];
      const frac = clamp(p.age / Math.max(0.001, p.life), 0, 1);
      const fade = p.fadeIn ? clamp(frac / 0.14, 0, 1) * (1 - Math.pow(frac, p.fadePow ?? 1.4)) : (1 - Math.pow(frac, p.fadePow ?? 1.25));
      const size = lerp(p.size0, p.size1, Math.pow(frac, p.growPow ?? 0.65));

      this._pos.set(p.x, p.y, p.z);
      if (p.orientMode === 'velocity') {
        this._dir.set(p.vx, p.vy, p.vz);
        if (this._dir.lengthSq() > 1e-4) {
          this._dir.normalize();
          this._quat.setFromUnitVectors(this._up, this._dir);
        } else if (cameraQuat) {
          this._quat.copy(cameraQuat);
        }
        this._scale.set(size * (p.widthScale ?? 0.55), size * (p.stretch ?? 2.4), size * (p.widthScale ?? 0.55));
      } else if (p.orientMode === 'flat') {
        this._quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        if (p.spin) this._quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.spin));
        this._scale.set(size, size, size);
      } else if (p.orientMode === 'tumble') {
        this._quat.setFromEuler(new THREE.Euler(p.spin * 1.3, p.spin * 0.9, p.spin * 1.7));
        this._scale.set(size, size * 0.42, size * 0.78);
      } else {
        if (cameraQuat) this._quat.copy(cameraQuat);
        else this._quat.identity();
        if (p.spin) this._quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), p.spin));
        this._scale.set(size, size * (p.aspect ?? 1), size);
      }

      this._mat.compose(this._pos, this._quat, this._scale);
      this.mesh.setMatrixAt(i, this._mat);

      if (p.color0 && p.color1) {
        this._col.copy(p.color0).lerp(p.color1, frac);
      } else if (p.color0) {
        this._col.copy(p.color0);
      } else {
        this._col.setRGB(1, 0.5, 0.2);
      }
      // Additive / faded instance brightness scales naturally cleanly via instanceColor!
      const lum = (p.brightness ?? 1) * fade;
      this._col.multiplyScalar(lum);
      this.mesh.setColorAt(i, this._col);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items = [];
    this.mesh.count = 0;
  }
}

export class DragOonFieldEffects {
  constructor(scene, camera = null) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'DragOonFieldEffects';
    scene.add(this.group);

    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'DragOonDebugHitVolumes';
    this.debugGroup.visible = false;
    this.group.add(this.debugGroup);

    this.debugHitVolumes = false;
    this.density = 1;
    this.machineState = new Map(); // Per-machine isolated timers & transition memory

    const puff = puffTexture();
    const streak = windStreakTexture();
    const star = starTexture();
    const scorchTex = scorchDecalTexture();

    this.quadGeo = new THREE.PlaneGeometry(1, 1);
    this.crossedStreakGeo = (() => {
      const a = new THREE.PlaneGeometry(0.65, 1);
      const b = new THREE.PlaneGeometry(0.65, 1).rotateY(Math.PI / 2);
      const merged = new THREE.BufferGeometry();
      const join = (n, s) => merged.setAttribute(n, new THREE.BufferAttribute(new Float32Array([...a.attributes[n].array, ...b.attributes[n].array]), s));
      join('position', 3);
      join('uv', 2);
      merged.setIndex([...a.index.array, ...[...b.index.array].map(idx => idx + a.attributes.position.count)]);
      a.dispose(); b.dispose();
      return merged;
    })();
    this.debrisGeo = new THREE.BoxGeometry(0.32, 0.22, 0.42);
    this.scorchPlaneGeo = new THREE.PlaneGeometry(2, 2);

    // 1. Soft alpha-blended billowing smoke, pressurized Steam, dust, molten Steel mist
    this.smokeMat = new THREE.MeshBasicMaterial({
      map: puff, color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide,
    });
    this.smokePool = new InstancedParticlePool(this.group, this.quadGeo, this.smokeMat, 480);

    // 2. Luminous additive flames & explosion fireballs
    this.glowMat = new THREE.MeshBasicMaterial({
      map: puff, color: 0xffffff, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.glowPool = new InstancedParticlePool(this.group, this.quadGeo, this.glowMat, 560);

    // 3. Directional jet flame tongues, Lightning Conduct arcs, Gale swirls & rocket exhaust streaks
    this.streakMat = new THREE.MeshBasicMaterial({
      map: streak, color: 0xffffff, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.streakPool = new InstancedParticlePool(this.group, this.crossedStreakGeo, this.streakMat, 380);

    // 4. Twinkle stars & electric flashes
    this.sparkMat = new THREE.MeshBasicMaterial({
      map: star, color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.sparkPool = new InstancedParticlePool(this.group, this.quadGeo, this.sparkMat, 220);

    // 5. Authored iron debris shards (All Abort!, Rite, Fuel launch/slam clods)
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x45494e, metalness: 0.72, roughness: 0.55 });
    this.debrisPool = new InstancedParticlePool(this.group, this.debrisGeo, this.debrisMat, 140);

    // 6. Ragged charcoal + glowing ember terrain scorches (Flight Like Hell suppression & Raze)
    this.scorchDecalMat = new THREE.MeshBasicMaterial({
      map: scorchTex, color: 0xffffff, transparent: true, opacity: 0.84, depthWrite: false, side: THREE.DoubleSide,
    });
    this.scorchDecalPool = new InstancedParticlePool(this.group, this.scorchPlaneGeo, this.scorchDecalMat, 96);

    // Crisp restrained aiming indicators for active Raze preparation ONLY (always readable while aiming)
    this.razeAimRingGeo = new THREE.RingGeometry(0.95, 1.0, 48);
    this.razeAimRingGeo.rotateX(-Math.PI / 2);
    this.razeAimRings = [];

    // Optional debug hit-volume meshes (strictly hidden unless debugHitVolumes === true!)
    this.dbgSphereGeo = new THREE.SphereGeometry(1, 10, 8);
    this.dbgRingGeo = new THREE.TorusGeometry(1, 0.08, 6, 24);
    this.dbgRingGeo.rotateX(Math.PI / 2);
    this.dbgDiscGeo = new THREE.RingGeometry(0.15, 1, 24);
    this.dbgDiscGeo.rotateX(-Math.PI / 2);
    this.dbgWireGeo = new THREE.CylinderGeometry(0.95, 1.05, 2.2, 10, 1, true);
    this.dbgConeGeo = new THREE.ConeGeometry(1, 1, 16, 1, true);
    this.dbgConeGeo.translate(0, -0.5, 0);
    this.dbgFlamePool = [];
    this.dbgRingPool = [];
    this.dbgRazePool = [];
    this.dbgScorchPool = [];
    this.dbgConePool = [];

    this._pendingEvents = [];
  }

  setDensity(density = 1) {
    this.density = clamp(Number(density) || 1, 0.35, 1.25);
  }

  setDebugHitVolumes(enabled) {
    this.debugHitVolumes = Boolean(enabled);
    this.debugGroup.visible = this.debugHitVolumes;
  }

  #stateFor(machineId) {
    let st = this.machineState.get(machineId);
    if (!st) {
      st = {
        nextSprayAt: 0,
        nextFlightAt: 0,
        nextRiteAt: 0,
        nextRazeAt: 0,
        nextCampAt: 0,
        nextBrimAt: 0,
        nextFlameTickAt: 0,
        nextScorchSmokeAt: 0,
        wasSpraying: false,
        seenSteamAt: -Infinity,
      };
      this.machineState.set(machineId, st);
    }
    return st;
  }

  #distScale(point, cameraPos) {
    if (!cameraPos || !point) return this.density;
    const d = Math.hypot((point.x ?? 0) - cameraPos.x, (point.y ?? 0) - cameraPos.y, (point.z ?? 0) - cameraPos.z);
    if (d > 75) return 0;
    const lod = d > 44 ? 0.35 : d > 28 ? 0.65 : 1.0;
    return this.density * lod;
  }

  #jitter(s = 1) {
    return (Math.random() - 0.5) * 2 * s;
  }

  onEvent(event) {
    if (!event) return;
    this._pendingEvents.push(event);
  }

  #handleEvent(event, snapshot) {
    const camPos = this.camera?.position ?? null;
    const pt = event.point ?? event.origin ?? null;
    const scale = this.#distScale(pt, camPos);
    if (scale <= 0.01 && event.type !== 'dragOonDestroyed') return;

    if (event.type === 'dragOonLeapPhase' && pt) {
      const m = (snapshot?.machines?.find(x => x?.id === event.machineId)) || snapshot?.dragOon;
      const tiers = m?.infusions?.tiers ?? {};
      const steelTier = tiers.steel ?? 0;
      const fireTier = tiers.fire ?? 0;
      const galeTier = tiers.gale ?? 0;
      const isLand = event.phase === 'landing';
      const nCount = Math.max(6, Math.round((isLand ? 24 : 16) * (0.5 + 0.5 * scale)));
      const rad = event.radius ?? (isLand ? (steelTier >= 2 ? 8.2 : 5.6) : 4.2);

      // Flash at core / underside
      this.glowPool.spawn({
        x: pt.x, y: (pt.y ?? 0) + 0.45, z: pt.z,
        vx: 0, vy: 0.6, vz: 0,
        life: isLand ? 0.28 : 0.22, age: 0,
        size0: rad * 0.35, size1: rad * (isLand ? 1.1 : 0.85),
        color0: steelTier >= 2 ? ELEMENT_COLORS.steelMolten : ELEMENT_COLORS.fireHot,
        color1: ELEMENT_COLORS.fire, brightness: 1.5,
      });

      // Radial terrain dust + billowing smoke ring + debris clods conveying 15-ton weight
      for (let i = 0; i < nCount; i++) {
        const ang = (i / nCount) * Math.PI * 2 + this.#jitter(0.18);
        const spd = (isLand ? 7.5 : 5.5) + Math.random() * 6.5;
        this.smokePool.spawn({
          x: pt.x + Math.cos(ang) * (isLand ? 1.2 : 0.8),
          y: (pt.y ?? 0) + 0.35,
          z: pt.z + Math.sin(ang) * (isLand ? 1.2 : 0.8),
          vx: Math.cos(ang) * spd * (galeTier ? 1.25 : 1),
          vy: (isLand ? 1.4 : 2.1) + Math.random() * 1.8,
          vz: Math.sin(ang) * spd * (galeTier ? 1.25 : 1),
          drag: 2.2,
          life: isLand ? 0.95 + Math.random() * 0.4 : 0.65 + Math.random() * 0.25,
          age: 0,
          size0: isLand ? 1.15 : 0.85,
          size1: isLand ? 3.2 : 2.1,
          color0: steelTier >= 1 ? ELEMENT_COLORS.steel : ELEMENT_COLORS.dustEarth,
          color1: ELEMENT_COLORS.smokeDark,
          brightness: 0.72,
          spin: Math.random() * 6, spinVel: this.#jitter(1.5),
        });
        if (i % 2 === 0) {
          this.streakPool.spawn({
            x: pt.x + Math.cos(ang) * 0.6,
            y: (pt.y ?? 0) + 0.3,
            z: pt.z + Math.sin(ang) * 0.6,
            vx: Math.cos(ang) * (spd * 1.25),
            vy: (isLand ? 3.4 : 4.2) + Math.random() * 2.5,
            vz: Math.sin(ang) * (spd * 1.25),
            gravity: 11, orientMode: 'velocity', stretch: 1.9, widthScale: 0.35,
            life: 0.42 + Math.random() * 0.22, age: 0,
            size0: 0.55 + fireTier * 0.14, size1: 0.2,
            color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 1.35,
          });
        }
        if (i % 3 === 0) {
          this.debrisPool.spawn({
            x: pt.x + Math.cos(ang) * 0.9,
            y: (pt.y ?? 0) + 0.35,
            z: pt.z + Math.sin(ang) * 0.9,
            vx: Math.cos(ang) * (4 + Math.random() * 5),
            vy: 4.5 + Math.random() * 4.5,
            vz: Math.sin(ang) * (4 + Math.random() * 5),
            gravity: 18, floorY: (pt.y ?? 0) + 0.1, bounce: 0.3,
            orientMode: 'tumble', spin: Math.random() * 6, spinVel: this.#jitter(8),
            life: 0.85 + Math.random() * 0.35, age: 0,
            size0: isLand && steelTier >= 2 ? 0.75 : 0.45, size1: 0.15,
            color0: steelTier >= 1 ? ELEMENT_COLORS.steel : ELEMENT_COLORS.smokeWarm,
            color1: ELEMENT_COLORS.smokeDark, brightness: 0.9,
          });
        }
      }
      if (isLand) {
        this.scorchDecalPool.spawn({
          x: pt.x, y: (pt.y ?? 0) + 0.05, z: pt.z,
          vx: 0, vy: 0, vz: 0, orientMode: 'flat', spin: Math.random() * 6,
          life: 4.2, age: 0, size0: rad * 0.75, size1: rad * 0.75,
          color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.75,
        });
      }
    } else if (event.type === 'dragOonRiteAscended' && pt) {
      // Dramatic multi-vent collective launch ignition!
      for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * Math.PI * 2;
        const spd = 6 + Math.random() * 11;
        this.glowPool.spawn({
          x: pt.x, y: (pt.y ?? 0) + 0.5, z: pt.z,
          vx: Math.cos(ang) * spd, vy: 2 + Math.random() * 5.5, vz: Math.sin(ang) * spd,
          drag: 1.8, life: 0.55 + Math.random() * 0.3, age: 0,
          size0: 0.9, size1: 2.6,
          color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 1.65,
        });
        if (i % 2 === 0) {
          this.smokePool.spawn({
            x: pt.x + Math.cos(ang) * 1.4, y: (pt.y ?? 0) + 0.3, z: pt.z + Math.sin(ang) * 1.4,
            vx: Math.cos(ang) * spd * 0.85, vy: 1.8 + Math.random() * 2.5, vz: Math.sin(ang) * spd * 0.85,
            drag: 1.6, life: 1.25 + Math.random() * 0.45, age: 0,
            size0: 1.3, size1: 4.0,
            color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.85,
          });
        }
      }
    } else if (event.type === 'dragOonDestroyed' && pt) {
      // Multi-stage destruction: Ignition flash -> Fireball expansion -> Metallic fragments -> Smoke plume
      const isRite = Boolean(event.isRiteOfAscension);
      const rad = event.radius ?? (isRite ? 12 : 7.5);
      const scaleMult = clamp(rad / 7.5, 0.85, 2.2) * (isRite ? 1.35 : 1.0);
      const brimming = Boolean(event.brimming);

      // Clean transient per-machine emission state when destroyed
      if (event.machineId) this.machineState.delete(event.machineId);

      // Stage 1: Blinding core ignition flash
      this.glowPool.spawn({
        x: pt.x, y: (pt.y ?? 0) + 0.8, z: pt.z,
        vx: 0, vy: 0.5, vz: 0,
        life: isRite ? 0.38 : 0.24, age: 0,
        size0: 1.5 * scaleMult, size1: 7.5 * scaleMult,
        color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 2.2,
      });

      // Stage 2: Rolling fireball tongues & shock sparks
      const fbCount = Math.round((isRite ? 42 : 24) * clamp(this.density, 0.5, 1.0));
      for (let i = 0; i < fbCount; i++) {
        const phi = Math.random() * Math.PI * 2;
        const elev = (Math.random() - 0.15) * 0.9;
        const spd = (5 + Math.random() * 14) * scaleMult;
        this.glowPool.spawn({
          x: pt.x + this.#jitter(1.2), y: (pt.y ?? 0) + 0.9 + Math.random() * 0.9, z: pt.z + this.#jitter(1.2),
          vx: Math.cos(phi) * Math.cos(elev) * spd,
          vy: Math.sin(elev) * spd + (isRite ? 4.5 : 2.5),
          vz: Math.sin(phi) * Math.cos(elev) * spd,
          drag: 2.0,
          life: (isRite ? 0.85 : 0.58) + Math.random() * 0.4, age: 0,
          size0: 1.2 * scaleMult, size1: 3.4 * scaleMult,
          color0: brimming || isRite ? ELEMENT_COLORS.lightning : ELEMENT_COLORS.fireHot,
          color1: ELEMENT_COLORS.fire, brightness: 1.5,
        });
        this.streakPool.spawn({
          x: pt.x, y: (pt.y ?? 0) + 1.0, z: pt.z,
          vx: Math.cos(phi) * spd * 1.4,
          vy: 4 + Math.random() * 11 * scaleMult,
          vz: Math.sin(phi) * spd * 1.4,
          gravity: 12, orientMode: 'velocity', stretch: 2.8, widthScale: 0.4,
          life: 0.55 + Math.random() * 0.35, age: 0,
          size0: 0.75 * scaleMult, size1: 0.25,
          color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 1.6,
        });
      }

      // Stage 3: Authored breakable-style metallic hull debris chunks
      const fragCount = Math.round((isRite ? 32 : 18) * clamp(this.density, 0.5, 1.0));
      for (let i = 0; i < fragCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (5.5 + Math.random() * 11) * scaleMult;
        this.debrisPool.spawn({
          x: pt.x + this.#jitter(1.4), y: (pt.y ?? 0) + 1.1 + Math.random() * 0.8, z: pt.z + this.#jitter(1.4),
          vx: Math.cos(ang) * spd,
          vy: 5.5 + Math.random() * 10 * scaleMult,
          vz: Math.sin(ang) * spd,
          gravity: 20, floorY: 0.12, bounce: 0.25,
          orientMode: 'tumble', spin: Math.random() * 6, spinVel: this.#jitter(10),
          life: 1.6 + Math.random() * 0.8, age: 0,
          size0: 0.85 + Math.random() * 0.55, size1: 0.2,
          color0: ELEMENT_COLORS.steel, color1: ELEMENT_COLORS.smokeDark, brightness: 0.85,
        });
      }

      // Stage 4: Towering lingering smoke column
      const smokeCount = Math.round((isRite ? 30 : 18) * clamp(this.density, 0.5, 1.0));
      for (let i = 0; i < smokeCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rOff = Math.random() * 2.2 * scaleMult;
        this.smokePool.spawn({
          x: pt.x + Math.cos(ang) * rOff, y: (pt.y ?? 0) + 0.8 + Math.random() * 1.6, z: pt.z + Math.sin(ang) * rOff,
          vx: Math.cos(ang) * 2.4 * scaleMult, vy: 2.2 + Math.random() * 3.6, vz: Math.sin(ang) * 2.4 * scaleMult,
          drag: 0.9,
          life: (isRite ? 2.8 : 1.9) + Math.random() * 0.8, age: 0,
          size0: 1.4 * scaleMult, size1: 4.8 * scaleMult,
          color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark,
          brightness: 0.65, fadeIn: true, spin: Math.random() * 6, spinVel: this.#jitter(0.8),
        });
      }

      this.scorchDecalPool.spawn({
        x: pt.x, y: 0.05, z: pt.z,
        vx: 0, vy: 0, vz: 0, orientMode: 'flat', spin: Math.random() * 6,
        life: 6.5, age: 0, size0: rad * 0.9, size1: rad * 0.9,
        color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.85,
      });
    }
  }

  #spawnSprayNozzle(origin, dir, tiers, speedMult = 1, rangeMult = 1, wallHit = null, sprayRange = 10.5) {
    const fire = tiers.fire ?? 0;
    const frost = tiers.frost ?? 0;
    const gale = tiers.gale ?? 0;
    const light = tiers.lightning ?? 0;
    const steel = tiers.steel ?? 0;

    // 1. Concentrated incandescent flame tongue right out the nozzle
    const coreColor = frost >= 1 && fire < 1 ? ELEMENT_COLORS.frostWhite
      : light >= 1 ? ELEMENT_COLORS.lightning
      : ELEMENT_COLORS.fireHot;
    const endColor = frost >= 1 && fire < 1 ? ELEMENT_COLORS.frost
      : steel >= 2 && gale >= 2 ? ELEMENT_COLORS.steelMolten
      : gale >= 1 ? ELEMENT_COLORS.gale
      : ELEMENT_COLORS.fire;

    const jetSpeed = (16 + fire * 2.5 + light * 5.0) * speedMult;
    const clipScale = wallHit ? clamp(wallHit.distance / Math.max(2, sprayRange), 0.14, 1.0) : 1.0;
    const spread = 0.08 + fire * 0.04;
    const vx = (dir.x + this.#jitter(spread)) * jetSpeed;
    const vy = (dir.y + this.#jitter(spread)) * jetSpeed + 0.35;
    const vz = (dir.z + this.#jitter(spread)) * jetSpeed;

    this.streakPool.spawn({
      x: origin.x + dir.x * 0.2,
      y: origin.y + dir.y * 0.2,
      z: origin.z + dir.z * 0.2,
      vx, vy, vz,
      drag: gale >= 1 ? 1.4 : 2.1,
      orientMode: 'velocity',
      stretch: 2.2 + light * 0.7,
      widthScale: 0.48 + fire * 0.16,
      life: (0.28 + rangeMult * 0.14) * (gale >= 1 ? 1.35 : 1.0) * clipScale,
      age: 0,
      size0: 0.42 + fire * 0.12,
      size1: (0.85 + fire * 0.25) * (0.45 + 0.55 * clipScale),
      color0: coreColor,
      color1: endColor,
      brightness: 1.45 + fire * 0.2,
    });

    // 2. Turbulent broadening combustion cloud + dissipating smoke
    this.glowPool.spawn({
      x: origin.x + dir.x * 0.45,
      y: origin.y + dir.y * 0.45,
      z: origin.z + dir.z * 0.45,
      vx: vx * 0.78, vy: vy * 0.78 + 0.55, vz: vz * 0.78,
      drag: gale >= 1 ? 1.5 : 2.4,
      swirl: gale >= 1 ? this.#jitter(2.2) : 0,
      life: (0.34 + rangeMult * 0.12) * clipScale,
      age: 0,
      size0: 0.4 + fire * 0.14,
      size1: (1.25 + fire * 0.35) * (0.45 + 0.55 * clipScale),
      color0: frost >= 1 ? ELEMENT_COLORS.frostWhite : ELEMENT_COLORS.fireHot,
      color1: endColor,
      brightness: frost >= 1 ? 1.15 : 1.3,
      spin: Math.random() * 6, spinVel: this.#jitter(3.2),
    });

    // Deflected splash against nearby solid wall/masonry so spray stops authentically at barriers
    if (wallHit && Math.random() < 0.45) {
      const [px, py, pz] = wallHit.point;
      const [nx, ny, nz] = wallHit.normal ?? [0, 1, 0];
      this.glowPool.spawn({
        x: px + nx * 0.12, y: py + ny * 0.12, z: pz + nz * 0.12,
        vx: nx * 3.5 + this.#jitter(2.8), vy: Math.max(0.8, ny * 2.5 + Math.random() * 2), vz: nz * 3.5 + this.#jitter(2.8),
        drag: 2.8, life: 0.28, age: 0,
        size0: 0.45, size1: 1.15,
        color0: coreColor, color1: endColor, brightness: 1.25,
      });
    }

    // Dark dissipating exhaust smoke / frosty vapor wisps / molten steel core
    if (Math.random() < (steel >= 1 ? 0.75 : 0.45)) {
      this.smokePool.spawn({
        x: origin.x + dir.x * 1.1,
        y: origin.y + dir.y * 1.1,
        z: origin.z + dir.z * 1.1,
        vx: vx * 0.55, vy: vy * 0.55 + (frost >= 1 ? -0.2 : 1.1), vz: vz * 0.55,
        drag: 1.9,
        life: 0.55 + gale * 0.25,
        age: 0,
        size0: 0.55,
        size1: 1.5 + steel * 0.45,
        color0: steel >= 1 ? ELEMENT_COLORS.steel : frost >= 1 ? ELEMENT_COLORS.steamCold : ELEMENT_COLORS.smokeWarm,
        color1: steel >= 1 ? ELEMENT_COLORS.steelMolten : ELEMENT_COLORS.smokeDark,
        brightness: steel >= 1 ? 0.92 : 0.55,
        fadeIn: true, spin: Math.random() * 6, spinVel: this.#jitter(1.5),
      });
    }

    // Lightning Conduct flickering crackles
    if (light >= 1 && Math.random() < 0.42) {
      this.sparkPool.spawn({
        x: origin.x + dir.x * (1.2 + Math.random() * 3.5),
        y: origin.y + dir.y * (1.2 + Math.random() * 3.5) + this.#jitter(0.35),
        z: origin.z + dir.z * (1.2 + Math.random() * 3.5) + this.#jitter(0.35),
        vx: dir.x * 8 + this.#jitter(4), vy: this.#jitter(4), vz: dir.z * 8 + this.#jitter(4),
        life: 0.14 + Math.random() * 0.08, age: 0,
        size0: 0.65 + light * 0.25, size1: 0.15,
        color0: ELEMENT_COLORS.lightning, color1: ELEMENT_COLORS.fireHot, brightness: 1.85,
      });
    }
  }

  #spawnLingeringFlame(seg, rateFactor) {
    if (Math.random() > 0.38 * rateFactor) return;
    const t = seg.tiers ?? {};
    const steelGale = (t.steel ?? 0) >= 2 && (t.gale ?? 0) >= 2;
    const frost = (t.frost ?? 0) >= 1;
    const gale = (t.gale ?? 0) >= 1;
    const steel = (t.steel ?? 0) >= 1;
    const light = (t.lightning ?? 0) >= 1;

    if (steelGale || seg.barricade || steel >= 2) {
      // Molten metallic-wind barrier curtains — dense iron shimmer + swirling edge tongues, zero wireframe cages!
      this.smokePool.spawn({
        x: seg.position.x + this.#jitter(0.45),
        y: seg.position.y + 0.25 + Math.random() * 0.9,
        z: seg.position.z + this.#jitter(0.45),
        vx: this.#jitter(0.75), vy: 0.55 + Math.random() * 0.65, vz: this.#jitter(0.75),
        swirl: gale ? 2.4 : 0.4,
        life: 0.55 + (gale ? 0.35 : 0),
        age: 0,
        size0: (seg.radius ?? 0.95) * 1.1,
        size1: (seg.radius ?? 0.95) * 1.85,
        color0: steelGale ? ELEMENT_COLORS.steelMolten : ELEMENT_COLORS.steel,
        color1: ELEMENT_COLORS.smokeDark,
        brightness: steelGale ? 1.05 : 0.85,
        fadeIn: true, spin: Math.random() * 6, spinVel: this.#jitter(2.2),
      });
      this.glowPool.spawn({
        x: seg.position.x + this.#jitter(0.4),
        y: seg.position.y + 0.15 + Math.random() * 0.65,
        z: seg.position.z + this.#jitter(0.4),
        vx: this.#jitter(0.9), vy: 0.9 + Math.random() * 0.8, vz: this.#jitter(0.9),
        swirl: 2.6,
        life: 0.38, age: 0,
        size0: 0.55, size1: 1.35,
        color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.steelMolten, brightness: 0.95,
      });
    } else {
      this.glowPool.spawn({
        x: seg.position.x + this.#jitter(0.45),
        y: seg.position.y + Math.random() * 0.4,
        z: seg.position.z + this.#jitter(0.45),
        vx: this.#jitter(0.8), vy: 1.1 + Math.random() * 0.9, vz: this.#jitter(0.8),
        swirl: gale ? 2.8 : 0.5,
        life: 0.42, age: 0,
        size0: (seg.radius ?? 0.9) * 0.7, size1: (seg.radius ?? 0.9) * 1.4,
        color0: frost ? ELEMENT_COLORS.frostWhite : light ? ELEMENT_COLORS.lightning : ELEMENT_COLORS.fireHot,
        color1: frost ? ELEMENT_COLORS.frost : gale ? ELEMENT_COLORS.gale : ELEMENT_COLORS.fire,
        brightness: 0.95,
      });
    }
  }

  #spawnSteamDischarge(m, originResolver, r, isNewRing) {
    const t = r?.tiers ?? m?.infusions?.tiers ?? {};
    const heat = clamp((m?.heat ?? 0) / 140, 0, 1.4);
    const steel = (t.steel ?? 0) >= 2;
    const gale = (t.gale ?? 0) >= 2;
    const fire = (t.fire ?? 0) >= 1;
    const frost = (t.frost ?? 0) >= 1;

    const vents = [
      'fx_steam_vent_Front', 'fx_steam_vent_FL', 'fx_steam_vent_ML', 'fx_steam_vent_RL',
      'fx_steam_vent_Rear', 'fx_steam_vent_RR', 'fx_steam_vent_MR', 'fx_steam_vent_FR',
    ];
    const center = r?.origin ?? { x: m?.x ?? 0, y: m?.y ?? 0, z: m?.z ?? 0 };
    const col0 = frost ? ELEMENT_COLORS.frostWhite : steel ? ELEMENT_COLORS.steel : heat > 0.7 ? ELEMENT_COLORS.steamHot : ELEMENT_COLORS.steamCold;
    const col1 = fire ? ELEMENT_COLORS.smokeWarm : ELEMENT_COLORS.steamCold;

    for (let i = 0; i < 8; i++) {
      const ventPt = (originResolver && m ? originResolver(m.id, vents[i]) : null) || {
        x: center.x + DRAG_OON_GEOMETRY.steamExhaustOrigins[i][0],
        y: center.y + DRAG_OON_GEOMETRY.steamExhaustOrigins[i][1],
        z: center.z + DRAG_OON_GEOMETRY.steamExhaustOrigins[i][2],
      };
      const dx = ventPt.x - center.x;
      const dz = ventPt.z - center.z;
      const len = Math.hypot(dx, dz) || 1;
      const ox = dx / len, oz = dz / len;
      const burstsPerVent = isNewRing ? 4 : 2;
      for (let b = 0; b < burstsPerVent; b++) {
        const angOff = this.#jitter(0.32);
        const rx = ox * Math.cos(angOff) - oz * Math.sin(angOff);
        const rz = ox * Math.sin(angOff) + oz * Math.cos(angOff);
        const spd = (r?.speed ?? 15) * (0.72 + Math.random() * 0.45);
        this.smokePool.spawn({
          x: ventPt.x + rx * 0.4,
          y: ventPt.y - 0.5 + b * 0.45 + Math.random() * 0.35,
          z: ventPt.z + rz * 0.4,
          vx: rx * spd,
          vy: (Math.random() - 0.3) * 1.8 + 0.6,
          vz: rz * spd,
          drag: gale ? 1.25 : 2.1,
          life: (gale ? 1.15 : 0.75) + Math.random() * 0.25,
          age: 0,
          size0: steel ? 1.6 : 1.15,
          size1: steel ? 4.4 : 3.4,
          aspect: 0.85,
          color0: col0, color1: col1,
          brightness: steel ? 0.96 : 0.86,
          fadeIn: true, spin: Math.random() * 6, spinVel: this.#jitter(1.8),
        });
      }
      if (fire && isNewRing) {
        this.glowPool.spawn({
          x: ventPt.x, y: ventPt.y - 0.2, z: ventPt.z,
          vx: ox * 10, vy: 1.5, vz: oz * 10, drag: 2.4,
          life: 0.36, age: 0, size0: 0.8, size1: 2.2,
          color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 1.25,
        });
      }
    }
  }

  #spawnInfernoJet(m, rays, isRite, scale) {
    const tiers = isRite ? (m.rite?.frozenTiers ?? m.infusions?.tiers ?? {}) : (m.infusions?.tiers ?? {});
    const length = isRite ? DRAG_OON_TUNING.riteOfAscension.exhaustConeLength : DRAG_OON_TUNING.flightLikeHell.coneLength;
    const meanDir = { x: 0, y: 0, z: 0 };
    for (const r of rays) { meanDir.x += r.direction.x; meanDir.y += r.direction.y; meanDir.z += r.direction.z; }
    const dl = Math.hypot(meanDir.x, meanDir.y, meanDir.z) || 1;
    meanDir.x /= dl; meanDir.y /= dl; meanDir.z /= dl;

    const numPods = rays.length > 0 ? rays : [{ origin: { x: m.x, y: m.y + 0.45, z: m.z }, direction: meanDir }];
    for (let i = 0; i < numPods.length; i += 2) {
      const r = numPods[i];
      const jetSpd = isRite ? 26 : 21;
      const spread = isRite ? 0.24 : 0.20;
      const vx = (r.direction.x + this.#jitter(spread)) * jetSpd;
      const vy = (r.direction.y + this.#jitter(spread * 0.5)) * jetSpd;
      const vz = (r.direction.z + this.#jitter(spread)) * jetSpd;
      this.streakPool.spawn({
        x: r.origin.x + this.#jitter(0.12), y: r.origin.y, z: r.origin.z + this.#jitter(0.12),
        vx, vy, vz, drag: 0.6, orientMode: 'velocity',
        stretch: isRite ? 2.9 : 2.3, widthScale: isRite ? 0.68 : 0.55,
        life: (length / jetSpd) * 0.72, age: 0,
        size0: isRite ? 0.95 : 0.78, size1: isRite ? 2.2 : 1.7,
        color0: (tiers.frost ?? 0) >= 2 && (tiers.fire ?? 0) < 1 ? ELEMENT_COLORS.frostWhite : ELEMENT_COLORS.fireHot,
        color1: ELEMENT_COLORS.fire, brightness: 1.55,
      });
      this.glowPool.spawn({
        x: r.origin.x, y: r.origin.y - 0.3, z: r.origin.z,
        vx: vx * 0.75, vy: vy * 0.75, vz: vz * 0.75, drag: 1.1,
        life: 0.38, age: 0, size0: 0.85, size1: isRite ? 2.5 : 1.9,
        color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 1.3,
      });
    }

    // Terrain interaction splash when downward jet reaches floor y ~ 0
    if (meanDir.y < -0.15 && m.y > -0.5) {
      const distToFloor = (m.y + 0.5) / (-meanDir.y);
      if (distToFloor <= length + 1.5) {
        const hitX = m.x + meanDir.x * distToFloor;
        const hitZ = m.z + meanDir.z * distToFloor;
        const splashCount = Math.max(2, Math.round((isRite ? 5 : 4) * scale));
        for (let k = 0; k < splashCount; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 4.5 + Math.random() * 7.5;
          this.glowPool.spawn({
            x: hitX + Math.cos(ang) * 0.6, y: 0.25, z: hitZ + Math.sin(ang) * 0.6,
            vx: Math.cos(ang) * spd, vy: 1.2 + Math.random() * 2.2, vz: Math.sin(ang) * spd, drag: 2.2,
            life: 0.42, age: 0, size0: 0.85, size1: 2.1,
            color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 1.2,
          });
          if (k % 2 === 0) {
            this.smokePool.spawn({
              x: hitX + Math.cos(ang) * 1.1, y: 0.3, z: hitZ + Math.sin(ang) * 1.1,
              vx: Math.cos(ang) * spd * 0.7, vy: 1.8 + Math.random() * 2.5, vz: Math.sin(ang) * spd * 0.7, drag: 1.7,
              life: 0.85, age: 0, size0: 1.0, size1: 3.1,
              color0: ELEMENT_COLORS.dustEarth, color1: ELEMENT_COLORS.smokeDark, brightness: 0.68, fadeIn: true,
            });
          }
        }
      }
    }
  }

  #syncRazeAimRings(razeTargets, serverNow) {
    while (this.razeAimRings.length < razeTargets.length) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff9a34, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(this.razeAimRingGeo, mat);
      this.group.add(mesh);
      this.razeAimRings.push({ mesh, mat });
    }
    for (let i = 0; i < this.razeAimRings.length; i++) {
      const item = this.razeAimRings[i];
      if (i < razeTargets.length) {
        const r = razeTargets[i];
        item.mesh.visible = true;
        item.mesh.position.set(r.center.x, (r.center.y ?? 0) + 0.06, r.center.z);
        item.mesh.scale.setScalar(r.radius);
        item.mat.color.setHex(r.delay ? 0xffe26a : 0xff7e26);
        item.mat.opacity = r.delay ? (0.6 + 0.35 * Math.sin(serverNow * 32)) : 0.55;
      } else {
        item.mesh.visible = false;
      }
    }
  }

  #syncDebugPool(pool, count, createFn) {
    while (pool.length < count) {
      const item = createFn();
      this.debugGroup.add(item.mesh);
      pool.push(item);
    }
    for (let i = 0; i < pool.length; i++) pool[i].mesh.visible = i < count;
  }

  #updateDebugVolumes(snapshot, serverNow) {
    if (!this.debugHitVolumes) return;
    const flames = (snapshot.dragOonFlames ?? []).filter(f => serverNow < f.expiresAt);
    this.#syncDebugPool(this.dbgFlamePool, flames.length, () => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff6224, transparent: true, opacity: 0.35, depthWrite: false });
      const mesh = new THREE.Mesh(this.dbgSphereGeo, mat);
      const wallMat = new THREE.MeshBasicMaterial({ color: 0xb8d4e8, transparent: true, opacity: 0.35, wireframe: true, depthWrite: false });
      const wall = new THREE.Mesh(this.dbgWireGeo, wallMat);
      mesh.add(wall);
      return { mesh, mat, wall };
    });
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i], item = this.dbgFlamePool[i];
      item.mesh.position.set(f.position.x, f.position.y, f.position.z);
      item.mesh.scale.setScalar(f.radius ?? 0.95);
      item.wall.visible = Boolean(f.barricade || (f.steelTier ?? 0) >= 2);
    }

    const rings = (snapshot.dragOonSteamRings ?? []).filter(r => serverNow < (r.visualUntil ?? r.expiresAt));
    this.#syncDebugPool(this.dbgRingPool, rings.length, () => ({
      mesh: new THREE.Mesh(this.dbgRingGeo, new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.45, depthWrite: false })),
    }));
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i], rad = Math.max(0.5, Math.min(r.maxRadius ?? 12.5, Math.max(0, serverNow - r.bornAt) * (r.speed ?? 16)));
      this.dbgRingPool[i].mesh.position.set(r.origin.x, (r.origin.y ?? 0) + 0.85, r.origin.z);
      this.dbgRingPool[i].mesh.scale.set(rad, 1.2, rad);
    }

    const razes = (snapshot.dragOonRazeFields ?? []).filter(rf => serverNow < rf.expiresAt);
    this.#syncDebugPool(this.dbgRazePool, razes.length, () => ({
      mesh: new THREE.Mesh(this.dbgDiscGeo, new THREE.MeshBasicMaterial({ color: 0xff4c16, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })),
    }));
    for (let i = 0; i < razes.length; i++) {
      const rf = razes[i];
      this.dbgRazePool[i].mesh.position.set(rf.center.x, (rf.center.y ?? 0) + 0.08, rf.center.z);
      this.dbgRazePool[i].mesh.scale.setScalar(rf.radius ?? 4);
    }

    const scorches = (snapshot.dragOonSuppressionZones ?? []).filter(z => serverNow < z.expiresAt);
    this.#syncDebugPool(this.dbgScorchPool, scorches.length, () => ({
      mesh: new THREE.Mesh(this.dbgDiscGeo, new THREE.MeshBasicMaterial({ color: 0x1a1518, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })),
    }));
    for (let i = 0; i < scorches.length; i++) {
      const s = scorches[i];
      this.dbgScorchPool[i].mesh.position.set(s.center.x, (s.center.y ?? 0) + 0.05, s.center.z);
      this.dbgScorchPool[i].mesh.scale.setScalar(s.radius ?? 5.2);
    }

    const cones = [];
    const down = new THREE.Vector3(0, -1, 0);
    for (const m of snapshot.machines ?? []) {
      if (!m || m.kind !== 'dragoon' || m.retired || m.health <= 0) continue;
      if (!m.rite?.active && !m.flightLikeHell?.active) continue;
      const isRite = Boolean(m.rite?.active);
      const rays = dragOonCannonRays(m);
      const dir = new THREE.Vector3();
      for (const r of rays) { dir.x += r.direction.x; dir.y += r.direction.y; dir.z += r.direction.z; }
      if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0); else dir.normalize();
      const length = isRite ? DRAG_OON_TUNING.riteOfAscension.exhaustConeLength : DRAG_OON_TUNING.flightLikeHell.coneLength;
      const halfAngle = (isRite ? DRAG_OON_TUNING.riteOfAscension.exhaustConeHalfAngleDeg : DRAG_OON_TUNING.flightLikeHell.coneHalfAngleDeg) * (Math.PI / 180);
      cones.push({ pos: [m.x ?? 0, (m.y ?? 0) + 0.55, m.z ?? 0], quat: new THREE.Quaternion().setFromUnitVectors(down, dir), rad: Math.tan(halfAngle) * length, length });
    }
    this.#syncDebugPool(this.dbgConePool, cones.length, () => ({
      mesh: new THREE.Mesh(this.dbgConeGeo, new THREE.MeshBasicMaterial({ color: 0xff5a18, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false })),
    }));
    for (let i = 0; i < cones.length; i++) {
      const c = cones[i];
      this.dbgConePool[i].mesh.position.set(...c.pos);
      this.dbgConePool[i].mesh.quaternion.copy(c.quat);
      this.dbgConePool[i].mesh.scale.set(c.rad, c.length, c.rad);
    }
  }

  update(snapshot, serverNow, dt = 1 / 60, resolveOrigin = null, world = null) {
    const safeDt = Math.max(0, Math.min(0.1, dt || 1 / 60));
    const camPos = this.camera?.position ?? null;
    const camQuat = this.camera?.quaternion ?? null;

    while (this._pendingEvents.length) {
      this.#handleEvent(this._pendingEvents.shift(), snapshot);
    }

    if (snapshot) {
      const nozzleIds = ['fx_nozzle_L_outer', 'fx_nozzle_L_inner', 'fx_nozzle_R_outer', 'fx_nozzle_R_inner'];
      const razeTargets = [];
      const activeMachineIds = new Set();

      for (const m of snapshot.machines ?? []) {
        if (!m || m.kind !== 'dragoon' || m.retired || m.health <= 0 || m.mode === 'DESTROYED') continue;
        activeMachineIds.add(m.id);
        const st = this.#stateFor(m.id);
        const scale = this.#distScale(m, camPos);
        if (scale <= 0.01) continue;

        const tiers = m.infusions?.tiers ?? {};
        const spraying = Boolean(m.sprayHeld);

        // A. Desolation Spray continuous multi-nozzle stream + extinguishing tail
        if (spraying) {
          st.wasSpraying = true;
          if (serverNow >= st.nextSprayAt) {
            st.nextSprayAt = serverNow + clamp(0.036 / scale, 0.032, 0.10);
            const rays = dragOonCannonRays(m);
            const speedMult = (tiers.lightning ?? 0) >= 2 ? 1.55 : (tiers.lightning ?? 0) >= 1 ? 1.28 : 1.0;
            const rangeMult = (tiers.fire ?? 0) >= 2 ? 1.38 : (tiers.fire ?? 0) >= 1 ? 1.2 : 1.0;
            const sprayRange = DRAG_OON_TUNING.spray.baseRange * rangeMult;
            for (let i = 0; i < rays.length; i++) {
              const r = rays[i];
              const glbOrigin = resolveOrigin ? resolveOrigin(m.id, nozzleIds[i]) : null;
              const orig = glbOrigin ?? r.origin;
              const wallHit = world?.solids ? findSwordWorldHit([orig.x, orig.y, orig.z], [r.direction.x, r.direction.y, r.direction.z], sprayRange, world.solids) : null;
              this.#spawnSprayNozzle(orig, r.direction, tiers, speedMult, rangeMult, wallHit, sprayRange);
            }
          }
        } else if (st.wasSpraying) {
          st.wasSpraying = false;
          const rays = dragOonCannonRays(m);
          for (let i = 0; i < rays.length; i += 2) {
            const origin = (resolveOrigin ? resolveOrigin(m.id, nozzleIds[i]) : null) ?? rays[i].origin;
            this.smokePool.spawn({
              x: origin.x, y: origin.y, z: origin.z,
              vx: rays[i].direction.x * 4, vy: 1.2, vz: rays[i].direction.z * 4, drag: 2.5,
              life: 0.45, age: 0, size0: 0.35, size1: 1.1,
              color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.6, fadeIn: true,
            });
          }
        }

        // B. Flight Like Hell & Rite of Ascension continuous turbulent rocket/inferno jets
        if (m.flightLikeHell?.active || m.rite?.active) {
          const isRite = Boolean(m.rite?.active);
          const interval = clamp((isRite ? 0.032 : 0.042) / scale, 0.03, 0.11);
          if (serverNow >= (isRite ? st.nextRiteAt : st.nextFlightAt)) {
            if (isRite) st.nextRiteAt = serverNow + interval;
            else st.nextFlightAt = serverNow + interval;
            const rays = dragOonCannonRays(m).map((r, i) => ({
              ...r,
              origin: (resolveOrigin ? resolveOrigin(m.id, nozzleIds[i]) : null) ?? r.origin,
            }));
            this.#spawnInfernoJet(m, rays, isRite, scale);
            if (isRite) {
              const core = (resolveOrigin ? resolveOrigin(m.id, 'fx_launch_explosion') : null) ?? { x: m.x, y: m.y + 0.3, z: m.z };
              this.glowPool.spawn({
                x: core.x, y: core.y, z: core.z,
                vx: this.#jitter(2), vy: -14, vz: this.#jitter(2), drag: 1.4,
                life: 0.44, age: 0, size0: 1.0, size1: 3.1,
                color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 1.6,
              });
            }
          }
        }

        // C. Camp Fire irregular living perimeter hearth flames
        if (m.campFire?.flamesActive) {
          if (serverNow >= st.nextCampAt) {
            st.nextCampAt = serverNow + clamp(0.065 / scale, 0.05, 0.14);
            const idx = Math.floor(Math.random() * 8);
            const ringPt = (resolveOrigin ? resolveOrigin(m.id, `fx_campfire_ring_0${idx + 1}`) : null) ?? {
              x: m.x + DRAG_OON_GEOMETRY.campFireRingOrigins[idx][0],
              y: m.y + 0.25,
              z: m.z + DRAG_OON_GEOMETRY.campFireRingOrigins[idx][2],
            };
            this.glowPool.spawn({
              x: ringPt.x + this.#jitter(0.45), y: ringPt.y + 0.1, z: ringPt.z + this.#jitter(0.45),
              vx: this.#jitter(0.9), vy: 1.8 + Math.random() * 1.9, vz: this.#jitter(0.9),
              life: 0.48 + Math.random() * 0.2, age: 0, size0: 0.55, size1: 1.45,
              color0: ELEMENT_COLORS.fireHot, color1: ELEMENT_COLORS.fire, brightness: 1.1,
            });
            if (Math.random() < 0.45) {
              this.smokePool.spawn({
                x: ringPt.x + this.#jitter(0.35), y: ringPt.y + 0.6, z: ringPt.z + this.#jitter(0.35),
                vx: this.#jitter(0.6), vy: 1.5 + Math.random() * 1.0, vz: this.#jitter(0.6),
                life: 0.75, age: 0, size0: 0.5, size1: 1.5,
                color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.55, fadeIn: true,
              });
            }
          }
        }

        // D. Raze the Pasture Phase 1 (fuel leak) & Phase 2 (pre-ignition hiss)
        if (m.raze?.center && ['holding', 'delay'].includes(m.raze.phase)) {
          const isDelay = m.raze.phase === 'delay';
          razeTargets.push({ center: m.raze.center, radius: m.raze.radius ?? 3.2, delay: isDelay });
          if (serverNow >= st.nextRazeAt) {
            st.nextRazeAt = serverNow + clamp(0.06 / scale, 0.05, 0.14);
            const rRad = m.raze.radius ?? 3.5;
            const ang = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random()) * rRad;
            if (!isDelay) {
              // Dark pressurized fuel droplets splashing into ring
              this.smokePool.spawn({
                x: m.raze.center.x + Math.cos(ang) * (rr * 0.35),
                y: (m.raze.center.y ?? 0) + 0.5,
                z: m.raze.center.z + Math.sin(ang) * (rr * 0.35),
                vx: Math.cos(ang) * rr * 1.6, vy: 1.5, vz: Math.sin(ang) * rr * 1.6, gravity: 9, floorY: 0.08,
                life: 0.45, age: 0, size0: 0.35, size1: 0.85,
                color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.5,
              });
            } else {
              // Pre-ignition white-gold sparks across soaked circle
              this.sparkPool.spawn({
                x: m.raze.center.x + Math.cos(ang) * rr, y: (m.raze.center.y ?? 0) + 0.2, z: m.raze.center.z + Math.sin(ang) * rr,
                vx: this.#jitter(1.5), vy: 2.8, vz: this.#jitter(1.5),
                life: 0.22, age: 0, size0: 0.45, size1: 0.9,
                color0: ELEMENT_COLORS.lightning, color1: ELEMENT_COLORS.fireHot, brightness: 1.6,
              });
            }
          }
        }

        // E. Progressive Brimming / Overpressure leaks & mechanical sparks (>95 heat)
        const heat = m.heat ?? 0;
        if ((heat > 95 || m.brimming?.active) && serverNow >= st.nextBrimAt) {
          const pressureFrac = clamp((heat - 85) / 135, 0.15, 1.0);
          st.nextBrimAt = serverNow + clamp((0.14 - pressureFrac * 0.08) / scale, 0.05, 0.25);
          const leaks = ['fx_dmg_steam_leak_L', 'fx_dmg_steam_leak_R', 'fx_dmg_smoke_furnace', 'fx_dmg_sparks_cannon_L', 'fx_dmg_sparks_cannon_R'];
          const pickName = leaks[Math.floor(Math.random() * leaks.length)];
          const leakPt = (resolveOrigin ? resolveOrigin(m.id, pickName) : null) ?? { x: m.x, y: m.y + 1.8, z: m.z };
          if (pickName.includes('sparks')) {
            this.sparkPool.spawn({
              x: leakPt.x, y: leakPt.y, z: leakPt.z,
              vx: this.#jitter(4.5), vy: 2.5 + Math.random() * 3.5, vz: this.#jitter(4.5), gravity: 15,
              life: 0.28 + Math.random() * 0.15, age: 0, size0: 0.35, size1: 0.1,
              color0: ELEMENT_COLORS.lightning, color1: ELEMENT_COLORS.fire, brightness: 1.6,
            });
          } else {
            this.smokePool.spawn({
              x: leakPt.x, y: leakPt.y, z: leakPt.z,
              vx: (leakPt.x - m.x) * 1.4, vy: 2.2 + pressureFrac * 2.5, vz: (leakPt.z - m.z) * 1.4, drag: 1.6,
              life: 0.55, age: 0, size0: 0.35, size1: 1.35 + pressureFrac * 0.6,
              color0: ELEMENT_COLORS.steamHot, color1: ELEMENT_COLORS.smokeWarm, brightness: 0.72, fadeIn: true,
            });
          }
        }
      }

      // Clean stale machineState entries
      for (const id of this.machineState.keys()) {
        if (!activeMachineIds.has(id)) this.machineState.delete(id);
      }

      this.#syncRazeAimRings(razeTargets, serverNow);

      // F. World-space lingering Desolation Spray segments (persisting after machine moves!)
      const flames = (snapshot.dragOonFlames ?? []).filter(f => serverNow < f.expiresAt);
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const sc = this.#distScale(f.position, camPos);
        if (sc > 0.01) this.#spawnLingeringFlame(f, sc);
      }

      // G. Steam the Team expanding billowing steam walls
      const rings = (snapshot.dragOonSteamRings ?? []).filter(r => serverNow < (r.visualUntil ?? r.expiresAt));
      for (const r of rings) {
        const hostM = (snapshot.machines ?? []).find(x => x?.id === r.machineId) || null;
        const st = this.#stateFor(r.machineId || 'steam-global');
        const isNew = r.bornAt > st.seenSteamAt + 0.05;
        if (isNew || serverNow - st.seenSteamAt >= 0.08) {
          if (isNew) st.seenSteamAt = r.bornAt;
          else st.seenSteamAt = serverNow;
          if (this.#distScale(r.origin, camPos) > 0.01) {
            this.#spawnSteamDischarge(hostM, resolveOrigin, r, isNew);
          }
        }
      }

      // H. Animated World Raze Burning Fields & Charred Ground Scars
      const razeFields = (snapshot.dragOonRazeFields ?? []).filter(rf => serverNow < rf.expiresAt);
      for (const rf of razeFields) {
        const sc = this.#distScale(rf.center, camPos);
        if (sc <= 0.01) continue;
        const age = serverNow - rf.bornAt;
        const lifeFrac = clamp((rf.expiresAt - serverNow) / Math.max(0.1, rf.expiresAt - rf.bornAt), 0.1, 1);
        const rad = rf.radius ?? 4.2;
        if (Math.random() < Math.min(0.95, 0.55 * sc * (rad / 4))) {
          const ang = Math.random() * Math.PI * 2;
          const dist = Math.sqrt(Math.random()) * rad * 0.92;
          const fx = rf.center.x + Math.cos(ang) * dist;
          const fz = rf.center.z + Math.sin(ang) * dist;
          const fy = (rf.center.y ?? 0) + 0.2;
          this.glowPool.spawn({
            x: fx, y: fy, z: fz, vx: this.#jitter(0.6), vy: 1.9 + Math.random() * 2.2, vz: this.#jitter(0.6),
            life: 0.45 + Math.random() * 0.25, age: 0,
            size0: 0.65 * (0.6 + 0.4 * lifeFrac), size1: 1.65 * (0.6 + 0.4 * lifeFrac),
            color0: age < 0.5 ? ELEMENT_COLORS.fireHot : ELEMENT_COLORS.fire, color1: ELEMENT_COLORS.fire, brightness: 1.1 * lifeFrac,
          });
          if (Math.random() < 0.3) {
            this.smokePool.spawn({
              x: fx, y: fy + 0.5, z: fz, vx: this.#jitter(0.5), vy: 1.6 + Math.random() * 1.2, vz: this.#jitter(0.5),
              life: 0.9, age: 0, size0: 0.6, size1: 1.9,
              color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.52 * lifeFrac, fadeIn: true,
            });
          }
        }
        // Maintain scorched footprint texture smoothly on periodic cadence
        if (age < 0.15 && Math.random() < 0.5) {
          this.scorchDecalPool.spawn({
            x: rf.center.x, y: (rf.center.y ?? 0) + 0.04, z: rf.center.z,
            vx: 0, vy: 0, vz: 0, orientMode: 'flat', spin: Math.random() * 6,
            life: Math.max(1.5, rf.expiresAt - serverNow), age: 0, size0: rad * 0.96, size1: rad * 0.96,
            color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.85,
          });
        }
      }

      // I. Severe Flight / Rite suppression scars (ragged scorch texture + glowing smoldering wisps, NOT flat black circles!)
      const scorches = (snapshot.dragOonSuppressionZones ?? []).filter(z => serverNow < z.expiresAt);
      for (const sz of scorches) {
        const sc = this.#distScale(sz.center, camPos);
        if (sc <= 0.01) continue;
        const rad = sz.radius ?? 5.2;
        const age = serverNow - sz.bornAt;
        if (age < 0.25 && Math.random() < 0.5) {
          this.scorchDecalPool.spawn({
            x: sz.center.x, y: (sz.center.y ?? 0) + 0.045, z: sz.center.z,
            vx: 0, vy: 0, vz: 0, orientMode: 'flat', spin: Math.random() * 6,
            life: Math.max(1.0, sz.expiresAt - serverNow), age: 0, size0: rad * 0.92, size1: rad * 0.92,
            color0: ELEMENT_COLORS.fire, color1: ELEMENT_COLORS.smokeDark, brightness: 0.85,
          });
        }
        if (Math.random() < 0.28 * sc) {
          const ang = Math.random() * Math.PI * 2;
          const dist = Math.sqrt(Math.random()) * rad * 0.8;
          this.smokePool.spawn({
            x: sz.center.x + Math.cos(ang) * dist, y: (sz.center.y ?? 0) + 0.2, z: sz.center.z + Math.sin(ang) * dist,
            vx: this.#jitter(0.4), vy: 1.1 + Math.random() * 0.9, vz: this.#jitter(0.4),
            life: 0.85, age: 0, size0: 0.6, size1: 1.8,
            color0: ELEMENT_COLORS.smokeWarm, color1: ELEMENT_COLORS.smokeDark, brightness: 0.5, fadeIn: true,
          });
        }
      }

      this.#updateDebugVolumes(snapshot, serverNow);
    }

    this.smokePool.step(safeDt, camQuat);
    this.glowPool.step(safeDt, camQuat);
    this.streakPool.step(safeDt, camQuat);
    this.sparkPool.step(safeDt, camQuat);
    this.debrisPool.step(safeDt, camQuat);
    this.scorchDecalPool.step(safeDt, camQuat);
  }

  dispose() {
    this.group.removeFromParent();
    this.quadGeo.dispose();
    this.crossedStreakGeo.dispose();
    this.debrisGeo.dispose();
    this.scorchPlaneGeo.dispose();
    this.razeAimRingGeo.dispose();
    this.dbgSphereGeo.dispose();
    this.dbgRingGeo.dispose();
    this.dbgDiscGeo.dispose();
    this.dbgWireGeo.dispose();
    this.dbgConeGeo.dispose();
    this.smokeMat.dispose();
    this.glowMat.dispose();
    this.streakMat.dispose();
    this.sparkMat.dispose();
    this.debrisMat.dispose();
    this.scorchDecalMat.dispose();
  }
}
