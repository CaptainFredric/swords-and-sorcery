import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
test('ram runtime preserves the verified creator binary and independent authored fist construction',async()=>{
 const bytes=await readFile(new URL('../../client/assets/props/so-fist-ication/so-fist-ication.glb',import.meta.url));assert.equal(bytes.length,6141788);assert.equal(createHash('sha256').update(bytes).digest('hex'),'64cdc7b09e88e31f4b4ff7cb65631fd036e12ba71c0c3f9466cc52b8416419c6');
 const size=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+size));assert.equal(g.nodes.length,20);assert.equal(g.meshes.length,17);assert.equal(g.animations.length,4);assert.equal(g.nodes.filter(n=>n.name.startsWith('Wheel_')).length,4);assert.ok(g.nodes.some(n=>n.name==='Armored_Fist'));assert.ok(g.nodes.some(n=>n.name==='Ram_Shaft_Piston'));
});
