import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {flightChannelOwner} from './flightAnimationState.mjs';
const read=path=>{const b=readFileSync(new URL('../../'+path,import.meta.url));return {bytes:b,g:JSON.parse(b.subarray(20,20+b.readUInt32LE(12)))};};
const flight=read('client/assets/props/fight-and-flight/fight-and-flight-v30-sim19p5-dash.glb');
test('exact delivered assets and review-only Spellblades preserve their contracts',()=>{
 for(const [path,hash,clips]of[
 ['client/assets/props/fight-and-flight/fight-and-flight-v30-sim19p5-dash.glb','b7967ba87ffa0f4ad6f1ee54d7e6897eb8e993e8407dc567817c4a2725fc0d6b',54],
 ['client/assets/props/so-fist-ication/so-fist-ication-v2_7.glb','21219a43541c78926b00365ddda6ad10501216c1c48fe3b24be984cad5822feb',10],
 ['assets/source/argon-review/spellblade-v2.9-review-only.glb','a1d4e3e63412fe13ac2fc4f254e455499bed075d32f8f9422c9ccf86b0801d1c',12],
 ['assets/source/argon-review/spellblade-v30-refined-candidate.glb','b87eb19f7f22b7dc542f8c5f2806a923518ff58e16e87d6cba76982cf0007738',12],
 ['assets/source/argon-review/spellblade-v31-ingame-review-candidate.glb','4fddfe876fb2067a1b60d633c4e1fad77a1379568dfa2d7ead1a7f998015c97b',12]]){
  const {bytes,g}=read(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);assert.equal(g.animations.length,clips);
  if(path.includes('spellblade-v')){assert.equal(g.skins[0].joints.length,27);assert.equal(g.materials.length,6);}
 }
 const manifest=readFileSync(new URL('../assets/characters/spellblade/manifest.json',import.meta.url),'utf8');assert.ok(manifest.includes('359f24af1f618cfa0f58d6d3f704dc069e083a23'));assert.ok(!manifest.includes('review-only'));
});
test('actual full Dash exports contain dangerous overlaps excluded from live posture ownership',()=>{
 const g=flight.g;
 for(const name of ['Posture_12_Offensive_Dash_Entry_Hold_Recovery','Dash_01_Sustained_Attack_Flight_Loop','Dash_02_Release_Flare_Brake_And_Recovery']){
  const clip=g.animations.find(c=>c.name===name);assert.equal(clip.channels.length,81);
  const owners=clip.channels.map(c=>flightChannelOwner(g.nodes[c.target.node].name+'.'+c.target.path));
  assert.ok(owners.includes('authority'));assert.ok(owners.includes('braceL'));assert.ok(owners.includes('braceR'));
  assert.ok(owners.includes('posture'));assert.ok(owners.includes('sword'));
 }
});
test('new destruction samples expose broken brace geometry and retain six independent ammo nodes',()=>{
 const g=flight.g,clip=g.animations.find(c=>c.name==='Destruction_Airborne_03_Ground_Impact_To_Ruined_Rest');
 for(const name of ['Protective_Brace_L_Damaged','Protective_Brace_R_Damaged'])assert.ok(clip.channels.some(c=>g.nodes[c.target.node].name===name&&c.target.path==='scale'));
 assert.equal(g.nodes.filter(n=>/^Quarrel_Visual_/.test(n.name)).length,6);
});

test('narrowed production clips own only posture, rider lean or low priority sword',()=>{
 const g=flight.g;
 for(let i=49;i<=53;i++){
  const clip=g.animations[i];assert.ok(clip.name.startsWith('Dash_Narrowed_'));
  assert.equal(clip.channels.length,i===52?12:24);
  for(const c of clip.channels){const owner=flightChannelOwner(g.nodes[c.target.node].name+'.'+c.target.path);assert.ok((i===52?['sword']:['posture','rider']).includes(owner),clip.name+':'+owner);}
 }
});
