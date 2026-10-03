import * as THREE from 'three';
import { impactWorldPresentation, sampleTrailSegment, transientScale } from './effectTrail.mjs';
import { puffTexture, windStreakTexture } from './softTextures.mjs';
import {
  GALE_VOLUME, createWindConeMaterial, createWindRibbonMaterial, createWindWaveMaterial, createWindWispMaterial, galeVolumeAt, windConeGeometry,
  windRibbonGeometry, windWaveGeometry, windWispGeometry,
} from './galeVolume.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { createGaleOrb } from './galeOrb.mjs';
import { everywhere } from './viewLayers.mjs';
import { createBlastFrontMaterial, createElementalOrb } from './elementalOrb.mjs';
import { chillPresentation, elementalProfile, gatherEnvelope } from './elementalVfxModel.mjs';

const MAX_TRANSIENTS = 260;

// how each spell looks: fire is orange and throws embers; frost is ice-blue and throws shards
const SPELL_LOOKS = Object.freeze({
  fireball: { core: 0xffe0a3, emissive: 0xff641c, shell: 0xff7a2a, heart: 0xffe6a8, light: 0xff6b24, bits: [0xffb13b, 0xff6328], flash: 0xff8a2b, burst: 0xffd18a, ring: 0xff9a3c, cloud: 0x6b5a4c },
  frostfire: { core: 0xe9fcff, emissive: 0x3fb8ff, shell: 0x86dcff, heart: 0xf4fdff, light: 0x5cc8ff, bits: [0xd9f6ff, 0x7fd0ff], flash: 0x8fdcff, burst: 0xe6fbff, ring: 0x7fd6ff, cloud: 0xdff4ff },
  // wind: white air with the faintest sage in it, never an elemental green
  gale: { core: 0xf4f7f2, emissive: 0xdfe8dc, shell: 0xe8efe6, heart: 0xffffff, light: 0xe2ebe0, bits: [0xf2f5ef, 0xd8e2d4], flash: 0xe8f0e6, burst: 0xf5f8f3, ring: 0xdbe5d8, cloud: 0xe9eee6 },
});
const lookFor = (spell) => SPELL_LOOKS[spell] ?? SPELL_LOOKS.fireball;

