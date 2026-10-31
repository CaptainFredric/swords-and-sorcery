// Swept frost proximity for Cold, How Touching. Detection is purely spatial;
// consequences are resolved by the original projectile and blast simulation.
import {segmentAabbHit} from '../src/collision.mjs';
import {orientedBoxHit} from '../src/orientedBox.mjs';
import {biByeHitVolumes} from './biByeComponents.mjs';
import {soFistVolumes} from './soFistGeometry.mjs';
import {fightFlightHitVolumes} from './fightFlightComponents.mjs';
import {sampleTransform} from './history.mjs';
import {areAllies} from '../src/teams.mjs';

// At 1.7 m from the torso, the existing 18 -> 0 over 2 m produces
// at least ~2.7 raw frost damage, meaningfully more than a rounding artifact.
// No increased blast radius or reduced aim requirement is granted.
export const FROST_EFFECTIVE_PROXIMITY=1.7;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const sq=a=>dot(a,a);
function center(p){return [p.x,p.y,p.z];}
function nearest(volume,p){
 const q=[...volume.center],rel=p.map((x,i)=>x-volume.center[i]);
 for(let j=0;j<3;j++){
  const signed=Math.max(-volume.size[j]/2,Math.min(volume.size[j]/2,dot(rel,volume.axes[j])));
  for(let k=0;k<3;k++)q[k]+=signed*volume.axes[j][k];
 }
 return q;
}
function sphereEntry(a,b,c,r){
 const v=b.map((x,i)=>x-a[i]),w=a.map((x,i)=>x-c[i]),A=sq(v),B=2*dot(v,w),C=sq(w)-r*r;
 if(C<=0)return 0;
 const disc=B*B-4*A*C;
 if(A<1e-10||disc<0)return null;
 const t=(-B-Math.sqrt(disc))/(2*A);
 return t>=0&&t<=1?t:null;
}
// Exact earliest entry into a radius around an oriented box. The distance to
// a convex box along a line is convex; golden section + bisection handles
// corners where naively expanding AABB axes detonates outside true radius.
export function sweptNearBox(from,to,volume,radius=FROST_EFFECTIVE_PROXIMITY){
 if(!orientedBoxHit(from,to,volume,radius))return null;
 const distance=t=>{const point=mix(from,to,t),nearestPoint=nearest(volume,point);
  return sq(point.map((x,i)=>x-nearestPoint[i]));};
 const limit=radius*radius;
 if(distance(0)<=limit)return {t:0,point:nearest(volume,from)};
 let lo=0,hi=1;
 for(let i=0;i<26;i++){
  const m1=lo+(hi-lo)*.382,m2=hi-(hi-lo)*.382;
  if(distance(m1)<distance(m2))hi=m2;else lo=m1;
 }
 const closest=(lo+hi)/2;
 if(distance(closest)>limit)return null;
 lo=0;hi=closest;
 for(let i=0;i<25;i++){const mid=(lo+hi)/2;if(distance(mid)<=limit)hi=mid;else lo=mid;}
 return {t:hi,point:nearest(volume,mix(from,to,hi))};
}
function clear(world,point,target){
 for(const solid of world?.solids??[]){
  if(String(solid.id??'').startsWith('bibye-')||String(solid.id??'').startsWith('sofist-'))continue;
  const hit=segmentAabbHit(point,target,solid);
  if(hit&&hit.t>=1e-5&&hit.t<1-1e-5)return false;
 }
 return true;
}
export function earliestFrostProximity(room,projectile,before,after,world,now,flightDt){
 if(!projectile.proximityFrost||projectile.subKind!=='conditioning')return null;
 const from=center(before),to=center(after),candidates=[];
 for(const p of room.players.values()){
  if(!p.alive||p.id===projectile.ownerId||areAllies(room,projectile.ownerId,p.id)||
     p.spawnProtectionUntil>now)continue;
  // A mounted rider is protected by actual machine hit volumes; he is not a
  // second independent proximity target inside his own chassis.
  if(p.operatingBallistaId||p.operatingRamId||p.operatingFightFlightId)continue;
  const past=sampleTransform(p,now-flightDt).position;
  const traveled=Math.hypot(p.position.x-past.x,p.position.y-past.y,p.position.z-past.z);
  const a=traveled<2?[past.x,past.y+.9,past.z]:[p.position.x,p.position.y+.9,p.position.z];
  const b=[p.position.x,p.position.y+.9,p.position.z];
  const relA=from.map((x,i)=>x-a[i]),relB=to.map((x,i)=>x-b[i]);
  const t=sphereEntry(relA,relB,[0,0,0],FROST_EFFECTIVE_PROXIMITY);
  if(t==null)continue;
  const impact=mix(from,to,t),target=mix(a,b,t);
  if(clear(world,impact,target))candidates.push({t,kind:'proximity',targetKind:'player',
    targetId:p.id,point:{x:impact[0],y:impact[1],z:impact[2]}});
 }
 const machines=[
  {kind:'flight',m:room.fightFlight,volumes:fightFlightHitVolumes(room.fightFlight)},
  {kind:'ram',m:room.soFistication,volumes:soFistVolumes(room.soFistication,now)},
  {kind:'machine',m:room.biByeLlista,volumes:room.biByeLlista?biByeHitVolumes(room.biByeLlista,now):[]}
 ];
 for(const {kind,m,volumes} of machines){
  if(!m||m.retired||m.mode==='DESTROYED'||m.health<=0||m.id===projectile.ballistaId||
    m.operatorId===projectile.ownerId||m.operatorId&&areAllies(room,projectile.ownerId,m.operatorId))continue;
  for(const volume of volumes){
   const near=sweptNearBox(from,to,volume);
   if(!near)continue;
   const impact=mix(from,to,near.t);
   if(!clear(world,impact,near.point))continue;
   candidates.push({t:near.t,kind:'proximity',targetKind:kind,targetId:m.id,
     point:{x:impact[0],y:impact[1],z:impact[2]}});
  }
 }
 candidates.sort((a,b)=>a.t-b.t);
 return candidates[0]??null;
}
