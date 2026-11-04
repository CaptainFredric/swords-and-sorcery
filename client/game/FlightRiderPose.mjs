import * as THREE from 'three';
import {FLIGHT_RIDER_POSTURE as DATA} from './flightRiderPosture.mjs';
import {RamOperatorPose} from './RamOperatorPose.mjs';
const clean=name=>name.replace(/[[\].:/]/g,'');
// Candidate bones have identity rest rotations. Retarget their world-space
// rotation deltas into the production rig's actual rest bases and lengths.
// Root and pelvis rotation are deliberately excluded: the carriage owns pitch.
export class FlightRiderPose{
 constructor(root,bones,arms,soles){
  this.root=root;this.bones=bones;this.arms=arms;this.soles=soles;this.saved=null;this.weight=0;this.contacts=new Map();
  this.legs=new RamOperatorPose(root,bones,arms,soles);this.rest=new Map();
  root.updateWorldMatrix(true,true);const inv=root.getWorldQuaternion(new THREE.Quaternion()).invert();
  for(const [name,b]of bones)this.rest.set(name,b.getWorldQuaternion(new THREE.Quaternion()).premultiply(inv));
  this.tracks=DATA.tracks.map(t=>({...t,curve:new THREE.QuaternionKeyframeTrack(t.bone,t.times,t.values.flat()).createInterpolant()}));
 }
 restore(){if(!this.saved)return;for(const [bone,t]of this.saved){bone.quaternion.copy(t.q);bone.position.copy(t.p);}this.saved=null;}
 apply(grips,m,now,priority=false,dt=1/60){
  if(!m||!grips)return;
  if(this.id!==m.id||now-(this.lastAt??now)>.25){this.id=m.id;this.weight=0;}this.lastAt=now;
  this.saved=new Map([...this.bones.values()].map(b=>[b,{q:b.quaternion.clone(),p:b.position.clone()}]));
  const pelvis=this.bones.get('pelvis');if(pelvis&&pelvis.parent&&grips.pelvis){pelvis.position.copy(pelvis.parent.worldToLocal(grips.pelvis.clone()));pelvis.updateMatrixWorld(true);}
  const wanted=m.offensiveRun?1:0;this.weight+=(wanted-this.weight)*(1-Math.exp(-Math.max(0,dt)*10));
  const age=Math.max(0,now-(m.runAnimationStartedAt??now));
  // Entry contains recovery too; keep the deliberate mid-clip hold while held.
  const time=m.offensiveRun?Math.min(.8,age):Math.min(1.8,1.1+Math.max(0,now-(m.runAnimationEndedAt??now)));
  const sourceLocal=new Map(this.tracks.map(t=>[t.bone,new THREE.Quaternion().fromArray(t.curve.evaluate(time))]));
  const sourceWorld=new Map();
  const world=name=>{if(!name||name==='pelvis'||name==='root')return new THREE.Quaternion();if(!sourceWorld.has(name))sourceWorld.set(name,world(DATA.parents[name]).clone().multiply(sourceLocal.get(name)??new THREE.Quaternion()));return sourceWorld.get(name);};
  const rootInverse=this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
  for(const track of this.tracks){
   if(!/^(spine|chest|neck|head|clavicle|upper_arm|forearm|hand)/.test(track.bone))continue;
   if(priority&&/\.[R]$/.test(track.bone))continue;
   const name=clean(track.bone),bone=this.bones.get(name),rest=this.rest.get(name);if(!bone||!rest||!bone.parent)continue;
   // Source rotation deltas are anatomical world axes, not target bone axes.
   // Parent world rotations are accounted for once, preserving production bases.
   const align=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
   const delta=align.clone().multiply(world(track.bone)).multiply(align.clone().invert());
   const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInverse);
   const local=parent.invert().multiply(delta.multiply(rest));
   bone.quaternion.slerp(local,this.weight);bone.updateMatrixWorld(true);
  }
  this.root.updateWorldMatrix(true,true);
  const rootQ=this.root.getWorldQuaternion(new THREE.Quaternion()),up=new THREE.Vector3(0,1,0).applyQuaternion(rootQ);
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
  const targets=[];
  for(const side of ['L','R']){
   const foot=this.bones.get(clean('foot.'+side)),target=side==='L'?grips.leftFoot:grips.rightFoot;if(!foot||!target)continue;
   if(!this.contacts.has(side)){
    const q=foot.getWorldQuaternion(new THREE.Quaternion());
    const points=(this.soles.get('foot.'+side)??[]).map(p=>foot.localToWorld(p.clone()));
    const low=Math.min(...points.map(p=>p.dot(up))),sole=points.filter(p=>p.dot(up)<low+.012);
    const center=sole.length?sole.reduce((v,p)=>v.add(p),new THREE.Vector3()).multiplyScalar(1/sole.length):foot.getWorldPosition(new THREE.Vector3()).addScaledVector(up,-.105);
    this.contacts.set(side,{offset:foot.worldToLocal(center),rest:q.premultiply(rootQ.clone().invert())});
   }
   const contact=this.contacts.get(side),machineQ=side==='L'?grips.leftFootQ:grips.rightFootQ;
   const q=machineQ?machineQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI)).multiply(contact.rest):rootQ.clone().multiply(contact.rest);
   targets.push({side,foot,q,end:target.clone().sub(contact.offset.clone().applyQuaternion(q))});
  }
  // The production legs are shorter than the reference rig. Let the pelvis
  // settle by at most 15 cm inside the waist harness instead of stretching boots.
  let settle=0;
  for(const {side,foot,end}of targets){
   const hip=this.bones.get(clean('thigh.'+side)),knee=this.bones.get(clean('shin.'+side));if(!hip||!knee)continue;
   const start=hip.getWorldPosition(new THREE.Vector3()),middle=knee.getWorldPosition(new THREE.Vector3()),ankle=foot.getWorldPosition(new THREE.Vector3());
   const length=start.distanceTo(middle)+middle.distanceTo(ankle)-.003,delta=end.clone().sub(start),vertical=-delta.dot(up),horizontalSq=Math.max(0,delta.lengthSq()-vertical*vertical);
   // Solve the reach sphere exactly along the harness axis. Linearizing the
   // distance leaves a visible gap near full extension during sprint recovery.
   if(delta.length()>length&&vertical>0)settle=Math.max(settle,vertical-Math.sqrt(Math.max(0,length*length-horizontalSq)));
  }
  this.harnessSettle=settle;
  if(pelvis&&pelvis.parent&&settle>0){const at=pelvis.getWorldPosition(new THREE.Vector3()).addScaledVector(up,-Math.min(.15,settle));pelvis.position.copy(pelvis.parent.worldToLocal(at));pelvis.updateMatrixWorld(true);}
  for(const {side,foot,q,end}of targets){
   if(this.legs?.leg)this.legs.leg(side,end,forward);
   if(foot&&foot.parent){foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));foot.updateMatrixWorld(true);}
  }
  this.arms?.applyFlight?.(grips,priority);
 }
}
