import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {graftArticulatedFist} from './soFistArticulatedHand.mjs';

test('a grouped hydraulic fist replaces its closed armor rather than rendering two fists',()=>{
 const target=new THREE.Group();target.name='Armored_Fist';
 const closed=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
 closed.name='legacy-solid-gauntlet';target.add(closed);
 const nested=new THREE.Group();const knuckle=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshBasicMaterial());
 knuckle.name='unmarked-rigid-knuckle';nested.add(knuckle);target.add(nested);
 const donor=new THREE.Group();donor.name='Armored_Fist';
 const finger=new THREE.Group();finger.name='Index_1';
 const pad=new THREE.Mesh(new THREE.BoxGeometry(.2,.3,.3),new THREE.MeshBasicMaterial());
 pad.name='MovingFingerSurface';finger.add(pad);donor.add(finger);
 const result=graftArticulatedFist(target,donor);
 assert.equal(result.hiddenLegacyMeshes,2);
 assert.equal(closed.visible,false);
 assert.equal(knuckle.visible,false,'all old meshes are suppressed, not only those named Armored_Fist_*');
 assert.equal(pad.visible,true);
 assert.equal(pad.parent.parent,target);
 assert.equal(target.getObjectByName('Index_1'),finger);
});
test('the original mesh pivot remains usable while its rigid shell is replaced',()=>{
 const old=new THREE.BoxGeometry(1,1,1),fresh=new THREE.BoxGeometry(.2,.2,.2);
 const target=new THREE.Mesh(old,new THREE.MeshBasicMaterial());target.name='Armored_Fist';
 const legacy=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
 target.add(legacy);
 const donor=new THREE.Mesh(fresh,new THREE.MeshBasicMaterial());
 const thumb=new THREE.Group();thumb.name='Thumb_1';donor.add(thumb);
 graftArticulatedFist(target,donor);
 assert.equal(target.geometry,fresh);
 assert.equal(target.visible,true,'the hand pivot must remain visible to its articulated children');
 assert.equal(legacy.visible,false);
 assert.equal(thumb.parent,target);
});
