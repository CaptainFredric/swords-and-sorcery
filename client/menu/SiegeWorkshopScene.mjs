import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appUrl } from '../appUrl.mjs';

export const WORKSHOP_POSITION = Object.freeze([7.5, 0, 5.0]);

// Asset paths for canonical lightweight machine previews
const MACHINE_ASSETS = Object.freeze({
  soFist: '/client/assets/props/so-fist-ication/so-fist-ication-v2_7.glb',
  biBye: '/client/assets/props/bibye-ballista/bi-bye-llista-v4.3.glb',
  fightFlight: '/client/assets/props/fight-and-flight/fight-and-flight-v30-sim19p5-dash.glb',
});

export class SiegeWorkshopScene {
  constructor(parentScene) {
    this.parentScene = parentScene;
    this.root = new THREE.Group();
    this.root.name = 'SiegeWorkshop';
    this.root.position.set(...WORKSHOP_POSITION);
    this.root.visible = false;
    this.parentScene.add(this.root);

    this.activeMachineId = 'soFist';
    this.machinePivot = new THREE.Group();
    this.machinePivot.name = 'MachinePivot';
    this.root.add(this.machinePivot);

    this.currentYaw = 0;
    this.targetYaw = 0;
    this.currentPitch = 0;
    this.targetPitch = 0;

    this.cache = new Map();
    this.inFlight = new Map();
    this.mixers = new Map();
    this.loader = new GLTFLoader();

    this.#buildEnvironment();
    this.#initFallbacks();
    this.selectMachine('soFist');
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
  }

  #buildEnvironment() {
    const env = new THREE.Group();
    env.name = 'WorkshopDecor';

