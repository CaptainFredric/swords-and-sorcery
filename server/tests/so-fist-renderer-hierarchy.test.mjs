import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredHierarchyIssues,RAM_REQUIRED_PARENTS,FIST_REQUIRED_PARENTS} from '../../client/worlds/soFistAssetHierarchy.mjs';
function tree(edges){
 const nodes=new Map();
 const node=name=>{if(!nodes.has(name))nodes.set(name,{name,parent:null});return nodes.get(name);};
 for(const [parent,child] of edges)node(child).parent=node(parent);
 return {getObjectByName:name=>nodes.get(name)};
}
test('authored ram hierarchy accepts complete correct direct parentage',()=>{
 assert.deepEqual(authoredHierarchyIssues(tree(RAM_REQUIRED_PARENTS),RAM_REQUIRED_PARENTS),[]);
});
test('missing hydraulic node and reparented striker cannot silently pass',()=>{
 const scene=tree(RAM_REQUIRED_PARENTS);
 scene.getObjectByName('Ram_Shaft_Piston').parent=scene.getObjectByName('BattleRam_Root');
 assert.deepEqual(authoredHierarchyIssues(scene,RAM_REQUIRED_PARENTS),
  ['Ram_Assembly -> Ram_Shaft_Piston']);
 const missing=tree(RAM_REQUIRED_PARENTS.filter(([,child])=>child!=='Elevation_Pitch_Rods_Upper'));
 assert.ok(authoredHierarchyIssues(missing,RAM_REQUIRED_PARENTS).includes('Upper_Elevation_Pivot -> Elevation_Pitch_Rods_Upper'));
});
test('detached fist needs actual COM and socket hierarchy',()=>{
 const scene=tree(FIST_REQUIRED_PARENTS);
 assert.deepEqual(authoredHierarchyIssues(scene,FIST_REQUIRED_PARENTS),[]);
 scene.getObjectByName('fist_projectile_body_center').parent=null;
 assert.deepEqual(authoredHierarchyIssues(scene,FIST_REQUIRED_PARENTS),
  ['Armored_Fist_Detachable -> fist_projectile_body_center']);
});

test('a chassis-bound stator, moving-side collar on the fist, or missing lift barrels selects rollback',()=>{
 const scene=tree(RAM_REQUIRED_PARENTS);
 for(const name of ['Arcane_Stator_Collar','Wrist_Resonator_Ring','Hydraulic_Lift_Barrels_Fixed']){
  const node=scene.getObjectByName(name);
  assert.ok(node,name+' is required for the live rig');
  node.parent=null;
 }
 assert.deepEqual(authoredHierarchyIssues(scene,RAM_REQUIRED_PARENTS).sort(),[
  'Lower_Wheel_Carriage -> Hydraulic_Lift_Barrels_Fixed',
  'Ram_Assembly -> Wrist_Resonator_Ring',
  'Upper_Elevation_Pivot -> Arcane_Stator_Collar',
 ].sort());
});