// A crescent ribbon in the XY plane, centred on the origin: width swells to its middle and tapers to both points;
// vertex brightness is hottest on the outer (cutting) edge and fades toward the tips.
function crescentGeometry({ radius, width, arc, segments }) {
  const positions = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = -arc / 2 + arc * t;
    const swell = Math.sin(Math.PI * t);
    const inner = radius - width * swell;
    const tip = Math.pow(swell, 0.6);
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    colors.push(tip, tip * 0.96, tip * 0.86);
    positions.push(Math.cos(angle) * inner, Math.sin(angle) * inner, 0);
    colors.push(tip * 0.55, tip * 0.4, tip * 0.18);
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  // the middle of the cutting edge sits on the origin, so the slash passes through the point of impact
  geometry.translate(-radius, 0, 0);
  return geometry;
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.projectiles = new Map();
    this.gathers = new Set();
    this.chilledBodies = new Map();
    this.transients = [];
    this.basicMaterials = new Map();

    this.emberGeometry = new THREE.BoxGeometry(0.035, 0.035, 0.11);
    this.emberMaterials = [
      new THREE.MeshBasicMaterial({ color: 0xffb13b }),
      new THREE.MeshBasicMaterial({ color: 0xff6328 }),
    ];
    this.sparkGeometry = new THREE.BoxGeometry(0.025, 0.025, 0.11);
    this.flashGeometry = new THREE.OctahedronGeometry(0.055, 0);
    this.impactFlashGeometry = new THREE.OctahedronGeometry(0.22, 0);
    this.impactRingGeometry = new THREE.TorusGeometry(0.28, 0.025, 4, 16);
    this.dashGeometry = new THREE.PlaneGeometry(0.018, 0.18);
    this.chipGeometry = new THREE.BoxGeometry(0.05, 0.02, 0.04);
    // the slash: a crescent of light, thick in the middle and tapering to points, hottest along its edge
    this.slashGeometry = crescentGeometry({ radius: 0.62, width: 0.16, arc: 2.3, segments: 28 });
    this.slashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.hotSparkGeometry = new THREE.BoxGeometry(0.035, 0.035, 0.17);
    // wind: a streak of air (two crossed ribbons, so it reads from any side), running along its own z with its soft
    // head forward (softTextures: the streak's v runs from its tail to its head)
    this.windStreakGeometry = (() => {
      const a = new THREE.PlaneGeometry(0.05, 1.1).rotateX(Math.PI / 2);
      const b = new THREE.PlaneGeometry(0.05, 1.1).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
      const merged = new THREE.BufferGeometry();
      const join = (name, size) => merged.setAttribute(name, new THREE.BufferAttribute(new Float32Array([...a.attributes[name].array, ...b.attributes[name].array]), size));
      join('position', 3);
      join('uv', 2);
      merged.setIndex([...a.index.array, ...[...b.index.array].map((i) => i + a.attributes.position.count)]);
      a.dispose();
      b.dispose();
      return merged;
    })();
    this.windMaterial = new THREE.MeshBasicMaterial({
      map: windStreakTexture(), color: 0xf1f5ef, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    // the body of a gust (galeVolume.mjs: a cone of moving air and ribbons twisting round it; shapes made per spell),
    // a breath of air at the hand, a puff of dust (tinted by what the ground is made of) and a blade of grass torn loose
    this.windConeMaterial = createWindConeMaterial();
    this.windRibbonMaterial = createWindRibbonMaterial();
    this.windWaveMaterial = createWindWaveMaterial();
    this.windWispMaterial = createWindWispMaterial();
    this.windShapes = new Map();
    // gusts still blowing (a body each, following its caster), until they are spent
    this.gustBodies = [];
    this.windPuffMaterial = new THREE.SpriteMaterial({ map: puffTexture(), color: 0xf4f7f2, transparent: true, opacity: 0.4, depthWrite: false });
    this.dustMaterials = new Map(Object.entries({ stone: 0xd9d4c8, grass: 0xc2c29a, earth: 0xc9b390 }).map(([surface, color]) => [
      surface, new THREE.SpriteMaterial({ map: puffTexture(), color, transparent: true, opacity: 0.34, depthWrite: false }),
    ]));
    this.grassGeometry = new THREE.PlaneGeometry(0.025, 0.09);
    this.grassMaterials = [0x7f9a4a, 0x9bb25c].map((color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));

    this.dashMaterial = new THREE.MeshBasicMaterial({
      color: 0xb9eaff,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.blastGeometry = new THREE.IcosahedronGeometry(0.5, 2);
    this.groundRingGeometry = new THREE.RingGeometry(0.8, 1, 40);
    this.blastFrontGeometry = new THREE.SphereGeometry(1, 24, 12);
    this.scorchGeometry = new THREE.CircleGeometry(1, 24);
    this.shardGeometry = new THREE.BoxGeometry(0.04, 0.04, 0.2);
    this.moteGeometry = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    this.flameGeometry = new THREE.OctahedronGeometry(0.1, 0);
    this.spellMaterials = new Map();
    this.elementalMistMaterials = new Map();
    this.flashLights = [];
    this.afflictionCarry = new Map();

  }

  // a spell's own materials, made once (projectile core and shell, blast, rings, cloud)
  #spellMaterials(spell) {
    if (this.spellMaterials.has(spell)) return this.spellMaterials.get(spell);
    const look = lookFor(spell);
    const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const materials = {
      core: new THREE.MeshStandardMaterial({ color: look.core, emissive: look.emissive, emissiveIntensity: 5.2, roughness: 0.18, metalness: 0.05 }),
      shell: glow(look.shell, 0.31),
      blast: glow(look.shell, 0.5),
      // fire you could not see through: the billows of a fireball (drawn solid, so a bright sky cannot wash them out)
      billow: new THREE.MeshBasicMaterial({ color: spell === 'frostfire' ? look.shell : 0xff5a14, transparent: true, opacity: 0.85, depthWrite: false }),
      ember: new THREE.MeshBasicMaterial({ color: spell === 'frostfire' ? look.shell : 0xc9300c, transparent: true, opacity: 0.8, depthWrite: false }),
      heart: glow(look.heart, 0.85),
      // the blast's reach along the ground: a faint pressure wave, not a painted circle
      ring: new THREE.MeshBasicMaterial({ color: look.ring, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      // what it leaves on the ground for a moment: scorched earth, or a rime of frost
      mark: new THREE.MeshBasicMaterial({ color: spell === 'frostfire' ? 0xd9f3ff : 0x1c130c, transparent: true, opacity: spell === 'frostfire' ? 0.3 : 0.42, depthWrite: false }),
      cloud: new THREE.MeshBasicMaterial({ color: look.cloud, transparent: true, opacity: spell === 'frostfire' ? 0.28 : 0.32, depthWrite: false }),
      bits: look.bits.map((color) => new THREE.MeshBasicMaterial({ color })),
    };
    this.spellMaterials.set(spell, materials);
    return materials;
  }

  #elementalMist(spell) {
    if (!this.elementalMistMaterials.has(spell)) {
      this.elementalMistMaterials.set(spell, new THREE.SpriteMaterial({
        map: puffTexture(), color: spell === 'frostfire' ? 0xe4f6fa : 0x756d67,
        transparent: true, opacity: spell === 'frostfire' ? 0.2 : 0.18, depthWrite: false,
      }));
    }
    return this.elementalMistMaterials.get(spell);
  }

  /** Provider is sampled each frame: { origin, direction }. Casts track the live palm and aim. */
  spellGather(spell, provider, { gatherSec = SPELLS[spell]?.gatherSec ?? 0.3 } = {}) {
    if (typeof provider !== 'function' || !(gatherSec > 0)) return null;
    const profile = elementalProfile(spell);
    const orb = createElementalOrb(spell);
    const light = everywhere(new THREE.PointLight(lookFor(spell).light, 0, 2.4, 2));
    orb.add(light);
    const motes = [];
    const materials = this.#spellMaterials(spell);
    for (let i = 0; i < 7; i += 1) {
      const mote = new THREE.Mesh(profile.frost ? this.shardGeometry : this.flameGeometry, materials.bits[i % 2]);
      mote.scale.setScalar(profile.frost ? 0.5 : 0.4);
      orb.add(mote);
      motes.push(mote);
    }
    this.scene.add(orb);
    const gather = { orb, provider, age: 0, duration: gatherSec, light, motes, profile };
    this.gathers.add(gather);
    const cancel = () => {
      if (!this.gathers.delete(gather)) return;
      orb.removeFromParent();
      // Motes borrow cached materials and geometry; remove before disposing owned orb resources.
      motes.forEach((mote) => orb.remove(mote));
      orb.userData.dispose();
    };
    gather.cancel = cancel;
    const handle = { cancel, get alive() { return Boolean(orb.parent); } };
    this.#updateGather(gather, 0);
    return handle;
  }

  #updateGather(gather, dt) {
    gather.age += dt;
    if (gather.age >= gather.duration) { gather.cancel(); return; }
    const pose = gather.provider();
    if (!pose?.origin) { gather.cancel(); return; }
    gather.orb.position.set(pose.origin.x, pose.origin.y, pose.origin.z);
    if (pose.direction) {
      const dir = new THREE.Vector3(pose.direction.x, pose.direction.y, pose.direction.z);
      if (dir.lengthSq() > 1e-8) gather.orb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    }
    const envelope = gatherEnvelope(gather.age, gather.duration);
    gather.orb.scale.setScalar(envelope.scale);
    gather.orb.userData.update(gather.age);
    gather.light.intensity = (gather.profile.frost ? 2.5 : 5) * envelope.light;
    gather.motes.forEach((mote, i) => {
      const angle = i * Math.PI * 2 / gather.motes.length + gather.age * (gather.profile.frost ? -3 : 7);
      const reach = 0.18 + (1 - envelope.progress) * (0.14 + i % 3 * 0.045);
      mote.position.set(Math.cos(angle) * reach, Math.sin(angle) * reach, Math.sin(angle * 1.5) * reach * 0.4);
      mote.rotation.set(angle * 0.5, angle, angle * 0.8);
    });
  }

  // a brief burst of light where a spell breaks
  #flashLight(point, color, intensity, life, distance) {
    const light = everywhere(new THREE.PointLight(color, intensity, distance, 2));
    light.position.set(point.x, point.y, point.z);
    this.scene.add(light);
    this.flashLights.push({ light, life, age: 0, intensity });
  }

  #basicMaterial(color) {
    if (!this.basicMaterials.has(color)) this.basicMaterials.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.basicMaterials.get(color);
  }

  #addTransient(mesh, {
    velocity = new THREE.Vector3(),
    life = 0.2,
    expand = 0,
    shrink = false,
    gravity = 0,
    spin = null,
    parent = this.scene,
    fade = false,
    drag = 0,
    // tick(age): called each frame (a shader's uniforms, say); own: the transient owns its material (disposed with it);
    // ownGeometry: and its geometry
    tick = null,
    own = false,
    ownGeometry = false,
  } = {}) {
    parent.add(mesh);
    if (fade) {
      mesh.material = mesh.material.clone();
      mesh.userData.baseOpacity = mesh.material.opacity ?? 1;
    }
    this.transients.push({
      mesh,
      parent,
      velocity,
      life,
      maxLife: life,
      age: 0,
      expand,
      shrink,
      gravity,
      spin,
      fade,
      drag,
      tick,
      own,
      ownGeometry,
      baseScale: mesh.scale.clone(),
    });
    while (this.transients.length > MAX_TRANSIENTS) this.#removeTransient(this.transients.shift());
    return mesh;
  }

  #removeTransient(transient) {
    if (!transient) return;
    transient.parent?.remove(transient.mesh);
    // fading transients own their material (cloned); textures such as damage numbers are cached and shared
    if (transient.fade || transient.own) transient.mesh.material.dispose();
    if (transient.ownGeometry) transient.mesh.geometry.dispose();
  }

  #cameraFlash(color = 0xffd68a, life = 0.1, scale = 1) {
    const mesh = new THREE.Mesh(this.flashGeometry, this.#basicMaterial(color));
    mesh.scale.setScalar(scale);
    mesh.position.set(-0.22, -0.18, -0.52);
    this.#addTransient(mesh, {
      parent: this.camera,
      velocity: new THREE.Vector3(0, 0.16, -0.08),
      life,
      expand: 3.2,
      shrink: true,
      spin: new THREE.Vector3(5, 7, 3),
    });
  }

  #dashStreaks() {
    for (let i = 0; i < 7; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const mesh = new THREE.Mesh(this.dashGeometry, this.dashMaterial);
      mesh.position.set(side * (0.22 + Math.random() * 0.25), (Math.random() - 0.5) * 0.5, -0.52 - Math.random() * 0.08);
      mesh.rotation.z = side * (0.08 + Math.random() * 0.28);
      this.#addTransient(mesh, {
        parent: this.camera,
        velocity: new THREE.Vector3(side * 0.9, 0, 0),
        life: 0.12 + Math.random() * 0.04,
        shrink: true,
      });
    }
  }

  // (sounds are played by the SoundEngine; these are the first-person flashes)
  swordSwing() {}
  swordHit() {}
  block() { this.#cameraFlash(0xffd38a, 0.09, 0.8); }
  parry() { this.#cameraFlash(0xaeefff, 0.12, 1.25); }
  guardBreak() { this.#cameraFlash(0xff744d, 0.14, 1.15); }
  /** The palm lights up as a spell begins to gather. */
  castFlash(spell = 'fireball') { this.#cameraFlash(lookFor(spell).flash, 0.08, 0.58); }
  dash() { this.#dashStreaks(); }

  wallClang(point) {
    this.sparks(point, 0xffd48a, 14);
  }

  /** Splinters and dust knocked off timber by a blade. */
  // a puff of dust off the ground, drifting up and spreading as it thins
  #dust(point, { size = 1, rise = 0.8, life = 0.6, color = 0x9a8a72 } = {}) {
    this.dustGeometry ??= new THREE.IcosahedronGeometry(0.14, 0);
    this.dustMaterials ??= new Map();
    if (!this.dustMaterials.has(color)) this.dustMaterials.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false }));
    const puff = new THREE.Mesh(this.dustGeometry, this.dustMaterials.get(color));
    puff.position.set(point.x + (Math.random() - 0.5) * 0.2, point.y + 0.05, point.z + (Math.random() - 0.5) * 0.2);
    puff.scale.setScalar(size);
    this.#addTransient(puff, { velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, rise, (Math.random() - 0.5) * 0.5), life, expand: 2.4, fade: true, drag: 2.5 });
  }

  /**
   * A Sundering blade driven into the ground: broken stone thrown up and a burst of dust where it struck; then each
   * fissure runs out along the ground at `speed` (a dark jagged split drawn as it goes, dust kicked up at its head), and
   * the split ground lingers a moment before it fades. fissures: [{ dir: {x, z}, length }] (as the host planned them).
   */
  rupture(origin, fissures, { speed = 8.5, lastsSec = 2.5 } = {}) {
    const at = { x: origin.x, y: origin.y, z: origin.z };
    const stones = [this.#basicMaterial(0x6d655a), this.#basicMaterial(0x8e8574), this.#basicMaterial(0x4f4a43)];
    for (let i = 0; i < 16; i += 1) {
      const mesh = new THREE.Mesh(this.chipGeometry, stones[i % 3]);
      mesh.position.set(at.x, at.y + 0.05, at.z);
      mesh.scale.setScalar(1.4 + Math.random() * 1.6);
      const dir = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.#addTransient(mesh, { velocity: dir.multiplyScalar(2.5 + Math.random() * 3), life: 0.6 + Math.random() * 0.4, gravity: 14, spin: new THREE.Vector3(10, 7, 8) });
    }
    for (let i = 0; i < 6; i += 1) this.#dust(at, { size: 1.6, rise: 1.1, life: 0.9 });
    this.#flashLight({ x: at.x, y: at.y + 0.3, z: at.z }, 0xffb070, 3, 0.18, 5);
    const crackMaterial = new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    for (const fissure of fissures) {
      const segments = Math.max(2, Math.round(fissure.length / 0.3));
      const positions = new Float32Array(segments * 6 * 3);
      const across = { x: -fissure.dir.z, z: fissure.dir.x };
      let wander = 0;
      const point = (k) => {
        const t = k / segments;
        const d = t * fissure.length;
        return { x: at.x + fissure.dir.x * d + across.x * wander, z: at.z + fissure.dir.z * d + across.z * wander, w: 0.13 * (1 - 0.55 * t) + 0.03 };
      };
      let prev = point(0);
      for (let k = 1; k <= segments; k += 1) {
        wander = Math.max(-0.25, Math.min(0.25, wander + (Math.random() - 0.5) * 0.16));
        const next = point(k);
        const y = at.y + 0.015;
        const quad = [
          [prev.x - across.x * prev.w, y, prev.z - across.z * prev.w], [next.x - across.x * next.w, y, next.z - across.z * next.w], [next.x + across.x * next.w, y, next.z + across.z * next.w],
          [prev.x - across.x * prev.w, y, prev.z - across.z * prev.w], [next.x + across.x * next.w, y, next.z + across.z * next.w], [prev.x + across.x * prev.w, y, prev.z + across.z * prev.w],
        ];
        quad.forEach((v, j) => positions.set(v, ((k - 1) * 6 + j) * 3));
        prev = next;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setDrawRange(0, 0);
      const crack = new THREE.Mesh(geometry, crackMaterial.clone());
      crack.renderOrder = 2;
      const runSec = fissure.length / speed;
      let dustAt = 0;
      this.#addTransient(crack, {
        life: runSec + lastsSec,
        own: true,
        ownGeometry: true,
        tick: (age) => {
          const reached = Math.min(1, age / runSec);
          geometry.setDrawRange(0, Math.ceil(reached * segments) * 6);
          const left = runSec + lastsSec - age;
          crack.material.opacity = 0.88 * Math.min(1, left / 0.8);
          // dust kicked up at the running head
          if (reached < 1 && age >= dustAt) {
            dustAt = age + 0.07;
            const d = reached * fissure.length;
            this.#dust({ x: at.x + fissure.dir.x * d, y: at.y, z: at.z + fissure.dir.z * d }, { size: 1.1, rise: 0.9, life: 0.55 });
          }
        },
      });
    }
    crackMaterial.dispose();
  }

  /** A Sundering blow landing: heavier sparks and a dull shock ring round the point, the blow's weight made visible. */
  sunderStrike(point, dir) {
    this.sparks(point, 0xffb060, 16);
    this.#groundRing({ x: point.x, y: point.y, z: point.z }, 0xb8602c, 0.8, true);
    this.#flashLight(point, 0xff9a50, 2.4, 0.12, 4);
    void dir;
  }

  splinters(point, count = 10) {
    const materials = [this.#basicMaterial(0x8a6a44), this.#basicMaterial(0xb89868)];
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(this.chipGeometry, materials[i % 2]);
      mesh.position.set(point.x, point.y, point.z);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.2, Math.random() - 0.5).normalize();
      this.#addTransient(mesh, { velocity: dir.multiplyScalar(2 + Math.random() * 2.5), life: 0.45 + Math.random() * 0.3, gravity: 9, spin: new THREE.Vector3(9, 6, 7) });
    }
  }

  /**
   * A sword landing on a body: a slash arc along the stroke, a white-hot flash, hot sparks thrown along the blow and
   * a few chips of armour. strike: combo index (2 = the heavy third strike); dir: the blow's direction (attacker to victim).
   */
  hitBurst(point, dir, { strike = 0, heavy = false, quality = 1 } = {}) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    const push = new THREE.Vector3(dir?.x ?? 0, 0, dir?.z ?? 0);
    if (push.lengthSq() < 1e-6) push.set(0, 0, 1);
    push.normalize();
    const big = heavy || strike >= 2;
    // a glancing blow: a smaller, quicker burst (fewer sparks), the blade skating off rather than biting in
    const bite = 0.55 + 0.45 * Math.max(0, Math.min(1, Number.isFinite(quality) ? quality : 1));

    // the slash: an arc facing the camera, rolled to match the stroke (right-to-left, left-to-right, overhead)
    const arc = new THREE.Mesh(this.slashGeometry, this.slashMaterial);
    arc.position.copy(at);
    arc.lookAt(this.camera.getWorldPosition(new THREE.Vector3()));
    arc.rotateZ([-0.75, 0.75 + Math.PI, -Math.PI / 2][strike % 3]);
    arc.scale.setScalar((big ? 1.25 : 1) * bite);
    this.#addTransient(arc, { life: (big ? 0.2 : 0.15) * bite, expand: 2.6, fade: true });

    const core = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(0xfff4dc));
    core.position.copy(at);
    core.scale.setScalar((big ? 0.75 : 0.5) * bite);
    this.#addTransient(core, { life: 0.09, expand: 3.2, shrink: true, spin: new THREE.Vector3(4, 6, 3) });

    // sparks fly out of the cut to both sides and up (across the view, where they read), a few along the blow
    const side = new THREE.Vector3(-push.z, 0, push.x);
    for (let i = 0; i < Math.round((big ? 28 : 18) * bite); i += 1) {
      const spark = new THREE.Mesh(this.hotSparkGeometry, this.#basicMaterial(i % 3 ? 0xffcf6a : 0xfff3c4));
      spark.position.copy(at);
      const velocity = side.clone().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3.5))
        .add(push.clone().multiplyScalar(0.5 + Math.random() * 2.5))
        .add(new THREE.Vector3(0, 0.8 + Math.random() * 3.4, 0));
      spark.lookAt(at.clone().add(velocity));
      this.#addTransient(spark, { velocity, life: 0.22 + Math.random() * 0.22, shrink: true, gravity: 9, drag: 2.2 });
    }
    for (let i = 0; i < Math.round((big ? 7 : 4) * bite); i += 1) {
      const chip = new THREE.Mesh(this.chipGeometry, this.#basicMaterial(i % 2 ? 0x55585c : 0x8a8f94));
      chip.position.copy(at);
      const velocity = push.clone().multiplyScalar(1.2 + Math.random() * 1.8)
        .add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 2.4));
      this.#addTransient(chip, { velocity, life: 0.5 + Math.random() * 0.3, gravity: 14, spin: new THREE.Vector3(9, 11, 7), shrink: true });
    }
    if (big) this.#groundRing(at, 0xffc47a);
  }

  /** The killing blow: a shockwave at the feet and embers rising off the body. */
  killBurst(point) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    this.#groundRing(at, 0xff9a4a, 1.6);
    for (let i = 0; i < 24; i += 1) {
      const ember = new THREE.Mesh(this.emberGeometry, this.emberMaterials[i % 2]);
      ember.position.set(at.x + (Math.random() - 0.5) * 0.6, at.y - 0.4 + Math.random() * 0.8, at.z + (Math.random() - 0.5) * 0.6);
      this.#addTransient(ember, { velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8), life: 0.6 + Math.random() * 0.5, shrink: true, spin: new THREE.Vector3(3, 4, 5) });
    }
  }

  /** Steel meeting steel on a guard: bright blue-white sparks and a flat flash where the blades met. */
  blockBurst(point, dir, { heavy = false, parry = false } = {}) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    const push = new THREE.Vector3(dir?.x ?? 0, 0, dir?.z ?? 0).normalize();
    const color = parry ? 0xbff4ff : 0xfff0c8;
    const flash = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(color));
    flash.position.copy(at);
    flash.scale.setScalar(parry ? 0.7 : 0.45);
    this.#addTransient(flash, { life: parry ? 0.14 : 0.08, expand: parry ? 4.5 : 3, shrink: true, spin: new THREE.Vector3(5, 3, 6) });
    for (let i = 0; i < (heavy || parry ? 24 : 14); i += 1) {
      const spark = new THREE.Mesh(this.sparkGeometry, this.#basicMaterial(i % 2 ? color : 0xffd27a));
      spark.position.copy(at);
      // sparks fly back toward the attacker off the guard
      const velocity = push.clone().multiplyScalar(-(1.5 + Math.random() * 3))
        .add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3.5, (Math.random() - 0.5) * 5));
      spark.lookAt(at.clone().add(velocity));
      this.#addTransient(spark, { velocity, life: 0.2 + Math.random() * 0.2, shrink: true, gravity: 9, drag: 2 });
    }
    if (parry) this.#groundRing(at.clone().setY(at.y + 0.2), 0x9fe8ff, 0.8, true);
  }

  /**
   * Gale Garner lets go: a body of moving air, not a mark on the ground. A translucent cone of wind (its pressure) with
   * a denser heart inside it, both white streaked with pale sage and billowing, their front racing out from the hand
   * and the air behind it rushing on; ribbons of air twisting out round it; a breath of air bursting from the hand;
   * streaks of wind rushing past; and dust (and on grass, torn blades) blown along the ground wherever the gust runs
   * low over it. origin/direction: where it leaves and which way (unit); cone: its reach and angles
   * (shared/src/spells.mjs), so what is seen is where it pushes. ground: { groundAt(x, z, y) → the floor's height there
   * or null, surfaceAt(x, z, y) → 'stone' | 'grass' | 'earth' }; without it, no dust.
   */
  galeBlast(origin, direction, cone, { groundAt = null, surfaceAt = null } = {}) {
    const from = new THREE.Vector3(origin.x, origin.y, origin.z);
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const spread = (cone.pressureHalfAngleDeg * Math.PI) / 180;

    // the body of the gust: its pressure (wide, faint), its heart (narrower, denser), the ribbons round it, the wavy
    // lines and the wisps, each playing out over the gust's life (galeVolumeAt) and rolling further out as it goes. All
    // of it is one body that stays at its caster's hand and turns with their aim while the gust blows (the handle's
    // follow()); what it blows loose (streaks, dust, grass) flies free
    const shapes = this.#windShapes(cone);
    const gust = new THREE.Group();
    gust.position.copy(from);
    gust.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(gust);
    const bodyLife = GALE_VOLUME.life;
    const body = (geometry, material, length, { opacity, swirl = null, near = null, haze = null, rim = null, lag = 1 }) => {
      lag = Math.min(1, lag);
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.rotateZ(Math.random() * Math.PI * 2);
      mesh.scale.setScalar(length);
      mesh.frustumCulled = false;
      const u = mesh.material.uniforms;
      u.uOpacity.value = opacity;
      if (swirl !== null) u.uSwirl.value = swirl;
      if (near !== null) u.uNear.value = near;
      if (haze !== null) u.uHaze.value = haze;
      if (rim !== null) u.uRimFill.value = rim;
      this.#addTransient(mesh, {
        parent: gust,
        life: GALE_VOLUME.life * lag,
        own: true,
        // rolling out: longer and wider as it goes
        expand: GALE_VOLUME.spread / (GALE_VOLUME.life * lag),
        tick: (age) => {
          const at = galeVolumeAt(age / lag);
          if (u.uHead) u.uHead.value = at.head;
          if (u.uTime) u.uTime.value = age;
          if (u.uFront) u.uFront.value = at.front;
          if (u.uTurb) u.uTurb.value = at.turbulence;
          u.uFade.value = at.fade;
        },
      });
    };
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    // the pressure's sides filled out with a soft wall of air, green toward its edge
    body(shapes.pressure, this.windConeMaterial, cone.pressureReach * 0.95, { opacity: 0.5, swirl: 0.25, near: 0.2, rim: 0.55, lag: 1.12 });
    body(shapes.heart, this.windConeMaterial, cone.reach, { opacity: 0.8, swirl: 0.45, near: 0.12, haze: 0.14, rim: 0.25 });
    body(pick(shapes.ribbons), this.windRibbonMaterial, cone.reach * 1.2, { opacity: 0.75 });
    // wavy lines of wind, white and green, rippling out along the sides; and wisps curling out through it
    body(pick(shapes.waves), this.windWaveMaterial, cone.pressureReach * 0.9, { opacity: 0.8, lag: 1.08 });
    body(pick(shapes.wisps), this.windWispMaterial, cone.pressureReach * 0.85, { opacity: 0.85, lag: 1.15 });
    const born = performance.now() / 1000;
    const turned = new THREE.Quaternion();
    const handle = {
      /** Keep the gust at its caster's hand and along their aim (eased, so it sways with the arm rather than jumps). */
      follow(origin, direction) {
        if (!gust.parent) return;
        gust.position.set(origin.x, origin.y, origin.z);
        const way = new THREE.Vector3(direction.x, direction.y, direction.z);
        if (way.lengthSq() < 1e-8) return;
        turned.setFromUnitVectors(new THREE.Vector3(0, 0, 1), way.normalize());
        gust.quaternion.slerp(turned, 0.35);
      },
      get alive() { return Boolean(gust.parent) && performance.now() / 1000 - born < bodyLife; },
    };
    this.gustBodies.push({ gust, until: born + bodyLife });
    // more wind keeps leaving the hand while the gust blows
    for (const delay of [cone.lastsSec * 0.28, cone.lastsSec * 0.58]) {
      setTimeout(() => {
        if (!gust.parent) return;
        const at = gust.getWorldPosition(new THREE.Vector3());
        const way = new THREE.Vector3(0, 0, 1).applyQuaternion(gust.quaternion);
        this.#galeStreaks(at, way, cone, 6, 0.8);
      }, delay * 1000);
    }

    // a breath of air bursting from the hand
    const breath = new THREE.Sprite(this.windPuffMaterial);
    breath.position.copy(from).addScaledVector(dir, 0.5);
    breath.scale.setScalar(0.5);
    this.#addTransient(breath, { velocity: dir.clone().multiplyScalar(4), life: 0.26, expand: 5, fade: true, drag: 3 });

    this.#galeStreaks(from, dir, cone, 16, 1);
    // what it blows off the ground: only where the pressure reaches down to it
    const along = new THREE.Vector3(dir.x, 0, dir.z);
    if (!groundAt || along.lengthSq() < 1e-4) return handle;
    along.normalize();
    const across = new THREE.Vector3(-along.z, 0, along.x);
    for (let i = 0; i < 18; i += 1) {
      const d = 1 + Math.random() * cone.pressureReach * 0.8;
      const wide = Math.tan(spread) * d * 0.7;
      const x = from.x + dir.x * d + across.x * (Math.random() - 0.5) * 2 * wide;
      const z = from.z + dir.z * d + across.z * (Math.random() - 0.5) * 2 * wide;
      const floor = groundAt(x, z, from.y);
      const low = from.y + dir.y * d - (floor ?? -Infinity);
      if (floor === null || low > Math.tan(spread) * d + 0.5 || low < -0.5) continue;
      const surface = surfaceAt?.(x, z, floor) ?? 'earth';
      const strength = 1 - d / (cone.pressureReach + 1);
      const puff = new THREE.Sprite(this.dustMaterials.get(surface) ?? this.dustMaterials.get('earth'));
      puff.position.set(x, floor + 0.12 + Math.random() * 0.2, z);
      puff.scale.setScalar(0.35 + Math.random() * 0.25);
      const velocity = along.clone().multiplyScalar((3 + Math.random() * 4) * (0.5 + strength)).add(new THREE.Vector3(0, 0.5 + Math.random() * 1.1, 0));
      this.#addTransient(puff, { velocity, life: 0.7 + Math.random() * 0.5, expand: 2.2, fade: true, drag: 2.4 });
      // on grass, a few blades torn loose and tumbling off with it
      if (surface === 'grass' && i % 2 === 0) {
        const blade = new THREE.Mesh(this.grassGeometry, this.grassMaterials[i % 4 === 0 ? 0 : 1]);
        blade.position.set(x, floor + 0.08, z);
        blade.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        const fling = along.clone().multiplyScalar((4 + Math.random() * 4) * (0.5 + strength)).add(new THREE.Vector3(0, 1.4 + Math.random() * 1.6, 0));
        this.#addTransient(blade, { velocity: fling, life: 0.8 + Math.random() * 0.4, gravity: 4.5, drag: 1.6, spin: { x: 9 * Math.random(), y: 12, z: 7 * Math.random() } });
      }
    }
    return handle;
  }

  /**
   * Compile the shaders of effects first seen mid-fight (a gust's air, streaks, dust and grass; a Gale's ball), where
   * the browser allows off the frame, so the first of them does not stall one. `scene`: where they will be drawn.
   */
  warm(renderer, scene = this.scene) {
    const group = new THREE.Group();
    const shapes = this.#windShapes(SPELLS.gale.cone);
    group.add(new THREE.Mesh(shapes.heart, this.windConeMaterial));
    group.add(new THREE.Mesh(shapes.ribbons[0], this.windRibbonMaterial));
    group.add(new THREE.Mesh(shapes.waves[0], this.windWaveMaterial));
    group.add(new THREE.Mesh(shapes.wisps[0], this.windWispMaterial));
    // (the Gale ball in the palm shares its shaders with this one, kept so they stay built: ready for the first hand)
    this.warmGaleOrb ??= createGaleOrb();
    group.add(this.warmGaleOrb);
    group.add(new THREE.Sprite(this.windPuffMaterial));
    group.add(new THREE.Mesh(this.windStreakGeometry, this.windMaterial));
    group.add(new THREE.Sprite(this.dustMaterials.get('earth')));
    group.add(new THREE.Mesh(this.grassGeometry, this.grassMaterials[0]));
    return (renderer.compileAsync?.(group, this.camera, scene) ?? Promise.resolve(renderer.compile(group, this.camera, scene))).catch(() => {});
  }

  // streaks of wind: most sweep out low and to either side (from the hand, wind rushing past on the left and right and
  // skimming the ground, not a burst of sparks), a few down its heart further out; fast and stretched, spent toward
  // the edge of the pressure. `scale`: how bright
  #galeStreaks(from, dir, cone, count, scale) {
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const lift = new THREE.Vector3().crossVectors(side, dir).normalize();
    const heart = (cone.halfAngleDeg * Math.PI) / 180;
    const spread = (cone.pressureHalfAngleDeg * Math.PI) / 180;
    const off = (angle, around) => dir.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(side, Math.sin(angle) * Math.cos(around))
      .addScaledVector(lift, Math.sin(angle) * Math.sin(around)).normalize();
    for (let i = 0; i < count; i += 1) {
      const outer = i < count * 0.75;
      const angle = outer ? spread * (0.4 + 0.6 * Math.random()) : heart * (0.15 + 0.4 * Math.random());
      // round the gust from its right (0) through below it (-pi/2) to its left (pi): mostly the sides, some low
      const around = outer ? (i % 3 === 2 ? -Math.PI / 2 : i % 3 === 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.1 : Math.random() * Math.PI * 2;
      const way = off(angle, around);
      const at = outer ? 0.9 + Math.random() * 1.4 : 1.8 + Math.random() * 1.6;
      const speed = 16 + Math.random() * 8;
      const streak = new THREE.Mesh(this.windStreakGeometry, this.windMaterial);
      streak.position.copy(from).addScaledVector(way, at);
      streak.lookAt(streak.position.clone().add(way));
      streak.scale.set(1, 1, 1.3 + Math.random() * 1.3);
      const left = Math.max(0.6, cone.pressureReach - at);
      this.#addTransient(streak, { velocity: way.multiplyScalar(speed), life: (left / speed) * (0.45 + Math.random() * 0.35), fade: true, drag: 1.2 });
      streak.material.opacity = streak.userData.baseOpacity = (outer ? 0.34 : 0.22) * scale;
    }
  }

  // the gust's shapes for a cone of these angles: its pressure's shell, its heart's, and a few sets of ribbons
  #windShapes(cone) {
    const key = `${cone.halfAngleDeg}/${cone.pressureHalfAngleDeg}`;
    let shapes = this.windShapes.get(key);
    if (!shapes) {
      const heart = Math.tan((cone.halfAngleDeg * Math.PI) / 180);
      shapes = {
        pressure: windConeGeometry(Math.tan((cone.pressureHalfAngleDeg * Math.PI) / 180)),
        heart: windConeGeometry(heart),
        ribbons: [0, 1, 2].map(() => windRibbonGeometry(heart)),
        waves: [0, 1, 2].map(() => windWaveGeometry(Math.tan((cone.pressureHalfAngleDeg * Math.PI) / 180))),
        wisps: [0, 1, 2].map(() => windWispGeometry(Math.tan((cone.pressureHalfAngleDeg * Math.PI) / 180))),
      };
      this.windShapes.set(key, shapes);
    }
    return shapes;
  }

  /** A Gale gathering in someone's hand: wisps of air drawn in to it, turning as they come. */
  galeGather(pointOrProvider, { gatherSec = SPELLS.gale.gatherSec } = {}) {
    const provider = typeof pointOrProvider === 'function' ? pointOrProvider : () => ({ origin: pointOrProvider });
    const initial = provider();
    if (!initial?.origin) return null;
    const wisps = [];
    const at = new THREE.Vector3(initial.origin.x, initial.origin.y, initial.origin.z);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const wisp = new THREE.Mesh(this.windStreakGeometry, this.windMaterial);
      wisp.position.copy(at);
      wisp.scale.set(1, 1, 0.3);
      wisps.push(wisp);
      this.#addTransient(wisp, {
        life: gatherSec, fade: true,
        tick: (age) => {
          const pose = provider();
          if (!pose?.origin) { wisp.visible = false; return; }
          const progress = Math.min(1, age / Math.max(0.001, gatherSec));
          const reach = 0.65 * (1 - progress) + 0.08;
          const turn = angle + progress * 1.4;
          const offset = new THREE.Vector3(Math.cos(turn) * reach, Math.sin(turn) * reach * 0.45, Math.sin(turn * 1.7) * reach * 0.4);
          if (pose.direction) {
            const way = new THREE.Vector3(pose.direction.x, pose.direction.y, pose.direction.z);
            if (way.lengthSq() > 1e-8) offset.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), way.normalize()));
          }
          const palm = new THREE.Vector3(pose.origin.x, pose.origin.y, pose.origin.z);
          wisp.position.copy(palm).add(offset);
          wisp.lookAt(palm);
        },
      });
    }
    const owner = this;
    return {
      get alive() { return wisps.some((wisp) => Boolean(wisp.parent)); },
      cancel() {
        for (let i = owner.transients.length - 1; i >= 0; i -= 1) {
          if (!wisps.includes(owner.transients[i].mesh)) continue;
          owner.#removeTransient(owner.transients[i]);
          owner.transients.splice(i, 1);
        }
      },
    };
  }

  /**
   * A blow on hardened plate: a white glint on the armour and sparks skating off it, as many and as bright as the
   * plate is still strong (`strength` 0..1: fresh plate throws a shower, worn plate a few). `ring`: a flash of light
   * round it (not for sparks seen from inside the helm).
   */
  steelGlint(point, dir, { strength = 1, ring = true, scale = 1 } = {}) {
    const s = Math.max(0.1, Math.min(1, strength));
    const at = new THREE.Vector3(point.x, point.y, point.z);
    const away = new THREE.Vector3(dir?.x ?? 0, 0, dir?.z ?? 0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    away.normalize();
    const flash = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(0xeef5ff));
    flash.position.copy(at);
    flash.scale.setScalar((0.25 + 0.4 * s) * scale);
    this.#addTransient(flash, { life: 0.07 + 0.07 * s, expand: 4, shrink: true, spin: new THREE.Vector3(3, 7, 4) });
    const count = Math.round(4 + 14 * s);
    for (let i = 0; i < count; i += 1) {
      const spark = new THREE.Mesh(this.sparkGeometry, this.#basicMaterial(i % 3 === 0 ? 0xffe9b8 : i % 2 ? 0xdfe9f4 : 0xffffff));
      spark.position.copy(at);
      spark.scale.setScalar(scale);
      const fling = (0.5 + 0.8 * s) * scale;
      const velocity = away.clone().multiplyScalar(-(1 + Math.random() * 2.2) * fling)
        .add(new THREE.Vector3((Math.random() - 0.5) * 4.5 * fling, Math.random() * 3 * fling, (Math.random() - 0.5) * 4.5 * fling));
      spark.lookAt(at.clone().add(velocity));
      this.#addTransient(spark, { velocity, life: 0.12 + Math.random() * (0.1 + 0.12 * s), shrink: true, gravity: 8 * scale, drag: 2.4 });
    }
    if (ring && s > 0.35) this.#groundRing(at, 0xd9e6f2, 0.3 + 0.35 * s, true);
  }

  /**
   * A blow on my own hardened plate, seen from inside the helm: sparks thrown up across the bottom of the view on the
   * side it came from. `from`: the way to whoever struck (world, across the ground).
   */
  steelSparksInView(from, strength = 1) {
    const eye = this.camera.getWorldPosition(new THREE.Vector3());
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const side = new THREE.Vector3(from?.x ?? forward.x, 0, from?.z ?? forward.z);
    if (side.lengthSq() < 1e-6) side.copy(forward);
    side.normalize();
    const at = eye.clone().addScaledVector(forward, 0.5).addScaledVector(side, 0.18).add(new THREE.Vector3(0, -0.3, 0));
    this.steelGlint(at, { x: -side.x, z: -side.z }, { strength, ring: false, scale: 0.3 });
  }

  // a flat ring of light expanding from a point (at the feet unless upright)
  #groundRing(at, color, scale = 1, upright = false) {
    const ring = new THREE.Mesh(this.impactRingGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.set(at.x, upright ? at.y : at.y - 1.15, at.z);
    ring.rotation.x = upright ? 0 : Math.PI / 2;
    if (upright) ring.lookAt(this.camera.getWorldPosition(new THREE.Vector3()));
    ring.scale.setScalar(scale);
    this.#addTransient(ring, { life: 0.32, expand: 7, fade: true });
    ring.material.dispose();
  }

  /** A damage number that pops and rises off the body. */
  damageNumber(point, amount, { heavy = false } = {}) {
    const value = Math.round(amount);
    if (!(value > 0)) return;
    const material = new THREE.SpriteMaterial({ map: this.#numberTexture(value, heavy), transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(point.x + (Math.random() - 0.5) * 0.3, point.y + 0.35, point.z + (Math.random() - 0.5) * 0.3);
    sprite.scale.set(heavy ? 0.86 : 0.66, heavy ? 0.43 : 0.33, 1);
    sprite.renderOrder = 10;
    this.#addTransient(sprite, { velocity: new THREE.Vector3(0, 0.9, 0), life: 0.75, drag: 1.2, fade: true, expand: 0.25 });
    material.dispose();
  }

  #numberTexture(value, heavy) {
    const key = `${value}:${heavy}`;
    this.numberTextures ??= new Map();
    if (this.numberTextures.has(key)) return this.numberTextures.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    g.font = `${heavy ? 52 : 44}px "IM Fell English SC", Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(40, 14, 8, 0.9)';
    g.strokeText(String(value), 64, 34);
    g.fillStyle = heavy ? '#ffe39a' : '#f6e2b4';
    g.fillText(String(value), 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.numberTextures.set(key, texture);
    return texture;
  }

  sparks(point, color = 0xffbd6b, count = 10) {
    const material = this.#basicMaterial(color);
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(this.sparkGeometry, material);
      mesh.position.set(point.x, point.y, point.z);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.#addTransient(mesh, {
        velocity: dir.multiplyScalar(3 + Math.random() * 3),
        life: 0.24 + Math.random() * 0.18,
        shrink: true,
        gravity: 8,
        spin: new THREE.Vector3(5, 7, 4),
      });
    }
  }

  #ember(point, projectileVelocity = null, size = 1) {
    const material = this.emberMaterials[Math.random() < 0.55 ? 0 : 1];
    const mesh = new THREE.Mesh(this.emberGeometry, material);
    mesh.scale.setScalar(size);
    mesh.position.set(
      point.x + (Math.random() - 0.5) * 0.07,
      point.y + (Math.random() - 0.5) * 0.07,
      point.z + (Math.random() - 0.5) * 0.07,
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.65, Math.random() * 0.45, (Math.random() - 0.5) * 0.65);
    if (projectileVelocity) {
      const backwards = new THREE.Vector3(-projectileVelocity.x, -projectileVelocity.y, -projectileVelocity.z);
      if (backwards.lengthSq() > 1e-6) velocity.add(backwards.normalize().multiplyScalar(0.55 + Math.random() * 0.35));
    }

    this.#addTransient(mesh, {
      velocity,
      life: 0.18 + Math.random() * 0.15,
      shrink: true,
      gravity: 1.8,
      spin: new THREE.Vector3(3, 4, 5),
    });
  }

  /**
   * A spell breaking. Fire: a swelling fireball out toward its reach, a shock ring along the ground, smoke, embers and
   * a flash of light. Frost: a burst of ice shards, a frost ring and cold mist.
   */
  /**
   * A spell breaking at `point` with its reach `radius`. ground: the height of the ground under it, if known; the
   * blast's wave runs along the ground (and leaves a mark there) only when the ground is within its reach.
   */
  impact(point, { spell = 'fireball', radius = 2.6, ground = null } = {}) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    const profile = elementalProfile(spell);
    const materials = this.#spellMaterials(spell);
    const look = lookFor(spell);
    const presentation = impactWorldPresentation(this.camera.getWorldPosition(new THREE.Vector3()).distanceTo(at));
    if (presentation.cameraFlash && profile.size >= 0.85) this.#cameraFlash(look.flash, 0.08, 0.65);
    this.#flashLight(point, look.light, (profile.frost ? 12 : 27) * profile.size * profile.strength, 0.22, radius * 2.8);
    const growth = (from, to, life) => (to / from - 1) / life;

    // A sparse thin pressure front measures the actual burst reach. Dense heat remains in its heart.
    if (presentation.showWorldBurst) {
      const front = new THREE.Mesh(this.blastFrontGeometry, createBlastFrontMaterial(spell));
      front.position.copy(at);
      front.scale.setScalar(radius * 0.12);
      this.#addTransient(front, {
        life: profile.blastLife, expand: growth(radius * 0.12, radius, profile.blastLife), own: true,
        tick: (age) => { front.material.uniforms.uFade.value = Math.sin(Math.PI * Math.min(1, age / profile.blastLife)); },
      });
      const flash = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(profile.core));
      flash.position.copy(at);
      flash.scale.setScalar(profile.size * presentation.worldScale);
      this.#addTransient(flash, { life: 0.07, expand: 3, shrink: true });
    }
    const heart = new THREE.Mesh(this.blastGeometry, materials.heart);
    heart.position.copy(at);
    heart.scale.setScalar(radius * 0.14);
    this.#addTransient(heart, { life: 0.1, expand: 5, fade: true });

    if (!profile.frost) {
      for (let i = 0; i < Math.round(4 * profile.size); i += 1) {
        const angle = i * 2.4 + Math.random();
        const reach = radius * 0.1;
        const lobe = new THREE.Mesh(this.flameGeometry, i % 2 ? materials.shell : materials.blast);
        lobe.position.copy(at).add(new THREE.Vector3(Math.cos(angle) * reach, Math.random() * reach, Math.sin(angle) * reach));
        const compact = radius * profile.denseReach / 0.26;
        lobe.scale.set(compact * 0.8, compact * (1.3 + Math.random() * 0.4), compact * 0.8);
        this.#addTransient(lobe, { life: profile.blastLife * (0.7 + Math.random() * 0.3), expand: 3, shrink: true, fade: true, velocity: new THREE.Vector3(Math.cos(angle), 1.1, Math.sin(angle)), spin: new THREE.Vector3(1.5, 3, 2) });
      }
    }

    // Ground pressure clears quickly and never becomes a solid painted danger disc.
    const drop = Number.isFinite(ground) ? point.y - ground : Infinity;
    if (presentation.showRings && drop >= -0.2 && drop < radius) {
      const groundReach = Math.sqrt(Math.max(0, radius * radius - Math.max(0, drop) ** 2));
      const wave = new THREE.Mesh(this.groundRingGeometry, materials.ring);
      wave.position.set(point.x, ground + 0.025, point.z);
      wave.rotation.x = -Math.PI / 2;
      wave.scale.setScalar(Math.max(0.05, groundReach * 0.12));
      this.#addTransient(wave, { life: 0.21, expand: growth(Math.max(0.05, groundReach * 0.12), Math.max(0.05, groundReach), 0.21), fade: true });
      wave.material.opacity = wave.userData.baseOpacity = 0.09 * profile.size;
      const mark = new THREE.Mesh(this.scorchGeometry, materials.mark);
      mark.position.set(point.x, ground + 0.018, point.z);
      mark.rotation.x = -Math.PI / 2;
      mark.scale.setScalar(radius * 0.25);
      this.#addTransient(mark, { life: profile.frost ? 0.8 : 1.2, fade: true });
      mark.material.opacity = mark.userData.baseOpacity = profile.frost ? 0.12 : 0.18;
    }

    for (let i = 0; i < profile.smokeCount; i += 1) {
      const mist = new THREE.Sprite(this.#elementalMist(profile.frost ? 'frostfire' : 'fireball'));
      mist.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * radius * 0.35, Math.random() * 0.3, (Math.random() - 0.5) * radius * 0.35));
      mist.scale.setScalar(radius * (profile.frost ? 0.25 : 0.18));
      this.#addTransient(mist, { life: profile.frost ? 0.6 : 0.8, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.4, profile.frost ? 0.1 : 0.7, (Math.random() - 0.5) * 0.4), expand: 1.4, fade: true, drag: 1.3 });
    }
    for (let i = 0; i < profile.fragmentCount; i += 1) {
      const fragment = new THREE.Mesh(profile.frost ? this.shardGeometry : this.emberGeometry, profile.frost ? materials.bits[i % 2] : this.emberMaterials[i % 2]);
      fragment.position.copy(at);
      fragment.scale.setScalar(profile.size * (profile.frost ? 1 : 0.75));
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.75 + 0.1, Math.random() - 0.5).normalize();
      fragment.lookAt(at.clone().add(dir));
      this.#addTransient(fragment, { velocity: dir.multiplyScalar((profile.frost ? 4 : 5) + Math.random() * 3).multiplyScalar(0.65 + 0.35 * profile.strength), life: profile.frost ? 0.5 : 0.38, gravity: 8, shrink: true, drag: 1.2, spin: new THREE.Vector3(4, 6, 5) });
    }
    if (!profile.frost) {
      for (let i = 0; i < Math.round(5 * profile.size); i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const reach = Math.random() * radius * 0.35;
        this.#flame({ x: point.x + Math.cos(angle) * reach, y: point.y + Math.random() * 0.25, z: point.z + Math.sin(angle) * reach }, profile.size);
      }
    }
  }

  /**
   * A Vortex's fire leaving the spin (at `point`, going `velocity`): a quick flare where it left and a few sparks
   * thrown on ahead, bigger for the fire's own than for an ember.
   */
  fireLaunch(point, velocity, size = 0.5) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    const flare = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(0xffd28a));
    flare.position.copy(at);
    flare.scale.setScalar(0.25 + 0.5 * size);
    this.#addTransient(flare, { life: 0.07 + 0.05 * size, expand: 5, shrink: true, spin: new THREE.Vector3(4, 6, 3) });
    this.#flashLight(point, 0xff8a3c, 4 + 12 * size, 0.14, 4);
    const way = new THREE.Vector3(velocity?.x ?? 0, velocity?.y ?? 0, velocity?.z ?? 0);
    if (way.lengthSq() > 1e-6) way.normalize();
    for (let i = 0; i < Math.round(2 + 6 * size); i += 1) {
      const spark = new THREE.Mesh(this.sparkGeometry, this.#basicMaterial(i % 2 ? 0xffb347 : 0xff7a2a));
      spark.position.copy(at);
      const fling = way.clone().multiplyScalar(3 + Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
      this.#addTransient(spark, { velocity: fling, life: 0.16 + Math.random() * 0.14, shrink: true, gravity: 6, spin: new THREE.Vector3(5, 7, 4) });
    }
  }

  /**
   * A Blazing Vortex taking hold, about the knight at `point`: one short punch of light, a ring of sparks thrown
   * outward and a breath of glow that is gone in a moment (never a cloud: whoever stands near is still plain to see).
   * mine: my own (the view flashes with it).
   */
  vortexIgnite(point, { mine = false } = {}) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    this.#flashLight(point, 0xff9a44, 36, 0.3, 9);
    if (mine) this.#cameraFlash(0xffb768, 0.12, 1.1);
    const glow = new THREE.Mesh(this.blastGeometry, this.#spellMaterials('fireball').blast);
    glow.position.copy(at);
    glow.scale.setScalar(0.5);
    this.#addTransient(glow, { life: 0.18, expand: 16, fade: true });
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const spark = new THREE.Mesh(this.hotSparkGeometry, this.#basicMaterial(i % 3 ? 0xffb347 : 0xfff0c4));
      spark.position.copy(at);
      const velocity = new THREE.Vector3(Math.cos(angle) * (5 + Math.random() * 3), 0.6 + Math.random() * 2.2, Math.sin(angle) * (5 + Math.random() * 3));
      spark.lookAt(at.clone().add(velocity));
      this.#addTransient(spark, { velocity, life: 0.24 + Math.random() * 0.18, shrink: true, gravity: 7, drag: 2 });
    }
  }

  #createProjectile(spell = 'fireball') {
    const profile = elementalProfile(spell);
    const group = createElementalOrb(spell);
    const light = everywhere(new THREE.PointLight(lookFor(spell).light, 7.5 * profile.size ** 2, 5 * profile.size, 2));
    group.add(light);
    group.scale.setScalar(profile.size);
    this.scene.add(group);
    return { spell, group, light, profile, phase: Math.random() * Math.PI * 2, lastPosition: null, trailCarry: 0 };
  }

  #elementalTrail(point, velocity, profile) {
    if (profile.frost) {
      this.#frostMote(point, new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.08, (Math.random() - 0.5) * 0.25), profile.trailLife);
      const mist = new THREE.Sprite(this.#elementalMist('frostfire'));
      mist.position.set(point.x, point.y, point.z);
      mist.scale.set(0.16, 0.25, 1);
      this.#addTransient(mist, { life: profile.trailLife, expand: 2.5, fade: true });
      return;
    }
    const flame = new THREE.Mesh(this.flameGeometry, this.#spellMaterials('fireball').shell);
    const way = new THREE.Vector3(velocity?.x ?? 0, velocity?.y ?? 0, velocity?.z ?? 0);
    if (way.lengthSq() > 1e-8) way.normalize();
    flame.position.set(point.x + (Math.random() - 0.5) * 0.08 * profile.size, point.y + (Math.random() - 0.5) * 0.08 * profile.size, point.z);
    flame.lookAt(flame.position.clone().add(way));
    flame.scale.set(0.55 * profile.size, 0.55 * profile.size, (1.2 + Math.random() * 0.6) * profile.size);
    this.#addTransient(flame, { life: profile.trailLife, shrink: true, fade: true, velocity: way.multiplyScalar(-0.6), spin: new THREE.Vector3(1.5, 2, 3) });
    this.#ember(point, velocity, profile.size);
  }

  // a mote of frost shed along a bolt's path or off a chilled body: small, pale, drifting
  #frostMote(point, velocity = new THREE.Vector3(), life = 0.35) {
    const materials = this.#spellMaterials('frostfire');
    const mesh = new THREE.Mesh(this.moteGeometry, materials.bits[Math.random() < 0.5 ? 0 : 1]);
    mesh.position.set(point.x + (Math.random() - 0.5) * 0.08, point.y + (Math.random() - 0.5) * 0.08, point.z + (Math.random() - 0.5) * 0.08);
    this.#addTransient(mesh, { velocity, life: life + Math.random() * 0.15, shrink: true, gravity: 0.6, spin: new THREE.Vector3(2, 3, 2) });
  }

  // a lick of flame rising off a burning body
  #flame(point, size = 1) {
    const mesh = new THREE.Mesh(this.flameGeometry, this.emberMaterials[Math.random() < 0.6 ? 0 : 1]);
    mesh.scale.setScalar(size);
    mesh.position.set(point.x, point.y, point.z);
    this.#addTransient(mesh, {
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 0.9, (Math.random() - 0.5) * 0.3),
      life: 0.3 + Math.random() * 0.25,
      shrink: true,
      spin: new THREE.Vector3(3, 5, 2),
    });
  }

  /**
   * What an affliction looks like on a body, called every frame: flames licking up while it burns, frost drifting off
   * it while it is chilled (chill 0..1, fading as it thaws).
   */
  afflict(id, position, { burning = false, chill = 0 } = {}, dt = 0.016) {
    const cold = chillPresentation(chill);
    let body = this.chilledBodies.get(id);
    if (!position || cold.opacity <= 0.002) {
      if (body) { body.group.removeFromParent(); body.material.dispose(); this.chilledBodies.delete(id); }
      body = null;
    } else {
      if (!body) {
        const group = new THREE.Group();
        const material = new THREE.MeshBasicMaterial({ color: 0xe3faff, transparent: true, opacity: cold.opacity, depthWrite: false });
        // Frost adheres as discontinuous pale crystals, unlike Steel's continuous cyan armour.
        for (let i = 0; i < 8; i += 1) {
          const shard = new THREE.Mesh(this.shardGeometry, material);
          const angle = i * 2.4;
          shard.position.set(Math.cos(angle) * 0.27, 0.5 + i % 4 * 0.3, Math.sin(angle) * 0.27);
          shard.rotation.set(angle * 0.3, angle, angle * 0.6);
          shard.scale.set(1.7, 1.7, 1.25);
          group.add(shard);
        }
        this.scene.add(group);
        body = { group, material };
        this.chilledBodies.set(id, body);
      }
      body.group.position.set(position.x, position.y, position.z);
      body.material.opacity = cold.opacity;
      body.group.scale.set(cold.scale, 1, cold.scale);
    }
    if (!position || (!burning && cold.opacity <= 0.002)) {
      this.afflictionCarry.delete(id);
      return;
    }
    const carry = this.afflictionCarry.get(id) ?? { flames: 0, frost: 0, mist: 0 };
    const elapsed = Math.max(0, Math.min(0.1, dt));
    const around = () => ({ x: position.x + (Math.random() - 0.5) * 0.5, y: position.y + 0.35 + Math.random() * 1.3, z: position.z + (Math.random() - 0.5) * 0.5 });
    if (burning) {
      carry.flames += elapsed * 28;
      while (carry.flames >= 1) { carry.flames -= 1; this.#flame(around()); }
    }
    if (cold.opacity > 0.002) {
      carry.frost += elapsed * cold.dustRate;
      while (carry.frost >= 1) {
        carry.frost -= 1;
        this.#frostMote(around(), new THREE.Vector3((Math.random() - 0.5) * 0.2, -0.3 - Math.random() * 0.3, (Math.random() - 0.5) * 0.2), 0.4);
      }
      carry.mist += elapsed * cold.mistRate;
      if (carry.mist >= 1) {
        carry.mist -= 1;
        const mist = new THREE.Sprite(this.#elementalMist('frostfire'));
        mist.position.set(position.x, position.y + 0.35, position.z);
        mist.scale.setScalar(0.42 * cold.scale);
        this.#addTransient(mist, { life: 0.45, fade: true, expand: 0.8, velocity: new THREE.Vector3(0, -0.08, 0) });
        mist.material.opacity = mist.userData.baseOpacity = cold.opacity * 0.6;
      }
    }
    this.afflictionCarry.set(id, carry);
  }

  syncProjectiles(projectiles) {
    const seen = new Set();
    for (const p of projectiles) {
      seen.add(p.id);
      let effect = this.projectiles.get(p.id);
      if (!effect) {
        effect = this.#createProjectile(p.spell);
        this.projectiles.set(p.id, effect);
      }

      const next = { x: p.position.x, y: p.position.y, z: p.position.z };
      if (effect.lastPosition) {
        const trail = sampleTrailSegment(effect.lastPosition, next, {
          spacing: effect.profile.trailSpacing,
          carry: effect.trailCarry,
          maxSamples: effect.profile.maxTrailSamples,
        });
        effect.trailCarry = trail.carry;
        for (const point of trail.points) {
          this.#elementalTrail(point, p.velocity, effect.profile);
        }
      }

      effect.group.position.set(next.x, next.y, next.z);
      // a bolt points along its flight
      if (effect.spell === 'frostfire' && p.velocity) effect.group.lookAt(next.x + p.velocity.x, next.y + p.velocity.y, next.z + p.velocity.z);
      effect.lastPosition = next;
    }

    for (const [id, effect] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(effect.group);
        effect.group.userData.dispose();
        this.projectiles.delete(id);
      }
    }
  }

  update(dt) {
    const nowSec = performance.now() / 1000;
    for (let i = this.gustBodies.length - 1; i >= 0; i -= 1) {
      if (nowSec < this.gustBodies[i].until) continue;
      this.gustBodies[i].gust.removeFromParent();
      this.gustBodies.splice(i, 1);
    }
    for (let i = this.flashLights.length - 1; i >= 0; i -= 1) {
      const flash = this.flashLights[i];
      flash.age += dt;
      const t = flash.age / flash.life;
      if (t >= 1) {
        this.scene.remove(flash.light);
        this.flashLights.splice(i, 1);
        continue;
      }
      flash.light.intensity = flash.intensity * (1 - t) * (1 - t);
    }
    for (const gather of this.gathers) this.#updateGather(gather, dt);
    for (const effect of this.projectiles.values()) {
      effect.phase += dt;
      effect.group.userData.update(effect.phase);
      effect.light.intensity = (effect.profile.frost ? 4.8 : 6.8 + Math.sin(effect.phase * 12) * 1.2) * effect.profile.size ** 2;
    }

    for (let i = this.transients.length - 1; i >= 0; i -= 1) {
      const transient = this.transients[i];
      transient.life -= dt;
      transient.age += dt;
      transient.mesh.position.addScaledVector(transient.velocity, dt);
      transient.velocity.y -= transient.gravity * dt;
      if (transient.drag) transient.velocity.multiplyScalar(Math.exp(-transient.drag * dt));
      if (transient.fade) transient.mesh.material.opacity = transient.mesh.userData.baseOpacity * Math.max(0, transient.life / transient.maxLife);
      transient.tick?.(transient.age);

      const scale = transientScale(transient.age, transient.maxLife, transient.expand, transient.shrink);
      transient.mesh.scale.copy(transient.baseScale).multiplyScalar(scale);

      if (transient.spin) {
        transient.mesh.rotation.x += transient.spin.x * dt;
        transient.mesh.rotation.y += transient.spin.y * dt;
        transient.mesh.rotation.z += transient.spin.z * dt;
      }

      if (transient.life <= 0) {
        this.#removeTransient(transient);
        this.transients.splice(i, 1);
      }
    }
  }
}
