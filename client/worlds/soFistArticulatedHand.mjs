import * as THREE from 'three';

// Retain the production hydraulic fist pivot, but REPLACE its closed armor
// geometry with the donor's articulated shell and fingers. Grafting only the
// fingers leaves the original closed fist inside the new open palm.
export function graftArticulatedFist(target,donor){
  if(!target||!donor)throw new Error('Armored fist pivot and articulated donor are required');
  // Capture only ORIGINAL meshes before moving anything from the donor.
  const legacy=[];
  target.traverse(part=>{if(part.isMesh)legacy.push(part);});
  for(const part of legacy)if(part!==target)part.visible=false;
  if(target.isMesh){
    // A mesh pivot cannot itself be hidden: doing so hides every finger.
    // Make its surface the donor's surface (or empty for an authored group).
    target.geometry=donor.isMesh?donor.geometry:new THREE.BufferGeometry();
    if(donor.isMesh)target.material=donor.material;
  }else if(donor.isMesh){
    const surface=new THREE.Mesh(donor.geometry,donor.material);
    surface.name='Argon_Articulated_Hand_Surface';
    target.add(surface);
  }
  for(const part of [...donor.children])target.add(part);
  return {hiddenLegacyMeshes:legacy.filter(part=>part!==target).length};
}
