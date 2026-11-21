// A lightweight translucent crossed ribbon following the authoritative
// 3D path of Full Gale + Frost. Every visual vertex is derived from the
// same collision polyline; no projected flat decal or extra hitboxes.
import * as THREE from 'three';
import {galeFrostWakeRadius} from '../../shared/src/oneHitTrail.mjs';
import {wakeRibbonVertices} from './disasterWakeGeometryData.mjs';

const COLORS={gale:0xb7f1a0,frost:0xa7e6ff,fire:0xff9647,
 lightning:0xffe16f,steel:0xc5ced7};
const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));
export function wakeRibbonGeometry(points,radius,axis=0){
 const {coords,faces}=wakeRibbonVertices(points,radius,axis);
 const g=new THREE.BufferGeometry();
 if(coords.length){
  g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  g.setIndex(faces);g.computeBoundingSphere();
 }
 return g;
}
export function makeWakeVisual(tiers={}){
 const root=new THREE.Group();
 root.name='Gale + Frost dangerous elemental wake';
 const layers=[];
 const colors=['gale','frost','fire','lightning','steel']
   .filter(e=>e==='gale'||e==='frost'||(tiers[e]??0)>=1);
 for(const element of colors)for(let axis=0;axis<=1;axis++){
  const m=new THREE.Mesh(new THREE.BufferGeometry(),
   new THREE.MeshBasicMaterial({color:COLORS[element],
    transparent:true,opacity:.12,depthWrite:false,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
  m.name=element+(axis?' vertical':' lateral')+' wake';
  layers.push({mesh:m,element,axis});
  root.add(m);
 }
 root.userData.wakeLayers=layers;
 root.userData.wakePoints=0;
 return root;
}
export function updateWakeVisual(root,field,strength){
 if(!root?.userData?.wakeLayers)return;
 const count=field.trailPoints?.length??0;
 const radius=field.radius??galeFrostWakeRadius(field.tiers);
 if(count!==root.userData.wakePoints){
  root.userData.wakePoints=count;
  for(const {mesh,element,axis} of root.userData.wakeLayers){
   const share=element==='gale'?.95:element==='frost'?.82:
     element==='fire'?.67:element==='lightning'?.14:.35;
   const geometry=wakeRibbonGeometry(field.trailPoints,radius*share,axis);
   mesh.geometry.dispose();mesh.geometry=geometry;
  }
 }
 const weight=clamp01(strength);
 for(const {mesh,element,axis} of root.userData.wakeLayers){
  mesh.material.opacity=weight*(
    element==='gale'?.06:element==='frost'?.13:
      element==='fire'?.095:element==='lightning'?.20:.10
  )*(axis?.83:1);
  mesh.visible=count>1&&weight>.005;
 }
}
export function disposeWakeVisual(root){
 if(!root)return;
 for(const {mesh} of root.userData?.wakeLayers??[]){
  mesh.geometry.dispose();mesh.material.dispose();
 }
 root.removeFromParent();
}
