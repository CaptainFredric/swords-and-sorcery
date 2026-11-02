import * as THREE from 'three';
const clean=s=>s.replace(/[[\].:/]/g,'');
// Review-only: bake existing production motion into each candidate's actual
// rest bases. Preserve candidate bone lengths, mesh, materials and skin weights.
export function retargetClips(source,target,clips){
 const bones=root=>{const b=[];root.traverse(n=>{if(n.isBone)b.push(n);});return b;};
 const sb=bones(source),tb=bones(target),sourceByName=new Map(sb.map(b=>[clean(b.name),b]));
 source.updateMatrixWorld(true);target.updateMatrixWorld(true);
 const sq=source.getWorldQuaternion(new THREE.Quaternion()).invert(),tq=target.getWorldQuaternion(new THREE.Quaternion()).invert();
 const alignment=tq.clone().multiply(sq.clone().invert()),alignmentInverse=alignment.clone().invert();
 const sr=new Map(sb.map(b=>[b,b.getWorldQuaternion(new THREE.Quaternion()).premultiply(sq).invert()]));
 const tr=new Map(tb.map(b=>[b,b.getWorldQuaternion(new THREE.Quaternion()).premultiply(tq)]));
 const rest=new Map(sb.map(b=>[b,{p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}]));
 const mixer=new THREE.AnimationMixer(source),results=[];
 for(const clip of clips){
  mixer.stopAllAction();for(const [b,r]of rest){b.position.copy(r.p);b.quaternion.copy(r.q);b.scale.copy(r.s);}
  const action=mixer.clipAction(clip);action.play();action.paused=true;
  const count=Math.ceil(clip.duration*30),times=Array.from({length:count+1},(_,i)=>Math.min(clip.duration,i/30));
  const pelvis=tb.find(b=>clean(b.name)==='pelvis'),sourcePelvis=sourceByName.get('pelvis'),pelvisValues=[];
  const values=new Map(tb.filter(b=>sourceByName.has(clean(b.name))).map(b=>[b,[]]));
  for(const time of times){
   action.time=time;mixer.update(0);source.updateMatrixWorld(true);
   if(pelvis&&sourcePelvis){const delta=sourcePelvis.position.clone().sub(rest.get(sourcePelvis).p).applyQuaternion(alignment);pelvisValues.push(...pelvis.position.clone().add(delta).toArray());}
   const desired=new Map();
   for(const b of tb){
    const src=sourceByName.get(clean(b.name));
    let world=tr.get(b).clone();
    if(src){const delta=src.getWorldQuaternion(new THREE.Quaternion()).premultiply(sq).multiply(sr.get(src));world=alignment.clone().multiply(delta).multiply(alignmentInverse).multiply(world);}
    desired.set(b,world);
    const parent=desired.get(b.parent)??new THREE.Quaternion();
    if(values.has(b))values.get(b).push(...parent.clone().invert().multiply(world).toArray());
   }
  }
  const tracks=[...values].map(([b,v])=>new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',times,v));
  if(pelvisValues.length)tracks.push(new THREE.VectorKeyframeTrack(pelvis.name+'.position',times,pelvisValues));
  results.push(new THREE.AnimationClip(clip.name,clip.duration,tracks));
 }
 mixer.stopAllAction();for(const[b,r]of rest){b.position.copy(r.p);b.quaternion.copy(r.q);b.scale.copy(r.s);}source.updateMatrixWorld(true);
 return results;
}
