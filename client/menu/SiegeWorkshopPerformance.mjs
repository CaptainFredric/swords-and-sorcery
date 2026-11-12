import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  SIEGE_PREVIEW_LENGTH, SIEGE_PREVIEW_MACHINE, workshopPreviewPose,
  workshopPreviewShots, workshopPreviewTargets, workshopPreviewTargetPose,
  workshopPreviewDone, smooth,
} from './siegeWorkshopPreviewPlan.mjs';

// Cosmetic workshop theater using the real machine GLBs and clones of the real
// Spellblade model. Never applyDamage, never create a gameplay projectile.
const vec = values => new THREE.Vector3(...values);
const forward = new THREE.Vector3(0,0,-1);
const clamp = v => Math.max(0,Math.min(1,v));

function projectile(kind, resources) {
  const group = new THREE.Group();
  const color = kind === 'frost' ? 0xb8e6ff : kind === 'heavy' ? 0xc1b9a1 : 0xd1ac69;
  const material = new THREE.MeshStandardMaterial({color,metalness:.63,roughness:.27});
  const length = kind === 'heavy' ? 1.65 : kind === 'frost' ? .85 : .43;
  const width = kind === 'heavy' ? .09 : kind === 'frost' ? .047 : .024;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(width,width,length,8),material);
  shaft.rotation.x=-Math.PI/2;
  shaft.position.z=-length*.5;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(width*2.1,width*5,8),material);
  tip.rotation.x=-Math.PI/2;
  tip.position.z=-length-width*1.6;
  group.add(shaft,tip);
  resources.push(shaft.geometry,tip.geometry,material);
  group.visible=false;
  return group;
}

export class SiegeWorkshopPerformance {
  constructor(workshop) {
    this.workshop=workshop;
    this.root=new THREE.Group();
    this.root.name='SiegeSkillExhibition';
    workshop.root.add(this.root);
    this.skill=null;
    this.time=0;
    this.actors=[];
    this.projectiles=[];
    this.resources=[];
  }

  get active() { return Boolean(this.skill); }

  stop() {
    this.skill=null;
    this.time=0;
    this.actors.length=0;
    this.projectiles.length=0;
    this.root.clear();
    for(const item of this.resources)item.dispose();
    this.resources.length=0;
    if(this.workshop.knight)this.workshop.knight.root.visible=true;
  }

  play(skill) {
    if(SIEGE_PREVIEW_MACHINE[skill]!==this.workshop.activeMachineId)return false;
    this.stop();
    this.skill=skill;
    this.time=0;
    // Keep the primary comparison knight asset intact; this performance uses
    // independently transformable SkinnedMesh clones, never material duplicates.
    this.#ensureActors();
    for(const shot of workshopPreviewShots(skill)) {
      const arrow=projectile(shot.kind,this.resources);
      this.root.add(arrow);
      this.projectiles.push({shot,object:arrow});
    }
    return true;
  }

