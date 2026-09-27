import * as THREE from 'three';
import { impactWorldPresentation, sampleTrailSegment, transientScale } from './effectTrail.mjs';

const MAX_TRANSIENTS = 220;

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
    this.impactShellGeometry = new THREE.IcosahedronGeometry(0.38, 1);
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

    this.dashMaterial = new THREE.MeshBasicMaterial({
      color: 0xb9eaff,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.impactRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7a28,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.impactShellMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6725,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
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
  fireball() { this.#cameraFlash(0xff8a2b, 0.08, 0.58); }
  dash() { this.#dashStreaks(); }

  wallClang(point) {
    this.sparks(point, 0xffd48a, 14);
  }

  /**
   * A sword landing on a body: a slash arc along the stroke, a white-hot flash, hot sparks thrown along the blow and
   * a few chips of armour. strike: combo index (2 = the heavy finisher); dir: the blow's direction (attacker to victim).
   */
  hitBurst(point, dir, { strike = 0, heavy = false } = {}) {
    const at = new THREE.Vector3(point.x, point.y, point.z);
    const push = new THREE.Vector3(dir?.x ?? 0, 0, dir?.z ?? 0);
    if (push.lengthSq() < 1e-6) push.set(0, 0, 1);
    push.normalize();
    const big = heavy || strike >= 2;

    // the slash: an arc facing the camera, rolled to match the stroke (right-to-left, left-to-right, overhead)
    const arc = new THREE.Mesh(this.slashGeometry, this.slashMaterial);
    arc.position.copy(at);
    arc.lookAt(this.camera.getWorldPosition(new THREE.Vector3()));
    arc.rotateZ([-0.75, 0.75 + Math.PI, -Math.PI / 2][strike % 3]);
    arc.scale.setScalar(big ? 1.25 : 1);
    this.#addTransient(arc, { life: big ? 0.2 : 0.15, expand: 2.6, fade: true });

    const core = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(0xfff4dc));
    core.position.copy(at);
    core.scale.setScalar(big ? 0.75 : 0.5);
    this.#addTransient(core, { life: 0.09, expand: 3.2, shrink: true, spin: new THREE.Vector3(4, 6, 3) });

    // sparks fly out of the cut to both sides and up (across the view, where they read), a few along the blow
    const side = new THREE.Vector3(-push.z, 0, push.x);
    for (let i = 0; i < (big ? 28 : 18); i += 1) {
      const spark = new THREE.Mesh(this.hotSparkGeometry, this.#basicMaterial(i % 3 ? 0xffcf6a : 0xfff3c4));
      spark.position.copy(at);
      const velocity = side.clone().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3.5))
        .add(push.clone().multiplyScalar(0.5 + Math.random() * 2.5))
        .add(new THREE.Vector3(0, 0.8 + Math.random() * 3.4, 0));
      spark.lookAt(at.clone().add(velocity));
      this.#addTransient(spark, { velocity, life: 0.22 + Math.random() * 0.22, shrink: true, gravity: 9, drag: 2.2 });
    }
    for (let i = 0; i < (big ? 7 : 4); i += 1) {
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

  impact(point) {
    const worldPoint = new THREE.Vector3(point.x, point.y, point.z);
    const cameraPosition = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPosition);
    const presentation = impactWorldPresentation(cameraPosition.distanceTo(worldPoint));

    if (presentation.cameraFlash) this.#cameraFlash(0xff8a2b, 0.1, 0.78);

    if (presentation.showWorldBurst) {
      const flash = new THREE.Mesh(this.impactFlashGeometry, this.#basicMaterial(0xffd18a));
      flash.position.copy(worldPoint);
      flash.scale.setScalar(presentation.worldScale);
      this.#addTransient(flash, { life: 0.13, expand: 5.4, shrink: true });

      const shell = new THREE.Mesh(this.impactShellGeometry, this.impactShellMaterial);
      shell.position.copy(worldPoint);
      shell.scale.setScalar(presentation.worldScale);
      this.#addTransient(shell, { life: 0.22, expand: 4.6, spin: new THREE.Vector3(2.5, 3.5, 1.8) });

      if (presentation.showRings) {
        for (let axis = 0; axis < 2; axis += 1) {
          const ring = new THREE.Mesh(this.impactRingGeometry, this.impactRingMaterial);
          ring.position.copy(worldPoint);
          ring.scale.setScalar(presentation.worldScale);
          ring.rotation.x = axis === 0 ? Math.PI / 2 : 0;
          ring.rotation.y = axis === 1 ? Math.PI / 2 : 0;
          this.#addTransient(ring, { life: 0.2, expand: 6.1 });
        }
      }
    }

    for (let i = 0; i < 18; i += 1) this.#ember(point);
    this.sparks(point, 0xff8a3c, 12);
  }

  #createProjectile() {
    const group = new THREE.Group();
    const core = new THREE.Mesh(this.projectileCoreGeometry, this.projectileCoreMaterial);
    const shell = new THREE.Mesh(this.projectileShellGeometry, this.projectileShellMaterial);
    shell.rotation.set(0.4, 0.2, 0.1);
    group.add(core, shell);

    const light = new THREE.PointLight(0xff6b24, 7.5, 5, 2);
    group.add(light);
    this.scene.add(group);

    return {
      group,
      core,
      shell,
      light,
      phase: Math.random() * Math.PI * 2,
      lastPosition: null,
      trailCarry: 0,
    };
  }

  syncProjectiles(projectiles) {
    const seen = new Set();
    for (const p of projectiles) {
      seen.add(p.id);
      let effect = this.projectiles.get(p.id);
      if (!effect) {
        effect = this.#createProjectile();
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
        for (const point of trail.points) this.#ember(point, p.velocity);
      }

      effect.group.position.set(next.x, next.y, next.z);
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
