import test from 'node:test';
import assert from 'node:assert/strict';
import { HIGH_GROUNDS } from '../../shared/worlds/highGrounds.mjs';
import { partitionHighGroundsDecks } from '../../shared/worlds/highGroundsVisualGeometry.mjs';
import { surfaceHeightAt } from '../../shared/src/collision.mjs';
import { navGraph, runClear } from '../../shared/sim/botNav.mjs';

test('all rendering deck triangles are unique and exactly at an authoritative height',()=>{
  const {top,fascia}=partitionHighGroundsDecks(HIGH_GROUNDS);
  assert.ok(top.size>=2);
  assert.ok(fascia.size>=2);
  const keys=new Set();
  let triangles=0;
  for(const vertexArray of top.values()) {
    assert.equal(vertexArray.length%9,0);
    for(let i=0;i<vertexArray.length;i+=9) {
      const three=Array.from({length:3},(_,j)=>vertexArray.slice(i+j*3,i+j*3+3));
      assert.ok(three.every(p=>HIGH_GROUNDS.floors.some(f=>Math.abs(f.y-p[1])<1e-6)));
      const key=three.map(p=>p.map(n=>n.toFixed(4)).join(',')).sort().join('|');
      assert.ok(!keys.has(key),'duplicate coplanar triangle: '+key);
      keys.add(key);triangles++;
    }
  }
  assert.ok(triangles>100,'nontrivial joined deck geometry');
});
test('entrance staging and root/ramp approaches remain physically supported',()=>{
  for(const z of [-105,-99,-91,-85,-81,-69,69,81,85,91,99,105])
    assert.equal(surfaceHeightAt(0,z,2,HIGH_GROUNDS),0,`centre entrance at z ${z}`);
  const startPoints=[[-38,-80],[38,-98],[-38,98],[38,80],[-16,-54],[16,54]];
  for(const [x,z]of startPoints) {
    assert.equal(surfaceHeightAt(x,z,2,HIGH_GROUNDS),0,`ramp toe ungrounded: ${x},${z}`);
  }
  assert.equal(surfaceHeightAt(75,0,20,HIGH_GROUNDS),null,'ravine is not fake walkable scenery');
  assert.equal(HIGH_GROUNDS.abyssY,-52,'fall danger survives dressing');
});
test('no isolated route nodes on ground, canopy, root path or entry roads',()=>{
  const g=navGraph(HIGH_GROUNDS);
  assert.ok(g.nodes.length>60,'meaningful route graph');
  const visited=new Set([0]),queue=[0];
  while(queue.length)for(const {to}of g.links[queue.shift()])
    if(!visited.has(to)){visited.add(to);queue.push(to);}
  const isolated=g.nodes.filter((_,i)=>!visited.has(i)).map(n=>n.id);
  assert.deepEqual(isolated,[]);
  for(const spawn of HIGH_GROUNDS.spawnPoints)
    assert.ok(g.nodes.some(n=>runClear(HIGH_GROUNDS,spawn,n)),
      `stranded spawn ${spawn.x},${spawn.z}`);
});
