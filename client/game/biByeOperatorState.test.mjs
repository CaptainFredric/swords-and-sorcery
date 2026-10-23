import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BI_BYE_OPERATOR_POSES as data } from './biByeOperatorPoses.mjs';
import { biByeOperatorReach } from './biByeOperatorState.mjs';
test('seated poses match the actual production binary and retain its bone lengths',()=>{
 const bytes=readFileSync(new URL('../assets/characters/spellblade/spellblade.glb',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),data.characterSha256);
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 for(const pose of Object.values(data.poses))for(const i of gltf.skins[0].joints){
  const node=gltf.nodes[i],p=pose[node.name];assert.ok(p,node.name);
  // The rear cloth anchor moves 55 mm to clear the backrest; skeletal limbs retain their lengths.
  if(node.name!=='tabard_back_01')p.position.forEach((x,k)=>assert.ok(Math.abs(x-(node.translation?.[k]??0))<.00001,`${node.name} joint length changed`));
  assert.ok(Math.abs(Math.hypot(...p.quaternion)-1)<1e-6,node.name);
 }
});
test('one right hand reaches the lever then returns after releasing it',()=>{
 assert.equal(biByeOperatorReach({coupling:'INDEPENDENT'},3),0);
 assert.equal(biByeOperatorReach({coupling:'ENGAGING',couplingStartedAt:1},1),0);
 assert.equal(biByeOperatorReach({coupling:'ENGAGING',couplingStartedAt:1},1.35),1);
 assert.equal(biByeOperatorReach({coupling:'FIRING'},3),1);
 assert.equal(biByeOperatorReach({coupling:'RELEASING',couplingStartedAt:2},2),1);
 assert.equal(biByeOperatorReach({coupling:'RELEASING',couplingStartedAt:2},2.6),0);
});
