import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wakeRibbonVertices} from './disasterWakeGeometryData.mjs';

const points=[{x:1,y:15,z:-2},{x:6,y:15,z:-2},{x:12,y:19,z:-4}];
const renderer=readFileSync(new URL('./disasterWakeGeometry.mjs',import.meta.url),'utf8');
test('3D wake vertices follow actual authoritative elevated line, not projected terrain',()=>{
 const {coords,faces}=wakeRibbonVertices(points,1.85);
 assert.ok(coords.length>=24,'two genuine crossed segments');
 assert.ok(faces.length>=12);
 const y=coords.filter((_,i)=>i%3===1);
 assert.ok(Math.max(...y)>18&&Math.min(...y)<16,'3D elevations preserved');
 const x=coords.filter((_,i)=>i%3===0);
 assert.ok(Math.min(...x)<=2&&Math.max(...x)>=11);
 const vertical=wakeRibbonVertices(points,1.85,1);
 assert.notDeepEqual(vertical.coords,coords,'second ribbon spans a distinct 3D axis');
});
test('renderer uses pure path geometry, distinct elemental colors and full Fire width',()=>{
 assert.match(renderer,/wakeRibbonVertices\(points,radius,axis\)/);
 assert.match(renderer,/galeFrostWakeRadius\(field.tiers\)/);
 for(const element of ['gale','frost','fire','lightning','steel'])
   assert.match(renderer,new RegExp(element+':0x[0-9a-f]+','i'));
 assert.match(renderer,/axis=0;axis<=1;axis\+\+/);
 assert.match(renderer,/mesh.material.opacity=weight/);
 assert.match(renderer,/mesh.geometry.dispose\(\)/);
});
