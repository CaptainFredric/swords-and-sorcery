// Authored Fight-and-Flight v2.7 presentation. No replacement helicopter or baked-in Spellblade.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {appUrl} from '../appUrl.mjs';
import {everywhere} from '../game/viewLayers.mjs';
import {SWORD_STRIKE_TIMES} from '../../shared/src/combat.mjs';
import {FLIGHT_REPEATER,flightRepeaterAim,flightMuzzle,flightDirection} from '../../shared/src/flightRepeaterAim.mjs';
import {createQuarrelDetail,ornamentQuarrelSlot,disposeQuarrelDetail} from './flightQuarrelDetail.mjs';

// v2.6 remains checked into this directory as a verifiable rollback.
const ASSET='/client/assets/props/fight-and-flight/fight-and-flight-v2.7.glb?v=5358f2629a84';
const QUARREL='/client/assets/props/fight-and-flight/fight-and-flight-v2.7-quarrel.glb?v=f0fb5f44c1ee';
const SLOT_NAMES=['Quarrel_Visual_Chambered','Quarrel_Visual_Feed_Next','Quarrel_Visual_Hopper_Top','Quarrel_Visual_Slot_4','Quarrel_Visual_Slot_5','Quarrel_Visual_Slot_6'];
export class FightFlightRenderer{
  constructor(scene){
    this.scene=scene;this.group=everywhere(new THREE.Group());this.group.name='Fight-and-Flight';
    this.group.visible=false;scene.add(this.group);this.nodes=new Map();this.state=null;
    this.lastMode=null;this.clip=null;this.disposed=false;
    this.bolts=new Map();this.boltGeometry=new THREE.CylinderGeometry(.027,.032,.33,6);
    this.quarrelPrototype=null;this.quarrelDetail=createQuarrelDetail();this.lastSwordChain=null;this.operator=null;this.ejectionAt=null;
    this.boltMaterial=new THREE.MeshStandardMaterial({color:0xb7a17b,metalness:.35,roughness:.55});
    // Ground fire is authoritative aftermath, not part of the wreck model:
    // it remains visible after the apparatus disappears.
    this.burnRoot=everywhere(new THREE.Group());this.scene.add(this.burnRoot);
    this.burnGeometry=new THREE.RingGeometry(.48,1,32);this.burnZones=new Map();
  }
  load(){
    if(this.pending||this.disposed)return this.pending??Promise.resolve(false);
    this.pending=new Promise(resolve=>new GLTFLoader().load(appUrl(ASSET),gltf=>{
      if(this.disposed){resolve(false);return;}
      this.model=gltf.scene;this.group.add(this.model);
      this.mixer=new THREE.AnimationMixer(this.model);
      this.clips=new Map(gltf.animations.map(clip=>[clip.name,clip]));
      // Separate rotor/gear channel from torso/limb posture; both share the authored rig.
      const spin=this.clips.get('Rotor_Spin_Cycle_1Rev');
      if(spin){this.rotorAction=this.mixer.clipAction(spin);this.rotorAction.play();}
      const reload=this.clips.get('Crossbow_Reload_Index');
      if(reload){this.reloadAction=this.mixer.clipAction(reload);this.reloadAction.play();}
      const eject=this.clips.get('Posture_11_Aerial_Ejection');
      if(eject){
        this.ejectionAction=this.mixer.clipAction(eject);
        this.ejectionAction.setLoop(THREE.LoopOnce,1);
        this.ejectionAction.clampWhenFinished=true;
        this.ejectionAction.play();this.ejectionAction.paused=true;
        this.ejectionAction.enabled=false;
      }
      const sword=this.clips.get('Sword_Strike_And_Recovery');
      if(sword){this.swordAction=this.mixer.clipAction(sword);this.swordAction.setLoop(THREE.LoopOnce,1);this.swordAction.clampWhenFinished=true;this.swordAction.play();this.swordAction.paused=true;this.swordAction.enabled=false;}
      const fire=this.clips.get('Crossbow_Fire_Loop');
      if(fire){this.fireAction=this.mixer.clipAction(fire);this.fireAction.play();}
      this.model.traverse(n=>{if(n.name)this.nodes.set(n.name,n);if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
      // Six individually ornamented GLB magazine quarrels. Detail groups are
      // attached to their actual moving nodes, so reload indexing and the
      // authoritative visible-ammo count remain unchanged.
      SLOT_NAMES.forEach((name,i)=>ornamentQuarrelSlot(this.nodes.get(name),this.quarrelDetail,i));
      // Emblem deliberately unapproved: display the authored plain crimson cloth.
      const crest=this.nodes.get('Rear_Banner_Heraldic_Emblem');if(crest)crest.visible=false;
      this.setFirstPerson(this.isFirstPerson);
      this.setFailureParts();resolve(true);
      // A GLB quarrel points along its authored local +Z (tip at +0.415 m).
      // Failure leaves the legacy cylinder fallback, never changes ballistics.
      new GLTFLoader().load(appUrl(QUARREL),bolt=>{
        if(this.disposed)return;
        this.quarrelPrototype=bolt.scene;
      },undefined,e=>console.warn('Quarrel GLB unavailable; keeping fallback',e));
    },undefined,err=>{console.warn('Fight-and-Flight v2.7 asset failed to load',err);this.pending=null;resolve(false);}));
    return this.pending;
  }
  setFirstPerson(firstPerson){
    this.isFirstPerson=Boolean(firstPerson);
    // The v2.7 cockpit keeps BOTH protective shoulder mantlets visible;
    // only rear-only drive components/banner obstruct the visor camera.
    for(const name of ['Rear_Drive_Assembly','Rear_Trident_Banner']){
      const node=this.nodes.get(name);if(node)node.visible=!this.isFirstPerson;
    }
  }
  noteEjection(at){
    if(Number.isFinite(at))this.ejectionAt=at;
  }
  setFailureParts(){
    const m=this.state;if(!m)return;
    for(const [intact,damaged,hp] of [
      ['Protective_Brace_L','Protective_Brace_L_Damaged',m.braceLHP],
      ['Protective_Brace_R','Protective_Brace_R_Damaged',m.braceRHP]]){
      const original=this.nodes.get(intact),broken=this.nodes.get(damaged);
      if(original)original.visible=hp>0;
      if(broken){broken.scale.setScalar(hp>0?0:1);broken.visible=hp<=0;}
    }
    const banner=this.nodes.get('Rear_Trident_Banner');
    if(banner)banner.visible=!this.isFirstPerson;
    for(const name of SLOT_NAMES){const i=SLOT_NAMES.indexOf(name),n=this.nodes.get(name);if(n)n.visible=Math.floor(m.ammo??0)>=i+1;}
    const rotorAlive=m.rotorHP>0;
    for(const name of ['Rotor_Sword_Blade_L','Rotor_Sword_Blade_R']){const n=this.nodes.get(name);if(n)n.visible=rotorAlive;}
    for(const name of ['Rotor_Hub_Fractured_Collar','Rotor_Blade_L_Fractured_Stump']){const n=this.nodes.get(name);if(n){n.visible=!rotorAlive;n.scale.setScalar(rotorAlive?0:1);}}
  }
  posture(m){
    if(m.rotorHP<=0)return 'Damage_08_Rotor_Destroy_Grounded';
    if(m.crouched)return 'Posture_03_Grounded_Crouch';
    if(m.terminalDive&&!m.terminalDive.resolved)return 'Posture_07_Terminal_Dive_Pitch';
    if(m.offensiveRun)return 'Posture_06_Airborne_Overdrive_Pitch';
    // Discrete hop has its own authored trajectory; otherwise takeoff
    // transitions to powered ascent/hover without replaying the hop.
    if(m.mode==='TAKEOFF'&&Number.isFinite(m.hopStartedAt))return 'Posture_09_Ordinary_Small_Jump';
    if(m.mode==='TAKEOFF')return 'Posture_04_Takeoff_To_Flight';
    if(m.mode==='LANDING')return 'Posture_02_Controlled_Landing';
    if(!m.grounded)return 'Posture_10_Ascending_Hover_Descending';
    if(Math.hypot(m.velocity?.x??0,m.velocity?.z??0)>.3)return 'Posture_05_Grounded_Walk_Loop';
    return 'Posture_01_Grounded_Idle';
  }
  update(now,m,projectiles=[],snapshotTime=now,zones=[],aim=null,operator=null){
    this.drawBolts(projectiles,now,snapshotTime);
    this.drawBurnZones(zones,now);
    this.state=m;this.operator=operator;this.group.visible=Boolean(m&&!m.retired&&m.mode!=='DESTROYED');
    // High Grounds (including remote team production) does not pass through
    // Practice's explicit asset preload. Begin one lazy load per new machine,
    // never retry a missing GLB every render frame.
    if (this.group.visible && !this.model && this.autoLoadMachineId !== m.id) {
      this.autoLoadMachineId=m.id;
      void this.load();
    }
    if(!m?.operatorId)this.lastSwordChain=null;
    // Server detachment is immediate. The authored clip opens the empty
    // harness and deflects the coasting shaft, never teleports or reattaches
    // the live Spellblade after its airborne ejection.
    if(this.ejectionAction){
      const age=now-(this.ejectionAt??-Infinity);
      const active=age>=0&&age<this.ejectionAction.getClip().duration
        &&!m?.operatorId&&(m?.rotorHP??0)>0;
      this.ejectionAction.enabled=active;
      if(active)this.ejectionAction.time=age;
      if(age>=this.ejectionAction.getClip().duration)this.ejectionAt=null;
    }
    if(!this.group.visible)return;
    this.load();
    const at=m.position??m;
    this.group.position.set(at.x,at.y,at.z);
    // Exported crossbow faces local +Z; Castleward's yaw-zero forward is world -Z.
    this.group.rotation.set(0,(m.heading??0)+Math.PI,0);
    if(!this.model)return;
    // Authored pitched flight pose and actual pilot machine silhouette share
    // the same authoritative run tilt; no unrelated camera dip is applied.
    this.model.rotation.x=m.runPitch??0;
    const dt=this.lastUpdateAt!=null?Math.min(0.1,Math.max(0,now-this.lastUpdateAt)):0;
    this.lastUpdateAt=now;
    const name=this.posture(m),clip=this.clips.get(name);
    if(clip&&name!==this.lastMode){
      const prev=this.action;
      const next=this.mixer.clipAction(clip);
      next.reset();
      next.enabled=true;
      if(name==='Posture_05_Grounded_Walk_Loop'){
        next.setLoop(THREE.LoopRepeat);
      }else{
        next.clampWhenFinished=true;
        next.setLoop(THREE.LoopOnce,1);
      }
      if(prev&&prev!==next){
        prev.crossFadeTo(next,0.22,false);
      }
      next.play();
      this.action=next;
      this.lastMode=name;
    }
    if(this.action&&name==='Posture_05_Grounded_Walk_Loop'){
      const speed=Math.hypot(m.velocity?.x??0,m.velocity?.z??0);
      this.action.timeScale=Math.max(0.4,speed*1.3);
    }
    this.mixer.update(dt);
    if(this.rotorAction){this.rotorAction.time=((m.rotorAngle??0)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)/(2*Math.PI)*this.rotorAction.getClip().duration;}
    if(this.reloadAction)this.reloadAction.time=Math.min(6,Math.floor(m.ammo??0))/6*this.reloadAction.getClip().duration;
    if(this.fireAction){this.fireAction.enabled=Number.isFinite(m.lastShotAt)&&now-m.lastShotAt>=0&&now-m.lastShotAt<=.143;
      if(this.fireAction.enabled)this.fireAction.time=Math.max(0,now-m.lastShotAt);
    }
    // Gimbal motion follows the machine's authoritative replicated joint angles,
    // never a second, visually convenient convergence calculation.
    const rel=Math.atan2(Math.sin((m.crossbowYaw??m.heading??0)-(m.heading??0)),
      Math.cos((m.crossbowYaw??m.heading??0)-(m.heading??0)));
    const yaw=Math.max(-FLIGHT_REPEATER.maxTraverse,Math.min(FLIGHT_REPEATER.maxTraverse,rel));
    const pitch=Math.max(FLIGHT_REPEATER.minPitch,Math.min(FLIGHT_REPEATER.maxPitch,m.crossbowPitch??0));
    const gimbal=this.nodes.get('Crossbow_Yaw_Gimbal');
    const cradle=this.nodes.get('Crossbow_Pitch_Cradle');
    const tilter=this.nodes.get('Crossbow_Aim_Tilter_Link');
    if(gimbal&&cradle){
      gimbal.rotation.set(0,yaw,0);
      cradle.rotation.set(-pitch,0,0);
      if(tilter){
        const xAxis=new THREE.Vector3(1,0,0),yAxis=new THREE.Vector3(0,1,0);
        const inverseCradle=new THREE.Quaternion().setFromAxisAngle(xAxis,pitch);
        const counterYaw=new THREE.Quaternion().setFromAxisAngle(yAxis,-.75*yaw);
        const counterPitch=new THREE.Quaternion().setFromAxisAngle(xAxis,-.32*pitch);
        tilter.quaternion.copy(inverseCradle.multiply(counterYaw).multiply(counterPitch));
      }
    }
    // The authored 0.65s sword clip crosses the reticle at 46% duration.
    // Align that crossing to the actual server strike contacts (0.4/1.1/1.8s),
    // and do not render uncommitted subsequent swings.
    if(this.swordAction){
      // A released sword chain clears attackCommitted on the host. Keep
      // presenting its last genuinely committed swing through recovery, never
      // invent a next strike from an uncommitted held-button visual.
      if(operator?.attackActive&&Number.isFinite(operator.attackStartedAt)){
        this.lastSwordChain={startedAt:operator.attackStartedAt,committed:operator.attackCommitted??0};
      }
      const chain=this.lastSwordChain;
      const sampleOffset=this.swordAction.getClip().duration*.46;
      let swordTime=-1;
      if(chain){
        for(let i=0;i<Math.min(chain.committed,SWORD_STRIKE_TIMES.length);i++){
          const elapsed=now-chain.startedAt-(SWORD_STRIKE_TIMES[i]-sampleOffset);
          if(elapsed>=0&&elapsed<this.swordAction.getClip().duration)swordTime=elapsed;
        }
        if(now-chain.startedAt>SWORD_STRIKE_TIMES.at(-1)+this.swordAction.getClip().duration)
          this.lastSwordChain=null;
      }
      this.swordAction.enabled=swordTime>=0;
      if(swordTime>=0)this.swordAction.time=swordTime;
    }
    const rotor=this.nodes.get('Rotor_Hub');if(rotor)rotor.rotation.y=m.rotorAngle??0;
    // The named GLB rotor's authored pose is driven by the authoritative angular phase,
    // not an unrelated animation clock. This also stops on rotor failure.
    this.mixer.update(0); // sample rotor, fire, sword and rotor failure at authoritative time
    // Authored posture tracks animate Node 1's root translation/attitude. The
    // simulation already owns chassis XYZ and run pitch; allowing those visual
    // oscillations to move the muzzle would desynchronize server collision,
    // crosshair truth and the displayed gun. Keep limb/banner animation only.
    if(!this.ejectionAction?.enabled){
      for(const name of ['Protective_Brace_L','Protective_Brace_R']){
        const brace=this.nodes.get(name);if(brace)brace.quaternion.identity();
      }
      if(m.rotorHP>0&&!m.terminalDive){
        const shaft=this.nodes.get('Rotor_Shaft_And_Bearing');if(shaft)shaft.quaternion.identity();
      }
      const anchor=this.nodes.get('operator_root_anchor');
      if(anchor){anchor.position.set(0,0,0);anchor.quaternion.identity();}
    }
    const chassis=this.nodes.get('Main_Apparatus_Chassis');
    if(chassis){chassis.position.set(0,0,0);chassis.quaternion.identity();}
    this.setFailureParts();
  }
  drawBolts(projectiles,now,stamp){
    const keep=new Set();
    for(const p of projectiles){
      keep.add(p.id);let mesh=this.bolts.get(p.id);
      if(!mesh){
        mesh=new THREE.Group();mesh.name='Authored_Flight_Quarrel_'+p.id;
        if(this.quarrelPrototype)mesh.add(this.quarrelPrototype.clone(true));
        else{
          const fallback=new THREE.Mesh(this.boltGeometry,this.boltMaterial);
          fallback.rotation.x=Math.PI/2;mesh.add(fallback);
        }
        mesh.add(this.quarrelDetail.clone(true));
        mesh.traverse(n=>{if(n.isMesh)n.castShadow=true;});
        this.scene.add(mesh);this.bolts.set(p.id,mesh);}
      const span=Math.max(0,Math.min(.12,now-stamp));
      mesh.position.set(p.position.x+p.velocity.x*span,p.position.y+p.velocity.y*span,p.position.z+p.velocity.z*span);
      const dir=new THREE.Vector3(p.velocity.x,p.velocity.y,p.velocity.z).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);
    }
    for(const [id,mesh] of this.bolts)if(!keep.has(id)){mesh.removeFromParent();this.bolts.delete(id);}
  }
  drawBurnZones(zones,now){
    const active=new Set();
    for(const zone of zones??[]){
      if(!zone?.point||!(now<zone.expiresAt))continue;
      active.add(zone.id);
      let mesh=this.burnZones.get(zone.id);
      if(!mesh){
        mesh=new THREE.Mesh(this.burnGeometry,new THREE.MeshBasicMaterial({color:0x9e421d,transparent:true,opacity:.53,depthWrite:false,side:THREE.DoubleSide}));
        mesh.rotation.x=-Math.PI/2;mesh.renderOrder=1;this.burnRoot.add(mesh);this.burnZones.set(zone.id,mesh);
      }
      const duration=Math.max(.1,zone.expiresAt-zone.startedAt);
      const remaining=Math.max(0,(zone.expiresAt-now)/duration);
      mesh.material.opacity=.16+.36*remaining;
      mesh.position.set(zone.point.x,zone.point.y+.055,zone.point.z);
      mesh.scale.setScalar(zone.radius??4);
    }
    for(const [id,mesh] of this.burnZones)if(!active.has(id)){
      mesh.removeFromParent();mesh.material.dispose();this.burnZones.delete(id);
    }
  }
  getOperatorGrips(){
    this.group.updateMatrixWorld(true);
    return {
      left:this.nodes.get('operator_hand_L_crossbow_grip')?.getWorldPosition(new THREE.Vector3())??null,
      right:this.nodes.get('operator_hand_R_sword_corridor')?.getWorldPosition(new THREE.Vector3())??null
    };
  }
  getMountedCameraPosition(view,out=new THREE.Vector3()){
    const m=this.state;if(!m)return null;
    const first=view==='sight';
    const eye=this.nodes.get('operator_first_person_camera');
    if(first&&eye){this.group.updateMatrixWorld(true);return eye.getWorldPosition(out);}
    const distance=first?0:5.5;
    out.set(m.x+Math.sin(m.heading)*distance,m.y+(first?1.52:3.05),m.z+Math.cos(m.heading)*distance);
    return out;
  }
  getCrossbowAim(aim=null){
    const m=this.state;if(!m)return null;
    if(aim)return flightRepeaterAim(m,aim);
    return {yaw:m.crossbowYaw??m.heading??0,pitch:m.crossbowPitch??0};
  }
  getMuzzlePosition(aim=null){
    const m=this.state;if(!m)return null;
    const computed=this.getCrossbowAim(aim);
    return flightMuzzle(m,computed);
  }
  getFireDirection(aim=null){
    const m=this.state;if(!m)return null;
    const computed=this.getCrossbowAim(aim);
    return flightDirection(m,computed);
  }
  dispose(){this.disposed=true;for(const mesh of this.bolts.values())mesh.removeFromParent();this.bolts.clear();
    this.boltGeometry.dispose();this.boltMaterial.dispose();
    disposeQuarrelDetail(this.quarrelDetail);
    this.quarrelPrototype?.traverse(n=>{if(n.isMesh)n.geometry?.dispose();});
    this.drawBurnZones([],Infinity);this.burnRoot.removeFromParent();this.burnGeometry.dispose();
    this.group.removeFromParent();this.mixer?.stopAllAction();this.model?.traverse(o=>{if(o.isMesh){o.geometry?.dispose();}});}
}
