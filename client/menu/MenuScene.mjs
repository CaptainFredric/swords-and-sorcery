import { armoryPose, mixArmoryPose, ARMORY_PREVIEW_SEC } from './armoryPreview.mjs';
import { createArmoryHand } from './armoryHand.mjs';
import { createElementalOrb } from '../game/elementalOrb.mjs';
import { createSteelSheen } from '../game/steelSheen.mjs';
import { resolveSpellbladeAnimationPlan } from '../game/spellbladeAnimationPlan.mjs';
import * as THREE from 'three';
import { createSpellbladeRig } from '../game/SpellbladeFallback.mjs';
import { createSpellbladeAsset, reportSpellbladeAssetStatus } from '../game/SpellbladeAssets.mjs';
import { CASTLEWARD_LIGHTING, CastlewardRenderer } from '../worlds/CastlewardRenderer.mjs';
import { MENU_SHOTS, easeShot, lerpShot, menuShotFor, shotSettled, menuMoveSeconds } from './menuShots.mjs';
import { REACTIONS, idleMoment, idlePose, reactionMoment } from './menuIdle.mjs';
import { TourDirector } from './tour/TourDirector.mjs';
import { performanceAt } from './menuReactions.mjs';
import { THIRD_PERSON_SPELL_ARM, THIRD_PERSON_SWORD_ARM, solveArm } from '../game/swordArmIK.mjs';
import { screenTurn } from '../ui/screenTurn.mjs';
import { createGaleOrb } from '../game/galeOrb.mjs';
import { Effects } from '../game/Effects.mjs';
import { ArmoryShowcase, armoryGestureMotion } from './ArmoryShowcase.mjs';
import { hasShowcase } from './showcaseSheets.mjs';
import { MenuCaption } from './menuCaption.mjs';
import { captionPlan } from '../ui/voiceLibrary.mjs';

// a drag in the game's own frame (the game may be lying sideways on a screen that stays upright)
// where an element sits across the page in layout pixels (transforms, like a quarter turn of the shell, ignored)
function layoutLeft(element) {
  let x = 0;
  for (let node = element; node; node = node.offsetParent) x += node.offsetLeft;
  return x;
}

const gamePoint = (event) => (screenTurn ? screenTurn.point(event.clientX, event.clientY) : { x: event.clientX, y: event.clientY });

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) for (const material of object.material) material?.dispose?.();
    else object.material?.dispose?.();
  });
}

// Where the Spellblade stands for the menu: on the north green, the gatehouse and keep rising behind him, the
// nearest thing (the market stall) 4 m away and out of shot, so his blade clears everything however he turns.
const STAGE = Object.freeze({ x: -1.0, z: 5.5 });
const CAMERA_FROM = Object.freeze({ x: MENU_SHOTS.main.camera[0], z: MENU_SHOTS.main.camera[2] });
// a showcase cut short (another card, another screen): how long the camera takes to come away from it
const SHOWCASE_RELEASE_SEC = 0.6;

// a spell held up in the Armory (a Gale is its own ball of wind, galeOrb.mjs, and lights the hand only softly; glow:
// the palm light's colour)
const SPELL_PREVIEW = Object.freeze({
  fireball: { core: 0xfff0c8, glow: 0xff7a2a },
  frostfire: { core: 0xeafcff, glow: 0x7fd6ff },
  gale: { wind: true, glow: 0x7fd08e, light: 0.9 },
  steel: { core: 0xe9f3ff, glow: 0xabc8e6, light: 1.3 },
  sunder: { core: 0xffd08a, glow: 0xd79a45, light: 1.7 },
  vortex: { core: 0xffeab5, glow: 0xff5822, light: 2.6 },
  chivalry: { core: 0xf4f8ff, glow: 0x8fd3ff, light: 1.6 },
});

