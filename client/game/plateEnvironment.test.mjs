import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {lightPlate,wantsPlateEnvironment,PLATE_ENVIRONMENT} from './plateEnvironment.mjs';

test('supplied Spellblade plate uses renderable unsigned-byte reflection on WebGL/mobile',()=>{
 const material=new THREE.MeshStandardMaterial({
   color:0x96949b,metalness:.96,roughness:.72,metalnessMap:new THREE.Texture(),
 });
 material.name='GameBody';
 const root=new THREE.Group();
 root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material));
 assert.equal(wantsPlateEnvironment(root),true);
 assert.equal(lightPlate(root),true);
 const env=material.envMap;
 assert.ok(env,'metal has a real reflected environment, not empty black');
 assert.equal(env.type,THREE.UnsignedByteType);
 assert.ok(env.image.data instanceof Uint8Array);
 assert.equal(env.colorSpace,THREE.LinearSRGBColorSpace);
 assert.ok(env.image.data.every((v,i)=>i%4!==3||v===255),'all reflection pixels opaque');
 assert.ok(material.metalness>=0&&material.metalness<=.6,
   'metalness factor must stay physically valid even with a metalnessMap');
 const first=material.metalness;
 lightPlate(root);
 assert.equal(material.envMap,env,'repeat installation preserves shared texture');
 assert.equal(material.metalness,first,'material darkness never compounds on repeat');
 material.dispose();root.children[0].geometry.dispose();
});

test('legacy kit and glow materials are not recolored by plate environment',()=>{
 const root=new THREE.Group();
 for(const name of ['GameBody','KitMetal','VisorGlow']){
  const mat=new THREE.MeshStandardMaterial({metalness:.5,roughness:.7});
  mat.name=name;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat));
 }
 assert.equal(lightPlate(root),true);
 assert.equal(root.children[0].material.envMap!=null,true);
 for(const i of [1,2]){
  assert.equal(root.children[i].material.envMap,null);
  assert.equal(root.children[i].material.metalness,.5);
 }
 for(const item of root.children){item.geometry.dispose();item.material.dispose();}
 assert.equal(PLATE_ENVIRONMENT.metal,1.25,'retain authored plate calibration factor');
});
