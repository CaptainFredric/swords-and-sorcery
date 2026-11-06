// Runtime guard against partial or mismatched Argon exports. The server's
// exact-byte contract remains authoritative; this prevents bad visual pivots
// from corrupting the mounted ram when an asset is served incorrectly.
export const RAM_REQUIRED_PARENTS=Object.freeze([
 ['BattleRam_Root','Lower_Wheel_Carriage'],
 ['BattleRam_Root','Upper_Ram_Lift'],
 ['Lower_Wheel_Carriage','Hydraulic_Lift_Stage1_Mid'],
 ['Upper_Ram_Lift','Upper_Elevation_Pivot'],
 ['Upper_Ram_Lift','Elevation_Pitch_Barrels_Lower'],
 ['Upper_Elevation_Pivot','Elevation_Pitch_Rods_Upper'],
 ['Upper_Elevation_Pivot','Ram_Assembly'],
 ['Ram_Assembly','Armored_Fist'],
 ['Armored_Fist','fist_projectile_body_center'],
 ['Ram_Assembly','Ram_Shaft_Piston'],
 ['Ram_Shaft_Piston','piston_exposed_striker_tip'],
]);
export const FIST_REQUIRED_PARENTS=Object.freeze([
 ['Fist_Detached_Root','Armored_Fist_Detachable'],
 ...['fist_projectile_body_center','fist_coupling_socket_origin',
 'fist_knuckle_impact_face','fist_ground_rest_contact']
 .map(name=>['Armored_Fist_Detachable',name]),
]);
export function authoredHierarchyIssues(scene,requirements){
 const issues=[];
 for(const [parentName,childName] of requirements){
  const parent=scene?.getObjectByName?.(parentName);
  const child=scene?.getObjectByName?.(childName);
  if(!parent||!child||child.parent!==parent)
   issues.push(parentName+' -> '+childName);
 }
 return issues;
}
