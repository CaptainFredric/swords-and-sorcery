import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appUrl } from '../appUrl.mjs';
import { createSpellbladeAsset } from '../game/SpellbladeAssets.mjs';
import { SO_FIST_SCALE } from '../../shared/sim/soFistGeometry.mjs';
import { SiegeWorkshopPerformance } from './SiegeWorkshopPerformance.mjs';
import { FLIGHT_CLIPS } from '../worlds/flightAnimationState.mjs';

export const WORKSHOP_POSITION = Object.freeze([14.0, 0, 0.0]);

// Asset paths for canonical lightweight machine previews
const MACHINE_ASSETS = Object.freeze({
  soFist: '/client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb',
  biBye: '/client/assets/props/bibye-ballista/bi-bye-llista-v4.3.glb',
  fightFlight: '/client/assets/props/fight-and-flight/fight-and-flight-v30-sim19p5-dash.glb',
});

// Match gameplay's native transforms. The two metre-based GLBs use unit scale.
// This is the original, SHA-verified Argon donor, reassembled before static
// publishing. Keep the functional hydraulic rig; transfer only articulated
// finger meshes and donor-hand animation tracks, exactly as in gameplay.
const SO_FIST_ARGON_V26='/client/assets/props/so-fist-ication/so-fist-ication-v26.glb?v=6800db7a9dd1bfa6';
const ARGON_HAND_TRACK=/^(?:Armored_Fist|Wrist_Resonator_Ring|Index_[123]|Middle_[123]|Ring_[123]|Pinky_[123]|Thumb_[123]|Palm_Capture_Gate|Secret_Palm_Hatch_[LR]|Rear_Egress_Hatch_[LR])\./;
function graftWorkshopArgonHand(base,donor){
 const target=base.scene.getObjectByName('Armored_Fist');
 const hand=donor.scene.getObjectByName('Armored_Fist');
 const fingers=['Index_1','Index_2','Index_3','Middle_1','Middle_2','Middle_3',
   'Ring_1','Ring_2','Ring_3','Pinky_1','Pinky_2','Pinky_3',
   'Thumb_1','Thumb_2','Thumb_3'];
 const missing=fingers.filter(name=>!hand?.getObjectByName(name));
 const extra=donor.animations.filter(a=>/^(1[1-9]|2[0-6])_/.test(a.name));
 if(!target||!hand||missing.length||extra.length!==16)
   throw Error('Incomplete Argon v26 donor: missing '+missing.join(',')+', clips '+extra.length);
 if(target.isMesh&&hand.isMesh){
  target.geometry=hand.geometry;target.material=hand.material;
 }else if(hand.isMesh){
  for(const old of [...target.children])
   if(old.isMesh&&old.name.startsWith('Armored_Fist_'))old.visible=false;
  const surface=new THREE.Mesh(hand.geometry,hand.material);
  surface.name='Argon_Articulated_Hand_Surface';target.add(surface);
 }
 for(const part of [...hand.children])target.add(part);
 // Donor carriages do NOT have the production hydraulic pivots. Their tracks
 // must never animate the base, wheels, piston, driver or independent lift.
 const handClips=extra.map(clip=>new THREE.AnimationClip(clip.name,clip.duration,
   clip.tracks.filter(track=>ARGON_HAND_TRACK.test(track.name))));
 for(const clip of handClips)
  if(!clip.tracks.length)throw Error('Argon hand clip has no bound tracks: '+clip.name);
 base.animations.push(...handClips);
 return handClips;
}

const AUTHORED_SCALE = { soFist: SO_FIST_SCALE, biBye: 1, fightFlight: 1 };
const REST_YAW = { soFist: Math.PI - .28, biBye: 0, fightFlight: 0 };
const IDLE_CLIP = { biBye: '01_BiBye_LoadedIdle', fightFlight: 'Posture_01_Grounded_Idle' };
const BOUNDS_CLIPS = {
  soFist: ['01_Ram_Strike_Full_Cycle'],
  biBye: ['05_BiBye_Stabilizer_Deploy', '02_BiBye_TwoStage_Fire'],
  fightFlight: ['Rotor_Spin_Cycle_1Rev'],
};

