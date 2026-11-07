import { conductBoltSamples } from './conductShape.mjs';
import * as THREE from 'three';

// Yellow electrical palette: a dark amber sheath, bright gold body and
// pale-yellow ionized centre. These visuals are client-only; the shared room
// simulation owns damage, obstacles, contacts and the one-second conducting wire.
export const CONDUCT_YELLOW=Object.freeze({
  sheath:0x956008,body:0xffcb32,highlight:0xfff4a0,branch:0xffdf63,
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const vec=p=>new THREE.Vector3(p.x,p.y,p.z);
const gold=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:true,
  opacity,depthWrite:false,blending:THREE.AdditiveBlending});
function tube(points,radius,color,opacity=1,segments=0){
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
  const geometry=new THREE.TubeGeometry(curve,segments||Math.max(8,points.length*2),radius,5,false);
  const material=gold(color,opacity);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.userData.conductOpacity=opacity;
  mesh.frustumCulled=false;
  return mesh;
}
function disposeMesh(mesh){
  mesh.removeFromParent();
  mesh.geometry?.dispose?.();
  mesh.material?.dispose?.();
}
function stableJitter(n,t=0){
  return .5*Math.sin(n*9.17+t*31)+.3*Math.sin(n*17.9-t*19)+.2*Math.cos(n*27.3+t*13);
}
// A continuous broken conductor. Ends are never displaced, so the line stops
// exactly at the authoritative world collision, not on an invented point.
export function conductBoltPoints(origin,end,options={}) {
  return conductBoltSamples(origin,end,options).map(p=>new THREE.Vector3(p.x,p.y,p.z));
}
export function createConductDischarge(origin,end){
  const group=new THREE.Group();
  group.name='line-of-conduct-yellow-bolt';
  group.userData.conductDischarge=true;
  const points=conductBoltPoints(origin,end,{jitter:.33});
  // Slightly thick, not a laser: all three layers follow the SAME angular
  // fractures, with darker gold around light yellow conducting tissue.
  group.userData.spine=points;
  group.userData.conductLayers=[];
  for(const [radius,color,opacity]of[
    [.081,CONDUCT_YELLOW.sheath,.38],
    [.065,CONDUCT_YELLOW.sheath,.62],
    [.048,CONDUCT_YELLOW.body,.92],
    [.019,CONDUCT_YELLOW.highlight,1],
  ]){
    const mesh=tube(points,radius,color,opacity);
    mesh.userData.conductRadius=radius;
    group.userData.conductLayers.push(mesh);
    group.add(mesh);
  }
  // Smaller branches flicker out of the spine; no infinite flat raster beams.
  const size=points.length-1;
  for(let i=6;i<size-3;i+=Math.max(6,Math.round(size/10))){
    const start=points[i],next=points[Math.min(size,i+3)];
    const tangent=next.clone().sub(start).normalize();
    const side=new THREE.Vector3(tangent.z,.35,-tangent.x).normalize();
    const endBranch=start.clone().addScaledVector(side,.48+(i%3)*.2)
      .addScaledVector(tangent,.42);
    const branch=tube([start.clone(),start.clone().lerp(endBranch,.45)
      .addScaledVector(side,.12),endBranch],.018,CONDUCT_YELLOW.branch,.8,9);
    branch.userData.conductFrom=i/(size||1);
    group.add(branch);
  }
  updateConductDischarge(group,.015);
  return group;
}

/** Grow the electrically jagged line along its actual collision path.
 * The world hit endpoint is unchanged; only the exposed render geometry
 * advances across the client-side 150ms firing animation. */
