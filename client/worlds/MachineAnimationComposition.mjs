import * as THREE from 'three';
// Deterministic, rest-relative animation composition. Tracks are filtered before
// sampling. No AnimationAction weights can resurrect another owner's property.
export class MachineAnimationComposition{
 constructor(root,clips){
  this.root=root;this.clips=new Map();this.bindings=new Map();this.previous=new Map();this.transitions=new Map();
  for(const clip of clips){
   const tracks=[];
   for(const track of clip.tracks){
    const parsed=THREE.PropertyBinding.parseTrackName(track.name),node=THREE.PropertyBinding.findNode(root,parsed.nodeName),property=parsed.propertyName;
    if(!node||!['position','quaternion','scale'].includes(property))continue;
    const key=node.uuid+'.'+property;
    if(!this.bindings.has(key))this.bindings.set(key,{node,property,rest:node[property].clone()});
    tracks.push({name:node.name+'.'+property,key,node,property,interpolant:track.createInterpolant()});
   }
   this.clips.set(clip.name,{duration:clip.duration,tracks});
  }
 }
 begin(dt){this.dt=dt;for(const b of this.bindings.values())b.node[b.property].copy(b.rest);for(const b of this.extra??[])b.node[b.property].copy(b.rest);}
 shell(name){
  const node=this.root.getObjectByName(name);if(!node)return null;
  const shell=new THREE.Group();shell.name=name+'_Visual_Deformation';
  const semanticNodes=new Set([...this.bindings.values()].map(b=>b.node));
  for(const child of [...node.children])if(child.isMesh&&child.name.startsWith(node.name+'_')&&!semanticNodes.has(child))shell.add(child);
  if(node.isMesh){const visual=new THREE.Mesh(node.geometry,node.material);visual.name=name+'_Visual_Surface';shell.add(visual);node.geometry=new THREE.BufferGeometry();node.geometry.setAttribute('position',new THREE.Float32BufferAttribute([],3));}
  node.add(shell);this.extra??=[];
  for(const property of ['position','quaternion','scale'])this.extra.push({node:shell,property,rest:shell[property].clone()});
  return shell;
 }
 sample(spec,filter,{weight=1,additive=false,remap=null,transition=null}={}){
  const clip=this.clips.get(spec?.clip);if(!clip||weight<=0)return;
  const time=spec.loop?((spec.time%clip.duration)+clip.duration)%clip.duration:Math.max(0,Math.min(clip.duration,spec.time));
  let fade=1,previous;
  if(transition){
   let state=this.transitions.get(transition);
   if(state?.clip!==spec.clip){state={clip:spec.clip,age:0,pose:new Map()};for(const t of clip.tracks){const old=this.previous.get(t.key);if(old)state.pose.set(t.key,old.clone());}this.transitions.set(transition,state);}
   state.age+=this.dt;fade=Math.min(1,state.age/.16);previous=state.pose;
  }
  for(const track of clip.tracks){
   if(!filter(track.name))continue;
   const binding=this.bindings.get(track.key),target=remap?.(track)??track.node,property=track.property,value=target[property];
   const numbers=track.interpolant.evaluate(time),isQ=property==='quaternion';
   const sampled=isQ?new THREE.Quaternion().fromArray(numbers):new THREE.Vector3().fromArray(numbers);
   if(additive){
    // Deltas are against the actual glTF rest, NOT frame zero: damage clips
    // begin already buckled and must retain that initial deformation.
    if(isQ)value.multiply(new THREE.Quaternion().slerp(sampled.premultiply(binding.rest.clone().invert()),weight));
    else if(property==='position')value.addScaledVector(sampled.sub(binding.rest),weight);
    else value.multiply(new THREE.Vector3(1,1,1).lerp(sampled.divide(binding.rest),weight));
   }else{
    const old=previous?.get(track.key);
    if(old&&fade<1){if(isQ)sampled.copy(old).slerp(new THREE.Quaternion().fromArray(numbers),fade);else sampled.copy(old).lerp(new THREE.Vector3().fromArray(numbers),fade);}
    if(isQ)value.slerp(sampled,weight);else value.lerp(sampled,weight);
   }
  }
 }
 end(){for(const [key,b] of this.bindings){let value=this.previous.get(key);if(!value){value=b.node[b.property].clone();this.previous.set(key,value);}else value.copy(b.node[b.property]);}}
}
