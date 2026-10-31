import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HIGH_GROUNDS } from '../../shared/worlds/highGrounds.mjs';
import { buildHighGroundsDecks, buildHighGroundsSurroundings, buildHighGroundsDetail,
  highGroundsSceneryMaterials } from '../../client/worlds/highGroundsScenery.mjs';
import { HighGroundsRenderer, HIGH_GROUNDS_LIGHTING } from '../../client/worlds/HighGroundsRenderer.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { navGraph, runClear } from '../../shared/sim/botNav.mjs';

test('entrance deck triangles are welded with no co-planar duplicates',()=>{
  const group=new THREE.Group();
  const mats={stone:new THREE.MeshBasicMaterial(),timber:new THREE.MeshBasicMaterial(),
    ...highGroundsSceneryMaterials()};
  buildHighGroundsDecks(group,HIGH_GROUNDS,mats);
  const top=group.children.filter(x=>x.name.startsWith('joined-'));
  assert.ok(top.length>=2);
  const keys=new Set();
  let triangles=0;
  for(const m of top){
    const pts=m.geometry.getAttribute('position');
    for(let i=0;i<pts.count;i+=3) {
      const v=[0,1,2].map(j=>[pts.getX(i+j),pts.getY(i+j),pts.getZ(i+j)].map(n=>n.toFixed(3)).join(','));
      const key=v.sort().join('|');
      assert.ok(!keys.has(key), 'flickering duplicate triangle at '+key);
      keys.add(key);triangles++;
    }
  }
  assert.ok(triangles>100,'deck partition has real continuous surface coverage');
  // Not a cosmetic level offset: entrance landings are authoritative.
  for(const z of [-105,-99,-91,-85,-81,-69,69,81,85,91,99,105])
    assert.equal(surfaceHeightAt(0,z,2,HIGH_GROUNDS),0,`camp road unsupported at ${z}`);
  group.traverse(m=>m.geometry?.dispose?.());
  for(const m of Object.values(mats))m.dispose();
});
test('distant environment is visible, but never becomes false collision ground',()=>{
  const scene=new THREE.Scene();
  const renderer=new HighGroundsRenderer(scene);
  assert.equal(renderer.lighting.background,HIGH_GROUNDS_LIGHTING.background);
  assert.ok(renderer.lighting.cameraFar>=500);
  assert.ok(renderer.group.children.some(x=>x.name==='far-valley-landscape-below-abyss'));
  assert.ok(renderer.group.children.some(x=>x.name.startsWith('distant-highland-')));
  assert.ok(renderer.group.children.some(x=>x.name.startsWith('supported-island-rock-')));
  assert.ok(renderer.group.children.some(x=>x.name.startsWith('garrison-standard')));
  assert.ok(renderer.group.children.some(x=>x.name.startsWith('joined-')));
  assert.equal(surfaceHeightAt(75,0,20,HIGH_GROUNDS),null,'scenery cannot be traversed');
  // Neutralization must visibly remove a team's banner, not reselect initialOwner.
  renderer.setHighGroundsState({sites:[{id:'western-bloom',owner:null}]});
  assert.equal(renderer.standards.get('western-bloom').material,renderer.materials.neutral);
  renderer.dispose();
  assert.equal(scene.children.includes(renderer.group),false);
});
test('all playable spawns connect to high-ground waypoints without an abyss shortcut',()=>{
  const g=navGraph(HIGH_GROUNDS);
  const visited=new Set([0]),q=[0];
  while(q.length)for(const {to} of g.links[q.shift()])if(!visited.has(to)){visited.add(to);q.push(to);}
  const missing=g.nodes.filter((_,i)=>!visited.has(i)).map(x=>x.id);
  assert.deepEqual(missing,[],'all canopy, camp and root paths must be physically linked');
  for(const p of HIGH_GROUNDS.spawnPoints)
    assert.ok(g.nodes.some(n=>runClear(HIGH_GROUNDS,p,n)),`spawn at ${p.x},${p.z} is stranded`);
});