function motionBounds(model, clips, names) {
  const bounds = new THREE.Box3().setFromObject(model);
  const mixer = new THREE.AnimationMixer(model);
  for (const name of names) {
    const clip = clips.find(candidate => candidate.name === name);
    if (!clip) continue;
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (let sample = 0; sample <= 12; sample++) {
      mixer.setTime(clip.duration * sample / 12);
      bounds.union(new THREE.Box3().setFromObject(model));
    }
    action.stop();
  }
  mixer.uncacheRoot(model);
  return bounds;
}

export class SiegeWorkshopScene {
  constructor(parentScene) {
    this.parentScene = parentScene;
    this.root = new THREE.Group();
    this.root.name = 'SiegeWorkshop';
    this.root.position.set(...WORKSHOP_POSITION);
    // The yard terrain is at y=0. Keep the apron and its supported preview
    // above that surface so the two depth buffers never compete.
    this.root.position.y += 0.035;
    this.root.visible = false;
    this.parentScene.add(this.root);

    this.activeMachineId = 'soFist';
    // The turntable is for INSPECTION only: the complete staged tableau
    // (machine, opponents, projectiles, impact cues) rotates rigidly together.
    // Skill-specific translation, pitch and articulated GLB clips stay below it.
    this.inspectionPivot = new THREE.Group();
    this.inspectionPivot.name = 'WorkshopInspectionPivot';
    this.root.add(this.inspectionPivot);
    this.machinePivot = new THREE.Group();
    this.machinePivot.name = 'MachinePivot';
    this.knightBounds = new THREE.Box3();
    this.clock = 0;
    this.inspectionPivot.add(this.machinePivot);

    this.currentYaw = REST_YAW.soFist;
    this.targetYaw = this.currentYaw;
    this.currentPitch = 0;
    this.targetPitch = 0;

    this.cache = new Map();
    this.inFlight = new Map();
    this.mixers = new Map();
    this.clips = new Map();
    this.previewAnimation = null;
    this.previewFist = null;
    this.previewClipWarnings = new Set();
    this.loader = new GLTFLoader();
    this.performance = new SiegeWorkshopPerformance(this);

    this.#buildEnvironment();
    this.#initFallbacks();
    this.selectMachine('soFist');
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
    if (!visible) this.stopPreview();
    if (visible && !this.knight && !this.knightLoading) {
      this.knightLoading = createSpellbladeAsset({kind:'thirdPerson'}).then(instance => {
        if (!instance) return;
        if (this.disposed) { instance.dispose(); return; }
        this.knight = instance;
        this.root.add(instance.root);
        instance.root.rotation.y = -.52;
        instance.setCloth('crimson');
        instance.setEmblem('grimoirelee');
        instance.root.traverse(node => { if (node.isMesh) node.castShadow = true; });
        this.#placeKnight();
      }).catch(error => console.warn('Siege Workshop comparison knight unavailable', error));
    }
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
    // Extended demonstration apron: reverse drives and aerial runs need
    // genuine clearance beyond the small resting machine shelter.
    const apronGeo = new THREE.BoxGeometry(13, 0.15, 18);
    const apron = new THREE.Mesh(apronGeo, stoneMat);
    apron.position.set(0, -0.075, -2.5);
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
    const beamBackGeo = new THREE.BoxGeometry(7.5, 0.28, 0.28);
    const beamBack = new THREE.Mesh(beamBackGeo, timberDarkMat);
    beamBack.position.set(0, 3.5, 3.6);
    beamBack.castShadow = true;
    env.add(beamBack);

    // Rafters sloping slightly
    for (let rx = -3; rx <= 3; rx += 1.5) {
      const rafterGeo = new THREE.BoxGeometry(0.18, 0.18, 2.6);
      const rafter = new THREE.Mesh(rafterGeo, timberMat);
      rafter.position.set(rx, 3.65, 2.3);
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
    spareWheel.rotation.x = .16;
    spareWheel.rotation.y = 0.25;
    spareWheel.position.set(-3.4, 0.57, 3.4);
    spareWheel.castShadow = true;
    env.add(spareWheel);

    // Leaning iron axle
    const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8);
    const axle = new THREE.Mesh(axleGeo, ironMat);
    axle.rotation.z = 0.28;
    axle.position.set(-3.6, 0.85, 2.95);
    axle.castShadow = true;
    env.add(axle);

    // Hanging lantern
    const lanternGeo = new THREE.BoxGeometry(0.2, 0.3, 0.2);
    const lantern = new THREE.Mesh(lanternGeo, brassMat);
    lantern.position.set(-2.8, 3.2, 2.3);
    env.add(lantern);

    const lanternLight = new THREE.PointLight(0xffdd88, 1.1, 6.0);
    lanternLight.position.set(0, 3.0, -3.4);
    env.add(lanternLight);
    const openYardLight = new THREE.DirectionalLight(0xffebd3, 1.05);
    openYardLight.position.set(6, 5, -5);
    env.add(openYardLight, openYardLight.target);

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
    fist.name = 'Armored_Fist';
    fist.position.set(0, 2.2, -0.8);
    fist.castShadow = true;
    soFistFallback.add(fist);
    // Brass knuckle plates
    const knuckleGeo = new THREE.BoxGeometry(0.68, 0.18, 0.2);
    const knuckles = new THREE.Mesh(knuckleGeo, brassMat);
    knuckles.position.set(0, .15, -.35);
    fist.add(knuckles);

    soFistFallback.userData = { isAuthored: false, machineId: 'soFist', motionBounds: new THREE.Box3().setFromObject(soFistFallback) };
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

    biByeFallback.userData = { isAuthored: false, machineId: 'biBye', motionBounds: new THREE.Box3().setFromObject(biByeFallback) };
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

    flightFallback.userData = { isAuthored: false, machineId: 'fightFlight', motionBounds: new THREE.Box3().setFromObject(flightFallback) };
    this.fallbacks.set('fightFlight', flightFallback);
  }

