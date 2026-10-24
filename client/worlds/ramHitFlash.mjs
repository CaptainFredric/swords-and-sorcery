import * as THREE from 'three';

// Each mesh retains the hit in its own space, so wheels can roll and the fist
// can complete its stroke while the mark stays on the struck surface.
export function ramHitMaterial(material, armored=false) {
 const uniforms={uRamHitFrom:{value:[new THREE.Vector3(),new THREE.Vector3()]},uRamHitAge:{value:[-1,-1]},uRamHitRadius:{value:armored?.16:.21}};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRamSurface;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRamSurface=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRamSurface;\nuniform vec3 uRamHitFrom[2];\nuniform float uRamHitAge[2];\nuniform float uRamHitRadius;').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   for(int i=0;i<2;i++) if(uRamHitAge[i]>=0.0 && uRamHitAge[i]<0.30){
    float d=distance(vRamSurface,uRamHitFrom[i])/uRamHitRadius;
    float hitMask=1.0-smoothstep(0.20,1.0,d);
    float fade=1.0-smoothstep(0.025,0.30,uRamHitAge[i]);
    ${armored?'float edge=exp(-pow((d-uRamHitAge[i]*3.0)/0.12,2.0)); hitMask=hitMask*0.6+edge*0.4;':''}
    totalEmissiveRadiance+=${armored?'vec3(0.70,0.83,1.0)':'vec3(0.72,0.38,0.17)'}*hitMask*fade*${armored?'1.6':'1.1'};
   }`);
 };
 material.customProgramCacheKey=()=>`ram-surface-hit-1-${armored}`;
 return uniforms;
}
