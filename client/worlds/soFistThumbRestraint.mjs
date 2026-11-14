import * as THREE from 'three';

// Preserve Argon's authentic index-finger flick and all its contact timing.
// The v26 thumb's extreme reverse extension reads as a dislocated thumb,
// not as a bracing hand. Keep the curled preparation as the thumb's anchor;
// allow a little lowering/compliance while the index snaps.
const THUMB_NAMES=['Thumb_1','Thumb_2','Thumb_3'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const easing=t=>t*t*(3-2*t);
export function createFlickThumbRestraint(root,clips){
 const clip=clips.find(v=>v.name==='23_Finger_Flick_Single_Target_Strike');
 if(!clip||!root)return [];
 return THUMB_NAMES.flatMap((name,index)=>{
  const node=root.getObjectByName(name);
  const track=clip.tracks.find(v=>v.name===name+'.quaternion');
  if(!node||!track)return [];
  const prepared=new THREE.Quaternion().fromArray(track.createInterpolant().evaluate(.40));
  return [{name,node,index,prepared,rest:node.quaternion.clone()}];
 });
}
export function restrainFlickThumb(parts,age){
 if(!parts?.length||!Number.isFinite(age)||age<.4||age>=4)return;
 const settle=easing(clamp((age-3.25)/.6,0,1));
 const begin=easing(clamp((age-.4)/.19,0,1));
 for(const part of parts){
  const target=part.prepared.clone().slerp(part.rest,settle);
  // A small downward bend instead of the authored violent thumb hyperextension.
  const lower=(.12-part.index*.035)*(1-settle)*begin;
  target.multiply(new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1,0,0),-lower));
  const deviation=target.angleTo(part.node.quaternion);
  // Retain animation response while bounding the thumb to a believable
  // articulated arc; the index's three joints are NEVER constrained.
  const tolerance=.17+part.index*.035;
  const keep=deviation>1e-5?Math.min(.16,tolerance/deviation):0;
  const moderated=target.slerp(part.node.quaternion,keep);
  part.node.quaternion.slerp(moderated,begin);
 }
}