export class MenuScene {
  constructor(container, { onReady = () => {}, sound = null, voice = null, banner = null, armoryPanel = null } = {}) {
    this.container = container;
    this.onReady = onReady;
    this.sound = sound;
    this.voice = voice;
    // the front door's banner, which the round's fights are framed to the right of
    this.banner = banner;
    // the Armory's panel: its ultimates are performed in the part of the screen clear of it
    this.armoryPanel = armoryPanel;
    // the Spellblade's round (the main menu): wanted by the front door, running once his model is in
    this.tour = null;
    // what he says out on it, written out (Settings, Audio, Subtitles)
    this.caption = new MenuCaption(container);
    this.touringWanted = false;
    this.touring = false;
    this.tourBlend = 0;
    this.ready = false;
    this.visible = true;
    this.dragging = false;
    this.dragStart = { x: 0, y: 0, yaw: 0, pitch: 0 };
    this.targetYaw = Math.PI - 0.22;
    this.targetPitch = 0;
    this.frameHandle = null;
    this.lastFrameAt = null;
    this.clock = 0;
    this.disposed = false;
    this.assetGeneration = 0;
    this.assetInstance = null;
    this.visualKind = 'fallback';
    // camera: the current shot eases toward the requested one
    this.shot = { ...MENU_SHOTS.intro };
    this.shotFrom = { ...MENU_SHOTS.intro };
    this.shotTo = MENU_SHOTS.intro;
    this.shotElapsed = 0;
    this.shotDuration = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 180);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // the whole of Castleward, drawn with the environment kit, at its late-afternoon light
    this.world = new CastlewardRenderer(this.scene);
    const light = CASTLEWARD_LIGHTING;
    this.scene.add(new THREE.HemisphereLight(light.hemisphere.skyColor, light.hemisphere.groundColor, light.hemisphere.intensity));
    const sun = new THREE.DirectionalLight(light.sun.color, light.sun.intensity);
    sun.position.set(STAGE.x + light.sun.position[0], light.sun.position[1], STAGE.z + light.sun.position[2]);
    sun.target.position.set(STAGE.x, 0, STAGE.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
    this.scene.add(sun, sun.target);
    this.sun = sun;

    // the stage faces the camera's side of the forecourt, so the showcase yaw below reads as before: pi faces us
    this.stage = new THREE.Group();
    this.stage.position.set(STAGE.x, 0, STAGE.z);
    this.stage.rotation.y = Math.atan2(CAMERA_FROM.x - STAGE.x, CAMERA_FROM.z - STAGE.z);
    this.scene.add(this.stage);

    this.characterRoot = new THREE.Group();
    this.characterRoot.name = 'menu-spellblade-root';
    this.characterRoot.rotation.y = this.targetYaw;
    this.stage.add(this.characterRoot);

    // The procedural fallback only appears if the production GLB fails to load; during a normal load the forecourt
    // stays empty for a moment rather than advertising the obsolete model.
    this.fallbackVisual = createSpellbladeRig(0);
    this.fallbackVisual.visible = false;
    this.fallbackVisual.scale.setScalar(0.92);
    this.characterRoot.add(this.fallbackVisual);
    this.#setShowcasePose();
    reportSpellbladeAssetStatus('menu');

    this.magicLight = new THREE.PointLight(0x55d9ff, 1.1, 1.6, 2);
    this.magicLight.position.set(-0.85, 1.15, 0.15);
    this.magicLight.visible = false;
    this.characterRoot.add(this.magicLight);

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
      if (!instance) {
        this.#showFallback();
        return;
      }
      if (this.disposed || generation !== this.assetGeneration) {
        instance.dispose();
        return;
      }

      this.assetInstance = instance;
      this.visualKind = 'production';
      instance.setCloth(this.cloth ?? 'crimson');
      this.characterRoot.add(instance.root);
      instance.root.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
      instance.animator.apply({ clip: 'Idle', loop: true, time: 0 });
      reportSpellbladeAssetStatus('menu', instance);

      if (instance.sockets.sorcery) {
        instance.sockets.sorcery.add(this.magicLight);
        this.magicLight.position.set(0, 0, 0);
      }
      this.magicLight.visible = true;

      if (this.fallbackVisual) {
        this.characterRoot.remove(this.fallbackVisual);
        disposeObject(this.fallbackVisual);
        this.fallbackVisual = null;
      }
      // his rivals and his round (not on the Smooth quality, nor for anyone who asked the web for less motion)
      if (this.tourAllowed !== false) {
        this.tour = new TourDirector({ scene: this.scene, camera: this.camera, hero: { root: this.characterRoot, instance }, sound: this.sound, voice: this.voice, effects: this.#effects() });
        // (beat by beat as he says it: never a word before it is said)
        this.tour.onCaption = ({ line, delay, seconds, beats }) => {
          const plan = captionPlan(line, { beats });
          if (plan) this.caption.show({ text: plan.text, delay: delay + plan.after, seconds: Math.max(0.5, seconds - plan.after), cues: plan.cues });
        };
        this.tour.onCaptionCut = () => this.caption.cut();
      }
      // the Armory's ultimates, performed
      this.showcase = new ArmoryShowcase({
        scene: this.scene, camera: this.camera, holder: this.characterRoot, instance, sound: this.sound, palmLight: this.magicLight,
        effects: () => this.#effects(),
        steel: () => (this.armorySteel ??= createSteelSheen(instance)),
        hand: () => (this.armoryHand ??= createArmoryHand(instance)),
      });
      this.#markReady();
    }).catch(() => {
      if (!this.disposed) {
        this.visualKind = 'fallback';
        reportSpellbladeAssetStatus('menu');
        this.#showFallback();
      }
    });
  }

