import { BI_BYE_COMPONENTS, BI_BYE_STABILIZER, biByeComponentPose, biByeAimPose, biByeDeployProgress } from '../../shared/sim/biByeComponents.mjs';
import * as THREE from 'three';
import {siegeRock} from '../../shared/sim/siegeImpact.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appUrl } from '../appUrl.mjs';
import { everywhere } from '../game/viewLayers.mjs';
import { BI_BYE_LLISTA_CONFIG, BI_BYE_STATES, BI_BYE_MODES, getBiByeMuzzlePosition, getBiByeMuzzleDirection } from '../../shared/sim/biByeLlista.mjs';

import { withClearBoltHidden, withClearNearBoltsHidden, biByeDamageFlash, biByeAnimation, biByeUpperAnimation, biByeClutchAnimation, biByeDelayAnimation, biByeTrackOwner, biByeWheelSteering, biByeWheelTravel } from './biByePresentation.mjs';

const ASSET_PATH = '/client/assets/props/bibye-ballista/bi-bye-llista-v4.3.glb?v=d696b66892a96c0a';

/**
 * Bi-Bye-llista (Two-Bolt Ballista) Mobile Siege Engine Renderer.
 * Integrates the authored Argon v4.1 production GLB asset (65 nodes, 46 meshes,
 * seated cockpit locators, and 21 animation clips) with fallback procedural meshes, continuous 6-wheel
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
    this.hitColor=new THREE.Color(0xb7785c);
    // Castleward has direct sun and diffuse sky lighting but no scene environment.
    // Give this PBR asset a restrained sky/ground reflection so steel and brass
    // remain distinct instead of rendering nearly black outside the sun glint.
    const sky = new Uint8Array(32 * 16 * 4);
    for (let row = 0; row < 16; row++) {
      const top = row < 8;
      const rgb = top ? [192, 203, 211] : [94, 89, 76];
      for (let col = 0; col < 32; col++) sky.set([...rgb, 255], (row * 32 + col) * 4);
    }
    this.environment = new THREE.DataTexture(sky, 32, 16, THREE.RGBAFormat);
    this.environment.mapping = THREE.EquirectangularReflectionMapping;
    this.environment.colorSpace = THREE.SRGBColorSpace;
    this.environment.needsUpdate = true;
    this.wheelAngles = [0, 0, 0, 0, 0, 0];

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
    this.clearProjectileBounds = new THREE.Box3();
    // A fixed light count avoids compiling the whole scene's PBR shaders on the
    // first frost-bolt release. Move this light; never add/remove it during fire.
    this.projectileLight = everywhere(new THREE.PointLight(0x22ccff, 0, 4.5));
    this.scene.add(this.projectileLight);

    // 1. Build initial procedural fallback until authored GLB completes load
    this.#buildFallbackMesh();
    this.fallbackComponentMaterials=this.#copyDamageMaterials(this.fallbackGroup);

    // 2. Load authored v4.1 production GLB asset asynchronously
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
        if (this.disposed) { this.#disposeGroup(gltf.scene, true); return; }
        this.authoredModel.name = 'BiBye_Authored_Asset_v4_1';

        // Index nodes by name
        gltf.scene.traverse((obj) => {
          if (obj.name) {
            this.nodes.set(obj.name, obj);
          }
          if (obj.isMesh) {
            for (const material of [obj.material].flat()) {
              if (material?.isMeshStandardMaterial) { material.envMap = this.environment; material.envMapIntensity = .5; }
            }
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        this.componentMaterials=this.#copyDamageMaterials(gltf.scene);
        // Initialize AnimationMixer and extract all clips
        this.mixer = new THREE.AnimationMixer(this.authoredModel);
        this.jointPose = new Map(['Traverse_Mount', 'Elevation_Cradle', 'Upper_Turret_Mount', 'Operator_Traverse_Wheel']
          .map(name => [name, this.nodes.get(name).quaternion.clone()]));

        this.restJointPose=new Map([...this.jointPose].map(([name,q])=>[name,q.clone()]));

        // No two live layers may bind the same node property. Runtime owns aim
        // joints and component hinges, including the authored damaged alternatives.
        for (const clip of gltf.animations ?? []) {
          if (clip.name === '12_BiBye_Damaged_Destroyed') {
            const action=this.mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
            this.actions.set(clip.name,action);continue;
          }
          for(const owner of ['Main','Upper','Clutch','Delay']){
            const part=clip.clone();part.name+=owner==='Main'?'':'_'+owner;
            part.tracks=part.tracks.filter(track=>biByeTrackOwner(track.name)===owner);
            if(!part.tracks.length)continue;
            const action=this.mixer.clipAction(part);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
            this.actions.set(part.name,action);
          }
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

  #copyDamageMaterials(root){
    const groups=new Map();
    root.traverse(node=>{
      if(!node.isMesh)return;
      let id='hull';
      for(let p=node;p&&p!==root;p=p.parent){
        const def=BI_BYE_COMPONENTS.find(d=>p.name===d.id||p.name===d.id+'_Damaged');
        if(def||p.userData.componentId){id=def?.id??p.userData.componentId;break;}
      }
      if(!groups.has(id))groups.set(id,new Map());
      const copies=groups.get(id),materials=[node.material].flat().map(original=>{
        if(!copies.has(original)){
          const m=original.clone();m.userData={...m.userData,baseColor:m.color.clone(),baseRoughness:m.roughness,baseEmissive:m.emissive.clone(),baseEmission:m.emissiveIntensity};copies.set(original,m);
        }
        return copies.get(original);
      });
      node.material=Array.isArray(node.material)?materials:materials[0];
    });
    return new Map([...groups].map(([id,mats])=>[id,[...mats.values()]]));
  }

  #updateDamageMaterials(groups,b,now){
    const steelActive=Boolean(b?.siegeSteel&&b.siegeSteel.state!=='expired'&&now<(b.siegeSteel.protectionUntil??0));
    const steelPulse=steelActive&&b.health>0?0.65+0.35*Math.sin(now*3.5):0;
    for(const [id,materials]of groups??[]){
      const def=BI_BYE_COMPONENTS.find(d=>d.id===id),damage=def?1-Math.max(0,Math.min(1,(b.components?.[id]?.health??def.maxHealth)/def.maxHealth)):0;
      const compAlive=!def||(b.components?.[id]?.health??def.maxHealth)>0;
      const pulse=biByeDamageFlash(b,id,now);
      for(const m of materials){
        m.color.copy(m.userData.baseColor).multiplyScalar(1-.4*damage).lerp(this.hitColor,pulse*.5);
        m.roughness=Math.min(1,m.userData.baseRoughness+.35*damage);
        if(steelActive&&b.health>0&&compAlive){
          m.emissive.copy(m.userData.baseEmissive).lerp(this.hitColor,pulse*.45).lerp(new THREE.Color(0x386899),0.5*steelPulse);
          m.emissiveIntensity=m.userData.baseEmission+.3*pulse+0.35*steelPulse;
        }else{
          m.emissive.copy(m.userData.baseEmissive).lerp(this.hitColor,pulse*.45);
          m.emissiveIntensity=m.userData.baseEmission+.3*pulse;
        }
      }
    }
  }

  #buildFallbackMesh() {
    this.fallbackGroup = new THREE.Group();
    this.fallbackGroup.name = 'BiBye_ProceduralFallback';

    // Wagon bed chassis
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 3.9), this.materials.timber);
    bed.position.set(0, 0.8, 0);
    bed.castShadow = true;
    this.fallbackGroup.add(bed);

    // 6 Wheels
    this.fallbackWheels = [];
    const wheelPositions = [[-1.075, 1.2], [1.075, 1.2], [-1.075, -.34], [1.075, -.34], [-1.075, -1.715], [1.075, -1.715]];
    for (const [wx, wz] of wheelPositions) {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.55, wz);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 16), this.materials.iron);
      rim.rotation.z = Math.PI / 2;
      wGroup.add(rim);
      this.fallbackGroup.add(wGroup);
      wGroup.userData.componentId='Wheel_'+['FL','FR','ML','MR','RL','RR'][this.fallbackWheels.length];
      this.fallbackWheels.push(wGroup);
    }

    // 4 Stabilizers
    this.fallbackStabilizers = [];
    for (const def of BI_BYE_COMPONENTS.filter(d=>d.kind==='stabilizer')) {
      const stab = new THREE.Group();
      const sign=def.side==='L'?-1:1;
      stab.position.set(...def.pivot);
      stab.userData.componentId=def.id;
      stab.scale.x=BI_BYE_STABILIZER.widthScale;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.16,1.03,.14), this.materials.timber);
      arm.position.set(sign*.35,-.375,0);arm.rotation.z=sign*43*Math.PI/180;
      stab.add(arm);
      const foot=new THREE.Mesh(new THREE.CylinderGeometry(.225,.225,.11,12),this.materials.iron);
      foot.position.set(sign*.71,-.765,0);stab.add(foot);
      this.fallbackGroup.add(stab);
      this.fallbackStabilizers.push(stab);
    }

    // Turntable and cradle
    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.7, 0.15, 16), this.materials.iron);
    turntable.position.set(0, 0.65, 0);
    this.fallbackGroup.add(turntable);

    this.fallbackTraverse = new THREE.Group();
    this.fallbackTraverse.position.set(0, 1.24, 0);
    this.fallbackCradle = new THREE.Group();
    this.fallbackCradle.position.set(0, .38, -.12);
    this.fallbackUpper = new THREE.Group();
    this.fallbackUpper.position.set(0, 1.54, .08);
    this.fallbackGroup.add(this.fallbackTraverse);
    this.fallbackTraverse.add(this.fallbackCradle);
    this.fallbackTraverse.add(this.fallbackUpper);
    for (const [parent, span, length, y, z] of [[this.fallbackCradle, 5.48, 3.2, .215, 1.04], [this.fallbackUpper, 1.86, 1.4, .165, .26]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.16, .12, length), this.materials.timber);
      rail.position.y = y;
      const bow = new THREE.Mesh(new THREE.BoxGeometry(span, .12, .14), this.materials.steel);
      bow.position.set(0, y, z);
      parent.add(rail, bow);
    }

    this.group.add(this.fallbackGroup);
  }

  update(timeSec, ballistaData, projectilesData = []) {
    this.presentationData = ballistaData;
    this.group.visible = Boolean(ballistaData);
    if (!ballistaData) { this.#updateProjectiles([]); return; }

    if(this.instanceId!==ballistaData.id){
      this.instanceId=ballistaData.id;this.lastWheelPose=null;this.wheelAngles.fill(0);
      this.mixer?.stopAllAction();this.activeBaseAction=null;this.upperAction=null;this.clutchAction=null;this.delayAction=null;
      if(this.restJointPose)this.jointPose=new Map([...this.restJointPose].map(([name,q])=>[name,q.clone()]));
    }
    // 1. Authoritative World Position & Carriage Heading
    const posX = ballistaData.position?.x ?? ballistaData.x ?? 0;
    const posY = ballistaData.position?.y ?? ballistaData.y ?? 0;
    const posZ = ballistaData.position?.z ?? ballistaData.z ?? 0;
    const heading = ballistaData.heading ?? 0;
    this.currentMode = ballistaData.mode;
    const wheelTravel = biByeWheelTravel(this.lastWheelPose, { x: posX, z: posZ, heading }, biByeWheelSteering(ballistaData.steer ?? 0));
    this.lastWheelPose = { x: posX, z: posZ, heading };
    this.wheelAngles = ballistaData.wheelRolls?.length === 6 ? [...ballistaData.wheelRolls] : this.wheelAngles.map((angle, index) => angle + wheelTravel[index]);

    const settling=ballistaData.operatorId?0:Math.max(0,1-(timeSec-(ballistaData.builtAt??-Infinity))/.5);
    this.group.position.set(posX,posY+.12*settling*settling,posZ);
    // Argon's v3 asset faces local +Z. Castleward's forward heading faces -Z.
    // Rotate by heading + PI to perfectly align the model with authoritative movement and projectile trajectories.
    this.group.rotation.set(-(ballistaData.chassisPitch??0),heading+Math.PI,ballistaData.chassisRoll??0,'YXZ');
    const impact=siegeRock(ballistaData,timeSec);
    if(impact.pitch||impact.roll){this.group.rotateX(-impact.pitch);this.group.rotateZ(impact.roll);}

    // 3. Update Authored Model or Fallback
    if (this.authoredModel) {
      this.#updateAuthoredModel(timeSec, ballistaData);
    } else if (this.fallbackGroup) {
      this.#updateFallbackModel(timeSec, ballistaData);
    }

    this.#updateDamageMaterials(this.authoredModel?this.componentMaterials:this.fallbackComponentMaterials,ballistaData,timeSec);

    // 4. Update In-Flight Projectile Visuals
    this.#updateProjectiles(projectilesData);
  }

  #updateAuthoredModel(timeSec, ballistaData) {
    const mode = ballistaData.mode;
    // Restore the uncomposed animation pose, including on a frozen frame. Mixer
    // bindings cache unchanged values, so resetting to identity would lose recoil.
    for (const [name, pose] of this.jointPose) this.nodes.get(name).quaternion.copy(pose);
    const sample = biByeAnimation(ballistaData, timeSec);
    this.#sampleAction(sample.name, sample.time);
    for(const [key,selection] of [['upperAction',biByeUpperAnimation],['clutchAction',biByeClutchAnimation],['delayAction',biByeDelayAnimation]]){
      const chosen=mode===BI_BYE_MODES.DESTROYED?null:selection(ballistaData,timeSec);
      const next=chosen?this.actions.get(chosen.name):null;
      if(next!==this[key]){this[key]?.stop();this[key]=next;next?.reset().play();}
      if(next){next.paused=true;next.time=Math.max(0,Math.min(chosen.time,next.getClip().duration));}
    }
    this.mixer.update(0);
    for (const [name, pose] of this.jointPose) pose.copy(this.nodes.get(name).quaternion);

    // Release is authoritative. Keep authored loading placement, but never show
    // an extra bolt after its release while an exported scale track catches up.
    const reloading=sample.name==='19_BiBye_Main_Winch_Reload_Only';
    const mainBolt=this.nodes.get('Main_Siege_Bolt'),upperBolt=this.nodes.get('Upper_Conditioning_Bolt');
    if(mainBolt)mainBolt.visible=mode!=='DESTROYED'&&(reloading?sample.time>=2.75:Boolean(ballistaData.mainBoltLoaded));
    if(upperBolt)upperBolt.visible=mode!=='DESTROYED'&&Boolean(ballistaData.upperPending||ballistaData.coupling==='FIRING'&&ballistaData.upperReleasedAt==null||ballistaData.smallBoltReady);
    for(const [index,def] of BI_BYE_COMPONENTS.entries()){
      const failed=mode==='DESTROYED'||ballistaData.components?.[def.id]?.health<=0;
      const intact=this.nodes.get(def.id),damaged=this.nodes.get(def.id+'_Damaged');
      if(intact)intact.visible=!failed;
      if(damaged){damaged.visible=failed;damaged.scale.setScalar(1);}
      for(const node of [intact,damaged])if(node&&def.kind==='stabilizer')node.scale.x=BI_BYE_STABILIZER.widthScale;
      if(mode==='DESTROYED')continue;
      const p=biByeComponentPose(ballistaData,def,timeSec);
      for(const node of [intact,damaged]){
        if(!node)continue;node.position.set(...p.pivot);node.scale.set(def.kind==='stabilizer'?BI_BYE_STABILIZER.widthScale:1,1,1);
        if(def.kind==='wheel')node.rotation.set(this.wheelAngles[index]??0,p.steer,p.tilt,'YZX');
        else node.rotation.set(0,0,p.tilt);
      }

    }
    if(mode===BI_BYE_MODES.DESTROYED)return;
    const pose=biByeAimPose(ballistaData,timeSec);
    this.nodes.get('Traverse_Mount')?.rotation.set(0,pose.mainYaw,0);
    this.nodes.get('Elevation_Cradle')?.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-pose.mainPitch));
    this.nodes.get('Upper_Turret_Mount')?.quaternion.setFromEuler(new THREE.Euler(-pose.upperPitch,pose.upperYaw,0,'YXZ'));
    const tiller=this.nodes.get('Operator_Steering_Tiller');if(tiller)tiller.rotation.z=(ballistaData.steer??0)*.28;
    this.nodes.get('Operator_Traverse_Wheel')?.rotateZ(pose.mainYaw*4);
  }

  #sampleAction(name, seconds) {
    const action = this.actions.get(name);
    if (!action) return;
    if (this.activeBaseAction !== action) {
      this.activeBaseAction?.stop();
      action.reset().play();
      this.activeBaseAction = action;
      this.activeActionName = name;
    }
    action.paused = true;
    action.time = Math.max(0, Math.min(seconds, action.getClip().duration));
  }

  renderMountedView(clear, render, camera = null) {
    return withClearNearBoltsHidden(this.projectileMeshes.values(),clear&&Boolean(camera),this.instanceId,
      mesh=>this.clearProjectileBounds.setFromObject(mesh).distanceToPoint(camera.position),
      ()=>withClearBoltHidden(this.nodes.get('Main_Siege_Bolt'),clear,render));
  }

  getMountedCameraPosition(view, out = new THREE.Vector3()) {
    if(view==='clear'&&this.presentationData){
      const b=this.presentationData,kind=b.mode==='DEPLOYED'&&b.weaponFocus==='MAIN'?'siege':'conditioning';
      const p=getBiByeMuzzlePosition({...b,...b.position},kind),d=getBiByeMuzzleDirection({...b,...b.position},kind);
      return out.set(p.x+d.x*.4,p.y+d.y*.4,p.z+d.z*.4);
    }
    const node = this.nodes.get(view === 'sight' ? 'mounted_camera_sight' : 'mounted_camera_tpv');
    if (!node) return null;
    if (view === 'sight') {
      const b = this.presentationData;
      if(b?.weaponFocus === 'UPPER' || b?.mode === 'MOBILE') {
        const upper=this.nodes.get('mounted_camera_upper_360');
        if(upper)return upper.getWorldPosition(out);
      }
      return node.getWorldPosition(out);
    }
    const b = this.presentationData;
    const yaw = b?.yaw ?? b?.heading ?? 0;
    this.group.localToWorld(out.set(0,3.8,0));
    out.x+=Math.sin(yaw)*6.7;out.z+=Math.cos(yaw)*6.7;return out;
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

  getOperatorGrips(){
    this.group.updateMatrixWorld(true);
    const point=name=>this.nodes.get(name)?.getWorldPosition(new THREE.Vector3());
    return {left:point('hand_L_steering_grip'),right:point('hand_R_traverse_grip'),lever:point('hand_R_fire_lever_grip')};
  }

  getOperatorStationWorldPosition(outVec = new THREE.Vector3()) {
    const node = this.nodes.get('seat_pelvis_anchor');
    if (node) {
      node.getWorldPosition(outVec);
      return outVec;
    }
    return null;
  }

  #updateFallbackModel(timeSec, ballistaData) {
    const pose=biByeAimPose(ballistaData,timeSec);
    this.fallbackTraverse.rotation.y = pose.mainYaw;
    this.fallbackCradle.rotation.x = -pose.mainPitch;
    this.fallbackUpper.rotation.set(-pose.upperPitch,pose.upperYaw,0,'YXZ');
    if (ballistaData.mode === BI_BYE_MODES.DESTROYED) {
      this.fallbackCradle.rotation.z = .22;
      this.fallbackUpper.rotation.z = -.35;
    } else {
      this.fallbackCradle.rotation.z = 0;
      this.fallbackUpper.rotation.z = 0;
    }
    if (this.fallbackWheels) {
      this.fallbackWheels.forEach((w, i) => {
        const p=biByeComponentPose(ballistaData,BI_BYE_COMPONENTS[i],timeSec);
        w.position.set(...p.pivot);
        w.rotation.set(this.wheelAngles[i],p.steer,p.tilt,'YZX');
      });
    }

    if (this.fallbackStabilizers) {
      for (const [i,stab] of this.fallbackStabilizers.entries()) {
        stab.rotation.z = biByeComponentPose(ballistaData,BI_BYE_COMPONENTS[i+6],timeSec).tilt;
      }
    }
  }

  #updateProjectiles(projectilesData = []) {
    const liveIds = new Set();
    this.projectileLight.intensity = 0;

    for (const proj of (projectilesData ?? [])) {
      liveIds.add(proj.id);
      let mesh = this.projectileMeshes.get(proj.id);

      if (!mesh) {
        mesh = this.#createProjectileMesh(proj.subKind);
        this.scene.add(mesh);
        this.projectileMeshes.set(proj.id, mesh);
      }

      mesh.userData.ballistaId=proj.ballistaId;
      mesh.position.set(proj.position.x, proj.position.y, proj.position.z);
      if (proj.subKind === 'conditioning') {
        this.projectileLight.position.copy(mesh.position);
        this.projectileLight.intensity = 1.5;
      }

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
    const source = this.nodes.get(subKind === 'conditioning' ? 'Upper_Conditioning_Bolt' : 'Main_Siege_Bolt');
    if (source?.isMesh) {
      // Reuse the approved bolt itself, centered on the authoritative projectile
      // origin. Own its geometry so removing a flying bolt never disposes the
      // loaded bolt's mesh. Its material stays shared with the machine.
      const bolt = new THREE.Mesh(source.geometry.clone(), source.material);
      bolt.geometry.computeBoundingBox();
      bolt.position.z = -bolt.geometry.boundingBox.getCenter(new THREE.Vector3()).z;
      bolt.castShadow = true;
      group.add(bolt);
      return group;
    }

    if (subKind === 'conditioning') {
      // Stage I Enchanted Frost Conditioning Bolt
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), this.materials.steel);
      shaft.rotation.x = Math.PI / 2;
      group.add(shaft);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), this.materials.arcaneCyan);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.75;
      group.add(tip);

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

  #disposeGroup(group, materials = false) {
    const disposed = new Set();
    group.traverse((obj) => {
      obj.geometry?.dispose();
      if (materials) for (const material of [obj.material].flat()) {
        if (!material || disposed.has(material)) continue;
        disposed.add(material);
        for (const value of Object.values(material)) if (value?.isTexture && value !== this.environment) value.dispose();
        material.dispose();
      }
    });
  }

  dispose() {
    this.disposed = true;
    this.environment.dispose();
    this.scene.remove(this.group);
    this.scene.remove(this.projectileLight);
    this.#disposeGroup(this.group, true);

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
