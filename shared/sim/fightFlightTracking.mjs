// Server/shared-sim-only precision tracking. Every shot still becomes a normal
// non-homing repeater projectile from the real articulated muzzle.
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {structureWorld} from './structures.mjs';
import {sweptSegmentCylinderHit} from './biByeLlista.mjs';
import {biByeFirstHit} from './biByeComponents.mjs';
import {soFistFirstHit} from './soFistGeometry.mjs';
import {frostGuardFaces,frostParryContact} from './biByeFrostGuard.mjs';
import {FLIGHT_REPEATER,flightMuzzle,flightDirection,flightRepeaterAim,flightTransform} from '../src/flightRepeaterAim.mjs';

const MAX_RANGE=FLIGHT_REPEATER.speed*FLIGHT_REPEATER.lifespan;
const bodyPoints=p=>{
  const height=postureOf(p).height;
  // Central torso first, then feet, head and either side of the Guard band.
  return [.54,.23,.97,.77,.35].map(f=>({
    x:p.position.x,y:p.position.y+height*f,z:p.position.z
  }));
};
const rayPoint=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const cylinder=p=>({x:p.position.x,y:p.position.y-FLIGHT_REPEATER.radius,z:p.position.z,
  radius:.45+FLIGHT_REPEATER.radius,height:postureOf(p).height+2*FLIGHT_REPEATER.radius});
const obstacles=room=>(structureWorld(room.world,room.structures).solids??[])
  .filter(s=>!String(s.id??'').startsWith('fight-flight-'));
function blocked(room,a,b,solids){
  if(solids.some(s=>{const hit=segmentAabbHit([a.x,a.y,a.z],[b.x,b.y,b.z],s);
    return hit&&hit.t<.995;}))return true;
  if(room.biByeLlista&&biByeFirstHit(room.biByeLlista,[a.x,a.y,a.z],[b.x,b.y,b.z],0))return true;
  if(room.soFistication&&soFistFirstHit(room.soFistication,[a.x,a.y,a.z],[b.x,b.y,b.z],0))return true;
  return false;
}
export function narrowTargetVisible(room,m,target,solids=obstacles(room)){
  if(!target?.alive||!target.position)return false;
  // Visibility comes from the pilot's real visor, NOT the lower muzzle.
  // A pilot can see over parapets that still block every physical bolt;
  // that must be NO CLEAR SHOT, not SIGHT LOST.
  const visor=flightTransform(m,0,1.555,.215);
  const start={x:m.x+visor.x,y:m.y+visor.y,z:m.z+visor.z};
  return bodyPoints(target).some(point=>!blocked(room,start,point,solids));
}
function exposedShot(room,m,operator,target,now,solids){
  const h=postureOf(target).height;
  for(const point of bodyPoints(target)){
    const aim=flightRepeaterAim(m,{siegeTarget:point});
    if(aim.limited)continue; // Do not pretend a joint can turn past its stop.
    const origin=flightMuzzle(m,aim),unit=flightDirection(m,aim);
    const projected=(point.x-origin.x)*unit.x+(point.y-origin.y)*unit.y+(point.z-origin.z)*unit.z;
    if(projected<=0||projected>MAX_RANGE)continue;
    // The swept hit must belong to THIS body, from THIS articulated muzzle.
    const end={x:origin.x+unit.x*(projected+.6),y:origin.y+unit.y*(projected+.6),
      z:origin.z+unit.z*(projected+.6)};
    const targetHit=sweptSegmentCylinderHit(origin,end,cylinder(target));
    if(!targetHit)continue;
    const impact=rayPoint(origin,end,targetHit.t);
    if(blocked(room,origin,impact,solids))continue;
    const floor=surfaceHeightAt(impact.x,impact.z,origin.y,room.world);
    if(floor!=null&&impact.y<floor+.07)continue;
    // Other enemies can intercept a projectile. Allies cannot (normal bolts ignore them).
    if([...room.players.values()].some(other=>other.alive&&other.id!==operator.id&&
      other.id!==target.id&&!areAllies(room,operator.id,other.id)&&
      (sweptSegmentCylinderHit(origin,impact,cylinder(other))?.t??Infinity)<.995))continue;
    const velocity={x:unit.x*FLIGHT_REPEATER.speed,y:unit.y*FLIGHT_REPEATER.speed,
      z:unit.z*FLIGHT_REPEATER.speed};
    const dx=impact.x-target.position.x,dz=impact.z-target.position.z;
    const lateral=Math.abs(dx*Math.cos(target.yaw)+dz*-Math.sin(target.yaw));
    const guarded=frostGuardFaces(target,impact,velocity,true,FLIGHT_REPEATER.guardArc)&&
      impact.y-target.position.y>=h*.4&&impact.y-target.position.y<=h*.93&&lateral<=.43;
    const parried=Boolean(frostParryContact(target,{velocity,radius:FLIGHT_REPEATER.radius},
      origin,end,now,FLIGHT_REPEATER.guardArc));
    if(guarded||parried)continue; // Search for an ACTUALLY exposed opening.
    return aim;
  }
  return null;
}
// Called during authoritative simulation and again at release, so stale snapshots
// can neither select new targets in midair nor make an invisible shot land.
export function updateNarrowTracking(room,m,operator,now){
  const skill=m.skill;
  if(!skill||skill.phase!=='active'||skill.id!=='narrowToOne')return null;
  if(skill.wasGrounded===false&&m.grounded){
    skill.targetId=null;skill.lockedOnce=false;
  }
  skill.wasGrounded=Boolean(m.grounded);
  const solids=obstacles(room);
  if(!skill.targetId&&!skill.lockedOnce){
    const targets=[...room.players.values()].filter(p=>p.alive&&p.id!==operator.id&&
      !areAllies(room,operator.id,p.id)&&p.position)
      .sort((a,b)=>distance(a.position,m)-distance(b.position,m)||String(a.id).localeCompare(String(b.id)));
    const selected=targets.find(p=>narrowTargetVisible(room,m,p,solids)&&
      bodyPoints(p).some(point=>!flightRepeaterAim(m,{siegeTarget:point}).limited));
    if(selected){
      skill.targetId=selected.id;skill.lockedOnce=true;
      room.events.push({type:'fightFlightTargetLock',machineId:m.id,targetId:selected.id,at:now});
    }
  }
  const target=skill.targetId?room.players.get(skill.targetId):null;
  if(skill.targetId&&(!target?.alive||target.connected===false))
    return {invalid:true,reason:'targetLost'};
  const visible=target?narrowTargetVisible(room,m,target,solids):false;
  const aim=visible?exposedShot(room,m,operator,target,now,solids):null;
  skill.targetVisible=visible;skill.noClearShot=Boolean(target&&visible&&!aim);
  skill.trackingState=!target?'acquiring':!visible?'sightLost':!aim?'noClearShot':'locked';
  return {targetId:target?.id??null,visible,aim};
}
