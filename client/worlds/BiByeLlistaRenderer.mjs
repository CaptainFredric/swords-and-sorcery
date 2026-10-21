import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appUrl } from '../appUrl.mjs';
import { everywhere } from '../game/viewLayers.mjs';
import { BI_BYE_LLISTA_CONFIG, BI_BYE_STATES, BI_BYE_MODES } from '../../shared/sim/biByeLlista.mjs';

const ASSET_PATH = '/client/assets/props/bibye-ballista/bi-bye-llista.glb';
const WHEEL_RADIUS = 0.550; // meters (R_wheel)
const DEPLOY_TIME_SCALE = 1.60 / 1.20; // 1.3333x: retimes 1.60s clip to match 1.20s authoritative transition
const RETRACT_TIME_SCALE = 1.60 / 1.20; // 1.3333x: retimes 1.60s clip to match 1.20s authoritative transition

/**
 * Bi-Bye-llista (Two-Bolt Ballista) Mobile Siege Engine Renderer.
 * Integrates the authored Argon v3.0 production GLB asset (37 nodes, 29 mechanical meshes,
 * 7 locators, and 12 animation clips) with fallback procedural meshes, continuous 6-wheel
 * Ackermann steering & rolling, dual projectile visuals, and persistent wreck states.
 */
export class BiByeLlistaRenderer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = options;
    this.group = new THREE.Group();
    this.group.name = 'Bi-Bye-llista Emplacement';

    const cfg = BI_BYE_LLISTA_CONFIG.emplacement;
    this.group.position.set(cfg.x, cfg.y, cfg.z);

    this.materials = this.#initMaterials();
    this.lastPosition = { x: cfg.x, z: cfg.z };
    this.lastTimeSec = 0;
    this.wheelRoll = 0;

    this.currentState = BI_BYE_STATES.LOADED;
    this.currentMode = BI_BYE_MODES.MOBILE;

    // Track authored asset and nodes
    this.authoredModel = null;
    this.nodes = new Map();
    this.actions = new Map();
    this.mixer = null;
    this.activeBaseAction = null;
    this.activeActionName = null;

    // Projectile visual tracking
    this.projectileMeshes = new Map();

    // 1. Build initial procedural fallback until authored GLB completes load
    this.#buildFallbackMesh();

    // 2. Load authored v3.0 production GLB asset asynchronously
    this.#loadAuthoredModel();

    scene.add(this.group);
  }

  #initMaterials() {
    return {
      timber: new THREE.MeshStandardMaterial({ color: 0x4a321f, roughness: 0.85, metalness: 0.05 }),
      timberDark: new THREE.MeshStandardMaterial({ color: 0x332012, roughness: 0.9, metalness: 0.05 }),
      charred: new THREE.MeshStandardMaterial({ color: 0x161618, roughness: 0.95, metalness: 0.1 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.55, metalness: 0.85 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x7c8594, roughness: 0.35, metalness: 0.95 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xa88434, roughness: 0.4, metalness: 0.8 }),
      arcaneCyan: new THREE.MeshStandardMaterial({
        color: 0x22ccff,
        emissive: 0x0099cc,
        emissiveIntensity: 0.85,
        roughness: 0.2,
      }),
      rope: new THREE.MeshStandardMaterial({ color: 0x94826b, roughness: 0.95 }),
      boltFeather: new THREE.MeshStandardMaterial({ color: 0xa62b24, roughness: 0.7 }),
    };
  }

  #loadAuthoredModel() {
    const loader = new GLTFLoader();
    const url = appUrl(ASSET_PATH);

    loader.load(
      url,
      (gltf) => {
        this.authoredModel = gltf.scene;
        this.authoredModel.name = 'BiBye_Authored_Asset_v3';

        // Index nodes by name
        gltf.scene.traverse((obj) => {
          if (obj.name) {
            this.nodes.set(obj.name, obj);
          }
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        // Initialize AnimationMixer and extract all clips
        this.mixer = new THREE.AnimationMixer(this.authoredModel);

        for (const clip of (gltf.animations ?? [])) {
          const action = this.mixer.clipAction(clip);
          this.actions.set(clip.name, action);

          // Configure playback modes
          if (clip.name === '01_BiBye_LoadedIdle' || clip.name === '06_BiBye_Travel_Ready' || clip.name === '03_BiBye_Spent_Recovery') {
            action.setLoop(THREE.LoopRepeat);
          } else {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
          }

          // Authoritative time scaling for deploy/retract
          if (clip.name === '05_BiBye_Stabilizer_Deploy') {
            action.timeScale = DEPLOY_TIME_SCALE;
          } else if (clip.name === '07_BiBye_Stabilizer_Retract') {
            action.timeScale = RETRACT_TIME_SCALE;
          }
        }

        // Start in Travel Ready idle action
        const travelReady = this.actions.get('06_BiBye_Travel_Ready');
        if (travelReady) {
          travelReady.play();
          this.activeBaseAction = travelReady;
          this.activeActionName = '06_BiBye_Travel_Ready';
        }

        // Add authored model to root group and retire procedural fallback
        this.group.add(this.authoredModel);
        if (this.fallbackGroup) {
          this.fallbackGroup.visible = false;
        }
      },
      undefined,
      (err) => {
        // Fallback remains active seamlessly if GLB network load fails
        console.warn('BiByeLlistaRenderer: Authored asset load failed, retaining fallback mesh', err);
      }
    );
  }

  #buildFallbackMesh() {
    this.fallbackGroup = new THREE.Group();
    this.fallbackGroup.name = 'BiBye_ProceduralFallback';

    // Wagon bed chassis
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 1.4), this.materials.timber);
    bed.position.set(0, 0.45, 0);
    bed.castShadow = true;
    this.fallbackGroup.add(bed);

    // 6 Wheels
    this.fallbackWheels = [];
    const wheelPositions = [
      [-1.075, 1.200], [0, 1.200], [1.075, 1.200],
      [-1.075, -1.200], [0, -1.200], [1.075, -1.200],
    ];
    for (const [wx, wz] of wheelPositions) {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.55, wz);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 16), this.materials.iron);
      rim.rotation.x = Math.PI / 2;
      wGroup.add(rim);
      this.fallbackGroup.add(wGroup);
      this.fallbackWheels.push(wGroup);
    }

    // 4 Stabilizers
    this.fallbackStabilizers = [];
    for (const [ox, oz, dir] of [[-1.2, 0.7, 1], [1.2, 0.7, 1], [-1.2, -0.7, -1], [1.2, -0.7, -1]]) {
      const stab = new THREE.Group();
      stab.position.set(ox, 0.35, oz);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.12), this.materials.iron);
      arm.position.set(ox > 0 ? 0.4 : -0.4, 0, 0);
      stab.add(arm);
      this.fallbackGroup.add(stab);
      this.fallbackStabilizers.push(stab);
    }

    // Turntable and cradle
    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.7, 0.15, 16), this.materials.iron);
    turntable.position.set(0, 0.65, 0);
    this.fallbackGroup.add(turntable);

    this.group.add(this.fallbackGroup);
  }

  update(timeSec, ballistaData, projectilesData = []) {
    if (!ballistaData) return;

    const dt = Math.max(0.001, Math.min(0.2, this.lastTimeSec > 0 ? timeSec - this.lastTimeSec : 0.016));
    this.lastTimeSec = timeSec;

    // 1. Authoritative World Position & Carriage Heading
    const posX = ballistaData.position?.x ?? ballistaData.x ?? 0;
    const posY = ballistaData.position?.y ?? ballistaData.y ?? 0;
    const posZ = ballistaData.position?.z ?? ballistaData.z ?? 0;
    const heading = ballistaData.heading ?? 0;

    this.group.position.set(posX, posY, posZ);
    this.group.rotation.y = heading;

    // 2. Kinematic Wheel Locomotion & Steering
    const dx = posX - this.lastPosition.x;
    const dz = posZ - this.lastPosition.z;
    this.lastPosition.x = posX;
    this.lastPosition.z = posZ;

    // Signed travel projection along forward heading vector (-sin(heading), -cos(heading))
    const headingX = -Math.sin(heading);
    const headingZ = -Math.cos(heading);
    const deltaTravel = dx * headingX + dz * headingZ;

    // Roll angle around local +X: deltaTheta = deltaTravel / R_wheel
    const deltaRoll = deltaTravel / WHEEL_RADIUS;
    this.wheelRoll += deltaRoll;

    // Ackermann steering angles around +Y
    const steer = ballistaData.steer ?? 0;
    const frontSteerYaw = steer * (18 * Math.PI / 180); // +-18 deg
    const midSteerYaw = 0; // 0 deg
    const rearSteerYaw = -steer * (10 * Math.PI / 180); // -+10 deg counter-steer

    // 3. Update Authored Model or Fallback
    if (this.authoredModel) {
      this.#updateAuthoredModel(timeSec, dt, ballistaData, frontSteerYaw, midSteerYaw, rearSteerYaw);
    } else if (this.fallbackGroup) {
      this.#updateFallbackModel(timeSec, ballistaData, frontSteerYaw, midSteerYaw, rearSteerYaw);
    }

    // 4. Update In-Flight Projectile Visuals
    this.#updateProjectiles(projectilesData);
  }

  #updateAuthoredModel(timeSec, dt, ballistaData, frontSteerYaw, midSteerYaw, rearSteerYaw) {
    const mode = ballistaData.mode;
    const state = ballistaData.state;

    // A. State & Mode Action Transitions
    if (mode === BI_BYE_MODES.DESTROYED) {
      this.#playAction('12_BiBye_Damaged_Destroyed', { loop: THREE.LoopOnce, clamp: true });
    } else if (mode === BI_BYE_MODES.DEPLOYING) {
      this.#playAction('05_BiBye_Stabilizer_Deploy', { loop: THREE.LoopOnce, clamp: true, timeScale: DEPLOY_TIME_SCALE });
    } else if (mode === BI_BYE_MODES.RETRACTING) {
      this.#playAction('07_BiBye_Stabilizer_Retract', { loop: THREE.LoopOnce, clamp: true, timeScale: RETRACT_TIME_SCALE });
    } else if (mode === BI_BYE_MODES.DEPLOYED) {
      if (state === BI_BYE_STATES.FIRING) {
        this.#playAction('02_BiBye_TwoStage_Fire', { loop: THREE.LoopOnce, clamp: true });
      } else if (state === BI_BYE_STATES.SPENT) {
        this.#playAction('03_BiBye_Spent_Recovery', { loop: THREE.LoopRepeat });
      } else if (state === BI_BYE_STATES.RELOADING) {
        const reloadDuration = BI_BYE_LLISTA_CONFIG.timing.reloadDurationSec ?? 6.0;
        this.#playAction('04_BiBye_Mechanical_Reload', { loop: THREE.LoopOnce, clamp: true, timeScale: 6.0 / reloadDuration });
      } else {
        this.#playAction('01_BiBye_LoadedIdle', { loop: THREE.LoopRepeat });
      }
    } else if (mode === BI_BYE_MODES.MOBILE) {
      if (this.lastSmallBoltReady && !ballistaData.smallBoltReady) {
        this.#playAction('09_BiBye_Mobile_Shot1_Fire', { loop: THREE.LoopOnce, clamp: true });
      } else if (!ballistaData.smallBoltReady) {
        const shotAction = this.actions.get('09_BiBye_Mobile_Shot1_Fire');
        if (this.activeActionName === '09_BiBye_Mobile_Shot1_Fire' && shotAction?.isRunning() && shotAction.time < 0.6) {
          // Allow firing recoil impulse to complete
        } else {
          const recockDuration = BI_BYE_LLISTA_CONFIG.timing.mobileRecockSec ?? 3.0;
          this.#playAction('10_BiBye_Mobile_Shot1_Reload', { loop: THREE.LoopOnce, clamp: true, timeScale: 2.2 / recockDuration });
        }
      } else {
        this.#playAction('06_BiBye_Travel_Ready', { loop: THREE.LoopRepeat });
      }
    }
    this.lastSmallBoltReady = Boolean(ballistaData.smallBoltReady);

    // B. Bolt and Catch Visibilities
    const mainBolt = this.nodes.get('Main_Siege_Bolt');
    if (mainBolt) {
      mainBolt.visible = Boolean(ballistaData.mainBoltLoaded) && mode !== BI_BYE_MODES.DESTROYED;
    }

    const upperBolt = this.nodes.get('Upper_Conditioning_Bolt');
    if (upperBolt) {
      upperBolt.visible = Boolean(ballistaData.smallBoltReady) && mode !== BI_BYE_MODES.DESTROYED;
    }

    // C. Advance Animation Mixer BEFORE applying runtime joint overrides
    // (Ensures mixer tracks do not clobber runtime wheel steering/roll or turret aiming)
    if (this.mixer) {
      this.mixer.update(dt);
    }

    // D. Articulate 6 wheels (Euler roll + steering)
    const wheels = [
      { node: this.nodes.get('Wheel_FL'), steer: frontSteerYaw },
      { node: this.nodes.get('Wheel_FR'), steer: frontSteerYaw },
      { node: this.nodes.get('Wheel_ML'), steer: midSteerYaw },
      { node: this.nodes.get('Wheel_MR'), steer: midSteerYaw },
      { node: this.nodes.get('Wheel_RL'), steer: rearSteerYaw },
      { node: this.nodes.get('Wheel_RR'), steer: rearSteerYaw },
    ];

    for (const { node, steer } of wheels) {
      if (node) {
        // Euler 'YXZ': steer around local Y, roll around local X
        node.rotation.set(this.wheelRoll, steer, 0, 'YXZ');
      }
    }

    // E. Turret Articulation (Traverse_Mount, Elevation_Cradle, Upper_Turret_Mount)
    const traverseMount = this.nodes.get('Traverse_Mount');
    const elevationCradle = this.nodes.get('Elevation_Cradle');
    const upperTurretMount = this.nodes.get('Upper_Turret_Mount');

    const heading = ballistaData.heading ?? 0;
    const aimYaw = ballistaData.yaw ?? heading;
    const aimPitch = ballistaData.pitch ?? 0;

    // Relative yaw in [-PI, +PI]
    const relYaw = ((aimYaw - heading) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;

    if (mode === BI_BYE_MODES.DEPLOYED || mode === BI_BYE_MODES.DEPLOYING || mode === BI_BYE_MODES.RETRACTING) {
      // Deployed mode: Traverse_Mount rotates around Y (clamped to +/-25 deg = +/-0.436332 rad)
      const clampedTraverse = Math.max(-0.436332, Math.min(0.436332, relYaw));
      if (traverseMount) {
        traverseMount.rotation.set(0, clampedTraverse, 0);
      }

      // Elevation_Cradle: pitch UP corresponds to negative rotation around local X
      // (clamped to [-8, +12] deg = [-0.139626, +0.209440] rad)
      const clampedPitch = Math.max(-0.139626, Math.min(0.209440, aimPitch));
      if (elevationCradle) {
        elevationCradle.rotation.set(-clampedPitch, 0, 0);
      }

      // Upper_Turret_Mount rests at (0, 0, 0) and fires in unison with the cradle
      if (upperTurretMount) {
        upperTurretMount.rotation.set(0, 0, 0);
      }
    } else if (mode === BI_BYE_MODES.MOBILE) {
      // Mobile mode: Traverse_Mount and Elevation_Cradle remain locked at 0
      if (traverseMount) traverseMount.rotation.set(0, 0, 0);
      if (elevationCradle) elevationCradle.rotation.set(0, 0, 0);

      // Upper launcher aims independently:
      // traverse yaw clamped to +/-35 deg (+/-0.610865 rad)
      // pitch clamped to [-10, +15] deg ([-0.174533, +0.261799] rad)
      const clampedUpperYaw = Math.max(-0.610865, Math.min(0.610865, relYaw));
      const clampedUpperPitch = Math.max(-0.174533, Math.min(0.261799, aimPitch));
      if (upperTurretMount) {
        upperTurretMount.rotation.set(-clampedUpperPitch, clampedUpperYaw, 0, 'YXZ');
      }
    }
  }

  #playAction(name, { loop = THREE.LoopRepeat, clamp = false, timeScale = 1.0 } = {}) {
    const nextAction = this.actions.get(name);
    if (!nextAction) return;

    nextAction.timeScale = timeScale;

    if (this.activeActionName === name && this.activeBaseAction?.isRunning()) {
      return;
    }

    nextAction.setLoop(loop);
    nextAction.clampWhenFinished = clamp;
    nextAction.reset();

    if (this.activeBaseAction && this.activeBaseAction !== nextAction) {
      nextAction.crossFadeFrom(this.activeBaseAction, 0.2, true);
    }

    nextAction.play();
    this.activeBaseAction = nextAction;
    this.activeActionName = name;
  }

  getMuzzleWorldPosition(subKind, outVec = new THREE.Vector3()) {
    const node = subKind === 'conditioning' ? this.nodes.get('small_bolt_muzzle') : this.nodes.get('main_bolt_muzzle');
    if (node) {
      node.getWorldPosition(outVec);
      return outVec;
    }
    return null;
  }

  getMuzzleWorldDirection(subKind, outVec = new THREE.Vector3()) {
    const node = subKind === 'conditioning' ? this.nodes.get('small_bolt_muzzle') : this.nodes.get('main_bolt_muzzle');
    if (node) {
      node.getWorldDirection(outVec);
      return outVec;
    }
    return null;
  }

  getOperatorStationWorldPosition(outVec = new THREE.Vector3()) {
    const node = this.nodes.get('operator_station');
    if (node) {
      node.getWorldPosition(outVec);
      return outVec;
    }
    return null;
  }

  #updateFallbackModel(timeSec, ballistaData, frontSteerYaw, midSteerYaw, rearSteerYaw) {
    if (this.fallbackWheels) {
      const steers = [frontSteerYaw, frontSteerYaw, midSteerYaw, midSteerYaw, rearSteerYaw, rearSteerYaw];
      this.fallbackWheels.forEach((w, i) => {
        w.rotation.set(this.wheelRoll, steers[i] ?? 0, 0, 'YXZ');
      });
    }

    if (this.fallbackStabilizers) {
      const deployed = ballistaData.mode === BI_BYE_MODES.DEPLOYED;
      for (const stab of this.fallbackStabilizers) {
        stab.rotation.z = deployed ? 0 : 0.8;
      }
    }
  }

  #updateProjectiles(projectilesData = []) {
    const liveIds = new Set();

    for (const proj of (projectilesData ?? [])) {
      liveIds.add(proj.id);
      let mesh = this.projectileMeshes.get(proj.id);

      if (!mesh) {
        mesh = this.#createProjectileMesh(proj.subKind);
        this.scene.add(mesh);
        this.projectileMeshes.set(proj.id, mesh);
      }

      mesh.position.set(proj.position.x, proj.position.y, proj.position.z);

      const vx = proj.velocity.x;
      const vy = proj.velocity.y;
      const vz = proj.velocity.z;
      const len = Math.hypot(vx, vy, vz);
      if (len > 0.1) {
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(vx / len, vy / len, vz / len)
        );
      }
    }

    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!liveIds.has(id)) {
        this.scene.remove(mesh);
        this.#disposeGroup(mesh);
        this.projectileMeshes.delete(id);
      }
    }
  }

  #createProjectileMesh(subKind) {
    const group = new THREE.Group();

    if (subKind === 'conditioning') {
      // Stage I Enchanted Frost Conditioning Bolt
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), this.materials.steel);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), this.materials.arcaneCyan);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.75;
      group.add(tip);

      const light = everywhere(new THREE.PointLight(0x22ccff, 1.5, 4.5));
      light.position.z = 0.5;
      group.add(light);
    } else {
      // Stage II Heavy Forged Siege Bolt
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.1, 8), this.materials.timberDark);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 8), this.materials.steel);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 1.3;
      group.add(tip);

      for (let a = 0; a < 4; a++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.38), this.materials.boltFeather);
        fin.position.z = -0.85;
        fin.rotation.z = (a * Math.PI) / 2;
        group.add(fin);
      }
    }

    return group;
  }

  #disposeGroup(group) {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
  }

  dispose() {
    this.scene.remove(this.group);
    this.#disposeGroup(this.group);

    for (const mesh of this.projectileMeshes.values()) {
      this.scene.remove(mesh);
      this.#disposeGroup(mesh);
    }
    this.projectileMeshes.clear();

    for (const mat of Object.values(this.materials)) {
      mat.dispose();
    }

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.authoredModel);
      this.mixer = null;
    }
  }
}