    // Materials matching Castleward's stone and timber palette
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 0.88, metalness: 0.1 });
    const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x3d3732, roughness: 0.92 });
    const timberMat = new THREE.MeshStandardMaterial({ color: 0x513a26, roughness: 0.82 });
    const timberDarkMat = new THREE.MeshStandardMaterial({ color: 0x382618, roughness: 0.85 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.5, metalness: 0.75 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xb59b58, roughness: 0.4, metalness: 0.8 });
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xff6622 });

    // 1. Ground apron (paved stone flagstones for the workshop)
    const apronGeo = new THREE.BoxGeometry(8, 0.15, 8);
    const apron = new THREE.Mesh(apronGeo, stoneMat);
    apron.position.set(0, -0.075, 0);
    apron.receiveShadow = true;
    env.add(apron);

    // Flagstone grid accents
    for (let x = -3; x <= 3; x += 2) {
      const lineGeo = new THREE.BoxGeometry(0.04, 0.16, 7.6);
      const line = new THREE.Mesh(lineGeo, stoneDarkMat);
      line.position.set(x, -0.07, 0);
      env.add(line);
    }

    // 2. Back stone wall
    const backWallGeo = new THREE.BoxGeometry(8.4, 4.2, 0.6);
    const backWall = new THREE.Mesh(backWallGeo, stoneMat);
    backWall.position.set(0, 2.1, 4.0);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    env.add(backWall);

    // Left flank stone wall
    const flankWallGeo = new THREE.BoxGeometry(0.6, 3.8, 5.0);
    const flankWall = new THREE.Mesh(flankWallGeo, stoneMat);
    flankWall.position.set(-4.0, 1.9, 1.5);
    flankWall.castShadow = true;
    flankWall.receiveShadow = true;
    env.add(flankWall);

    // 3. Timber workshop shelter: heavy timber posts and lintels
    const postGeo = new THREE.BoxGeometry(0.3, 3.6, 0.3);
    const posts = [
      [-3.6, 1.8, -3.6],
      [3.6, 1.8, -3.6],
      [-3.6, 1.8, 3.6],
      [3.6, 1.8, 3.6],
    ];
    for (const [px, py, pz] of posts) {
      const post = new THREE.Mesh(postGeo, timberMat);
      post.position.set(px, py, pz);
      post.castShadow = true;
      post.receiveShadow = true;
      env.add(post);

      // Iron bracket caps
      const bracketGeo = new THREE.BoxGeometry(0.34, 0.1, 0.34);
      const bracket = new THREE.Mesh(bracketGeo, ironMat);
      bracket.position.set(px, 3.4, pz);
      env.add(bracket);
    }

    // Crossbeams
    const beamFrontGeo = new THREE.BoxGeometry(7.5, 0.28, 0.28);
    const beamFront = new THREE.Mesh(beamFrontGeo, timberDarkMat);
    beamFront.position.set(0, 3.5, -3.6);
    beamFront.castShadow = true;
    env.add(beamFront);

    const beamBackGeo = new THREE.BoxGeometry(7.5, 0.28, 0.28);
    const beamBack = new THREE.Mesh(beamBackGeo, timberDarkMat);
    beamBack.position.set(0, 3.5, 3.6);
    beamBack.castShadow = true;
    env.add(beamBack);

    // Rafters sloping slightly
    for (let rx = -3; rx <= 3; rx += 1.5) {
      const rafterGeo = new THREE.BoxGeometry(0.18, 0.18, 7.4);
      const rafter = new THREE.Mesh(rafterGeo, timberMat);
      rafter.position.set(rx, 3.65, 0);
      rafter.castShadow = true;
      env.add(rafter);
    }

    // 4. Engineering workbench & tools (left side)
    const benchTopGeo = new THREE.BoxGeometry(1.6, 0.12, 0.8);
    const benchTop = new THREE.Mesh(benchTopGeo, timberMat);
    benchTop.position.set(-3.0, 0.85, 2.2);
    benchTop.castShadow = true;
    benchTop.receiveShadow = true;
    env.add(benchTop);

    const benchLegGeo = new THREE.BoxGeometry(0.12, 0.85, 0.12);
    for (const [lx, lz] of [[-3.6, 1.9], [-2.4, 1.9], [-3.6, 2.5], [-2.4, 2.5]]) {
      const leg = new THREE.Mesh(benchLegGeo, timberDarkMat);
      leg.position.set(lx, 0.425, lz);
      leg.castShadow = true;
      env.add(leg);
    }

    // Brass calipers / drafting instruments on the bench
    const caliperGeo = new THREE.BoxGeometry(0.35, 0.03, 0.15);
    const caliper = new THREE.Mesh(caliperGeo, brassMat);
    caliper.position.set(-3.1, 0.93, 2.2);
    env.add(caliper);

    // 5. Forging anvil & hearth (left-rear)
    const anvilBaseGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.55, 8);
    const anvilBase = new THREE.Mesh(anvilBaseGeo, timberDarkMat);
    anvilBase.position.set(-3.2, 0.275, 0.4);
    anvilBase.castShadow = true;
    env.add(anvilBase);

    const anvilTopGeo = new THREE.BoxGeometry(0.55, 0.22, 0.26);
    const anvilTop = new THREE.Mesh(anvilTopGeo, ironMat);
    anvilTop.position.set(-3.2, 0.65, 0.4);
    anvilTop.castShadow = true;
    env.add(anvilTop);

    // Small forge furnace with embers
    const forgeHearthGeo = new THREE.BoxGeometry(1.1, 0.75, 0.9);
    const forgeHearth = new THREE.Mesh(forgeHearthGeo, stoneDarkMat);
    forgeHearth.position.set(-3.3, 0.375, -1.5);
    forgeHearth.castShadow = true;
    forgeHearth.receiveShadow = true;
    env.add(forgeHearth);

    const embersGeo = new THREE.BoxGeometry(0.65, 0.08, 0.5);
    const embers = new THREE.Mesh(embersGeo, emberMat);
    embers.position.set(-3.3, 0.78, -1.5);
    env.add(embers);

    // Warm forge point light
    const forgeLight = new THREE.PointLight(0xff6622, 1.4, 5.5);
    forgeLight.position.set(-3.3, 1.1, -1.5);
    env.add(forgeLight);

    // 6. Stacked ammunition crates and barrels (right-rear)
    const crateGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const crate1 = new THREE.Mesh(crateGeo, timberDarkMat);
    crate1.position.set(3.1, 0.35, 2.5);
    crate1.castShadow = true;
    env.add(crate1);

    const crate2 = new THREE.Mesh(crateGeo, timberDarkMat);
    crate2.position.set(3.1, 0.35, 1.6);
    crate2.castShadow = true;
    env.add(crate2);

    const crate3 = new THREE.Mesh(crateGeo, timberDarkMat);
    crate3.position.set(3.1, 1.05, 2.05);
    crate3.castShadow = true;
    env.add(crate3);

    // Spare carriage wheel leaning against post
    const wheelTireGeo = new THREE.TorusGeometry(0.52, 0.06, 8, 20);
    const wheelHubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8);
    const spareWheel = new THREE.Group();
    spareWheel.add(new THREE.Mesh(wheelTireGeo, ironMat));
    spareWheel.add(new THREE.Mesh(wheelHubGeo, brassMat));
    spareWheel.rotation.x = Math.PI / 2;
    spareWheel.rotation.y = 0.25;
    spareWheel.position.set(3.3, 0.52, -1.8);
    spareWheel.castShadow = true;
    env.add(spareWheel);

    // Leaning iron axle
    const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8);
    const axle = new THREE.Mesh(axleGeo, ironMat);
    axle.rotation.z = 0.28;
    axle.position.set(3.4, 0.85, -1.2);
    axle.castShadow = true;
    env.add(axle);

    // Hanging lantern
    const lanternGeo = new THREE.BoxGeometry(0.2, 0.3, 0.2);
    const lantern = new THREE.Mesh(lanternGeo, brassMat);
    lantern.position.set(0, 3.2, -3.4);
    env.add(lantern);

    const lanternLight = new THREE.PointLight(0xffdd88, 1.1, 6.0);
    lanternLight.position.set(0, 3.0, -3.4);
    env.add(lanternLight);

    this.root.add(env);
  }

  #initFallbacks() {
    this.fallbacks = new Map();

    const steelMat = new THREE.MeshStandardMaterial({ color: 0x5a636a, roughness: 0.45, metalness: 0.7 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xaa8c4f, roughness: 0.38, metalness: 0.8 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x30363a, roughness: 0.6, metalness: 0.6 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e3825, roughness: 0.85 });

    // Fallback 1: SO-FIST-ICATION (Elevating ram carriage with piston & gauntlet)
    const soFistFallback = new THREE.Group();
    soFistFallback.name = 'SoFist_Fallback';
    // Carriage chassis
    const chassisGeo = new THREE.BoxGeometry(1.6, 0.45, 2.6);
    const chassis = new THREE.Mesh(chassisGeo, ironMat);
    chassis.position.set(0, 0.55, 0);
    chassis.castShadow = true;
    soFistFallback.add(chassis);
    // 4 Heavy wheels
    for (const [wx, wz] of [[-0.95, -0.9], [0.95, -0.9], [-0.95, 0.9], [0.95, 0.9]]) {
      const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 16);
      const wheel = new THREE.Mesh(wheelGeo, steelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.42, wz);
      wheel.castShadow = true;
      soFistFallback.add(wheel);
    }
    // Elevating hydraulic arm & cylinder
    const cylinderGeo = new THREE.CylinderGeometry(0.18, 0.2, 1.8, 12);
    const cylinder = new THREE.Mesh(cylinderGeo, brassMat);
    cylinder.rotation.x = Math.PI / 3;
    cylinder.position.set(0, 1.15, -0.2);
    cylinder.castShadow = true;
    soFistFallback.add(cylinder);
    // Piston rod
    const pistonGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 12);
    const piston = new THREE.Mesh(pistonGeo, steelMat);
    piston.rotation.x = Math.PI / 3;
    piston.position.set(0, 1.7, -0.5);
    piston.castShadow = true;
    soFistFallback.add(piston);
    // Heavy Armored Fist
    const fistGeo = new THREE.BoxGeometry(0.65, 0.55, 0.85);
    const fist = new THREE.Mesh(fistGeo, ironMat);
    fist.position.set(0, 2.2, -0.8);
    fist.castShadow = true;
    soFistFallback.add(fist);
    // Brass knuckle plates
    const knuckleGeo = new THREE.BoxGeometry(0.68, 0.18, 0.2);
    const knuckles = new THREE.Mesh(knuckleGeo, brassMat);
    knuckles.position.set(0, 2.35, -1.15);
    soFistFallback.add(knuckles);

    soFistFallback.userData = { isAuthored: false, machineId: 'soFist' };
    this.fallbacks.set('soFist', soFistFallback);

    // Fallback 2: BI-BYE-LLISTA (Twin-bolt mobile carriage)
    const biByeFallback = new THREE.Group();
    biByeFallback.name = 'BiBye_Fallback';
    // Carriage
    const biChassisGeo = new THREE.BoxGeometry(1.4, 0.38, 2.8);
    const biChassis = new THREE.Mesh(biChassisGeo, woodMat);
    biChassis.position.set(0, 0.52, 0);
    biChassis.castShadow = true;
    biByeFallback.add(biChassis);
    // 6 carriage wheels
    for (const [wx, wz] of [[-0.85, -0.9], [0.85, -0.9], [-0.85, 0], [0.85, 0], [-0.85, 0.9], [0.85, 0.9]]) {
      const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.18, 16);
      const wheel = new THREE.Mesh(wheelGeo, woodMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.38, wz);
      wheel.castShadow = true;
      biByeFallback.add(wheel);
    }
    // Dual outriggers
    for (const sx of [-1.1, 1.1]) {
      const outriggerGeo = new THREE.BoxGeometry(0.4, 0.15, 1.6);
      const outrigger = new THREE.Mesh(outriggerGeo, ironMat);
      outrigger.position.set(sx, 0.3, 0);
      biByeFallback.add(outrigger);
    }
    // Ballista bow assembly & rail
    const railGeo = new THREE.BoxGeometry(0.3, 0.25, 2.4);
    const rail = new THREE.Mesh(railGeo, steelMat);
    rail.position.set(0, 1.05, -0.2);
    rail.castShadow = true;
    biByeFallback.add(rail);
    // Bow limbs (curved steel)
    const bowGeo = new THREE.BoxGeometry(2.4, 0.12, 0.2);
    const bow = new THREE.Mesh(bowGeo, steelMat);
    bow.position.set(0, 1.08, -1.2);
    bow.castShadow = true;
    biByeFallback.add(bow);
    // Two loaded bolts
    const bolt1Geo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
    const bolt1 = new THREE.Mesh(bolt1Geo, brassMat);
    bolt1.rotation.x = Math.PI / 2;
    bolt1.position.set(-0.08, 1.15, -0.3);
    biByeFallback.add(bolt1);
    const bolt2 = new THREE.Mesh(bolt1Geo, steelMat);
    bolt2.rotation.x = Math.PI / 2;
    bolt2.position.set(0.08, 1.15, -0.3);
    biByeFallback.add(bolt2);

    biByeFallback.userData = { isAuthored: false, machineId: 'biBye' };
    this.fallbacks.set('biBye', biByeFallback);

    // Fallback 3: FIGHT-AND-FLIGHT (Wearable harness, repeater, twin-sword rotor)
    const flightFallback = new THREE.Group();
    flightFallback.name = 'Flight_Fallback';
    // Stand/mount
    const standGeo = new THREE.CylinderGeometry(0.08, 0.3, 0.8, 8);
    const stand = new THREE.Mesh(standGeo, ironMat);
    stand.position.set(0, 0.4, 0);
    flightFallback.add(stand);
    // Wearable cockpit harness
    const harnessGeo = new THREE.BoxGeometry(0.65, 0.9, 0.55);
    const harness = new THREE.Mesh(harnessGeo, ironMat);
    harness.position.set(0, 1.1, 0);
    harness.castShadow = true;
    flightFallback.add(harness);
    // Crossbow repeater assembly
    const repeaterGeo = new THREE.BoxGeometry(0.35, 0.25, 1.1);
    const repeater = new THREE.Mesh(repeaterGeo, brassMat);
    repeater.position.set(0.35, 1.05, -0.4);
    repeater.castShadow = true;
    flightFallback.add(repeater);
    // Central rotor mast
    const mastGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8);
    const mast = new THREE.Mesh(mastGeo, steelMat);
    mast.position.set(0, 1.8, 0);
    flightFallback.add(mast);
    // Twin sword blades as rotor
    const rotorBladeGeo = new THREE.BoxGeometry(2.8, 0.04, 0.18);
    const rotorBlade1 = new THREE.Mesh(rotorBladeGeo, steelMat);
    rotorBlade1.position.set(0, 2.15, 0);
    rotorBlade1.castShadow = true;
    flightFallback.add(rotorBlade1);
    const rotorBlade2 = new THREE.Mesh(rotorBladeGeo, steelMat);
    rotorBlade2.position.set(0, 2.22, 0);
    rotorBlade2.rotation.y = Math.PI / 2;
    rotorBlade2.castShadow = true;
    flightFallback.add(rotorBlade2);

    flightFallback.userData = { isAuthored: false, machineId: 'fightFlight' };
    this.fallbacks.set('fightFlight', flightFallback);
  }

  selectMachine(id) {
    if (!['soFist', 'biBye', 'fightFlight'].includes(id)) return;
    this.activeMachineId = id;

    // Clear existing model from pivot
    while (this.machinePivot.children.length > 0) {
      this.machinePivot.remove(this.machinePivot.children[0]);
    }

    // Attach cached GLTF if available, or fallback
    const cached = this.cache.get(id);
    if (cached) {
      this.machinePivot.add(cached);
    } else {
      const fallback = this.fallbacks.get(id);
      if (fallback) this.machinePivot.add(fallback);
      this.#loadAuthored(id);
    }

    // Adjust position/scale offsets per machine proportions
    if (id === 'soFist') {
      this.machinePivot.position.set(0, 0, 0);
      this.machinePivot.scale.setScalar(0.92);
    } else if (id === 'biBye') {
      this.machinePivot.position.set(0, 0, 0);
      this.machinePivot.scale.setScalar(0.95);
    } else if (id === 'fightFlight') {
      this.machinePivot.position.set(0, 0.35, 0);
      this.machinePivot.scale.setScalar(1.0);
    }
  }

  #loadAuthored(id) {
    const assetPath = MACHINE_ASSETS[id];
    if (!assetPath) return;

    this.loader.load(
      appUrl(assetPath),
      (gltf) => {
        const model = gltf.scene;
        model.name = `Authored_${id}`;

        // Configure shadows and PBR properties
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              child.material.envMapIntensity = 0.8;
            }
          }
        });

        // Setup subtle idle animation if present
        if (gltf.animations?.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          const idleClip = gltf.animations.find((c) => /idle|travel/i.test(c.name)) || gltf.animations[0];
          if (idleClip) mixer.clipAction(idleClip).play();
          this.mixers.set(id, mixer);
        }

        this.cache.set(id, model);

        // If still active machine, swap out fallback
        if (this.activeMachineId === id) {
          while (this.machinePivot.children.length > 0) {
            this.machinePivot.remove(this.machinePivot.children[0]);
          }
          this.machinePivot.add(model);
        }
      },
      undefined,
      (err) => {
        // Fallback remains active seamlessly
        console.warn(`SiegeWorkshop: GLTF asset load error for ${id}; procedural model active`, err);
      }
    );
  }

  rotate(deltaYaw, deltaPitch = 0) {
    this.targetYaw += deltaYaw;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + deltaPitch, -0.15, 0.15);
  }

  resetRotation() {
    this.targetYaw = 0;
    this.targetPitch = 0;
  }

  update(dt) {
    // Smooth damp towards target rotation
    this.currentYaw += (this.targetYaw - this.currentYaw) * Math.min(1, dt * 10);
    this.currentPitch += (this.targetPitch - this.currentPitch) * Math.min(1, dt * 10);

    this.machinePivot.rotation.y = this.currentYaw;
    this.machinePivot.rotation.x = this.currentPitch;

    // Update active animation mixer
    const mixer = this.mixers.get(this.activeMachineId);
    if (mixer) mixer.update(dt);
  }

  dispose() {
    this.root.removeFromParent();
    for (const model of this.cache.values()) {
      model.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose?.());
          else child.material?.dispose?.();
        }
      });
    }
    this.cache.clear();
    this.mixers.clear();
  }
}