  selectMachine(id) {
    if (!['soFist', 'biBye', 'fightFlight'].includes(id)) return;
    if (this.activeMachineId === id && this.machinePivot.children.length) return;
    this.stopPreview();
    this.activeMachineId = id;
    this.currentYaw = REST_YAW[id];
    this.resetRotation();

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
      this.loadAuthored(id);
    }

    this.machinePivot.position.y = 0;
    this.#placeKnight();
  }

  #placeKnight() {
    if (!this.knight) return;
    const bounds = this.machinePivot.children[0]?.userData.motionBounds;
    const reach = bounds ? Math.max(Math.hypot(bounds.min.x, bounds.min.z),
      Math.hypot(bounds.max.x, bounds.max.z)) : 1.6;
    const z = bounds ? (bounds.max.z + bounds.min.z) * .5 - .3 : 0;
    this.knight.root.position.set(reach + .55, 0, z);
    this.knight.root.updateWorldMatrix(true, true);
    // The animator establishes the held sword and cape's world transforms
    // before the first measurement. The bind pose can put them at the origin.
    this.knightBounds.makeEmpty();
  }

  presentationBounds() {
    const child = this.machinePivot.children[0];
    const modelBounds = child?.userData.motionBounds;
    this.machinePivot.updateWorldMatrix(true, false);
    // Yaw invariant filming bounds: inspect a rolling chassis, not a jumping
    // one. Rotating a rectangular box must not repeatedly re-fit the camera.
    const bounds=modelBounds ? (() => {
      const xx=Math.max(Math.abs(modelBounds.min.x),Math.abs(modelBounds.max.x));
      const zz=Math.max(Math.abs(modelBounds.min.z),Math.abs(modelBounds.max.z));
      const radius=Math.hypot(xx,zz);
      return new THREE.Box3(
        new THREE.Vector3(this.root.position.x-radius,this.root.position.y,this.root.position.z-radius),
        new THREE.Vector3(this.root.position.x+radius,this.root.position.y+modelBounds.max.y,this.root.position.z+radius));
    })() : new THREE.Box3().setFromObject(this.machinePivot);
    if(this.knight&&!this.performance.active)bounds.union(this.knightBounds);
    const demonstration=this.performance.bounds();
    if(demonstration)bounds.union(demonstration);
    if (bounds.isEmpty()) return null;
    return { min:bounds.min.toArray(), max:bounds.max.toArray() };
  }

  loadAuthored(id) {
    if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
    if (this.inFlight.has(id)) return this.inFlight.get(id);

    const assetPath = MACHINE_ASSETS[id];
    if (!assetPath) return Promise.resolve(null);

    const promise = new Promise((resolve) => {
      this.loader.load(
        appUrl(assetPath),
        async (gltf) => {
          if(id==='soFist'){
            try{
              const donor=await new Promise((resolveDonor,rejectDonor)=>
                this.loader.load(appUrl(SO_FIST_ARGON_V26),resolveDonor,undefined,rejectDonor));
              graftWorkshopArgonHand(gltf,donor);
              this.argonHandInstalled=true;
            }catch(error){
              this.argonHandInstalled=false;
              console.error('Siege Workshop: Argon v26 hand unavailable; no hand preview',error);
            }
          }
          if(this.disposed){this.inFlight.delete(id);resolve(null);return;}
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

          model.scale.setScalar(AUTHORED_SCALE[id]);
          const resting = new THREE.Box3().setFromObject(model);
          model.position.y -= resting.min.y;
          model.updateMatrixWorld(true);
          const box = motionBounds(model, gltf.animations, BOUNDS_CLIPS[id]);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          model.userData = {
            isAuthored: true, machineId: id, argonHand: id==='soFist'&&Boolean(this.argonHandInstalled), motionBounds: box,
            bounds: { size: { x: size.x, y: size.y, z: size.z }, center: center.toArray() },
          };
          this.clips.set(id,gltf.animations);
          const mixer=new THREE.AnimationMixer(model);
          const clip=gltf.animations.find(candidate=>candidate.name===IDLE_CLIP[id]);
          if(clip)mixer.clipAction(clip).play();
          this.mixers.set(id,mixer);

          this.cache.set(id, model);
          this.inFlight.delete(id);

          // If still active machine, swap out fallback
          if (this.activeMachineId === id) {
            while (this.machinePivot.children.length > 0) {
              this.machinePivot.remove(this.machinePivot.children[0]);
            }
            this.machinePivot.add(model);
            this.#placeKnight();
          }
          resolve(model);
        },
        undefined,
        (err) => {
          this.inFlight.delete(id);
          // Fallback remains active honestly
          console.warn(`SiegeWorkshop: GLTF asset load error for ${id}; procedural model active`, err);
          resolve(null);
        }
      );
    });

    this.inFlight.set(id, promise);
    return promise;
  }

  whenLoaded(id = this.activeMachineId) {
    if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
    if (this.inFlight.has(id)) return this.inFlight.get(id);
    return this.loadAuthored(id);
  }

  isDisplayingAuthored(id = this.activeMachineId) {
    const child = this.machinePivot.children[0];
    return Boolean(child?.userData?.isAuthored && child.userData.machineId === id);
  }

  getActiveModelStatus() {
    const child = this.machinePivot.children[0];
    return {
      id: this.activeMachineId,
      isAuthored: this.isDisplayingAuthored(),
      childName: child?.name ?? null,
      bounds: child?.userData?.bounds ?? null,
      scale: child?.scale.x ?? null,
      knight: Boolean(this.knight),
      hasMixer: this.mixers.has(this.activeMachineId),
      argonHand: Boolean(child?.userData?.argonHand),
    };
  }

  rotate(deltaYaw) {
    // Inspection changes the viewer's yaw, never ends a running demonstration.
    this.targetYaw+=deltaYaw;
  }

  resetRotation() {
    // Reset the inspection angle without restarting the demonstration.
    this.targetYaw=REST_YAW[this.activeMachineId];
    this.targetPitch=0;
    this.currentPitch=0;
  }

  playPreview(skill) {
    // Do not play a fictitious animation on the old fallback model. If a
    // player clicks before the 7 MB donor has finished loading, start the
    // requested demonstration as soon as its actual articulated rig arrives.
    if(this.activeMachineId==='soFist' &&
      (skill==='hellpingHand'||skill==='ramFingerFlick') &&
      !this.argonHandInstalled){
      this.whenLoaded('soFist').then(()=>{
        if(this.activeMachineId==='soFist'&&this.argonHandInstalled)
          this.playPreview(skill);
      });
      return false;
    }
    this.stopPreview();
    const started=this.performance.play(skill);
    if(started)this.previewAnimation=null;
    this.onPreviewChange?.(started?skill:null);
    return started;
  }

  stopPreview() {
    this.performance?.stop();
    this.#restorePreviewAnimation();
    this.#restoreFist();
    this.machinePivot.position.set(0,0,0);
    this.machinePivot.visible=true;
    this.machinePivot.rotation.x=0;
    this.onPreviewChange?.(null);
  }

  #restoreFist() {
    if(this.previewFist) {
      this.previewFist.node.position.copy(this.previewFist.rest);
      this.previewFist=null;
    }
  }

  #poseFist(pose) {
    if(!pose||this.activeMachineId!=='soFist')return;
    // Authored piston motion already belongs to the GLB. Applying the old
    // hand-written extension on top caused double travel and twisted joints.
    if(this.isDisplayingAuthored())return;
    const node=this.machinePivot.children[0]?.getObjectByName('Armored_Fist');
    if(!node)return;
    this.previewFist={node,rest:node.position.clone()};
    node.position.z-=3.2*pose.fist;
    node.position.x+=Math.sin(this.performance.time*55)*pose.shudder;
  }

  #restorePreviewAnimation() {
    if(this.previewAnimation) {
      const mixer=this.mixers.get(this.previewAnimation.machine);
      mixer?.stopAllAction();
      const id=this.previewAnimation.machine;
      const clips=this.clips.get(id)??[];
      const idle=clips.find(c=>c.name===IDLE_CLIP[id])
        ?? (id==='soFist'?clips.find(c=>c.name==='01_Ram_Strike_Full_Cycle'):null);
      if(idle&&mixer) {
        const action=mixer.clipAction(idle).reset().play();
        if(id==='soFist') {
          // This GLB does not carry a dedicated resting clip. Pose its actual
          // strike animation at the coupled, fully retracted starting frame.
          mixer.setTime(0);
          action.paused=true;
        }
      }
    }
    this.previewAnimation=null;
  }

  #samplePreviewAnimation(skill,time) {
    const id=this.activeMachineId;
    const clips=this.clips.get(id);
    const mixer=this.mixers.get(id);
    if(!mixer||!clips?.length)return;

    // Individual non-competing animation layers keep a rotor spinning while
    // the same authored chassis performs a Dash, a gun fires, or it crashes.
    const layers=[];
    if(id==='soFist') {
      const name='01_Ram_Strike_Full_Cycle';
      const clip=clips.find(c=>c.name===name);
      if(skill==='longArmToTheJaw')
        layers.push({name,age:clip?Math.min(clip.duration*.48,time*1.5):0});
      else if(skill==='beatToThePunch')
        layers.push({name,age:Math.max(0,time-2.1)});
      else if(skill==='ramFingerFlick')
        layers.push({name:'23_Finger_Flick_Single_Target_Strike',age:time});
      else if(skill==='hellpingHand'){
        // The exact Argon phases, in a readable theatrical succession.
        // This is the menu only: server gameplay remains state-authoritative.
        const segments=[
          [0,1,'11_HELLping_Hand_Open_Wide'],
          [1,2,'12_HELLping_Hand_Enemy_Capture_Close'],
          [2,6,'13_HELLping_Hand_Sustained_Crush_4s'],
          [6,7.2,'14_HELLping_Hand_Release_Or_Fist_Destroyed'],
          [7.2,8.6,'15_HELLping_Hand_Ally_Hatch_Open_Enter'],
          [8.6,9.8,'16_HELLping_Hand_Ally_Protected_Punch'],
          [9.8,10.9,'17_HELLping_Hand_Ally_Rear_Exit'],
          [10.9,12.5,'18_HELLping_Hand_Vault_AltA_TwoFinger_9Stages'],
          [12.5,14.1,'19_HELLping_Hand_Vault_AltB_MultiFinger_Claw_9Stages'],
          [14.1,15.3,'22_HELLping_Hand_Skill_Default_Open_Palm_Idle'],
        ];
        const segment=segments.find(([start,end])=>time>=start&&time<end)??segments.at(-1);
        layers.push({name:segment[2],age:Math.max(0,time-segment[0]),
          loop:segment[2].startsWith('22_')});
      }
    } else if(id==='biBye') {
      if(skill==='boltToTheOccasion')
        layers.push(time>=2.58
          ? {name:'09_BiBye_Mobile_Shot1_Fire_Upper',age:time-2.58}
          : {name:'21_BiBye_Delayed_Shot2_Release_And_Recoil',
            age:Math.max(0,time-1.27)});
      else if(skill==='coldHowTouching')
        layers.push({name:'09_BiBye_Mobile_Shot1_Fire_Upper',
          age:Math.max(0,time-.75)});
    } else if(id==='fightFlight' && time<6.6) {
      layers.push({name:'Rotor_Spin_Cycle_1Rev',age:time*4,loop:true});
      if(skill==='doNotStopMyAscension') {
        if(time>=5.55)
          layers.push({name:FLIGHT_CLIPS.terminal,age:time-5.55});
        else if(time<.8)
          layers.push({name:FLIGHT_CLIPS.entry,age:time});
        else
          layers.push({name:FLIGHT_CLIPS.sustain,age:time-.8,loop:true});
      } else if(skill==='narrowToOne') {
        layers.push(time<.75
          ? {name:FLIGHT_CLIPS.entry,age:time}
          : time<4.75
            ? {name:FLIGHT_CLIPS.sustain,age:time-.75,loop:true}
            : {name:FLIGHT_CLIPS.release,age:time-4.75});
        if(time>=1.05 && time<=4.62)
          layers.push({name:'Crossbow_Fire_Loop',age:time-1.05,loop:true});
      } else if(skill==='fireAwayRightHere') {
        layers.push(time<.7
          ? {name:'Posture_04_Takeoff_To_Flight',age:time}
          : time<2.45
            ? {name:'Posture_10_Ascending_Hover_Descending',
              age:time-.7,loop:true}
            : {name:FLIGHT_CLIPS.idle,age:0,loop:true});
        if(time>=2.65 && time<=6.9)
          layers.push({name:'Crossbow_Fire_Loop',age:time-2.65,loop:true});
      }
    }
    if(this.previewAnimation?.machine!==id) {
      mixer.stopAllAction();
      this.previewAnimation={machine:id,layers:new Map()};
    }
    const active=new Set();
    for(const layer of layers) {
      const clip=clips.find(c=>c.name===layer.name);
      if(!clip){
        if(!this.previewClipWarnings.has(id+':'+layer.name)){
          this.previewClipWarnings.add(id+':'+layer.name);
          console.warn('Siege Workshop: missing authored animation clip',id,layer.name);
        }
        continue;
      }
      active.add(layer.name);
      let action=this.previewAnimation.layers.get(layer.name);
      if(!action){
        action=mixer.clipAction(clip);
        action.reset().setLoop(layer.loop?THREE.LoopRepeat:THREE.LoopOnce,
          layer.loop?Infinity:1);
        action.clampWhenFinished=!layer.loop;
        action.play();
        this.previewAnimation.layers.set(layer.name,action);
      }
      action.paused=false;
      action.time=layer.loop
        ? Math.max(0,layer.age)%Math.max(.001,clip.duration)
        : Math.min(Math.max(0,clip.duration-.001),layer.age);
    }
    for(const [name,action] of this.previewAnimation.layers) {
      if(!active.has(name)){action.stop();this.previewAnimation.layers.delete(name);}
    }
    mixer.update(0);
  }

  update(dt, reducedMotion = false) {
    // Inspect on the wheels: there is no root pitch or artificial floor lift.
    const weight=reducedMotion?1:1-Math.exp(-dt*10);
    this.currentYaw+=(this.targetYaw-this.currentYaw)*weight;
    this.currentPitch=0;
    if(!reducedMotion)this.clock+=dt;
    if(this.knight) {
      this.knight.animator.apply({clip:'Idle',loop:true,time:this.clock},reducedMotion?0:dt);
      if(this.knightBounds.isEmpty()) {
        this.root.updateMatrixWorld(true);
        this.knightBounds.setFromObject(this.knight.root,true);
      }
    }
    this.#restoreFist();
    const mixer=this.mixers.get(this.activeMachineId);
    if(mixer&&!reducedMotion&&!this.performance.active)mixer.update(dt);
    const wasActive=this.performance.active;
    const pose=this.performance.update(dt,reducedMotion);
    if(pose)this.#samplePreviewAnimation(this.performance.skill,this.performance.time);
    else if(this.previewAnimation)this.#restorePreviewAnimation();
    if(wasActive&&!this.performance.active)this.onPreviewChange?.(null);
    this.machinePivot.visible=!(this.performance.skill==='doNotStopMyAscension'&&this.performance.time>=6.6);
    this.machinePivot.position.set(pose?.x??0,pose?.y??0,pose?.z??0);
    this.inspectionPivot.rotation.y=this.currentYaw;
    this.machinePivot.rotation.set(pose?.pitch??0,pose?.yawOffset??0,pose?.roll??0);
    this.#poseFist(pose);
  }

  dispose() {
    this.disposed = true;
    this.performance?.dispose();
    this.knight?.dispose();
    this.root.removeFromParent();
    for (const mixer of this.mixers.values()) mixer.stopAllAction();
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
    this.inFlight.clear();
    this.mixers.clear();
    this.clips.clear();
  }
}
