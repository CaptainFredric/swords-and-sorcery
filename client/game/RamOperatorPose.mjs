import * as THREE from 'three';
import {BI_BYE_OPERATOR_POSES} from './biByeOperatorPoses.mjs';
const clean=name=>name.replace(/[[\].:/]/g,'');
// The production knight's braced riding pose. Bones retain their original lengths;
// pelvis, boots and control hands fit the real station after carriage interpolation.
export class RamOperatorPose {
 constructor(root,bones,arms,soles){this.root=root;this.bones=bones;this.arms=arms;this.soles=soles;this.contacts=new Map();}
 bone(name){return this.bones.get(clean(name));}
 apply(station){
  if(!station)return;
  const pelvis=this.bone('pelvis');if(!pelvis)return;
  this.root.updateWorldMatrix(true,true);
  const target=station.pelvis.clone().addScaledVector(station.forward,-station.recoil*.035);
  pelvis.position.copy(pelvis.parent.worldToLocal(target));pelvis.updateMatrixWorld(true);
  // Reuse the existing fitted control-hand orientation, without its ballista seat/legs.
  for(const [name,t] of Object.entries(BI_BYE_OPERATOR_POSES.poses.wheel)){
   if(!/^(clavicle|upper_arm|forearm|hand)\./.test(name))continue;
   const bone=this.bone(name);bone?.quaternion.fromArray(t.quaternion);
  }
  this.root.updateWorldMatrix(true,true);
  for(const side of ['L','R']){
   const foot=this.bone('foot.'+side),rest=side==='L'?station.leftFoot:station.rightFoot;if(!foot)continue;
   const rotation=foot.getWorldQuaternion(new THREE.Quaternion());
   if(!this.contacts.has(side)){
    const points=(this.soles?.get('foot.'+side)??[]).map(p=>foot.localToWorld(p.clone()));
    const low=Math.min(...points.map(p=>p.dot(station.up))),sole=points.filter(p=>p.dot(station.up)<low+.012);
    const center=sole.length?sole.reduce((p,v)=>p.add(v),new THREE.Vector3()).multiplyScalar(1/sole.length):foot.getWorldPosition(new THREE.Vector3()).addScaledVector(station.up,-.105);
    this.contacts.set(side,foot.worldToLocal(center));
   }
   const soleOffset=foot.localToWorld(this.contacts.get(side).clone()).sub(foot.getWorldPosition(new THREE.Vector3()));
   const ankle=rest.clone().sub(soleOffset);
   this.leg(side,ankle,station.forward);foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  }
  this.root.updateWorldMatrix(true,true);
  const wrist=grip=>grip.clone().addScaledVector(station.forward,-.085).addScaledVector(station.up,-.015);
  this.arms.applyStanding({left:wrist(station.leftHand),right:wrist(station.rightHand)});
 }
 leg(side,end,forward){
  const a=this.bone('thigh.'+side),b=this.bone('shin.'+side),c=this.bone('foot.'+side);if(!a||!b||!c)return;
  const start=a.getWorldPosition(new THREE.Vector3()),knee=b.getWorldPosition(new THREE.Vector3()),ankle=c.getWorldPosition(new THREE.Vector3());
  const l1=start.distanceTo(knee),l2=knee.distanceTo(ankle),axis=end.clone().sub(start).normalize(),d=Math.max(.001,Math.min(start.distanceTo(end),l1+l2-.001));
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const pole=forward.clone().addScaledVector(axis,-forward.dot(axis)).normalize();
  const target=start.clone().addScaledVector(axis,along).addScaledVector(pole,height);
  this.aim(a,b,target);this.aim(b,c,end);
 }
 aim(bone,child,target){
  const start=bone.getWorldPosition(new THREE.Vector3()),from=child.getWorldPosition(new THREE.Vector3()).sub(start).normalize(),to=target.clone().sub(start).normalize();
  const world=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));bone.updateMatrixWorld(true);
 }
}
