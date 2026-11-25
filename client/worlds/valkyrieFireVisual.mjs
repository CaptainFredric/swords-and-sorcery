import * as THREE from 'three';
import {everywhere} from '../game/viewLayers.mjs';

// A moving, perforated flame curtain, not a solid glowing wall. UV noise
// travels upward; the periodic angular harmonics meet across the cylinder seam.
export function valkyrieFlameMaterial(rim=true,seed=0){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{age:{value:0},strength:{value:0},fade:{value:0},seed:{value:seed},rim:{value:rim?1:0}},
    vertexShader:`
      varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
    `,
    fragmentShader:`
      varying vec2 vUv;
      uniform float age,strength,fade,seed,rim;
      void main(){
        float a=vUv.x*6.2831853, y=vUv.y;
        float t=age;
        float wave=sin(a*17.0+t*2.9+seed)+.48*sin(a*29.0-t*3.7+seed)
          +.25*sin(a*43.0+t*5.1+y*5.0);
        float tip=clamp(.53+.20*wave+.12*sin(a*9.0-t*2.0),.17,.96);
        float curl=sin(a*23.0+y*9.0-t*5.6+seed)
          +.55*sin(a*37.0-y*12.0+t*4.3);
        float filaments=smoothstep(-.72,.58,curl);
        float body=(1.0-smoothstep(tip-.14,tip+.025,y))
          *smoothstep(0.0,.07,y)*mix(.38,1.0,filaments);
        float core=smoothstep(.45,.9,filaments)*(1.0-smoothstep(.09,.53,y));
        vec3 red=vec3(.93,.095,.012), orange=vec3(1.,.39,.035);
        vec3 gold=vec3(1.,.83,.26);
        vec3 color=mix(red,orange,clamp((1.0-y)*.7+filaments*.37,0.,1.));
        color=mix(color,gold,core*.8);
        float alpha=body*fade*mix(.27,.63,rim)*(.42+.58*strength);
        if(alpha<.008)discard;
        gl_FragColor=vec4(color,alpha);
      }
    `
  });
}
export function updateValkyrieFlame(material,age,strength,fade){
  material.uniforms.age.value=age;
  material.uniforms.strength.value=strength;
  material.uniforms.fade.value=fade;
}

const COUNT=72, HALO=36, TAU=Math.PI*2;
const fract=x=>x-Math.floor(x);
const hash=x=>fract(Math.sin(x*127.1+311.7)*43758.5453);
function particleMaterial(){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{tint:{value:new THREE.Color(0xffbb54)},opacity:{value:.35}},
    vertexShader:`
      attribute float weight;
      varying float vWeight;
      void main(){
        vWeight=weight;
        vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(95.0*projectionMatrix[1][1]/max(1.0,-mv.z),1.5,15.0);
      }
    `,
    fragmentShader:`
      varying float vWeight;
      uniform vec3 tint;
      uniform float opacity;
      void main(){
        vec2 d=gl_PointCoord-.5;
        float soft=pow(max(0.,1.-4.*dot(d,d)),2.);
        gl_FragColor=vec4(tint,soft*vWeight*opacity);
      }
    `
  });
}
function particles(count,color){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('weight',new THREE.BufferAttribute(new Float32Array(count),1).setUsage(THREE.DynamicDrawUsage));
  const material=particleMaterial();material.uniforms.tint.value.setHex(color);
  const mesh=new THREE.Points(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=7;
  return mesh;
}
function write(mesh,fn){
  const p=mesh.geometry.attributes.position,w=mesh.geometry.attributes.weight;
  for(let i=0;i<p.count;i++){const [x,y,z,a]=fn(i);p.setXYZ(i,x,y,z);w.setX(i,a);}
  p.needsUpdate=true;w.needsUpdate=true;
}
// One root per knight (not per machine or zone), so overlapping fields never
// multiply the aura. The host supplies actual exposure, including walls/height.
export class ValkyrieKnightAuras{
  constructor(scene){this.root=everywhere(new THREE.Group());this.root.name='ValkyrieKnightAuras';scene.add(this.root);this.entries=new Map();}
  create(id){
    const group=new THREE.Group(),gold=particles(COUNT,0xffce77),
      ash=particles(COUNT,0xef5424),halo=particles(HALO,0xffdf91);
    group.add(gold,ash,halo);this.root.add(group);
    const e={group,gold,ash,halo};this.entries.set(id,e);return e;
  }
  remove(id,e){
    e.group.removeFromParent();
    for(const mesh of [e.gold,e.ash,e.halo]){mesh.geometry.dispose();mesh.material.dispose();}
    this.entries.delete(id);
  }
  update(now,players,positionFor,firstPersonId){
    const seen=new Set();
    for(const p of players??[]){
      const f=p.valkyrieFlames;
      if(!p.alive||!f)continue;
      const allied=now<f.alliedUntil,hostile=now<f.hostileUntil;
      if(!allied&&!hostile)continue;
      const pos=positionFor(p.id)??p.position;
      if(!pos||![pos.x,pos.y,pos.z].every(Number.isFinite))continue;
      const e=this.entries.get(p.id)??this.create(p.id);
      seen.add(p.id);e.group.position.set(pos.x,pos.y,pos.z);
      const local=p.id===firstPersonId, height=p.crouched?.74:1;
      e.gold.visible=allied;e.ash.visible=hostile;
      e.halo.visible=allied&&p.health<=1&&!local;
      // Six irregular rising wisps; adjacent samples create a soft strand.
      if(allied){
        e.gold.material.uniforms.opacity.value=local?.19:.40;
        write(e.gold,i=>{
          const k=Math.floor(i/12),j=i%12,phase=fract(now*.65+hash(k+12)-j*.028);
          const a=k*TAU/6+now*.6+phase*1.6;
          const r=.37+.16*Math.sin(phase*Math.PI)+.045*Math.sin(now*2+k);
          return [Math.cos(a)*r,(.13+phase*(local?.75:1.65))*height,Math.sin(a)*r,
            Math.sin(phase*Math.PI)*(.45+.55*(1-j/12))];
        });
      }
      // Hostile threads lift AWAY from the knight and cool to nothing.
      // At zero Prowess leave a dim warning, not a fictitious full-strength drain.
      if(hostile){
        const charged=(p.prowess??0)>0;
        e.ash.material.uniforms.opacity.value=(charged?.44:.15)*(local?.5:1);
        write(e.ash,i=>{
          const k=Math.floor(i/12),j=i%12,phase=fract(now*.91+hash(k+52)-j*.024);
          const a=k*TAU/6-now*.9+phase*.8;
          const r=.25+phase*.72;
          return [Math.cos(a)*r,(.35+phase*(local?.45:1.35))*height,Math.sin(a)*r,
            Math.sin(phase*Math.PI)*(1-j/14)];
        });
      }
      if(e.halo.visible){
        e.halo.material.uniforms.opacity.value=.68;
        write(e.halo,i=>{
          const a=i*TAU/HALO+now*.28,r=.36+.022*Math.sin(a*5+now*2);
          return [Math.cos(a)*r,2.08*height+.035*Math.sin(a*3+now),Math.sin(a)*r,.65+.35*Math.sin(a*4-now)**2];
        });
      }
    }
    for(const [id,e] of this.entries)if(!seen.has(id))this.remove(id,e);
  }
  dispose(){for(const [id,e] of this.entries)this.remove(id,e);this.root.removeFromParent();}
}
