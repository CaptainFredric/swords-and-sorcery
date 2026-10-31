// Authored Fight-and-Flight v2.6 presentation. No replacement helicopter or baked-in Spellblade.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {appUrl} from '../appUrl.mjs';
import {everywhere} from '../game/viewLayers.mjs';

const ASSET='/client/assets/props/fight-and-flight/fight-and-flight-v2.6.glb?v=122c53cb5513';
const SLOT_NAMES=['Quarrel_Visual_Chambered','Quarrel_Visual_Feed_Next','Quarrel_Visual_Hopper_Top','Quarrel_Visual_Slot_4','Quarrel_Visual_Slot_5','Quarrel_Visual_Slot_6'];
export class FightFlightRenderer{
  constructor(scene){
    this.scene=scene;this.group=everywhere(new THREE.Group());this.group.name='Fight-and-Flight';
    this.group.visible=false;scene.add(this.group);this.nodes=new Map();this.state=null;
    this.lastMode=null;this.clip=null;this.disposed=false;
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
      this.model.traverse(n=>{if(n.name)this.nodes.set(n.name,n);if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
      // Emblem deliberately unapproved: display the authored plain crimson cloth.
      const crest=this.nodes.get('Rear_Banner_Heraldic_Emblem');if(crest)crest.visible=false;
      this.setFailureParts();resolve(true);
    },undefined,err=>{console.warn('Fight-and-Flight v2.6 asset failed to load',err);this.pending=null;resolve(false);}));
    return this.pending;
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
    for(const name of SLOT_NAMES){const i=SLOT_NAMES.indexOf(name),n=this.nodes.get(name);if(n)n.visible=Math.floor(m.ammo??0)>=i+1;}
    const rotorAlive=m.rotorHP>0;
    for(const name of ['Rotor_Sword_Blade_L','Rotor_Sword_Blade_R']){const n=this.nodes.get(name);if(n)n.visible=rotorAlive;}
    for(const name of ['Rotor_Hub_Fractured_Collar','Rotor_Blade_L_Fractured_Stump']){const n=this.nodes.get(name);if(n){n.visible=!rotorAlive;n.scale.setScalar(rotorAlive?0:1);}}
  }
  posture(m){
    if(m.rotorHP<=0)return 'Damage_08_Rotor_Destroy_Grounded';
    if(m.crouched)return 'Posture_03_Grounded_Crouch';
    if(m.mode==='TAKEOFF')return 'Posture_04_Takeoff_To_Flight';
    if(m.mode==='LANDING')return 'Posture_02_Controlled_Landing';
    if(!m.grounded)return m.velocity?.y<-.9?'Posture_02_Controlled_Landing':'Posture_04_Takeoff_To_Flight';
    if(Math.hypot(m.velocity?.x??0,m.velocity?.z??0)>.3)return 'Posture_05_Grounded_Walk_Loop';
    return 'Posture_01_Grounded_Idle';
  }
  update(now,m){
    this.state=m;this.group.visible=Boolean(m&&!m.retired&&m.mode!=='DESTROYED');
    if(!this.group.visible)return;
    this.load();
    const at=m.position??m;
    this.group.position.set(at.x,at.y,at.z);
    // Exported crossbow faces local +Z; Castleward's yaw-zero forward is world -Z.
    this.group.rotation.set(0,(m.heading??0)+Math.PI,0);
    if(!this.model)return;
    const name=this.posture(m),clip=this.clips.get(name);
    if(clip&&name!==this.lastMode){
      if(this.action){this.action.stop();this.action.enabled=false;}
      this.action=this.mixer.clipAction(clip);this.action.reset().play();this.action.paused=false;this.lastMode=name;
    }
    if(this.rotorAction){this.rotorAction.time=((m.rotorAngle??0)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)/(2*Math.PI)*this.rotorAction.getClip().duration;}
    if(this.action)this.action.time=name==='Posture_05_Grounded_Walk_Loop'?now%this.action.getClip().duration:Math.min(.65,this.action.getClip().duration);
    this.mixer.update(0);
    const rotor=this.nodes.get('Rotor_Hub');if(rotor)rotor.rotation.y=m.rotorAngle??0;
    // The named GLB rotor's authored pose is driven by the authoritative angular phase,
    // not an unrelated animation clock. This also stops on rotor failure.
    this.setFailureParts();
  }
  getOperatorGrips(){
    this.group.updateMatrixWorld(true);
    return {left:this.nodes.get('operator_hand_L_crossbow_grip')?.getWorldPosition(new THREE.Vector3())??null};
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
  dispose(){this.disposed=true;this.group.removeFromParent();this.mixer?.stopAllAction();this.model?.traverse(o=>{if(o.isMesh){o.geometry?.dispose();}});}
}
