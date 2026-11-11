import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {plateSkyBytes,plateMetalness} from './plateEnvironmentData.mjs';

const profile={
 sky:[.62,.62,.6],horizon:[.78,.74,.66],ground:[.16,.13,.11],
};
test('Spellblade reflection is opaque linear unsigned-byte data with a bright sky and dimmer ground',()=>{
 const pixels=plateSkyBytes(64,32,profile);
 assert.ok(pixels instanceof Uint8Array);
 assert.equal(pixels.length,64*32*4);
 for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255);
 assert.ok(pixels[0]>pixels[(31*64)*4],'sky above is brighter than ground below');
 assert.ok(pixels[0]>100&&pixels[0]<255,'sky is a real soft, non-overexposed reflection');
 assert.deepEqual(Array.from(pixels.slice(0,4)),Array.from(pixels.slice(4,8)),
   'the reflection is a smooth, continuous sky rather than random dark pixels');
});
test('plate material factor stays in PBR metallic range with and without metalness textures',()=>{
 for(const value of [-4,0,.16,.5,.96,1,4,NaN]){
  const metal=plateMetalness(value,1.25);
  assert.ok(Number.isFinite(metal)&&metal>=0&&metal<=.6);
 }
 assert.equal(plateMetalness(.96),.6,'high-mesh-metalness never exceeds reasonable range');
 assert.equal(plateMetalness(.16),.2,'calibration remains proportional for low-metalness steel');
});
test('Three.js renderer uses the tested byte map, skips kit/glow, and applies the stable once-only material guard',()=>{
 const source=readFileSync(new URL('./plateEnvironment.mjs',import.meta.url),'utf8');
 assert.match(source,/plateSkyBytes\(width,height,PLATE_ENVIRONMENT\)/);
 assert.match(source,/THREE\.UnsignedByteType/);
 assert.match(source,/THREE\.LinearSRGBColorSpace/);
 assert.match(source,/plateMetalness\(material\.metalness,PLATE_ENVIRONMENT\.metal\)/);
 assert.match(source,/material\.userData\.plateEnvironment/);
 assert.match(source,/KitMetal.*SwordSteel.*SorceryAccent.*VisorGlow/);
 assert.doesNotMatch(source,/THREE\.FloatType/);
});
