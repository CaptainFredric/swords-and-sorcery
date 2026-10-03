import * as THREE from 'three';
// A menu owned morph for rigid finger segments. The exported source and shared mesh stay intact.
export function createArmoryHand(instance) {
  const entries=[];
  instance.root.traverse((mesh)=>{
    if (!mesh.isSkinnedMesh || !/^Gauntlet[_.]?L/.test(mesh.name)) return;
    const joint=mesh.skeleton.bones.findIndex((b)=>/^hand[_.]?L$/.test(b.name));
    if (joint<0) return;
    const original=mesh.geometry, geometry=original.clone();
    const base=geometry.attributes.position, closed=base.clone();
    const toHand=mesh.skeleton.boneInverses[joint].clone().multiply(mesh.bindMatrix);
    const fromHand=toHand.clone().invert();
    const p=new THREE.Vector3();
    for (let i=0;i<base.count;i++) {
      let weight=0;
      for(let k=0;k<4;k++) if(geometry.attributes.skinIndex.getComponent(i,k)===joint) weight+=geometry.attributes.skinWeight.getComponent(i,k);
      if(weight<.95) continue;
      p.fromBufferAttribute(base,i).applyMatrix4(toHand);
      if(p.y<=.125) continue;
      const reach=p.y-.125, z=p.z;
      p.y=.125+reach*Math.cos(-1.15)-z*Math.sin(-1.15);
      p.z=reach*Math.sin(-1.15)+z*Math.cos(-1.15);
      p.applyMatrix4(fromHand);
      closed.setXYZ(i,p.x,p.y,p.z);
    }
    geometry.morphAttributes.position=[closed];
    geometry.morphTargetsRelative=false;
    mesh.geometry=geometry;
    mesh.updateMorphTargets();
    entries.push({mesh,original,geometry});
  });
  return {set:(amount)=>{for(const {mesh} of entries)mesh.morphTargetInfluences[0]=amount;},dispose:()=>{for(const {mesh,original,geometry}of entries){mesh.geometry=original;mesh.updateMorphTargets();geometry.dispose();}}};
}
