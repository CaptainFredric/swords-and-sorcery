import * as THREE from 'three';
import { BI_BYE_OPERATOR_POSES as DATA } from './biByeOperatorPoses.mjs';
import { biByeOperatorReach } from './biByeOperatorState.mjs';
const clean=name=>name.replace(/[[\].:/]/g,'');

// Fitted against the actual production mesh in Blender. Its imported bone bases
// differ from Argon's candidate, so only the retargeted production transforms are used.
export class BiByeOperatorPose {
 constructor(root,bones){
  this.root=root;this.bones=bones;this.active=false;
  this.rest=new Map([...bones.values()].map(b=>[b,{p:b.position.clone(),q:b.quaternion.clone()}]));
  this.poses=Object.fromEntries(Object.entries(DATA.poses).map(([key,pose])=>[key,new Map(Object.entries(pose).map(([name,t])=>[clean(name),{p:new THREE.Vector3(...t.position),q:new THREE.Quaternion(...t.quaternion)}]))]));
  this.sword=root.getObjectByName('HeroSword');
  if(this.sword){
   root.updateMatrixWorld(true);
   const inverse=root.matrixWorld.clone().invert();
   // Multiple glTF material primitives load as a Group of SkinnedMeshes.
   // Preserve both steel and gold pieces rather than assuming one mesh.
   this.stowed=new THREE.Group();this.stowed.name='BiBye_Stowed_Production_Sword';
   this.sword.traverse(source=>{
    if(!source.isMesh)return;
    source.skeleton?.update();
    const geometry=source.geometry.clone(),points=[];
    for(let i=0;i<geometry.attributes.position.count;i++){
     const p=source.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(source.matrixWorld).applyMatrix4(inverse);points.push(...p.toArray());
    }
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,source.material);mesh.castShadow=true;this.stowed.add(mesh);
   });
   this.stowed.matrixAutoUpdate=false;this.stowed.matrix.fromArray(DATA.stowedSwordMatrix);
   this.stowed.visible=false;root.add(this.stowed);
  }
 }
 bone(name){return this.bones.get(clean(name));}
 apply(b={},now=0,grips=null){
  if(!this.active){this.active=true;this.swordVisible=this.sword?.visible??true;}
  const reach=biByeOperatorReach(b,now);
  for(const [name,a] of this.poses.wheel){
   const bone=this.bones.get(name);if(!bone)continue;
   const lever=this.poses.lever.get(name)??a;
   bone.position.copy(a.p).lerp(lever.p,reach);bone.quaternion.copy(a.q).slerp(lever.q,reach);
  }
  if(this.sword)this.sword.visible=false;
  if(this.stowed)this.stowed.visible=true;
  this.root.updateWorldMatrix(true,true);
  if(grips){
   this.#arm('L',grips.left);
   if(grips.right&&grips.lever)this.#arm('R',grips.right.clone().lerp(grips.lever,reach));
  }
 }
 applyFlight(grips){
  // Keep the Spellblade's real sword equipped; left hand holds repeater, right hand in sword corridor
  this.root.updateWorldMatrix(true,true);
  this.#arm('L',grips?.left,false);
  if(grips?.right)this.#arm('R',grips.right,false);
 }
 applyStanding(grips){
  if(!this.standingActive){this.standingActive=true;this.standingSwordVisible=this.sword?.visible??true;}
  if(this.sword)this.sword.visible=false;if(this.stowed)this.stowed.visible=true;
  this.root.updateWorldMatrix(true,true);this.#arm('L',grips?.left,false);this.#arm('R',grips?.right,false);
 }
 releaseStanding(){if(!this.standingActive)return;if(this.sword)this.sword.visible=this.standingSwordVisible;if(this.stowed)this.stowed.visible=false;this.standingActive=false;}
 #arm(side,grip,seated=true){
  if(!grip)return;
  const a=this.bone('upper_arm.'+side),b=this.bone('forearm.'+side),c=this.bone('hand.'+side);
  if(!a||!b||!c)return;
  const wristQ=c.getWorldQuaternion(new THREE.Quaternion());
  const local=this.root.worldToLocal(grip.clone()).add(seated?new THREE.Vector3(0,-.02,.12):new THREE.Vector3());
  const end=this.root.localToWorld(local),start=a.getWorldPosition(new THREE.Vector3());
  const elbow=b.getWorldPosition(new THREE.Vector3()),wrist=c.getWorldPosition(new THREE.Vector3());
  const l1=start.distanceTo(elbow),l2=elbow.distanceTo(wrist),axis=end.clone().sub(start).normalize();
  const d=Math.max(.001,Math.min(start.distanceTo(end),l1+l2-.001));
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const pole=elbow.clone().sub(start);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  const target=start.clone().addScaledVector(axis,along).addScaledVector(pole,height);
  this.#aim(a,b,target);this.#aim(b,c,end);
  c.quaternion.copy(c.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wristQ));c.updateMatrixWorld(true);
 }
 #aim(bone,child,target){
  const start=bone.getWorldPosition(new THREE.Vector3());
  const from=child.getWorldPosition(new THREE.Vector3()).sub(start).normalize();
  const to=target.clone().sub(start).normalize();
  const delta=new THREE.Quaternion().setFromUnitVectors(from,to);
  const world=bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));bone.updateMatrixWorld(true);
 }
 release(){
  if(!this.active)return false;
  for(const [bone,t] of this.rest){bone.position.copy(t.p);bone.quaternion.copy(t.q);}
  if(this.sword)this.sword.visible=this.swordVisible;
  if(this.stowed)this.stowed.visible=false;
  this.active=false;return true;
 }
 dispose(){this.releaseStanding();this.release();this.stowed?.removeFromParent();this.stowed?.traverse(o=>o.geometry?.dispose());}
}
