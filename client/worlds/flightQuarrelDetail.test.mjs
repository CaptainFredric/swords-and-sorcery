import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {boltWoodGrain,createQuarrelDetail,ornamentQuarrelSlot,disposeQuarrelDetail} from './flightQuarrelDetail.mjs';

test('quarrel shaft has real small-scale grain texture rather than a flat tint',()=>{
 const t=boltWoodGrain();
 assert.equal(t.image.width,16);assert.equal(t.image.height,64);
 assert.equal(t.colorSpace,THREE.SRGBColorSpace);
 const pixels=t.image.data,shades=new Set();
 for(let i=0;i<pixels.length;i+=4)shades.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);
 assert.ok(shades.size>=15,'readable low-contrast woodgrain and minute nicks');
 t.dispose();
});
test('individual quarrels have real iron points, collars and three thick ribbed feather vanes',()=>{
 const detail=createQuarrelDetail();
 assert.equal(detail.children.length,5);
 const head=detail.getObjectByName('Five_Facet_Iron_Arrowhead');
 const vanes=detail.getObjectByName('Three_Ribbed_Fletchings');
 const shaft=detail.getObjectByName('Grained_Oak_Shaft');
 assert.ok(head?.geometry?.isConeGeometry);
 assert.ok(head.position.z>.3);
 assert.ok(vanes?.geometry?.getAttribute('position').count>=24);
 assert.ok(vanes.geometry.getAttribute('color'),'feather barbs have real color variation');
 assert.ok(shaft.material.map?.isDataTexture);
 const bbox=new THREE.Box3().setFromObject(detail),size=bbox.getSize(new THREE.Vector3());
 assert.ok(size.z>.64&&size.z<1,'arrowhead and fletching fit small authored quarrel dimensions');
 assert.ok(size.x<.24&&size.y<.24,'fletching silhouette is subtle, not a rotor');
 disposeQuarrelDetail(detail);
});
test('six magazine bolts attach independent geometry to measured authored shaft nodes',()=>{
 const detail=createQuarrelDetail();
 const points=[];
 for(let i=0;i<6;i++){
   const slot=new THREE.Group();slot.name='Quarrel_Visual_Slot_'+i;
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(.035,.04,.80),new THREE.MeshBasicMaterial());
   slot.add(mesh);
   const decoration=ornamentQuarrelSlot(slot,detail,i);
   assert.ok(decoration&&decoration.parent===slot);
   assert.equal(slot.children.length,2);
   assert.equal(ornamentQuarrelSlot(slot,detail,i),null,'do not duplicate on reload');
   points.push(decoration.getObjectByName('Three_Ribbed_Fletchings').rotation.z);
   mesh.geometry.dispose();mesh.material.dispose();
 }
 assert.equal(new Set(points).size,6,'each visible bolt has individually clocked feather geometry');
 disposeQuarrelDetail(detail);
});
