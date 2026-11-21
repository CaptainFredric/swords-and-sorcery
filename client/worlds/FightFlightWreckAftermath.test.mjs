import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FightFlightRenderer} from './FightFlightRenderer.mjs';

test('Fight-and-Flight destruction uses a compact, non-damaging burst then upward soot before despawn',()=>{
 const scene=new THREE.Scene(),renderer=new FightFlightRenderer(scene);
 const machine={id:'wreck-smoke',position:{x:3,y:2,z:-5},
   destroyedAt:10,wreckVisualExpired:false};
 renderer.drawWreckAftermath(10.12,machine);
 assert.ok(renderer.wreckBurst.some(m=>m.visible),'a short red-orange burst accompanies destruction');
 assert.ok(renderer.wreckSmoke.some(m=>m.visible),'smoke starts at the destroyed carriage');
 assert.ok(renderer.wreckBurst.every(m=>m.geometry===renderer.smokeGeometry),
   'burst is a rounded pressure pop, not elongated orange spark streaks');
 renderer.drawWreckAftermath(12.65,machine);
 assert.ok(renderer.wreckBurst.every(m=>!m.visible),'the explosion never persists as a flame trail');
 assert.ok(renderer.wreckSmoke.some(m=>m.visible&&m.position.y>machine.position.y+1.8),
   'smoke plumes upward well after the short explosion');
 renderer.drawWreckAftermath(13.0,{...machine,wreckVisualExpired:true});
 assert.ok([...renderer.wreckBurst,...renderer.wreckSmoke].every(m=>!m.visible),
   'authoritative wreck cleanup removes all of its effects');
 renderer.dispose();
 assert.equal(renderer.wreckRoot.parent,null,'no orphaned VFX container remains in scene');
});
