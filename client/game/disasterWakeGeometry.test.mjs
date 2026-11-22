import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wakeTubeVertices,wakePathFrames,wakeSamplePath} from './disasterWakeGeometryData.mjs';

const points=[{x:1,y:15,z:-2},{x:6,y:15,z:-2},{x:12,y:19,z:-4}];
const renderer=readFileSync(new URL('./disasterWakeGeometry.mjs',import.meta.url),'utf8');
const span=(coords,a,b)=>Math.hypot(...[0,1,2].map(k=>coords[a*3+k]-coords[b*3+k]));

test('a Frost–Gale wake is a continuous 3D tube along the true elevated path, not crossed quads',()=>{
  const {coords,uvs,faces}=wakeTubeVertices(points,1.85,10);
  assert.equal(coords.length,points.length*11*3);
  assert.equal(uvs.length,points.length*11*2);
  assert.equal(faces.length,(points.length-1)*10*6);
  assert.ok(span(coords,0,5)>3.69&&span(coords,0,5)<3.71,'real circular Fire radius');
  const heights=coords.filter((_,i)=>i%3===1);
  assert.ok(Math.min(...heights)<16&&Math.max(...heights)>19,'3D elevation retained');
  const x=coords.filter((_,i)=>i%3===0);
  assert.ok(Math.min(...x)<3&&Math.max(...x)>10);
  assert.deepEqual([...coords.slice(0,3)],[...coords.slice(30,33)],
    'ring seam meets itself without a missing sector');
});
test('path sampling interpolates elevated segments without projecting onto terrain',()=>{
  const path=wakePathFrames(points);
  assert.equal(path.frames.length,3);
  const first=wakeSamplePath(path,0),last=wakeSamplePath(path,1);
  assert.deepEqual(first.point,points[0]);
  assert.deepEqual(last.point,points[2]);
  const middle=wakeSamplePath(path,.73);
  assert.ok(middle.point.y>15&&middle.point.y<19);
  const dot=middle.tangent.x*middle.side.x+middle.tangent.y*middle.side.y+
    middle.tangent.z*middle.side.z;
  assert.ok(Math.abs(dot)<1e-5,'radial basis is perpendicular to actual trajectory');
});
test('vertical shots and degenerate points yield finite genuine circular sections',()=>{
  const path=[{x:0,y:3,z:0},{x:0,y:3,z:0},{x:0,y:13,z:0}];
  const {coords,faces}=wakeTubeVertices(path,.9,10);
  assert.equal(faces.length,60,'duplicate points do not generate zero-area slabs');
  assert.ok(coords.every(Number.isFinite));
  assert.ok(span(coords,0,5)>1.79);
  assert.equal(wakeTubeVertices([],1).coords.length,0);
});
test('renderer animates an infused volume with controlled visual-only motes and crackling',()=>{
  assert.match(renderer,/wakeTubeVertices\(points,radius,sides\)/);
  assert.match(renderer,/galeFrostWakeRadius\(field\?\.tiers\)/);
  for(const element of ['gale','frost','fire','lightning','steel'])
    assert.match(renderer,new RegExp(element+':0x[0-9a-f]+','i'));
  assert.match(renderer,/new THREE\.Points\(/,'suspended particles');
  assert.match(renderer,/new THREE\.LineSegments\(/,'electric arcs');
  assert.match(renderer,/uTime\.value=time/,'animated instead of static');
  assert.match(renderer,/mesh\.geometry\.dispose\(\)/,'geometry is cleaned on path updates');
  assert.doesNotMatch(renderer,/wakeRibbonVertices|axis<=1/,'no intersecting stretched cards');
});
