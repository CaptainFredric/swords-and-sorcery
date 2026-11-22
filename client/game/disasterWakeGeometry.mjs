// Full Gale + Frost's field is suspended, animated air, not crossed flat cards.
// All rendering is cosmetic: the authoritative 3D path and affliction radius
// are supplied by the simulation and are never expanded by these particles.
import * as THREE from 'three';
import {galeFrostWakeRadius} from '../../shared/src/oneHitTrail.mjs';
import {wakePathFrames,wakeSamplePath,wakeTubeVertices} from './disasterWakeGeometryData.mjs';

const TAU=Math.PI*2;
const COLORS={gale:0xc4f7b0,frost:0xa8e5ff,fire:0xff853e,lightning:0xffe478,steel:0xcbd3da};
const KINDS={gale:0,frost:1,fire:2,lightning:3,steel:4};
const COUNT={gale:82,frost:65,fire:50,lightning:34,steel:42};
const SIZE={gale:.11,frost:.14,fire:.20,lightning:.13,steel:.10};
const SPEED={gale:.14,frost:.045,fire:.08,lightning:.22,steel:.015};
const SHELL={gale:.86,frost:.72,fire:.70,lightning:.58,steel:.52};
const OPACITY={gale:.14,frost:.11,fire:.09,lightning:.045,steel:.15};
const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));
const fract=x=>x-Math.floor(x);
const random=(a,b)=>fract(Math.sin((a+1)*127.1+(b+1)*311.7)*43758.5453);

export function wakeTubeGeometry(points,radius,sides=10){
  const {coords,uvs,faces}=wakeTubeVertices(points,radius,sides);
  const geometry=new THREE.BufferGeometry();
  if(coords.length){
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(faces);
    geometry.computeBoundingSphere();
  }
  return geometry;
}
function shellMaterial(element){
  // Longitudinal turbulence runs over the curved surface itself.
  return new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uStrength:{value:1},
      uColor:{value:new THREE.Color(COLORS[element])},
      uOpacity:{value:OPACITY[element]},
      uFlow:{value:element==='steel'?.45:element==='frost'?.8:1.25}},
    vertexShader:'varying vec2 vWake; void main(){vWake=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:[
      'uniform float uTime,uStrength,uOpacity,uFlow;',
      'uniform vec3 uColor; varying vec2 vWake;',
      'void main(){',
      'float eddy=sin(vWake.x*47.0-uTime*uFlow*3.2+sin(vWake.y*18.85+uTime*uFlow)*1.7);',
      'float striation=pow(max(0.0,sin(vWake.x*96.0-uTime*uFlow*5.0+vWake.y*25.13)),4.0);',
      'float breath=0.52+0.18*eddy+0.30*striation;',
      'gl_FragColor=vec4(uColor,uOpacity*uStrength*breath);',
      '}'
    ].join('\n'),
    transparent:true,side:THREE.DoubleSide,depthWrite:false,
    blending:THREE.AdditiveBlending,
  });
}
function moteMaterial(element){
  return new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(COLORS[element])},uTime:{value:0},
      uStrength:{value:1},uSize:{value:SIZE[element]},uKind:{value:KINDS[element]}},
    vertexShader:[
      'attribute float aIntensity;',
      'uniform float uSize,uTime; varying float vIntensity;',
      'void main(){ vIntensity=aIntensity;',
      'vec4 view=modelViewMatrix*vec4(position,1.0);',
      'gl_PointSize=clamp(uSize*450.0/max(1.0,-view.z),1.2,18.0);',
      'gl_Position=projectionMatrix*view; }'
    ].join('\n'),
    fragmentShader:[
      'uniform vec3 uColor; uniform float uStrength,uKind; varying float vIntensity;',
      'void main(){vec2 p=gl_PointCoord*2.0-1.0;float radius=length(p);',
      'float core=1.0-smoothstep(0.20,0.95,radius);',
      // Frost crosses, Fire tongues, Steel angular chips, Lightning pinpricks.
      'if(uKind>3.5)core=1.0-smoothstep(0.36,0.70,max(abs(p.x)*1.3,abs(p.y)*.78));',
      'else if(uKind>2.5)core=1.0-smoothstep(0.08,0.72,radius);',
      'else if(uKind>1.5)core=1.0-smoothstep(0.18,0.94,length(vec2(p.x*1.5,p.y*.83)));',
      'else if(uKind>.5)core=max(core*.65,(1.0-smoothstep(0.06,0.20,abs(p.x)))*',
      '(1.0-smoothstep(.4,1.0,abs(p.y)))*.46);',
      'vec3 tint=uKind>1.5&&uKind<2.5?mix(uColor,vec3(1.0,.92,.64),',
      'max(0.0,1.0-radius)*.36):uColor;',
      'gl_FragColor=vec4(tint,core*vIntensity*uStrength*.84);}'
    ].join('\n'),
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  });
}
function makeMotes(element){
  const count=COUNT[element],position=new Float32Array(count*3),intensity=new Float32Array(count);
  for(let i=0;i<count;i++)intensity[i]=i%11===0?.20:.55+random(i,12+KINDS[element])*.35;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aIntensity',new THREE.BufferAttribute(intensity,1));
  geometry.setDrawRange(0,0);
  const motes=new THREE.Points(geometry,moteMaterial(element));
  motes.name=element+' suspended motes';
  motes.frustumCulled=false;
  return motes;
}
function makeArcs(){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(
    new Float32Array(7*3*2*3),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const arcs=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({
    color:0xffefb4,transparent:true,opacity:.8,
    depthWrite:false,blending:THREE.AdditiveBlending}));
  arcs.name='intermittent Lightning wake crackles';
  arcs.frustumCulled=false;
  return arcs;
}
export function makeWakeVisual(tiers={}){
  const root=new THREE.Group();
  root.name='Full Gale + Frost suspended elemental corridor';
  const elements=['gale','frost','fire','lightning','steel']
    .filter(e=>e==='gale'||e==='frost'||(tiers[e]??0)>=1);
  const layers=[];
  for(const element of elements){
    const mesh=new THREE.Mesh(new THREE.BufferGeometry(),shellMaterial(element));
    mesh.name=element+' curved wake core';
    mesh.frustumCulled=false;
    const motes=makeMotes(element),arcs=element==='lightning'?makeArcs():null;
    root.add(mesh,motes);
    if(arcs)root.add(arcs);
    layers.push({element,mesh,motes,arcs});
  }
  root.userData.wakeLayers=layers;
  root.userData.wakeTrack=[];
  root.userData.wakeRadius=NaN;
  root.userData.wakePath=null;
  root.userData.steel=(tiers.steel??0)>=1;
  return root;
}
const samePath=(a,b)=>a.length===b.length&&a.every((p,i)=>
  Math.abs(p.x-b[i].x)<.015&&Math.abs(p.y-b[i].y)<.015&&Math.abs(p.z-b[i].z)<.015);