  #ensureActors() {
    if(!this.skill||this.actors.length||!this.workshop.knight)return;
    const knight=this.workshop.knight;
    knight.root.visible=false;
    const positions=workshopPreviewTargets(this.skill);
    for(let i=0;i<positions.length;i++) {
      const root=new THREE.Group();
      root.name=`PracticeSpellblade_${i+1}`;
      const model=cloneSkinned(knight.root);
      model.visible=true;
      root.add(model);
      root.position.copy(vec(positions[i]));
      root.rotation.y=this.skill==='beatToThePunch' ? Math.PI : 0;
      this.root.add(root);
      // The opponent guarding Narrow to One holds an upper ward. Shots pass
      // around it toward feet and flanks; no depiction of an unblockable bolt.
      const guard=new THREE.Mesh(
        new THREE.TorusGeometry(.53,.025,6,24,Math.PI*1.08),
        new THREE.MeshBasicMaterial({color:0xecc884,transparent:true,opacity:.65,depthWrite:false}),
      );
      guard.position.set(0,1.15,.43);
      guard.rotation.z=Math.PI*.12;
      guard.visible=false;
      root.add(guard);
      const hit=new THREE.Mesh(new THREE.SphereGeometry(.24,12,8),
        new THREE.MeshBasicMaterial({color:0xffb36b,transparent:true,opacity:.5,depthWrite:false}));
      hit.position.set(0,1.1,0);
      hit.visible=false;
      root.add(hit);
      this.resources.push(guard.geometry,guard.material,hit.geometry,hit.material);
      this.actors.push({root,model,guard,hit,base:positions[i]});
    }
  }

  // Fixed *exhibition* bounds, not frame-by-frame object extents. Otherwise
  // the camera zooms and rises as the vehicle turns: the 'invisible rock' bug.
  bounds() {
    if(!this.skill)return null;
    const flight=SIEGE_PREVIEW_MACHINE[this.skill]==='fightFlight';
    const x=this.workshop.root.position.x;
    const z=this.workshop.root.position.z;
    return new THREE.Box3(
      new THREE.Vector3(x-(flight?6:5),0,z-(flight?8:7.5)),
      new THREE.Vector3(x+(flight?6:5),flight?8:5,z+5.5));
  }

  update(dt, reducedMotion=false) {
    if(!this.skill)return null;
    this.#ensureActors();
    // Reduced motion still presents the essential contact and skill state.
    this.time+=Math.max(0,dt);
    const t=this.time;
    const skill=this.skill;
    const pose=workshopPreviewPose(skill,t);
    for(let i=0;i<this.actors.length;i++) {
      const actor=this.actors[i];
      const state=workshopPreviewTargetPose(skill,t,i);
      actor.root.position.set(actor.base[0]+state.x,actor.base[1]+state.y,actor.base[2]+state.z);
      actor.root.rotation.z=-state.fall*1.18;
      actor.guard.visible=Boolean(state.guard);
      actor.hit.visible=false;
    }
    const bases=workshopPreviewTargets(skill);
    for(const {shot,object} of this.projectiles) {
      const age=t-shot.at;
      const flight=shot.flight;
      object.visible=age>=0&&age<=flight;
      const machine=workshopPreviewPose(skill,shot.at);
      const from=skill==='coldHowTouching'||skill==='boltToTheOccasion'
        ? [machine.x+(shot.kind==='frost'?.32:0),1.6,machine.z-1.4]
        : [machine.x+.22,1.35+machine.y,machine.z-.7];
      const base=bases[shot.target]??[0,0,-4];
      const to=shot.nearMiss ? [base[0]+.95,1.2,base[2]+.42]
        : [base[0]+(skill==='narrowToOne'&&shot.lowShot?.26:0),
            skill==='narrowToOne'&&shot.lowShot?.43:1.2,base[2]];
      if(object.visible) {
        const u=clamp(age/flight);
        const start=vec(from),end=vec(to);
        object.position.lerpVectors(start,end,u);
        const direction=end.sub(start).normalize();
        object.quaternion.setFromUnitVectors(forward,direction);
      }
      if(age>=flight&&age<flight+.26) {
        const actor=this.actors[shot.target];
        if(actor) {
          actor.hit.visible=true;
          actor.hit.position.set(shot.nearMiss?.75:(skill==='narrowToOne'&&shot.lowShot?.25:0),
            skill==='narrowToOne'&&shot.lowShot?.45:1.15,shot.nearMiss?.42:0);
          actor.hit.material.color.setHex(shot.kind==='frost'?0xb3e9ff:0xffb36b);
          actor.hit.scale.setScalar(shot.nearMiss ? 1+7*smooth((age-flight)/.26) : 1+1.8*smooth((age-flight)/.26));
          actor.hit.material.opacity=.45*(1-clamp((age-flight)/.26));
        }
      }
    }
    // Long Arm's shot stays extended; press again to repeat, STOP or change
    // technique to retrieve. All other demonstrations reset after their scene.
    if(workshopPreviewDone(skill,t)) {
      this.stop();
      return null;
    }
    return pose;
  }

  dispose() {
    this.stop();
    this.root.removeFromParent();
  }
}
