import { conductBoltSamples, conductVisualPhase } from './conductShape.mjs';
import * as THREE from 'three';

// The first strike is heavy and bright; the following one-second hazard is
// a narrow, quieter conductor. Neither controls damage or hit detection.
export const CONDUCT_YELLOW=Object.freeze({
  sheath:0x956008,body:0xffcb32,highlight:0xfff4a0,branch:0xffdf63,
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const vec=p=>new THREE.Vector3(p.x,p.y,p.z);
const gold=(color,opacity=1)=>new THREE.MeshBasicMaterial({
  color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,
});

// Use straight joined segments, not a smoothed spline that rounds off every
// fracture. A tube is built ONCE; its index draw range reveals the discharge.
function tube(points,radius,color,opacity=1,segments=0){
  const curve=new THREE.CurvePath();
  for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(points[i-1],points[i]));
  const tubularSegments=segments||Math.max(8,(points.length-1)*3);
  const radialSegments=6;
  const geometry=new THREE.TubeGeometry(curve,tubularSegments,radius,radialSegments,false);
  const mesh=new THREE.Mesh(geometry,gold(color,opacity));
  mesh.userData.conductOpacity=opacity;
  mesh.userData.conductSegments=tubularSegments;
  mesh.userData.conductRadialSegments=radialSegments;
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
export function conductBoltPoints(origin,end,options={}){
  return conductBoltSamples(origin,end,options).map(vec);
}
export function createConductDischarge(origin,end,{handOrigin=null}={}){
  const group=new THREE.Group();
  group.name='line-of-conduct-impact-and-wire';
  group.userData.conductDischarge=true;
  group.userData.conductLayers=[];
  group.userData.conductRemnants=[];
  // A wall intersecting the caster's origin may produce a zero-length hit.
  // Never feed a degenerate curve to TubeGeometry (NaN Frenet frames).
  const distance=Math.hypot(end.x-origin.x,end.y-origin.y,end.z-origin.z);
  if(!Number.isFinite(distance)||distance<.001)return group;

  const points=conductBoltPoints(origin,end,{jitter:.25});
  group.userData.spine=points;
  group.userData.authoritativeOrigin=vec(origin);
  group.userData.authoritativeEnd=vec(end);

  // Substantial initial fracture, with a dark amber silhouette and hot centre.
  // The game's existing impact damage is deliberately unchanged.
  for(const [radius,color,opacity] of [
    [.164,CONDUCT_YELLOW.sheath,.54],
    [.110,CONDUCT_YELLOW.body,.96],
    [.044,CONDUCT_YELLOW.highlight,1],
  ]){
    const mesh=tube(points,radius,color,opacity);
    mesh.userData.conductRadius=radius;
    mesh.userData.conductFlash=true;
    group.userData.conductLayers.push(mesh);
    group.add(mesh);
  }

  // Unlike the visual zigzags, the dangerous wire is the *exact* server
  // segment. It never scales, retreats, or drifts off the hit-tested corridor.
  const straight=[vec(origin),vec(end)];
  for(const [radius,color,opacity] of [
    [.027,CONDUCT_YELLOW.sheath,.30],
    [.015,CONDUCT_YELLOW.body,.66],
    [.006,CONDUCT_YELLOW.highlight,.78],
  ]){
    const remnant=tube(straight,radius,color,opacity,Math.max(8,Math.min(240,Math.ceil(distance/2))));
    remnant.userData.conductRemnant=true;
    remnant.visible=false;
    group.userData.conductRemnants.push(remnant);
    group.add(remnant);
  }
  const last=points.length-1;
  for(let i=5;i<last-3;i+=Math.max(6,Math.round(last/11))){
    const start=points[i],next=points[Math.min(last,i+3)];
    const tangent=next.clone().sub(start).normalize();
    const side=new THREE.Vector3(tangent.z,.25,-tangent.x).normalize();
    const far=start.clone().addScaledVector(side,.48+(i%3)*.21)
      .addScaledVector(tangent,.34);
    const branch=tube([
      start.clone(),start.clone().lerp(far,.52).addScaledVector(side,.12),far,
    ],.024,CONDUCT_YELLOW.branch,.78,12);
    branch.userData.conductFlash=true;
    branch.userData.conductFrom=i/last;
    group.add(branch);
  }

  // A short cosmetic hand-to-eye lead makes the bolt visibly leave the
  // gauntlet without moving the actual, server-authoritative damage wire.
  if(handOrigin&&[handOrigin.x,handOrigin.y,handOrigin.z].every(Number.isFinite)){
    const leadLength=Math.hypot(handOrigin.x-origin.x,handOrigin.y-origin.y,
      handOrigin.z-origin.z);
    if(leadLength>.065&&leadLength<2.5){
      const lead=tube([vec(handOrigin),vec(origin)],.034,CONDUCT_YELLOW.body,.86,8);
      lead.userData.conductFlash=true;
      group.add(lead);
    }
  }
  updateConductDischarge(group,0);
  return group;
}

/** Reveal existing indexed geometry: no per-frame TubeGeometry allocation. */
export function updateConductDischarge(group,progress=1){
  const layers=group?.userData?.conductLayers;
  if(!layers)return;
  const fraction=clamp(Number.isFinite(progress)?progress:0,0,1);
  for(const mesh of layers){
    const segments=mesh.userData.conductSegments;
    const radial=mesh.userData.conductRadialSegments;
    const revealed=Math.min(segments,Math.max(0,Math.floor(segments*fraction)));
    mesh.geometry.setDrawRange(0,revealed*radial*6);
  }
  for(const branch of group.children)
    if(branch.userData.conductFrom!==undefined)
      branch.visible=fraction>=branch.userData.conductFrom;
}

/** The initial bolt burns away; a separate fixed-width hazard remains.
 * No scaling the parent or the line: that would detach the visual danger
 * from the authoritative damage corridor. */
export function updateConductAppearance(group,elapsed){
  if(!group?.userData?.conductDischarge)return;
  const phase=conductVisualPhase(elapsed);
  updateConductDischarge(group,phase.growth);
  for(const mesh of group.children){
    const isRemnant=mesh.userData.conductRemnant;
    const intensity=isRemnant?phase.residual:phase.impact;
    mesh.material.opacity=(mesh.userData.conductOpacity??1)*intensity;
    mesh.visible=intensity>.008 &&
      (mesh.userData.conductFrom===undefined||
        phase.growth>=mesh.userData.conductFrom);
  }
}

/** Small, restrained electricity around the actual Sorcery socket.
 * The corona tightens into a modest pointed bolt during gathering. */
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
    if(time-this.lastUpdate<.08&&this.lastCharging===charging)return;
    this.lastUpdate=time;this.lastCharging=charging;
    const gather=clamp(progress,0,1),n=3;
    this.group.userData.conductPhase=charging?'gathering':'equipped';
    this.group.userData.conductProgress=gather;
    while(this.strands.length<n){
      const shadow=tube([new THREE.Vector3(),new THREE.Vector3(0,0,-.01)],
        .012,CONDUCT_YELLOW.sheath,.32,8);
      const shell=tube([new THREE.Vector3(),new THREE.Vector3(0,0,-.01)],
        .008,CONDUCT_YELLOW.body,.65,8);
      const core=tube([new THREE.Vector3(),new THREE.Vector3(0,0,-.01)],
        .0035,CONDUCT_YELLOW.highlight,.85,8);
      this.strands.push([shadow,shell,core]);this.group.add(shadow,shell,core);
    }
    for(let k=0;k<n;k++){
      const points=[],phase=time*2.5+k*2*Math.PI/n;
      const radius=charging?.12*(1-.45*gather):.095;
      for(let j=0;j<=7;j++){
        const u=j/7,turn=phase+u*Math.PI*(charging?.7:2);
        const sway=.014*stableJitter(j+k*9,time);
        const spread=(radius+sway)*(charging?(1-u*.85):1);
        const idle=new THREE.Vector3(Math.cos(turn)*spread,
          Math.sin(turn)*spread*.75,-.015-(k%2)*.035-u*.07);
        const spear=new THREE.Vector3(
          (k-1)*.009*(1-u)*Math.sin(time*16+k),
          (k-1)*.008*(1-u)+.008*stableJitter(j+k*7,time),
          -.04-u*(.17+.30*gather));
        points.push(charging?idle.lerp(spear,.16+.84*gather):idle);
      }
      for(const [idx,mesh] of this.strands[k].entries()){
        const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),
          14,idx===0?(charging?.015:.011):idx===1?(charging?.010:.008):.0035,5,false);
        mesh.geometry.dispose();mesh.geometry=geo;
        const energy=charging?.55+.43*gather:.24+.08*Math.sin(time*9+k);
        mesh.material.opacity=[.32,.65,.85][idx]*Math.max(.12,energy);
      }
    }
  }
  dispose(){
    for(const pair of this.strands)for(const mesh of pair)disposeMesh(mesh);
    this.strands=[];
    this.group.removeFromParent();
  }
}