function put(array,index,frame,angle,radius){
  const cos=Math.cos(angle),sin=Math.sin(angle);
  array[index]=frame.point.x+radius*(frame.side.x*cos+frame.above.x*sin);
  array[index+1]=frame.point.y+radius*(frame.side.y*cos+frame.above.y*sin);
  array[index+2]=frame.point.z+radius*(frame.side.z*cos+frame.above.z*sin);
}
function stepMotes(layer,path,radius,time,weight,concentrated){
  const {element,motes}=layer,count=COUNT[element],kind=KINDS[element];
  const attribute=motes.geometry.getAttribute('position'),positions=attribute.array;
  for(let i=0;i<count;i++){
    const trail=fract(random(i,kind+2)+time*SPEED[element]);
    const frame=wakeSamplePath(path,trail);
    if(!frame)continue;
    const outward=i%11===0;
    const orbit=random(i,kind+24)*TAU+time*
      (element==='steel'?.15:element==='frost'?.32:1.05)+trail*TAU*2.5;
    const spread=element==='steel'?.38:.73;
    const rad=radius*(outward?1.06:spread*(concentrated?.72:1))*
      (.30+.70*Math.sqrt(random(i,kind+51)));
    put(positions,i*3,frame,orbit,rad);
  }
  attribute.needsUpdate=true;
  motes.geometry.setDrawRange(0,count);
  motes.material.uniforms.uTime.value=time;
  motes.material.uniforms.uStrength.value=weight;
  motes.visible=weight>.005;
}
function stepArcs(layer,path,radius,time,weight){
  const arcs=layer.arcs;
  if(!arcs)return;
  const attribute=arcs.geometry.getAttribute('position'),array=attribute.array;
  const tick=Math.floor(time*13),scale=radius*.46;
  let count=0;
  for(let i=0;i<7;i++){
    if((tick+i*3)%5===0)continue; // flashes, not a static yellow cage
    const start=random(i,tick+22)*.88,angle=random(i,tick+29)*TAU;
    let previous=null;
    for(let j=0;j<=3;j++){
      const frame=wakeSamplePath(path,Math.min(1,start+j*.025));
      if(!frame)continue;
      const next=new Float32Array(3);
      put(next,0,frame,angle+j*.67,scale*(.45+.45*random(i*4+j,tick+33)));
      if(previous){
        array.set(previous,count*3);array.set(next,(count+1)*3);
        count+=2;
      }
      previous=next;
    }
  }
  attribute.needsUpdate=true;
  arcs.geometry.setDrawRange(0,count);
  arcs.material.opacity=weight*.78;
  arcs.visible=weight>.005&&count>0;
}
export function updateWakeVisual(root,field,strength,time=0){
  if(!root?.userData?.wakeLayers)return;
  const points=Array.isArray(field?.trailPoints)?field.trailPoints:[];
  const radius=Math.max(0,field?.radius??galeFrostWakeRadius(field?.tiers));
  const weight=clamp01(strength),valid=points.length>=2&&radius>0;
  if(valid&&(!samePath(points,root.userData.wakeTrack)||
      Math.abs(radius-root.userData.wakeRadius)>.01)){
    root.userData.wakeTrack=points.map(p=>({x:p.x,y:p.y,z:p.z}));
    root.userData.wakeRadius=radius;
    root.userData.wakePath=wakePathFrames(points);
    for(const layer of root.userData.wakeLayers){
      const geometry=wakeTubeGeometry(points,radius*SHELL[layer.element],10);
      layer.mesh.geometry.dispose();
      layer.mesh.geometry=geometry;
    }
  }
  const path=root.userData.wakePath;
  for(const layer of root.userData.wakeLayers){
    const {mesh}=layer;
    mesh.material.uniforms.uTime.value=time;
    mesh.material.uniforms.uStrength.value=weight;
    mesh.visible=!!(valid&&path?.frames.length>1&&weight>.005);
    if(!mesh.visible){
      layer.motes.visible=false;
      if(layer.arcs)layer.arcs.visible=false;
      continue;
    }
    stepMotes(layer,path,radius,time,weight,root.userData.steel);
    if(layer.arcs)stepArcs(layer,path,radius,time,weight);
  }
}
export function disposeWakeVisual(root){
  if(!root)return;
  root.traverse(object=>{
    object.geometry?.dispose?.();
    if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());
    else object.material?.dispose?.();
  });
  root.removeFromParent();
}
