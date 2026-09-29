import * as THREE from 'three';
import { impactWorldPresentation, sampleTrailSegment, transientScale } from './effectTrail.mjs';
import { puffTexture, windRingTexture, windStreakTexture } from './softTextures.mjs';

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
    this.projectileCoreGeometry = new THREE.OctahedronGeometry(0.15, 1);
    this.projectileShellGeometry = new THREE.IcosahedronGeometry(0.25, 1);
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
    // a ring of pushed air (unit radius: a soft bright band, clear in the middle), a puff of dust (tinted by what the
    // ground is made of) and a blade of grass torn loose
    this.windRingGeometry = new THREE.PlaneGeometry(2, 2);
    this.windRingMaterial = new THREE.MeshBasicMaterial({
      map: windRingTexture(), color: 0xeef3ec, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
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
    this.scorchGeometry = new THREE.CircleGeometry(1, 24);
    this.puffGeometry = new THREE.IcosahedronGeometry(0.35, 0);
    this.shardGeometry = new THREE.BoxGeometry(0.04, 0.04, 0.2);
    this.moteGeometry = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    this.flameGeometry = new THREE.OctahedronGeometry(0.1, 0);
    this.spellMaterials = new Map();
    this.flashLights = [];
    this.afflictionCarry = new Map();
    this.projectileCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe0a3,
      emissive: 0xff641c,
      emissiveIntensity: 5.2,
      roughness: 0.18,
      metalness: 0.05,
    });
    this.projectileShellMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7a2a,
      transparent: true,
      opacity: 0.31,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
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

  // a brief burst of light where a spell breaks
  #flashLight(point, color, intensity, life, distance) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
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
      baseScale: mesh.scale.clone(),
    });
    while (this.transients.length > MAX_TRANSIENTS) this.#removeTransient(this.transients.shift());
    return mesh;
  }

  #removeTransient(transient) {
    if (!transient) return;
    transient.parent?.remove(transient.mesh);
    // fading transients own their material (cloned); textures such as damage numbers are cached and shared
    if (transient.fade) transient.mesh.material.dispose();
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
   * Gale Garner lets go: soft rings of pushed air racing out and widening from the hand, streaks of wind running out
   * through the cone (a tunnel of them round its heart, seen from the hand), and dust (and on grass, torn blades)
   * blown along the ground wherever the gust runs low over it. origin/direction: where it leaves and which way (unit);
   * cone: its reach and angles (shared/src/spells.mjs), so what is seen matches where it pushes. ground: { groundAt(x,
   * z, y) → the floor's height there or null, surfaceAt(x, z, y) → 'stone' | 'grass' | 'earth' }; without it, no dust.
   */
  galeBlast(origin, direction, cone, { groundAt = null, surfaceAt = null } = {}) {
    const from = new THREE.Vector3(origin.x, origin.y, origin.z);
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const lift = new THREE.Vector3().crossVectors(side, dir).normalize();
    const heart = (cone.halfAngleDeg * Math.PI) / 180;
    const spread = (cone.pressureHalfAngleDeg * Math.PI) / 180;
    // a direction `angle` off the gust's line, `around` it
    const off = (angle, around) => dir.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(side, Math.sin(angle) * Math.cos(around))
      .addScaledVector(lift, Math.sin(angle) * Math.sin(around)).normalize();

    // the pressure: rings of pushed air leaving the hand as wide as its heart and flying off down it, widening as
    // they go but less than they travel (so, from the hand, each is seen shrinking away)
    for (let i = 0; i < 2; i += 1) {
      const start = 0.6 + i * 0.25;
      const speed = 11 - i * 2.5;
      const drag = 1.4;
      const life = 0.36 + i * 0.08;
      const radius = Math.tan(heart) * start;
      const reached = start + (speed * (1 - Math.exp(-drag * life))) / drag;
      const ring = new THREE.Mesh(this.windRingGeometry, this.windRingMaterial);
      ring.position.copy(from).addScaledVector(dir, start);
      ring.lookAt(ring.position.clone().add(dir));
      ring.rotateZ(Math.random() * Math.PI * 2);
      ring.scale.setScalar(radius);
      this.#addTransient(ring, {
        velocity: dir.clone().multiplyScalar(speed),
        life,
        drag,
        fade: true,
        expand: ((0.6 * Math.tan(heart) * reached) / radius - 1) / life,
      });
      if (i === 1) ring.material.opacity = ring.userData.baseOpacity = 0.2;
    }
    // the streaks: most sweep out low and to either side (from the hand, wind rushing past on the left and right and
    // skimming the ground, not a burst of sparks), a few down its heart further out; fast and stretched, spent
    // toward the edge of the pressure
    for (let i = 0; i < 24; i += 1) {
      const outer = i < 18;
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
      streak.material.opacity = streak.userData.baseOpacity = outer ? 0.34 : 0.22;
    }
    // what it blows off the ground: only where the pressure reaches down to it
    const along = new THREE.Vector3(dir.x, 0, dir.z);
    if (!groundAt || along.lengthSq() < 1e-4) return;
    along.normalize();
    const across = new THREE.Vector3(-along.z, 0, along.x);
    for (let i = 0; i < 14; i += 1) {
      const d = 1 + Math.random() * cone.reach;
      const wide = Math.tan(spread) * d * 0.7;
      const x = from.x + dir.x * d + across.x * (Math.random() - 0.5) * 2 * wide;
      const z = from.z + dir.z * d + across.z * (Math.random() - 0.5) * 2 * wide;
      const floor = groundAt(x, z, from.y);
      const low = from.y + dir.y * d - (floor ?? -Infinity);
      if (floor === null || low > Math.tan(spread) * d + 0.5 || low < -0.5) continue;
      const surface = surfaceAt?.(x, z, floor) ?? 'earth';
      const strength = 1 - d / (cone.reach + 1);
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
  }

  /**
   * Compile the shaders of effects first seen mid-fight (a gust's rings, streaks, dust and grass), where the browser
   * allows off the frame, so the first of them does not stall one. `scene`: where they will be drawn (its fog).
   */
  warm(renderer, scene = this.scene) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.windRingGeometry, this.windRingMaterial));
    group.add(new THREE.Mesh(this.windStreakGeometry, this.windMaterial));
    group.add(new THREE.Sprite(this.dustMaterials.get('earth')));
    group.add(new THREE.Mesh(this.grassGeometry, this.grassMaterials[0]));
    return (renderer.compileAsync?.(group, this.camera, scene) ?? Promise.resolve(renderer.compile(group, this.camera, scene))).catch(() => {});
  }

  /** A Gale gathering in someone's hand: wisps of air drawn in to it, turning as they come. */
  galeGather(point) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const start = at.clone().add(new THREE.Vector3(Math.cos(angle) * 0.7, (Math.random() - 0.3) * 0.5, Math.sin(angle) * 0.7));
      const wisp = new THREE.Mesh(this.windStreakGeometry, this.windMaterial);
      wisp.position.copy(start);
      // drawn in, and round (a little swirl)
      const inward = at.clone().sub(start).normalize();
      const swirl = new THREE.Vector3(-inward.z, 0, inward.x);
      const velocity = inward.multiplyScalar(1.3).addScaledVector(swirl, 0.8);
      wisp.lookAt(start.clone().add(velocity));
      wisp.scale.set(1, 1, 0.35);
      this.#addTransient(wisp, { velocity, life: 0.45, fade: true });
    }
  }

  /** A spell turned aside by hardened plate: a cool glint on the armour and a few pale sparks skating off it. */
  steelGlint(point, dir) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    const away = new THREE.Vector3(dir?.x ?? 0, 0, dir?.z ?? 0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    away.normalize();
    const flash = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(0xeef5ff));
    flash.position.copy(at);
    flash.scale.setScalar(0.55);
    this.#addTransient(flash, { life: 0.12, expand: 4, shrink: true, spin: new THREE.Vector3(3, 7, 4) });
    for (let i = 0; i < 12; i += 1) {
      const spark = new THREE.Mesh(this.sparkGeometry, this.#basicMaterial(i % 2 ? 0xdfe9f4 : 0xffffff));
      spark.position.copy(at);
      const velocity = away.clone().multiplyScalar(-(1 + Math.random() * 2.2))
        .add(new THREE.Vector3((Math.random() - 0.5) * 4.5, Math.random() * 3, (Math.random() - 0.5) * 4.5));
      spark.lookAt(at.clone().add(velocity));
      this.#addTransient(spark, { velocity, life: 0.18 + Math.random() * 0.16, shrink: true, gravity: 8, drag: 2.4 });
    }
    this.#groundRing(at, 0xd9e6f2, 0.6, true);
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

  #ember(point, projectileVelocity = null) {
    const material = this.emberMaterials[Math.random() < 0.55 ? 0 : 1];
    const mesh = new THREE.Mesh(this.emberGeometry, material);
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
    const worldPoint = new THREE.Vector3(point.x, point.y, point.z);
    const cameraPosition = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPosition);
    const presentation = impactWorldPresentation(cameraPosition.distanceTo(worldPoint));
    const look = lookFor(spell);
    const materials = this.#spellMaterials(spell);
    const frost = spell === 'frostfire';

    if (presentation.cameraFlash) this.#cameraFlash(look.flash, 0.1, 0.78);
    this.#flashLight(point, look.light, frost ? 14 : 32, frost ? 0.22 : 0.32, radius * 3.2);
    // a transient grows as base * (1 + expand * age): the rate that takes it from its start to `to` over its life
    const growth = (from, to, life) => (to / from - 1) / life;
    const blastLife = frost ? 0.2 : 0.28;

    if (frost) {
      // cold breaks clean: one crisp swelling burst (the blast geometry has a 0.5 m radius)
      const blast = new THREE.Mesh(this.blastGeometry, materials.blast);
      blast.position.copy(worldPoint);
      blast.scale.setScalar(0.3);
      this.#addTransient(blast, { life: blastLife, expand: growth(0.3, (radius * 0.9) / 0.5, blastLife), fade: true });
    } else {
      // fire does not make a dome: a few lobes of it billow out at their own rates and roll upward as they burn
      for (let i = 0; i < 5; i += 1) {
        // the heart of it glows; around it, billows of solid flame, the last of them already darkening
        const lobe = new THREE.Mesh(this.blastGeometry, i < 2 ? materials.blast : i < 4 ? materials.billow : materials.ember);
        const off = i === 0 ? [0, 0, 0] : [(Math.random() - 0.5) * radius * 0.34, Math.random() * radius * 0.2, (Math.random() - 0.5) * radius * 0.34];
        lobe.position.set(point.x + off[0], point.y + off[1], point.z + off[2]);
        lobe.scale.setScalar(0.24);
        lobe.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        const life = blastLife * (0.8 + Math.random() * 0.5);
        const size = radius * (i === 0 ? 0.6 : 0.32 + Math.random() * 0.18);
        this.#addTransient(lobe, {
          life,
          expand: growth(0.24, size / 0.5, life),
          fade: true,
          velocity: new THREE.Vector3(off[0] * 1.4, 0.9 + Math.random() * 1.5, off[2] * 1.4),
          drag: 2.5,
        });
      }
    }
    // and a white-hot heart inside it, quicker and smaller
    const heart = new THREE.Mesh(this.blastGeometry, materials.heart);
    heart.position.copy(worldPoint);
    heart.scale.setScalar(0.25);
    this.#addTransient(heart, { life: blastLife * 0.5, expand: growth(0.25, (radius * 0.45) / 0.5, blastLife * 0.5), fade: true });

    // along the ground, if it is within reach: a faint pressure wave running out, and a mark left behind
    const drop = Number.isFinite(ground) ? point.y - ground : Infinity;
    if (drop >= -0.2 && drop < radius * 0.8) {
      const onGround = ground + 0.03;
      const wave = new THREE.Mesh(this.groundRingGeometry, materials.ring);
      wave.position.set(point.x, onGround, point.z);
      wave.rotation.x = -Math.PI / 2;
      wave.scale.setScalar(0.25);
      // the ring's outer edge is 1 m: it runs out to the reach, weaker the higher up the blast was
      this.#addTransient(wave, { life: 0.26, expand: growth(0.25, radius * (1 - (0.4 * drop) / radius), 0.26), fade: true });
      const mark = new THREE.Mesh(this.scorchGeometry, materials.mark);
      mark.position.set(point.x, ground + 0.02, point.z);
      mark.rotation.x = -Math.PI / 2;
      mark.scale.setScalar(radius * (frost ? 0.42 : 0.34) * (1 - (0.5 * drop) / radius));
      this.#addTransient(mark, { life: frost ? 1.1 : 1.6, fade: true });
    }

    // smoke rolling up in a column (fire) or cold mist hanging (frost)
    for (let i = 0; i < (frost ? 4 : 8); i += 1) {
      const puff = new THREE.Mesh(this.puffGeometry, materials.cloud);
      puff.position.set(point.x + (Math.random() - 0.5) * radius * 0.45, point.y + Math.random() * 0.4, point.z + (Math.random() - 0.5) * radius * 0.45);
      puff.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.#addTransient(puff, {
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, frost ? 0.15 : 1.2 + Math.random() * 1.0, (Math.random() - 0.5) * 0.6),
        life: 0.8 + Math.random() * 0.5,
        expand: 2.4,
        fade: true,
        drag: 1.4,
      });
    }

    if (frost) {
      // ice shards flung out, tumbling
      for (let i = 0; i < 18; i += 1) {
        const shard = new THREE.Mesh(this.shardGeometry, materials.bits[i % 2]);
        shard.position.copy(worldPoint);
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.7 + 0.1, Math.random() - 0.5).normalize();
        shard.lookAt(worldPoint.clone().add(dir));
        this.#addTransient(shard, { velocity: dir.multiplyScalar(4 + Math.random() * 4), life: 0.45 + Math.random() * 0.25, shrink: true, gravity: 9, spin: new THREE.Vector3(6, 8, 4) });
      }
      this.sparks(point, 0xcff4ff, 8);
      return;
    }

    if (presentation.showWorldBurst) {
      // the instant of it: a hard flash
      const flash = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(0xffd18a));
      flash.position.copy(worldPoint);
      flash.scale.setScalar(presentation.worldScale);
      this.#addTransient(flash, { life: 0.1, expand: 6, shrink: true });
    }

    // flames licking up out of it
    for (let i = 0; i < 12; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.random() * radius * 0.6;
      this.#flame({ x: point.x + Math.cos(angle) * reach, y: point.y + Math.random() * 0.4, z: point.z + Math.sin(angle) * reach });
    }
    // burning fragments spat out hard and fast, falling as they die (sparks, not confetti)
    for (let i = 0; i < 16; i += 1) {
      const mesh = new THREE.Mesh(this.emberGeometry, this.emberMaterials[i % 2]);
      mesh.position.copy(worldPoint);
      mesh.scale.setScalar(0.75);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.15, Math.random() - 0.5).normalize();
      this.#addTransient(mesh, { velocity: dir.multiplyScalar(5 + Math.random() * 5), life: 0.28 + Math.random() * 0.3, shrink: true, gravity: 9, spin: new THREE.Vector3(4, 6, 5), drag: 1.2 });
    }
    this.sparks(point, 0xff8a3c, 14);
  }

  #createProjectile(spell = 'fireball') {
    const look = lookFor(spell);
    const materials = this.#spellMaterials(spell);
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.projectileCoreGeometry, materials.core);
    const shell = new THREE.Mesh(this.projectileShellGeometry, materials.shell);
    shell.rotation.set(0.4, 0.2, 0.1);
    // frost flies as a lean bolt along its path; fire as a rolling ball
    if (spell === 'frostfire') {
      core.scale.set(0.7, 0.7, 2.1);
      shell.scale.set(0.55, 0.55, 1.6);
    }
    group.add(core, shell);

    const light = new THREE.PointLight(look.light, 7.5, 5, 2);
    group.add(light);
    this.scene.add(group);

    return {
      spell,
      group,
      core,
      shell,
      light,
      phase: Math.random() * Math.PI * 2,
      lastPosition: null,
      trailCarry: 0,
    };
  }

  // a mote of frost shed along a bolt's path or off a chilled body: small, pale, drifting
  #frostMote(point, velocity = new THREE.Vector3(), life = 0.35) {
    const materials = this.#spellMaterials('frostfire');
    const mesh = new THREE.Mesh(this.moteGeometry, materials.bits[Math.random() < 0.5 ? 0 : 1]);
    mesh.position.set(point.x + (Math.random() - 0.5) * 0.08, point.y + (Math.random() - 0.5) * 0.08, point.z + (Math.random() - 0.5) * 0.08);
    this.#addTransient(mesh, { velocity, life: life + Math.random() * 0.15, shrink: true, gravity: 0.6, spin: new THREE.Vector3(2, 3, 2) });
  }

  // a lick of flame rising off a burning body
  #flame(point) {
    const mesh = new THREE.Mesh(this.flameGeometry, this.emberMaterials[Math.random() < 0.6 ? 0 : 1]);
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
    if (!position || (!burning && chill <= 0.01)) {
      this.afflictionCarry.delete(id);
      return;
    }
    const carry = this.afflictionCarry.get(id) ?? { flames: 0, frost: 0 };
    const around = () => ({ x: position.x + (Math.random() - 0.5) * 0.5, y: position.y + 0.35 + Math.random() * 1.3, z: position.z + (Math.random() - 0.5) * 0.5 });
    if (burning) {
      carry.flames += dt * 28;
      while (carry.flames >= 1) { carry.flames -= 1; this.#flame(around()); }
    }
    if (chill > 0.01) {
      carry.frost += dt * 16 * chill;
      while (carry.frost >= 1) {
        carry.frost -= 1;
        this.#frostMote(around(), new THREE.Vector3((Math.random() - 0.5) * 0.2, -0.3 - Math.random() * 0.3, (Math.random() - 0.5) * 0.2), 0.5);
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
          spacing: 0.16,
          carry: effect.trailCarry,
          maxSamples: 5,
        });
        effect.trailCarry = trail.carry;
        for (const point of trail.points) {
          if (effect.spell === 'frostfire') this.#frostMote(point, new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
          else this.#ember(point, p.velocity);
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
        this.projectiles.delete(id);
      }
    }
  }

  update(dt) {
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
    for (const effect of this.projectiles.values()) {
      effect.phase += dt * 8;
      effect.shell.rotation.x += dt * 2.9;
      effect.shell.rotation.y += dt * 4.1;
      effect.shell.rotation.z -= dt * 2.2;
      effect.shell.scale.setScalar(0.92 + Math.sin(effect.phase) * 0.07);
      effect.core.scale.setScalar(0.98 + Math.sin(effect.phase * 1.7) * 0.05);
      effect.light.intensity = 6.8 + Math.sin(effect.phase * 1.4) * 1.2;
    }

    for (let i = this.transients.length - 1; i >= 0; i -= 1) {
      const transient = this.transients[i];
      transient.life -= dt;
      transient.age += dt;
      transient.mesh.position.addScaledVector(transient.velocity, dt);
      transient.velocity.y -= transient.gravity * dt;
      if (transient.drag) transient.velocity.multiplyScalar(Math.exp(-transient.drag * dt));
      if (transient.fade) transient.mesh.material.opacity = transient.mesh.userData.baseOpacity * Math.max(0, transient.life / transient.maxLife);

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