export function updateConductDischarge(group,progress=1){
  const points=group?.userData?.spine,layers=group?.userData?.conductLayers;
  if(!points||!layers)return;
  const fraction=clamp(progress,.015,1);
  const sample=(points.length-1)*fraction,index=Math.floor(sample),blend=sample-index;
  const visible=points.slice(0,Math.max(2,index+1)).map(p=>p.clone());
  if(index+1<points.length){
    const tip=points[index].clone().lerp(points[index+1],blend);
    if(visible.length>index+1)visible[index+1]=tip;
    else visible.push(tip);
  }
  for(const mesh of layers){
    const geometry=new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(visible,false,'centripetal'),
      Math.max(8,visible.length*2),mesh.userData.conductRadius,5,false);
    mesh.geometry.dispose();mesh.geometry=geometry;
  }
  for(const branch of group.children)
    if(branch.userData.conductFrom!==undefined)
      branch.visible=fraction>=branch.userData.conductFrom;
}

/** A small dynamic electrical corona attached to the actual magic-hand socket.
 * In idle it orbits the gauntlet; during the spell's gather delay it aligns
 * into a pointed yellow bolt at the casting palm. Rebuild at 20 Hz, not 60. */
export class ConductHandEffects {
  constructor(anchor){
    this.group=new THREE.Group();
    this.group.name='line-of-conduct-magic-hand';
    anchor.add(this.group);
    this.strands=[];
    this.lastUpdate=-Infinity;
    this.lastCharging=false;
  }
  update(time,{equipped=false,charging=false,progress=0}={}){
    this.group.visible=Boolean(equipped||charging);
    if(!this.group.visible)return;
    if(time-this.lastUpdate<.05 && this.lastCharging===charging)return;
    this.lastUpdate=time;this.lastCharging=charging;
    const gather=clamp(progress,0,1),n=5;
    this.group.userData.conductPhase=charging?'gathering':'equipped';
    this.group.userData.conductProgress=gather;
    while(this.strands.length<n){
      const shadow=tube([new THREE.Vector3(),new THREE.Vector3(0,0,-.01)],
        .023,CONDUCT_YELLOW.sheath,.7,8);
      const shell=tube([new THREE.Vector3(),new THREE.Vector3(0,0,-.01)],
        .015,CONDUCT_YELLOW.body,.94,8);
      const core=tube([new THREE.Vector3(),new THREE.Vector3(0,0,-.01)],
        .006,CONDUCT_YELLOW.highlight,1,8);
      this.strands.push([shadow,shell,core]);this.group.add(shadow,shell,core);
    }
    for(let k=0;k<n;k++){
      const points=[],phase=time*3.5+k*2*Math.PI/n;
      const radius=charging ? .18*(1-.54*gather):.14;
      for(let j=0;j<=7;j++){
        const u=j/7,turn=phase+u*Math.PI*(charging?.7:2.25);
        const sway=.035*stableJitter(j+k*9,time);
        const spread=(radius+sway)*(charging?(1-u*.85):1);
        // Five yellow corona strands reorganize into a long angular bolt
        // in front of the magic hand over the existing cast delay.
        const idle=new THREE.Vector3(Math.cos(turn)*spread,
          Math.sin(turn)*spread*.75,-.015-(k%2)*.04-u*.085);
        const spear=new THREE.Vector3(
          (k-2)*.012*(1-u)*Math.sin(time*22+k),
          (k-2)*.009*(1-u)+.012*stableJitter(j+k*7,time),
          -.04-u*(.23+.57*gather));
        const position=charging?idle.lerp(spear,.26+.74*gather):idle;
        points.push(position);
      }
      for(const [idx,mesh] of this.strands[k].entries()){
        const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),
          14,idx===0?(charging?.023:.018):idx===1?(charging?.016:.012):.006,5,false);
        mesh.geometry.dispose();mesh.geometry=geo;
        mesh.material.opacity=(idx===0?.65:idx===1?.96:1)*
          (charging?.88+.12*gather:.68+.23*Math.sin(time*17+k));
      }
    }
  }
  dispose(){
    for(const pair of this.strands)for(const mesh of pair)disposeMesh(mesh);
    this.strands=[];
    this.group.removeFromParent();
  }
}
