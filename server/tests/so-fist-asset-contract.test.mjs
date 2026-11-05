import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// This intentionally fails before the two Argon binaries are committed.
// The legacy GLB fallback is useful at runtime, but must never allow the
// elevating-ram PR to be merged as "finished" without its actual geometry.
const expected={
  main:{
    url:new URL('../../client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb',import.meta.url),
    sha:'bab81d9861a80e8339bd7bb479e5f41770c6acdbec22d36eb94e262d986b0efd',
    size:6502480,
  },
  fist:{
    url:new URL('../../client/assets/props/so-fist-ication/so-fist-ication-detached-fist.glb',import.meta.url),
    sha:'5e7802eacdb8ff252a0f575a3ba002287a51e73fccbd6e2a22f89a1c957597e4',
    size:214728,
  },
  blend:{
    url:new URL('../../assets/source/so-fist-ication/SoFist-elevating-ram-source.blend',import.meta.url),
    sha:'f8481439b5429ed0aa00c0b53c8dbc869a7c0781e7e92160f7bd221aab5c2d9e',
    size:4006788,
  },
};
function verifiedBytes(asset,label){
  let bytes;
  try{bytes=readFileSync(asset.url);}
  catch(error){
    if(error?.code==='ENOENT')assert.fail(
      'Missing '+label+' binary. Extract SO_FIST_ICATION_PR366_Ready_to_Stage.zip at the repository root and commit the assets to the PR branch.');
    throw error;
  }
  assert.equal(bytes.length,asset.size,label+' byte length differs from handoff');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha,
    label+' hash differs from the actual inspected Argon handoff');
  return bytes;
}
function glbJson(bytes){
  assert.equal(bytes.toString('ascii',0,4),'glTF','GLB header');
  assert.equal(bytes.readUInt32LE(4),2,'glTF 2.0 required');
  assert.equal(bytes.readUInt32LE(8),bytes.length,'GLB declared length');
  const chunkSize=bytes.readUInt32LE(12);
  assert.equal(bytes.toString('ascii',16,20),'JSON','GLB first chunk must be JSON');
  assert.ok(chunkSize>0&&chunkSize<bytes.length-20,'GLB JSON size');
  return JSON.parse(bytes.subarray(20,20+chunkSize).toString('utf8'));
}
const nodeIndex=(g,name)=>g.nodes.findIndex(n=>n.name===name);
function childOf(g,parent,child){
  const p=nodeIndex(g,parent),c=nodeIndex(g,child);
  assert.ok(p>=0,'missing '+parent+' node');
  assert.ok(c>=0,'missing '+child+' node');
  assert.ok(g.nodes[p].children?.includes(c),child+' must be parented to '+parent);
}
test('Argon main elevating ram binary and authored pivot hierarchy are present',()=>{
  const glb=glbJson(verifiedBytes(expected.main,'elevating ram'));
  assert.equal(glb.nodes.length,45,'main node count');
  assert.equal(glb.meshes.length,23,'main mesh count');
  assert.equal(glb.animations.length,10,'preserved v2.7 animations');
  childOf(glb,'BattleRam_Root','Lower_Wheel_Carriage');
  childOf(glb,'BattleRam_Root','Upper_Ram_Lift');
  childOf(glb,'Lower_Wheel_Carriage','Hydraulic_Lift_Stage1_Mid');
  childOf(glb,'Upper_Ram_Lift','Elevation_Pitch_Barrels_Lower');
  childOf(glb,'Upper_Ram_Lift','Upper_Elevation_Pivot');
  childOf(glb,'Upper_Elevation_Pivot','Elevation_Pitch_Rods_Upper');
  childOf(glb,'Upper_Elevation_Pivot','Ram_Assembly');
  childOf(glb,'Ram_Assembly','Armored_Fist');
  childOf(glb,'Armored_Fist','fist_projectile_body_center');
  childOf(glb,'Ram_Assembly','Ram_Shaft_Piston');
  childOf(glb,'Ram_Shaft_Piston','piston_exposed_striker_tip');
  childOf(glb,'Lower_Wheel_Carriage','operator_onboard_rider');
  assert.deepEqual(glb.nodes[nodeIndex(glb,'Upper_Ram_Lift')].translation,
    [0,.22,-.2125],'authored lift saddle rest must match authoritative simulation');
  assert.deepEqual(glb.nodes[nodeIndex(glb,'Upper_Elevation_Pivot')].translation,
    [0,.165,-.3475],'authored pitch pivot must stay in the rear trunnion');
  assert.ok(glb.animations.some(a=>a.name==='01_Ram_Strike_Full_Cycle'),
    'original 4s punch clip must survive');
  assert.ok(glb.animations.some(a=>a.name==='10_Comp_Wheel_And_Drive_Damage_Repairable'),
    'original damage/repair clip must survive');
});
test('Argon detachable fist matches main gauntlet COM/socket and ground contact',()=>{
  const glb=glbJson(verifiedBytes(expected.fist,'detached fist'));
  assert.equal(glb.nodes.length,6,'binary contains 6 nodes, NOT 8 as in markdown');
  assert.equal(glb.meshes.length,1);
  childOf(glb,'Fist_Detached_Root','Armored_Fist_Detachable');
  for(const name of ['fist_projectile_body_center','fist_coupling_socket_origin',
    'fist_knuckle_impact_face','fist_ground_rest_contact'])
    childOf(glb,'Armored_Fist_Detachable',name);
  assert.deepEqual(glb.nodes[nodeIndex(glb,'fist_projectile_body_center')].translation,
    [0,.015,.215],'physical launcher uses this COM');
  const rest=glb.nodes[nodeIndex(glb,'fist_ground_rest_contact')].translation;
  assert.ok(Math.abs(rest[1]+.199469)<.000001,'ground contact must match actual GLB');
});
test('editable Argon Blender source is present and unchanged',()=>{
  verifiedBytes(expected.blend,'editable .blend source');
});
