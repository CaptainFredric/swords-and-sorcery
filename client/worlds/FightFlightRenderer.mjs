// Authored Fight-and-Flight v2.6 presentation. No replacement helicopter or baked-in Spellblade.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {appUrl} from '../appUrl.mjs';
import {everywhere} from '../game/viewLayers.mjs';
import {FLIGHT_REPEATER,flightRepeaterAim,flightMuzzle,flightDirection} from '../../shared/src/flightRepeaterAim.mjs';

const ASSET='/client/assets/props/fight-and-flight/fight-and-flight-v2.6.glb?v=122c53cb5513';
const SLOT_NAMES=['Quarrel_Visual_Chambered','Quarrel_Visual_Feed_Next','Quarrel_Visual_Hopper_Top','Quarrel_Visual_Slot_4','Quarrel_Visual_Slot_5','Quarrel_Visual_Slot_6'];
export class FightFlightRenderer{
  constructor(scene){
    this.scene=scene;this.group=everywhere(new THREE.Group());this.group.name='Fight-and-Flight';
    this.group.visible=false;scene.add(this.group);this.nodes=new Map();this.state=null;
    this.lastMode=null;this.clip=null;this.disposed=false;
    this.bolts=new Map();this.boltGeometry=new THREE.CylinderGeometry(.027,.032,.33,6);
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
      const fire=this.clips.get('Crossbow_Fire_Loop');
      if(fire){this.fireAction=this.mixer.clipAction(fire);this.fireAction.play();}
      this.model.traverse(n=>{if(n.name)this.nodes.set(n.name,n);if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
      // Emblem deliberately unapproved: display the authored plain crimson cloth.
      const crest=this.nodes.get('Rear_Banner_Heraldic_Emblem');if(crest)crest.visible=false;
      this.setFirstPerson(this.isFirstPerson);
      this.setFailureParts();resolve(true);
    },undefined,err=>{console.warn('Fight-and-Flight v2.6 asset failed to load',err);this.pending=null;resolve(false);}));
    return this.pending;
  }
  setFirstPerson(firstPerson){
    this.isFirstPerson=Boolean(firstPerson);
    const banner=this.nodes.get('Rear_Trident_Banner');
    if(banner)banner.visible=!this.isFirstPerson;
    const braceL=this.nodes.get('Protective_Brace_L');
    if(braceL)braceL.visible=!this.isFirstPerson;
    const braceR=this.nodes.get('Protective_Brace_R');
    if(braceR)braceR.visible=!this.isFirstPerson;
    const braceLDam=this.nodes.get('Protective_Brace_L_Damaged');
    if(braceLDam)braceLDam.visible=!this.isFirstPerson;
    const braceRDam=this.nodes.get('Protective_Brace_R_Damaged');
    if(braceRDam)braceRDam.visible=!this.isFirstPerson;
  }
  setFailureParts(){
    const m=this.state;if(!m)return;
    for(const [intact,damaged,hp] of [
      ['Protective_Brace_L','Protective_Brace_L_Damaged',m.braceLHP],
      ['Protective_Brace_R','Protective_Brace_R_Damaged',m.braceRHP]]){
      const original=this.nodes.get(intact),broken=this.nodes.get(damaged);
      if(original)original.visible=!this.isFirstPerson&&hp>0;
      if(broken){broken.scale.setScalar(hp>0?0:1);broken.visible=!this.isFirstPerson&&hp<=0;}
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
    if(m.mode==='TAKEOFF')return 'Posture_04_Takeoff_To_Flight';
    if(m.mode==='LANDING')return 'Posture_02_Controlled_Landing';
    if(!m.grounded)return m.velocity?.y<-.9?'Posture_02_Controlled_Landing':'Posture_04_Takeoff_To_Flight';
    if(Math.hypot(m.velocity?.x??0,m.velocity?.z??0)>.3)return 'Posture_05_Grounded_Walk_Loop';
    return 'Posture_01_Grounded_Idle';
  }
  update(now,m,projectiles=[],snapshotTime=now,zones=[],aim=null){
    this.drawBolts(projectiles,now,snapshotTime);
    this.drawBurnZones(zones,now);
    this.state=m;this.group.visible=Boolean(m&&!m.retired&&m.mode!=='DESTROYED');
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
    const crossbow=this.nodes.get('Crossbow_Body');
    if(crossbow){
      let pitchAngle=0,relativeYaw=0;
      if(aim){
        const computed=flightRepeaterAim(m,aim);
        pitchAngle=computed.pitch;
        relativeYaw=Math.atan2(Math.sin(computed.yaw-(m.heading??0)),Math.cos(computed.yaw-(m.heading??0)));
      }else{
        pitchAngle=m.crossbowPitch??0;
        const targetYaw=m.crossbowYaw??m.heading??0;
        relativeYaw=Math.atan2(Math.sin(targetYaw-(m.heading??0)),Math.cos(targetYaw-(m.heading??0)));
      }
      const age=now-(m.lastShotAt??-Infinity),recoil=age>=0&&age<.143?(.065*(1-age/.143)):0;
      crossbow.rotation.set(-pitchAngle-recoil,relativeYaw,0,'YXZ');
    }
    const rotor=this.nodes.get('Rotor_Hub');if(rotor)rotor.rotation.y=m.rotorAngle??0;
    // The named GLB rotor's authored pose is driven by the authoritative angular phase,
    // not an unrelated animation clock. This also stops on rotor failure.
    this.setFailureParts();
  }
  drawBolts(projectiles,now,stamp){
    const keep=new Set();
    for(const p of projectiles){
      keep.add(p.id);let mesh=this.bolts.get(p.id);
      if(!mesh){mesh=new THREE.Mesh(this.boltGeometry,this.boltMaterial);mesh.castShadow=true;
        this.scene.add(mesh);this.bolts.set(p.id,mesh);}
      const span=Math.max(0,Math.min(.12,now-stamp));
      mesh.position.set(p.position.x+p.velocity.x*span,p.position.y+p.velocity.y*span,p.position.z+p.velocity.z*span);
      const dir=new THREE.Vector3(p.velocity.x,p.velocity.y,p.velocity.z).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
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
    this.drawBurnZones([],Infinity);this.burnRoot.removeFromParent();this.burnGeometry.dispose();
    this.group.removeFromParent();this.mixer?.stopAllAction();this.model?.traverse(o=>{if(o.isMesh){o.geometry?.dispose();}});}
}