  #showFallback() {
    if (this.disposed || !this.fallbackVisual) return;
    this.fallbackVisual.visible = true;
    this.magicLight.visible = true;
    this.#markReady();
  }

  #markReady() {
    if (this.ready) return;
    this.ready = true;
    this.container.classList.add('menu-spellblade-ready');
    this.onReady();
  }

  // the menu's one set of effects (the round's fights and the Armory's showcases share it: its lights are part of every
  // lit shader, so a second set would cost every frame); made with the round, or when a showcase first wants it
  #effects() {
    if (!this.effects) {
      this.effects = new Effects(this.scene, this.camera);
      this.effects.setDensity(this.particleDensity ?? 1);
      // (their orbs' and blasts' shaders built off the frame, and kept: Effects.warm)
      this.effects.warm(this.renderer, this.scene);
    }
    return this.effects;
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

  /** Ease the camera to the shot for a menu screen (main, solo, private, how, lobby). */
  setCloth(id) {
    this.cloth = id;
    this.assetInstance?.setCloth(id);
  }

  setShot(name, seconds = null) {
    const next = menuShotFor(name);
    if (next === this.shotTo) return;
    this.shotFrom = { ...(this.presentedShot ?? this.shot) };
    this.shotTo = next;
    this.shotElapsed = 0;
    this.shotDuration = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0.01 : Math.max(0.01, seconds ?? menuMoveSeconds(this.shotFrom, next));
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
    this.dragStart = { ...gamePoint(event), yaw: this.targetYaw, pitch: this.targetPitch };
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  };

  #pointerMove = (event) => {
    if (!this.dragging || this.touring) return;
    const point = gamePoint(event);
    this.targetYaw = this.dragStart.yaw + (point.x - this.dragStart.x) * 0.009;
    this.targetPitch = THREE.MathUtils.clamp(this.dragStart.pitch + (point.y - this.dragStart.y) * 0.004, -0.12, 0.12);
  };

  #pointerUp = () => { this.dragging = false; };

  #resetView = () => {
    this.targetYaw = Math.PI - 0.22;
    this.targetPitch = 0;
  };

  #frame = (nowMs) => {
    this.frameHandle = requestAnimationFrame(this.#frame);
    if (!this.visible || document.hidden) {
      this.lastFrameAt = null;
      return;
    }
    const dt = this.lastFrameAt === null ? 1 / 60 : Math.min(0.1, (nowMs - this.lastFrameAt) / 1000);
    this.lastFrameAt = nowMs;
    this.clock += dt;
    const t = nowMs / 1000;
    // the round begins once the camera has settled on him at the front door (never from the establishing shot)
    const settled = shotSettled({ to: this.shotTo, duration: this.shotDuration, elapsed: this.shotElapsed });
    if (this.touringWanted && !this.touring && this.tour?.ready && settled) this.#startTouring();
    if (!this.touring) {
      this.characterRoot.rotation.y += (this.targetYaw - this.characterRoot.rotation.y) * 0.09;
      this.characterRoot.rotation.x += (this.targetPitch - this.characterRoot.rotation.x) * 0.09;
    }
    // A deliberate Armory choice briefly flares its identity on the live model.
    if (this.armoryPreview) {
      const age = Math.max(0, this.clock - this.armoryPreview.started);
      const pulse = Math.max(0, Math.sin(Math.PI * Math.min(1, age / ARMORY_PREVIEW_SEC)));
      const id = this.armoryPreview.id;
      if (this.spellOrb) this.spellOrb.scale.setScalar(1 + pulse * (id === 'sunder' ? .9 : .6));
      this.magicLight.intensity = (SPELL_PREVIEW[id]?.light ?? 2.4) + pulse * .8;
      if (id === 'vortex' && this.spellOrbGlow) this.spellOrbGlow.rotation.z = age * 16;
    }
    // the spell held up in the Armory breathes and turns (a Gale flows)
    if (this.spellOrb?.visible) {
      if (!this.armoryPreview) this.spellOrb.scale.setScalar(1 + Math.sin(t * 3.1) * 0.08);
      this.spellOrbGlow.rotation.y = t * 1.7;
    }
    if (this.galeOrb?.visible) this.galeOrb.userData.update(t);
    if (this.armoryElemental?.visible) this.armoryElemental.userData.update(t);

    const round = this.touring ? this.tour.update(dt) : null;
    if (this.touring) {
      // the round moves him (and the sun, so the shadows around him stay crisp)
      const at = this.characterRoot.position;
      this.sun.position.set(at.x + CASTLEWARD_LIGHTING.sun.position[0], CASTLEWARD_LIGHTING.sun.position[1], at.z + CASTLEWARD_LIGHTING.sun.position[2]);
      this.sun.target.position.set(at.x, 0, at.z);
    } else if (this.showcase?.active && this.assetInstance) {
      // an ultimate chosen in the Armory, performed (ArmoryShowcase.mjs): posed, then what the moment brings
      const plan = this.showcase.pose(dt);
      if (plan) {
        this.assetInstance.animator.apply(plan, dt);
        this.characterRoot.updateMatrixWorld(true);
        this.showcase.act(dt);
      }
    } else if (this.visualKind === 'production' && this.assetInstance) {
      // between stretches of breathing he looks around, shifts, presents the blade, guards or kindles sorcery
      // a reaction to a choice on the front door takes over from the idle life while it lasts
      const reaction = this.ready ? reactionMoment(this.reaction, this.clock) : null;
      const performance = reaction ? performanceAt(reaction.kind, reaction.elapsed) : null;
      const moment = reaction ?? (this.ready ? idleMoment(this.clock) : null);
      let plan = resolveSpellbladeAnimationPlan({ state: 'idle', localTime: t });
      if (performance) {
        // a performed flourish: the body bends as keyed, and the arm solver puts each hand where it belongs
        plan.motion = {
          extra: performance.rotations,
          crouch: performance.crouch,
          solve: (bones) => {
            if (performance.sword) solveArm(bones, THIRD_PERSON_SWORD_ARM, performance.sword.target, performance.sword.weight);
            if (performance.spell) solveArm(bones, THIRD_PERSON_SPELL_ARM, performance.spell.target, performance.spell.weight);
          },
        };
      } else {
        const pose = idlePose(moment);
        // raise the guard, then breathe in its hold
        if (pose.clip === 'Guard') plan = { clip: 'Guard', loop: false, time: Math.min(moment.elapsed, 1.8) };
        if (pose.clip === 'Cast') plan = { clip: 'Cast', loop: false, time: moment.elapsed };
        plan.motion = { extra: pose.rotations };
      }
      let armoryEffect=null;
      if (this.armoryPreview && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        const elapsed = Math.max(0, this.clock - this.armoryPreview.started);
        const id = this.armoryPreview.id;
        let gesture = armoryPose(id, elapsed);
        if (this.armoryPreview.from && elapsed < .18) {
          const u=elapsed/.18, eased=u*u*(3-2*u);
          gesture = { ...gesture, ...mixArmoryPose(this.armoryPreview.from, gesture, eased) };
        }
        this.lastArmoryPose=gesture;
        this.lastArmoryPoseAt=this.clock;
        plan = resolveSpellbladeAnimationPlan({ state:'idle',localTime:t });
        plan.motion=armoryGestureMotion(gesture);
        this.armoryHand ??= createArmoryHand(this.assetInstance);
        this.armoryHand.set(gesture.fist);
        if (id === 'steel') {
          this.armorySteel ??= createSteelSheen(this.assetInstance);
          this.armorySteel.set(gesture.strength, elapsed);
        }
        armoryEffect={id,elapsed,strength:gesture.strength};
      }
      this.assetInstance.animator.apply(plan, dt);
      if(armoryEffect){this.assetInstance.root.updateMatrixWorld(true);this.#previewParticles(armoryEffect.id,armoryEffect.elapsed,armoryEffect.strength);}
    } else if (this.fallbackVisual) {
      const rig = this.fallbackVisual.userData;
      rig.visual.position.y = Math.sin(t * 1.7) * 0.018;
      rig.torso.rotation.z = Math.sin(t * 1.3) * 0.008;
      rig.head.rotation.y = Math.sin(t * 0.72) * 0.035;
      rig.magic.rotation.y = t * 1.7;
      rig.magicHalo.rotation.z = t * 0.9;
      rig.magic.scale.setScalar(1.0 + Math.sin(t * 3.1) * 0.08);
    }

    // the camera eases between shots and breathes slowly while it holds one
    if (this.shotDuration > 0 && this.shotElapsed < this.shotDuration) {
      this.shotElapsed = Math.min(this.shotDuration, this.shotElapsed + dt);
      this.shot = lerpShot(this.shotFrom, this.shotTo, easeShot(this.shotElapsed / this.shotDuration));
    } else {
      this.shot = { ...this.shotTo };
    }
    const drift = [Math.sin(t * 0.21) * 0.12, Math.sin(t * 0.17) * 0.05, Math.cos(t * 0.13) * 0.1];
    if (round) {
      // eased from the front door's shot into the round's own camera
      this.tourBlend = Math.min(1, this.tourBlend + dt / 1.6);
      const k = easeShot(this.tourBlend);
      this.#placeCamera(lerpShot(this.shot, { camera: round.position.toArray(), target: round.target.toArray(), fov: round.fov }, k), drift.map((d) => d * (1 - k)));
    } else {
      let view = this.shot;
      let offset = drift;
      if (this.showcase?.active && this.showcase.framed > 0) {
        // stepped back to keep the showcase in view, and shaken by what it brings down on the ground
        const shake = this.showcase.shakeOffset(t);
        view = lerpShot(this.shot, this.showcase.shot, easeShot(this.showcase.framed));
        if (shake) offset = drift.map((d, i) => d + shake[i]);
      }
      // a showcase cut short: from wherever the camera was, eased to where it is wanted now
      if (this.cameraRelease) {
        this.cameraRelease.age += dt;
        const share = this.cameraRelease.age / SHOWCASE_RELEASE_SEC;
        view = lerpShot(this.cameraRelease.from, view, easeShot(share));
        if (share >= 1) this.cameraRelease = null;
      }
      this.#placeCamera(view, offset);
    }
    // the menu's effects (the round's fights and the showcases alike: the round leaves them to the menu)
    this.effects?.update(dt);

    this.world.update(t, this.camera);
    this.renderer.render(this.scene, this.camera);
  };

  #placeCamera(shot, drift = [0, 0, 0]) {
    this.presentedShot = { camera:[...shot.camera],target:[...shot.target],fov:shot.fov };
    this.camera.position.set(shot.camera[0] + drift[0], shot.camera[1] + drift[1], shot.camera[2] + drift[2]);
    this.camera.lookAt(shot.target[0], shot.target[1], shot.target[2]);
    if (Math.abs(this.camera.fov - shot.fov) > 1e-3) {
      this.camera.fov = shot.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** A choice was made on the front door: he answers it (salute, rally, present, look; see menuIdle.mjs). */
  react(kind) {
    // out on his round, he stops where he is to answer, and the round waits for him
    if (this.touring) {
      this.tour.perform(kind, REACTIONS[kind] ?? 2.5);
      return;
    }
    this.reaction = { kind, startedAt: this.clock };
  }

  /** Whether the front door wants his round (the main menu), or him at his place (every other screen). */
  setTouring(wanted) {
    this.touringWanted = Boolean(wanted) && this.tourAllowed !== false;
    if (!this.touringWanted) this.#stopTouring();
  }

  /** The round is for capable settings only: off on Smooth quality and for reduced motion. */
  setTourAllowed(allowed) {
    this.tourAllowed = Boolean(allowed);
    if (!this.tourAllowed) this.setTouring(false);
  }

  #startTouring() {
    // he steps off his stage into the world, exactly where he stands, and the round starts from there
    this.characterRoot.rotation.x = 0;
    this.scene.attach(this.characterRoot);
    this.characterRoot.rotation.set(0, this.characterRoot.rotation.y, 0);
    this.tour.restYaw = this.characterRoot.rotation.y;
    this.tour.heroYaw = this.characterRoot.rotation.y;
    this.tour.home = { position: new THREE.Vector3(...this.shot.camera), target: new THREE.Vector3(...this.shot.target), fov: this.shot.fov };
    this.#measureBanner();
    this.tour.restart();
    this.tour.setVisible(true);
    this.tourBlend = 0;
    this.touring = true;
  }

  #stopTouring() {
    if (!this.touring) return;
    this.touring = false;
    // a reaction he was in the middle of out on the round, he finishes at his place
    const performance = this.tour.pause > 0 ? this.tour.performance : null;
    if (performance) this.reaction = { kind: performance.kind, startedAt: this.clock - performance.elapsed };
    this.tour.performance = null;
    this.tour.pause = 0;
    // back on his stage (the other screens' shots are framed on it), rivals and their remains out of sight
    this.stage.add(this.characterRoot);
    this.characterRoot.position.set(0, 0, 0);
    this.characterRoot.rotation.set(0, this.targetYaw, 0);
    this.tour.setVisible(false);
    this.assetInstance?.animator.cloth?.reset();
    this.sun.position.set(STAGE.x + CASTLEWARD_LIGHTING.sun.position[0], CASTLEWARD_LIGHTING.sun.position[1], STAGE.z + CASTLEWARD_LIGHTING.sun.position[2]);
    this.sun.target.position.set(STAGE.x, 0, STAGE.z);
  }

  // the part of the screen right of the banner, as shares of its width: the round frames its fights in it. Measured
  // in layout pixels, not screen boxes: lying sideways on an upright phone (screenTurn.mjs), every screen box is turned
  // a quarter and the banner would seem to cover the whole screen
  #measureBanner() {
    const banner = this.banner;
    const canvas = this.renderer.domElement;
    if (!this.tour || !banner?.offsetWidth || canvas.clientWidth < 1) return;
    const edge = (layoutLeft(banner) + banner.offsetWidth - layoutLeft(canvas)) / canvas.clientWidth;
    // a banner across most of a narrow screen leaves nothing clear of it: the fights take the middle
    this.tour.clear = edge > 0.62 ? [0.1, 0.9] : [Math.max(0.1, edge + 0.03), 0.96];
    // a phone on its side: the knights a little smaller, with room around them
    this.tour.compact = canvas.clientHeight < 520;
  }

  // restart the render loop (after it was starved by a hidden page, for instance)
  kick() {
    cancelAnimationFrame(this.frameHandle);
    this.lastFrameAt = null;
    this.frameHandle = requestAnimationFrame(this.#frame);
  }

  /**
   * The Armory holds the chosen spell up in his palm (null puts it away): a small orb and the palm light in its
   * colour; the rest of the menu keeps his usual cyan glow.
   */
  showSpell(spell) {
    this.armoryPreview = null;
    if (this.showcase?.active) {
      if (this.presentedShot) this.cameraRelease = { from: this.presentedShot, age: 0 };
      this.showcase.stop();
    }
    this.armoryHand?.set(0);
    if(this.previewBits)this.previewBits.visible=false;
    this.armorySteel?.set(0, null);
    if (this.spellOrbGlow) this.spellOrbGlow.rotation.z = 0;
    this.shownSpell = spell;
    const look = SPELL_PREVIEW[spell];
    if (!look) {
      if (this.spellOrb) this.spellOrb.visible = false;
      if (this.galeOrb) this.galeOrb.visible = false;
      this.magicLight.color.setHex(0x55d9ff);
      this.magicLight.intensity = 1.1;
      return;
    }
    const socket = this.assetInstance?.sockets?.sorcery;
    if (!this.spellOrb && socket) {
      this.spellOrb = new THREE.Group();
      this.spellOrbCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      this.spellOrbGlow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.spellOrb.add(this.spellOrbCore, this.spellOrbGlow);
      this.spellOrb.position.set(0, 0.06, 0);
      socket.add(this.spellOrb);
    }
    if (look.wind && !this.galeOrb && socket) {
      this.galeOrb = createGaleOrb({ radius: 0.1 });
      this.galeOrb.position.set(0, 0.08, 0);
      socket.add(this.galeOrb);
    }
    if (this.galeOrb) this.galeOrb.visible = Boolean(look.wind);
    if (this.spellOrb) {
      this.spellOrb.visible = !look.wind && !['steel','sunder','vortex','chivalry'].includes(spell);
      if (!look.wind) {
        this.spellOrbCore.material.color.setHex(look.core);
        this.spellOrbGlow.material.color.setHex(look.glow);
      }
    }
    if (this.armoryElementalSpell !== spell) {
      this.armoryElemental?.removeFromParent();
      this.armoryElemental?.userData.dispose?.();
      this.armoryElemental = spell === 'fireball' || spell === 'frostfire' ? createElementalOrb(spell) : null;
      this.armoryElemental?.scale.setScalar(.5);
      if (this.armoryElemental && this.spellOrb) this.spellOrb.add(this.armoryElemental);
      this.armoryElementalSpell = spell;
    }
    if (this.spellOrbCore) this.spellOrbCore.visible = !this.armoryElemental;
    if (this.spellOrbGlow) this.spellOrbGlow.visible = !this.armoryElemental;
    this.magicLight.color.setHex(look.glow);
    this.magicLight.intensity = look.light ?? 2.4;
  }

  previewArmory(id) {
    this.showSpell(id);
    this.reaction=null;
    if (this.performs(id)) {
      this.lastArmoryPoseAt = null;
      this.showcase.start(id, this.#showcaseView());
      return;
    }
    this.armoryPreview = { id, started: this.clock, from:this.clock-(this.lastArmoryPoseAt??-10)<.1 ? this.lastArmoryPose : null };
  }

  /**
   * Whether choosing `id` now begins a showcase (an ultimate, on his own model, for anyone not asking for less motion,
   * and not the one already being performed): it brings its own sounds, in place of the card's cue. (Pressed again
   * while it plays, the card is heard as any card is, and the showcase goes on.)
   */
  performs(id) {
    return hasShowcase(id) && Boolean(this.showcase) && this.visualKind === 'production' && !this.touring
      && !(this.showcase.active && this.showcase.sheet.id === id)
      && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  // how the Armory's camera looks now, and the part of the screen clear of its panel, for a showcase's shot
  #showcaseView() {
    const shot = this.shotTo;
    const canvas = this.renderer.domElement;
    const panel = this.armoryPanel;
    let clear = [0.1, 0.97];
    if (panel?.offsetWidth && canvas.clientWidth > 0) {
      const edge = (layoutLeft(panel) + panel.offsetWidth - layoutLeft(canvas)) / canvas.clientWidth;
      // (a panel across most of a narrow screen: the showcase takes the middle)
      clear = edge > 0.7 ? [0.1, 0.97] : [Math.max(0.05, edge + 0.02), 0.97];
    }
    return { look: [shot.target[0] - shot.camera[0], shot.target[2] - shot.camera[2]], aspect: this.camera.aspect, clear, fov: shot.fov };
  }

  /** How dense the effects' cosmetic particles are (the render quality: applySettings PARTICLE_DENSITY). */
  setParticleDensity(density) {
    this.particleDensity = density;
    this.effects?.setDensity(density);
  }

  /** Subtitles on the front door (what he says out on his round), as the player has them. */
  setSubtitles(enabled) {
    this.caption.setEnabled(enabled);
  }

  #previewParticles(id,age,strength) {
    if(!this.previewBits){
      this.previewBits=new THREE.Group();
      this.previewBitGeometry=new THREE.OctahedronGeometry(.025,0);
      this.previewBitMaterial=new THREE.MeshBasicMaterial({color:0xffb950,transparent:true,depthWrite:false});
      for(let i=0;i<16;i++)this.previewBits.add(new THREE.Mesh(this.previewBitGeometry,this.previewBitMaterial));
      this.stage.add(this.previewBits);
    }
    this.previewBits.visible=strength>.03 && id!=='steel';
    this.previewBitMaterial.color.setHex(id==='frostfire'?0xc6f3ff:id==='gale'?0xe5ecda:id==='sunder'?0x88765e:id==='chivalry'?0xa9dcff:0xffbd5f);
    this.previewBitMaterial.opacity=strength*.7;
    const point=new THREE.Vector3();
    const socket=id==='vortex'?this.assetInstance.sockets.sword:this.assetInstance.sockets.sorcery;
    socket?.getWorldPosition(point);
    this.stage.worldToLocal(point);
    this.previewBits.position.copy(point);
    const bladeDirection=new THREE.Vector3(0,1,0);
    if(id==='vortex') {
      if(!this.previewSwordTip) {
        const meshes=[];
        this.assetInstance.root.traverse((mesh)=>{if(mesh.isSkinnedMesh&&mesh.name.startsWith('HeroSword'))meshes.push(mesh);});
        let farthest=-1;
        for(const mesh of meshes) {
          mesh.skeleton.update();
          for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
            const distance=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).distanceToSquared(socket.getWorldPosition(new THREE.Vector3()));
            if(distance>farthest){farthest=distance;this.previewSwordTip={mesh,index:i};}
          }
        }
      }
      if(this.previewSwordTip) {
        const {mesh,index}=this.previewSwordTip;
        mesh.skeleton.update();
        const tip=this.stage.worldToLocal(mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
        bladeDirection.copy(tip).sub(point).normalize();
      }
    }
    if(id==='sunder')this.previewBits.position.set(0,.06,-.55);
    this.previewBits.children.forEach((bit,i)=>{
      // (Sunder's rubble is thrown up as its sword comes down: ARMORY_GESTURES.sunder)
      const phase=age*5+i*.8, radius=id==='sunder'?.14+Math.max(0,age-.43)*.3:.08;
      bit.position.set(Math.cos(phase)*radius,Math.sin(phase*1.2)*.1,Math.sin(phase)*radius);
      if(id==='vortex')bit.position.addScaledVector(bladeDirection,.12+(i%8)*.1);
      bit.scale.setScalar((id==='gale'?.5:id==='frostfire'?1.2:1)*strength);
      bit.rotation.set(phase,phase*.7,phase*.2);
      bit.visible=id!=='sunder'||(age>.43&&age<.85);
    });
  }

  /** Render quality (a setting): the menu never draws sharper than 1.25x, and Smooth draws at 1x. */
  setPixelRatioCap(cap) {
    // resizing clears the canvas, so only when the quality really changes (settings apply on every change)
    if (cap === this.pixelRatioCap) return;
    this.pixelRatioCap = cap;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.25, cap));
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.touring) this.#measureBanner();
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
  }

  dispose() {
    this.caption.dispose();
    this.showcase?.dispose();
    this.armoryHand?.dispose();
    this.previewBits?.removeFromParent();
    this.previewBitGeometry?.dispose();
    this.previewBitMaterial?.dispose();
    this.armorySteel?.dispose();
    this.armoryElemental?.removeFromParent();
    this.armoryElemental?.userData.dispose?.();
    this.armoryElemental = null;
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
    if (this.fallbackVisual) disposeObject(this.fallbackVisual);
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
