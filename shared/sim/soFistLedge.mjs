// Authoritative HELLping Hand ledge discovery. Ordinary ramp driving always
// takes precedence: the hand is offered only across a real step or loss of
// wheel-supported terrain, and only with a fully supported landing.
import {surfaceHeightAt} from '../src/collision.mjs';
import {edgeMachineProgressAllowed} from '../src/edgeBoundary.mjs';
import {soFistSolids,machineryOverlap} from './soFistGeometry.mjs';
import {getBiByeSolids} from './biByeLlista.mjs';
import {soFistTerrainPose,soFistClear} from './soFistication.mjs';
import {soFistUpperPoint} from './soFistElevation.mjs';
import {soFistFrame,SO_FIST_SCALE} from './soFistGeometry.mjs';

export const LEDGE_PULL=Object.freeze({
  duration:1.65,maxRise:1.7,minDrop:-.28,scanStep:.2,
  contactReach:2.15,breakHeight:.58,arc:.92,
});
const ground=(b,world,x,z)=>surfaceHeightAt(x,z,b.y+2.15,world);
const forward=b=>({x:-Math.sin(b.heading),z:-Math.cos(b.heading)});
const palm=b=>soFistUpperPoint(soFistFrame(b),b,[0,.34*SO_FIST_SCALE,.885*SO_FIST_SCALE]);
const nearbyObstacle=(box,obstacles)=>obstacles.some(s=>machineryOverlap(box,s));
const lerp=(a,b,t)=>a+(b-a)*t;
// The first 0.18s visibly commits the fingers to the rim. Only then can
// the hydraulic ram use the planted hand to haul its chassis forward.
export function hellpingLedgePose(from,to,t){
 const pull=Math.max(0,Math.min(1,(t-.18)/.82));
 const e=pull*pull*(3-2*pull);
 return {x:lerp(from.x,to.x,e),y:lerp(from.y,to.y,e)+LEDGE_PULL.arc*Math.sin(Math.PI*pull),
   z:lerp(from.z,to.z,e),heading:lerp(from.heading,to.heading,e),
   chassisPitch:lerp(from.chassisPitch??0,to.chassisPitch??0,e),
   chassisRoll:lerp(from.chassisRoll??0,to.chassisRoll??0,e),
   wheelOffsets:(to.wheelOffsets??from.wheelOffsets??[]).map((n,i)=>
      lerp(from.wheelOffsets?.[i]??0,n,e))};
}

export function findHellpingLedge(room,b,now=0){
 const world=room?.world;
 if(!world||!b?.operatorId||b?.retired||b?.health<=0||
    b.skill?.id!=='hellpingHand'||(b.skill.readyAt??0)>now+1e-8&&
    b.hellping?.phase!=='open'||b.fistMounted===false||
    (b.components?.Fist?.health??0)<=0||(b.components?.Drive?.health??0)<=0||
    (b.hellping&&!['open'].includes(b.hellping.phase)))return null;
 const f=forward(b),g0=ground(b,world,b.x,b.z);
 if(g0==null||Math.abs(g0-b.y)>.7)return null;
 // The front of the ram must approach a discontinuity. An ordinary climbing
 // incline, however steep, is NOT an invitation to use an extra skill.
 let previous=g0,breakAt=null;
 for(let distance=.6;distance<=4.6;distance+=LEDGE_PULL.scanStep){
  const x=b.x+f.x*distance,z=b.z+f.z*distance;
  const next=ground(b,world,x,z);
  if(next==null||Math.abs(next-previous)>LEDGE_PULL.breakHeight){
   breakAt=distance;break;
  }
  previous=next;
 }
 if(breakAt==null||breakAt>4.35)return null;
 const hand=palm(b),obstacles=[...(world.solids??[]),...getBiByeSolids(room.biByeLlista)];
 for(const distance of [4.3,4.8,5.3,5.8,6.3,6.8]){
  const x=b.x+f.x*distance,z=b.z+f.z*distance;
  const y=ground(b,world,x,z);
  if(y==null||y-b.y<LEDGE_PULL.minDrop||y-b.y>LEDGE_PULL.maxRise)continue;
  const proposed={...b,x,y,z,heading:b.heading,speed:0,charging:false};
  const contact=soFistTerrainPose(proposed,world);
  if(!contact||!soFistClear({...proposed,...contact},world,getBiByeSolids(room.biByeLlista)))
   continue;
  // Find the *near* edge of the landing, not just its centre. Its rim must
  // be inside the articulated palm's forward reach and vertical travel.
  let anchor=null;
  for(let d=breakAt;d<=Math.min(distance,breakAt+3.0);d+=.12){
   const ax=b.x+f.x*d,az=b.z+f.z*d,level=ground(b,world,ax,az);
   if(level==null||Math.abs(level-contact.y)>.42)continue;
   const horizontal=Math.hypot(ax-hand[0],az-hand[2]);
   if(horizontal>LEDGE_PULL.contactReach||Math.abs(level-hand[1])>1.12)continue;
   anchor={x:ax,y:level,z:az};
   break;
  }
  if(!anchor)continue;
  const landing={x,y:contact.y,z,heading:b.heading,
    chassisPitch:contact.chassisPitch,chassisRoll:contact.chassisRoll,
    wheelOffsets:contact.wheelOffsets};
  // Verify a complete smooth traversal, not merely an empty destination.
  // A low jump arc is used to clear the lip; no vehicle tunnels through walls
  // or another siege engine just because its wheels lose support in between.
  let clear=true,last={...b};
  for(let k=1;k<=16;k++){
   const t=k/16;
   const next={...b,...hellpingLedgePose(b,landing,t)};
   const solids=soFistSolids(next);
   if(solids.some(box=>nearbyObstacle(box,obstacles))||
       (world.edgeBoundary&&!edgeMachineProgressAllowed(soFistSolids(last),solids,world.edgeBoundary))){
    clear=false;break;
   }
   last=next;
  }
  if(!clear)continue;
  return {anchor,landing,distance,rise:landing.y-b.y};
 }
 return null;
}
