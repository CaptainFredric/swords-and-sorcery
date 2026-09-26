import * as THREE from 'three';
import { createSpellbladeRig } from '../game/SpellbladeFallback.mjs';
import { createSpellbladeAsset, reportSpellbladeAssetStatus } from '../game/SpellbladeAssets.mjs';

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) for (const material of object.material) material?.dispose?.();
    else object.material?.dispose?.();
  });
}

export class MenuScene {
  constructor(container) {
    this.container = container;
    this.visible = true;
    this.dragging = false;
    this.dragStart = { x: 0, y: 0, yaw: 0, pitch: 0 };
    this.targetYaw = Math.PI - 0.22;
    this.targetPitch = 0;
    this.frameHandle = null;
    this.disposed = false;
    this.assetGeneration = 0;
    this.assetInstance = null;
    this.visualKind = 'fallback';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(33, 1, 0.1, 40);
    this.camera.position.set(0, 0.65, 5.45);
    this.camera.lookAt(0, 0.15, 0);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xdce7d2, 0x353127, 2.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe8bd, 3.0);
    sun.position.set(-3.5, 6, 4);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x7cb7c4, 1.65);
    rim.position.set(4, 3, -3);
    this.scene.add(rim);

    this.stage = new THREE.Group();
    this.scene.add(this.stage);
    this.#buildStage();

    this.characterRoot = new THREE.Group();
    this.characterRoot.name = 'menu-spellblade-root';
    this.characterRoot.scale.setScalar(1.10);
    this.characterRoot.position.set(0, -0.825, 0);
    this.characterRoot.rotation.y = this.targetYaw;
    this.stage.add(this.characterRoot);

    this.fallbackVisual = createSpellbladeRig(0);
    this.characterRoot.add(this.fallbackVisual);
    this.#setShowcasePose();
    reportSpellbladeAssetStatus('menu');

    this.magicLight = new THREE.PointLight(0x55d9ff, 3.2, 3.2, 2);
    this.magicLight.position.set(-0.85, 1.15, 0.15);
    this.stage.add(this.magicLight);

    this.#upgradeVisual();

    this.renderer.domElement.addEventListener('pointerdown', this.#pointerDown);
    globalThis.addEventListener?.('pointermove', this.#pointerMove);
    globalThis.addEventListener?.('pointerup', this.#pointerUp);
    this.renderer.domElement.addEventListener('dblclick', this.#resetView);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.#frame);
  }

  #upgradeVisual() {
    const generation = ++this.assetGeneration;
    createSpellbladeAsset({ kind: 'thirdPerson' }).then((instance) => {
      if (!instance) return;
      if (this.disposed || generation !== this.assetGeneration) {
        instance.dispose();
        return;
      }

      this.assetInstance = instance;
      this.visualKind = 'production';
      this.characterRoot.add(instance.root);
      instance.animator.apply({ clip: 'Idle', loop: true, time: 0 });
      reportSpellbladeAssetStatus('menu', instance);

      if (instance.sockets.sorcery) {
        instance.sockets.sorcery.add(this.magicLight);
        this.magicLight.position.set(0, 0, 0);
      }

      if (this.fallbackVisual) {
        this.characterRoot.remove(this.fallbackVisual);
        disposeObject(this.fallbackVisual);
        this.fallbackVisual = null;
      }
    }).catch(() => {
      if (!this.disposed) {
        this.visualKind = 'fallback';
        reportSpellbladeAssetStatus('menu');
      }
    });
  }

  #buildStage() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x716d61, roughness: 0.96 });
    const stoneLight = new THREE.MeshStandardMaterial({ color: 0x96907f, roughness: 0.94 });
    const earth = new THREE.MeshStandardMaterial({ color: 0x514737, roughness: 1 });

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.48, 0.34, 8), stone);
    plinth.position.y = -1.08;
    this.stage.add(plinth);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.38, 0.08, 8), stoneLight);
    cap.position.y = -0.87;
    this.stage.add(cap);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(2.7, 16), earth);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.25;
    this.stage.add(ground);

    for (const x of [-2.05, 2.05]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.48, 3.9, 0.65), stone);
      pier.position.set(x, 0.35, -1.15);
      this.stage.add(pier);
      const capstone = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 0.82), stoneLight);
      capstone.position.set(x, 2.33, -1.15);
      this.stage.add(capstone);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.55, 0.42, 0.72), stone);
    lintel.position.set(0, 2.58, -1.15);
    this.stage.add(lintel);
  }

  #setShowcasePose() {
    const rig = this.fallbackVisual.userData;
    rig.rightUpperArm.rotation.z = -0.24;
    rig.rightUpperArm.rotation.x = -0.18;
    rig.rightForearm.rotation.x = -0.18;
    rig.leftUpperArm.rotation.z = 0.34;
    rig.leftUpperArm.rotation.x = -0.3;
    rig.leftForearm.rotation.x = -0.55;
    rig.sword.rotation.z = -0.72;
    rig.sword.rotation.x = 0.12;
  }

  #pointerDown = (event) => {
    // touch browsers do not reliably turn a double tap into dblclick
    if (event.pointerType === 'touch') {
      const now = performance.now();
      if (now - (this.lastTapAt ?? -Infinity) < 320) {
        this.#resetView();
        this.lastTapAt = -Infinity;
      } else {
        this.lastTapAt = now;
      }
    }
    this.dragging = true;
    this.dragStart = { x: event.clientX, y: event.clientY, yaw: this.targetYaw, pitch: this.targetPitch };
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  };

  #pointerMove = (event) => {
    if (!this.dragging) return;
    this.targetYaw = this.dragStart.yaw + (event.clientX - this.dragStart.x) * 0.009;
    this.targetPitch = THREE.MathUtils.clamp(this.dragStart.pitch + (event.clientY - this.dragStart.y) * 0.004, -0.12, 0.12);
  };

  #pointerUp = () => { this.dragging = false; };

  #resetView = () => {
    this.targetYaw = Math.PI - 0.22;
    this.targetPitch = 0;
  };

  #frame = (nowMs) => {
    this.frameHandle = requestAnimationFrame(this.#frame);
    if (!this.visible || document.hidden) return;
    const t = nowMs / 1000;
    this.characterRoot.rotation.y += (this.targetYaw - this.characterRoot.rotation.y) * 0.09;
    this.characterRoot.rotation.x += (this.targetPitch - this.characterRoot.rotation.x) * 0.09;

    if (this.visualKind === 'production' && this.assetInstance) {
      this.assetInstance.animator.apply({ clip: 'Idle', loop: true, time: t });
    } else if (this.fallbackVisual) {
      const rig = this.fallbackVisual.userData;
      rig.visual.position.y = Math.sin(t * 1.7) * 0.018;
      rig.torso.rotation.z = Math.sin(t * 1.3) * 0.008;
      rig.head.rotation.y = Math.sin(t * 0.72) * 0.035;
      rig.magic.rotation.y = t * 1.7;
      rig.magicHalo.rotation.z = t * 0.9;
      const pulse = 1.0 + Math.sin(t * 3.1) * 0.08;
      rig.magic.scale.setScalar(pulse);
    }

    this.magicLight.intensity = 0.85 + Math.sin(t * 3.1) * 0.15;
    this.renderer.render(this.scene, this.camera);
  };

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
  }

  dispose() {
    this.disposed = true;
    this.assetGeneration += 1;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.#pointerDown);
    globalThis.removeEventListener?.('pointermove', this.#pointerMove);
    globalThis.removeEventListener?.('pointerup', this.#pointerUp);
    this.renderer.domElement.removeEventListener('dblclick', this.#resetView);

    if (this.assetInstance) {
      this.characterRoot.remove(this.assetInstance.root);
      this.assetInstance.dispose();
      this.assetInstance = null;
    }
    disposeObject(this.stage);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
