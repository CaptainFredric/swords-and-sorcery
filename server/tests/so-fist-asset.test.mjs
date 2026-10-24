import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{SO_FIST_SCALE,SO_FIST_WHEELS}from'../../shared/sim/soFistGeometry.mjs';import{createHash}from'node:crypto';
test('ram runtime retains the authored hierarchy and measured carriage fit and independent authored fist construction',async()=>{
 const bytes=await readFile(new URL('../../client/assets/props/so-fist-ication/so-fist-ication.glb',import.meta.url));assert.equal(bytes.length,6276916);assert.equal(createHash('sha256').update(bytes).digest('hex'),'d81caf389c6c17a64ba06652d602e4d3e977e871e3fe4ad1305414b8328c3d34');
 const size=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+size));assert.equal(g.nodes.length,20);assert.equal(g.meshes.length,17);assert.equal(g.animations.length,4);assert.equal(g.nodes.filter(n=>n.name.startsWith('Wheel_')).length,4);assert.ok(g.nodes.some(n=>n.name==='Armored_Fist'));assert.ok(g.nodes.some(n=>n.name==='Ram_Shaft_Piston'));
 for(const wheel of SO_FIST_WHEELS){const node=g.nodes.find(n=>n.name===wheel.id);for(let i=0;i<3;i++)assert.ok(Math.abs(node.translation[i]*SO_FIST_SCALE-wheel.pivot[i])<1e-6,'exported wheel agrees with authority');}
 for(const clip of g.animations){assert.ok(clip.channels.length>=4);assert.ok(clip.samplers.every(v=>g.accessors[v.input].min[0]===0));}
 assert.equal(g.materials.filter(m=>m.name.startsWith('Ram')).length,12);
});
