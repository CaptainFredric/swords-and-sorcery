import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boltWoodPixels,featherMeshData,QUARREL_LENGTH} from './flightQuarrelData.mjs';

test('textured quarrel shaft has real fine wood grain and minute nicks in a bounded RGBA atlas',()=>{
 const {width,height,pixels}=boltWoodPixels();
 assert.equal(width,16);assert.equal(height,64);assert.equal(pixels.length,width*height*4);
 const shades=new Set(),alphas=new Set();
 for(let i=0;i<pixels.length;i+=4){
   shades.add([pixels[i],pixels[i+1],pixels[i+2]].join(','));
   alphas.add(pixels[i+3]);
 }
 assert.ok(shades.size>=15,'wood grain is not a flat recolor');
 assert.deepEqual([...alphas],[255],'solid shaft texture, no transparent holes');
});
test('three physical feather vanes are narrow, finite and made of nondegenerate ribbed polygons',()=>{
 const {positions,colors,indices,vanes}=featherMeshData();
 assert.equal(vanes,3);assert.equal(positions.length,3*4*2*3);
 assert.equal(colors.length,positions.length);assert.equal(indices.length,3*3*6);
 const colorsSeen=new Set();
 for(let i=0;i<colors.length;i+=3)colorsSeen.add(colors[i]+','+colors[i+1]+','+colors[i+2]);
 assert.ok(colorsSeen.size>4,'small dark/light feather barb texture');
 for(let i=0;i<positions.length;i+=3){
   const [x,y,z]=positions.slice(i,i+3);
   assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
   assert.ok(Math.hypot(x,y)<.11,'real fletching, not a rotor blade');
   assert.ok(z<-.14&&z>-.45,'vanes remain near shaft tail');
 }
 for(let i=0;i<indices.length;i+=3){
   const [a,b,c]=indices.slice(i,i+3).map(index=>positions.slice(index*3,index*3+3));
   const u=b.map((v,j)=>v-a[j]),v=c.map((q,j)=>q-a[j]);
   const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])*.5;
   assert.ok(area>1e-7,'a real small triangle, not a point or paper-thin degenerate');
 }
});
test('visual integration contains a five-facet iron point, wood shaft, grip socket and six real slot attachments',()=>{
 assert.equal(QUARREL_LENGTH,.83);
 const detail=readFileSync(new URL('./flightQuarrelDetail.mjs',import.meta.url),'utf8');
 const renderer=readFileSync(new URL('./FightFlightRenderer.mjs',import.meta.url),'utf8');
 assert.match(detail,/ConeGeometry\(\.041,\.14,5/);
 assert.match(detail,/Grained_Oak_Shaft/);
 assert.match(detail,/Three_Ribbed_Fletchings/);
 assert.match(detail,/ornamentQuarrelSlot/);
 assert.match(renderer,/SLOT_NAMES\.forEach\(\(name,i\)=>ornamentQuarrelSlot/);
 assert.match(renderer,/mesh\.add\(this\.quarrelDetail\.clone\(true\)\)/);
});
