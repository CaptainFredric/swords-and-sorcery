import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CONDUCT_YELLOW,conductBoltPoints,createConductDischarge,ConductHandEffects} from './ConductVisuals.mjs';

test('Line of Conduct bolt connects exact collision endpoints with angular electrical bends',()=>{
 const start={x:0,y:1,z:0},end={x:32,y:1,z:-12};
 const points=conductBoltPoints(start,end,{jitter:.3});
 assert.deepEqual(points[0].toArray(),[0,1,0]);
 assert.deepEqual(points.at(-1).toArray(),[32,1,-12]);
 assert.ok(points.length>=10);
 assert.ok(points.slice(1,-1).some(p=>Math.abs(p.y-1)>.001),'angular lightning not a straight laser');
});
test('A yellow layered strike has dark gold, bright gold and pale highlights',()=>{
 const bolt=createConductDischarge({x:0,y:1,z:0},{x:25,y:1,z:0});
 assert.equal(bolt.userData.conductDischarge,true);
 assert.ok(bolt.children.length>=3);
 assert.equal(bolt.children[0].material.color.getHex(),CONDUCT_YELLOW.sheath);
 assert.equal(bolt.children[1].material.color.getHex(),CONDUCT_YELLOW.body);
 assert.equal(bolt.children[2].material.color.getHex(),CONDUCT_YELLOW.highlight);
 assert.ok(bolt.children[0].geometry.parameters.radius>bolt.children[1].geometry.parameters.radius);
 bolt.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
test('Hand socket electricity appears when equipped and converges on cast without moving the hand',()=>{
 const socket=new THREE.Object3D(),fx=new ConductHandEffects(socket);
 assert.equal(socket.children.includes(fx.group),true);
 fx.update(0,{equipped:false});assert.equal(fx.group.visible,false);
 fx.update(1,{equipped:true});assert.equal(fx.group.visible,true);
 assert.equal(fx.strands.length,5);
 const before=fx.strands[0][0].geometry.attributes.position.array.slice();
 fx.update(1.2,{equipped:true,charging:true,progress:.8});
 const after=fx.strands[0][0].geometry.attributes.position.array;
 assert.notDeepEqual([...after],[...before]);
 assert.deepEqual(socket.position.toArray(),[0,0,0],'hand transform is authoritative');
 fx.dispose();
 assert.equal(socket.children.length,0);
});
